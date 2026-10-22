// Connecteur CRM Space Bowling — port direct de resaTracker/src/spacebowlingClient.js
// - S'authentifie sur admin.spacebowling.fr (login Laravel classique)
// - Gère cookies de session + CSRF token automatiquement (cookie jar)
// - Récupère le planning JSON par activité / mois

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const ACTIVITIES = ['karaoke', 'anniversaire', 'quizzboxing'];

class SpaceBowlingClient {
  constructor({ baseUrl, email, password, internalBotKey }) {
    this.baseUrl = baseUrl;
    this.email = email;
    this.password = password;
    this.jar = new CookieJar();

    this.http = wrapper(
      axios.create({
        baseURL: baseUrl,
        jar: this.jar,
        withCredentials: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (SpaceBowlingDashboard connector)',
          // Whitelist Cloudflare côté CRM (règle ajoutée par l'équipe CRM sur /login pour bloquer
          // les bots) — sans ce header, le login échoue avec un blocage WAF, pas un refus d'identifiants.
          ...(internalBotKey ? { 'X-Internal-Bot': internalBotKey } : {}),
        },
        maxRedirects: 5,
        validateStatus: (s) => s < 500,
        timeout: 20000,
        responseEncoding: 'utf8', // évite tout risque de mauvais décodage des accents (é, â, ...)
      })
    );

    this.authenticated = false;
  }

  extractCsrfToken(html) {
    const match = html.match(/name="_token"\s+value="([^"]+)"/);
    if (!match) {
      throw new Error('Impossible de trouver le _token CSRF sur la page de login (le formulaire a peut-être changé)');
    }
    return match[1];
  }

  async getXsrfHeader() {
    const cookies = await this.jar.getCookies(this.baseUrl);
    const xsrf = cookies.find((c) => c.key === 'XSRF-TOKEN');
    return xsrf ? decodeURIComponent(xsrf.value) : null;
  }

  // Détecte le blocage Cloudflare (règle WAF de l'équipe CRM sur /login) pour le distinguer d'un
  // vrai échec applicatif — signature confirmée en prod le 3 sept. 2026: statut 403, header
  // Cf-Mitigated: challenge, page interstitielle "Just a moment...". Sert de preuve indépendante
  // de l'état de leur règle: si ce code se déclenche, notre header X-Internal-Bot ne suffit pas
  // encore (ou plus) à passer, quel que soit le run (auto ou bouton "Vérifier maintenant" du site).
  isCloudflareBlock(res) {
    if (res.headers && res.headers['cf-mitigated'] === 'challenge') return true;
    return res.status === 403 && typeof res.data === 'string' && res.data.includes('Just a moment');
  }

  async login() {
    const loginPage = await this.http.get('/login');
    if (this.isCloudflareBlock(loginPage)) {
      const err = new Error(
        "CRM injoignable: bloqué par le pare-feu Cloudflare du CRM sur /login (Cf-Mitigated: challenge). " +
        "Notre header X-Internal-Bot est bien envoyé — l'équipe CRM n'a pas (encore) ajouté l'exception à leur règle."
      );
      err.code = 'CF_BLOCKED';
      throw err;
    }
    const token = this.extractCsrfToken(loginPage.data);

    const params = new URLSearchParams();
    params.append('_token', token);
    params.append('email', this.email);
    params.append('password', this.password);

    const res = await this.http.post('/login', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${this.baseUrl}/login`,
      },
    });

    if (typeof res.data === 'string' && res.data.includes('formAuthentication')) {
      throw new Error('Login échoué — identifiants refusés ou _token invalide');
    }

    this.authenticated = true;
    return true;
  }

  async ensureAuth() {
    if (this.authenticated) return;
    // Plusieurs fetch (mois x activités) partent en parallèle et appellent tous ensureAuth() en
    // même temps -> sans ce partage, ça déclenchait N logins simultanés vers le CRM (surcharge -> timeout).
    if (!this._loginPromise) {
      this._loginPromise = this.login().finally(() => {
        this._loginPromise = null;
      });
    }
    await this._loginPromise;
  }

  async getPlanningByMonth(activity, year, month) {
    await this.ensureAuth();

    if (!ACTIVITIES.includes(activity)) {
      throw new Error(`Activité inconnue: ${activity}. Attendu: ${ACTIVITIES.join(', ')}`);
    }

    const xsrfToken = await this.getXsrfHeader();

    const res = await this.http.post(
      `/admin/activity/${activity}/planing/byMonth`,
      { year, month },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
        },
      }
    );

    if (res.status === 401 || res.status === 419) {
      this.authenticated = false;
      await this.ensureAuth();
      return this.getPlanningByMonth(activity, year, month);
    }

    return res.data;
  }

  // Planning bowling (pistes) — URL différente des autres activités (pas sous /admin/activity/),
  // confirmé par capture réseau, même format de payload/réponse que getPlanningByMonth.
  async getBowlingPlanningByMonth(year, month) {
    await this.ensureAuth();
    const xsrfToken = await this.getXsrfHeader();
    const res = await this.http.post(
      '/admin/bowling/planing/byMonth',
      { year, month },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
        },
      }
    );
    if (res.status === 401 || res.status === 419) {
      this.authenticated = false;
      await this.ensureAuth();
      return this.getBowlingPlanningByMonth(year, month);
    }
    return Array.isArray(res.data) ? res.data : [];
  }

  // Fiche détail d'une commande (page HTML complète, pas du JSON) — contient des infos absentes
  // du planning mensuel (ex: prénom de l'enfant pour une résa anniversaire).
  async getOrderDetail(activity, orderId) {
    await this.ensureAuth();
    const res = await this.http.get(`/admin/activity/${activity}/orders/${orderId}`);
    return res.data;
  }

  // Le token qui protège change_statut n'est PAS le cookie XSRF-TOKEN (celui utilisé pour
  // planing/byMonth via X-XSRF-TOKEN) mais le csrf_token() Laravel classique, exposé en clair dans
  // <meta name="csrf-token"> sur n'importe quelle page admin authentifiée. Confirmé par capture réseau.
  extractMetaCsrfToken(html) {
    const match = String(html || '').match(/<meta name="csrf-token" content="([^"]+)">/);
    if (!match) {
      throw new Error("Impossible de trouver le meta csrf-token (la page settings a peut-être changé)");
    }
    return match[1];
  }

  async getMetaCsrfToken(activity) {
    await this.ensureAuth();
    const res = await this.http.get(`/admin/activity/${activity}/settings/creneaux`);
    if (res.status === 401 || res.status === 419) {
      this.authenticated = false;
      await this.ensureAuth();
      return this.getMetaCsrfToken(activity);
    }
    return this.extractMetaCsrfToken(res.data);
  }

  // Commandes du bar (Trivec), les plus récentes en premier — confirmé par capture réseau. 30 =
  // marge pour pouvoir re-vérifier le statut des commandes "en attente" qu'on suit encore, même si
  // quelques commandes plus récentes sont arrivées entre-temps et les ont poussées un peu plus bas.
  async getBarOrders(perPage = 30) {
    await this.ensureAuth();
    const res = await this.http.get('/admin/bar/orders/getData', {
      params: { search: '', page: 1, per_page: perPage },
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (res.status === 401 || res.status === 419) {
      this.authenticated = false;
      await this.ensureAuth();
      return this.getBarOrders(perPage);
    }
    return Array.isArray(res.data && res.data.data) ? res.data.data : [];
  }

  // Temps d'attente bowling affiché aux clients — formulaire Laravel classique (pas d'AJAX, PAS de
  // meta csrf-token: le _token est celui du formulaire, comme pour /login). Confirmé par capture
  // réseau: POST multipart sur la même URL que la page, redirige (302) vers elle-même au succès.
  async getWaitingTimeBowling() {
    await this.ensureAuth();
    const res = await this.http.get('/admin/settings/waitingTimeBowling');
    const html = String(res.data || '');
    const valueMatch = html.match(/id="waitingTimeBowling"[\s\S]{0,120}?value="([^"]*)"/);
    return {
      minutes: valueMatch ? parseInt(valueMatch[1], 10) : null,
      token: this.extractCsrfToken(html),
    };
  }

  async setWaitingTimeBowling(minutes) {
    await this.ensureAuth();
    const { token } = await this.getWaitingTimeBowling();
    const form = new FormData();
    form.append('_token', token);
    form.append('waitingTimeBowling', String(minutes));
    const res = await this.http.post('/admin/settings/waitingTimeBowling', form);
    return res.status < 400;
  }

  // Liste des créneaux (toutes formules confondues, ex: karaoke 30min + 1h) d'une activité pour
  // une date donnée. Confirmé par capture réseau: pas de csrf-token requis pour cette lecture.
  async getCreneaux(activity, dateStr) {
    await this.ensureAuth();
    const res = await this.http.get(`/admin/activity/${activity}/settings/creneaux/getData`, {
      params: { search: '', page: 1, per_page: 100, date: dateStr, formule: '' },
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (res.status === 401 || res.status === 419) {
      this.authenticated = false;
      await this.ensureAuth();
      return this.getCreneaux(activity, dateStr);
    }
    return Array.isArray(res.data && res.data.data) ? res.data.data : [];
  }

  // Ferme (statut=0) ou ouvre (statut=1) un créneau par son id (le champ "id" d'une ligne
  // getCreneaux, PAS un order_id). csrfToken obligatoire (le fournir une fois par lot d'appels pour
  // éviter un refetch de token à chaque créneau).
  // Constaté en prod: le CRM répond SOUVENT par une redirection HTML (page liste) au lieu du JSON
  // {success:true} attendu, MÊME quand la fermeture a réellement eu lieu côté serveur (bug de leur
  // route, pas du timing/auth — reproduit avec une session 100% fraîche). Donc on ne peut PAS se fier
  // à cette réponse pour savoir si ça a marché — voir verifyClosedSlots() dans creneauSync.js pour la
  // vraie vérification (relire l'état après coup). Ici on POST juste, sans juger le résultat.
  async setCreneauStatut(activity, creneauId, statut, csrfToken) {
    await this.ensureAuth();
    const params = new URLSearchParams();
    params.append('id', String(creneauId));
    params.append('statut', String(statut));
    const res = await this.http.post(`/admin/activity/${activity}/settings/creneaux/change_statut`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-TOKEN': csrfToken,
      },
    });
    if (res.status === 401 || res.status === 419) {
      this.authenticated = false;
      await this.ensureAuth();
      const freshToken = await this.getMetaCsrfToken(activity);
      return this.setCreneauStatut(activity, creneauId, statut, freshToken);
    }
    return res.data;
  }

  async getAllActivitiesByMonth(year, month) {
    const results = await Promise.all(
      ACTIVITIES.map(async (activity) => {
        const events = await this.getPlanningByMonth(activity, year, month);
        return Array.isArray(events) ? events.map((e) => ({ ...e, activity })) : [];
      })
    );
    return results.flat();
  }
}

module.exports = { SpaceBowlingClient, ACTIVITIES };
