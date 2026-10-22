/* =====================================================================
   Site de réservation Space Bowling (resa/)

   Accueil : les activités vendues en ligne (CRM › activité › Réglages ›
   Vente : « Site web », visible). Puis, par activité, les mêmes pages
   que la borne, dans le même ordre (api.resa.config(act, 'web').etapes),
   avec les règles du bloc « Site web » du module (délai, horizon,
   paiement : rien en ligne, acompte ou tout). Les coordonnées viennent
   du compte client (Mon espace), obligatoire pour réserver.

   Tout passe par le moteur partagé (SB.api) : le jour où le serveur
   existe, ses fonctions deviennent des fetch() et ces écrans ne
   changent pas. Paiement simulé (« Mode test ») tant que le prestataire
   de paiement en ligne n'est pas choisi.
   ===================================================================== */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
  const arrondi = n => Math.round(n * 100) / 100;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const riche = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const SRC = 'web';
  const NS = window.SB && SB.ESPACE ? SB.ESPACE + ':' : '';            // tests : session à part
  const CLE_SESSION = NS + 'resa:session';

  const ICO = {
    retour: '<path d="M15 5l-7 7 7 7"/>', suite: '<path d="M9 5l7 7-7 7"/>', croix: '<path d="M6 6l12 12M18 6L6 18"/>', plus: '<path d="M12 5v14M5 12h14"/>', moins: '<path d="M5 12h14"/>',
    ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', client: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>', ticket: '<path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4z"/><path d="M14 6v2M14 11v2M14 16v2"/>',
    carte: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/>', cal: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    barriere: '<path d="M4 20V8l2-3 2 3v12M16 20V8l2-3 2 3v12M4 11h16M4 16h16"/>', haut: '<path d="M6 15l6-6 6 6"/>', sortie: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'
  };
  const ic = (n, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICO[n]}</svg>`;
  const EMOJI_ACT = { bowling: '🎳', laser: '🎯', karaoke: '🎤', quiz: '🥊', billard: '🎱', anniv: '🎂' };
  const emojiNom = n => ([[/escape/i, '🔐'], [/escalade|grimpe/i, '🧗'], [/r[ée]alit[ée] virtuelle|vr/i, '🥽'], [/fl[ée]chette/i, '🎯'], [/arcade/i, '🕹️'], [/laser/i, '🎯'], [/karaok/i, '🎤'], [/quiz|box/i, '🥊'], [/billard/i, '🎱'], [/bowling/i, '🎳'], [/mini.?golf|golf/i, '⛳'], [/trampoline/i, '🤸']].find(([r]) => r.test(n || '')) || [])[1];
  const EMOJI_MODELE = { piste: '🎳', seance: '🎯', privatif: '🎤', table: '🎱', combo: '🎉' };
  const emojiAct = a => EMOJI_ACT[a.id] || emojiNom(a.nom) || EMOJI_MODELE[a.modele] || '🎉';
  const COUL_AN = ['#ff3d7f', '#7c4dff', '#ffb300', '#00c2a8', '#ff7043', '#29b6f6'];
  const estImage = u => /^(data:|https?:|blob:|\.{0,2}\/)/.test(u || '');

  /* ------------------------------------------------------------------ État */
  const S = { route: '', act: null, a: null, conf: null, rs: null, jours: null, cmd: null, client: null, onglet: 'creer', erreur: null, refus: false, pnOuvert: false };

  const lireSession = () => { try { return localStorage.getItem(CLE_SESSION); } catch (e) { return null; } };
  const poserSession = id => { try { if (id) localStorage.setItem(CLE_SESSION, id); else localStorage.removeItem(CLE_SESSION); } catch (e) { /* navigation privée */ } };
  function majClient() { const c = SB.api.clients.get(lireSession()); S.client = c && c.actif !== false ? c : null; if (!S.client) poserSession(null); }

  /* textes et réglages du module de l'activité (CRM › Sandbox › Module) : les mêmes que la borne */
  const TX = (sec, k, vars) => { let v = SB.api.modules.val(S.a, sec, k); if (vars && typeof v === 'string') Object.keys(vars).forEach(x => { v = v.split('{' + x + '}').join(vars[x]); }); return v; };
  const festif = () => TX('theme', 'style') === 'festif';
  const bowling = () => S.act === 'bowling';
  const couleur = i => festif() ? COUL_AN[i % COUL_AN.length] : 'var(--acc)';
  const accent = () => TX('theme', 'accent') || S.a.c || '#0a8fbf';                // Module › Ambiance › Couleur du module

  /* les pages de la borne, sans celles qui n'ont rien à montrer ; « Vos informations » toujours (le compte client) */
  const LIB = { 'bw-formule': 'Joueurs et formule', 'bw-joueurs': 'Prénoms', 'rs-age': 'Âge', 'rs-formule': 'Formule', 'rs-nombre': 'Participants', 'rs-date': 'Jour et heure', 'rs-options': 'Options', 'rs-infos': 'Informations', 'rs-recap': 'Récapitulatif' };
  const libEtape = e => e === 'rs-salle' ? (S.a.ressNom || 'Salle') : LIB[e];
  function etapes() {
    const C = S.conf, L = C.etapes.filter(e => !(e === 'rs-salle' && !C.choixSalle) && !(e === 'rs-age' && !C.tranches.length) && !(e === 'rs-options' && !C.options.length));
    if (!L.includes('rs-infos') && !L.includes('bw-joueurs')) L.splice(L.indexOf('rs-recap'), 0, 'rs-infos');      // le bowling demande le compte avec les prénoms
    return L;
  }
  const suivante = e => etapes()[etapes().indexOf(e) + 1];
  const precedente = e => etapes()[etapes().indexOf(e) - 1];

  const pourSalle = (f, id) => !(f.salles || []).length || f.salles.includes(id);
  const formulesBase = () => (etapes().includes('rs-age') && S.rs.tranche ? S.conf.formules.filter(f => !f.tranches.length || f.tranches.includes(S.rs.tranche)) : S.conf.formules).filter(f => !S.rs.salle || pourSalle(f, S.rs.salle));
  /* « le jour et l'heure d'abord » (CRM › module › Site web › Ordre des pages) : la page Jour et heure vient avant celle de la formule */
  const dateAvant = () => { const L = etapes(), d = L.indexOf('rs-date'), f = L.findIndex(e => e === 'rs-formule' || e === 'bw-formule'); return d >= 0 && f >= 0 && d < f; };
  const avantDate = e => etapes().indexOf(e) < etapes().indexOf('rs-date');      // cette étape vient avant le jour : la changer fait rechoisir le jour
  /* le jour d'abord : les formules encore libres à l'heure choisie pour ce nombre, et leur prix exact (gardé tant que rien ne change) */
  let memoDispo = { k: null, v: null };
  const dispoA = () => { if (!dateAvant() || !S.rs.h || S.rs.j == null) return null; const k = [S.act, S.rs.j, S.rs.h, S.rs.nb, S.rs.salle].join('|');
    if (memoDispo.k !== k) memoDispo = { k, v: SB.api.resa.formulesA(S.act, S.rs.j, S.rs.h, S.rs.nb, S.rs.salle, 'web') }; return memoDispo.v; };
  const prixA = nom => (dispoA() || []).find(x => x.nom === nom);
  /* les formules proposées : celles de l'âge et de la salle choisis ; le jour d'abord, seulement celles encore libres à cette heure */
  const formules = () => { const D = dispoA(), F = formulesBase(); return D ? F.filter(f => D.some(x => x.nom === f.nom)) : F; };
  const formule = () => S.conf.formules.find(f => f.nom === S.rs.formule);
  const tranche = () => S.conf.tranches.find(t => t.id === S.rs.tranche);
  const salle = () => (S.conf.salles || []).find(x => x.id === S.rs.salle);
  const jour = () => { if (!S.jours && S.rs && S.rs.j != null) chargerJours(false); return (S.jours || []).find(x => x.j === S.rs.j); };
  const heure = () => { const J = jour(); return J && J.heures.find(x => x.h === S.rs.h); };
  const unite = () => TX('rs-nombre', 'unite') || 'personnes';
  const singulier = u => String(u).replace(/s$/, '');
  const uniteN = n => n > 1 ? unite() : singulier(unite());
  /* participants : ceux de la formule (Tarifs), sinon ceux du module ; jamais plus que la plus grande salle */
  const bornesNb = () => { if (bowling()) { const a = Math.max(1, +TX('bw-formule', 'joueursMin') || 1); return [a, Math.max(a, +TX('bw-formule', 'joueursMax') || 24)]; }
    const P = (formule() || {}).participants, max = (salle() || {}).cap || S.conf.capMax || 999;
    const [a, b] = P && (P[0] || P[1]) ? [P[0] || 1, Math.max(P[0] || 1, P[1] || 99)] : [Math.max(1, +TX('rs-nombre', 'min') || 1), +TX('rs-nombre', 'max') || 20];
    return [a, Math.max(a, Math.min(b, max))]; };
  const hAff = h => { const [H, M] = String(h || '').split(':').map(Number); return isNaN(H) ? String(h || '') : String(H % 24).padStart(2, '0') + ':' + String(M || 0).padStart(2, '0'); };
  const dateDe = iso => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const dateLongue = iso => cap(dateDe(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
  const dureeTxt = m => !m ? '' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : '');
  const ageA = (n, d) => { const [y, m, j] = n.split('-').map(Number); return d.getFullYear() - y - (d.getMonth() + 1 < m || (d.getMonth() + 1 === m && d.getDate() < j) ? 1 : 0); };
  const ageFete = (n, iso) => { const d = dateDe(iso), [, m, j] = n.split('-').map(Number), p = new Date(d.getFullYear(), m - 1, j); if (p <= d) p.setFullYear(d.getFullYear() + 1); return ageA(n, d) + ((p - d) / 864e5 <= 183 ? 1 : 0); };
  const options = () => !etapes().includes('rs-options') ? [] : S.conf.options.map(o => o.type === 'choix'
    ? (S.rs.choix[o.id] >= 0 ? { nom: o.nom, choix: o.choix[S.rs.choix[o.id]], prix: 0 } : null)
    : (S.rs.qte[o.id] ? { nom: o.nom, q: S.rs.qte[o.id], prix: +o.prix || 0, unite: o.unite } : null)).filter(Boolean);
  /* montants affichés (le moteur recalcule tout à la commande) : total, ce qui se paie en ligne, codes, ce qui reste sur place */
  function totaux() {
    const H = heure(), f = formule() || {}, base = arrondi((H ? H.prix : 0) * (f.parPers ? S.rs.nb : 1)), total = arrondi(base + options().reduce((n, o) => n + (o.q || 0) * o.prix, 0)), R = S.conf.regles;
    const enLigne = R.paiement === 'acompte' ? Math.min(R.acompte || 0, total) : R.paiement === 'total' ? total : 0, remise = Math.min(enLigne, arrondi(S.rs.remises.reduce((n, x) => n + x.valeur, 0)));
    return { base, total, enLigne, remise, du: arrondi(enLigne - remise), surPlace: arrondi(total - enLigne) };
  }
  const titreResa = () => (S.rs.enfant.prenom || S.rs.groupe || (S.client || {}).nom || S.rs.formule || '').trim();

  /* ------------------------------------------------------------------ Navigation (adresse #/laser/rs-date : le bouton Retour du navigateur marche) */
  const aller = route => { if (location.hash === '#/' + route) rendre(); else location.hash = '/' + route; };
  function lireRoute() {
    const [p, e] = location.hash.replace(/^#\/?/, '').split('/');
    if (!p) return { vue: 'accueil' };
    if (['espace', 'paiement', 'merci', 'infos', 'cgv', 'mentions', 'confidentialite'].includes(p)) return { vue: p };
    return { vue: 'parcours', act: p, etape: e };
  }
  function demarrer(act) {
    const a = (SB.etat().config.activites || []).find(x => x.id === act), vend = SB.api.web.config().activites.some(x => x.act === act);
    if (!a || !vend) return false;
    S.act = act; S.a = a; S.conf = SB.api.resa.config(act, 'web'); S.jours = null; S.cmd = null; S.erreur = null;
    S.rs = { salle: null, tranche: null, formule: null, nb: 1, j: null, h: null, mois: null, choix: {}, qte: {},
      groupe: '', prenoms: [], joueurs: [], enfant: { prenom: '', naissance: '', age: null }, remises: [], saisie: '', cgv: false };
    const [mi, ma] = bornesNb(); S.rs.nb = Math.min(ma, Math.max(mi, +TX(bowling() ? 'bw-formule' : 'rs-nombre', bowling() ? 'joueursDefaut' : 'defaut') || 2));
    return true;
  }
  const choisirFormule = nom => { S.rs.formule = nom; if (!dateAvant()) { S.rs.j = null; S.rs.h = null; S.rs.mois = null; } const [a, b] = bornesNb(); S.rs.nb = Math.min(b, Math.max(a, S.rs.nb)); };
  /* les jours et heures libres : pour la formule choisie ; le jour d'abord, sur la page Jour et heure (ou sans formule), pour l'une des formules proposées */
  const chargerJours = surDate => { const toutes = dateAvant() && (surDate || !S.rs.formule);
    S.jours = SB.api.resa.creneaux(S.act, toutes ? formulesBase().map(f => f.nom) : S.rs.formule, S.rs.nb, S.rs.salle, 'web'); if (S.jours.filter(x => x.heures.length).length === 1 && !S.rs.j) S.rs.j = S.jours.find(x => x.heures.length).j; if (S.rs.h && !heure()) S.rs.h = null; };
  /* ce que chaque étape demande ; une adresse ouverte trop tôt (rechargement, lien) ramène à la première étape incomplète */
  function etapeOk(e) {
    const r = S.rs;
    if (e === 'rs-salle') return !!r.salle;
    if (e === 'rs-age') return !!r.tranche;
    if (e === 'rs-formule' || e === 'bw-formule') return !!r.formule && formules().some(f => f.nom === r.formule);
    if (e === 'rs-date') { if (!S.jours) chargerJours(false); return !!heure(); }
    if (e === 'rs-options') return !S.conf.options.some(o => o.type === 'choix' && o.obligatoire && !(r.choix[o.id] >= 0));
    if (e === 'rs-infos' || e === 'bw-joueurs') return !manqueInfos();
    return true;
  }
  /* sur le site, la page Formule s'affiche toujours, même avec une seule formule : le client voit son contenu et son prix avant de réserver
     (le réglage « Passer cette page s'il n'y a qu'une formule » vaut pour la borne) */
  const allerEtape = e => aller(e ? S.act + '/' + e : '');

  /* ------------------------------------------------------------------ Gabarit commun */
  const logo = () => { const L = SB.etat().config.logo; return L ? `<img src="${esc(L)}" alt="Space Bowling">` : '<b class="logo-txt">Space Bowling</b>'; };
  const entete = () => `<header class="haut"><div class="haut-in"><a class="logo" href="#/" aria-label="Accueil des réservations">${logo()}</a>
    <nav class="nav"><a href="#/" class="${S.route === 'accueil' ? 'on' : ''}">Activités</a><a href="#/espace" class="compte ${S.route === 'espace' ? 'on' : ''}">${ic('client')}<span>${S.client ? esc(S.client.nom.split(' ')[0]) : 'Mon espace'}</span></a></nav></div></header>`;
  /* l'établissement (CRM › Paramétrage › Établissement) ; un texte entre crochets n'est pas encore renseigné */
  const centre = () => (SB.etat().config.centre || {});
  const val = (k, d) => { const v = String(centre()[k] || '').trim(); return v && !/^\[.*\]$/.test(v) ? v : ''; };
  const champC = (k, d) => esc(val(k) || centre()[k] || d || '[à compléter]');
  const emailCentre = () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('email')) ? val('email') : '';
  const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const hh = t => { const [H, M] = String(t).split(':').map(Number); return (H % 24) + ' h' + (M ? ' ' + String(M).padStart(2, '0') : ''); };      // 01:00 → 1 h, 13:30 → 13 h 30
  const plage = p => { const [a, b] = String(p || '').split('-').map(x => x.trim()); return a && b ? hh(a) + ' – ' + hh(b) : ''; };
  /* aujourd'hui (journée d'exploitation : après minuit, c'est encore la veille) : vacances, veilles et fériés ont leurs horaires */
  function horaireDuJour() {
    const H = centre().horaires; if (!H) return '';
    const now = SB.temps.maintenant(), d = SB.temps.dateDeJour(now.j), js = (d.getDay() + 6) % 7, vac = SB.temps.vacances(d) || SB.temps.ferieOuVeille(d);
    const p = plage((vac ? H.vacances : H.normal || [])[js]);
    return p ? 'Ouvert aujourd’hui : ' + p : 'Fermé aujourd’hui';
  }
  const pied = () => `<footer class="pied-site"><div class="pied-in"><span>${esc(horaireDuJour()) ? `<b class="ouvert">${esc(horaireDuJour())}</b> · ` : ''}© ${champC('nom', 'Space Bowling')}</span><nav><a href="#/infos">Infos pratiques</a><a href="#/cgv">CGV</a><a href="#/mentions">Mentions légales</a><a href="#/confidentialite">Confidentialité</a></nav></div></footer>`;
  const ballons = () => festif() ? `<div class="ballons" aria-hidden="true">${COUL_AN.map((c, i) => `<i class="ballon" style="--c:${c};--x:${4 + i * 16}%;--t:${18 + (i % 3) * 5}s;--d:-${(i * 3.7).toFixed(1)}s"></i>`).join('')}</div>` : '';

  /* ------------------------------------------------------------------ Décor : le ciel, la piste, les quilles */
  const QUILLE = '<svg viewBox="0 0 40 100" aria-hidden="true"><path d="M20 3c6 0 8.5 7 7.5 15-.8 6-3.8 9-3.8 13.5 0 5 9.3 14 9.3 33.5 0 18-6.5 30-13 32-6.5-2-13-14-13-32C7 45.5 16.3 36.5 16.3 31.5 16.3 27 13.3 24 12.5 18 11.5 10 14 3 20 3z" fill="#fffdf9"/><path d="M13.6 30.5h12.8M13 35.5h14" stroke="#d9272e" stroke-width="2.6"/></svg>';
  const ciel = () => '<i class="ciel" aria-hidden="true"></i><i class="ciel c2" aria-hidden="true"></i>';
  /* la boule roule et fait tomber les quilles, une fois ; elles se relèvent */
  const scene = cls => `<div class="scene ${cls || ''}" aria-hidden="true"><span class="sol"></span><span class="boule-r"></span><span class="q q1">${QUILLE}</span><span class="q q2">${QUILLE}</span><span class="q q3">${QUILLE}</span></div>`;
  /* petite gerbe d'étincelles là où l'on vient de choisir */
  function eclat(x, y, c) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const b = document.createElement('div'); b.className = 'eclat'; b.style.cssText = `left:${x}px;top:${y}px;--c:${c}`;
    b.innerHTML = Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30 + Math.round(Math.random() * 14)}deg;--d:${26 + Math.round(Math.random() * 30)}px;--t:${i % 3 ? 7 : 10}px"></i>`).join('');
    document.body.appendChild(b); setTimeout(() => b.remove(), 750);
  }
  const confettis = () => `<div class="confettis" aria-hidden="true">${Array.from({ length: 60 }, () => `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 1.4).toFixed(2)}s;--t:${(2.6 + Math.random() * 2).toFixed(2)}s;--r:${Math.round(Math.random() * 900 - 450)}deg;--c:${['#00aee0', '#d9272e', '#f5c542', '#7fd4f2', '#0c2f47'][Math.floor(Math.random() * 5)]}"></i>`).join('')}</div>`;

  /* ------------------------------------------------------------------ Accueil */
  /* la prochaine heure libre en ligne d'une activité (première formule, une personne) : « Libre aujourd'hui dès 18:30 » */
  function prochaine(act) {
    const C = SB.api.resa.config(act, 'web'), f = C && C.formules[0]; if (!f) return null;
    const J = SB.api.resa.creneaux(act, f.nom, 1, null, 'web').find(x => x.heures.length);
    if (!J) return { txt: 'Complet en ligne pour le moment', off: true };
    const d = J.j - SB.temps.maintenant().j, h = hAff(J.heures[0].h);
    return { txt: d === 0 ? 'Libre aujourd’hui dès ' + h : d === 1 ? 'Libre demain dès ' + h : 'Prochaine place ' + dateDe(J.iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' }) + ' à ' + h };
  }
  function vueAccueil() {
    const W = SB.api.web.config(), A = SB.etat().config.activites || [];
    const carte = (m, i) => { const a = A.find(x => x.id === m.act) || { id: m.act, nom: m.lib }, img = estImage(m.image), p = prochaine(m.act);
      return `<a class="act ${img ? 'photo' : ''}" href="#/${esc(m.act)}" data-a="choisirAct" data-act="${esc(m.act)}" style="--i:${i};--c:${esc(a.c || '#0a8fbf')}">
        <span class="act-vis">${img ? `<img src="${esc(m.image)}" alt="" loading="lazy">` : ''}<i aria-hidden="true">${emojiAct(a)}</i></span>
        <span class="act-t"><b>${esc(m.lib)}</b>${m.sous ? `<small>${esc(m.sous)}</small>` : ''}</span>
        ${p ? `<span class="act-dispo ${p.off ? 'off' : ''}"><i></i>${esc(p.txt)}</span>` : ''}<span class="act-go">Réserver ${ic('suite')}</span></a>`; };
    return `<section class="heros">${ciel()}<div class="heros-in"><h1>Réservez votre aventure</h1><p>Bowling, laser game, karaoké, quiz ou anniversaire : choisissez votre jour et votre heure, votre place est gardée tout de suite.</p></div>${scene()}<i class="planete" aria-hidden="true"></i></section>
      <main class="page"><div class="acts">${W.activites.map(carte).join('') || '<p class="vide">Aucune activité n’est réservable en ligne pour le moment.</p>'}</div></main>`;
  }

  /* ------------------------------------------------------------------ Parcours : une page par étape, le récapitulatif à côté */
  function piste(e) {
    const L = etapes(), k = L.indexOf(e), de = S.piste && S.piste.act === S.act ? S.piste.k : -1;
    S.piste = { act: S.act, k };
    return `<nav class="piste" aria-label="Étape ${k + 1} sur ${L.length}" style="--n:${L.length};--k:${k};--de:${de}"><span class="piste-sol" aria-hidden="true"><i></i></span>
      <ol>${L.map((x, i) => `<li class="${i < k ? 'fait' : i === k ? 'on' : ''}" ${i === k ? 'aria-current="step"' : ''}>${i < k ? `<button type="button" data-a="etape" data-e="${x}"><b>${ic('ok')}</b><span>${esc(libEtape(x))}</span></button>` : `<span><b>${i + 1}</b><span>${esc(libEtape(x))}</span></span>`}</li>`).join('')}</ol>
      <span class="piste-boule" aria-hidden="true"></span><span class="piste-q" aria-hidden="true">${QUILLE}${QUILLE}${QUILLE}</span></nav>`;
  }
  const titre = (e, t, s) => `<header class="et-tete"><h1>${esc(t)}</h1>${s ? `<p class="sous">${esc(s)}</p>` : ''}</header>`;
  const carteFormule = (f, i) => { const d = TX('rs-formule', 'details');
    return `<button type="button" class="an-f ${f.img ? 'photo' : ''} ${S.rs.formule === f.nom ? 'on' : ''}" data-a="formule" data-f="${esc(f.nom)}" style="--i:${i};--c:${festif() ? COUL_AN[(i * 2 + 1) % 6] : f.couleur && /^#/.test(f.couleur) ? f.couleur : S.a.c || '#0a8fbf'}">
      ${f.img ? `<span class="an-f-img"><img src="${esc(f.img)}" alt="" loading="lazy"></span>` : ''}<i class="an-f-e" aria-hidden="true">${esc(f.emoji) || emojiAct(S.a)}</i>
      <span class="an-f-tags">${f.badge ? `<span class="an-badge">⭐ ${esc(f.badge)}</span>` : ''}${(f.salles || []).length && !S.conf.choixSalle ? `<span class="an-f-age">${esc(S.conf.salles.filter(x => f.salles.includes(x.id)).map(x => x.nom).join(', '))}</span>` : ''}${f.ages ? `<span class="an-f-age">${f.ages[0]} à ${f.ages[1]} ans</span>` : ''}</span>
      <b>${esc(f.nom)}</b>${d && f.contenu.length ? `<ul>${f.contenu.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      ${d ? `<span class="an-f-meta">${f.duree ? `<span>⏱ ${dureeTxt(f.duree)}</span>` : ''}${f.participants ? `<span>👥 ${f.participants[0]} à ${f.participants[1]} ${esc(unite())}</span>` : ''}</span>` : ''}
      ${prixA(f.nom) ? `<span class="an-f-prix"><small>À ${hAff(S.rs.h)}</small><b>${eur(prixA(f.nom).prix)}</b><small>${esc((f.unite || '').replace(/^par /, '/ '))}</small></span>`
        : `<span class="an-f-prix"><small>À partir de</small><b>${eur(f.apartir)}</b><small>${esc((f.unite || '').replace(/^par /, '/ '))}</small></span>
      ${f.tarifs.length > 1 ? `<span class="an-f-tarifs">${f.tarifs.map(t => eur(t.prix) + ' ' + esc(t.quand)).join(' · ')}</span>` : ''}`}</button>`; };
  const compteur = () => { const [a, b] = bornesNb(); return `<div class="compteur"><button type="button" class="rond" data-a="nb" data-d="-1" aria-label="Un de moins" ${S.rs.nb > a ? '' : 'disabled'}>${ic('moins')}</button><b>${S.rs.nb}</b><button type="button" class="rond" data-a="nb" data-d="1" aria-label="Un de plus" ${S.rs.nb < b ? '' : 'disabled'}>${ic('plus')}</button><span>${esc(uniteN(S.rs.nb))}<small>de ${a} à ${b}</small></span></div>`; };
  /* calendrier mois par mois : il s'ouvre sur le mois du jour choisi, sinon sur le premier mois qui a de la place */
  const moisL = () => [...new Set((S.jours || []).map(x => x.iso.slice(0, 7)))];
  function calendrier() {
    const J = S.jours, M = moisL(), m = M.includes(S.rs.mois) ? S.rs.mois : (jour() || J.find(x => x.heures.length) || J[0]).iso.slice(0, 7), k = M.indexOf(m);
    const [y, mo] = m.split('-').map(Number), d1 = new Date(y, mo - 1, 1), cases = Array.from({ length: (d1.getDay() + 6) % 7 }, () => '<span></span>');
    for (let n = 1, fin = new Date(y, mo, 0).getDate(); n <= fin; n++) { const x = J.find(z => z.iso === m + '-' + String(n).padStart(2, '0'));
      cases.push(x && x.heures.length ? `<button type="button" class="an-j dispo ${S.rs.j === x.j ? 'on' : ''}" data-a="jour" data-j="${x.j}" aria-label="${esc(dateLongue(x.iso))}" aria-pressed="${S.rs.j === x.j}">${n}</button>` : `<span class="an-j ${x ? '' : 'hors'}">${n}</span>`); }
    return `<div class="an-cal"><div class="an-mois"><button type="button" class="rond petit" data-a="mois" data-d="-1" aria-label="Mois précédent" ${k > 0 ? '' : 'disabled'}>${ic('retour')}</button><b>${esc(cap(d1.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })))}</b><button type="button" class="rond petit" data-a="mois" data-d="1" aria-label="Mois suivant" ${k < M.length - 1 ? '' : 'disabled'}>${ic('suite')}</button></div>
      <div class="an-grille">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(j => `<span class="jsem">${j}</span>`).join('')}${cases.join('')}</div></div>`;
  }
  const uniteprix = () => { const f = formule() || formulesBase()[0] || {}; return f.parPers ? '/ ' + singulier(unite()) : esc(f.unite || ''); };
  const toutesFormules = () => dateAvant() && (S.etape === 'rs-date' || !S.rs.formule);         // les heures et les prix valent pour l'une des formules
  const heures = () => { const J = jour(); if (!J) return `<p class="an-vide">${ic('cal')} Choisissez un jour en couleur pour voir ses heures.</p>`;
    return `<p class="an-jour">${esc(dateLongue(J.iso))}</p><div class="an-heures">${J.heures.map((x, i) => `<button type="button" class="an-h ${S.rs.h === x.h ? 'on' : ''}" data-a="heure" data-h="${x.h}" style="--i:${i};--c:${couleur(i)}" aria-pressed="${S.rs.h === x.h}"><b>${hAff(x.h)}</b>${TX('rs-date', 'prix') ? `<small>${toutesFormules() ? 'dès ' : ''}${eur(x.prix)} ${uniteprix()}</small>` : ''}${TX('rs-date', 'places') && x.reste === 1 ? '<em>Dernière place</em>' : ''}</button>`).join('')}</div>`; };
  const qte = o => { const n = S.rs.qte[o.id] || 0; return `<div class="an-qte"><button type="button" class="rond petit" data-a="qte" data-o="${esc(o.id)}" data-d="-1" aria-label="Une de moins" ${n ? '' : 'disabled'}>${ic('moins')}</button><b>${n}</b><button type="button" class="rond petit" data-a="qte" data-o="${esc(o.id)}" data-d="1" aria-label="Une de plus" ${n >= +o.max ? 'disabled' : ''}>${ic('plus')}</button><span class="an-sous">${n ? eur(n * (+o.prix || 0)) : '<small>Facultatif</small>'}</span></div>`; };
  const champ = (k, lib, html, aide) => `<div class="champ ${S.erreur && S.erreur[0] === k ? 'err' : ''}" data-champ="${k}"><label>${lib}</label>${html}${aide ? `<small>${aide}</small>` : ''}${S.erreur && S.erreur[0] === k ? `<p class="msg-err" role="alert">${esc(S.erreur[1])}</p>` : ''}</div>`;
  const entree = (f, v, attrs) => `<input data-f="${f}" value="${esc(v)}" ${attrs || ''}>`;
  const ageFeteHtml = () => { const a = S.rs.enfant, J = jour(); if (!a.naissance || !J) return '<small class="note">Avec sa date de naissance, on calcule l’âge qu’il ou elle va fêter.</small>';
    if (!a.age) a.age = ageFete(a.naissance, J.iso);
    const F = formule(), t = tranche(), lim = F && F.ages ? { min: F.ages[0], max: F.ages[1], lib: F.ages[0] + ' à ' + F.ages[1] + ' ans' } : t, hors = lim && (a.age < +lim.min || a.age > +lim.max);
    return `<div class="age-fete"><span>Âge fêté</span><button type="button" class="rond petit" data-a="ageFete" data-d="-1" aria-label="Un an de moins">${ic('moins')}</button><b>${a.age} ans 🎂</b><button type="button" class="rond petit" data-a="ageFete" data-d="1" aria-label="Un an de plus">${ic('plus')}</button></div>${hors ? `<p class="avert">Cette formule est prévue pour les ${esc(lim.lib)} : l’équipe vous le confirmera.</p>` : ''}`; };

  /* le compte client : créer, se connecter (sur la page Informations et dans Mon espace) */
  function blocCompte(titreBloc) {
    if (S.client) return `<div class="moi"><span class="moi-ic">${ic('client')}</span><div><b>${esc(S.client.nom)}</b><small>${esc(S.client.email)} · ${esc(S.client.tel)}</small></div><button type="button" class="lien" data-a="deconnexion">Ce n’est pas vous ?</button></div>`;
    const e = S.erreur && S.erreur[0] === 'compte' ? `<p class="msg-err" role="alert">${esc(S.erreur[1])}</p>` : '';
    return `<div class="bloc-compte ${S.erreur && S.erreur[0] === 'compte' ? 'err' : ''}" data-champ="compte">${titreBloc ? `<h2>${esc(titreBloc)}</h2>` : ''}
      <div class="onglets" role="tablist"><button type="button" role="tab" class="${S.onglet === 'creer' ? 'on' : ''}" data-a="onglet" data-o="creer" aria-selected="${S.onglet === 'creer'}">Créer mon compte</button><button type="button" role="tab" class="${S.onglet === 'connexion' ? 'on' : ''}" data-a="onglet" data-o="connexion" aria-selected="${S.onglet === 'connexion'}">J’ai déjà un compte</button></div>${e}
      ${S.onglet === 'creer' ? `<form data-form="creer" class="grille-champs" novalidate>
          <label>Nom et prénom<input name="nom" autocomplete="name" required></label><label>Téléphone<input name="tel" type="tel" autocomplete="tel" required></label>
          <label>E-mail<input name="email" type="email" autocomplete="email" required></label><label>Mot de passe<input name="mdp" type="password" autocomplete="new-password" minlength="6" required><small>6 caractères au moins</small></label>
          <button type="submit" class="btn pri">Créer mon compte</button></form>`
        : `<form data-form="connexion" class="grille-champs" novalidate><label>E-mail<input name="email" type="email" autocomplete="email" required></label><label>Mot de passe<input name="mdp" type="password" autocomplete="current-password" required></label>
          <button type="submit" class="btn pri">Se connecter</button><p class="note">Mot de passe oublié ? Appelez l’accueil : on vous en donne un nouveau.</p></form>`}</div>`;
  }

  /* bowling : les quilles du compteur, rangées par piste (7 joueurs au plus par piste, comme la borne) */
  const partiesDe = nom => { const m = String(nom).match(/(\d+)\s*\+\s*(\d+)/); if (m) return +m[1] + +m[2]; const k = String(nom).match(/(\d+)/); return k ? +k[1] : 1; };
  const pistesBw = () => SB.moteur.repartirPistes(S.rs.nb, SB.moteur.capPiste(SB.etat()));
  const quillesBw = neuf => { let i = 0; const T = pistesBw();
    return T.map((t, k) => `<div class="piste-b">${Array.from({ length: t }, () => { i++; return `<span class="${neuf && i === S.rs.nb ? 'neuf' : ''}">${QUILLE}</span>`; }).join('')}${T.length > 1 ? `<small>Piste ${k + 1}</small>` : ''}</div>`).join(''); };
  const formulesBw = () => formules().map((f, i) => `<button type="button" class="formule ${S.rs.formule === f.nom ? 'on' : ''}" data-a="formuleBw" data-f="${esc(f.nom)}" style="--i:${i};--c:${esc(f.couleur && /^#/.test(f.couleur) ? f.couleur : '#8db4ff')}" aria-pressed="${S.rs.formule === f.nom}">
      ${/\+/.test(f.nom) ? `<span class="f-offre">${esc(TX('bw-formule', 'offre'))}</span>` : ''}<span class="f-n">${esc(f.nom.replace(/\s*parties?$/i, ''))}</span><b>${partiesDe(f.nom) > 1 ? partiesDe(f.nom) + ' parties' : '1 partie'}</b>
      ${(p => TX('bw-formule', 'prixJoueur') ? `<span class="f-pu">${p ? '' : 'dès '}${eur(p ? p.prix : f.apartir)} / joueur</span>` : '')(prixA(f.nom))}${(p => TX('bw-formule', 'total') ? `<span class="f-tot">${p ? '' : 'dès '}${eur(p ? p.total : f.apartir * S.rs.nb)}</span>` : '')(prixA(f.nom))}</button>`).join('')
    || (dateAvant() && S.rs.h ? `<p class="vide">Plus assez de pistes libres à ${hAff(S.rs.h)} pour ${S.rs.nb} joueurs. <button type="button" class="lien" data-a="etape" data-e="rs-date">Choisir une autre heure</button></p>` : '<p class="vide">Aucune formule en ligne pour le moment.</p>');
  const joueursBw = () => { const r = S.rs, T = pistesBw(), debuts = T.map((_, k) => T.slice(0, k).reduce((a, b) => a + b, 0)), [mi, ma] = bornesNb(), barr = TX('bw-joueurs', 'barrieres');
    while (r.joueurs.length < r.nb) r.joueurs.push({ prenom: '', barrieres: false }); r.joueurs.length = r.nb;
    return r.joueurs.map((j, i) => (T.length > 1 && debuts.includes(i) ? `<p class="piste-t">${ic('barriere')} Piste ${debuts.indexOf(i) + 1} · ${T[debuts.indexOf(i)]} joueurs</p>` : '')
      + `<div class="joueur ${S.erreur && S.erreur[0] === 'joueur-' + i ? 'err' : ''}" data-champ="joueur-${i}"><span class="num">${i + 1}</span>${entree('joueur.' + i, j.prenom, `maxlength="16" placeholder="${esc(TX('bw-joueurs', 'prenomAide', { n: i + 1 }))}" autocomplete="off" aria-label="Prénom du joueur ${i + 1}"`)}
      ${barr ? `<button type="button" class="barr ${j.barrieres ? 'on' : ''}" data-a="barr" data-i="${i}" aria-pressed="${j.barrieres}">${ic('barriere')} ${esc(TX('bw-joueurs', 'barrieresBouton'))}</button>` : ''}<button type="button" class="rond petit j-x" data-a="bwSuppr" data-i="${i}" aria-label="Retirer le joueur ${i + 1}" ${r.nb <= mi ? 'disabled' : ''}>${ic('croix')}</button></div>`).join('')
      + `<button type="button" class="ajout-j" data-a="bwAjout" ${r.nb >= ma ? 'disabled' : ''}>${ic('plus')} ${esc(TX('bw-joueurs', 'ajouter'))}</button>`; };

  /* ---- Anniversaire : la roue des formules (dossier « anniv ») ----
     On la tourne au doigt, à la molette, aux flèches du clavier ou avec ▲ ▼ ; la formule du centre se détaille à côté (dessous sur mobile).
     Photo : celle de la formule dans le CRM (Tarifs), sinon celle du dossier anniv qui correspond à son nom. */
  const PHOTOS_AN = [[/bowling.*laser|laser.*bowling/i, 'bowlaser'], [/3\s*activit/i, 'multi3'], [/2\s*activit/i, 'multi2'], [/laser/i, 'laser'], [/bowling/i, 'bowling'], [/quiz|box/i, 'quiz'], [/karaok/i, 'karaoke']];
  const photoAn = f => { if (f.img) return f.img; const x = PHOTOS_AN.find(([r]) => r.test(f.nom)); return x ? 'img/anniv/' + x[1] + '.jpg' : ''; };
  const roue = { pos: 0, cible: 0, raf: null };
  const nRoue = () => formules().length;
  const indexRoue = c => { const n = nRoue(); return ((Math.round(c) % n) + n) % n; };
  const ecart = (i, pos, n) => { let d = i - pos; if (n > 2) { d = ((d % n) + n) % n; if (d > n / 2) d -= n; } return d; };      // la roue tourne en boucle
  const parUnite = f => esc((f.unite || '').replace(/^par /, '/ '));
  const carteRoue = (f, i) => { const ph = photoAn(f);
    return `<button type="button" class="roue-c" data-a="roueCarte" data-i="${i}" role="option" style="--c:${COUL_AN[(i * 2 + 1) % 6]}${ph ? `;--ph:url('${esc(ph)}')` : ''}">
      ${f.badge ? `<span class="an-badge">⭐ ${esc(f.badge)}</span>` : ''}<span class="rc-t"><i aria-hidden="true">${esc(f.emoji) || '🎉'}</i><b>${esc(f.nom)}</b></span>
      <span class="rc-m">dès ${eur(f.apartir)} ${parUnite(f)}${f.participants ? ` · ${f.participants[0]} à ${f.participants[1]} ${esc(unite())}` : ''}${f.duree ? ' · ' + dureeTxt(f.duree) : ''}</span></button>`; };
  const detailRoue = i => { const f = formules()[i]; if (!f) return '';
    return `<p class="rd-k">${i + 1} sur ${nRoue()}</p><h2>${esc(f.nom)}</h2>${f.ages ? `<p class="note">Pour les ${f.ages[0]} à ${f.ages[1]} ans</p>` : ''}
      ${f.contenu.length ? `<ul>${f.contenu.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      <p class="rd-meta">${f.duree ? `<span>⏱ ${dureeTxt(f.duree)}</span>` : ''}${f.participants ? `<span>👥 ${f.participants[0]} à ${f.participants[1]} ${esc(unite())}</span>` : ''}</p>
      ${prixA(f.nom) ? `<p class="rd-prix"><small>À ${hAff(S.rs.h)}</small> <b>${eur(prixA(f.nom).prix)}</b> <small>${parUnite(f)}</small></p>` : `<p class="rd-prix"><small>À partir de</small> <b>${eur(f.apartir)}</b> <small>${parUnite(f)}</small></p>${f.tarifs.length > 1 ? `<p class="note">${f.tarifs.map(t => eur(t.prix) + ' ' + esc(t.quand)).join(' · ')}</p>` : ''}`}
      <button type="button" class="btn pri" data-a="formule" data-f="${esc(f.nom)}">Choisir cette fête ${ic('suite')}</button>`; };
  /* sur mobile, la fiche d'une formule s'ouvre avant de la choisir (sur PC, le détail est à côté de la roue, et les cartes montrent tout) */
  const mobile = () => matchMedia('(max-width: 899px)').matches;
  const fermerModale = () => { const m = $('.voile-m'); if (m) m.remove(); };
  function ficheFormule(nom) {
    const f = S.conf.formules.find(x => x.nom === nom); if (!f) return;
    const i = Math.max(0, formules().findIndex(x => x.nom === nom)), ph = TX('rs-formule', 'affichage') === 'roue' ? photoAn(f) : f.img;
    const c = festif() ? COUL_AN[(i * 2 + 1) % 6] : f.couleur && /^#/.test(f.couleur) ? f.couleur : accent();
    fermerModale();
    const m = document.createElement('div'); m.className = 'voile-m'; m.dataset.a = 'fermerModale';
    m.innerHTML = `<div class="modale" role="dialog" aria-modal="true" aria-labelledby="mf-t" style="--c:${esc(c)}">
      <div class="mf-ph ${ph ? '' : 'vide'}" ${ph ? `style="background-image:url('${esc(ph)}')"` : ''}><i aria-hidden="true">${esc(f.emoji) || emojiAct(S.a)}</i></div>
      <button type="button" class="rond petit mf-x" data-a="fermerModale" aria-label="Fermer">${ic('croix')}</button>
      <div class="mf-c">${f.badge ? `<span class="an-badge">⭐ ${esc(f.badge)}</span>` : ''}<h2 id="mf-t">${esc(f.nom)}</h2>${f.ages ? `<p class="note">Pour les ${f.ages[0]} à ${f.ages[1]} ans</p>` : ''}
        ${f.contenu.length ? `<ul>${f.contenu.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <p class="rd-meta">${f.duree ? `<span>⏱ ${dureeTxt(f.duree)}</span>` : ''}${f.participants ? `<span>👥 ${f.participants[0]} à ${f.participants[1]} ${esc(unite())}</span>` : ''}${(f.salles || []).length && !S.conf.choixSalle ? `<span>📍 ${esc(S.conf.salles.filter(x => f.salles.includes(x.id)).map(x => x.nom).join(', '))}</span>` : ''}</p>
        ${prixA(f.nom) ? `<p class="rd-prix"><small>À ${hAff(S.rs.h)}</small> <b>${eur(prixA(f.nom).prix)}</b> <small>${parUnite(f)}</small></p>` : `<p class="rd-prix"><small>À partir de</small> <b>${eur(f.apartir)}</b> <small>${parUnite(f)}</small></p>${f.tarifs.length > 1 ? `<p class="note">${f.tarifs.map(t => eur(t.prix) + ' ' + esc(t.quand)).join(' · ')}</p>` : ''}
        <p class="note">Le prix exact dépend du jour et de l’heure : vous le verrez à l’étape suivante.</p>`}
        <div class="rangee"><button type="button" class="btn sec" data-a="fermerModale">Voir les autres</button><button type="button" class="btn pri" data-a="formuleOk" data-f="${esc(f.nom)}">Choisir cette formule ${ic('suite')}</button></div></div></div>`;
    document.body.appendChild(m);
    m.querySelector('[data-a="formuleOk"]').focus();
  }
  function dessinerRoue() {
    const n = nRoue();
    $$('.roue-c').forEach((el, i) => { const d = ecart(i, roue.pos, n), a = Math.abs(d);
      el.style.transform = `translate(-50%, -50%) translateY(${(d * 64).toFixed(2)}%) translateZ(${(-a * 150).toFixed(1)}px) rotateX(${(-d * 30).toFixed(2)}deg) scale(${(1 - Math.min(a, 2) * .14).toFixed(3)})`;
      el.style.opacity = a > 2.4 ? 0 : (1 - a * .36).toFixed(2); el.style.zIndex = 100 - Math.round(a * 10); el.style.filter = a > .5 ? `blur(${(Math.min(a, 2) * 1.2).toFixed(1)}px)` : '';
      const actif = a < .5; el.classList.toggle('actif', actif); el.tabIndex = -1; el.setAttribute('aria-selected', actif); });
  }
  function tourner(cible) {
    const n = nRoue(); if (n < 2) return;
    roue.cible = n > 2 ? cible : Math.max(0, Math.min(n - 1, cible));
    zone('roueDetail', detailRoue(indexRoue(roue.cible)));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { roue.pos = roue.cible; return dessinerRoue(); }
    if (roue.raf) return;
    const pas = () => { roue.pos += (roue.cible - roue.pos) * .16; if (Math.abs(roue.cible - roue.pos) < .003) roue.pos = roue.cible; dessinerRoue(); roue.raf = roue.pos === roue.cible ? null : requestAnimationFrame(pas); };
    roue.raf = requestAnimationFrame(pas);
  }
  /* molette, clavier, glisser (le clic sur une carte de côté la ramène au centre ; sur celle du centre, il la choisit) */
  function monterRoue() {
    const r = $('[data-roue]'); if (!r) return;
    dessinerRoue();
    let acc = 0, t = 0;
    r.addEventListener('wheel', e => { e.preventDefault(); acc += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; if (Math.abs(acc) > 40 && Date.now() - t > 160) { tourner(roue.cible + Math.sign(acc)); acc = 0; t = Date.now(); } }, { passive: false });
    r.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); tourner(roue.cible + (e.key === 'ArrowDown' ? 1 : -1)); } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); A.formule({ f: formules()[indexRoue(roue.cible)].nom }); } });      // mobile : la fiche ; PC : choisie
    r.addEventListener('pointerdown', e => {
      if (e.button || e.target.closest('.roue-fl')) return;
      const y0 = e.clientY, p0 = roue.pos, h = r.clientHeight * .32; let bouge = false;
      const mv = ev => { const dy = ev.clientY - y0; if (Math.abs(dy) > 6) bouge = true; if (bouge) { roue.pos = roue.cible = p0 - dy / h; if (nRoue() <= 2) roue.pos = roue.cible = Math.max(0, Math.min(nRoue() - 1, roue.pos)); dessinerRoue(); } };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); if (bouge) { r.dataset.glisse = '1'; setTimeout(() => delete r.dataset.glisse, 60); tourner(Math.round(roue.pos)); } };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
  }

  const PAGES = {
    'bw-formule'() {
      const J = dateAvant() && jour();
      return titre('bw-formule', TX('bw-formule', 'question'), J ? dateLongue(J.iso) + ' à ' + hAff(S.rs.h) : '') + `<div class="carte-blanche centre bw-n"><div data-zone="nb">${compteur()}</div>${TX('bw-formule', 'quilles') ? `<div class="quilles" data-zone="quilles">${quillesBw(false)}</div>` : ''}</div>
        <header class="et-tete"><h1 class="h-2">${esc(TX('bw-formule', 'questionFormule'))}</h1><p class="sous">${J ? 'Les formules encore libres à cette heure, au prix de ce jour-là.' : 'Le prix exact dépend du jour et de l’heure : vous le verrez à l’étape suivante.'}</p></header>
        <div class="formules" data-zone="formulesBw">${formulesBw()}</div>`;
    },
    'bw-joueurs'() {
      const J = jour();
      return titre('bw-joueurs', TX('bw-joueurs', 'joueurs'), S.rs.formule + (J ? ' · ' + dateLongue(J.iso) + ' à ' + hAff(S.rs.h) : '')) + `<div class="carte-blanche">
        ${champ('groupe', esc(TX('bw-joueurs', 'groupe')) + ' <em>obligatoire</em>', entree('groupe', S.rs.groupe, `maxlength="20" placeholder="${esc(TX('bw-joueurs', 'groupeAide'))}" autocomplete="off"`), 'Il s’affichera au-dessus de la piste.')}
        <div class="champ"><label>${esc(TX('bw-joueurs', 'joueurs'))} <em>obligatoire</em></label>${TX('bw-joueurs', 'barrieres') ? `<small>${esc(TX('bw-joueurs', 'barrieresAide'))}</small>` : ''}<div class="joueurs-bw" data-zone="joueurs">${joueursBw()}</div></div></div>
        <div class="carte-blanche"><h2 class="h2">Vos coordonnées</h2><p class="note">Pour vous envoyer la confirmation et vous prévenir en cas de besoin.</p>${blocCompte()}</div>`;
    },
    'rs-salle'() { return titre('rs-salle', TX('rs-salle', 'titre'), TX('rs-salle', 'sous')) + `<div class="grille-f">${S.conf.salles.map((x, i) => { const F = S.conf.formules.filter(f => pourSalle(f, x.id)), px = F.length ? Math.min(...F.map(f => f.apartir)) : 0, D = [...new Set(F.map(f => f.duree).filter(Boolean))].sort((p, q) => p - q);
      return `<button type="button" class="an-f ${S.rs.salle === x.id ? 'on' : ''}" data-a="salle" data-s="${esc(x.id)}" style="--i:${i};--c:${festif() ? COUL_AN[(i * 2 + 1) % 6] : S.a.c || '#0a8fbf'}"><i class="an-f-e" aria-hidden="true">${emojiAct(S.a)}</i><span class="an-f-tags">${TX('rs-salle', 'capacite') ? `<span class="an-f-age">Jusqu’à ${x.cap} pers.</span>` : ''}</span><b>${esc(x.nom)}</b>${x.desc ? `<span class="an-f-desc">${esc(x.desc)}</span>` : ''}${D.length ? `<span class="an-f-meta">${D.map(d => `<span>⏱ ${dureeTxt(d)}</span>`).join('')}</span>` : ''}${F.length ? `<span class="an-f-prix"><small>À partir de</small><b>${eur(px)}</b></span>` : ''}</button>`; }).join('')}</div>`; },
    'rs-age'() { return titre('rs-age', TX('rs-age', 'titre'), TX('rs-age', 'sous')) + `<div class="ages">${S.conf.tranches.map((t, i) => `<button type="button" class="age ${S.rs.tranche === t.id ? 'on' : ''}" data-a="age" data-t="${esc(t.id)}" style="--i:${i};--c:${COUL_AN[(i * 2) % 6]}">${TX('rs-age', 'bougies') ? `<span class="bougies">${Array.from({ length: Math.min(+t.min || 1, 7) }, (_, k) => `<i class="bougie" style="--k:${k};--b:${COUL_AN[(k + i + 1) % 6]}"></i>`).join('')}</span>` : ''}<b>${esc(t.lib)}</b><small>${formules().length && S.rs.tranche === t.id ? '' : S.conf.formules.filter(f => !f.tranches.length || f.tranches.includes(t.id)).length + ' formules'}</small></button>`).join('')}</div>`; },
    'rs-formule'() { const t = tranche(), F = formules(), J = dateAvant() && jour(), tete = titre('rs-formule', TX('rs-formule', 'titre'), J ? dateLongue(J.iso) + ' à ' + hAff(S.rs.h) + ' : les formules encore libres' : TX('rs-formule', 'sous') || (t ? t.lib : ''));
      if (J && !F.length) return tete + `<p class="an-vide">Plus de formule libre à ${hAff(S.rs.h)}. <button type="button" class="lien" data-a="etape" data-e="rs-date">Choisir une autre heure</button></p>`;
      if (TX('rs-formule', 'affichage') !== 'roue' || F.length < 2) return tete + `<div class="grille-f">${F.map(carteFormule).join('') || '<p class="vide">Aucune formule en ligne pour le moment.</p>'}</div>`;
      const k = Math.max(0, F.findIndex(f => f.nom === S.rs.formule)); roue.pos = roue.cible = k; if (roue.raf) { cancelAnimationFrame(roue.raf); roue.raf = null; }
      return tete + `<div class="roue-zone"><div class="roue" data-roue tabindex="0" role="listbox" aria-label="Formules : tournez la roue avec les flèches, Entrée pour choisir">${F.map(carteRoue).join('')}
        <button type="button" class="rond petit roue-fl haut" data-a="roue" data-d="-1" aria-label="Formule précédente">${ic('haut')}</button><button type="button" class="rond petit roue-fl bas" data-a="roue" data-d="1" aria-label="Formule suivante">${ic('haut')}</button></div>
        <aside class="carte-blanche roue-detail" data-zone="roueDetail" aria-live="polite">${detailRoue(k)}</aside></div>`; },
    'rs-nombre'() { return titre('rs-nombre', TX('rs-nombre', 'titre'), S.rs.formule) + `<div class="carte-blanche centre" data-zone="nb">${compteur()}</div>`; },
    'rs-date'() { if (!S.jours) chargerJours(true); const libres = S.jours.some(x => x.heures.length);
      return titre('rs-date', TX('rs-date', 'titre'), libres ? TX('rs-date', 'sous') : '') + (libres ? `<div class="date-h"><div data-zone="cal">${calendrier()}</div><div class="heures-col" data-zone="heures">${heures()}</div></div>` : `<p class="an-vide">${esc(dateAvant() ? 'Plus de créneau libre en ligne pour le moment : l’accueil peut vous aider.' : TX('rs-date', 'vide'))}</p>`); },
    'rs-options'() { return titre('rs-options', TX('rs-options', 'titre')) + S.conf.options.map((o, i) => `<section class="an-opt" data-champ="opt-${esc(o.id)}" style="--i:${i};--c:${COUL_AN[(i * 2 + 1) % 6]}"><h2>${esc(o.nom)}${o.type === 'choix' && o.obligatoire ? '<em>obligatoire</em>' : ''}${o.type === 'quantite' ? `<small>${eur(+o.prix || 0)} ${esc(o.unite ? 'la ' + o.unite : 'l’unité')}${o.max ? ' · jusqu’à ' + o.max : ''}</small>` : ''}</h2>
      ${o.type === 'choix' ? `<div class="an-choix">${o.choix.map((c, k) => `<button type="button" class="an-c ${S.rs.choix[o.id] === k ? 'on' : ''}" data-a="choix" data-o="${esc(o.id)}" data-c="${k}" aria-pressed="${S.rs.choix[o.id] === k}">${esc(c)}</button>`).join('')}</div>` : `<div data-zone="qte-${esc(o.id)}">${qte(o)}</div>`}</section>`).join(''); },
    'rs-infos'() {
      const r = S.rs, I = k => TX('rs-infos', k), blocs = [];
      {
        if (I('enfant')) blocs.push(`<div class="duo">${champ('enfant', 'Prénom de l’enfant', entree('enfant', r.enfant.prenom, 'maxlength="20" autocomplete="off"'))}${champ('naissance', 'Date de naissance', entree('naissance', r.enfant.naissance, 'type="date"'))}</div><div data-zone="ageFete">${ageFeteHtml()}</div>`);
        if (I('nombre') && !etapes().includes('rs-nombre')) blocs.push(`<div class="champ"><label>${esc(I('nombreTitre'))}</label><small>${esc(I('nombreAide'))}</small><div data-zone="nb">${compteur()}</div></div>`);
        if (I('groupe')) blocs.push(champ('groupe', esc(I('groupeLib')) + (I('groupeOblig') ? ' <em>obligatoire</em>' : ' <small>facultatif</small>'), entree('groupe', r.groupe, `maxlength="20" placeholder="${esc(I('groupeAide'))}" autocomplete="off"`)));
        if (I('prenoms')) blocs.push(champ('prenoms', 'Prénoms des participants' + (I('prenomsOblig') ? ' <em>obligatoire</em>' : ' <small>facultatif</small>'), `<div class="joueurs">${Array.from({ length: r.nb }, (_, i) => `<div class="joueur"><span class="num">${i + 1}</span>${entree('prenom.' + i, r.prenoms[i] || '', `maxlength="14" aria-label="Prénom ${i + 1}" autocomplete="off"`)}</div>`).join('')}</div>`));
      }
      return titre('rs-infos', TX('rs-infos', 'titre') || 'Vos informations') + (blocs.length ? `<div class="carte-blanche">${blocs.join('')}</div>` : '') + `<div class="carte-blanche"><h2 class="h2">Vos coordonnées</h2><p class="note">Pour vous envoyer la confirmation et vous prévenir en cas de besoin.</p>${blocCompte()}</div>`;
    },
    'rs-recap'() {
      const T = totaux(), R = S.conf.regles, J = jour(), sec = bowling() ? 'bw-recap' : 'rs-recap', codes = TX(sec, 'codes') && R.paiement !== 'aucun';
      return titre('rs-recap', 'Vérifiez votre réservation') + `<div class="carte-blanche recap">
        <dl class="lignes">${lignesRecap().map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>
        ${!bowling() && TX('rs-recap', 'note') ? `<p class="note">${riche(TX('rs-recap', 'note'))}</p>` : ''}</div>
        ${codes ? `<div class="carte-blanche"><h2 class="h2">${ic('ticket')} ${esc(TX(sec, 'codeTitre'))}</h2><form class="code" data-form="code" novalidate><input data-f="code" value="${esc(S.rs.saisie)}" placeholder="Votre code" autocomplete="off" autocapitalize="characters" aria-label="Code promo ou ticket CE"><button type="submit" class="btn sec">${esc(TX(sec, 'codeBouton'))}</button></form><p class="msg-err" data-ce-err role="alert"></p><div data-zone="remises">${remises()}</div></div>` : ''}
        <div class="carte-blanche"><label class="cgv ${S.erreur && S.erreur[0] === 'cgv' ? 'err' : ''}" data-champ="cgv"><input type="checkbox" data-f="cgv" ${S.rs.cgv ? 'checked' : ''}><span>J’accepte les <a href="#/cgv" target="_blank" rel="noopener">conditions générales de vente</a> et les conditions d’annulation.</span></label>${S.erreur && S.erreur[0] === 'cgv' ? `<p class="msg-err" role="alert">${esc(S.erreur[1])}</p>` : ''}
          <p class="note rgpd">Vos coordonnées servent uniquement à gérer vos réservations. Vous pouvez les modifier ou supprimer votre compte depuis Mon espace ou en écrivant à l’accueil. <a href="#/confidentialite" target="_blank" rel="noopener">En savoir plus</a></p>
          ${R.paiement === 'aucun' ? `<p class="info-paie">${ic('info')} Rien à payer en ligne : vous réglerez ${eur(T.total)} sur place.</p>` : R.paiement === 'acompte' ? `<p class="info-paie">${ic('info')} Acompte de ${eur(T.enLigne)} en ligne ; le reste (${eur(T.surPlace)}) se règle sur place.</p>` : ''}</div>`;
    }
  };
  const remises = () => S.rs.remises.map((r, i) => `<div class="remise">${ic('ticket')}<span>${esc(r.contenu)}<small>${esc(r.code)}</small></span><b>− ${eur(r.valeur)}</b><button type="button" class="rond petit" data-a="retireCode" data-i="${i}" aria-label="Retirer ce code">${ic('croix')}</button></div>`).join('');
  function lignesRecap() {
    const r = S.rs, J = jour(), L = [];
    if (salle()) L.push([libEtape('rs-salle'), esc(salle().nom)]);
    if (tranche() && etapes().includes('rs-age')) L.push(['Âge', esc(tranche().lib)]);
    if (r.formule) L.push(['Formule', esc(r.formule)]);
    if (r.formule) L.push(['Participants', r.nb + ' ' + esc(uniteN(r.nb))]);
    if (J) L.push(['Jour', esc(dateLongue(J.iso))]);
    if (r.h) L.push(['Heure', '<b>' + hAff(r.h) + '</b>']);
    options().forEach(o => L.push([o.nom, o.q ? o.q + ' × ' + eur(o.prix) : esc(o.choix)]));
    if (bowling() && r.groupe.trim()) { L.push(['Groupe', esc(r.groupe.trim())]); const T = pistesBw(); if (T.length > 1) L.push(['Pistes', T.length + ' (' + T.join(' + ') + ' joueurs)']);
      if (r.joueurs.some(j => j.prenom.trim())) L.push(['Joueurs', r.joueurs.map(j => esc(j.prenom.trim() || '?') + (j.barrieres ? ' <small class="barr-m">barrières</small>' : '')).join(', ')]); }
    else if (r.enfant.prenom.trim()) L.push(['L’enfant', esc(r.enfant.prenom.trim()) + (r.enfant.age ? ', ' + r.enfant.age + ' ans' : '')]);
    else if (r.groupe.trim()) L.push(['Groupe', esc(r.groupe.trim())]);
    return L;
  }
  /* le récapitulatif à côté (PC) ou en bas de l'écran (mobile) : ce qui est choisi, le total, Retour et Continuer */
  function panneau(e) {
    const T = totaux(), R = S.conf.regles, fin = e === 'rs-recap', H = heure();
    const btn = fin ? (R.paiement === 'aucun' || !T.du ? 'Confirmer la réservation' : R.paiement === 'acompte' ? 'Payer l’acompte · ' + eur(T.du) : 'Payer ' + eur(T.du)) : 'Continuer';
    const prix = !H || !S.rs.formule || toutesFormules() ? `<div class="pn-tot"><small>Prix</small><b>${H ? 'dès ' + eur(H.prix) + ' ' + uniteprix() : S.rs.formule ? 'à partir de ' + eur((formule() || {}).apartir || 0) : '—'}</b></div>`
      : `<div class="pn-tot"><small>${R.paiement === 'aucun' ? 'Total, à régler sur place' : 'Total'}</small><b data-zone="total">${eur(T.total)}</b></div>${T.remise ? `<div class="pn-l vert"><span>Codes et tickets CE</span><span>− ${eur(T.remise)}</span></div>` : ''}${R.paiement === 'acompte' ? `<div class="pn-l"><span>Acompte en ligne</span><b>${eur(T.du)}</b></div><div class="pn-l"><span>Reste sur place</span><span>${eur(T.surPlace)}</span></div>` : ''}`;
    return `<aside class="panneau ${S.pnOuvert ? 'ouvert' : ''}" aria-label="Votre réservation" style="--c:${esc(S.a.c || '#0a8fbf')}">
      <button type="button" class="pn-tete" data-a="panneau" aria-expanded="${S.pnOuvert}"><i aria-hidden="true">${emojiAct(S.a)}</i><span><small>Votre réservation</small><b>${esc(S.a.nom)}</b></span>${ic('haut', 'pn-fl')}</button>
      <div class="pn-corps"><dl class="lignes">${lignesRecap().map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('') || '<dt></dt><dd class="note">Vos choix s’affichent ici.</dd>'}</dl></div>
      <div class="pn-prix" data-zone="prix">${prix}</div>
      <div class="pn-bas"><button type="button" class="btn sec" data-a="precedent" data-e="${e}">${ic('retour')}<span>Retour</span></button><button type="button" class="btn pri" data-a="suivant" data-e="${e}" ${etapeOk(e) || ['rs-infos', 'bw-joueurs', 'rs-recap', 'rs-options'].includes(e) ? '' : 'disabled'}>${esc(btn)} ${ic('suite')}</button></div></aside>`;
  }
  function vueParcours(e) {
    return `<div class="parcours ${festif() ? 'festif' : ''}" style="--acc:${esc(accent())}">${ballons()}
      <section class="bande">${ciel()}<div class="bande-in"><p class="bande-t"><i aria-hidden="true">${emojiAct(S.a)}</i>${esc(S.a.nom)}</p>${piste(e)}</div></section>
      <div class="parcours-in"><div class="cols"><main class="etape e-${e}" id="contenu">${PAGES[e]()}</main>${panneau(e)}</div></div></div>`;
  }

  /* ------------------------------------------------------------------ Paiement simulé, fin */
  const resteDu = c => arrondi(c.total - (c.paye || 0) - (c.remise || 0) - (c.acompte || 0));
  function vuePaiement() {
    const c = S.cmd, du = resteDu(c);
    return `<main class="page etroite"><div class="carte-blanche paie"><h1>Paiement sécurisé</h1><p class="note">${esc(S.a.nom)}, réservation n° ${c.num}</p>
      <div class="cb" aria-hidden="true"><span class="cb-puce"></span><span class="cb-num">•••• •••• •••• 4242</span><span class="cb-nom">${esc((S.client || {}).nom || '')}</span></div>
      <p class="paie-mt"><small>À payer maintenant</small><b>${eur(du)}</b></p>
      ${S.refus ? `<p class="msg-err" role="alert">Paiement refusé par la banque. Réessayez ou utilisez une autre carte.</p>` : ''}
      <div class="mode-test"><span>Mode test · paiement simulé</span><div class="rangee"><button type="button" class="btn ok" data-a="simOk">${ic('ok')} Paiement accepté</button><button type="button" class="btn ko" data-a="simKo">${ic('croix')} Paiement refusé</button></div></div>
      <button type="button" class="lien" data-a="annulerPaiement">${ic('retour')} Revenir au récapitulatif</button>
      <p class="note">Votre place est gardée pendant le paiement. Le vrai paiement en ligne arrivera avec le choix du prestataire.</p></div></main>`;
  }
  function vueMerci() {
    const c = S.cmd, r = (SB.etat().reservations || []).find(x => x.id === 'k' + c.num) || {}, fest = festif(), J = jour(), T = totaux();
    const nom = (S.rs.groupe || (S.client || {}).nom || S.rs.enfant.prenom || '').trim(), t = String(TX('merci', 'titre', { nom, enfant: S.rs.enfant.prenom.trim() || nom }) || 'Merci !').replace(/\s+!/, ' !').replace(/\s{2,}/g, ' ');
    const paye = arrondi((r.paye || 0)), reste = arrondi((r.total || T.total) - paye);
    const arrivee = bowling() ? `En arrivant, tapez le numéro <b>${c.num}</b> sur une borne (« Finaliser ma commande ») : vos joueurs sont déjà inscrits${reste > 0 ? ', vous réglez le reste et' : ' et'} la borne vous envoie à l’accueil pour votre piste.` : TX('merci', 'message') ? riche(TX('merci', 'message')) : 'Présentez-vous à l’accueil un peu avant l’heure.';
    return `<section class="bande fin">${ciel()}${scene('strike')}</section><main class="page etroite fin ${fest ? 'festif' : ''}">${ballons()}<div class="carte-blanche merci" style="--acc:${esc(S.a.c || '#0a8fbf')}">${confettis()}
      ${fest ? `<div class="gateau" aria-hidden="true">${emojiAct(S.a)}</div>` : `<div class="m-ok"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54"/><path d="M36 62l16 16 32-34"/></svg></div>`}
      <p class="mot">${esc(TX('merci', 'mot') || 'C’est réservé !')}</p><h1>${esc(t)}</h1>
      <p class="m-num">Votre réservation <b>n° ${c.num}</b></p>
      <p class="m-ou">${J ? esc(dateLongue(J.iso)) + ' à <b>' + esc(hAff(S.rs.h)) + '</b> · ' : ''}${salle() ? esc(salle().nom) + ' · ' : ''}${esc(S.rs.formule)} · ${S.rs.nb} ${esc(uniteN(S.rs.nb))}</p>
      <p class="m-ou">${paye ? `<b>${eur(paye)}</b> payés en ligne${reste > 0 ? ` · reste <b>${eur(reste)}</b> ${esc(TX('merci', 'reste') || 'à régler sur place')}` : ''}` : `À régler sur place : <b>${eur(reste)}</b>`}</p>
      <div class="arrivee">${ic('info')}<p><b>Le jour J</b><br>${arrivee}</p></div>
      <p class="note">Une confirmation vous sera envoyée par e-mail (${esc((S.client || {}).email || '')}) quand l’envoi d’e-mails sera branché. Retrouvez-la dans Mon espace.</p>
      <div class="rangee"><a class="btn sec" href="#/espace">Mes réservations</a><a class="btn pri" href="#/">Réserver autre chose</a></div></div></main>`;
  }

  /* ------------------------------------------------------------------ Mon espace */
  /* les annulations se font par e-mail : le bouton prépare le message au centre (numéro, activité, jour, coordonnées) */
  function lienAnnuler(r, a) {
    const e = emailCentre(); if (!e) return `<button type="button" class="btn sec petit" data-a="annulerInfo">Annuler</button>`;
    const quand = dateLongue(SB.temps.isoDeJour(r.jour)) + ' à ' + hAff(SB.outils.hm(r.debut)), c = S.client || {};
    const sujet = 'Demande d’annulation · réservation n° ' + r.num, corps = 'Bonjour,\n\nJe souhaite annuler ma réservation n° ' + r.num + ' : ' + a.nom + ' (' + r.formule + '), le ' + quand + ', ' + r.pers + ' pers.\n\n' + (c.nom || '') + '\n' + (c.tel || '') + '\n' + (c.email || '');
    return `<a class="btn sec petit" href="mailto:${esc(e)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}">Annuler</a>`;
  }
  function vueEspace() {
    if (!S.client) return `<main class="page etroite"><header class="et-tete"><h1>Mon espace</h1><p class="sous">Créez votre compte ou connectez-vous pour retrouver vos réservations.</p></header><div class="carte-blanche">${blocCompte()}</div></main>`;
    const now = SB.temps.maintenant(), R = SB.api.clients.reservations(S.client.id), A = SB.etat().config.activites || [];
    const avenir = R.filter(r => r.jour > now.j || (r.jour === now.j && r.debut + (r.duree || 0) >= now.min)).reverse(), passees = R.filter(r => !avenir.includes(r));
    const carte = r => { const a = A.find(x => x.id === r.act) || { id: r.act, nom: r.act }, reste = arrondi(r.total - (r.paye || 0));
      return `<article class="ma-resa" style="--c:${esc(a.c || '#0a8fbf')}"><i aria-hidden="true">${emojiAct(a)}</i><div class="grow"><b>${esc(a.nom)} · ${esc(r.formule)}</b><span>${esc(dateLongue(SB.temps.isoDeJour(r.jour)))} à <b>${hAff(SB.outils.hm(r.debut))}</b> · ${r.pers} pers.${r.titre ? ' · ' + esc(r.titre) : ''}</span>
        <small>N° ${r.num} · ${r.attente ? 'paiement en cours' : !reste ? 'payée' : r.paye ? eur(r.paye) + ' payés · reste ' + eur(reste) + ' sur place' : eur(reste) + ' à régler sur place'}${r.act === 'bowling' && r.etatV !== 'validee' && avenir.includes(r) ? ' · le jour J, tapez ce numéro sur une borne' : ''}</small></div><span class="etat ${r.etatV === 'absente' ? 'ko' : r.etatV === 'validee' ? 'ok' : ''}">${r.etatV === 'absente' ? 'annulée' : r.etatV === 'validee' ? 'validée' : 'confirmée'}</span>${avenir.includes(r) && r.etatV !== 'absente' && r.etatV !== 'validee' ? lienAnnuler(r, a) : ''}</article>`; };
    const c = S.client;
    return `<main class="page etroite"><header class="et-tete"><h1>Bonjour ${esc(c.nom.split(' ')[0])} !</h1><p class="sous">Vos réservations et vos coordonnées.</p></header>
      <section class="carte-blanche"><h2 class="h2">Mes réservations à venir</h2>${avenir.map(carte).join('') || '<p class="note">Aucune réservation à venir. <a href="#/">Réserver une activité</a></p>'}</section>
      ${passees.length ? `<section class="carte-blanche"><h2 class="h2">Déjà passées</h2>${passees.map(carte).join('')}</section>` : ''}
      <section class="carte-blanche"><h2 class="h2">Mes coordonnées</h2>
        <form data-form="profil" data-champ="profil" class="grille-champs" novalidate><label>Nom et prénom<input name="nom" value="${esc(c.nom)}" autocomplete="name"></label><label>Téléphone<input name="tel" type="tel" value="${esc(c.tel)}" autocomplete="tel"></label>
          <label>E-mail<input name="email" type="email" value="${esc(c.email)}" autocomplete="email"></label><label>Nouveau mot de passe<input name="mdp" type="password" autocomplete="new-password" placeholder="Laisser vide pour le garder"></label>
          <button type="submit" class="btn pri">Enregistrer</button></form></section>
      <p class="note">Pour annuler une réservation, le bouton « Annuler » prépare un e-mail à l’accueil ; l’équipe vous répond selon les <a href="#/cgv">conditions d’annulation</a>.</p>
      <p class="centre"><button type="button" class="lien" data-a="deconnexion">${ic('sortie')} Se déconnecter</button></p></main>`;
  }

  /* ------------------------------------------------------------------ Infos pratiques et textes légaux
     Modèles de base, remplis avec l'établissement (CRM › Paramétrage › Établissement) ; « [à compléter] » là où il manque une information.
     À faire relire par un professionnel avant la mise en ligne. */
  const nomC = () => champC('nom', 'Space Bowling'), raisonC = () => champC('raison'), mailC = () => champC('email'), telC = () => champC('tel'), adrC = () => champC('adresse');
  const TEXTES = {
    infos: ['Infos pratiques', () => { const H = centre().horaires || {};
      return `<p><b>${nomC()}</b><br>${adrC()}<br>${telC()} · ${mailC()}</p>
        ${!H.normal ? '' : `<h2>Horaires d’ouverture</h2><div class="scrollx"><table class="horaires"><thead><tr><th></th><th>Période scolaire</th><th>Vacances, veilles et jours fériés</th></tr></thead><tbody>${JOURS.map((j, i) => `<tr><td>${j}</td><td>${esc(plage((H.normal || [])[i]) || 'Fermé')}</td><td>${esc(plage((H.vacances || [])[i]) || 'Fermé')}</td></tr>`).join('')}</tbody></table></div>`}
        <h2>Le jour de votre venue</h2><p>Présentez-vous un peu avant l’heure réservée. Pour le bowling, tapez votre numéro de réservation sur une borne (« Finaliser ma commande ») : vos joueurs sont déjà inscrits.</p>
        <h2>Annuler une réservation</h2><p>Depuis Mon espace, bouton « Annuler », ou par e-mail à ${mailC()}, en indiquant votre numéro de réservation.</p>`; }],
    cgv: ['Conditions générales de vente', () => `<p class="note">Réservation en ligne des activités de ${nomC()}. Dernière mise à jour : [date].</p>
      <h2>1. Objet</h2><p>Les présentes conditions s’appliquent aux réservations faites sur ce site auprès de ${raisonC()}, ${adrC()} (ci-après « le centre »). Réserver vaut acceptation de ces conditions.</p>
      <h2>2. Compte client</h2><p>Un compte est nécessaire pour réserver. Vous vous engagez à donner des coordonnées exactes (nom, téléphone, e-mail) et à garder votre mot de passe pour vous.</p>
      <h2>3. Réservation</h2><p>Vous choisissez l’activité, la formule, le jour, l’heure et le nombre de participants. La réservation est confirmée à l’affichage de son numéro, que vous retrouvez dans Mon espace. La place est gardée pendant le paiement.</p>
      <h2>4. Prix</h2><p>Les prix sont indiqués en euros, toutes taxes comprises. Ils dépendent du jour, de l’heure et du nombre de participants. Le prix applicable est celui affiché au moment de la réservation.</p>
      <h2>5. Paiement</h2><p>Selon l’activité : paiement sur place le jour venu, acompte en ligne (déduit du total, le reste se règle sur place) ou paiement total en ligne. Le paiement en ligne est assuré par [prestataire de paiement] ; le centre n’a jamais accès à vos coordonnées bancaires. Les codes promotionnels et tickets CE s’appliquent selon leurs propres conditions.</p>
      <h2>6. Le jour de votre venue</h2><p>Présentez-vous [10] minutes avant l’heure réservée. En cas de retard, la durée de l’activité peut être réduite ; au-delà de [délai], la réservation peut être annulée sans remboursement. [À préciser.]</p>
      <h2>7. Annulation et modification</h2><p>Toute demande d’annulation ou de modification se fait par e-mail à ${mailC()} (bouton « Annuler » de Mon espace), en indiquant le numéro de réservation. Conditions : [délai d’annulation, remboursement ou non de l’acompte, à préciser]. Conformément à l’article L221-28 12° du Code de la consommation, le droit de rétractation ne s’applique pas aux prestations de loisirs fournies à une date déterminée.</p>
      <h2>8. Mineurs et sécurité</h2><p>Les mineurs restent sous la responsabilité d’un adulte. Les participants respectent les consignes de sécurité de chaque activité et le règlement intérieur du centre. [Âges minimum, accompagnement des anniversaires : à préciser.]</p>
      <h2>9. Responsabilité</h2><p>Le centre n’est pas responsable des objets personnels perdus ou volés. [À compléter.]</p>
      <h2>10. Données personnelles</h2><p>Voir la <a href="#/confidentialite">politique de confidentialité</a>.</p>
      <h2>11. Litiges</h2><p>Les présentes conditions sont soumises au droit français. En cas de litige, vous pouvez recourir gratuitement au médiateur de la consommation : ${champC('mediateur')}. À défaut d’accord, les tribunaux compétents sont ceux du lieu du centre.</p>`],
    mentions: ['Mentions légales', () => `<h2>Éditeur du site</h2><p>${raisonC()}<br>${adrC()}<br>SIRET ${champC('siret')} · RCS ${champC('rcs')} · TVA ${champC('tva')}<br>${telC()} · ${mailC()}</p>
      <h2>Responsable de la publication</h2><p>${champC('directeur')}</p>
      <h2>Hébergement</h2><p>${champC('hebergeur')}</p>
      <h2>Propriété intellectuelle</h2><p>Les textes, photos, logos et éléments graphiques de ce site appartiennent à ${raisonC()} ou à leurs auteurs. Toute reproduction sans autorisation est interdite.</p>`],
    confidentialite: ['Politique de confidentialité', () => `<p class="note">Comment ${nomC()} utilise vos données. Dernière mise à jour : [date].</p>
      <h2>Responsable du traitement</h2><p>${raisonC()}, ${adrC()}. Contact : ${mailC()}.</p>
      <h2>Données collectées</h2><p>Votre compte (nom, e-mail, téléphone, mot de passe) ; vos réservations (activité, jour, heure, participants, prénoms des joueurs, prénom et date de naissance de l’enfant fêté pour un anniversaire) ; les références de paiement (jamais votre numéro de carte, traité par le prestataire de paiement).</p>
      <h2>Pourquoi</h2><p>Gérer vos réservations et votre compte, vous contacter à leur sujet (confirmation, rappel, imprévu), tenir la comptabilité. Aucune prospection commerciale sans votre accord.</p>
      <h2>Base légale</h2><p>L’exécution de votre réservation (contrat), nos obligations comptables (obligation légale), votre consentement pour toute communication commerciale.</p>
      <h2>Qui y a accès</h2><p>L’équipe du centre, et nos prestataires techniques pour notre compte uniquement : hébergement, paiement, envoi d’e-mails.</p>
      <h2>Durée de conservation</h2><p>Votre compte : jusqu’à sa suppression, ou [3 ans] sans activité. Les pièces comptables : 10 ans, comme la loi l’impose.</p>
      <h2>Vos droits</h2><p>Accès, rectification, effacement, opposition, limitation et portabilité : écrivez à ${mailC()}. Vous pouvez aussi saisir la CNIL (cnil.fr). Vos coordonnées se modifient directement dans Mon espace.</p>
      <h2>Cookies</h2><p>Ce site n’utilise aucun cookie publicitaire ni de mesure d’audience. Il garde seulement, dans votre navigateur, de quoi rester connecté à votre compte.</p>`]
  };
  const vueTexte = k => `<main class="page etroite texte"><header class="et-tete"><h1>${esc(TEXTES[k][0])}</h1></header><div class="carte-blanche">${TEXTES[k][1]()}</div><p class="centre"><a class="lien" href="#/">${ic('retour')} Retour aux activités</a></p></main>`;

  /* ------------------------------------------------------------------ Rendu */
  function vueVide() {
    return `<main class="page etroite"><div class="carte-blanche centre"><h1>Site en préparation</h1><p class="sous">La sandbox de ce navigateur n’a pas encore de données : ouvrez une fois le CRM (<a href="../maquettes/e-v2.html">maquettes/e-v2.html</a>) dans ce même navigateur, puis revenez ici.</p></div></main>`;
  }
  function rendre(garderDefilement) {
    const R = lireRoute(), y = window.scrollY;
    fermerModale();
    let corps;
    if (!SB.pret()) { S.route = 'vide'; corps = vueVide(); }
    else {
      majClient();
      if (R.vue === 'parcours') {
        if (R.act !== S.act && !demarrer(R.act)) return aller('');
        const L = etapes(), e = L.includes(R.etape) ? R.etape : L[0], k = L.indexOf(e), manque = L.slice(0, k).find(x => !etapeOk(x));
        if (manque) return aller(S.act + '/' + manque);
        if (e !== R.etape) return aller(S.act + '/' + e);
        S.route = 'parcours'; S.etape = e;
        if (e === 'rs-date') chargerJours(true);
        corps = vueParcours(e);
      } else if (R.vue === 'paiement' || R.vue === 'merci') {
        if (!S.cmd) return aller('');
        S.route = R.vue; corps = R.vue === 'paiement' ? vuePaiement() : vueMerci();
      } else if (R.vue === 'espace') { S.route = 'espace'; corps = vueEspace(); }
      else if (TEXTES[R.vue]) { S.route = R.vue; corps = vueTexte(R.vue); }
      else { S.route = 'accueil'; corps = vueAccueil(); }
    }
    document.body.dataset.vue = S.route;
    $('#app').innerHTML = entete() + corps + pied();
    window.scrollTo(0, garderDefilement ? y : 0);
    monterRoue();
  }
  const zone = (n, html) => $$('[data-zone="' + n + '"]').forEach(el => { el.innerHTML = html; });
  function majPanneau() { if (S.route !== 'parcours') return; const p = $('.panneau'); if (!p) return; const t = document.createElement('div'); t.innerHTML = panneau(S.etape); p.replaceWith(t.firstElementChild); }
  function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 3200); }
  /* un champ manquant ou refusé : message sous le champ, on y descend ; rien n'est redessiné (ce qui est tapé reste) */
  function signaler(champ, msg, focus) {
    S.erreur = [champ, msg];
    $$('[data-champ].err').forEach(x => { x.classList.remove('err'); const m = x.querySelector('.msg-err'); if (m) m.remove(); });
    const el = $(`[data-champ="${champ}"]`); if (!el) return;
    el.classList.add('err'); el.classList.remove('secoue'); void el.offsetWidth; el.classList.add('secoue');
    if (msg) { const m = document.createElement('p'); m.className = 'msg-err'; m.setAttribute('role', 'alert'); m.textContent = msg; el.appendChild(m); }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const i = (focus && el.querySelector(`[name="${focus}"]`)) || el.querySelector('input'); if (i) setTimeout(() => i.focus({ preventScroll: true }), 300);
  }
  function manqueInfos() {
    const r = S.rs, I = k => TX('rs-infos', k);
    if (bowling()) {
      if (!r.groupe.trim()) return ['groupe', 'Donnez un nom à votre groupe.'];
      const i = Array.from({ length: r.nb }, (_, k) => r.joueurs[k] || { prenom: '' }).findIndex(j => !j.prenom.trim()); if (i >= 0) return ['joueur-' + i, 'Indiquez le prénom du joueur ' + (i + 1) + '.'];
    } else {
      if (I('enfant') && !r.enfant.prenom.trim()) return ['enfant', 'Indiquez le prénom de l’enfant.'];
      if (I('enfant') && !r.enfant.naissance) return ['naissance', 'Indiquez sa date de naissance.'];
      if (I('groupe') && I('groupeOblig') && !r.groupe.trim()) return ['groupe', 'Indiquez le nom du groupe.'];
      if (I('prenoms') && I('prenomsOblig') && Array.from({ length: r.nb }, (_, k) => (r.prenoms[k] || '').trim()).some(x => !x)) return ['prenoms', 'Indiquez les prénoms de tous les participants.'];
    }
    if (!S.client) return ['compte', 'Créez votre compte ou connectez-vous pour réserver.'];
    return null;
  }
  function donneesResa() {
    const r = S.rs, E = etapes(), I = k => E.includes('rs-infos') && TX('rs-infos', k), c = S.client;
    return { canal: 'web', act: S.act, nom: titreResa() || S.a.nom, lieu: 'Site web', ts: Date.now(), lignes: [], remises: r.remises.map(x => ({ code: x.code })),
      reservation: { formule: r.formule, salle: r.salle || null, j: r.j, h: r.h, nb: r.nb, tranche: (tranche() || {}).lib || '', options: options(), compte: c.id,
        groupe: bowling() || I('groupe') ? r.groupe.trim() : '', prenoms: bowling() ? r.joueurs.map(j => j.prenom.trim()) : I('prenoms') ? Array.from({ length: r.nb }, (_, i) => (r.prenoms[i] || '').trim()) : [],
        joueurs: bowling() ? r.joueurs.slice(0, r.nb).map(j => ({ prenom: j.prenom.trim(), barrieres: !!j.barrieres })) : undefined,
        enfant: I('enfant') ? { prenom: r.enfant.prenom.trim(), naissance: r.enfant.naissance, age: r.enfant.age } : null, contact: { nom: c.nom, tel: c.tel, email: c.email } } };
  }
  /* la commande (et la place) est créée tout de suite ; rien à payer en ligne : c'est fini */
  function reserver() {
    if (!S.rs.cgv) return signaler('cgv', 'Cochez cette case pour réserver.');
    const m = manqueInfos(); if (m) { S.erreur = m; return aller(S.act + '/' + (bowling() ? 'bw-joueurs' : 'rs-infos')); }
    const r = SB.api.bar.commander(donneesResa(), SRC);
    if (!r.ok) {
      toast(r.raison);
      if (r.code === 'creneau') { S.rs.h = null; S.jours = null; return aller(S.act + '/rs-date'); }
      if (r.refus) { S.rs.remises = S.rs.remises.filter(x => !r.refus.some(y => y.code === x.code)); rendre(true); }
      return;
    }
    S.cmd = r.commande; S.refus = false; S.erreur = null;
    aller(S.cmd.etat === 'validee' ? 'merci' : 'paiement');
  }
  function majJoueursBw() {
    chargerJours(false);
    if (!heure()) { toast('Plus assez de pistes libres à cette heure pour ' + S.rs.nb + ' joueurs : choisissez une autre heure.'); return aller(S.act + '/rs-date'); }
    zone('joueurs', joueursBw()); majPanneau();
  }
  /* le client quitte le paiement sans payer : la place gardée est rendue */
  function abandonner() { if (S.cmd && S.cmd.etat === 'paiement' && !(S.cmd.paye > 0)) { SB.api.bar.abandonner(S.cmd.num, SRC); S.cmd = null; } }

  /* ------------------------------------------------------------------ Actions (data-a="…") */
  const A = {
    choisirAct(d, el, ev) { ev.preventDefault(); S.act = null; aller(d.act); },
    etape(d) { allerEtape(d.e); },
    salle(d) { S.rs.salle = d.s; S.rs.j = null; S.rs.h = null; S.rs.mois = null; S.jours = null; if (S.rs.formule && !formules().some(f => f.nom === S.rs.formule)) S.rs.formule = null; const [a, b] = bornesNb(); S.rs.nb = Math.min(b, Math.max(a, S.rs.nb)); allerEtape(suivante('rs-salle')); },
    age(d) { S.rs.tranche = d.t; if (S.rs.formule && !formules().some(f => f.nom === S.rs.formule)) S.rs.formule = null; allerEtape(suivante('rs-age')); },
    formule(d, el) { if (mobile() && !(el && el.closest && el.closest('.modale'))) return ficheFormule(d.f); A.formuleOk(d); },
    formuleOk(d) { fermerModale(); choisirFormule(d.f); S.jours = null; allerEtape(suivante('rs-formule')); },
    fermerModale(d, el, ev) { if (el.classList.contains('voile-m') && ev.target !== el) return; fermerModale(); },
    roue(d) { tourner(roue.cible + +d.d); },
    roueCarte(d, el) { const r = $('[data-roue]'); if (r && r.dataset.glisse) return; const i = +d.i;
      if (i === indexRoue(roue.cible)) return A.formule({ f: formules()[i].nom });
      tourner(roue.cible + ecart(i, roue.cible, nRoue())); },
    nb(d) { const [a, b] = bornesNb(), n0 = S.rs.nb; S.rs.nb = Math.max(a, Math.min(b, S.rs.nb + +d.d));
      if (avantDate(S.etape)) { S.jours = null; S.rs.h = null; }                       // le jour se choisira après, pour ce nombre
      else if (dateAvant() && S.rs.h) {                                              // le jour est déjà choisi : il doit rester de la place
        if (!formules().length) { const n = S.rs.nb; S.rs.nb = n0; return toast('Plus assez de place à ' + hAff(S.rs.h) + ' pour ' + n + ' ' + unite() + ' : choisissez une autre heure.'); }
        if (S.rs.formule && !formules().some(f => f.nom === S.rs.formule)) { S.rs.formule = null; toast('Cette formule n’est plus libre à cette heure pour ' + S.rs.nb + ' ' + unite() + ' : choisissez-en une autre.'); }
        S.jours = null;
      }
      zone('nb', compteur()); zone('quilles', quillesBw(S.rs.nb > n0)); zone('formulesBw', formulesBw()); majPanneau(); },
    formuleBw(d) { choisirFormule(d.f); S.jours = null; $$('.formule').forEach(b => { b.classList.toggle('on', b.dataset.f === d.f); b.setAttribute('aria-pressed', b.dataset.f === d.f); }); majPanneau(); },
    /* un joueur de plus ou de moins après le choix de l'heure : on revérifie qu'il reste assez de pistes, et le prix */
    bwAjout() { const [, ma] = bornesNb(); if (S.rs.nb >= ma) return; S.rs.nb++; S.rs.joueurs.push({ prenom: '', barrieres: false }); majJoueursBw(); const L = $$('[data-f^="joueur."]'), x = L[L.length - 1]; if (x) x.focus(); },
    bwSuppr(d) { const [mi] = bornesNb(); if (S.rs.nb <= mi) return; S.rs.joueurs.splice(+d.i, 1); S.rs.nb--; majJoueursBw(); },      // après le jour (anniversaire) : le moteur revérifie la place à la commande
    jour(d) { S.rs.j = +d.j; S.rs.h = null; $$('.an-j.dispo').forEach(b => { b.classList.toggle('on', +b.dataset.j === S.rs.j); b.setAttribute('aria-pressed', +b.dataset.j === S.rs.j); }); zone('heures', heures()); majPanneau();
      if (window.matchMedia('(max-width: 899px)').matches) { const h = $('.heures-col'); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
    mois(d) { const M = moisL(), x = M[M.indexOf(S.rs.mois || (jour() || S.jours.find(z => z.heures.length) || S.jours[0]).iso.slice(0, 7)) + +d.d]; if (x) { S.rs.mois = x; zone('cal', calendrier()); } },
    heure(d) { S.rs.h = d.h; if (dateAvant() && S.rs.formule && !formules().some(f => f.nom === S.rs.formule)) S.rs.formule = null;
      $$('.an-h').forEach(b => { b.classList.toggle('on', b.dataset.h === d.h); b.setAttribute('aria-pressed', b.dataset.h === d.h); }); if (S.rs.enfant.naissance) S.rs.enfant.age = null; majPanneau(); },
    choix(d) { S.rs.choix[d.o] = +d.c; $$(`.an-c[data-o="${CSS.escape(d.o)}"]`).forEach(b => { b.classList.toggle('on', +b.dataset.c === +d.c); b.setAttribute('aria-pressed', +b.dataset.c === +d.c); }); majPanneau(); },
    qte(d) { const o = S.conf.options.find(x => x.id === d.o); S.rs.qte[d.o] = Math.max(0, Math.min(+o.max || 9, (S.rs.qte[d.o] || 0) + +d.d)); zone('qte-' + d.o, qte(o)); majPanneau(); },
    ageFete(d) { S.rs.enfant.age = Math.max(1, Math.min(99, (S.rs.enfant.age || 1) + +d.d)); zone('ageFete', ageFeteHtml()); },
    barr(d, el) { const j = S.rs.joueurs[+d.i]; j.barrieres = !j.barrieres; el.classList.toggle('on', j.barrieres); el.setAttribute('aria-pressed', j.barrieres); },
    panneau() { S.pnOuvert = !S.pnOuvert; const p = $('.panneau'); if (p) { p.classList.toggle('ouvert', S.pnOuvert); p.querySelector('.pn-tete').setAttribute('aria-expanded', S.pnOuvert); } },
    precedent(d) { S.erreur = null; allerEtape(precedente(d.e)); },
    suivant(d) {
      const e = d.e; S.erreur = null;
      if (e === 'rs-recap') return reserver();
      if (e === 'rs-options') { const o = S.conf.options.find(x => x.type === 'choix' && x.obligatoire && !(S.rs.choix[x.id] >= 0)); if (o) return signaler('opt-' + o.id, 'Faites votre choix : ' + o.nom.toLowerCase() + '.'); }
      if (e === 'rs-infos' || e === 'bw-joueurs') { const m = manqueInfos(); if (m) return signaler(m[0], m[1]); }
      if (!etapeOk(e)) return;
      if (e === 'rs-date' && dateAvant()) S.jours = null;                            // ensuite, les heures et les prix de la formule choisie
      allerEtape(suivante(e));
    },
    onglet(d) { S.onglet = d.o; S.erreur = null; rendre(true); },
    deconnexion() { poserSession(null); S.client = null; S.erreur = null; rendre(true); },
    retireCode(d) { S.rs.remises.splice(+d.i, 1); zone('remises', remises()); majPanneau(); },
    simOk() { const c = S.cmd, du = resteDu(c), r = SB.api.bar.payer(c.num, { moyen: 'En ligne', montant: du, lignes: (c.lignes || []).map(l => l.slice()), ok: true, op: c.num + '-' + Date.now().toString(36), ts: Date.now() }, SRC);
      if (!r.ok) return toast(r.raison); S.cmd = r.commande; S.refus = false; aller('merci'); },
    simKo() { const c = S.cmd; SB.api.bar.payer(c.num, { moyen: 'En ligne', montant: resteDu(c), lignes: [], ok: false, op: c.num + '-' + Date.now().toString(36), ts: Date.now() }, SRC); S.refus = true; rendre(true); },
    annulerPaiement() { abandonner(); aller(S.act + '/rs-recap'); },
    annulerInfo() { toast('Pour annuler, appelez l’accueil' + (val('tel') ? ' au ' + val('tel') : '') + ' : l’e-mail du centre n’est pas encore renseigné.'); }
  };
  /* formulaires : compte, connexion, profil, code promo (Entrée valide, comme le bouton) */
  const FORMS = {
    creer(f) { const r = SB.api.clients.creer({ nom: f.nom.value, tel: f.tel.value, email: f.email.value, mdp: f.mdp.value }, SRC);
      if (!r.ok) return signaler('compte', r.raison, r.champ); poserSession(r.client.id); S.erreur = null; toast('Compte créé : bienvenue ' + r.client.nom.split(' ')[0] + ' !'); rendre(true); },
    connexion(f) { const r = SB.api.clients.connecter(f.email.value, f.mdp.value, SRC);
      if (!r.ok) return signaler('compte', r.raison, 'mdp'); poserSession(r.client.id); S.erreur = null; toast('Connecté : bonjour ' + r.client.nom.split(' ')[0] + ' !'); rendre(true); },
    profil(f) { const d = { nom: f.nom.value, tel: f.tel.value, email: f.email.value }; if (f.mdp.value) d.mdp = f.mdp.value;
      const r = SB.api.clients.modifier(S.client.id, d, SRC); if (!r.ok) return signaler('profil', r.raison, r.champ); S.erreur = null; toast('Coordonnées enregistrées'); rendre(true); },
    code() {
      const code = (S.rs.saisie || '').trim(), err = t => { const e = $('[data-ce-err]'); if (e) e.textContent = t; };
      if (!code) return err('Tapez votre code.');
      if (S.rs.remises.some(r => r.code.replace(/[\s-]/g, '').toUpperCase() === code.replace(/[\s-]/g, '').toUpperCase())) return err('Ce code est déjà appliqué.');
      if (totaux().du <= 0) return err('Votre paiement en ligne est déjà entièrement couvert.');
      const r = SB.api.tickets.verifier(code, S.act); if (!r.ok) return err(r.raison);
      S.rs.remises.push({ code: r.code, valeur: r.valeur, contenu: r.contenu }); S.rs.saisie = ''; const i = $('[data-f="code"]'); if (i) i.value = '';
      err(''); zone('remises', remises()); majPanneau(); toast('Code accepté : − ' + eur(r.valeur));
    }
  };
  /* saisies : l'état suit la frappe, sans redessiner la page */
  function saisie(f, v, el) {
    const r = S.rs, p = f.split('.');
    if (f === 'groupe') r.groupe = v; else if (f === 'enfant') r.enfant.prenom = v; else if (f === 'code') r.saisie = v; else if (f === 'cgv') r.cgv = el.checked;
    else if (f === 'naissance') { r.enfant.naissance = v; r.enfant.age = null; zone('ageFete', ageFeteHtml()); }
    else if (p[0] === 'joueur') { r.joueurs[+p[1]].prenom = v; } else if (p[0] === 'prenom') r.prenoms[+p[1]] = v;
    if (S.erreur && el.closest(`[data-champ="${S.erreur[0]}"]`)) { const c = el.closest('[data-champ]'); c.classList.remove('err'); const m = c.querySelector('.msg-err'); if (m) m.remove(); S.erreur = null; }
  }

  const CHOIX = ['salle', 'age', 'formule', 'formuleBw', 'jour', 'heure', 'choix', 'barr', 'roueCarte'];
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]'); if (!el || !A[el.dataset.a]) return;
    if (CHOIX.includes(el.dataset.a) && e.clientX) eclat(e.clientX, e.clientY, getComputedStyle(el).getPropertyValue('--c').trim() || getComputedStyle(el).getPropertyValue('--acc').trim() || '#00aee0');
    A[el.dataset.a](el.dataset, el, e);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fermerModale(); });
  document.addEventListener('input', e => { const f = e.target.dataset && e.target.dataset.f; if (f && S.rs) saisie(f, e.target.value, e.target); });
  document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.f === 'cgv' && S.rs) saisie('cgv', '', e.target); });
  document.addEventListener('submit', e => { const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault(); FORMS[f.dataset.form](f.elements, f); });
  let routePrec = location.hash;
  window.addEventListener('hashchange', () => { if (/^#\/?paiement$/.test(routePrec) && !/^#\/?merci$/.test(location.hash)) abandonner(); routePrec = location.hash; S.pnOuvert = false; rendre(); });
  /* ponytail: page fermée pendant le paiement : la place est rendue tout de suite ; le serveur fera expirer les paiements jamais terminés */
  window.addEventListener('pagehide', () => { if (S.route === 'paiement') abandonner(); });

  /* le CRM, le comptoir ou une borne change quelque chose : l'accueil, les heures libres et Mon espace suivent */
  if (window.SB) SB.ecouter(m => {
    if (m.local || m.evt) return;
    const f = document.activeElement;
    if (f && /INPUT|TEXTAREA|SELECT/.test(f.tagName)) return;
    if (S.route === 'accueil' || S.route === 'espace' || S.route === 'vide') return rendre(true);
    memoDispo.k = null;
    if (S.route === 'parcours' && S.etape === 'rs-date') { chargerJours(true); zone('cal', calendrier()); zone('heures', heures()); majPanneau(); }
  });

  window.__resa = { S, rendre };            // tests
  rendre();
})();
