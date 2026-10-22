/* =====================================================================
   SpaceBowling Engine — APPLICATION DES BORNES (écran portrait)

   veille → accueil (modules de la borne) → bar → récapitulatif → paiement → merci

   Tout passe par SB.api (../maquettes/sandbox/centre-partage.js) :
   · SB.api.bornes.config(id)  GET  /api/bornes/{id}/config   modules, veille, logo
   · SB.api.bornes.signaler(id) POST /api/bornes/{id}/heartbeat  signe de vie toutes les 20 s (parc des bornes du CRM)
   · SB.api.bar.catalogue(id)  GET  /api/bar/catalogue?borne  catégories, produits, ventes additionnelles
   · SB.api.bar.commander(d)   POST /api/bar/commandes
   · SB.api.bar.payer(n, d)    POST /api/bornes/{id}/transactions
   Le CRM reçoit commandes et paiements en direct. Quand le serveur existera, ces
   fonctions deviendront des fetch() ; avec Capacitor, le « Mode test » du paiement
   sera remplacé par les réponses du TPE et du CashDro.
   ===================================================================== */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const arrondi = n => Math.round(n * 100) / 100;
  const mn = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const heure = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const ID = window.BORNE_ID || new URLSearchParams(location.search).get('borne');
  /* le bar sur téléphone (../bar/?piste=7, QR code ou NFC sur la piste) : le module Bar seul, sans veille, carte bancaire en ligne */
  const MOBILE = ID === 'MOBILE', PISTE = MOBILE ? +new URLSearchParams(location.search).get('piste') || null : null;
  const SRC = 'borne-' + ID;
  const APERCU = new URLSearchParams(location.search).get('apercu');            // aperçu d'un module dans le CRM (aucune commande possible)
  const EMOJI_ACT = { bar: '🍹', bowling: '🎳', laser: '🎯', karaoke: '🎤', quiz: '🥊', billard: '🎱', anniv: '🎂' };
  const PRETS = { bar: 'Commander', bowling: 'Jouer' };   // texte par défaut ; sinon celui du module (CRM › Sandbox › Module borne)                          // modules terminés (les autres : « Bientôt »)
  /* icône d'une activité ajoutée dans le CRM : d'après son nom quand on le reconnaît, sinon d'après son fonctionnement */
  const emojiNom = n => ([[/escape/i, '🔐'], [/escalade|grimpe/i, '🧗'], [/r[ée]alit[ée] virtuelle|vr/i, '🥽'], [/fl[ée]chette/i, '🎯'], [/arcade/i, '🕹️'], [/laser/i, '🎯'], [/karaok/i, '🎤'], [/quiz|box/i, '🥊'], [/billard/i, '🎱'], [/bowling/i, '🎳'], [/mini.?golf|golf/i, '⛳'], [/trampoline/i, '🤸']].find(([r]) => r.test(n || '')) || [])[1];
  const EMOJI_MODELE = { piste: '🎳', seance: '🎯', privatif: '🎤', table: '🎱', vente: '🛍️', combo: '🎉' };   // activité ajoutée dans le CRM
  const MSG_ACT = { bar: 'Une boisson ? Commandez ici, sans faire la queue', bowling: 'Votre piste en quelques secondes', laser: 'Une partie de laser game ?', karaoke: 'Chantez en salle privée', quiz: 'Défiez vos amis au Quiz Boxing', billard: 'Une table de billard ?', anniv: 'Fêtez votre anniversaire ici' };

  const ICO = {
    barriere: '<path d="M4 20V8l2-3 2 3v12M16 20V8l2-3 2 3v12M4 11h16M4 16h16"/>', ticket: '<path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4z"/><path d="M14 6v2M14 11v2M14 16v2"/>',
    retour: '<path d="M15 5l-7 7 7 7"/>', bas: '<path d="M6 9l6 6 6-6"/>', suite: '<path d="M9 5l7 7-7 7"/>', croix: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', moins: '<path d="M5 12h14"/>', ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    grille: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    carte: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/>',
    billets: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
    recu: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>', part: '<path d="M12 3a9 9 0 109 9h-9z"/><path d="M15 3.5A9 9 0 0120.5 9H15z"/>',
    panier: '<path d="M3 4h2l2.4 11h10.2L20 8H6.2"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
    main: '<path d="M9 11V5a1.5 1.5 0 013 0v5M12 10V4a1.5 1.5 0 013 0v6M15 10V6.5a1.5 1.5 0 013 0V14c0 4-2.5 7-6 7-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 012.5-1.6L9 14"/>'
  };
  const ic = (n, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICO[n]}</svg>`;
  const QUILLE = '<path d="M20 3c6 0 8.5 7 7.5 15-.8 6-3.8 9-3.8 13.5 0 5 9.3 14 9.3 33.5 0 18-6.5 30-13 32-6.5-2-13-14-13-32C7 45.5 16.3 36.5 16.3 31.5 16.3 27 13.3 24 12.5 18 11.5 10 14 3 20 3z" fill="#fffdf9"/><path d="M13.6 30.5h12.8M13 35.5h14" stroke="#d9272e" stroke-width="2.6"/>';

  /* ------------------------------------------------------------------ État */
  const NEUF = () => ({ module: null, bw: null, rs: null, ce: null, rsConf: null, rsJours: null, tarifs: null, lignesCmd: null, rub: null, sous: null, panier: [], nom: '', code: '', zone: null, num: null, majeur: false, vus: new Set(), file: [], offre: null, ajoutes: new Set(), cmd: null, reste: [], sel: {}, aPayer: [], moyen: null, insere: 0, rendu: 0, fq: 1, choix: {}, optP: null, optSrc: null, verrou: false });
  const S = Object.assign({ ecran: null, conf: null }, NEUF());
  let CAT = { cats: [], visu: {}, produits: [], upsells: [] };
  let tIdle = null, tCompte = null, tMerci = null, tMsg = null, tDiapo = null;

  function charger() {
    S.conf = SB.api.bornes.config(ID);
    if (!S.conf) return false;
    S.acts = (SB.lire('config') || {}).activites || [];
    const ancien = CAT;
    CAT = SB.api.bar.catalogue(ID);
    const parties = S.panier.filter(l => !prod(l.id) || !dispo(prod(l.id)));       // épuisé, ou plus servi à cette heure
    if (parties.length) {
      S.horaire = parties.every(l => prod(l.id));
      S.panier = S.panier.filter(l => prod(l.id) && dispo(prod(l.id)));
      S.ruptures = [...new Set(parties.map(l => (ancien.produits.find(p => p.id === l.id) || {}).nom).filter(Boolean))];
    }
    prechargerImages();
    return true;
  }
  /* Toutes les images (logo, modules, catégories, articles) sont chargées et décodées dès le démarrage,
     puis à chaque mise à jour du CRM : rien n'apparaît en retard pendant la navigation.
     Une photo du CRM (data:…, 30 à 60 Ko de texte) devient une URL blob: courte : les écrans se
     construisent sans recopier ces longs textes, et l'image décodée reste en mémoire. */
  const IMAGES = new Map();                                           // adresse d'origine → { url, im }
  const estImage = u => /^(data:|https?:|blob:|\.{0,2}\/)/.test(u || '');
  const src = u => (IMAGES.get(u) || {}).url || u;
  function prechargerImages() {
    const voulues = new Set([S.conf.logo, ...S.conf.modules.map(m => m.image), ...[].concat(...Object.values((SB.lire('config') || {}).prix || {})).map(f => f.img), ...CAT.produits.map(p => p.img), ...Object.values(CAT.visu).map(v => v.img)].filter(estImage));
    IMAGES.forEach((x, u) => { if (!voulues.has(u)) { if (x.url !== u) URL.revokeObjectURL(x.url); IMAGES.delete(u); } });
    voulues.forEach(u => {
      if (IMAGES.has(u)) return;
      const x = { url: u, im: new Image() };
      IMAGES.set(u, x);
      const decoder = url => { x.url = url; x.im.src = url; return x.im.decode(); };
      (u.startsWith('data:') ? fetch(u).then(r => r.blob()).then(b => decoder(URL.createObjectURL(b))) : decoder(u)).catch(() => {});
    });
  }
  const borne = () => S.conf.borne;
  const estTablette = () => borne().type === 'Tablette';
  const pistes = () => PISTE ? [String(PISTE)] : estTablette() ? (borne().nom.match(/\d+/g) || []) : [];
  /* monnayeur (CashDro) : réglé par borne dans Gestion des bornes ; par défaut, pas sur les tablettes. Sans lui, le bar propose quand même les espèces, à payer au comptoir */
  const cashdro = () => borne().cashdro != null ? !!borne().cashdro : !estTablette();
  const moyens = () => [borne().tpe !== false && 'Carte', (cashdro() || typeMod(S.module) === 'bar') && 'Espèces', ceAccepte() && 'Ticket CE'].filter(Boolean);
  /* tickets CE et codes promo, donnés au paiement : réglage « Codes promo et tickets CE » du module (page Récapitulatif) ; toujours au bar */
  const ceAccepte = () => { const t = typeMod(S.module); return t === 'bar' || !!(t && TX(t === 'bowling' ? 'bw-recap' : 'rs-recap', 'codes')); };
  const INDICE_CE = '<p class="ce-indice"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4z"/><path d="M14 6v2M14 11v2M14 16v2"/></svg>Un ticket CE ou un code promo ? Vous le scannerez au moment de payer.</p>';
  /* Où servir : zones réglées dans le CRM (Bar › Sur les bornes) ; « Piste de bowling » + 7 → « Piste 7 » */
  const zones = () => (CAT.zones && CAT.zones.length) ? CAT.zones : [{ id: 'bar', nom: 'Bar', sous: 'À récupérer au comptoir', e: '🍹', n: 0, retrait: true }];
  const zoneChoisie = () => zones().find(z => z.id === S.zone);
  const lieuCmd = () => { const z = zoneChoisie(); return !z ? 'Borne ' + borne().id : z.n ? z.nom.split(' ')[0] + ' ' + S.num : z.nom; };

  /* ------------------------------------------------------------------ Catalogue */
  const visu = k => CAT.visu[k] || {};
  const coul = cat => visu(cat).c || '#0c2f47';
  const prod = id => CAT.produits.find(p => p.id === id);
  const dispo = p => p.servi !== false;      // règles horaires du bar (CRM › Bar › Règles horaires), calculées par le moteur
  const produitsDe = (cat, sous) => CAT.produits.filter(p => p.cat === cat && (!sous || p.sous === sous));
  const sousDe = cat => ((CAT.cats.find(([c]) => c === cat) || [0, []])[1]).filter(s => produitsDe(cat, s).length);
  const vis = (o, c, cls) => `<span class="vis ${o.img ? 'photo' : ''} ${cls || ''}" style="--c:${c}">${o.img ? `<img src="${esc(src(o.img))}" alt="" draggable="false">` : `<i>${esc(o.e || '🍽️')}</i>`}</span>`;
  const logo = cls => S.conf && S.conf.logo ? `<img class="${cls}" src="${src(S.conf.logo)}" alt="Space Bowling">` : `<b class="${cls} logo-txt">Space Bowling</b>`;

  /* ------------------------------------------------------------------ Panier */
  /* une ligne = un article + ses options (« Sirop à l’eau · Fraise » et « · Menthe » sont deux lignes) */
  const cle = (id, opts) => id + (opts || []).map(o => '|' + o.nom).join('');
  const qte = id => S.panier.filter(l => l.id === id).reduce((n, l) => n + l.q, 0);
  function ajouterPanier(id, n, opts) {
    const k = cle(id, opts), l = S.panier.find(x => x.k === k);
    if (l) l.q += n; else if (n > 0) S.panier.push({ k, id, q: n, opts: opts || [] });
    S.panier = S.panier.filter(x => x.q > 0);
    return k;
  }
  const modLigne = (k, n) => { const l = S.panier.find(x => x.k === k); if (l) l.q += n; S.panier = S.panier.filter(x => x.q > 0); };
  const optsTxt = opts => (opts || []).map(o => o.nom).join(', ');
  const lignes = () => S.panier.map(l => { const p = prod(l.id); return p && { k: l.k, id: p.id, base: p.nom, opts: l.opts, nom: p.nom + (l.opts.length ? ' · ' + optsTxt(l.opts) : ''), q: l.q, pu: arrondi(p.prix + l.opts.reduce((s, o) => s + (+o.prix || 0), 0)), tva: p.tva, p }; }).filter(Boolean);
  /* options d'un article : S.choix[groupe] = index du choix, -1 = « Aucune » */
  const optionsDe = p => p.options || [];
  const obligatoire = p => optionsDe(p).some(g => g.obligatoire);
  const choixDefaut = p => Object.fromEntries(optionsDe(p).map((g, gi) => [gi, g.obligatoire ? null : -1]));
  const pris = gi => Number.isInteger(S.choix[gi]) && S.choix[gi] >= 0;      // null ou -1 (« Aucune ») : rien de choisi
  const optsChoisies = p => optionsDe(p).map((g, gi) => pris(gi) && g.choix[S.choix[gi]] ? { g: g.nom, nom: g.choix[S.choix[gi]].nom, prix: +g.choix[S.choix[gi]].prix || 0 } : null).filter(Boolean);
  const manque = p => optionsDe(p).filter((g, gi) => g.obligatoire && !pris(gi)).map(g => g.nom.toLowerCase());
  const prixAvec = p => arrondi(p.prix + optsChoisies(p).reduce((s, o) => s + o.prix, 0));
  const total = L => arrondi(L.reduce((s, l) => s + l.q * l.pu, 0));
  const nbArticles = () => S.panier.reduce((n, l) => n + l.q, 0);
  const alcool = () => lignes().some(l => l.p.alcool);

  /* ------------------------------------------------------------------ Navigation entre écrans */
  const APRES = {};
  function aller(e) {
    if (MOBILE && e === 'veille') e = 'accueil';                       // téléphone : pas d'écran de veille
    if (e === 'accueil' && !APERCU && seulModule()) return A.module({ act: seulModule() });
    clearInterval(tMsg); clearInterval(tMerci); clearTimeout(tDiapo);
    S.ecran = e; S.verrou = false;
    $('#borne').dataset.ecran = e;
    ambiance(e);
    const box = $('#ecran'), vieux = [...box.children], v = document.createElement('div'), st = $('#borne').classList.contains('mod') && TX(e, 'style');
    v.className = 'vue v-' + e + (st && st !== '1' ? ' st-' + st : '');
    v.innerHTML = VUES[e]();
    box.appendChild(v);
    vieux.forEach(x => { x.classList.add('sort'); setTimeout(() => x.remove(), 400); });
    if (APRES[e]) APRES[e](v);
    minuterie();
  }
  function rafraichir() { const v = $('#ecran .vue:last-child'); if (!v) return; v.innerHTML = VUES[S.ecran](); if (APRES[S.ecran]) APRES[S.ecran](v); }
  /* une zone redessinée garde ses éléments en place (pas d'animation d'entrée) */
  const zone = (n, html) => $$('[data-zone="' + n + '"]').forEach(el => { el.innerHTML = html; el.classList.add('calme'); });

  const entete = (t, s) => `<header class="tete">${logo('t-logo')}<div class="t-t"><b>${esc(t)}</b>${s ? `<small>${esc(s)}</small>` : ''}</div><div class="t-d"><span>${esc(PISTE ? 'Piste ' + PISTE : borne().nom)}</span><time data-horloge>${heure()}</time></div><i class="t-lueur"></i></header>`;
  const modeTest = h => `<div class="mode-test"><span>Mode test · paiement simulé</span><div class="rangee">${h}</div></div>`;

  /* ------------------------------------------------------------------ Modules personnalisés (CRM › Sandbox › activité › Module borne)
     TX(section, clé) : le texte ou le réglage du CRM, sinon sa valeur par défaut (schéma du moteur, SB.api.modules). */
  const actDe = act => (S.acts || []).find(a => a.id === act) || { id: act };
  const perso = act => !!(act && window.SB && SB.api.modules && SB.api.modules.schema(actDe(act)));
  const typeMod = act => act && window.SB && SB.api.modules ? SB.api.modules.type(actDe(act)) : null;
  /* un module prêt : le bar, le bowling, et toute activité réservable (son module vient de son fonctionnement) */
  const pretDe = act => typeMod(act) ? (perso(act) ? TX('accueil', 'action', null, act) : PRETS[act]) : null;
  /* un seul module prêt et pas « Finaliser » (ex. tablette de piste : le bar ; téléphone) : on entre directement dedans, sans l'accueil */
  const seulModule = () => S.conf && !S.conf.finaliser && S.conf.modules.length === 1 && pretDe(S.conf.modules[0].act) ? S.conf.modules[0].act : null;
  const TX = (sec, k, vars, act) => { let v = SB.api.modules.val(actDe(act || S.module || APERCU), sec, k); if (vars && typeof v === 'string') Object.keys(vars).forEach(x => { v = v.split('{' + x + '}').join(vars[x]); }); return v; };
  const riche = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const COMMUNES = ['regler', 'partie', 'moyen', 'ticket', 'tpe', 'especes', 'refuse', 'merci', 'comptoir'];
  /* l'ambiance du module (couleur, fond, décors, animations) s'applique à ses pages et au paiement qui suit */
  function ambiance(e) {
    const b = $('#borne'), act = S.module, t = typeMod(act), pages = { bowling: x => x.startsWith('bw-'), resa: x => x.startsWith('rs-'), bar: x => ['bar', 'recap', 'ou'].includes(x) };
    const on = perso(act) && !!t && (pages[t](e) || COMMUNES.includes(e));
    b.classList.toggle('mod', on);
    if (!on) { delete b.dataset.fond; b.classList.remove('acc', 'leger', 'sans-decor', 'festif'); ['--acc', '--fond-img', '--r1'].forEach(v => b.style.removeProperty(v)); return; }
    const a = actDe(act), V = k => SB.api.modules.val(a, 'theme', k), img = V('photo');
    b.classList.toggle('festif', V('style') === 'festif');
    b.style.setProperty('--r1', V('accent') || (V('style') === 'festif' ? '#ff3d7f' : a.c || '#0a8fbf'));
    b.classList.toggle('acc', !!V('accent')); b.style.setProperty('--acc', V('accent') || a.c || '#0a8fbf');
    b.dataset.fond = V('fond') === 'photo' && !img ? 'creme' : V('fond');
    if (img) b.style.setProperty('--fond-img', `url("${src(img)}")`); else b.style.removeProperty('--fond-img');
    b.classList.toggle('leger', V('animations') === 'reduites'); b.classList.toggle('sans-decor', !V('decor'));
  }
  /* Aperçu dans le CRM : la page demandée avec un exemple, sans rien envoyer ni revenir en veille */
  function apercu(page) {
    S.module = page === 'accueil' ? null : APERCU; S.cmd = null; S.sel = {}; S.lignesCmd = null; fermerModale(true);
    if (APERCU === 'bowling' && page !== 'accueil') {
      const [mi, ma] = bornesBw(), n = Math.min(ma, Math.max(mi, 4)), P = ['Léa', 'Tom', 'Inès', 'Hugo', 'Nino', 'Jade'];
      S.tarifs = SB.api.tarifs('bowling', n);
      const f = S.tarifs[1] || S.tarifs[0];
      S.bw = { formule: f ? f.nom : null, groupe: 'Les Strikers', joueurs: Array.from({ length: n }, (_, i) => ({ prenom: P[i] || 'Joueur ' + (i + 1), barrieres: i === 1 })) };
      S.lignesCmd = lignesBowling(); S.reste = resteBowling();
      if (page === 'merci') S.cmd = { num: 273042, act: 'bowling', nom: S.bw.groupe, reference: 'BO042', bot: { envois: [{ nom: 'BO042' }] }, total: total(S.lignesCmd), paye: total(S.lignesCmd) };
    }
    /* bar : des articles à l'écran (les styles changent leur liste) et un panier d'exemple sur « Panier » */
    if (typeMod(APERCU) === 'bar' && page !== 'accueil') { S.rub = CAT.cats.length ? CAT.cats[0][0] : null; S.sous = (S.rub && sousDe(S.rub)[0]) || null;
      if (page === 'recap' || page === 'regler') { S.panier = CAT.produits.filter(dispo).slice(0, 3).map((p, i) => ({ k: p.id, id: p.id, q: i ? 1 : 2, opts: [] })); S.nom = 'Julie'; }
      if (page === 'regler') S.reste = lignes().map(l => Object.assign({}, l));
      if (page === 'merci' || page === 'comptoir') { S.nom = 'Julie'; S.cmd = { num: page === 'merci' ? 273044 : 273045, act: 'bar', nom: 'Julie', lieu: 'Piste 7', total: 12.5, paye: page === 'merci' ? 12.5 : 0 }; } }
    if (typeMod(APERCU) === 'resa' && page !== 'accueil') {
      initRs(APERCU);
      const r = S.rs, T = rsC().tranches; if (T[0] && etapesRs().includes('rs-age')) r.tranche = T[0].id;
      if (rsC().choixSalle && rsC().salles[0]) r.salle = rsC().salles[0].id;
      const F = formulesRs(); if (F[0]) choisirFormuleRs(F[0].nom);
      S.rsJours = SB.api.resa.creneaux(r.act, r.formule, r.nb, r.salle);
      const J = S.rsJours.find(x => x.heures.length); if (J) { r.j = J.j; r.h = J.heures[0].h; }
      Object.assign(r, { groupe: 'Les Invincibles', contact: { nom: 'Julie Martin', tel: '06 12 34 56 78' }, enfant: TX('rs-infos', 'enfant') ? { prenom: 'Léo', naissance: '2018-11-02', age: 8 } : r.enfant, prenoms: ['Léa', 'Tom', 'Inès', 'Hugo', 'Nino', 'Jade'].slice(0, r.nb) });
      rsC().options.forEach(o => { if (o.type === 'choix') r.choix[o.id] = 0; else r.qte[o.id] = Math.min(2, +o.max || 1); });
      const t = totalRs();
      if (page === 'merci') S.cmd = { num: 273043, act: r.act, total: t.acompte || t.total, paye: t.acompte || t.total, lignes: [] };
      if (page === 'regler') S.reste = [{ k: 'l0', id: 'l0', base: r.formule, nom: rsC().nom + ' · ' + r.formule, opts: [], q: r.nb, pu: heureRs() ? heureRs().prix : 10, tva: 20, p: { cat: r.act, e: emojiRs() } }];
    }
    /* moyen de paiement, ticket CE : un montant d'exemple, et un ticket déjà scanné */
    if (page === 'moyen' || page === 'ticket') { S.aPayer = [{ k: 'l0', id: 'l0', base: 'Exemple', nom: 'Exemple', opts: [], q: 1, pu: 8.5, tva: 20, p: { cat: '', e: '🎟️' } }];
      if (page === 'ticket') S.ce = { codes: [{ code: 'L2026-07-0002-3508', valeur: 7.5, contenu: 'Bowling · 1 partie' }], saisie: '', de: 'moyen' }; }
    aller(VUES[page] ? page : 'accueil');
  }

  /* ------------------------------------------------------------------ Écrans */
  const VUES = {
    veille() {
      return `<div class="veille" data-a="reveil"><div class="v-diapos"></div>
        <div class="v-bas"><p class="v-touch">${ic('main')} Touchez l’écran pour commencer</p></div></div>`;
    },

    accueil() {
      const M = S.conf.modules.slice().sort((x, y) => !!pretDe(y.act) - !!pretDe(x.act)), b = (S.conf.diffusion || {}).bandeau;   // les modules prêts en premier, les autres dans l'ordre du CRM
      const tuile = (m, i) => { const bar = m.act === 'bar', img = estImage(m.image);
        const pret = pretDe(m.act);
        return `<button class="module ${bar ? 'vedette' : pret ? '' : 'bientot'}" data-a="module" data-act="${esc(m.act)}" style="--i:${i};--c:${m.activite.c || '#0c2f47'}">${img ? `<img src="${esc(src(m.image))}" alt="">` : `<i class="m-e">${EMOJI_ACT[m.act] || emojiNom(m.activite.nom) || EMOJI_MODELE[m.activite.modele] || '✨'}</i>`}${pret ? '' : '<span class="m-bientot">Bientôt</span>'}<b>${esc(m.lib)}</b><small>${esc(m.sous)}</small>${pret ? `<span class="m-go">${pret} ${ic('suite')}</span>` : ''}</button>`; };
      /* grille 2 × 3 : toutes les tuiles ont la même taille ; au-delà de 6, on fait défiler */
      return entete('Bienvenue', 'Space Bowling Complexe') + (b ? `<div class="bandeau"><span>${esc(b)}</span></div>` : '') +
        `<div class="milieu fixe"><h1 class="titre grand">Que voulez-vous faire ?</h1><div class="modules">${M.map(tuile).join('')}
          ${S.conf.finaliser ? `<button class="module fin" data-a="aller" data-e="finaliser" style="--i:${M.length}"><i class="m-e">${ic('recu')}</i><b>Finaliser ma commande</b><small>Réservation en ligne ou numéro de borne</small></button>` : ''}</div></div>
        <footer class="pied accueil-pied">${ic('main')} Touchez une activité</footer>`;
    },

    bar() {
      return entete('Le bar', 'Boissons et snacks') + `<div class="milieu bar-m" data-zone-bar>${zoneBar()}</div><footer class="pied" data-zone="panier">${zonePanier()}</footer>`;
    },

    recap() {
      return entete('Votre commande', nbArticles() + ' article' + (nbArticles() > 1 ? 's' : '')) + `<div class="milieu"><div class="recap">
        <button class="retour" data-a="aller" data-e="bar">${ic('retour')} Retour aux articles</button>
        <div class="lignes" data-zone="lignes">${zoneLignes()}</div>
        <label class="nomcmd"><span>Votre prénom <em>obligatoire</em></span><input data-f="nom" value="${esc(S.nom)}" maxlength="24" placeholder="Pour vous appeler ou vous servir" autocomplete="off" enterkeyhint="done"><span class="err">Indiquez votre prénom pour valider la commande.</span></label>
        </div></div><footer class="pied recap-pied" data-zone="recapPied">${zoneRecapPied()}</footer>`;
    },

    regler() {
      const t = total(S.reste), deja = S.cmd ? arrondi((S.cmd.paye || 0) + (S.cmd.remise || 0) + (S.cmd.acompte || 0)) : 0, n = S.reste.reduce((k, l) => k + l.q, 0);
      return entete('Paiement', 'Commande ' + (S.cmd ? 'n° ' + S.cmd.num : 'en cours')) + `<div class="milieu centre">
        ${deja ? `<p class="deja">${ic('ok')} Déjà réglé ${eur(deja)} · reste ${eur(t)}</p>` : `<p class="montant-l">Total</p><p class="montant">${eur(t)}</p>`}
        <h1 class="titre c">${perso(S.module) ? esc(TX('regler', 'question')) : 'Comment voulez-vous régler ?'}</h1>
        <div class="choix2">${!partielPropose() ? choixMoyens() : `<button class="gchoix" data-a="tout" style="--i:0">${ic('recu', 'xl')}<b>${deja ? 'Payer le reste' : 'Tout payer'}</b><small>${eur(t)}</small></button>
          <button class="gchoix" data-a="partie" style="--i:1" ${n < 2 ? 'disabled' : ''}>${ic('part', 'xl')}<b>Payer une partie</b><small>${perso(S.module) ? esc(TX('regler', 'partielAide')) : 'Je choisis mes articles'}</small></button>`}</div></div>
        <footer class="pied rangee">${S.bw ? (S.cmd && S.cmd.paye ? '' : `<button class="btn sec" data-a="bwRetour">${ic('retour')} Retour</button>`) : S.rs && S.module === S.rs.act ? (S.cmd && S.cmd.paye ? '' : `<button class="btn sec" data-a="rsRevenir">${ic('retour')} Retour</button>`) : S.cmd ? '' : `<button class="btn sec" data-a="aller" data-e="ou">${ic('retour')} Retour</button>`}<button class="btn sec" data-a="annulerCmd">Annuler la commande</button></footer>`;
    },

    ou() {
      return entete('Où êtes-vous ?', 'Commande pour ' + S.nom) + `<div class="milieu zone-m"><h1 class="titre c">Où doit-on vous servir ?</h1>
        <div class="zones" data-zone="zones">${zoneZones()}</div><div class="numeros" data-zone="numeros">${zoneNumeros()}</div></div>
        <footer class="pied rangee" data-zone="ouPied">${zoneOuPied()}</footer>`;
    },

    partie() {
      return entete('Payer une partie', 'Reste ' + eur(total(S.reste))) + `<div class="milieu"><div class="recap"><h1 class="titre">${S.module === 'bowling' ? 'Qui payez-vous maintenant ?' : 'Que payez-vous maintenant ?'}</h1><p class="sous-t">Touchez + sur les articles de ce paiement. Le reste se paiera juste après.</p>
        <div class="lignes" data-zone="partie">${zonePartie()}</div></div></div><footer class="pied recap-pied" data-zone="partiePied">${zonePartiePied()}</footer>`;
    },

    moyen() {
      return entete('Paiement', '') + `<div class="milieu centre"><p class="montant-l">À payer</p><p class="montant">${eur(total(S.aPayer))}</p><h1 class="titre c">Comment payez-vous ?</h1><div class="choix2">${choixMoyens()}</div></div>
        <footer class="pied rangee"><button class="btn sec" data-a="${S.rs && S.module === S.rs.act && !reglerRs() ? 'rsRevenir' : 'aller'}" data-e="regler">${ic('retour')} Retour</button></footer>`;
    },

    tpe() {
      const m = total(S.aPayer);
      if (MOBILE) return entete('Carte bancaire', 'Paiement en ligne') + `<div class="milieu centre"><div class="s-ic">${ic('carte', 'xl')}</div><p class="montant">${eur(m)}</p>
        <h1 class="titre c">Paiement par carte</h1><p class="sous-t c">Le paiement en ligne sécurisé arrive bientôt : pour l’instant, il est simulé.</p>
        ${modeTest(`<button class="btn ok" data-a="simOk">${ic('ok')} Accepté</button><button class="btn ko" data-a="simKo">${ic('croix')} Refusé</button>`)}</div>
        <footer class="pied rangee"><button class="btn sec" data-a="annulerPaiement">Annuler</button></footer>`;
      return entete('Carte bancaire', 'Paiement') + `<div class="milieu centre"><div class="tpe-scene">${svgTpe(m)}</div><p class="montant">${eur(m)}</p>
        <h1 class="titre c">Présentez votre carte<br>sur le terminal</h1><p class="sous-t c">Sans contact, ou insérez-la et tapez votre code.</p>
        <p class="attente">En attente du terminal<span class="pts"><i></i><i></i><i></i></span></p>
        ${modeTest(`<button class="btn ok" data-a="simOk">${ic('ok')} Accepté</button><button class="btn ko" data-a="simKo">${ic('croix')} Refusé</button>`)}</div>
        <footer class="pied rangee"><button class="btn sec" data-a="annulerPaiement">Annuler</button></footer>`;
    },

    especes() {
      const m = total(S.aPayer);
      return entete('Espèces', 'Paiement') + `<div class="milieu centre"><div class="anneau" data-anneau style="--p:0"><div><small>Inséré</small><b data-insere>${eur(S.insere)}</b><small>sur ${eur(m)}</small></div></div>
        <h1 class="titre c">Insérez vos billets<br>et vos pièces</h1><p class="sous-t c" data-reste>Reste ${eur(m - S.insere)} · le monnayeur rend la monnaie.</p>
        ${modeTest([.5, 1, 2, 5, 10, 20].map(v => `<button class="btn piece" data-a="piece" data-v="${v}">+ ${eur(v)}</button>`).join('') + `<button class="btn ko" data-a="simKo">Monnayeur en erreur</button>`)}</div>
        <footer class="pied rangee"><button class="btn sec" data-a="annulerPaiement">Annuler</button></footer>`;
    },

    ticket() {
      return entete('Ticket CE', 'Paiement') + `<div class="milieu centre ticket-m"><p class="montant-l">À payer</p><p class="montant">${eur(total(S.aPayer))}</p>
        <h1 class="titre c">Scannez votre ticket</h1><p class="sous-t c">Présentez son QR code devant le lecteur, ou tapez le code. Plusieurs tickets ? Scannez-les l’un après l’autre.</p>
        <div class="ce" data-ce><div class="ce-l"><input data-f="ceCode" value="${esc(S.ce.saisie)}" placeholder="Code du ticket" autocomplete="off" autocapitalize="characters" enterkeyhint="go"><button class="btn sec" data-a="ceAjouter">Ajouter</button></div>
          <p class="ce-ko" data-ce-err></p><div class="remises" data-zone="ceCodes">${zoneCodesCe()}</div></div></div>
        <footer class="pied recap-pied" data-zone="cePied">${zonePiedCe()}</footer>`;
    },

    refuse() {
      return entete('Paiement', '') + `<div class="milieu centre refuse"><div class="triste"><svg viewBox="0 0 40 100" aria-hidden="true"><g class="q">${QUILLE}<circle cx="16.5" cy="13" r="1.5" fill="#0c2f47"/><circle cx="23.5" cy="13" r="1.5" fill="#0c2f47"/><path d="M16 21q4-3.2 8 0" fill="none" stroke="#0c2f47" stroke-width="1.6" stroke-linecap="round"/><path class="larme" d="M14.6 15.5q-1.3 2.2 0 2.9 1.3-.7 0-2.9z" fill="#00aee0"/></g></svg></div>
        <h1 class="titre c">Paiement refusé</h1><p class="sous-t c">Pas d’inquiétude, rien n’a été débité.<br>Avec quel moyen voulez-vous réessayer ?</p>
        <div class="choix2">${choixMoyens()}</div></div>
        <footer class="pied rangee"><button class="btn sec" data-a="annulerCmd">Annuler la commande</button></footer>`;
    },

    merci() {
      if (S.rs && (S.cmd.act || S.module) === S.rs.act) return merciRs();
      const bowling = (S.cmd.act || S.module) === 'bowling', lieu = S.cmd.lieu || lieuCmd(), retrait = /^Borne /.test(lieu) || zones().some(z => z.retrait && z.nom === lieu);
      const ou = retrait ? `À récupérer au comptoir du bar : on appellera « ${esc(S.nom)} ».` : `Nous vous l’apportons : ${esc(lieu)}.`;
      return `<div class="merci"><div class="confettis">${confettis()}</div>
        <div class="m-ok"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54"/><path d="M36 62l16 16 32-34"/></svg></div>
        <p class="strike">${esc(TX('merci', 'mot', null, S.cmd.act || S.module) || 'Strike !')}</p><h1>Merci${(S.cmd.nom || S.nom) ? ' ' + esc(S.cmd.nom || S.nom) : ''} !</h1>
        <p class="m-num">${bowling && S.cmd.reference ? (S.cmd.bot && S.cmd.bot.envois.length > 1 ? esc(TX('merci', 'references', null, 'bowling')) + '<b>' + S.cmd.bot.envois.map(e => esc(e.nom)).join(' · ') + '</b>' : esc(TX('merci', 'reference', null, 'bowling')) + '<b>' + esc(S.cmd.reference) + '</b>') : 'Votre commande<b>n° ' + S.cmd.num + '</b>'}</p><p class="m-ou">${bowling ? riche(TX('merci', 'message', null, 'bowling')) : 'Elle part au bar. ' + ou}</p>
        ${S.rendu > 0 ? `<p class="m-rendu">N’oubliez pas votre monnaie : <b>${eur(S.rendu)}</b></p>` : ''}
        <button class="btn pri gros" data-a="terminer">${esc(TX('merci', 'bouton', null, S.cmd.act || S.module) || 'Terminer')}</button><p class="m-auto">Retour à l’accueil dans <b data-compte>${delaiMerci()}</b> s</p></div>`;
    },

    /* borne sans monnayeur (tablette de piste) ou téléphone : « Espèces » met la commande de côté, le client la paie sur une grande borne avec ce numéro */
    comptoir() {
      const n = String(S.cmd.num), min = (S.cmd.especes || {}).min || +TX('comptoir', 'minutes') || 10, du = arrondi(S.cmd.total - (S.cmd.paye || 0) - (S.cmd.remise || 0));
      return `<div class="merci sauvee comptoir"><div class="s-ic">${ic('billets', 'xl')}</div><h1>${esc(TX('comptoir', 'titre'))}</h1>
        <p class="m-ou">${riche(TX('comptoir', 'message'))}</p>
        <p class="s-lab">${esc(TX('comptoir', 'numero'))}</p><p class="s-code">${n.slice(0, 3)} ${n.slice(3)}</p>
        <p class="m-ou">À payer : <b>${eur(du)}</b> · dans les <b>${min} minutes</b>, sinon elle est annulée.</p>
        <button class="btn pri gros" data-a="terminer">${esc(MOBILE ? 'Nouvelle commande' : TX('comptoir', 'bouton'))}</button><p class="m-auto">Retour à l’accueil dans <b data-compte>${+TX('comptoir', 'delai') || 15}</b> s</p></div>`;
    },

    /* plus de réseau : la commande est enregistrée sur la borne, le client repart avec son numéro */
    sauvee() {
      const n = String(S.cmd.num);
      return `<div class="merci sauvee"><div class="s-ic">${ic('recu', 'xl')}</div><h1>Commande enregistrée</h1>
        <p class="m-ou">Le réseau est coupé : le paiement n’est pas possible pour l’instant.</p>
        <p class="s-lab">Votre numéro de commande</p><p class="s-code">${n.slice(0, 3)} ${n.slice(3)}</p>
        <p class="m-ou">Notez-le ou prenez-le en photo. Dès que le réseau revient, touchez <b>« Finaliser ma commande »</b> sur n’importe quelle borne et tapez ce numéro pour payer.</p>
        <p class="s-det">${esc(S.cmd.nom || S.nom)} · ${esc(S.cmd.lieu || lieuCmd())} · ${eur(S.cmd.total)}</p>
        <button class="btn pri gros" data-a="terminer">J’ai noté mon numéro</button><p class="m-auto">Retour à l’accueil dans <b data-compte>45</b> s</p></div>`;
    },

    finaliser() {
      return entete('Finaliser', 'Avec le numéro donné par une borne') + `<div class="milieu centre fin-m"><h1 class="titre c">Tapez votre numéro<br>de commande</h1>
        <p class="sous-t c">Le numéro de votre réservation en ligne, ou celui donné par une borne.</p>
        <div class="code" data-zone="code">${zoneCode()}</div><p class="aide err" data-err></p>
        <div class="clavier">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="touche" data-a="chiffre" data-n="${n}">${n}</button>`).join('')}<button class="touche" data-a="effacer" aria-label="Effacer">${ic('retour')}</button><button class="touche" data-a="chiffre" data-n="0">0</button><button class="touche ok" data-a="chercher" aria-label="Valider">${ic('ok')}</button></div></div>
        <footer class="pied rangee"><button class="btn sec" data-a="aller" data-e="accueil">${ic('retour')} Retour</button></footer>`;
    },

    retrouvee() {
      return entete('Commande n° ' + S.cmd.num, esc(S.cmd.nom) + ' · ' + S.cmd.lieu) + `<div class="milieu"><div class="recap"><h1 class="titre">Votre commande</h1>
        <div class="lignes">${S.reste.map((l, i) => ligneHtml(l, i, `<b class="l-q">× ${l.q}</b>`, l.q * l.pu)).join('')}</div></div></div>
        <footer class="pied recap-pied"><div class="rp-tot"><small>${S.cmd.paye ? 'Reste à payer' : 'Total à payer'}</small><b>${eur(total(S.reste))}</b></div>
        <div class="rangee"><button class="btn sec" data-a="terminer">Annuler</button><button class="btn pri" data-a="aller" data-e="regler">Payer ${ic('suite')}</button></div></footer>`;
    },

    /* ================= MODULE BOWLING : joueurs + formule → prénoms → récapitulatif (tickets CE) → paiement → accueil ================= */
    'bw-formule'() {
      const n = S.bw.joueurs.length;
      const [mi, ma] = bornesBw();
      return entete(TX('bw-formule', 'entete'), TX('bw-formule', 'entete2')) + `<div class="milieu bw-m">
        <h1 class="titre c">${esc(TX('bw-formule', 'question'))}</h1>
        <div class="bw-compteur"><button class="rond" data-a="bwN" data-d="-1" aria-label="Un joueur de moins" ${n <= mi ? 'disabled' : ''}>${ic('moins')}</button><b data-bwn>${n}</b><button class="rond" data-a="bwN" data-d="1" aria-label="Un joueur de plus" ${n >= ma ? 'disabled' : ''}>${ic('plus')}</button></div>
        ${TX('bw-formule', 'quilles') ? `<div class="quilles" data-zone="bwQuilles">${quillesHtml(n, false)}</div>` : ''}
        <h2 class="titre c petit">${esc(TX('bw-formule', 'questionFormule'))}</h2>
        <div class="formules">${(S.tarifs || []).map((f, i) => `<button class="formule ${S.bw.formule === f.nom ? 'on' : ''}" data-a="bwFormule" data-f="${esc(f.nom)}" style="--i:${i}">
          ${/\+/.test(f.nom) ? `<span class="f-offre">${esc(TX('bw-formule', 'offre'))}</span>` : ''}<span class="f-n">${esc(f.nom.replace(/\s*parties?$/i, ''))}</span><b>${partiesDe(f.nom) > 1 ? partiesDe(f.nom) + ' parties' : '1 partie'}</b>
          ${TX('bw-formule', 'prixJoueur') ? `<span class="f-pu" data-fpu="${esc(f.nom)}">${eur(f.unitaire)} / joueur</span>` : ''}${TX('bw-formule', 'total') ? `<span class="f-tot" data-ftot="${esc(f.nom)}" data-v="${f.total}">${eur(f.total)}</span>` : ''}</button>`).join('') || '<p class="vide-cat">Aucune formule : ajoutez-en dans le CRM (Bowling › Tarifs).</p>'}</div></div>
        <footer class="pied rangee"><button class="btn sec" data-a="aller" data-e="accueil">${ic('retour')} Retour</button><button class="btn pri" data-a="aller" data-e="bw-joueurs" data-bwsuite ${S.bw.formule ? '' : 'disabled'}>Continuer ${ic('suite')}</button></footer>`;
    },

    'bw-joueurs'() {
      return entete(S.bw.resa ? 'Réservation' : 'Bowling', (S.bw.resa ? 'n° ' + S.bw.resa.num + ' · ' : '') + S.bw.formule + ' · ' + S.bw.joueurs.length + ' joueur' + (S.bw.joueurs.length > 1 ? 's' : '')) + `<div class="milieu bw-j">
        <label class="groupe" data-groupe><span>${esc(TX('bw-joueurs', 'groupe'))} ${TX('bw-joueurs', 'groupeOblig') ? '<em>obligatoire</em>' : ''}</span><input data-f="groupe" value="${esc(S.bw.groupe)}" maxlength="20" placeholder="${esc(TX('bw-joueurs', 'groupeAide'))}" autocomplete="off" enterkeyhint="next"><span class="err">${esc(TX('bw-joueurs', 'groupeErreur'))}</span></label>
        <p class="lab-j">${esc(TX('bw-joueurs', 'joueurs'))} ${TX('bw-joueurs', 'barrieres') ? `<small>${esc(TX('bw-joueurs', 'barrieresAide'))}</small>` : ''}</p>
        <div class="joueurs" data-zone="bwJoueurs">${zoneJoueurs()}</div>
        ${S.bw.resa ? '' : `<button class="ajout-j" data-a="bwAjout" ${S.bw.joueurs.length >= bornesBw()[1] ? 'disabled' : ''}>${ic('plus')} ${esc(TX('bw-joueurs', 'ajouter'))}</button>`}</div>
        <footer class="pied recap-pied" data-zone="bwPiedJ">${zonePiedJ()}</footer>`;
    },

    'bw-recap'() {
      const L = lignesBowling(), barr = S.bw.joueurs.filter(j => j.barrieres).length;
      return entete(S.bw.resa ? 'Réservation' : 'Bowling', (S.bw.resa ? 'n° ' + S.bw.resa.num + ' · ' : '') + TX('bw-recap', 'entete2')) + `<div class="milieu bw-r">
        <div class="bw-carte"><i class="deco">🎳</i><small>${esc(TX('bw-recap', 'groupe'))}</small><b>${esc(S.bw.groupe)}</b>${S.bw.resa ? `<span class="pill">${ic('ok')} Réservée à ${S.bw.resa.h}</span>` : ''}<span class="pill">${esc(S.bw.formule)}</span><span class="pill">${L.length} joueur${L.length > 1 ? 's' : ''}</span>${tailles().length > 1 ? `<span class="pill">${tailles().length} pistes (${tailles().join(' + ')})</span>` : ''}${barr ? `<span class="pill">${ic('barriere')} ${barr} avec barrières</span>` : ''}</div>
        <div class="lignes">${L.map((l, i) => ligneHtml(l, i, '', l.pu)).join('')}</div>
        ${ceAccepte() ? INDICE_CE : ''}</div>
        <footer class="pied recap-pied" data-zone="bwPiedR">${zonePiedR()}</footer>`;
    },

    /* ================= MODULE DE RÉSERVATION (laser, karaoké, quiz, billard, anniversaire…) =================
       Étapes, ordre, textes, règles et options : CRM › Sandbox › activité › Module borne (préréglage selon le fonctionnement). */
    'rs-salle'() {
      return enteteRs('rs-salle') + `<div class="milieu an-m">${ballons()}${etapeRs('rs-salle')}
        <h1 class="titre c an-t">${esc(TX('rs-salle', 'titre'))}</h1><p class="sous-t c">${esc(TX('rs-salle', 'sous'))}</p>
        <div class="an-formules">${rsC().salles.map((x, i) => `<button class="an-f ${S.rs.salle === x.id ? 'on' : ''}" data-a="rsSalle" data-s="${esc(x.id)}" style="--i:${i};--c:${couleurRs(i * 2 + 1)}">
          <i class="an-f-e" aria-hidden="true">${emojiRs()}</i><span class="an-f-tags">${TX('rs-salle', 'capacite') ? `<span class="an-f-age">Jusqu’à ${x.cap} pers.</span>` : ''}</span>
          <b>${esc(x.nom)}</b>${x.desc ? `<span class="an-f-desc">${esc(x.desc)}</span>` : ''}${(() => { const F = rsC().formules.filter(f => pourSalle(f, x.id)); if (!F.length) return ''; const m = F.reduce((b, f) => f.apartir < b.apartir ? f : b, F[0]), D = [...new Set(F.map(f => dureeTxt(f.duree)).filter(Boolean))];
            return `${D.length ? `<span class="an-f-meta"><span>⏱ ${D.join(' · ')}</span></span>` : ''}<span class="an-f-prix"><small>À partir de</small><b>${eur(m.apartir)}</b><small>${esc((m.unite || '').replace(/^par /, '/ '))}</small></span>`; })()}</button>`).join('')}</div></div>
        <footer class="pied rangee"><button class="btn sec" data-a="rsPrec" data-e="rs-salle">${ic('retour')} Retour</button></footer>`;
    },

    'rs-age'() {
      return enteteRs('rs-age') + `<div class="milieu an-m">${ballons()}${etapeRs('rs-age')}
        <h1 class="titre c an-t">${esc(TX('rs-age', 'titre'))}</h1><p class="sous-t c">${esc(TX('rs-age', 'sous'))}</p>
        <div class="an-ages">${rsC().tranches.map((t, i) => { const n = formulesTranche(t.id).length; return `<button class="an-age" data-a="rsAge" data-t="${esc(t.id)}" style="--i:${i};--c:${couleurRs(i * 2)}">
          ${TX('rs-age', 'bougies') ? `<span class="bougies">${Array.from({ length: Math.min(+t.min || 1, 7) }, (_, k) => `<i class="bougie" style="--k:${k};--b:${COUL_AN[(k + i + 1) % COUL_AN.length]}"></i>`).join('')}</span>` : ''}
          <b>${esc(t.lib)}</b><small>${n} formule${n > 1 ? 's' : ''}</small></button>`; }).join('') || '<p class="vide-cat">Aucune tranche d’âge : à régler dans le CRM (Sandbox › Module borne).</p>'}</div></div>
        <footer class="pied rangee"><button class="btn sec" data-a="rsPrec" data-e="rs-age">${ic('retour')} Retour</button></footer>`;
    },

    'rs-formule'() {
      const F = formulesRs(), t = trancheRs();
      return enteteRs('rs-formule', t && t.lib) + `<div class="milieu an-m">${ballons()}${etapeRs('rs-formule')}
        <h1 class="titre c an-t">${esc(TX('rs-formule', 'titre'))}</h1><p class="sous-t c">${esc(TX('rs-formule', 'sous'))}</p>
        <div class="an-formules">${F.map(carteFormule).join('') || `<p class="vide-cat">Pas encore de formule${t ? ' pour cet âge' : ''} : demandez à l’accueil.</p>`}</div></div>
        <footer class="pied rangee"><button class="btn sec" data-a="rsPrec" data-e="rs-formule">${ic('retour')} Retour</button></footer>`;
    },

    'rs-nombre'() {
      const [a, b] = bornesNbRs();
      return enteteRs('rs-nombre', S.rs.formule) + `<div class="milieu an-m">${ballons()}${etapeRs('rs-nombre')}
        <h1 class="titre c an-t">${esc(TX('rs-nombre', 'titre'))}</h1>
        <div data-zone="rsNb">${compteurRs()}</div><p class="sous-t c">De ${a} à ${b} ${esc(uniteRs())}</p></div>
        <footer class="pied rangee">${piedRs('rs-nombre', true)}</footer>`;
    },

    'rs-date'() {
      const J = S.rsJours || [], libres = J.some(x => x.heures.length), seul = J.length === 1;
      return enteteRs('rs-date', S.rs.formule) + `<div class="milieu an-m">${ballons()}${etapeRs('rs-date')}
        <h1 class="titre c an-t">${esc(TX('rs-date', 'titre'))}</h1><p class="sous-t c">${libres && !seul ? esc(TX('rs-date', 'sous')) : ''}</p>
        ${libres ? (seul ? '' : `<div data-zone="rsCal">${calendrierRs()}</div>`) + `<div data-zone="rsHeures">${zoneHeuresRs()}</div>` : `<p class="an-vide">${esc(TX('rs-date', 'vide'))}</p>`}</div>
        <footer class="pied rangee" data-zone="rsPiedDate">${piedRs('rs-date', !!S.rs.h)}</footer>`;
    },

    'rs-options'() {
      return enteteRs('rs-options') + `<div class="milieu an-m">${ballons()}${etapeRs('rs-options')}
        <h1 class="titre c an-t">${esc(TX('rs-options', 'titre'))}</h1>
        ${rsC().options.map((o, i) => o.type === 'choix'
          ? `<div class="an-opt" data-opt="${esc(o.id)}" style="--i:${i};--c:${couleurRs(i * 3)}"><h2>${esc(o.nom)}${o.obligatoire ? '<em>à choisir</em>' : ''}</h2>
              <div class="an-choix">${o.choix.map((c, k) => `<button class="an-c ${S.rs.choix[o.id] === k ? 'on' : ''}" data-a="rsChoix" data-o="${esc(o.id)}" data-c="${k}" aria-pressed="${S.rs.choix[o.id] === k}"><i aria-hidden="true">${emojiOpt(o.nom, c)}</i>${esc(c)}</button>`).join('')}${o.obligatoire ? '' : `<button class="an-c ${S.rs.choix[o.id] === -1 ? 'on' : ''}" data-a="rsChoix" data-o="${esc(o.id)}" data-c="-1"><i aria-hidden="true">🙅</i>Sans</button>`}</div></div>`
          : `<div class="an-opt" data-opt="${esc(o.id)}" style="--i:${i};--c:${couleurRs(i * 3)}"><h2>${esc(o.nom)}<small>${eur(+o.prix || 0)} ${esc(o.unite ? 'la ' + o.unite : 'pièce')} · jusqu’à ${o.max}</small></h2>
              <div data-zone="rsQte-${esc(o.id)}">${qteRs(o)}</div></div>`).join('')}</div>
        <footer class="pied rangee">${piedRs('rs-options', true)}</footer>`;
    },

    'rs-infos'() {
      const r = S.rs, I = k => TX('rs-infos', k), aujourdhui = new Date().toISOString().slice(0, 10), nbIci = I('nombre') && !etapesRs().includes('rs-nombre');
      return enteteRs('rs-infos') + `<div class="milieu an-m an-form">${ballons()}${etapeRs('rs-infos')}
        <h1 class="titre c an-t">${esc(I('titre'))}</h1>
        ${I('enfant') ? `<label class="groupe" data-champ="rsEnfant"><span>Prénom de l’enfant <em>obligatoire</em></span><input data-f="rsEnfant" value="${esc(r.enfant.prenom)}" maxlength="20" placeholder="Ex. Léo" autocomplete="off" enterkeyhint="next"><span class="err">Indiquez le prénom de l’enfant.</span></label>
        <label class="groupe" data-champ="rsNaissance"><span>Date de naissance <em>obligatoire</em></span><input type="date" data-f="rsNaissance" value="${esc(r.enfant.naissance)}" max="${aujourdhui}" min="1990-01-01"><span class="err">Indiquez sa date de naissance.</span></label>
        <div class="an-bloc" data-zone="rsAgeFete">${ageFeteRs()}</div>` : ''}
        ${I('groupe') ? `<label class="groupe" data-champ="rsGroupe"><span>${esc(I('groupeLib'))} ${I('groupeOblig') ? '<em>obligatoire</em>' : ''}</span><input data-f="rsGroupe" value="${esc(r.groupe)}" maxlength="24" placeholder="${esc(I('groupeAide'))}" autocomplete="off" enterkeyhint="next"><span class="err">Indiquez le nom du groupe.</span></label>` : ''}
        ${nbIci ? `<div class="an-bloc"><p class="lab-j">${esc(I('nombreTitre'))} <small>${esc(I('nombreAide'))}</small></p><div data-zone="rsNbInfos">${nbRs()}</div></div>` : ''}
        ${I('prenoms') ? `<p class="lab-j an-sep">Les ${esc(uniteRs())} ${I('prenomsOblig') ? '' : '<small>Facultatif</small>'}</p><div class="joueurs" data-champ="rsPrenoms">${Array.from({ length: r.nb }, (_, i) => `<div class="joueur" style="--i:${i}"><span class="j-num">${i + 1}</span><input data-f="rsPrenom" data-i="${i}" value="${esc(r.prenoms[i] || '')}" maxlength="16" placeholder="Prénom ${i + 1}" autocomplete="off" enterkeyhint="next"></div>`).join('')}</div>` : ''}
        ${I('contact') ? `<p class="lab-j an-sep">${esc(I('contactTitre'))} <small>${esc(I('contactAide'))}</small></p>
        <label class="groupe" data-champ="rsNom"><span>Votre nom ${I('contactOblig') ? '<em>obligatoire</em>' : ''}</span><input data-f="rsNom" value="${esc(r.contact.nom)}" maxlength="30" placeholder="Prénom et nom" autocomplete="off" enterkeyhint="next"><span class="err">Indiquez votre nom.</span></label>
        <label class="groupe" data-champ="rsTel"><span>Téléphone ${I('contactOblig') ? '<em>obligatoire</em>' : ''}</span><input type="tel" inputmode="tel" data-f="rsTel" value="${esc(r.contact.tel)}" maxlength="16" placeholder="06 12 34 56 78" autocomplete="off" enterkeyhint="done"><span class="err">Indiquez un numéro à 10 chiffres.</span></label>` : ''}</div>
        <footer class="pied rangee">${piedRs('rs-infos', true)}</footer>`;
    },

    'rs-recap'() {
      const r = S.rs, J = jourRs(), H = heureRs() || { prix: 0 }, T = totalRs(), f = formuleRs() || {}, acompte = rsC().regles.paiement === 'acompte';
      return enteteRs('rs-recap') + `<div class="milieu an-m">${ballons()}${etapeRs('rs-recap')}
        <div class="an-carte"><i class="gateau" aria-hidden="true">${emojiRs()}</i><small>${esc(TX('rs-recap', 'carte'))}</small><b>${esc(titreRs())}</b>
          ${r.enfant.age && TX('rs-infos', 'enfant') ? `<span class="pill">🎈 ${r.enfant.age} ans</span>` : ''}${J ? `<span class="pill">📅 ${esc(cap(dateRs(J.iso)))} · ${esc(hAff(r.h))}</span>` : ''}${salleRs() ? `<span class="pill">🚪 ${esc(salleRs().nom)}</span>` : ''}<span class="pill">✨ ${esc(r.formule)}</span><span class="pill">${uniteRs() === 'enfants' ? '🧒' : '👥'} ${r.nb} ${esc(uniteRs())}</span></div>
        <div class="an-lignes"><div class="an-l"><span>${f.parPers ? r.nb + ' ' + esc(uniteRs()) + ' × ' + eur(H.prix) : esc(r.formule)}</span><b>${eur(T.base)}</b></div>
          ${optionsRs().map(o => `<div class="an-l"><span>${esc(o.nom)} ${o.q ? '× ' + o.q : '· ' + esc(o.choix)}</span><b>${o.q ? eur(o.q * o.prix) : 'inclus'}</b></div>`).join('')}
          <div class="an-l tot"><span>${acompte ? 'Total estimé' : 'Total'}</span><b>${eur(T.total)}</b></div></div>
        ${TX('rs-recap', 'note') ? `<p class="sous-t c">${riche(TX('rs-recap', 'note'))}</p>` : ''}
        ${ceAccepte() ? INDICE_CE : ''}</div>
        <footer class="pied recap-pied" data-zone="rsPiedR">${piedRecapRs()}</footer>`;
    },

    choix() {
      const B = ((window.SB && SB.etat().config.bornes) || []).filter(b => b.type !== 'Écran');
      return `<div class="choix-b"><h1>Quelle borne ?</h1><p>Mode test : choisissez la borne à simuler. Sur l’appareil, son identifiant viendra de l’appairage.</p>
        <div class="liste-b">${B.map(b => `<a href="?borne=${encodeURIComponent(b.id)}"><b>${esc(b.id)}</b><span>${esc(b.nom)}</span><small>${esc(b.zone)} · ${esc(b.type)}</small></a>`).join('') || '<p>Aucune borne : ouvrez d’abord le CRM.</p>'}</div></div>`;
    },

    vide() {
      return `<div class="choix-b"><h1>Borne pas encore prête</h1><p>${ID ? 'La borne « ' + esc(ID) + ' » est inconnue, ou' : ''} la sandbox est vide dans ce navigateur. Ouvrez une fois le CRM ici : il crée les données partagées, puis la borne démarre seule.</p>
        <a class="lien" href="../maquettes/e-v2.html" target="_blank" rel="noopener">Ouvrir le CRM</a><a class="lien" href="?">Choisir une autre borne</a></div>`;
    }
  };

  /* ------------------------------------------------------------------ Morceaux d'écran */
  function zoneBar() {
    if (!CAT.produits.length) return `<div class="bar-grille"><div class="intro-bar"><h1 class="titre">La carte arrive</h1><p>Aucun article pour cette borne : vérifiez la carte dans le CRM (Bar › Produits).</p></div></div>`;
    if (!S.rub) { const n = CAT.cats.length, cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
      return `<div class="bar-grille"><div class="intro-bar"><h1 class="titre">Qu’est-ce qui vous ferait plaisir ?</h1></div>
      <div class="grille-c fit" style="${ajuste(cols, Math.ceil(n / cols), 15)}">${CAT.cats.map(([c], i) => carteCat(c, c, i, `data-a="rub" data-c="${esc(c)}"`, produitsDe(c).length)).join('')}</div></div>`; }
    return `<div class="bar-2"><nav class="rail" aria-label="Catégories"><button class="r-tout" data-a="toutes">${ic('grille')}<span>Tout</span></button>${CAT.cats.map(([c]) => `<button class="${c === S.rub ? 'on' : ''}" data-a="rub" data-c="${esc(c)}">${vis(visu(c), coul(c))}<span>${esc(c)}</span></button>`).join('')}</nav>
      <div class="contenu">${zoneContenu()}</div><button class="plus-bas" data-a="plusBas" aria-label="Voir la suite">${ic('bas')}</button></div>`;
  }
  function zoneContenu() {
    const ss = sousDe(S.rub);
    if (ss.length && !S.sous) return `<h1 class="titre">${esc(S.rub)}</h1><div class="grille-c sousgrille">${ss.map((s, i) => carteCat(S.rub + '/' + s, s, i, `data-a="sous" data-s="${esc(s)}"`, produitsDe(S.rub, s).length)).join('')}</div>`;
    const P = produitsDe(S.rub, S.sous);
    return `<h1 class="titre">${S.sous ? `<button class="miette" data-a="sous" data-s="" aria-label="Retour à ${esc(S.rub)}">${ic('retour')}</button>` : ''}${esc(S.sous || S.rub)}</h1>
      ${ss.length ? `<div class="pilules">${ss.map(s => `<button class="${s === S.sous ? 'on' : ''}" data-a="sous" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
      ${P.length ? `<div class="grille-p">${P.map(carteProd).join('')}</div>` : '<p class="vide-cat">Rien ici pour le moment.</p>'}`;
  }
  const ajuste = (cols, rows, max) => `--cols:${cols};--rows:${rows};--em:${Math.min(max, 44 / Math.max(cols, rows)).toFixed(1)}cqw`;
  const carteCat = (k, nom, i, attrs, n) => `<button class="carte-c" ${attrs} style="--i:${i};--c:${coul(k.split('/')[0])}">${vis(visu(k), coul(k.split('/')[0]))}<span class="cc-t"><b>${esc(nom)}</b><small>${n} article${n > 1 ? 's' : ''}</small></span></button>`;
  function carteProd(p, i) {
    const ok = dispo(p);
    const O = optionsDe(p);
    return `<div class="carte-p ${ok ? '' : 'off'}" ${ok ? `data-a="fiche" data-id="${p.id}" role="button" aria-label="Voir ${esc(p.nom)}"` : 'aria-disabled="true"'} style="--i:${i};--c:${coul(p.cat)}">${vis(p, coul(p.cat))}<span class="cp-n">${esc(p.nom)}${O.length ? `<small>${esc(O.map(g => g.nom).join(', '))} ${obligatoire(p) ? 'au choix' : 'en option'}</small>` : ''}</span>
      <span class="cp-b"><b class="cp-px">${eur(p.prix)}</b>${ok ? `<button class="cp-plus" data-a="plus" data-id="${p.id}" aria-label="Ajouter ${esc(p.nom)} au panier">${ic('plus')}</button>` : `<span class="cp-des">${p.des ? 'dès ' + esc(p.des.replace(':', 'h')) : 'plus servi'}</span>`}</span>
      <span class="qte" data-q="${p.id}">${qte(p.id) || ''}</span>${p.alcool ? '<span class="b18">18+</span>' : ''}</div>`;
  }
  function zonePanier() {
    const t = total(lignes()), n = nbArticles();
    return `<div class="pan-b"><button class="btn sec" data-a="annuler">Annuler</button>
      <button class="btn-panier" data-a="voirPanier" data-cible aria-label="Voir le panier, ${n} article${n > 1 ? 's' : ''}"><span class="bp-ic">${ic('panier')}<b class="bp-n" data-n>${n || ''}</b></span><span class="bp-t"><small>Panier</small><b data-total="${t}">${eur(t)}</b></span></button>
      <button class="btn pri" data-a="continuer" ${n ? '' : 'disabled'}>Continuer ${ic('suite')}</button></div>`;
  }
  /* fenêtre du panier : les articles, −/+, total, puis « Commander » (= Continuer) */
  const modalePanier = () => `<div class="feuille panier-f" role="dialog" aria-modal="true" aria-label="Votre panier"><button class="f-x" data-a="fermer" aria-label="Fermer">${ic('croix')}</button>
    <h2>Votre panier</h2><div class="lignes" data-zone="pfLignes">${zonePfLignes()}</div><div class="pf-bas" data-zone="pfBas">${zonePfBas()}</div></div>`;
  const zonePfLignes = () => lignes().map((l, i) => ligneHtml(l, i, `<div class="pas"><button data-a="pm" data-k="${esc(l.k)}" data-d="-1" aria-label="Un de moins">${ic('moins')}</button><b>${l.q}</b><button data-a="pm" data-k="${esc(l.k)}" data-d="1" aria-label="Un de plus">${ic('plus')}</button></div>`, l.q * l.pu)).join('') || `<p class="vide-cat">${ic('panier')} Votre panier est vide : touchez + sur un article.</p>`;
  function zonePfBas() {
    const t = total(lignes()), n = nbArticles();
    return `<div class="rp-tot"><small>${n} article${n > 1 ? 's' : ''}</small><b>${eur(t)}</b></div>
      <div class="rangee"><button class="btn sec" data-a="fermer">Continuer mes achats</button><button class="btn pri" data-a="continuer" ${n ? '' : 'disabled'}>Commander ${ic('suite')}</button></div>`;
  }
  const ligneHtml = (l, i, pas, px) => `<div class="ligne" style="--i:${i}">${vis(l.p, coul(l.p.cat))}<div class="l-t"><b>${esc(l.base)}</b><small>${l.opts.length ? esc(optsTxt(l.opts)) + ' · ' : ''}${l.p.cat === 'bowling' ? esc(String(l.nom).split(' · ').slice(1).join(' · ')) : eur(l.pu) + ' l’unité'}</small></div>${pas}<b class="l-px">${eur(px)}</b></div>`;
  const zoneLignes = () => lignes().map((l, i) => ligneHtml(l, i, `<div class="pas"><button data-a="rq" data-k="${esc(l.k)}" data-d="-1" aria-label="Un de moins">${ic('moins')}</button><b>${l.q}</b><button data-a="rq" data-k="${esc(l.k)}" data-d="1" aria-label="Un de plus">${ic('plus')}</button></div>`, l.q * l.pu)).join('');
  function zoneRecapPied() {
    const t = total(lignes()), alc = alcool();
    return `<div class="rp-tot"><small>Total à payer</small><b>${eur(t)}</b></div>
      ${alc ? `<button class="majeur ${S.majeur ? 'on' : ''}" data-a="majeur" aria-pressed="${S.majeur}"><span class="case">${ic('ok')}</span>J’ai plus de 18 ans</button>` : ''}
      <button class="btn pri gros" data-a="valider">Valider · ${eur(t)}</button>
      ${alc && !S.majeur ? '<p class="aide">Votre commande contient de l’alcool : confirmez votre âge.</p>' : ''}`;
  }
  const zoneZones = () => zones().map((z, i) => `<button class="zone-t ${S.zone === z.id ? 'on' : ''}" data-a="choixZone" data-z="${esc(z.id)}" style="--i:${i}"><i>${esc(z.e || '📍')}</i><b>${esc(z.nom)}</b><small>${esc(z.sous || (z.n ? 'Numéro 1 à ' + z.n : ''))}</small></button>`).join('');
  function zoneNumeros() {
    const z = zoneChoisie();
    if (!z) return '';
    if (!z.n) return `<p class="ou-servi">${ic('info')} ${z.retrait ? `On vous appelle au comptoir : « ${esc(S.nom)} ».` : `Nous vous l’apportons : ${esc(z.nom)}.`}</p>`;
    const pres = z.id === 'piste' ? pistes() : [];          // tablette de piste : ses pistes sont repérées
    return `<p class="opt-t">${esc(z.nom.split(' ')[0])} n°</p><div class="nums" style="--cols:${z.n > 12 ? 5 : 4}">${Array.from({ length: z.n }, (_, i) => i + 1).map(n => `<button class="num ${S.num === n ? 'on' : ''} ${pres.includes(String(n)) ? 'pres' : ''}" data-a="numero" data-n="${n}">${n}</button>`).join('')}</div>`;
  }
  const zoneCode = () => Array.from({ length: 6 }, (_, i) => `<span class="${S.code.length === i ? 'cur' : ''}">${S.code[i] || ''}</span>`).join('');
  const zoneOuPied = () => { const z = zoneChoisie(), ok = z && (!z.n || S.num); return `<button class="btn sec" data-a="aller" data-e="recap">${ic('retour')} Retour</button><button class="btn pri" data-a="ouOk" ${ok ? '' : 'disabled'}>Continuer ${ic('suite')}</button>`; };
  const zonePartie = () => S.reste.map((l, i) => { const s = S.sel[l.k] || 0;
    return ligneHtml(l, i, `<div class="pas"><button data-a="ps" data-k="${esc(l.k)}" data-d="-1" ${s ? '' : 'disabled'} aria-label="Un de moins">${ic('moins')}</button><b>${s}<small>/${l.q}</small></b><button data-a="ps" data-k="${esc(l.k)}" data-d="1" ${s < l.q ? '' : 'disabled'} aria-label="Un de plus">${ic('plus')}</button></div>`, s * l.pu); }).join('');
  const selection = () => S.reste.filter(l => S.sel[l.k]).map(l => Object.assign({}, l, { q: S.sel[l.k] }));
  function zonePartiePied() {
    const m = total(selection());
    return `<div class="rp-tot"><small>Ce paiement</small><b>${eur(m)}</b></div><div class="rangee"><button class="btn sec" data-a="aller" data-e="regler">${ic('retour')} Retour</button><button class="btn pri" data-a="partieOk" ${m ? '' : 'disabled'}>Continuer ${ic('suite')}</button></div>`;
  }
  /* écran « Ticket CE » : les tickets acceptés, ce qu'ils couvrent, ce qui restera à payer */
  const valeurCe = () => arrondi(S.ce.codes.reduce((n, x) => n + x.valeur, 0));
  const zoneCodesCe = () => S.ce.codes.map((r, i) => `<div class="remise">${ic('ticket')}<span>${esc(r.contenu)}<small>${esc(r.code)}</small></span><b>− ${eur(r.valeur)}</b><button data-a="ceRetirer" data-i="${i}" aria-label="Retirer ce ticket">${ic('croix')}</button></div>`).join('');
  function zonePiedCe() {
    const m = total(S.aPayer), v = valeurCe(), reste = arrondi(Math.max(0, m - v));
    return `${v ? `<div class="rp-l vert"><span>Ticket${S.ce.codes.length > 1 ? 's' : ''} CE</span><span>− ${eur(Math.min(v, m))}</span></div>` : ''}${v > m ? `<p class="ce-plus">La valeur des tickets dépasse le montant : la différence n’est pas rendue.</p>` : ''}
      <div class="rp-tot"><small>${v ? (reste ? 'Reste à payer ensuite' : 'Tout est couvert') : 'À payer'}</small><b>${eur(v ? reste : m)}</b></div>
      <div class="rangee"><button class="btn sec" data-a="ceRetour">${ic('retour')} Retour</button><button class="btn pri" data-a="ceValider" ${v ? '' : 'disabled'}>${v > 0 && S.ce.codes.length > 1 ? 'Valider les tickets' : v ? 'Valider le ticket' : 'Valider'} ${ic('suite')}</button></div>`;
  }
  const majCe = () => { zone('ceCodes', zoneCodesCe()); zone('cePied', zonePiedCe()); };
  const choixMoyens = () => moyens().map((x, i) => x === 'Ticket CE' ? `<button class="gchoix g-ce" data-a="moyen" data-m="${x}" style="--i:${i}">${ic('ticket', 'xl')}<span><b>Ticket CE ou code promo</b><small>Scannez son QR code ou tapez-le</small></span></button>` : `<button class="gchoix" data-a="moyen" data-m="${x}" style="--i:${i}">${ic(x === 'Carte' ? 'carte' : 'billets', 'xl')}<b>${x === 'Carte' ? 'Carte bancaire' : 'Espèces'}</b><small>${x === 'Carte' ? (MOBILE ? 'Paiement en ligne' : 'Sans contact ou insérée') : cashdro() ? 'Billets et pièces, monnaie rendue' : 'À payer sur une grande borne, au comptoir'}</small></button>`).join('');
  const svgTpe = m => `<svg class="tpe" viewBox="0 0 200 250" aria-hidden="true"><g class="ondes"><path d="M150 46a22 22 0 010 30"/><path d="M162 36a38 38 0 010 50"/><path d="M174 26a54 54 0 010 70"/></g>
    <rect class="corps" x="38" y="70" width="112" height="176" rx="16"/><rect class="ecr" x="52" y="84" width="84" height="54" rx="6"/><text x="94" y="117" text-anchor="middle">${eur(m)}</text>
    ${[0, 1, 2, 3].map(r => [0, 1, 2].map(c => `<circle class="touche" cx="${68 + c * 26}" cy="${162 + r * 21}" r="7.5"/>`).join('')).join('')}
    <g class="carte"><rect x="58" y="0" width="76" height="50" rx="7" fill="#d9272e"/><rect x="68" y="12" width="15" height="12" rx="2" fill="#f5c542"/><path d="M68 38h40" stroke="#fff" stroke-width="3" opacity=".6"/></g></svg>`;
  const confettis = () => Array.from({ length: 70 }, () => `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 1.2).toFixed(2)}s;--t:${(2.4 + Math.random() * 2).toFixed(2)}s;--r:${Math.round(Math.random() * 900 - 450)}deg;--c:${['#00aee0', '#d9272e', '#fffdf9', '#f5c542', '#7fd4f2'][Math.floor(Math.random() * 5)]}"></i>`).join('');
  function messagesVeille() {
    const M = (S.conf && S.conf.modules) || [], b = ((S.conf || {}).diffusion || {}).bandeau;
    const L = M.map(m => m.act === 'bar' && estTablette() ? 'Commandez à boire sans quitter votre piste' : MSG_ACT[m.act]).filter(Boolean);
    if (b) L.push(b);
    return (L.length ? L : ['Bienvenue au Space Bowling']).map(m => m.replace(/ ([?!:;])/g, '\u00a0$1'));      // « Laser Game ? » : le point d'interrogation ne passe pas seul à la ligne
  }

  /* ------------------------------------------------------------------ Bowling : outils */
  /* nombre de joueurs : bornes réglées dans le CRM (Module borne › Joueurs et formule) */
  const bornesBw = () => { const a = Math.max(1, +TX('bw-formule', 'joueursMin', null, 'bowling') || 1); return [a, Math.max(a, +TX('bw-formule', 'joueursMax', null, 'bowling') || 24)]; };
  const delaiMerci = () => { const act = S.cmd && (S.cmd.act || S.module); return perso(act) ? +TX('merci', 'delai', null, act) || 15 : 15; };
  const partiesDe = nom => { const m = String(nom).match(/(\d+)\s*\+\s*(\d+)/); if (m) return +m[1] + +m[2]; const k = String(nom).match(/(\d+)/); return k ? +k[1] : 1; };
  const tarifBot = nom => /\d\s*\+\s*\d/.test(nom) ? String(nom).replace(/\s+/g, '') : String(partiesDe(nom));   // boutons du bot : 1 / 2 / 3 / 2+1
  const formuleChoisie = () => (S.tarifs || []).find(f => f.nom === S.bw.formule);
  const nomJoueur = (j, i) => (j.prenom || '').trim() || 'Joueur ' + (i + 1);
  /* réservation : son prix total réparti au centime près entre les joueurs */
  const parts = (t, n) => { const c = Math.round(t * 100), b = Math.floor(c / n); return Array.from({ length: n }, (_, i) => (b + (i < c - b * n ? 1 : 0)) / 100); };
  function lignesBowling() {
    const f = formuleChoisie(), R = S.bw.resa, P = R ? parts(R.total, S.bw.joueurs.length) : null;
    return S.bw.joueurs.map((j, i) => ({ k: 'j' + i, id: 'j' + i, base: nomJoueur(j, i), nom: nomJoueur(j, i) + ' · ' + S.bw.formule, q: 1, pu: P ? P[i] : f ? f.unitaire : 0, tva: 20,
      opts: j.barrieres ? [{ g: 'Barrières', nom: 'Barrières', prix: 0 }] : [], p: { cat: 'bowling', e: '🎳', plu: 'BOWL-' + tarifBot(S.bw.formule) } }));
  }
  const tailles = () => SB.moteur.repartirPistes(S.bw.joueurs.length, SB.moteur.capPiste(SB.etat()));   // 8 joueurs → [4, 4]
  const acompteBw = () => S.bw.resa ? S.bw.resa.paye : 0;                     // déjà payé en ligne
  /* l'acompte payé en ligne couvre les joueurs dans l'ordre : il ne reste à payer que la part non couverte */
  function resteBowling() { let r = acompteBw(); return lignesBowling().map(l => { const x = Math.min(l.pu, r); r = arrondi(r - x); return Object.assign({}, l, { pu: arrondi(l.pu - x) }); }).filter(l => l.pu > 0); }
  const quillesHtml = (n, neuf) => { let i = 0; const T = SB.moteur.repartirPistes(n, SB.moteur.capPiste(SB.etat()));
    return T.map((t, k) => `<div class="piste-b">${Array.from({ length: t }, () => { i++; return `<svg class="${neuf && i === n ? 'neuf' : ''}" viewBox="0 0 40 100" aria-hidden="true">${QUILLE}</svg>`; }).join('')}${T.length > 1 ? `<small>Piste ${k + 1}</small>` : ''}</div>`).join(''); };
  const zoneJoueurs = () => { const T = tailles(), debuts = T.map((_, k) => T.slice(0, k).reduce((a, b) => a + b, 0));   // premier joueur de chaque piste
    return S.bw.joueurs.map((j, i) => (T.length > 1 && debuts.includes(i) ? `<p class="piste-t">${ic('barriere')}Piste ${debuts.indexOf(i) + 1} · ${T[debuts.indexOf(i)]} joueurs</p>` : '') + `<div class="joueur ${j.neuf ? 'neuf' : ''}" style="--i:${i}"><span class="j-num">${i + 1}</span>
    <input data-f="prenom" data-i="${i}" value="${esc(j.prenom)}" maxlength="16" placeholder="${esc(TX('bw-joueurs', 'prenomAide', { n: i + 1 }, 'bowling'))}" autocomplete="off" enterkeyhint="next">
    ${TX('bw-joueurs', 'barrieres', null, 'bowling') ? `<button class="barr ${j.barrieres ? 'on' : ''}" data-a="bwBarr" data-i="${i}" aria-pressed="${j.barrieres}">${ic('barriere')}${esc(TX('bw-joueurs', 'barrieresBouton', null, 'bowling'))}</button>` : ''}
    ${S.bw.resa ? '' : `<button class="j-x" data-a="bwSuppr" data-i="${i}" aria-label="Retirer le joueur ${i + 1}" ${S.bw.joueurs.length <= bornesBw()[0] ? 'disabled' : ''}>${ic('croix')}</button>`}</div>`).join(''); };
  function zonePiedJ() {
    const f = formuleChoisie(), n = S.bw.joueurs.length, t = total(lignesBowling());
    return `<div class="rp-tot"><small>${S.bw.resa ? n + ' joueurs · réservation' : n + ' × ' + eur(f ? f.unitaire : 0)}</small><b data-total="${t}">${eur(t)}</b></div>
      <div class="rangee"><button class="btn sec" data-a="aller" data-e="${S.bw.resa ? 'accueil' : 'bw-formule'}">${ic('retour')} Retour</button><button class="btn pri" data-a="bwJoueursOk">Continuer ${ic('suite')}</button></div>`;
  }
  function zonePiedR() {
    const t = total(lignesBowling()), ac = acompteBw(), du = arrondi(t - ac);
    return `${ac ? `<div class="rp-l"><span>Sous-total</span><span>${eur(t)}</span></div><div class="rp-l vert"><span>Acompte payé en ligne</span><span>− ${eur(ac)}</span></div>` : ''}
      <div class="rp-tot"><small>${du ? 'Total à payer' : 'Tout est couvert'}</small><b data-total="${du}">${eur(du)}</b></div>
      <div class="rangee"><button class="btn sec" data-a="aller" data-e="bw-joueurs">${ic('retour')} Retour</button><button class="btn pri" data-a="bwValider">${du ? 'Payer ' + eur(du) : 'Valider'} ${ic('suite')}</button></div>`;
  }
  function majBwN(ajoute) {
    const n = S.bw.joueurs.length;
    S.tarifs = SB.api.tarifs('bowling', n);                               // un prix peut dépendre du nombre de joueurs (règles du CRM)
    const b = $('[data-bwn]'); if (b) { b.textContent = n; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    const [mi, ma] = bornesBw(); $$('[data-a="bwN"]').forEach(x => { x.disabled = +x.dataset.d < 0 ? n <= mi : n >= ma; });
    zone('bwQuilles', quillesHtml(n, ajoute));
    S.tarifs.forEach(f => {
      const pu = $(`[data-fpu="${CSS.escape(f.nom)}"]`), tt = $(`[data-ftot="${CSS.escape(f.nom)}"]`);
      if (pu) pu.textContent = eur(f.unitaire) + ' / joueur';
      if (tt) { compter(tt, +tt.dataset.v || 0, f.total); tt.dataset.v = f.total; }
    });
  }

  /* ------------------------------------------------------------------ Mises à jour partielles */
  function majPanier() {
    const avant = +(($('[data-total]') || {}).dataset || {}).total || 0, nAvant = ($('[data-n]') || {}).textContent;
    zone('panier', zonePanier());
    const b = $('[data-total]'), n = $('[data-n]');
    if (b) compter(b, avant, +b.dataset.total);
    if (n && n.textContent !== nAvant) n.classList.add('pop');
    $$('[data-q]').forEach(x => { const n = String(qte(x.dataset.q) || ''); if (n !== x.textContent) { x.textContent = n; x.classList.remove('pop'); void x.offsetWidth; x.classList.add('pop'); } });
  }
  function majBar() {
    const rail = $('.rail');
    if (S.rub && rail) {
      rail.querySelectorAll('[data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === S.rub));
      const c = $('.contenu'); c.innerHTML = zoneContenu(); c.scrollTop = 0; majFleche();
      const on = rail.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else $('[data-zone-bar]').innerHTML = zoneBar();
    majFleche();
  }
  const defileur = () => $('.contenu .sousgrille') || $('.contenu');
  /* la marge du bas ne compte pas : la flèche n'apparaît que s'il reste vraiment des cartes cachées */
  function majFleche() { const f = $('.plus-bas'), sc = defileur(); if (f && sc) f.classList.toggle('on', sc.scrollHeight - sc.scrollTop - sc.clientHeight > (parseFloat(getComputedStyle(sc).paddingBottom) || 0) + 8); }
  function majRecap() { zone('lignes', zoneLignes()); zone('recapPied', zoneRecapPied()); }
  function majOu() { zone('zones', zoneZones()); zone('numeros', zoneNumeros()); zone('ouPied', zoneOuPied()); }
  const insister = el => { if (!el) return; el.classList.remove('requis'); void el.offsetWidth; el.classList.add('requis'); };
  function compter(el, de, a) {
    if (de === a) return;
    const t0 = performance.now();
    (function f(t) { const k = Math.min(1, (t - t0) / 450), v = de + (a - de) * (1 - Math.pow(1 - k, 3)); el.textContent = eur(v); if (k < 1) requestAnimationFrame(f); })(t0);
    setTimeout(() => { el.textContent = eur(a); }, 500);          // écran en veille du navigateur : les images par seconde s'arrêtent, le bon total s'affiche quand même
  }
  /* l'article « vole » jusqu'au total du panier */
  function vol(depuis) {
    const cible = $('[data-cible]'), cadre = $('#borne');
    if (!depuis || !cible) return;
    const B = cadre.getBoundingClientRect(), a = depuis.getBoundingClientRect(), b = cible.getBoundingClientRect(), taille = Math.min(a.width, a.height);
    const c = depuis.cloneNode(true);
    c.classList.add('volant');
    Object.assign(c.style, { left: a.left - B.left + (a.width - taille) / 2 + 'px', top: a.top - B.top + (a.height - taille) / 2 + 'px', width: taille + 'px', height: taille + 'px' });
    cadre.appendChild(c);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    c.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx * .45}px,${dy * .35 - taille * .4}px) scale(.5)`, offset: .45 }, { transform: `translate(${dx}px,${dy}px) scale(.1)`, opacity: .5 }], { duration: 700, easing: 'cubic-bezier(.45,0,.55,1)' })
      .onfinish = () => { c.remove(); const t = $('[data-cible]'); if (t) { t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); } };
  }
  function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; $('#borne').appendChild(el); setTimeout(() => el.remove(), 2700); }

  /* ------------------------------------------------------------------ Fenêtres */
  function ouvrirModale(html, cls, fond) {
    const c = $('#couche');
    c.innerHTML = `<div class="voile ${cls || ''}" data-a="${fond || 'fermer'}">${html}</div>`;
    c.classList.add('actif');
    requestAnimationFrame(() => requestAnimationFrame(() => { if (c.firstElementChild) c.firstElementChild.classList.add('ouvert'); }));
  }
  function fermerModale(net) {
    const c = $('#couche'), v = c.firstElementChild;
    c.classList.remove('actif');
    if (!v) return;
    if (net) { c.innerHTML = ''; return; }
    v.classList.remove('ouvert');
    setTimeout(() => { if (c.firstElementChild === v) c.innerHTML = ''; }, 300);
  }
  const modaleOuverte = () => $('#couche').classList.contains('actif');
  function confirmer(titre, texte, non, oui, siOui) {
    S.siOui = siOui;
    ouvrirModale(`<div class="feuille petite" role="alertdialog" aria-label="${esc(titre)}"><h2>${esc(titre)}</h2><p>${texte}</p><div class="rangee"><button class="btn sec" data-a="fermer">${esc(non)}</button><button class="btn pri" data-a="oui">${esc(oui)}</button></div></div>`, 'mid');
  }
  function modaleProduit(p) {
    const A = p.allergenes || [];
    return `<div class="feuille" role="dialog" aria-modal="true" aria-label="${esc(p.nom)}"><button class="f-x" data-a="fermer" aria-label="Fermer">${ic('croix')}</button>${vis(p, coul(p.cat), 'f-vis')}
      <div class="f-txt"><h2>${esc(p.nom)}</h2><p class="f-px">${eur(p.prix)}</p>${p.desc ? `<p class="f-desc">${esc(p.desc)}</p>` : ''}
        ${A.length ? `<div class="allg"><span>Allergènes</span>${A.map(a => `<em>${esc(a)}</em>`).join('')}</div>` : '<p class="f-note">Aucun allergène majeur déclaré.</p>'}
        ${p.alcool ? `<p class="alc">${ic('info')} Contient de l’alcool : vente interdite aux moins de 18 ans.</p>` : ''}${groupesHtml(p)}</div>
      <div class="f-bas"><div class="pas"><button data-a="fq" data-d="-1" aria-label="Un de moins">${ic('moins')}</button><b data-fq>${S.fq}</b><button data-a="fq" data-d="1" aria-label="Un de plus">${ic('plus')}</button></div>
        <button class="btn pri grow" data-a="ajouter" data-id="${p.id}" ${manque(p).length ? 'disabled' : ''}>Ajouter au panier<span data-fpx>${prixBouton(p)}</span></button></div></div>`;
  }
  const choixHtml = (gi, ci, nom, prix) => `<button class="opt ${S.choix[gi] === ci ? 'on' : ''}" data-a="opt" data-g="${gi}" data-c="${ci}" aria-pressed="${S.choix[gi] === ci}">${esc(nom)}${+prix ? `<small>+ ${eur(prix)}</small>` : ''}</button>`;
  const groupesHtml = p => optionsDe(p).map((g, gi) => `<div class="opt-g"><p class="opt-t">${esc(g.nom)}<span class="${g.obligatoire ? 'obl' : ''}">${g.obligatoire ? 'obligatoire' : 'facultatif'}</span></p><div class="opt-c">${g.obligatoire ? '' : choixHtml(gi, -1, 'Aucune', 0)}${g.choix.map((c, ci) => choixHtml(gi, ci, c.nom, c.prix)).join('')}</div></div>`).join('');
  const prixBouton = p => { const m = manque(p); return m.length ? 'Choisissez : ' + m.join(', ') : eur(prixAvec(p) * S.fq); };
  /* « + » sur un article à options : on demande juste le choix ; avec une seule option, toucher un choix suffit */
  const modaleOptions = p => `<div class="feuille petite rapide" role="dialog" aria-label="${esc(p.nom)}"><div class="rp-tete">${vis(p, coul(p.cat))}<div><h2>${esc(p.nom)}</h2><p class="f-px">${eur(p.prix)}</p></div></div>${groupesHtml(p)}
    <div class="rangee"><button class="btn sec" data-a="fermer">Annuler</button><button class="btn pri" data-a="ajouter" data-id="${p.id}" ${manque(p).length ? 'disabled' : ''}>Ajouter <span data-fpx>${manque(p).length ? '' : eur(prixAvec(p))}</span></button></div></div>`;
  function majOptions() {
    const p = S.optP; if (!p) return;
    $$('#couche .opt').forEach(b => { const on = S.choix[+b.dataset.g] === +b.dataset.c; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    const b = $('#couche [data-a="ajouter"]'), x = $('#couche [data-fpx]'), m = manque(p).length;
    if (b) b.disabled = !!m;
    if (x) x.textContent = $('#couche .rapide') ? (m ? '' : eur(prixAvec(p))) : prixBouton(p);
  }
  /* ---- Ventes additionnelles (règles du CRM, Bar › Sur les bornes) ---- */
  function offres() {
    const L = lignes(), dans = id => S.panier.some(l => l.id === id);
    const touche = si => L.some(l => si.startsWith('p:') ? l.id === si.slice(2) : si.startsWith('c:') ? l.p.cat === si.slice(2) : l.p.cat + '/' + l.p.sous === si.slice(2));
    return CAT.upsells.filter(u => !S.vus.has(u.id) && touche(u.si)).map(u => {
      const props = u.propose.map(prod).filter(p => p && dispo(p) && !dans(p.id) && !obligatoire(p));
      if (u.mode === 'remplacer') { const a = u.si.startsWith('p:') && prod(u.si.slice(2)); return a && props[0] ? { u, mode: 'remplacer', a, b: props[0], q: qte(a.id) } : null; }
      return props.length ? { u, mode: 'ajouter', props: props.slice(0, 3) } : null;
    }).filter(Boolean).slice(0, 2);
  }
  function modaleOffre(o) {
    if (o.mode === 'remplacer') {
      const d = (o.b.prix - o.a.prix) * o.q;
      return `<div class="feuille offre" role="dialog" aria-label="${esc(o.u.titre)}"><span class="o-tag">Petit conseil</span><h2>${esc(o.u.titre)}</h2>
        <div class="o-swap"><div class="o-mini">${vis(o.a, coul(o.a.cat))}<b>${o.q} × ${esc(o.a.nom)}</b></div><span class="o-fl">${ic('suite')}</span><div class="o-mini apres">${vis(o.b, coul(o.b.cat))}<b>${o.q} × ${esc(o.b.nom)}</b></div></div>
        <p class="o-px">${d >= 0 ? '+ ' + eur(d) + ' seulement' : eur(-d) + ' de moins'}</p>
        <div class="rangee"><button class="btn sec" data-a="upNon">Non merci</button><button class="btn pri" data-a="upOui">Oui, je change</button></div></div>`;
    }
    return `<div class="feuille offre" role="dialog" aria-label="${esc(o.u.titre)}"><span class="o-tag">Ça irait bien avec</span><h2>${esc(o.u.titre)}</h2>
      <div class="o-props n${o.props.length}">${o.props.map((p, i) => { const pris = S.ajoutes.has(p.id); return `<div class="o-prop ${pris ? 'pris' : ''}" style="--i:${i}">${vis(p, coul(p.cat))}<b>${esc(p.nom)}</b><span class="px">${eur(p.prix)}</span><button class="btn pri" data-a="upAjout" data-id="${p.id}" ${pris ? 'disabled' : ''}>${pris ? ic('ok') + ' Ajouté' : ic('plus') + ' Ajouter'}</button></div>`; }).join('')}</div>
      <button class="btn ${S.ajoutes.size ? 'pri' : 'sec'} gros" data-a="upNon">${S.ajoutes.size ? 'Continuer ' + ic('suite') : 'Non merci, continuer'}</button></div>`;
  }
  function offreSuivante() {
    const o = S.file.shift();
    if (!o) { fermerModale(); return aller('recap'); }
    S.vus.add(o.u.id); S.offre = o; S.ajoutes = new Set();
    ouvrirModale(modaleOffre(o), 'mid', 'upNon');
  }

  /* Réservation (site web, comptoir) pas encore soldée : on reprend au récapitulatif bowling, prénoms et barrières déjà remplis */
  function ouvrirResa(R) {
    S.module = 'bowling'; S.cmd = null; S.lignesCmd = null;
    S.bw = { resa: R, formule: R.formule, groupe: R.nom,
      joueurs: Array.from({ length: R.pers }, (_, i) => ({ prenom: (R.joueurs[i] || {}).prenom || '', barrieres: !!(R.joueurs[i] || {}).barrieres })) };
    aller(S.bw.groupe && S.bw.joueurs.every(j => j.prenom.trim()) ? 'bw-recap' : 'bw-joueurs');   // prénoms manquants : on les demande d'abord
  }

  /* ------------------------------------------------------------------ Module de réservation
     Tout vient du module de l'activité (CRM › Sandbox › Module borne) : étapes et ordre, textes, règles (délai, horizon,
     acompte), options, tranches d'âge. Créneaux : Générateur de créneaux, canal « Bornes ». La place est gardée dès « Payer ». */
  const COUL_AN = ['#ff3d7f', '#7c4dff', '#ffb300', '#00c2a8', '#ff7043', '#29b6f6'];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const hAff = h => { const [H, M] = String(h || '').split(':').map(Number); return isNaN(H) ? String(h || '') : String(H % 24).padStart(2, '0') + ':' + String(M || 0).padStart(2, '0'); };
  const dateDe = iso => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const dateRs = iso => dateDe(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const rsC = () => S.rsConf || { etapes: [], regles: {}, tranches: [], options: [], formules: [] };
  const festif = () => TX('theme', 'style') === 'festif';
  const couleurRs = i => festif() ? COUL_AN[i % COUL_AN.length] : 'var(--r1)';
  const infosActives = () => ['groupe', 'prenoms', 'enfant', 'contact'].some(k => TX('rs-infos', k)) || (TX('rs-infos', 'nombre') && !rsC().etapes.includes('rs-nombre'));
  /* les étapes du CRM, sans celles qui n'ont rien à montrer (pas de tranche, pas d'option, aucune information demandée) */
  const etapesRs = () => rsC().etapes.filter(e => !(e === 'rs-salle' && !rsC().choixSalle) && !(e === 'rs-age' && !rsC().tranches.length) && !(e === 'rs-options' && !rsC().options.length) && !(e === 'rs-infos' && !infosActives()));
  const suivantRs = e => { const L = etapesRs(); return L[L.indexOf(e) + 1]; };
  const precedentRs = e => { const L = etapesRs(); return L[L.indexOf(e) - 1]; };
  const formulesTranche = t => rsC().formules.filter(f => !f.tranches.length || f.tranches.includes(t));
  const pourSalle = (f, id) => !(f.salles || []).length || f.salles.includes(id);
  const formulesRs = () => (etapesRs().includes('rs-age') && S.rs.tranche ? formulesTranche(S.rs.tranche) : rsC().formules).filter(f => !S.rs.salle || pourSalle(f, S.rs.salle));
  const formuleRs = () => rsC().formules.find(f => f.nom === S.rs.formule);
  const trancheRs = () => rsC().tranches.find(t => t.id === S.rs.tranche);
  const jourRs = () => (S.rsJours || []).find(x => x.j === S.rs.j);
  const heureRs = () => { const J = jourRs(); return J && J.heures.find(x => x.h === S.rs.h); };
  const uniteRs = () => TX('rs-nombre', 'unite') || 'personnes';
  const singulier = u => String(u).replace(/s$/, '');
  const unitePrixRs = () => { const f = formuleRs() || {}; return f.parPers ? '/ ' + singulier(uniteRs()) : esc(f.unite || ''); };
  /* participants : ceux de la formule (Tarifs), sinon ceux du module ; jamais plus que la plus grande salle (un groupe = une salle) */
  const salleRs = () => (rsC().salles || []).find(x => x.id === S.rs.salle);
  const bornesNbRs = () => { const P = (formuleRs() || {}).participants, cap = (salleRs() || {}).cap || rsC().capMax || 999;     // salle choisie : sa capacité
    const [a, b] = P && (P[0] || P[1]) ? [P[0] || 1, Math.max(P[0] || 1, P[1] || 99)] : [Math.max(1, +TX('rs-nombre', 'min') || 1), +TX('rs-nombre', 'max') || 20];
    return [a, Math.max(a, Math.min(b, cap))]; };
  const emojiRs = () => EMOJI_ACT[S.rs.act] || emojiNom(rsC().nom) || EMOJI_MODELE[rsC().modele] || '🎉';
  const enteteRs = (e, dyn) => entete(rsC().nom, TX(e, 'entete2') || dyn || '');
  const titreRs = () => (S.rs.enfant.prenom || S.rs.groupe || S.rs.contact.nom || S.rs.formule || '').trim();
  const dureeTxt = m => !m ? '' : m < 60 ? m + ' min' : Math.floor(m / 60) + 'h' + (m % 60 ? String(m % 60).padStart(2, '0') : '');
  /* la carte d'une formule : photo du CRM (sinon un dégradé et son icône), badge, âges, contenu, durée, participants, prix */
  const carteFormule = (f, i) => { const d = TX('rs-formule', 'details'); return `<button class="an-f ${f.img ? 'photo' : ''}" data-a="rsFormule" data-f="${esc(f.nom)}" style="--i:${i};--c:${couleurRs(i * 2 + 1)}">
    ${f.img ? `<span class="an-f-img"><img src="${esc(src(f.img))}" alt="" draggable="false"></span>` : ''}<i class="an-f-e" aria-hidden="true">${esc(f.emoji) || emojiForm(f.nom)}</i>
    <span class="an-f-tags">${f.badge ? `<span class="an-badge">⭐ ${esc(f.badge)}</span>` : ''}${(f.salles || []).length && !rsC().choixSalle ? `<span class="an-f-age">${esc(rsC().salles.filter(x => f.salles.includes(x.id)).map(x => x.nom).join(', '))}</span>` : ''}${f.ages ? `<span class="an-f-age">${f.ages[0]} à ${f.ages[1]} ans</span>` : ''}</span>
    <b>${esc(f.nom)}</b>${d && f.contenu.length ? `<ul>${f.contenu.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    ${d ? `<span class="an-f-meta">${f.duree ? `<span>⏱ ${dureeTxt(f.duree)}</span>` : ''}${f.participants ? `<span>👥 ${f.participants[0]} à ${f.participants[1]} ${esc(uniteRs())}</span>` : ''}</span>` : ''}
    <span class="an-f-prix"><small>À partir de</small><b>${eur(f.apartir)}</b><small>${esc((f.unite || '').replace(/^par /, '/ '))}</small></span>
    ${f.tarifs.length > 1 ? `<span class="an-f-tarifs">${f.tarifs.map(t => eur(t.prix) + ' ' + esc(t.quand)).join(' · ')}</span>` : ''}</button>`; };
  const emojiForm = n => /laser/i.test(n) ? '🎯' : /quiz|box/i.test(n) ? '🥊' : /karaok/i.test(n) ? '🎤' : /bowling/i.test(n) ? '🎳' : /billard/i.test(n) ? '🎱' : emojiRs();
  const emojiOpt = (o, c) => /choco/i.test(c) ? '🍫' : /sucre/i.test(c) ? '🍩' : /fraise/i.test(c) ? '🍓' : /donut/i.test(o) ? '🍩' : /g[âa]teau/i.test(o) ? '🎂' : '🎁';
  const emojiQte = o => /champ|cidre|vin|bouteille/i.test(o.nom + ' ' + (o.unite || '')) ? '🍾' : /soda|boisson|jus|coca|verre/i.test(o.nom) ? '🥤' : /pizza/i.test(o.nom) ? '🍕' : /bonbon/i.test(o.nom) ? '🍬' : '🎁';
  const ballons = () => festif() ? `<div class="ballons" aria-hidden="true">${COUL_AN.map((c, i) => `<i class="ballon" style="--c:${c};--x:${4 + i * 16}%;--t:${15 + (i % 3) * 4}s;--d:-${(i * 3.1).toFixed(1)}s"></i>`).join('')}</div>` : '';
  const etapeRs = e => { const L = etapesRs(), k = L.indexOf(e); return `<div class="an-etapes" aria-label="Étape ${k + 1} sur ${L.length}">${L.map((x, i) => `<i class="${i < k ? 'ok' : i === k ? 'on' : ''}" style="--c:${festif() ? COUL_AN[i % COUL_AN.length] : 'var(--r1)'}"></i>`).join('')}</div>`; };
  const piedRs = (e, ok) => `<button class="btn sec" data-a="rsPrec" data-e="${e}">${ic('retour')} Retour</button><button class="btn pri" data-a="rsSuite" data-e="${e}" ${ok ? '' : 'disabled'}>Continuer ${ic('suite')}</button>`;
  /* âge : à une date donnée ; âge fêté : celui de l'anniversaire le plus proche de la fête (dans les 6 mois qui suivent, on fête le prochain) */
  const ageA = (n, d) => { const [y, m, j] = n.split('-').map(Number); return d.getFullYear() - y - (d.getMonth() + 1 < m || (d.getMonth() + 1 === m && d.getDate() < j) ? 1 : 0); };
  const ageFete = (n, iso) => { const d = dateDe(iso), [, m, j] = n.split('-').map(Number), p = new Date(d.getFullYear(), m - 1, j); if (p <= d) p.setFullYear(d.getFullYear() + 1); return ageA(n, d) + ((p - d) / 864e5 <= 183 ? 1 : 0); };
  const optionsRs = () => !etapesRs().includes('rs-options') ? [] : rsC().options.map(o => o.type === 'choix'
    ? (S.rs.choix[o.id] >= 0 ? { nom: o.nom, choix: o.choix[S.rs.choix[o.id]], prix: 0 } : null)
    : (S.rs.qte[o.id] ? { nom: o.nom, q: S.rs.qte[o.id], prix: +o.prix || 0, unite: o.unite } : null)).filter(Boolean);
  /* montants affichés (le serveur recalcule tout à la commande) : base, options, total, acompte, ce qui reste à payer maintenant */
  const totalRs = () => { const H = heureRs(), f = formuleRs() || {}, base = arrondi((H ? H.prix : 0) * (f.parPers ? S.rs.nb : 1)), total = arrondi(base + optionsRs().reduce((n, o) => n + (o.q || 0) * o.prix, 0)), R = rsC().regles;
    const acompte = R.paiement === 'acompte' ? Math.min(R.acompte || 0, total) : 0;
    return { base, total, acompte, du: acompte || total }; };
  /* calendrier mois par mois (‹ Octobre 2026 ›) : il s'ouvre sur le mois du jour choisi, sinon sur le premier mois qui a de la place ;
     jours réservables en couleur, complets en gris, hors de la période réservable estompés */
  const moisRs = () => [...new Set((S.rsJours || []).map(x => x.iso.slice(0, 7)))];
  function calendrierRs() {
    const J = S.rsJours, M = moisRs(), m = M.includes(S.rs.mois) ? S.rs.mois : (jourRs() || J.find(x => x.heures.length) || J[0]).iso.slice(0, 7), k = M.indexOf(m);
    const [y, mo] = m.split('-').map(Number), d1 = new Date(y, mo - 1, 1), cases = Array.from({ length: (d1.getDay() + 6) % 7 }, () => '<span></span>');
    for (let n = 1, fin = new Date(y, mo, 0).getDate(); n <= fin; n++) { const x = J.find(z => z.iso === m + '-' + String(n).padStart(2, '0'));
      cases.push(x && x.heures.length ? `<button class="an-j dispo ${S.rs.j === x.j ? 'on' : ''}" data-a="rsJour" data-j="${x.j}" style="--i:${n}">${n}</button>` : `<span class="an-j ${x ? '' : 'hors'}">${n}</span>`); }
    return `<div class="an-cal"><div class="an-mois"><button class="rond" data-a="rsMois" data-d="-1" aria-label="Mois précédent" ${k > 0 ? '' : 'disabled'}>${ic('retour')}</button><b>${esc(cap(d1.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })))}</b><button class="rond" data-a="rsMois" data-d="1" aria-label="Mois suivant" ${k < M.length - 1 ? '' : 'disabled'}>${ic('suite')}</button></div>
      <div class="an-grille">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(j => `<span class="jsem">${j}</span>`).join('')}${cases.join('')}</div></div>`;
  }
  const zoneHeuresRs = () => { const J = jourRs(); if (!J) return '<p class="an-vide">Touchez un jour en couleur pour voir les heures.</p>';
    return `<p class="an-jour">${esc(cap(dateRs(J.iso)))}</p><div class="an-heures">${J.heures.map((x, i) => `<button class="an-h ${S.rs.h === x.h ? 'on' : ''}" data-a="rsHeure" data-h="${x.h}" style="--i:${i};--c:${couleurRs(i)}"><b>${hAff(x.h)}</b>${TX('rs-date', 'prix') ? `<small>${eur(x.prix)} ${unitePrixRs()}</small>` : ''}${TX('rs-date', 'places') && x.reste === 1 ? '<em>Dernière place</em>' : ''}</button>`).join('')}</div>`; };
  const qteRs = o => { const n = S.rs.qte[o.id] || 0; return `<div class="an-qte"><button class="rond" data-a="rsQte" data-o="${esc(o.id)}" data-d="-1" aria-label="Une de moins" ${n ? '' : 'disabled'}>${ic('moins')}</button><b>${n}</b><button class="rond" data-a="rsQte" data-o="${esc(o.id)}" data-d="1" aria-label="Une de plus" ${n >= +o.max ? 'disabled' : ''}>${ic('plus')}</button>
    <span class="an-sous">${n ? eur(n * (+o.prix || 0)) : '<small>Facultatif</small>'}</span></div>
    <div class="bouteilles" aria-hidden="true">${Array.from({ length: Math.min(+o.max || 0, 10) }, (_, k) => `<i class="${k < n ? 'on' : ''}${k === n - 1 ? ' neuf' : ''}">${emojiQte(o)}</i>`).join('')}</div>`; };
  const ageFeteRs = () => { const a = S.rs.enfant, t = trancheRs(); if (!a.naissance || !a.age) return '<p class="sous-t c">Avec la date de naissance, on calcule l’âge qu’il ou elle va fêter.</p>';
    const F = formuleRs(), lim = F && F.ages ? { min: F.ages[0], max: F.ages[1], lib: F.ages[0] + ' à ' + F.ages[1] + ' ans' } : t, actuel = ageA(a.naissance, new Date()), hors = lim && (a.age < +lim.min || a.age > +lim.max);
    return `<p class="lab-j">Âge fêté <small>${esc(a.prenom || 'L’enfant')} a ${actuel} an${actuel > 1 ? 's' : ''} aujourd’hui</small></p><div class="an-agef"><button class="rond" data-a="rsAgeFete" data-d="-1" aria-label="Un an de moins">${ic('moins')}</button><div><b>${a.age}</b><small>ans 🎂</small></div><button class="rond" data-a="rsAgeFete" data-d="1" aria-label="Un an de plus">${ic('plus')}</button></div>
      ${hors ? `<p class="an-avert">Cette formule est prévue pour les ${esc(lim.lib)} : l’équipe vous le confirmera.</p>` : ''}`; };
  const nbRs = () => { const [a, b] = bornesNbRs(), u = uniteRs(); return `<div class="an-qte an-nb"><button class="rond" data-a="rsNb" data-d="-1" aria-label="Un de moins" ${S.rs.nb > a ? '' : 'disabled'}>${ic('moins')}</button><b>${S.rs.nb}</b><button class="rond" data-a="rsNb" data-d="1" aria-label="Un de plus" ${S.rs.nb < b ? '' : 'disabled'}>${ic('plus')}</button><span class="an-sous">${esc(S.rs.nb > 1 ? u : singulier(u))}<small>de ${a} à ${b}</small></span></div>`; };
  const compteurRs = () => { const [a, b] = bornesNbRs(); return `<div class="bw-compteur"><button class="rond" data-a="rsNb" data-d="-1" aria-label="Un de moins" ${S.rs.nb > a ? '' : 'disabled'}>${ic('moins')}</button><b>${S.rs.nb}</b><button class="rond" data-a="rsNb" data-d="1" aria-label="Un de plus" ${S.rs.nb < b ? '' : 'disabled'}>${ic('plus')}</button></div>`; };
  function piedRecapRs() {
    const T = totalRs(), acompte = rsC().regles.paiement === 'acompte';
    return `${acompte ? `<div class="rp-l"><span>Reste à régler sur place</span><span>${eur(Math.max(0, T.total - T.acompte))}</span></div>` : ''}<div class="rp-tot"><small>${acompte ? 'Acompte à payer maintenant' : T.du ? 'Total à payer' : 'Tout est couvert'}</small><b data-total="${T.du}">${eur(T.du)}</b></div>
          <div class="rangee"><button class="btn sec" data-a="rsPrec" data-e="rs-recap">${ic('retour')} Retour</button><button class="btn pri" data-a="rsPayer">${acompte ? 'Payer l’acompte' : T.du ? 'Payer ' + eur(T.du) : 'Valider'} ${ic('suite')}</button></div>`;
  }
  const payloadRs = () => { const r = S.rs, E = etapesRs(), I = k => E.includes('rs-infos') && TX('rs-infos', k);
    return { formule: r.formule, salle: r.salle || null, j: r.j, h: r.h, nb: r.nb, tranche: (trancheRs() || {}).lib || '', options: optionsRs(), groupe: I('groupe') ? r.groupe.trim() : '',
      prenoms: I('prenoms') ? Array.from({ length: r.nb }, (_, i) => (r.prenoms[i] || '').trim()) : [], enfant: I('enfant') ? { prenom: r.enfant.prenom.trim(), naissance: r.enfant.naissance, age: r.enfant.age } : null,
      contact: I('contact') ? { nom: r.contact.nom.trim(), tel: r.contact.tel.trim() } : null }; };
  const reglerRs = () => rsC().regles.paiement === 'total' && rsC().regles.partiel && S.reste.reduce((n, l) => n + l.q, 0) > 1;
  /* onglet Paiement du module : « Tout payer / Payer une partie », sinon la page de paiement propose tout de suite carte ou espèces */
  const partielPropose = () => !perso(S.module) || !!(typeMod(S.module) === 'resa' ? rsC().regles.partiel : TX('regler', 'partiel'));
  function initRs(act) {
    S.module = act; S.rsConf = SB.api.resa.config(act); S.rsJours = null;
    const a = Math.max(1, +TX('rs-nombre', 'min') || 1), b = Math.max(a, +TX('rs-nombre', 'max') || 20);
    S.rs = { act, salle: null, tranche: null, formule: null, nb: Math.min(b, Math.max(a, +TX('rs-nombre', 'defaut') || 1)), j: null, h: null, choix: {}, qte: {}, groupe: '', prenoms: [], enfant: { prenom: '', naissance: '', age: null }, contact: { nom: '', tel: '' } };
  }
  const choisirFormuleRs = nom => { S.rs.formule = nom; S.rs.j = null; S.rs.h = null; S.rs.mois = null; const [a, b] = bornesNbRs(); S.rs.nb = Math.min(b, Math.max(a, S.rs.nb)); };
  /* aller à une étape : la formule unique se choisit toute seule, les créneaux se chargent en arrivant sur le jour et l'heure */
  function allerRs(e, sens = 1) {
    if (!e) return aller('accueil');
    if (e === 'rs-formule' && TX('rs-formule', 'unique') && formulesRs().length === 1 && !formulesRs()[0].badge) { choisirFormuleRs(formulesRs()[0].nom); return allerRs(sens > 0 ? suivantRs(e) : precedentRs(e), sens); }
    if (e === 'rs-date') { S.rsJours = SB.api.resa.creneaux(S.rs.act, S.rs.formule, S.rs.nb, S.rs.salle); if (S.rsJours.length === 1) S.rs.j = S.rsJours[0].j; if (S.rs.h && !heureRs()) S.rs.h = null; }
    aller(e);
  }
  const demarrerRs = act => { initRs(act); allerRs(etapesRs()[0]); };
  /* ce que chaque étape demande avant de passer à la suivante ; sinon la zone fautive tremble */
  function validerRs(e) {
    const r = S.rs, secoue = sel => { const g = $(sel); if (!g) return false; g.scrollIntoView({ behavior: 'smooth', block: 'center' }); g.classList.add('requis'); g.classList.remove('clignote'); void g.offsetWidth; g.classList.add('clignote'); setTimeout(() => { const i = g.querySelector('input'); if (i) i.focus({ preventScroll: true }); }, 350); return false; };
    if (e === 'rs-date') { if (!r.h) return false; if (r.enfant.naissance) r.enfant.age = ageFete(r.enfant.naissance, jourRs().iso); return true; }
    if (e === 'rs-options') {
      const o = rsC().options.find(x => x.type === 'choix' && x.obligatoire && !(r.choix[x.id] >= 0));
      if (!o) return true;
      const el = $(`[data-opt="${CSS.escape(o.id)}"]`); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('clignote'); void el.offsetWidth; el.classList.add('clignote'); return false;
    }
    if (e === 'rs-infos') {
      const I = k => TX('rs-infos', k), k = [['rsEnfant', I('enfant') && !r.enfant.prenom.trim()], ['rsNaissance', I('enfant') && !r.enfant.naissance], ['rsGroupe', I('groupe') && I('groupeOblig') && !r.groupe.trim()],
        ['rsPrenoms', I('prenoms') && I('prenomsOblig') && Array.from({ length: r.nb }, (_, i) => (r.prenoms[i] || '').trim()).some(x => !x)],
        ['rsNom', I('contact') && I('contactOblig') && !r.contact.nom.trim()], ['rsTel', I('contact') && I('contactOblig') && r.contact.tel.replace(/\D/g, '').length < 10]].find(([, v]) => v);
      return k ? secoue(`[data-champ="${k[0]}"]`) : true;
    }
    return true;
  }
  function merciRs() {
    const r = S.rs || {}, c = S.cmd, J = jourRs(), fest = festif(), T = totalRs(), acompte = rsC().regles.paiement === 'acompte';
    const nom = (r.groupe || r.contact.nom || r.enfant.prenom || '').trim(), titre = String(TX('merci', 'titre', { nom, enfant: r.enfant.prenom.trim() || nom })).replace(/\s+!/, ' !').replace(/\s{2,}/g, ' ');
    const reste = arrondi(T.total - (c.paye || 0) - (c.remise || 0));
    return `<div class="merci ${fest ? 'an-merci' : ''}">${ballons()}<div class="confettis">${confettis()}</div>
      ${fest ? `<div class="an-gateau" aria-hidden="true">${emojiRs()}</div><p class="an-hourra">${esc(TX('merci', 'mot'))}</p>` : `<div class="m-ok"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54"/><path d="M36 62l16 16 32-34"/></svg></div><p class="strike">${esc(TX('merci', 'mot'))}</p>`}<h1>${esc(titre)}</h1>
      <p class="m-num">Votre réservation<b>n° ${c.num}</b></p>
      <p class="m-ou">${J ? esc(cap(dateRs(J.iso))) + ' à <b>' + esc(hAff(r.h)) + '</b> · ' : ''}${salleRs() ? esc(salleRs().nom) + ' · ' : ''}${esc(r.formule || '')} · ${r.nb || ''} ${esc(uniteRs())}</p>
      ${acompte ? `<p class="m-ou">Acompte de <b>${eur(c.paye || 0)}</b> payé${reste > 0 ? ` · reste environ <b>${eur(reste)}</b> ${esc(TX('merci', 'reste'))}` : ''}.</p>` : ''}${TX('merci', 'message') ? `<p class="m-ou">${riche(TX('merci', 'message'))}</p>` : ''}
      <button class="btn pri gros" data-a="terminer">${esc(TX('merci', 'bouton'))}</button><p class="m-auto">Retour à l’accueil dans <b data-compte>${delaiMerci()}</b> s</p></div>`;
  }

  /* ------------------------------------------------------------------ Paiement */
  const donneesCommande = () => {
    const bw = S.module === 'bowling' && S.bw, rs = S.rs && S.module === S.rs.act && S.rs;
    return Object.assign({ borne: ID, act: bw ? 'bowling' : rs ? rs.act : 'bar', nom: bw ? S.bw.groupe : rs ? (titreRs() || rsC().nom) : S.nom, lieu: bw || rs ? 'Accueil' : lieuCmd(), ts: Date.now(),
      lignes: (S.lignesCmd || S.reste).map(l => ({ id: l.id, nom: l.nom, q: l.q, pu: l.pu, tva: l.tva, plu: l.p.plu, base: l.base, opts: l.opts, e: l.p.e })) },
      bw ? { resa: S.bw.resa ? S.bw.resa.id : undefined, bowling: { formule: S.bw.formule, parties: partiesDe(S.bw.formule), tarif: tarifBot(S.bw.formule), joueurs: S.bw.joueurs.map((j, i) => ({ prenom: nomJoueur(j, i), barrieres: !!j.barrieres })) } } : rs ? { reservation: payloadRs() } : {});
  };
  function sauverHorsLigne() {
    if (!S.reste.length) S.reste = lignes().map(l => Object.assign({}, l));
    if (!S.cmd) {
      const d = Object.assign(donneesCommande(), { aFinaliser: true }), r = appel('commander', d);   // hors ligne : file d'attente + numéro de la borne
      S.cmd = r ? r.commande : { num: d.num, total: total(S.reste), paye: 0, etat: 'afinaliser', horsLigne: true, nom: d.nom, lieu: d.lieu };
    } else if (S.cmd.etat === 'paiement') {                 // commande déjà créée, réseau coupé pendant le paiement
      appel('aFinaliser', { num: S.cmd.num });
      S.cmd = Object.assign({}, S.cmd, { etat: 'afinaliser' });
    }
    aller('sauvee');
  }
  function allerMoyen() {
    if (!enLigne()) return sauverHorsLigne();
    const M = moyens();
    S.insere = 0; S.rendu = 0;
    if (M.length === 1) { if (M[0] === 'Espèces' && !cashdro()) return especesAuComptoir(); S.moyen = M[0]; return aller(M[0] === 'Carte' ? 'tpe' : 'especes'); }
    aller('moyen');
  }
  /* « Espèces » sans monnayeur : la commande est créée puis mise de côté ; elle se paie sur une borne à monnayeur (« Finaliser ma commande ») */
  function especesAuComptoir() {
    if (S.verrou) return;
    S.verrou = true;
    if (!S.cmd) {
      const r = appel('commander', donneesCommande());
      if (!r || !r.ok) { S.verrou = false; return toast(r ? r.raison : 'Envoi impossible : réessayez dans un instant'); }
      S.cmd = r.commande;
    }
    const r = appel('attendreEspeces', { num: S.cmd.num });
    if (!r || !r.ok) { S.verrou = false; return toast(r ? r.raison : 'Envoi impossible : réessayez dans un instant'); }
    S.cmd = r.commande;
    aller('comptoir');
  }
  function encaisser(ok) {
    if (!enLigne()) return sauverHorsLigne();
    if (S.verrou) return;
    S.verrou = true;
    const montant = total(S.aPayer);
    if (!S.cmd) {
      const d = donneesCommande(), rc = appel('commander', d);
      S.cmd = rc ? rc.commande : { num: d.num, total: total(S.reste), paye: 0, etat: 'paiement', horsLigne: true };
    }
    const r = appel('payer', { num: S.cmd.num, op: S.cmd.num + '-' + Date.now().toString(36), ts: Date.now(), moyen: MOBILE && S.moyen === 'Carte' ? 'En ligne' : S.moyen, montant, lignes: S.aPayer.map(l => [l.nom, l.q, l.pu, l.tva, l.id]), ok });
    if (r && r.ok) S.cmd = r.commande;
    else if (!r && ok) { S.cmd = Object.assign({}, S.cmd, { paye: arrondi((S.cmd.paye || 0) + montant) }); if (S.cmd.paye >= S.cmd.total) S.cmd.etat = 'validee'; }
    if (!ok) { if (S.insere) toast(eur(S.insere) + ' rendus par le monnayeur'); S.insere = 0; return aller('refuse'); }
    S.aPayer.forEach(a => { const l = S.reste.find(x => x.k === a.k); if (l) l.q -= a.q; });
    S.reste = S.reste.filter(l => l.q > 0);
    S.sel = {};
    if (!S.reste.length) return aller('merci');
    ouvrirModale(`<div class="feuille petite flash"><div class="m-ok"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54"/><path d="M36 62l16 16 32-34"/></svg></div><h2>Paiement accepté</h2><p>${S.rendu > 0 ? 'Monnaie rendue : ' + eur(S.rendu) + '<br>' : ''}Il reste ${eur(total(S.reste))} à régler.</p></div>`, 'mid', 'rien');
    setTimeout(() => { fermerModale(); aller('regler'); }, 2000);
  }
  function majEspeces() {
    const m = total(S.aPayer), a = $('[data-anneau]');
    if (!a) return;
    a.style.setProperty('--p', Math.min(1, S.insere / m));
    $('[data-insere]').textContent = eur(S.insere);
    $('[data-reste]').textContent = S.insere >= m ? 'Merci ! Paiement validé…' + (S.insere > m ? ' Monnaie rendue : ' + eur(S.insere - m) : '') : 'Reste ' + eur(m - S.insere) + ' · le monnayeur rend la monnaie.';
  }

  /* ------------------------------------------------------------------ Veille automatique */
  const sansVeille = () => !!APERCU || MOBILE || ['veille', 'tpe', 'especes', 'merci', 'sauvee', 'comptoir', 'choix', 'vide'].includes(S.ecran);
  function minuterie() {
    clearTimeout(tIdle);
    if (!S.conf || sansVeille() || S.idleOuvert) return;
    tIdle = setTimeout(alerteIdle, Math.max(15, +(S.conf.diffusion || {}).retourAccueil || 60) * 1000);
  }
  function alerteIdle() {
    if (!S.panier.length && !S.cmd && !(S.bw && /^bw-/.test(S.ecran)) && !(S.rs && /^rs-/.test(S.ecran))) return reinit();
    let n = 15;
    S.idleOuvert = true;
    ouvrirModale(`<div class="feuille petite" role="alertdialog" aria-label="Toujours là ?"><div class="i-anneau"><b data-idle>${n}</b></div><h2>Vous êtes toujours là ?</h2><p>Sans réponse, la commande sera annulée et la borne revient à l’accueil.</p><button class="btn pri gros" data-a="resterLa">Oui, je continue</button></div>`, 'mid', 'resterLa');
    tCompte = setInterval(() => { n--; const el = $('[data-idle]'); if (el) el.textContent = n; if (n <= 0) reinit(); }, 1000);
  }
  function reinit() {
    clearInterval(tCompte); clearInterval(tMerci); clearTimeout(tIdle);
    if (S.cmd && S.cmd.etat === 'paiement') appel('abandonner', { num: S.cmd.num });
    Object.assign(S, NEUF(), { idleOuvert: false });
    fermerModale(true);
    aller('veille');
  }
  function afficherRupture(noms) {
    const n = noms.length > 1;
    ouvrirModale(`<div class="feuille petite" role="alertdialog" aria-label="${S.horaire ? 'Article plus servi' : 'Article épuisé'}"><div class="r-ic">${ic('info')}</div><h2>${S.horaire ? 'Plus servi à cette heure' : 'Victime de son succès'}</h2>
      <p><b>${noms.map(esc).join(', ')}</b> ${S.horaire ? (n ? 'ne sont plus servis' : 'n’est plus servi') + ' à cette heure' : (n ? 'viennent' : 'vient') + ' d’être épuisé' + (n ? 's' : '')} : nous ${n ? 'les avons retirés' : 'l’avons retiré'} de votre panier.</p>
      <button class="btn pri gros" data-a="fermer">${S.panier.length ? 'D’accord' : 'Choisir autre chose'}</button></div>`, 'mid');
  }

  /* ------------------------------------------------------------------ Hors ligne
     Sans réseau, la borne continue : la carte et les photos sont déjà en mémoire, la commande reçoit
     un numéro de la borne (9BBNNN : rang de la borne, puis compteur), les paiements sont notés,
     et tout attend dans une file rangée sur la borne. Au retour du réseau, la file part au CRM dans
     l'ordre ; l'API ignore ce qu'elle a déjà reçu (même numéro de commande, même clé de paiement).
     Pour tester : Chrome › F12 › Réseau › « Hors ligne », ou Ctrl+Alt+H sur la borne. */
  const NS = window.SB && SB.ESPACE ? SB.ESPACE + ':' : '', CLE_FILE = NS + 'borne:file:' + ID, CLE_SEQ = NS + 'borne:seq:' + ID;   // tests : file à part
  const lireLocal = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const poserLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage plein : la file reste en mémoire */ } };
  let FILE = lireLocal(CLE_FILE, []);
  const enLigne = () => navigator.onLine && !S.coupe;
  const OPS = { commander: d => SB.api.bar.commander(d, SRC), payer: d => SB.api.bar.payer(d.num, d, SRC), abandonner: d => SB.api.bar.abandonner(d.num, SRC), aFinaliser: d => SB.api.bar.aFinaliser(d.num, SRC), attendreEspeces: d => SB.api.bar.attendreEspeces(d.num, SRC) };
  /* ponytail: numéros 9BBNNN = 99 bornes × 1000 commandes hors ligne avant de reboucler ; le serveur pourra donner des plages réservées */
  function numeroLocal() { const n = lireLocal(CLE_SEQ, 0) + 1; poserLocal(CLE_SEQ, n); return 900000 + (S.conf.rang % 100) * 1000 + n % 1000; }
  function appel(type, d) {
    if (enLigne() && !FILE.length) { try { return OPS[type](d); } catch (e) { console.warn('[borne] envoi impossible, mis en attente', e); } }
    if (type === 'commander' && !d.num) Object.assign(d, { num: numeroLocal(), horsLigne: true });
    FILE.push({ type, d }); poserLocal(CLE_FILE, FILE); reseau();
    return null;
  }
  function viderFile() {
    while (FILE.length && enLigne()) {
      try { OPS[FILE[0].type](FILE[0].d); } catch (e) { break; }
      FILE.shift(); poserLocal(CLE_FILE, FILE);
    }
    reseau();
  }
  function reseau() {
    const el = $('#hl'), n = FILE.length;
    el.hidden = enLigne() && !n;
    el.textContent = enLigne() ? 'Réseau revenu · envoi de ' + n + ' commande' + (n > 1 ? 's' : '') + ' en attente…' : 'Pas de réseau · commandez quand même, vous paierez dès son retour' + (n ? ' (' + n + ' en attente)' : '');
  }
  window.addEventListener('online', viderFile);
  window.addEventListener('offline', reseau);
  setInterval(() => { if (FILE.length) viderFile(); }, 15000);
  /* heartbeat : la borne se signale au CRM toutes les 20 s (Gestion des bornes › Parc : en ligne, hors ligne depuis…) — POST /api/bornes/{id}/heartbeat */
  function signaler() { if (APERCU || !ID || !window.SB || !SB.pret()) return; try { SB.api.bornes.signaler(ID, { v: SB.VERSION, ecran: S.ecran || '', horsLigne: !enLigne(), file: FILE.length }, SRC); } catch (e) { /* stockage plein : on réessaiera */ } }
  setInterval(signaler, 20000);
  document.addEventListener('keydown', e => { if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'h') { S.coupe = !S.coupe; toast(S.coupe ? 'Test : réseau coupé' : 'Test : réseau revenu'); if (S.coupe) reseau(); else viderFile(); } });

  function versAccueil() { S.rub = null; S.sous = null; aller('accueil'); }

  /* ------------------------------------------------------------------ Écran de veille
     L'animation du centre tourne toujours ; les vidéos et images de Paramètres de diffusion › Écran de veille
     (celles de cette borne) passent ensuite, une par une, puis l'animation revient. */
  APRES.veille = v => diapo(v, 0);
  const URLS = new Map();                 // une adresse par média, gardée : la boucle tourne des heures sans rien recharger
  const urlMedia = s => { if (!URLS.has(s)) URLS.set(s, SB.api.medias.url(s).catch(e => { URLS.delete(s); throw e; })); return URLS.get(s); };
  function diapo(v, i) {
    clearTimeout(tDiapo); clearInterval(tMsg);
    const box = v.querySelector('.v-diapos');
    if (!box || S.ecran !== 'veille') return;
    const L = [{ type: 'anim', duree: +(S.conf.diffusion || {}).animDuree || 20 }].concat(S.conf.veille || []), d = L[i % L.length];
    const el = document.createElement('div'), suite = () => { if (el.isConnected && S.ecran === 'veille') diapo(v, i + 1); };
    el.className = 'v-diapo';
    el.innerHTML = d.type === 'anim' ? animVeille() : d.type === 'image' ? '<img class="v-flou" alt=""><img class="v-media" alt="">' : '<video class="v-media" muted playsinline></video>';
    box.appendChild(el);
    [...box.children].slice(0, -1).forEach(x => { x.classList.add('part'); setTimeout(() => x.remove(), 900); });
    const attendre = s => { clearTimeout(tDiapo); if (L.length > 1) tDiapo = setTimeout(suite, s * 1000); };
    if (d.type === 'anim') { attendre(d.duree); return messages(el); }
    /* fichier introuvable ou illisible : l'animation à la place, puis la suite */
    const rate = () => { if (!el.isConnected) return; el.innerHTML = animVeille(); messages(el); attendre(20); }, m = el.querySelectorAll('img, video');
    if (d.type === 'image' || +d.duree) attendre(+d.duree || 8);                  // une vidéo sans durée passe jusqu'au bout
    m[m.length - 1].onerror = rate;
    urlMedia(d.src).then(u => { m.forEach(x => { x.src = u; }); if (d.type !== 'image') { m[0].onended = suite; const p = m[0].play(); if (p) p.catch(() => {}); } }, rate);
  }
  function messages(el) {
    const M = messagesVeille(), t = el.querySelector('[data-msg]');
    let i = 0;
    if (t && M.length > 1) tMsg = setInterval(() => { t.classList.add('cache'); setTimeout(() => { i = (i + 1) % M.length; t.textContent = M[i]; t.classList.remove('cache'); }, 480); }, 3800);
  }
  /* L'animation : ciel étoilé, logo, messages, et une boule qui fait un strike sur une piste en perspective (SVG, 7 s en boucle).
     La piste : x(f, y) = le point à la fraction f de sa largeur, à la hauteur y (fond y = 40, bord y = 460). */
  const ETOILES = Array.from({ length: 54 }, () => `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;--t:${(2 + Math.random() * 3).toFixed(1)}s;--d:-${(Math.random() * 5).toFixed(1)}s;--s:${(.25 + Math.random() * .45).toFixed(2)}cqw"></i>`).join('');
  /* les 10 quilles : x, y (pied), envol dx, dy, rotation, retard ; le fond d'abord, la quille de tête devant */
  const QUILLES10 = [[171.5, 52, -66, -6, -95, .12], [190.5, 52, -22, -40, -160, .12], [209.5, 52, 26, -44, 170, .12], [228.5, 52, 70, -10, 100, .12], [181, 60, -58, -18, -110, .08], [200, 60, 8, -52, 220, .08], [219, 60, 60, -22, 120, .08], [190.5, 68, -38, -30, -140, .04], [209.5, 68, 40, -34, 150, .04], [200, 76, -6, -46, -200, 0]];
  let nAnim = 0;
  function animVeille() {
    const u = 'va' + (++nAnim), x = (f, y) => { const k = (y - 40) / 420; return (152 - 182 * k + f * (96 + 364 * k)).toFixed(1); };
    const fleches = [0, 1, 2, 3, 4, 5, 6].map(k => { const f = .125 + k * .125, y = 300 - (3 - Math.abs(k - 3)) * 9, s = 3 + 6 * (y - 40) / 420, c = +x(f, y); return `<path class="fl" style="--k:${Math.abs(k - 3)}" d="M${c} ${(y - 2 * s).toFixed(1)}L${(c - s).toFixed(1)} ${y}H${(c + s).toFixed(1)}Z"/>`; }).join('');
    const quilles = QUILLES10.map(([qx, qy, dx, dy, r, t]) => `<g transform="translate(${qx - 6} ${qy - 30}) scale(.3)"><g class="pin" style="--dx:${(dx / .3).toFixed(0)}px;--dy:${(dy / .3).toFixed(0)}px;--r:${r}deg;animation-delay:${t}s">${QUILLE}</g></g>`).join('');
    return `<div class="v-anim"><div class="v-ciel">${ETOILES}</div><span class="bulle b1"></span><span class="bulle b2"></span><span class="bulle b3"></span><span class="filante"></span>
      <div class="v-tete"><span class="v-halo"></span>${logo('v-logo')}</div><p class="v-msg" data-msg>${esc(messagesVeille()[0])}</p>
      <div class="v-scene"><svg viewBox="0 0 400 460" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><defs>
          <linearGradient id="${u}p" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#00aee0" stop-opacity=".26"/><stop offset="1" stop-color="#00aee0" stop-opacity=".04"/></linearGradient>
          <radialGradient id="${u}d" cy=".7"><stop offset="0" stop-color="#e8f8ff" stop-opacity=".55"/><stop offset="1" stop-color="#e8f8ff" stop-opacity="0"/></radialGradient>
          <radialGradient id="${u}b" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#c9f3ff"/><stop offset=".42" stop-color="#00aee0"/><stop offset="1" stop-color="#064e70"/></radialGradient>
          <radialGradient id="${u}h"><stop offset="0" stop-color="#7fd4f2" stop-opacity=".55"/><stop offset="1" stop-color="#7fd4f2" stop-opacity="0"/></radialGradient>
          <radialGradient id="${u}f"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#bfeeff" stop-opacity=".9"/><stop offset="1" stop-color="#00aee0" stop-opacity="0"/></radialGradient></defs>
        <path class="rigole" d="M140 40H152L${x(0, 460)} 460H-80ZM248 40H260L480 460H${x(1, 460)}Z"/>
        <path d="M152 40H248L${x(1, 460)} 460H${x(0, 460)}Z" fill="url(#${u}p)"/>
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => `<path class="latte" d="M${x(i / 12, 40)} 40L${x(i / 12, 460)} 460"/>`).join('')}
        ${fleches}<path class="faute" d="M${x(0, 432)} 432H${x(1, 432)}"/>
        <path class="neon lueur" d="M152 40L${x(0, 460)} 460M248 40L${x(1, 460)} 460"/><path class="neon" d="M152 40L${x(0, 460)} 460M248 40L${x(1, 460)} 460"/>
        <rect class="deck" x="120" y="22" width="160" height="72" fill="url(#${u}d)"/>
        ${quilles}
        <g class="v-boule"><circle r="34" fill="url(#${u}h)"/><ellipse cy="22" rx="19" ry="5" fill="#000" opacity=".35"/><circle r="24" fill="url(#${u}b)"/><g class="trous"><circle cx="-6" cy="-9" r="3.2"/><circle cx="4" cy="-11" r="3.2"/><circle cx="-1" cy="-1" r="3.8"/></g><ellipse cx="-9" cy="-11" rx="8" ry="4.5" fill="#fff" opacity=".4" transform="rotate(-35)"/></g>
        <g transform="translate(200 64)"><circle class="flash" r="56" fill="url(#${u}f)"/>${Array.from({ length: 12 }, (_, k) => `<circle class="etin" r="${k % 3 ? 2 : 3}" style="--a:${k * 30 + 8}deg;--l:${k % 2 ? 72 : 96}px"/>`).join('')}</g>
        <text class="v-strike" x="200" y="160" text-anchor="middle">STRIKE !</text>
      </svg></div></div>`;
  }
  /* téléphone : pas de retour automatique, l'écran reste (le client garde son numéro) */
  const compteARebours = (v, n) => { if (APERCU || MOBILE) return; tMerci = setInterval(() => { n--; const el = v.querySelector('[data-compte]'); if (el) el.textContent = n; if (n <= 0) reinit(); }, 1000); };
  APRES.merci = v => compteARebours(v, delaiMerci());
  APRES.sauvee = v => compteARebours(v, 45);
  APRES.comptoir = v => compteARebours(v, +TX('comptoir', 'delai') || 15);
  APRES.bar = () => majFleche();

  /* ------------------------------------------------------------------ Actions (data-a="…") */
  const A = {
    /* ---- module de réservation ---- */
    rsAge(d) { S.rs.tranche = d.t; allerRs(suivantRs('rs-age')); },
    rsFormule(d) { choisirFormuleRs(d.f); allerRs(suivantRs('rs-formule')); },
    rsSalle(d) { S.rs.salle = d.s; S.rs.j = null; S.rs.h = null; S.rs.mois = null; if (S.rs.formule && !formulesRs().some(f => f.nom === S.rs.formule)) S.rs.formule = null; const [a, b] = bornesNbRs(); S.rs.nb = Math.min(b, Math.max(a, S.rs.nb)); allerRs(suivantRs('rs-salle')); },
    rsNb(d) { const [a, b] = bornesNbRs(); S.rs.nb = Math.max(a, Math.min(b, S.rs.nb + +d.d)); zone('rsNb', compteurRs()); zone('rsNbInfos', nbRs()); },
    rsJour(d) {
      S.rs.j = +d.j; S.rs.h = null;
      $$('.an-j.dispo').forEach(b => b.classList.toggle('on', +b.dataset.j === S.rs.j));
      zone('rsHeures', zoneHeuresRs()); zone('rsPiedDate', piedRs('rs-date', false));
      const h = $('.an-heures'); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    rsMois(d) { const M = moisRs(), x = M[M.indexOf(S.rs.mois || (jourRs() || S.rsJours.find(z => z.heures.length) || S.rsJours[0]).iso.slice(0, 7)) + +d.d]; if (x) { S.rs.mois = x; zone('rsCal', calendrierRs()); } },
    rsHeure(d) { S.rs.h = d.h; $$('.an-h').forEach(b => b.classList.toggle('on', b.dataset.h === d.h)); zone('rsPiedDate', piedRs('rs-date', true)); },
    rsChoix(d) { S.rs.choix[d.o] = +d.c; $$(`.an-c[data-o="${CSS.escape(d.o)}"]`).forEach(b => { b.classList.toggle('on', +b.dataset.c === +d.c); b.setAttribute('aria-pressed', +b.dataset.c === +d.c); }); },
    rsQte(d) { const o = rsC().options.find(x => x.id === d.o); S.rs.qte[d.o] = Math.max(0, Math.min(+o.max || 9, (S.rs.qte[d.o] || 0) + +d.d)); zone('rsQte-' + d.o, qteRs(o)); },
    rsAgeFete(d) { S.rs.enfant.age = Math.max(1, Math.min(99, (S.rs.enfant.age || 1) + +d.d)); zone('rsAgeFete', ageFeteRs()); },
    rsPrec(d) { allerRs(precedentRs(d.e), -1); },
    rsSuite(d) { if (validerRs(d.e)) allerRs(suivantRs(d.e)); },
    /* la commande (et la place) est créée tout de suite, en ligne seulement : un créneau ne se réserve pas sans réseau */
    rsPayer() {
      if (!enLigne()) return toast('Pas de réseau : la réservation n’est pas possible pour l’instant');
      S.lignesCmd = null; S.sel = {}; S.cmd = null; S.reste = [];
      let r = null; try { r = SB.api.bar.commander(donneesCommande(), SRC); } catch (e) { console.warn(e); }
      if (!r) return toast('Envoi impossible : réessayez dans un instant');
      if (!r.ok) {
        toast(r.raison);
        if (r.code === 'creneau') { S.rs.h = null; return allerRs('rs-date'); }
        return;
      }
      S.cmd = r.commande;
      S.reste = (S.cmd.lignes || []).map(([nom, q, pu, tva], i) => ({ k: 'l' + i, id: ((S.cmd.details || [])[i] || {}).id || 'l' + i, base: nom, nom, opts: [], q, pu, tva, p: { cat: S.rs.act, e: emojiRs(), plu: '' } })).filter(l => l.pu > 0);
      if (S.cmd.etat === 'validee' || !S.reste.length) return aller('merci');
      if (reglerRs()) return aller('regler');
      S.aPayer = S.reste.map(l => Object.assign({}, l));
      allerMoyen();
    },
    /* retour depuis le paiement : la commande pas encore payée est annulée, la place est libérée */
    rsRevenir() { if (S.cmd && S.cmd.etat !== 'validee') appel('abandonner', { num: S.cmd.num }); S.cmd = null; aller('rs-recap'); },
    /* ---- module Bowling ---- */
    bwN(d) {
      const [mi, ma] = bornesBw(), J = S.bw.joueurs, n = Math.max(mi, Math.min(ma, J.length + +d.d));
      while (J.length < n) J.push({ prenom: '', barrieres: false });
      J.length = n;
      majBwN(+d.d > 0);
    },
    bwFormule(d) {
      S.bw.formule = d.f;
      $$('.formule').forEach(b => b.classList.toggle('on', b.dataset.f === d.f));
      const suite = $('[data-bwsuite]'); if (suite) suite.disabled = false;
    },
    bwAjout() {
      if (S.bw.joueurs.length >= bornesBw()[1]) return;
      S.bw.joueurs.forEach(j => delete j.neuf);
      S.bw.joueurs.push({ prenom: '', barrieres: false, neuf: true });
      zone('bwJoueurs', zoneJoueurs()); zone('bwPiedJ', zonePiedJ());
      const champs = $$('[data-f="prenom"]'), dernier = champs[champs.length - 1];
      if (dernier) { dernier.scrollIntoView({ block: 'center', behavior: 'smooth' }); dernier.focus(); }
      S.tarifs = SB.api.tarifs('bowling', S.bw.joueurs.length);
    },
    bwSuppr(d) {
      if (S.bw.joueurs.length <= bornesBw()[0]) return;
      S.bw.joueurs.splice(+d.i, 1); S.bw.joueurs.forEach(j => delete j.neuf);
      S.tarifs = SB.api.tarifs('bowling', S.bw.joueurs.length);
      zone('bwJoueurs', zoneJoueurs()); zone('bwPiedJ', zonePiedJ());
    },
    bwBarr(d, el) { const j = S.bw.joueurs[+d.i]; j.barrieres = !j.barrieres; el.classList.toggle('on', j.barrieres); el.setAttribute('aria-pressed', j.barrieres); },
    /* sans nom de groupe : on remonte en haut et la zone clignote */
    bwJoueursOk() {
      if (!S.bw.groupe.trim() && TX('bw-joueurs', 'groupeOblig')) {
        const g = $('[data-groupe]'), m = $('.bw-j');
        if (m) m.scrollTo({ top: 0, behavior: 'smooth' });
        g.classList.add('requis'); g.classList.remove('clignote'); void g.offsetWidth; g.classList.add('clignote');
        setTimeout(() => g.querySelector('input').focus({ preventScroll: true }), 350);
        return;
      }
      S.bw.joueurs.forEach((j, i) => { j.prenom = nomJoueur(j, i); delete j.neuf; });
      if (!S.bw.groupe.trim()) S.bw.groupe = 'Groupe de ' + S.bw.joueurs[0].prenom;
      aller('bw-recap');
    },
    /* validation : la commande est créée tout de suite ; à 0 € (réservation déjà payée en ligne), c'est fini */
    bwValider() {
      S.lignesCmd = lignesBowling(); S.reste = resteBowling(); S.sel = {}; S.cmd = null;
      if (!enLigne()) return sauverHorsLigne();
      const d = donneesCommande(), r = appel('commander', d);
      if (!r) { S.cmd = { num: d.num, total: total(S.lignesCmd), paye: 0, etat: 'paiement', horsLigne: true, nom: d.nom, lieu: d.lieu }; return aller('sauvee'); }
      if (!r.ok) return toast(r.raison);
      S.cmd = r.commande;
      aller(S.cmd.etat === 'validee' ? 'merci' : 'regler');
    },
    /* retour depuis le paiement : la commande pas encore payée est annulée (ses tickets CE déjà donnés redeviennent libres) */
    bwRetour() { if (S.cmd && S.cmd.etat !== 'validee') appel('abandonner', { num: S.cmd.num }); S.cmd = null; aller('bw-recap'); },
    reveil() { aller('accueil'); },
    module(d) {
      S.lignesCmd = null; S.bw = null; S.rs = null; S.cmd = null;
      if (d.act === 'bar') { S.module = 'bar'; S.rub = null; S.sous = null; return aller('bar'); }
      if (d.act === 'bowling') {
        const [mi, ma] = bornesBw(), n = Math.min(ma, Math.max(mi, +TX('bw-formule', 'joueursDefaut', null, 'bowling') || 2));
        S.module = 'bowling'; S.bw = { formule: null, groupe: '', joueurs: Array.from({ length: n }, () => ({ prenom: '', barrieres: false })) }; S.tarifs = SB.api.tarifs('bowling', n);
        return aller('bw-formule');
      }
      if (typeMod(d.act) === 'resa') {
        if (!enLigne()) return toast('Réservation impossible sans réseau');
        return demarrerRs(d.act);
      }
      toast('Bientôt disponible sur cette borne');
    },
    aller(d) { aller(d.e); },
    rien() {},
    fermer() { fermerModale(); },
    oui() { const f = S.siOui; S.siOui = null; fermerModale(); if (f) f(); },
    rub(d) { S.rub = d.c; S.sous = null; majBar(); },
    sous(d) { S.sous = d.s || null; majBar(); },
    toutes() { S.rub = null; S.sous = null; majBar(); },
    plusBas() { const sc = defileur(); if (sc) sc.scrollBy({ top: sc.clientHeight * .7, behavior: 'smooth' }); },
    fiche(d) { const p = prod(d.id); if (!p) return; Object.assign(S, { fq: 1, choix: choixDefaut(p), optP: p, optSrc: null }); ouvrirModale(modaleProduit(p)); },
    plus(d, el) {
      const p = prod(d.id), v = el.closest('.carte-p').querySelector('.vis');
      if (!p) return;
      if (optionsDe(p).length) { Object.assign(S, { fq: 1, choix: choixDefaut(p), optP: p, optSrc: v }); return ouvrirModale(modaleOptions(p), 'mid'); }
      vol(v); ajouterPanier(p.id, 1, []); majPanier();
    },
    opt(d) {
      S.choix[+d.g] = +d.c; majOptions();
      if ($('#couche .rapide') && optionsDe(S.optP).length === 1) setTimeout(() => A.ajouter({ id: S.optP.id }), 180);
    },
    fq(d) { S.fq = Math.max(1, Math.min(20, S.fq + +d.d)); $('[data-fq]').textContent = S.fq; majOptions(); },
    ajouter(d) {
      const p = prod(d.id);
      if (!p || !modaleOuverte() || manque(p).length) return;
      vol(S.optSrc || $('#couche .f-vis'));
      ajouterPanier(p.id, S.fq, optsChoisies(p));
      fermerModale(); majPanier();
    },
    voirPanier() { ouvrirModale(modalePanier()); },
    pm(d) { modLigne(d.k, +d.d); zone('pfLignes', zonePfLignes()); zone('pfBas', zonePfBas()); majPanier(); },
    annuler() { if (!S.panier.length) return versAccueil(); confirmer('Vider le panier ?', 'Les articles choisis seront retirés.', 'Non, je garde', 'Oui, vider', () => { Object.assign(S, NEUF()); versAccueil(); }); },
    continuer() { if (!S.panier.length) return; S.file = offres(); offreSuivante(); },
    upNon() { offreSuivante(); },
    upOui() { const o = S.offre, q = qte(o.a.id); S.panier = S.panier.filter(l => l.id !== o.a.id); ajouterPanier(o.b.id, q); toast(q + ' × ' + o.b.nom + ' : c’est noté !'); offreSuivante(); },
    upAjout(d, el) { vol(el.closest('.o-prop').querySelector('.vis')); ajouterPanier(d.id, 1); S.ajoutes.add(d.id); $('#couche .voile').innerHTML = modaleOffre(S.offre); majPanier(); },
    rq(d) { modLigne(d.k, +d.d); if (!S.panier.length) return aller('bar'); majRecap(); },

    majeur() { S.majeur = !S.majeur; zone('recapPied', zoneRecapPied()); },
    /* résumé validé : prénom obligatoire (on y ramène), âge si alcool, puis « Où doit-on vous servir ? » */
    valider() {
      const i = $('[data-f="nom"]');
      if (!S.nom.trim()) { insister(i.closest('.nomcmd')); i.scrollIntoView({ block: 'center', behavior: 'smooth' }); i.focus(); return; }
      if (alcool() && !S.majeur) return insister($('[data-a="majeur"]'));
      if (!S.zone && (estTablette() || PISTE) && zones().some(z => z.id === 'piste')) { S.zone = 'piste'; if (PISTE && PISTE <= (zoneChoisie().n || 0)) S.num = PISTE; }
      aller('ou');
    },
    choixZone(d) { if (S.zone !== d.z) S.num = null; S.zone = d.z; majOu(); },
    numero(d) { S.num = +d.n; majOu(); },
    ouOk() { const z = zoneChoisie(); if (!z || (z.n && !S.num)) return; S.reste = lignes().map(l => Object.assign({}, l)); S.cmd = null; S.sel = {}; if (!enLigne()) return sauverHorsLigne(); aller('regler'); },
    /* module « Finaliser ma commande » : le numéro de secours, sur n'importe quelle borne */
    chiffre(d) { if (S.code.length < 6) S.code += d.n; zone('code', zoneCode()); $('[data-err]').textContent = ''; },
    effacer() { S.code = S.code.slice(0, -1); zone('code', zoneCode()); },
    chercher() {
      const err = $('[data-err]'), non = t => { err.textContent = t; insister($('.code')); };
      if (S.code.length < 4) return non('Tapez le numéro en entier.');
      if (!enLigne()) return non('Toujours pas de réseau : réessayez dans un instant.');
      viderFile();                                            // si c'est cette borne qui l'a enregistrée, elle part d'abord au CRM
      const r = SB.api.bar.retrouver(+S.code);
      if (!r.ok) return non(r.raison || 'Numéro introuvable, ou commande déjà payée.');
      if (r.resa) return ouvrirResa(r.resa);
      const c = r.commande, deja = arrondi((c.paye || 0) + (c.remise || 0) + (c.acompte || 0));
      S.cmd = c; S.nom = c.nom; S.sel = {}; S.module = c.act || 'bar';
      S.reste = deja > 0
        ? [{ k: 'reste', id: null, base: 'Reste de la commande', nom: 'Reste de la commande n° ' + c.num, opts: [], q: 1, pu: arrondi(c.total - deja), tva: 10, p: { cat: '', e: '🧾' } }]
        : (c.details || []).map(d => ({ k: (d.id || d.nom) + (d.opts || []).map(o => '|' + o.nom).join(''), id: d.id, base: d.base || d.nom, nom: d.nom, opts: d.opts || [], q: d.q, pu: d.pu, tva: d.tva, p: prod(d.id) || { cat: c.act || '', e: d.e || '🧾', plu: d.plu } }));
      aller('retrouvee');
    },
    tout() { S.aPayer = S.reste.map(l => Object.assign({}, l)); allerMoyen(); },
    partie() { S.sel = {}; aller('partie'); },
    ps(d) { const l = S.reste.find(x => x.k === d.k); S.sel[d.k] = Math.max(0, Math.min(l.q, (S.sel[d.k] || 0) + +d.d)); zone('partie', zonePartie()); zone('partiePied', zonePartiePied()); },
    partieOk() { S.aPayer = selection(); if (S.aPayer.length) allerMoyen(); },
    moyen(d) { if (!enLigne()) return sauverHorsLigne(); if (S.ecran === 'regler') S.aPayer = S.reste.map(l => Object.assign({}, l)); if (d.m === 'Espèces' && !cashdro()) return especesAuComptoir();
      if (d.m === 'Ticket CE') { S.ce = { codes: [], saisie: '', de: S.ecran }; return aller('ticket'); } S.moyen = d.m; S.insere = 0; S.rendu = 0; aller(d.m === 'Carte' ? 'tpe' : 'especes'); },
    /* ---- ticket CE au paiement : chaque code est vérifié pour l'activité, puis tous sont consommés d'un coup en validant ---- */
    ceAjouter() {
      const code = (S.ce.saisie || '').trim(), err = t => { const e = $('[data-ce-err]'); if (e) e.textContent = t; insister($('[data-ce]')); }, net = x => String(x).replace(/[\s-]/g, '').toUpperCase();
      if (!code) return err('Scannez le QR code du ticket, ou tapez son code.');
      if (S.ce.codes.some(r => net(r.code) === net(code))) return err('Ce ticket est déjà dans la liste.');
      if (valeurCe() >= total(S.aPayer)) return err('Ce paiement est déjà couvert : validez les tickets.');
      if (!enLigne()) return err('Pas de réseau : les tickets ne peuvent pas être vérifiés pour l’instant.');
      const r = SB.api.tickets.verifier(code, (S.cmd && S.cmd.act) || S.module || 'bar');
      if (!r.ok) return err(r.raison);
      S.ce.codes.push({ code: r.code, valeur: r.valeur, contenu: r.contenu }); S.ce.saisie = '';
      const i = $('[data-f="ceCode"]'); if (i) i.value = '';
      $('[data-ce-err]').textContent = ''; majCe(); toast('Ticket accepté : − ' + eur(r.valeur));
    },
    ceRetirer(d) { S.ce.codes.splice(+d.i, 1); majCe(); },
    ceRetour() { const de = S.ce.de; S.ce = null; aller(de === 'refuse' || de === 'regler' ? de : 'moyen'); },
    ceValider() {
      if (S.verrou || !S.ce.codes.length) return;
      if (!enLigne()) return toast('Pas de réseau : réessayez dans un instant');
      S.verrou = true;
      if (!S.cmd) { const c = appel('commander', donneesCommande()); if (!c || !c.ok) { S.verrou = false; return toast(c ? c.raison : 'Envoi impossible : réessayez dans un instant'); } S.cmd = c.commande; }
      const r = SB.api.bar.payerCodes(S.cmd.num, S.ce.codes.map(x => x.code), SRC);
      if (!r.ok) { S.verrou = false; S.ce.codes = S.ce.codes.filter(x => !(r.refus || []).some(y => y.code === x.code)); majCe(); const e = $('[data-ce-err]'); if (e) e.textContent = r.raison; return; }
      S.cmd = r.commande;
      /* ce paiement est couvert jusqu'à la valeur des tickets ; le reste éventuel devient une ligne à payer tout de suite */
      const reste = arrondi(total(S.aPayer) - r.valeur), tva = (S.aPayer[0] || {}).tva || 10;
      S.aPayer.forEach(a => { const l = S.reste.find(x => x.k === a.k); if (l) l.q -= a.q; });
      S.reste = S.reste.filter(l => l.q > 0); S.sel = {}; S.ce = null;
      if (reste > 0) S.reste.push({ k: 'ce' + Date.now(), id: null, base: 'Reste après tickets CE', nom: 'Reste après tickets CE', opts: [], q: 1, pu: reste, tva, p: { cat: '', e: '🎟️' } });
      if (S.cmd.etat === 'validee' || !S.reste.length) return aller('merci');
      ouvrirModale(`<div class="feuille petite flash"><div class="m-ok"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54"/><path d="M36 62l16 16 32-34"/></svg></div><h2>Tickets acceptés</h2><p>Il reste ${eur(reste > 0 ? reste : total(S.reste))} à régler.</p></div>`, 'mid', 'rien');
      setTimeout(() => { fermerModale(); if (reste > 0) { S.aPayer = [S.reste[S.reste.length - 1]]; allerMoyen(); } else aller('regler'); }, 2000);
    },
    simOk() { encaisser(true); },
    simKo() { encaisser(false); },
    piece(d) {
      const m = total(S.aPayer);
      if (S.verrou || S.insere >= m) return;
      S.insere = arrondi(S.insere + +d.v); majEspeces();
      if (S.insere >= m) { S.rendu = arrondi(S.insere - m); setTimeout(() => { if (S.ecran === 'especes') encaisser(true); }, 1100); }
    },
    annulerPaiement() { if (S.insere) toast(eur(S.insere) + ' rendus par le monnayeur'); S.insere = 0; const rs = S.rs && S.module === S.rs.act && !reglerRs();
      if (rs && moyens().length < 2) return A.rsRevenir(); aller(moyens().length > 1 && (rs || partielPropose()) ? 'moyen' : 'regler'); },
    annulerCmd() {
      const deja = S.cmd && S.cmd.paye;
      confirmer('Annuler la commande ?', deja ? `Vous avez déjà réglé ${eur(deja)} : présentez-vous au bar, l’équipe s’occupe de la suite.` : 'Votre panier sera vidé et la borne revient à l’accueil.', 'Non, continuer', 'Oui, annuler', reinit);
    },
    terminer() { reinit(); },
    resterLa() { clearInterval(tCompte); S.idleOuvert = false; fermerModale(); minuterie(); }
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled || !A[el.dataset.a]) return;
    if (el.classList.contains('voile') && e.target !== el) return;     // clic dans une fenêtre, hors bouton : elle reste ouverte
    A[el.dataset.a](el.dataset, el);
  });
  document.addEventListener('input', e => {
    const f = e.target.dataset.f, v = e.target.value;
    if (f === 'nom') { S.nom = v.slice(0, 24); e.target.closest('.nomcmd').classList.remove('requis'); }
    if (f === 'groupe') { S.bw.groupe = v.slice(0, 20); e.target.closest('.groupe').classList.remove('requis', 'clignote'); }
    if (f === 'prenom') S.bw.joueurs[+e.target.dataset.i].prenom = v.slice(0, 16);
    if (/^rs/.test(f || '')) { const g = e.target.closest('.groupe'); if (g) g.classList.remove('requis', 'clignote'); }
    if (f === 'rsGroupe') S.rs.groupe = v.slice(0, 24);
    if (f === 'rsPrenom') S.rs.prenoms[+e.target.dataset.i] = v.slice(0, 16);
    if (f === 'rsEnfant') S.rs.enfant.prenom = v.slice(0, 20);
    if (f === 'rsNom') S.rs.contact.nom = v.slice(0, 30);
    if (f === 'rsTel') S.rs.contact.tel = v.replace(/[^\d +.]/g, '').slice(0, 16);
    if (f === 'ceCode') S.ce.saisie = v;
    if (f === 'rsNaissance') { S.rs.enfant.naissance = v; S.rs.enfant.age = v ? ageFete(v, jourRs() ? jourRs().iso : new Date().toISOString().slice(0, 10)) : null; zone('rsAgeFete', ageFeteRs()); }
  });
  let scan = '';
  document.addEventListener('keydown', e => {
    const f = e.target.dataset && e.target.dataset.f;
    if (e.key === 'Enter') {
      if (f === 'nom') e.target.blur();
      if (f === 'ceCode') A.ceAjouter();
      if (f === 'groupe' || f === 'prenom') { const P = [...$$('[data-f="prenom"]')], i = f === 'groupe' ? 0 : +e.target.dataset.i + 1; if (P[i]) P[i].focus(); else e.target.blur(); }
    }
    /* lecteur de tickets CE en mode clavier : sur l'écran « Ticket CE », un scan est pris même si le champ n'est pas touché */
    if (S.ecran === 'ticket' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      if (e.key === 'Enter') { if (scan) { S.ce.saisie = scan; scan = ''; A.ceAjouter(); } }
      else if (e.key.length === 1) scan += e.key;
    }
    minuterie();
  });
  document.addEventListener('pointerdown', () => minuterie(), true);
  let fFleche = 0;
  document.addEventListener('scroll', () => { if (!fFleche) fFleche = requestAnimationFrame(() => { fFleche = 0; majFleche(); }); }, true);
  const defile = (el, axe) => {
    for (; el && el !== document.body; el = el.parentElement) {
      const o = getComputedStyle(el)[axe === 'x' ? 'overflowX' : 'overflowY'];
      if ((o === 'auto' || o === 'scroll') && (axe === 'x' ? el.scrollWidth > el.clientWidth : el.scrollHeight > el.clientHeight)) return el;
    }
    return null;
  };
  let glisse = null;
  document.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) glisse = { t: e.target, x: e.clientX, y: e.clientY, el: null }; });
  document.addEventListener('pointermove', e => {
    if (!glisse) return;
    const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
    if (!glisse.el) {
      if (Math.hypot(dx, dy) < 8) return;
      glisse.axe = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      glisse.el = defile(glisse.t, glisse.axe);
      if (!glisse.el) { glisse = null; return; }
      Object.assign(glisse, { sl: glisse.el.scrollLeft, st: glisse.el.scrollTop });
    }
    if (glisse.axe === 'x') glisse.el.scrollLeft = glisse.sl - dx; else glisse.el.scrollTop = glisse.st - dy;
  });
  document.addEventListener('pointerup', () => {
    if (glisse && glisse.el) {                                  // un glisser n'est pas un toucher : on annule le clic qui suit
      const stop = ev => { ev.stopPropagation(); ev.preventDefault(); };
      document.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => document.removeEventListener('click', stop, true), 60);
    }
    glisse = null;
  });
  document.addEventListener('wheel', e => { const el = defile(e.target, 'x'); if (el && !defile(e.target, 'y') && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  setInterval(() => $$('[data-horloge]').forEach(t => { t.textContent = heure(); }), 10000);

  /* ------------------------------------------------------------------ Démarrage et mises à jour du CRM */
  function demarrer() {
    reseau();
    if (!window.SB) { $('#ecran').innerHTML = '<div class="choix-b"><h1>Moteur introuvable</h1><p>Le fichier ../maquettes/sandbox/centre-partage.js n’a pas pu être chargé.</p></div>'; return; }
    if (!ID) return aller('choix');
    if (!SB.pret() || !charger()) return aller('vide');
    signaler();
    if (APERCU) { $('#borne').classList.add('apercu'); return apercu(new URLSearchParams(location.search).get('page') || 'accueil'); }
    $('#borne').classList.toggle('mobile', MOBILE);
    aller('veille');
  }
  const redessiner = () => { const c = $('.contenu'), y = c ? c.scrollTop : 0; rafraichir(); const c2 = $('.contenu'); if (c2) c2.scrollTop = y; };
  if (window.SB) SB.ecouter(m => {
    if (m.local || !(m.cles || []).includes('config')) return;
    if (APERCU) { if (charger()) apercu(S.ecran || 'accueil'); return; }       // le CRM vient d'enregistrer : la page se redessine avec les nouveaux réglages
    if (S.ecran === 'vide' || S.ecran === 'choix') return demarrer();
    majCarte();
  });
  /* la carte a changé (CRM, ou l'heure : règles horaires du bar) : on redessine sans perdre le panier */
  function majCarte() {
    if (!charger()) return;
    const rupt = S.ruptures;
    S.ruptures = null;
    /* rupture en direct : tant que la commande n'est pas créée, on retire l'article et on prévient (une fois créée, le bar s'en occupe) */
    if (rupt && !S.cmd && ['accueil', 'bar', 'recap', 'ou', 'regler', 'partie', 'moyen'].includes(S.ecran)) {
      if (S.ecran === 'accueil' || S.ecran === 'bar') { fermerModale(true); redessiner(); }
      else if (S.ecran === 'recap' && S.panier.length) majRecap();
      else aller(S.panier.length ? 'recap' : 'bar');
      return afficherRupture(rupt);
    }
    /* la carte ou les modules ont changé dans le CRM : on redessine sans perdre le panier */
    if (['accueil', 'bar'].includes(S.ecran) && !modaleOuverte()) redessiner();
  }
  const horaires = c => c.produits.map(p => p.servi === false ? p.id + p.des : '').join();
  setInterval(() => { if (!APERCU && ID && window.SB && SB.pret() && !['vide', 'choix'].includes(S.ecran) && horaires(SB.api.bar.catalogue(ID)) !== horaires(CAT)) majCarte(); }, 30000);
  window.addEventListener('message', e => { if (APERCU && e.origin === location.origin && e.data && e.data.apercu) apercu(e.data.apercu); });
  demarrer();
})();
