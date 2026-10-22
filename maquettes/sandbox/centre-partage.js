/* =====================================================================
   SpaceBowling Engine — SANDBOX PARTAGÉE  (CRM e-v2  ⇄  front employé)

   Un seul état pour les deux écrans, rangé dans le navigateur
   (localStorage, clés « sbx:* »), synchronisé en direct entre onglets.

   Le CRM est la source de la configuration (activités, salles, formules,
   créneaux) ; le front employé lit cette configuration et écrit des
   réservations, des fermetures de créneaux, des blocages de salle et des
   chronos. Les deux recalculent la disponibilité avec le MÊME moteur
   (SB.moteur), donc ce que le site web propose est toujours ce que le
   comptoir voit.

   SB.api reprend les routes du contrat d'API (claude/Contrat_API_v0.md,
   section « Front employé ») : le jour où le serveur existe, on remplace
   le corps de ces fonctions par un fetch() ; les écrans ne changent pas.
   ===================================================================== */
(function () {
  'use strict';

  /* tests (tests/index.html) : une page ouverte dans le lanceur de tests travaille sur sa propre sandbox (clés « sbx-test:* »,
     canal « sbx-test ») ; la vraie sandbox et les onglets ouverts à côté ne voient rien */
  const ESPACE = (() => { try { return window.top !== window ? String(window.top.SBX_ESPACE || '') : ''; } catch (e) { return ''; } })();
  const P = ESPACE ? 'sbx-' + ESPACE + ':' : 'sbx:';
  const VERSION = 1;
  const TRANCHES = ['config', 'creneaux', 'reservations', 'blocages', 'chronos', 'reglages', 'ventes', 'tickets', 'clients'];
  const ONGLET = Math.random().toString(36).slice(2, 8);   // identifie cet onglet dans les messages

  /* ------------------------------------------------------------------
     Petits outils (mêmes conventions que le CRM)
     ------------------------------------------------------------------ */
  const hm = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const mn = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dateIso = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const lundiDe = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const copie = o => o == null ? o : JSON.parse(JSON.stringify(o));
  const eur = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
  const dureeTxt = m => m >= 60 ? (m % 60 ? Math.floor(m / 60) + ' h ' + (m % 60) : (m / 60) + ' h') : m + ' min';

  /* ------------------------------------------------------------------
     Stockage : une clé par tranche, une clé « rev:<tranche> » pour détecter
     les changements, une clé « evt » pour les événements temps réel.
     Le repère de version est unique à chaque écriture et propre à chaque
     tranche : deux onglets qui écrivent en même temps (CRM et borne) ne
     peuvent plus effacer la trace de l'autre.
     ------------------------------------------------------------------ */
  const cache = {};          // cle -> { raw, rev, src, data }
  let connus = {};           // cle -> rev déjà vue par cet onglet
  const ecouteurs = [];

  function brut(cle) { try { return localStorage.getItem(P + cle); } catch (e) { return null; } }
  function poser(cle, valeur) { try { localStorage.setItem(P + cle, valeur); return true; } catch (e) { console.error('[sandbox] écriture impossible', cle, e); return false; } }
  function revs() { const o = {}; TRANCHES.forEach(k => { const v = brut('rev:' + k); if (v) o[k] = v; }); return o; }

  function lire(cle) {
    const s = brut(cle);
    if (!s) return null;
    const c = cache[cle];
    if (c && c.raw === s) return c.data;
    try { const o = JSON.parse(s); cache[cle] = { raw: s, rev: o.rev, src: o.src, t: o.t, data: o.data }; return o.data; }
    catch (e) { console.error('[sandbox] tranche illisible', cle, e); return null; }
  }
  const info = cle => { lire(cle); return cache[cle] || null; };

  function ecrire(cle, data, src) {
    const rev = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const o = { rev, src: src || ONGLET, t: Date.now(), data };
    const s = JSON.stringify(o);
    if (!poser(cle, s)) return false;
    poser('rev:' + cle, rev);
    cache[cle] = { raw: s, rev, src: o.src, t: o.t, data };
    connus[cle] = rev;
    return true;
  }

  /* Lecture-modification-écriture sur la version la plus fraîche (jamais sur une copie périmée) */
  function modifier(cle, fn, src) {
    const s = brut(cle);
    let data = null;
    try { data = s ? JSON.parse(s).data : null; } catch (e) { data = null; }
    const res = fn(data);
    const final = res === undefined ? data : res;
    ecrire(cle, final, src);
    signaler([cle], src, true);
    return final;
  }

  /* Journal : chaque événement émis est gardé (les 300 derniers), lu par CRM › Paramétrage › Journal — GET /api/journal.
     ponytail: dans le navigateur comme le reste ; le serveur tiendra un vrai journal d'audit (qui, quand, depuis où). */
  function journaliser(ev) {
    const J = (lire('journal') || []).slice(-299);
    J.push({ id: ev.id, t: ev.t, type: ev.type, src: ev.src, d: ev.details });
    ecrire('journal', J, ev.src);
  }

  /* ---- Événements temps réel (équivalent de WS /ws/temps-reel) ---- */
  let bc = null;
  try { bc = new BroadcastChannel(ESPACE ? 'sbx-' + ESPACE : 'sbx'); } catch (e) { bc = null; }

  function emettre(type, details, src) {
    const ev = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type, details: details || {}, src: src || ONGLET, onglet: ONGLET, t: Date.now() };
    poser('evt', JSON.stringify(ev));
    journaliser(ev);
    try { bc && bc.postMessage({ k: 'evt', ev }); } catch (e) { /* ignore */ }
    ecouteurs.forEach(fn => { try { fn({ cles: [], evt: ev, local: true }); } catch (e) { console.error(e); } });
    return ev;
  }

  const vus = new Set();
  function signaler(cles, src, local) {
    if (local) { try { bc && bc.postMessage({ k: 'maj', cles, onglet: ONGLET }); } catch (e) { /* ignore */ } }
    ecouteurs.forEach(fn => { try { fn({ cles, src, local: !!local }); } catch (e) { console.error(e); } });
  }
  function verifier() {
    const r = revs(), ch = [];
    Object.keys(r).forEach(k => { if (connus[k] !== r[k]) { connus[k] = r[k]; ch.push(k); } });
    if (ch.length) signaler(ch, (info(ch[0]) || {}).src, false);
  }
  function recevoirEvt(ev) {
    if (!ev || vus.has(ev.id) || ev.onglet === ONGLET) return;
    vus.add(ev.id);
    ecouteurs.forEach(fn => { try { fn({ cles: [], evt: ev, local: false }); } catch (e) { console.error(e); } });
  }
  window.addEventListener('storage', e => {
    if (!e.key || !e.key.startsWith(P)) { if (e.key === null) verifier(); return; }
    if (e.key === P + 'evt') { try { recevoirEvt(JSON.parse(e.newValue)); } catch (x) { /* ignore */ } return; }
    verifier();
  });
  if (bc) bc.onmessage = m => { const d = m.data || {}; if (d.onglet === ONGLET) return; if (d.k === 'evt') recevoirEvt(d.ev); else verifier(); };
  setInterval(verifier, 1500);           // filet de sécurité (file://, onglet en veille…)
  setInterval(() => { try { const ev = JSON.parse(brut('evt') || 'null'); if (ev && Date.now() - ev.t < 4000) recevoirEvt(ev); } catch (e) { /* ignore */ } }, 1500);

  /* ------------------------------------------------------------------
     Fusion à trois (base / mien / leur) — pour qu'un onglet qui
     sauvegarde n'écrase pas ce qu'un autre vient d'ajouter.
     ------------------------------------------------------------------ */
  function fusionListe(base, mien, leur) {
    const B = new Map((base || []).map(x => [x.id, JSON.stringify(x)]));
    const M = new Map((mien || []).map(x => [x.id, x]));
    const out = [];
    const deja = new Set();
    (leur || []).forEach(x => {
      if (M.has(x.id)) { const m = M.get(x.id); out.push(JSON.stringify(m) !== B.get(x.id) ? m : x); deja.add(x.id); }
      else if (!B.has(x.id)) { out.push(x); deja.add(x.id); }      // ajouté ailleurs : on garde
      /* présent dans la base mais retiré chez moi : supprimé */
    });
    (mien || []).forEach(x => { if (!deja.has(x.id) && !B.has(x.id)) out.push(x); });  // ajouté chez moi
    (mien || []).forEach(x => { if (!deja.has(x.id) && B.has(x.id) && JSON.stringify(x) !== B.get(x.id)) out.push(x); }); // modifié chez moi, supprimé ailleurs : je le remets
    return out;
  }
  function fusionMap(base, mien, leur, sousListe) {
    const out = Object.assign({}, leur || {});
    const cles = new Set([...Object.keys(base || {}), ...Object.keys(mien || {})]);
    cles.forEach(k => {
      const b = (base || {})[k], m = (mien || {})[k], l = (leur || {})[k];
      if (JSON.stringify(m) === JSON.stringify(b)) return;           // pas touché chez moi
      if (m === undefined) { delete out[k]; return; }
      out[k] = sousListe && Array.isArray(m) ? fusionListe(b, m, l) : m;
    });
    return out;
  }

  /* ------------------------------------------------------------------
     Temps : jour 0 = lundi de la semaine où la sandbox a été créée.
     Le « jour d'exploitation » finit à 02:10 (comme l'ancien front).
     ------------------------------------------------------------------ */
  function meta() { return lire('meta') || null; }
  function jour0() { const m = meta(); return m && m.jour0 ? dateIso(m.jour0) : lundiDe(new Date()); }
  const jourDeDate = d => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - jour0()) / 864e5);
  const jourDeIso = s => jourDeDate(dateIso(s));
  const dateDeJour = j => { const d = jour0(); d.setDate(d.getDate() + j); return d; };
  const isoDeJour = j => iso(dateDeJour(j));
  function maintenant(ts) {
    const d = ts ? new Date(ts) : new Date(), m = d.getHours() * 60 + d.getMinutes();
    if (m < 2 * 60 + 10) { const v = new Date(d); v.setDate(v.getDate() - 1); return { j: jourDeDate(v), min: 1440 + m, iso: iso(v), ts: d.getTime() }; }
    return { j: jourDeDate(d), min: m, iso: iso(d), ts: d.getTime() };
  }
  /* timestamp réel d'une minute du jour d'exploitation j */
  const instant = (j, min) => { const d = dateDeJour(j); d.setHours(0, 0, 0, 0); return d.getTime() + min * 60000; };

  /* vacances scolaires : les périodes de la zone du centre, reçues par le CRM depuis l'API ouverte de l'Éducation nationale
     (config.calendrier.vacances : [{ nom, du, au }], « au » = jour de la reprise, exclu) ; tant qu'elles manquent, une approximation */
  let calendrierVu = { rev: undefined, v: null };
  const periodesVacances = () => {
    const r = brut('rev:config');
    if (r !== calendrierVu.rev) { const c = (lire('config') || {}).calendrier; calendrierVu = { rev: r, v: c && c.vacances && c.vacances.length ? c.vacances : null }; }
    return calendrierVu.v;
  };
  const vacances = d => { const V = periodesVacances(), k = iso(d); return V ? V.some(p => k >= p.du && k < p.au) : vacancesApprox(d); };
  const vacancesApprox = d => { const m = d.getMonth(), j = d.getDate(); return (m === 6 || m === 7) || (m === 1 && j >= 7 && j <= 23) || (m === 3 && j >= 4 && j <= 20) || (m === 9 && j >= 17) || (m === 11 && j >= 19) || (m === 0 && j <= 4); };
  /* jours fériés en France (fixes + lundi de Pâques, Ascension, lundi de Pentecôte) et leurs veilles */
  const paques = y => { const a = y % 19, b = Math.floor(y / 100), c = y % 100, h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30, l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - c % 4) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), n = h + l - 7 * m + 114; return new Date(y, Math.floor(n / 31) - 1, n % 31 + 1); };
  const ferie = d => { const y = d.getFullYear(); if ([101, 501, 508, 714, 815, 1101, 1111, 1225].includes((d.getMonth() + 1) * 100 + d.getDate())) return true; return [1, 39, 50].includes(Math.round((new Date(y, d.getMonth(), d.getDate()) - paques(y)) / 864e5)); };
  const ferieOuVeille = d => ferie(d) || ferie(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
  console.assert(ferie(new Date(2026, 3, 6)) && ferie(new Date(2026, 4, 14)) && ferie(new Date(2026, 4, 25)) && !ferie(new Date(2026, 4, 26)) && ferieOuVeille(new Date(2026, 6, 13)) && !ferieOuVeille(new Date(2026, 9, 9)), 'jours fériés');

  /* ------------------------------------------------------------------
     État complet (lecture)
     ------------------------------------------------------------------ */
  function etat() {
    const o = { meta: meta() };
    TRANCHES.forEach(k => { o[k] = lire(k); });
    o.config = o.config || { activites: [], prix: {} };
    o.creneaux = o.creneaux || {};
    o.reservations = o.reservations || [];
    o.blocages = o.blocages || [];
    o.chronos = o.chronos || {};
    o.reglages = o.reglages || {};
    o.ventes = Object.assign({ commandes: [], paiements: [] }, o.ventes);
    o.tickets = Object.assign({ lots: [], codes: [], usages: [] }, o.tickets);
    o.clients = o.clients || [];
    return o;
  }
  const pret = () => !!(meta() && lire('config'));

  /* ------------------------------------------------------------------
     MOTEUR — disponibilité et placement. Utilisé tel quel par le CRM
     (qui remplace son etatSlot par celui-ci) et par le front employé.
     ------------------------------------------------------------------ */
  const M = {};
  M.act = (E, id) => (E.config.activites || []).find(a => a.id === id);
  M.formules = (E, id) => (E.config.prix && E.config.prix[id]) || [];
  M.formule = (E, id, nom) => M.formules(E, id).find(f => f.nom === nom) || M.formules(E, id)[0] || null;
  /* parties d'une formule bowling : « 2 parties » → 2, « 2 + 1 » → 3 */
  M.partiesDe = nom => { const m = String(nom).match(/(\d+)\s*\+\s*(\d+)/); if (m) return +m[1] + +m[2]; const k = String(nom).match(/(\d+)/); return k ? +k[1] : 1; };
  /* durée d'une réservation. Pistes (bowling) : on ne vend pas une durée ; une piste reste occupée environ X minutes par partie et par joueur
     (X : activité › Capacité, 11 par défaut), pour le plus gros groupe d'une piste : 4 joueurs, 2 parties ≈ 1 h 30. Le reste : la durée de la formule. */
  M.dureeFormule = (E, a, nom, pers) => {
    if (a && a.modele === 'piste') return Math.ceil(M.partiesDe(nom) * Math.max(...M.repartirPistes(Math.max(1, +pers || 1), M.capPiste(E))) * (+a.minPartie || 11) / 5) * 5;
    const f = M.formule(E, a.id, nom); return (f && +f.duree) || a.duree || 60; };
  /* Créneaux liés, pour toute activité qui a des ressources (salles, pistes, tables) : un groupe occupe SA ressource pendant
     la durée de sa formule, plus le battement de l'activité (ménage, équipement ; 0 par défaut) avant le groupe suivant.
     Les créneaux qu'il chevauche se ferment tout seuls pour cette ressource, les autres ressources restent réservables. */
  M.lie = a => !!(a && (a.ressources || []).length);
  M.battement = a => M.lie(a) ? Math.max(0, +a.battement || 0) : 0;
  M.actives = r => r.etatV !== 'absente' && r.statut !== 'annulee';
  M.resasJour = (E, j) => E.reservations.filter(r => r.jour === j && M.actives(r));
  M.couleur = (E, r) => { const f = M.formule(E, r.act, r.formule); const a = M.act(E, r.act); return (f && f.couleur) || (a && a.p) || '#c3ccd5'; };

  /* Temps de jeu réel : la durée de la formule moins 2 minutes (règle de la v1 : 20 → 18, 30 → 28).
     Les 2 minutes servent à faire entrer et sortir le groupe. */
  const MARGE_CHRONO = 2;
  M.tempsJeu = minutes => Math.max(1, Math.round(+minutes || 0) - MARGE_CHRONO);

  /* Boutons de lancement rapide d'une activité : ses DEUX PREMIÈRES formules (dans l'ordre du CRM),
     2 minutes de moins chacune. Karaoké 30 min et 1 h → 28 et 58 ; formules 15, 30, 60 → 13 et 28 ;
     si la 15 min est supprimée → 28 et 58. Rien à régler : les boutons suivent les formules. */
  M.chronosRapides = (a, E) => {
    const F = E ? M.formules(E, a.id) : (a.formules || []);
    const d = F.slice(0, 2).map(x => +x.duree || +a.duree || 0).filter(n => n > 0).map(M.tempsJeu);
    const u = [...new Set(d)].sort((x, y) => x - y);
    return u.length ? u : [M.tempsJeu(+a.duree || 30)];
  };

  /* Réglages « front employé » d'une activité, avec valeurs par défaut lisibles */
  M.front = (a, E) => {
    const f = Object.assign({}, a.front || {});
    if (f.visible == null) f.visible = a.modele === 'seance' || a.modele === 'privatif';
    f.chronos = M.chronosRapides(a, E);       // toujours calculés, jamais saisis
    return f;
  };

  /* Bowling : au plus « cap » joueurs par piste (CRM › Bowling › Capacité, 7) ; au-delà, des groupes équilibrés
     sur plusieurs pistes (8 → 4 + 4, 15 → 5 + 5 + 5). Renvoie la taille de chaque groupe. */
  M.repartirPistes = (n, cap) => { cap = Math.max(1, +cap || 7); const k = Math.max(1, Math.ceil(n / cap)), base = Math.floor(n / k), plus = n % k; return Array.from({ length: k }, (_, i) => base + (i < plus ? 1 : 0)); };
  M.capPiste = E => ((((M.act(E, 'bowling') || {}).ressources || [])[0]) || {}).cap || 7;

  /* Ce qui occupe une ressource un jour donné : blocs de réservation + blocages manuels */
  M.occupations = (E, j, resId, ignoreId) => {
    const out = [];
    E.reservations.forEach(r => {
      if (r.jour !== j || r.id === ignoreId || !M.actives(r)) return;
      (r.blocs || []).forEach((b, i) => { if (b.r === resId) out.push({ s: b.s, e: b.e, pers: r.pers, resa: r, i }); });
    });
    (E.blocages || []).forEach(x => { if (x.j === j && x.r === resId && x.id !== ignoreId) out.push({ s: x.s, e: x.e, bloque: x }); });
    return out;
  };

  /* Une ressource peut-elle recevoir [s, e[ pour pers personnes ? */
  M.peutPlacer = (E, a, res, j, s, e, pers, ignoreId) => {
    if (!res) return { ok: false, raison: 'ressource inconnue' };
    if (res.hs) return { ok: false, raison: res.nom + ' est hors service' };
    const t = M.battement(a);
    for (const o of M.occupations(E, j, res.id, ignoreId)) {
      const m = o.bloque ? 0 : t;
      if (!(s < o.e + m && e > o.s - m)) continue;
      if (o.bloque) return { ok: false, raison: res.nom + ' fermée ' + hm(o.s) + '–' + hm(o.e) + (o.bloque.motif ? ' (' + o.bloque.motif + ')' : '') };
      const r = o.resa;
      return { ok: false, raison: res.nom + ' : chevauche ' + (r.titre || r.client) + ' ' + hm(o.s) + '–' + hm(o.e) + (t ? ' (+' + t + ' min de battement)' : '') };
    }
    if (pers > res.cap) return { ok: false, raison: res.nom + ' : ' + res.cap + ' pers. maximum' };     // pistes et tables : pers = 0, le nombre de voisines suffit
    return { ok: true, deja: 0, avec: [], reste: res.cap - pers };
  };

  /* Choix automatique de la salle (ou des pistes voisines) */
  M.proposer = (E, a, j, s, e, pers, ignoreId, resId, permis) => {
    const ouverte = x => !permis || permis.includes(x.id), R = (a.ressources || []).filter(ouverte), Rtout = a.ressources || [];
    if (resId) {
      const res = Rtout.find(x => x.id === resId);
      if (res && !ouverte(res)) return { ok: false, raison: res.nom + ' n’est pas ouverte à ' + hm(s) + ' pour cette formule' };
      const v = M.peutPlacer(E, a, res, j, s, e, pers, ignoreId);
      return v.ok ? { ok: true, blocs: [{ r: res.id, s, e }], avec: v.avec } : { ok: false, raison: v.raison };
    }
    if (a.modele === 'piste' || a.modele === 'table') {
      const cap = (Rtout[0] && Rtout[0].cap) || 1, n = Math.max(1, Math.ceil(pers / cap));
      for (let i = 0; i + n <= Rtout.length; i++) {
        const lot = Rtout.slice(i, i + n);
        if (lot.every(r => ouverte(r) && M.peutPlacer(E, a, r, j, s, e, 0, ignoreId).ok)) return { ok: true, blocs: lot.map(r => ({ r: r.id, s, e })) };
      }
      return { ok: false, raison: n + ' ' + ((a.ressNom || 'ressource').toLowerCase()) + (n > 1 ? 's voisines libres' : ' libre') + ' introuvable' + (n > 1 ? 's' : '') + ' à ' + hm(s) };
    }
    const cands = R.map(r => ({ r, v: M.peutPlacer(E, a, r, j, s, e, pers, ignoreId) })).filter(x => x.v.ok);
    if (!R.length) return { ok: false, raison: 'aucune ' + (a.ressNom || 'ressource').toLowerCase() + ' ouverte à ' + hm(s) + ' pour cette formule' };
    if (!cands.length) {
      const raisons = R.map(r => M.peutPlacer(E, a, r, j, s, e, pers, ignoreId).raison).filter(Boolean);
      return { ok: false, raison: raisons.join(' · ') || 'aucune ' + (a.ressNom || 'ressource').toLowerCase() + ' libre' };
    }
    /* la plus petite salle libre où le groupe tient (les grandes restent pour les grands groupes) */
    cands.sort((x, y) => x.r.cap - y.r.cap);
    return { ok: true, blocs: [{ r: cands[0].r.id, s, e }], avec: cands[0].v.avec };
  };

  /* ---- Créneaux ---- */
  M.finSlot = x => { const m = mn(x.fin); return m <= mn(x.h) ? m + 1440 : m; };
  M.slotsJour = (E, actId, j) => (E.creneaux[actId] || []).filter(s => s.j === j).sort((x, y) => mn(x.h) - mn(y.h));

  /* Créneaux d'un jour : ceux du générateur ; à défaut, les heures d'ouverture « comptoir » de l'activité, pour le comptoir SEULEMENT :
     un jour sans créneau généré (lot supprimé, pas encore généré) ne se vend ni sur les bornes ni sur le site */
  M.grille = (E, a, j) => {
    const sl = M.slotsJour(E, a.id, j);
    if (sl.length) return { source: 'generateur', slots: sl };
    const regles = E.config.regles && E.config.regles[a.id];
    const js = ((dateDeJour(j).getDay() + 6) % 7);
    const r = regles && regles[js] && regles[js].comptoir;
    if (!r || !r.ouvert) return { source: 'aucun', slots: [] };
    const out = [], f = r.fin === '00:00' ? 1440 : mn(r.fin), pas = +r.pas || 30;
    const F = M.formules(E, a.id);
    for (let t = mn(r.debut); t < f; t += pas) out.push({ id: 'cpt-' + a.id + '-' + j + '-' + t, act: a.id, j, h: hm(t), fin: hm(t + pas), formules: F.map(x => ({ nom: x.nom, places: 0, pris: 0 })), canaux: ['comptoir'], ouvert: true, virtuel: true });
    return { source: 'comptoir', slots: out };
  };

  M.pris = (E, slot, nom) => {
    const a = M.act(E, slot.act), enPers = a && a.modele === 'seance';
    const lst = M.resasJour(E, slot.j).filter(r => r.act === slot.act && r.formule === nom && hm(r.debut) === slot.h);
    return enPers ? lst.reduce((n, r) => n + (+r.pers || 0), 0) : lst.length;
  };

  /* Disponibilité d'un créneau, formule par formule.
     · Avec des ressources : une formule est proposée tant qu'une ressource reste libre pendant toute sa durée (plus le battement
       autour des autres groupes) et avant la fermeture ; « reste » = ressources libres. Avec pers : seulement celles où le groupe
       tient (pistes, tables : s'il y a assez de voisines libres). Une ressource fermée à la main (blocage) ne compte pas.
     · Sans ressource (anniversaire) : le stock de places du générateur, moins les réservations. */
  M.etatSlot = (E, s, pers, resId) => {
    const a = M.act(E, s.act);
    if (!a) return { lie: false, formules: [] };
    const R = a.ressources || [], deb = mn(s.h);
    if (!R.length) return { lie: false, formules: s.formules.map(f => {
      const pris = s.virtuel ? 0 : M.pris(E, s, f.nom), reste = f.ferme ? 0 : Math.max(0, (+f.places || 0) - pris);
      return { nom: f.nom, places: +f.places || 0, pris, reste, ferme: !!f.ferme, raison: f.ferme ? 'formule fermée' : '' };
    }) };
    const t = M.battement(a), voisins = a.modele === 'piste' || a.modele === 'table', nomR = (a.ressNom || 'ressource').toLowerCase();
    const finJour = Math.max(...M.grille(E, a, s.j).slots.map(M.finSlot), M.finSlot(s));
    const occ = R.map(x => x.hs ? null : M.occupations(E, s.j, x.id));
    return { lie: true, formules: s.formules.map(f => {
      const fp = M.formules(E, a.id).find(y => y.nom === f.nom) || {}, propres = (fp.salles || []).length ? fp.salles : null;      // les salles de la formule (Tarifs)
      const ouverte = x => (!f.salles || f.salles.includes(x.id)) && (!propres || propres.includes(x.id)) && (!resId || x.id === resId), places = R.filter(x => !x.hs && ouverte(x)).length;
      const d = M.dureeFormule(E, a, f.nom, pers), fin = deb + d, base = { nom: f.nom, places, duree: d, salles: f.salles || null };
      if (f.ferme) return Object.assign(base, { reste: 0, ferme: true, raison: 'formule fermée' });
      if (fin > finJour) return Object.assign(base, { reste: 0, raison: 'finirait après la fermeture (' + hm(finJour) + ')' });
      const gene = new Set();
      if (!places) return Object.assign(base, { reste: 0, raison: 'aucune ' + nomR + ' ouverte à cette heure pour cette formule' });
      const libre = R.map((x, i) => {
        if (!occ[i] || !ouverte(x)) return false;
        const g = occ[i].find(o => { const m = o.bloque ? 0 : t; return deb < o.e + m && fin > o.s - m; });
        if (g) gene.add(g.bloque ? x.nom + ' fermée ' + hm(g.s) + '–' + hm(g.e) : (g.resa.titre || g.resa.client) + ' ' + hm(g.s) + '–' + hm(g.e));
        return !g;
      });
      const libres = libre.filter(Boolean).length;
      let reste = libres;
      if (pers > 0 && libres) {
        if (voisins) { const k = Math.max(1, Math.ceil(pers / ((R[0] && R[0].cap) || 1))); reste = libre.some((_, i) => libre.slice(i, i + k).length === k && libre.slice(i, i + k).every(Boolean)) ? libres : 0; }
        else reste = R.filter((x, i) => libre[i] && x.cap >= pers).length;
      }
      return Object.assign(base, { reste, raison: reste ? '' : libres ? (voisins ? 'pas assez de ' + nomR + 's voisines libres pour ' + pers + ' pers.' : 'aucune ' + nomR + ' libre assez grande pour ' + pers + ' pers.')
        : gene.size ? 'chevauche ' + [...gene].join(', ') : 'aucune ' + nomR + ' en service' });
    }) };
  };

  /* Ce qu'un canal voit d'un créneau (site web, bornes, comptoir) */
  M.vuCanal = (E, s, canal, now, pers, resId) => {
    if (!s.ouvert) return { ouvert: false, txt: 'fermé', cls: 'ferme' };
    if (!s.canaux.includes(canal)) return { ouvert: false, txt: canal === 'web' ? 'hors site' : 'hors ' + canal, cls: 'hors' };
    now = now || maintenant();
    if (s.j < now.j || (s.j === now.j && mn(s.h) + 20 < now.min)) return { ouvert: false, txt: 'passé', cls: 'passe' };
    const e = M.etatSlot(E, s, pers, resId), F = e.formules, dispo = F.filter(f => f.reste > 0);
    if (!dispo.length) return { ouvert: false, txt: 'complet', cls: 'complet', e };
    if (e.lie) return { ouvert: true, txt: dispo.length < F.length ? '≤ ' + dureeTxt(Math.max(...dispo.map(f => f.duree))) : 'libre', cls: dispo.length < F.length ? 'partiel' : 'libre', e };
    const reste = F.reduce((n, f) => n + f.reste, 0), cap = F.reduce((n, f) => n + f.places, 0);
    return { ouvert: true, txt: reste + ' pl.', cls: reste < cap ? 'partiel' : 'libre', e, reste, cap };
  };

  /* Photo de ce que le site web propose pour une activité un jour donné (sert à mesurer l'impact) */
  M.photoWeb = (E, actId, j) => {
    const a = M.act(E, actId); if (!a) return {};
    const o = {};
    M.slotsJour(E, actId, j).forEach(s => { const v = M.vuCanal(E, s, 'web'); o[s.h] = { ouvert: v.ouvert, txt: v.txt, formules: v.e ? v.e.formules.filter(f => f.reste > 0).map(f => f.nom) : [] }; });
    return o;
  };
  M.impactWeb = (avant, apres) => {
    const fermes = [], reduits = [], rouverts = [];
    Object.keys(apres).forEach(h => {
      const a = avant[h], b = apres[h]; if (!a) return;
      if (a.ouvert && !b.ouvert) fermes.push(h);
      else if (!a.ouvert && b.ouvert) rouverts.push(h);
      else if (a.ouvert && b.ouvert && b.formules.length < a.formules.length) reduits.push(h + ' (' + b.formules.join(', ') + ' seulement)');
    });
    return { fermes, reduits, rouverts };
  };

  /* ---- Prix : règle la plus précise qui correspond (jours, heures, nombre de personnes) ---- */
  /* Plage horaire d'une règle de prix, fin INCLUSE : « de 19:00 à 00:00 » comprend le créneau de minuit. Une fin plus tôt que le début
     passe minuit (+1440) ; un créneau après minuit vaut 24:00, 24:30… sur la même journée d'exploitation (on le teste aussi à 00:00, 00:30…). */
  const plageRegle = r => { const de = mn(r.de); let a = mn(r.a); if (a <= de) a += 1440; return [de, a]; };
  const heuresTestees = debut => debut >= 1440 ? [debut, debut - 1440] : [debut];
  M.regleOk = (r, d, debut, pers) => {
    const js = (d.getDay() + 6) % 7;
    if (r.jours === 'lv' && js > 4) return false;
    if (r.jours === 'we' && js < 5) return false;
    if (r.jours === 'vac' && !vacances(d)) return false;
    if (r.jours === 'ferie' && !ferieOuVeille(d)) return false;
    if ((r.seulVac || r.seulFerie) && !((r.seulVac && vacances(d)) || (r.seulFerie && ferieOuVeille(d)))) return false;
    if (r.horsVac && vacances(d)) return false;
    if (r.horsFerie && ferieOuVeille(d)) return false;
    if (r.jours === 'perso' && !(r.joursPerso || []).includes(js)) return false;
    if (r.de && r.a) { const [de, a] = plageRegle(r); if (!heuresTestees(debut).some(t => t >= de && t <= a)) return false; }
    if (r.min && pers < +r.min) return false;
    if (r.max && pers > +r.max) return false;
    return true;
  };
  M.prix = (E, actId, nom, j, debut, pers, nbRes) => {
    const f = M.formule(E, actId, nom);
    if (!f) return { unitaire: 0, total: 0, regle: null };
    const d = dateDeJour(j);
    const prec = r => (r.jours === 'ferie' ? 2 : r.jours && r.jours !== 'tous' ? 1 : 0) + (r.seulVac || r.seulFerie ? 1 : 0) + (r.horsVac || r.horsFerie ? 1 : 0) + (r.de && r.a ? 1 : 0) + (r.min ? 1 : 0) + (r.max ? 1 : 0);
    /* deux plages qui se touchent (13:00 → 17:00 et 17:00 → 02:00) : à 17:00, celle qui commence l'emporte sur celle qui finit */
    const pile = m => heuresTestees(debut).includes(m), ok0 = (f.regles || []).filter(r => M.regleOk(r, d, debut, pers));
    const ok = ok0.filter(r => !(r.de && r.a && pile(plageRegle(r)[1]) && ok0.some(o => o !== r && o.de && o.a && pile(plageRegle(o)[0]))));
    const r = ok.sort((x, y) => prec(y) - prec(x))[0] || (f.regles || [])[0];
    const u = r ? +r.prix || 0 : +f.prix || 0;
    const parPers = /joueur|enfant|personne|pers/i.test(f.unite || '');
    return { unitaire: u, total: parPers ? u * pers : u * Math.max(1, nbRes || 1), regle: r, unite: f.unite, parPers, trouve: ok.length > 0 };
  };

  /* ------------------------------------------------------------------
     API — mêmes noms que les routes du contrat
     ------------------------------------------------------------------ */
  const api = {};

  /* GET /api/config/centre */
  api.config = () => etat().config;

  /* GET /api/front/jour?date — réservations du jour avec salle affectée, créneaux et chronos */
  api.frontJour = isoJour => {
    const E = etat(), j = jourDeIso(isoJour);
    return {
      date: isoJour, j,
      activites: (E.config.activites || []).map(a => Object.assign({}, a, { front: M.front(a, E), grille: a.modele === 'vente' || a.modele === 'combo' ? { source: 'aucun', slots: [] } : M.grille(E, a, j) })),
      reservations: E.reservations.filter(r => r.jour === j),
      blocages: E.blocages.filter(b => b.j === j),
      chronos: E.chronos
    };
  };

  /* GET /api/activites/{id}/disponibilites?date&pers */
  api.disponibilites = (actId, isoJour, pers, canal) => {
    const E = etat(), a = M.act(E, actId), j = jourDeIso(isoJour);
    if (!a) return [];
    return M.grille(E, a, j).slots.map(s => ({ slot: s, vu: M.vuCanal(E, s, canal || 'web'), etat: M.etatSlot(E, s) }));
  };

  let compteur = 0;
  function numero() {
    let n = 270400;
    modifier('reglages', g => { g = g || {}; g.numero = (g.numero || 270400) + 1; n = g.numero; return g; });
    return n;
  }
  const idResa = () => 'f' + Date.now().toString(36) + (compteur++).toString(36) + Math.random().toString(36).slice(2, 5);

  /* Construit (sans écrire) une réservation à partir d'un formulaire du comptoir */
  function preparer(E, d, ancien) {
    const a = M.act(E, d.act);
    if (!a) return { ok: false, raison: 'Activité inconnue' };
    const j = d.j != null ? d.j : jourDeIso(d.date);
    const s = typeof d.debut === 'number' ? d.debut : mn(d.h);
    const f = M.formule(E, a.id, d.formule);
    if (!f) return { ok: false, raison: 'Aucune formule pour ' + a.nom + ' : ajoutez-en une dans le CRM' };
    const pers = Math.max(1, parseInt(d.pers, 10) || 1);
    const duree = +d.duree || M.dureeFormule(E, a, f.nom, pers);
    const e = s + duree;
    /* le créneau doit exister et être ouvert */
    const g = M.grille(E, a, j);
    const slot = g.slots.find(x => mn(x.h) === s);              // « 24:00 » = minuit, même journée d'exploitation
    if (!slot && !d.forcer) return { ok: false, raison: 'Pas de créneau ' + a.nom + ' à ' + hm(s) + ' ce jour-là' };
    if (slot && !slot.ouvert && !d.forcer) return { ok: false, raison: 'Le créneau de ' + hm(s) + ' est fermé : rouvrez-le d’abord' };
    if (M.lie(a) && g.slots.length) {
      const finJour = Math.max(...g.slots.map(M.finSlot));
      if (e > finJour && !d.forcer) return { ok: false, raison: f.nom + ' à ' + hm(s) + ' finirait après la fermeture (' + hm(finJour) + ')' };
    }
    const fs = slot && slot.formules.find(x => x.nom === f.nom);
    if (slot && !d.forcer && (!fs || fs.ferme)) return { ok: false, raison: '« ' + f.nom + ' » n’est pas proposée à ' + hm(s) + (fs ? ' (formule fermée)' : '') };
    const propres = (f.salles || []).length ? f.salles : null, duSlot = fs && !d.forcer ? fs.salles : null;
    const ignore = ancien ? ancien.id : null, permis = propres && duSlot ? propres.filter(x => duSlot.includes(x)) : propres || duSlot || null;   // salles de la formule ∩ salles du créneau
    let pl;
    if (!(a.ressources || []).length) {          // sans salle (anniversaire) : les places du créneau, sans compter la réservation qu'on déplace
      const fx = slot && M.etatSlot(Object.assign({}, E, { reservations: E.reservations.filter(r => r.id !== ignore) }), slot).formules.find(x => x.nom === f.nom);
      if (!d.forcer && (!fx || fx.reste < 1)) return { ok: false, raison: 'Plus de place pour « ' + f.nom + ' » à ' + hm(s) + (slot ? '' : ' (pas de créneau)') };
      pl = { ok: true, blocs: [] };
    } else pl = M.proposer(E, a, j, s, e, pers, ignore, d.salle || null, permis);
    if (!pl.ok) return { ok: false, raison: pl.raison };
    const px = M.prix(E, a.id, f.nom, j, s, pers, pl.blocs.length);
    const total = d.total != null && d.total !== '' ? +String(d.total).replace(',', '.') : px.total;
    const now = maintenant();
    const r = Object.assign({}, ancien || {}, {
      id: ancien ? ancien.id : idResa(),
      jour: j, act: a.id, formule: f.nom, pers, debut: s, duree,
      client: (d.client || '').trim() || (ancien && ancien.client) || 'Client comptoir',
      titre: d.titre != null ? d.titre : (ancien ? ancien.titre : ''),
      tel: d.tel != null ? d.tel : (ancien ? ancien.tel : ''),
      note: d.note != null ? d.note : (ancien ? ancien.note : ''),
      blocs: pl.blocs, total,
      parties: M.partiesDe(f.nom),
      pistes: a.modele === 'piste' ? pl.blocs.length : 0
    });
    if (!ancien) Object.assign(r, {
      canal: 'Comptoir', src: 'front', par: d.par || '', paye: d.paye ? total : 0, arrive: false,
      caisse: d.paye ? { etat: 'main', ticket: '' } : { etat: 'attente', ticket: '' },
      valide: null, etatV: 'attendue', lance: false,
      cree: String(now.iso).split('-').reverse().join('/'), creeTs: Date.now()
    });
    else if (r.paye > r.total) r.paye = r.total;
    return { ok: true, resa: r, slot, a, f, prix: px };
  }

  /* Un paiement de réservation sans commande de borne (comptoir : « payé » au front, « Encaisser » au CRM ; acompte de l'outil « Réserver comme sur le site ») :
     une ligne dans ventes.paiements, comme un paiement de borne, pour que Transactions et Statistiques voient tout l'argent encaissé. */
  function paiementResa(r, montant, moyen, borne, src) {
    montant = Math.round((+montant || 0) * 100) / 100; if (!(montant > 0)) return null;
    const now = maintenant(); let t = null;
    modifier('ventes', V => {
      V = V || {}; V.commandes = V.commandes || []; V.paiements = V.paiements || [];
      const k = V.paiements.filter(p => p.resa === r.id).length + 1;
      t = { num: '#' + r.num + '-R' + k, cmd: null, resa: r.id, op: null, j: now.j, h: hm(now.min), ts: Date.now(), borne, moyen, montant, lignes: [[r.formule + ' · ' + (r.pers || 1) + ' pers.', 1, montant, 20]], etat: 'ok', tpe: moyen === 'En ligne' ? 'Paiement en ligne (simulé)' : 'Comptoir' };
      V.paiements.push(t); return V;
    }, src);
    return t;
  }

  api.reservations = {
    /* simulation : ce que donnerait la réservation, et son effet sur le site web */
    simuler(d, idAncien) {
      const E = etat(), ancien = idAncien ? E.reservations.find(r => r.id === idAncien) : null;
      const p = preparer(E, d, ancien);
      if (!p.ok) return p;
      const avant = M.photoWeb(E, p.a.id, p.resa.jour);
      const E2 = Object.assign({}, E, { reservations: E.reservations.filter(r => !ancien || r.id !== ancien.id).concat([p.resa]) });
      return Object.assign(p, { impact: M.impactWeb(avant, M.photoWeb(E2, p.a.id, p.resa.jour)) });
    },
    /* POST /api/reservations (canal comptoir) */
    creer(d, src) {
      const sim = api.reservations.simuler(d);
      if (!sim.ok) return sim;
      sim.resa.num = numero();
      modifier('reservations', L => (L || []).concat([sim.resa]), src);
      if (sim.resa.paye > 0) paiementResa(sim.resa, sim.resa.paye, 'Comptoir', 'COMPTOIR', src);      // « payé » coché au comptoir : une transaction Comptoir
      emettre('reservation.creee', { id: sim.resa.id, act: sim.a.id, nom: sim.a.nom, h: hm(sim.resa.debut), j: sim.resa.jour, client: sim.resa.titre || sim.resa.client, pers: sim.resa.pers, canal: 'Comptoir', impact: sim.impact }, src);
      return sim;
    },
    /* POST /api/reservations depuis le SITE WEB (outil de test de la sandbox) :
       passe par les mêmes règles que le vrai site — créneau proposé au canal web, formule disponible. */
    creerWeb(d, src) {
      const E = etat(), a = M.act(E, d.act);
      if (!a) return { ok: false, raison: 'Activité inconnue' };
      const j = d.j != null ? d.j : jourDeIso(d.date), h = d.h;
      const slot = M.slotsJour(E, a.id, j).find(s => s.h === h);
      if (!slot) return { ok: false, raison: 'Le site ne propose aucun créneau ' + a.nom + ' à ' + h + ' ce jour-là' };
      const vu = M.vuCanal(E, slot, 'web');
      if (!vu.ouvert) return { ok: false, raison: 'Refusé par le site : ' + a.nom + ' ' + h + ' est ' + vu.txt };
      const f = (vu.e.formules || []).find(x => x.nom === d.formule);
      if (!f || f.reste <= 0) return { ok: false, raison: 'Refusé par le site : « ' + d.formule + ' » n’est plus proposée à ' + h + (f && f.raison ? ' (' + f.raison + ')' : '') };
      if (a.modele === 'seance' && f.reste < (+d.pers || 1)) return { ok: false, raison: 'Refusé par le site : il reste ' + f.reste + ' place' + (f.reste > 1 ? 's' : '') + ' à ' + h };
      const sim = api.reservations.simuler(Object.assign({}, d, { j }));
      if (!sim.ok) return Object.assign(sim, { raison: 'Refusé par le site : ' + sim.raison });
      const px = sim.prix;
      Object.assign(sim.resa, { canal: 'Site web', src: 'web', par: '', paye: Math.min(sim.resa.total, Math.round(sim.resa.total * 0.3)), caisse: { etat: 'attente', ticket: '' }, etatV: 'attendue' });
      if (d.joueurs) sim.resa.joueurs = Array.from({ length: sim.resa.pers }, (_, i) => ({ prenom: String((d.joueurs[i] || {}).prenom || '').trim(), barrieres: !!(d.joueurs[i] || {}).barrieres }));
      sim.resa.num = numero();
      modifier('reservations', L => (L || []).concat([sim.resa]), src);
      if (sim.resa.paye > 0) paiementResa(sim.resa, sim.resa.paye, 'En ligne', 'WEB', src);          // l'acompte simulé de l'outil de test : une transaction « en ligne »
      emettre('reservation.creee', { id: sim.resa.id, act: a.id, nom: a.nom, h, j, client: sim.resa.client, pers: sim.resa.pers, canal: 'Site web', impact: sim.impact, prix: px.total }, src);
      return sim;
    },
    /* PATCH : horaire, formule, salle, nombre, coordonnées */
    modifier(id, d, src) {
      const E = etat(), ancien = E.reservations.find(r => r.id === id);
      if (!ancien) return { ok: false, raison: 'Réservation introuvable (supprimée ailleurs ?)' };
      const champsPlacement = ['h', 'debut', 'formule', 'pers', 'salle', 'date', 'j', 'duree'];
      if (!champsPlacement.some(k => d[k] != null && d[k] !== '')) {     // simple mise à jour d'infos
        let fait = null;
        modifier('reservations', L => (L || []).map(r => r.id === id ? (fait = Object.assign({}, r, d)) : r), src);
        emettre('reservation.modifiee', { id, act: ancien.act, h: hm(ancien.debut), j: ancien.jour, client: ancien.titre || ancien.client, champs: Object.keys(d) }, src);
        return { ok: true, resa: fait };
      }
      const base = { act: ancien.act, j: ancien.jour, debut: ancien.debut, formule: ancien.formule, pers: ancien.pers };
      const q = Object.assign(base, d);
      if (d.h) delete q.debut;
      if (d.date) delete q.j;
      /* salle non précisée : on garde la salle actuelle si elle convient encore, sinon placement automatique */
      let sim = null;
      if (!d.salle && ancien.blocs.length === 1) sim = api.reservations.simuler(Object.assign({}, q, { salle: ancien.blocs[0].r }), id);
      if (!sim || !sim.ok) sim = api.reservations.simuler(Object.assign({}, q, { salle: d.salle || null }), id);
      if (!sim.ok) return sim;
      modifier('reservations', L => (L || []).map(r => r.id === id ? sim.resa : r), src);
      emettre('reservation.modifiee', { id, act: sim.a.id, nom: sim.a.nom, h: hm(sim.resa.debut), j: sim.resa.jour, client: sim.resa.titre || sim.resa.client, pers: sim.resa.pers, impact: sim.impact }, src);
      return sim;
    },
    /* déplacement d'un bloc (glisser-déposer) : salle et/ou heure */
    deplacer(id, i, versRes, versDebut, par, src) {
      const E = etat(), r = E.reservations.find(x => x.id === id);
      if (!r) return { ok: false, raison: 'Réservation introuvable' };
      const b = r.blocs[i]; if (!b) return { ok: false, raison: 'Bloc introuvable' };
      const a = (E.config.activites || []).find(x => (x.ressources || []).some(z => z.id === versRes));
      if (!a) return { ok: false, raison: 'Salle inconnue' };
      const res = a.ressources.find(z => z.id === versRes);
      const dec = (versDebut != null ? versDebut : b.s) - b.s;
      const simple = r.blocs.length === 1;
      const ns = b.s + dec, ne = b.e + dec;
      /* on vérifie la salle cible sans compter la réservation elle-même */
      const E2 = Object.assign({}, E, { reservations: E.reservations.map(x => x.id !== id ? x : Object.assign({}, x, { blocs: x.blocs.filter((_, k) => k !== i) })) });
      const v = M.peutPlacer(E2, a, res, r.jour, ns, ne, a.modele === 'piste' || a.modele === 'table' ? 0 : r.pers);
      if (!v.ok) return { ok: false, raison: v.raison };
      if (simple && M.lie(a)) {
        const g = M.grille(E, a, r.jour), fj = g.slots.length ? Math.max(...g.slots.map(M.finSlot)) : 1440;
        if (ne > fj) return { ok: false, raison: 'Finirait après la fermeture (' + hm(fj) + ')' };
      }
      const avant = M.photoWeb(E, a.id, r.jour);
      let fait = null;
      const L = modifier('reservations', L0 => (L0 || []).map(x => {
        if (x.id !== id) return x;
        const nb = x.blocs.map((y, k) => k === i ? { r: versRes, s: ns, e: ne } : y);
        fait = Object.assign({}, x, { blocs: nb, debut: simple ? ns : x.debut, deplacePar: par || '', deplaceTs: Date.now() });
        return fait;
      }), src);
      const E3 = Object.assign({}, E, { reservations: L });
      const impact = M.impactWeb(avant, M.photoWeb(E3, a.id, r.jour));
      emettre('reservation.deplacee', { id, act: a.id, nom: a.nom, h: hm(ns), j: r.jour, client: r.titre || r.client, salle: res.nom, impact }, src);
      return { ok: true, resa: fait, impact };
    },
    /* DELETE /api/reservations/{id} */
    supprimer(id, src) {
      const E = etat(), r = E.reservations.find(x => x.id === id);
      if (!r) return { ok: false, raison: 'Déjà supprimée' };
      const avant = M.photoWeb(E, r.act, r.jour);
      const L = modifier('reservations', L0 => (L0 || []).filter(x => x.id !== id), src);
      const impact = M.impactWeb(avant, M.photoWeb(Object.assign({}, E, { reservations: L }), r.act, r.jour));
      const a = M.act(E, r.act);
      emettre('reservation.annulee', { id, act: r.act, nom: a ? a.nom : r.act, h: hm(r.debut), j: r.jour, client: r.titre || r.client, pers: r.pers, impact }, src);
      return { ok: true, impact, resa: r };
    },
    /* POST /api/reservations/{id}/paiements — encaissement au comptoir (CRM « Encaisser », front employé) : le reste dû, ou un montant.
       Enregistré comme un paiement (Transactions, Statistiques), la réservation passe « payée ». */
    encaisser(id, d, src) {
      d = d || {};
      const E = etat(), r = E.reservations.find(x => x.id === id);
      if (!r) return { ok: false, raison: 'Réservation introuvable' };
      const reste = Math.round((r.total - (r.paye || 0)) * 100) / 100, montant = Math.round(Math.min(d.montant != null && d.montant !== '' ? +d.montant : reste, reste) * 100) / 100;
      if (!(montant > 0)) return { ok: false, raison: 'Rien à encaisser : cette réservation est déjà réglée' };
      let fait = null;
      modifier('reservations', L => (L || []).map(x => x.id === id ? (fait = Object.assign({}, x, { paye: Math.round(((x.paye || 0) + montant) * 100) / 100, caisse: x.caisse && x.caisse.etat !== 'attente' ? x.caisse : { etat: 'main', ticket: '' } })) : x), src);
      const t = paiementResa(fait, montant, d.moyen || 'Comptoir', 'COMPTOIR', src), a = M.act(E, r.act);
      emettre('resa.encaisse', { id, num: r.num, act: r.act, nom: a ? a.nom : r.act, client: r.titre || r.client, montant, moyen: t.moyen, par: d.par || '', reste: Math.round((fait.total - fait.paye) * 100) / 100 }, src);
      return { ok: true, resa: fait, paiement: t };
    }
  };

  /* POST /api/front/creneaux/fermer — portée « tous » (ouvert/fermé) ou « web » (retiré du site) */
  api.fermerCreneau = (slotId, portee, ferme, par, src) => {
    let s0 = null;
    modifier('creneaux', C => {
      C = C || {};
      Object.keys(C).forEach(k => { C[k] = C[k].map(s => {
        if (s.id !== slotId) return s;
        const s2 = Object.assign({}, s, { canaux: s.canaux.slice() });
        if (portee === 'web') { const i = s2.canaux.indexOf('web'); if (ferme && i >= 0) s2.canaux.splice(i, 1); if (!ferme && i < 0) s2.canaux.push('web'); }
        else s2.ouvert = !ferme;
        s2.fermePar = ferme ? (par || '') : '';
        s0 = s2; return s2;
      }); });
      return C;
    }, src);
    if (!s0) return { ok: false, raison: 'Créneau introuvable (régénéré ailleurs ?)' };
    const a = M.act(etat(), s0.act);
    emettre(ferme ? 'creneau.ferme' : 'creneau.rouvert', { id: slotId, act: s0.act, nom: a ? a.nom : s0.act, h: s0.h, j: s0.j, portee, par: par || '' }, src);
    return { ok: true, slot: s0 };
  };

  /* Blocage d'une salle sur une plage (groupe en retard, panne, nettoyage…) */
  api.bloquer = (d, src) => {
    const E = etat(), a = (E.config.activites || []).find(x => (x.ressources || []).some(z => z.id === d.r));
    if (!a) return { ok: false, raison: 'Salle inconnue' };
    const avant = M.photoWeb(E, a.id, d.j);
    const b = { id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), act: a.id, r: d.r, j: d.j, s: d.s, e: d.e, motif: d.motif || '', par: d.par || '', t: Date.now() };
    const L = modifier('blocages', L0 => (L0 || []).concat([b]), src);
    const impact = M.impactWeb(avant, M.photoWeb(Object.assign({}, E, { blocages: L }), a.id, d.j));
    emettre('salle.bloquee', { id: b.id, act: a.id, nom: a.nom, r: d.r, salle: a.ressources.find(z => z.id === d.r).nom, h: hm(d.s), fin: hm(d.e), j: d.j, impact }, src);
    return { ok: true, blocage: b, impact };
  };
  api.debloquer = (id, src) => {
    const E = etat(), b = E.blocages.find(x => x.id === id);
    if (!b) return { ok: false };
    modifier('blocages', L0 => (L0 || []).filter(x => x.id !== id), src);
    emettre('salle.debloquee', { id, act: b.act, r: b.r, h: hm(b.s), j: b.j }, src);
    return { ok: true };
  };

  /* POST /api/front/chrono — lancer, pause, reprendre, remettre à zéro le chrono d'une salle */
  api.chrono = (resId, action, d, src) => {
    d = d || {};
    let c0 = null;
    modifier('chronos', C => {
      C = C || {};
      const c = Object.assign({ fin: null, pause: null, titre: '', resa: null, duree: 0 }, C[resId] || {});
      const now = Date.now();
      if (action === 'lancer') { c.fin = now + Math.round((+d.minutes || 0) * 60000); c.pause = null; c.duree = +d.minutes || 0; c.lance = now; c.titre = d.titre != null ? d.titre : ''; c.resa = d.resa || null; c.alerte = false; }
      else if (action === 'pause') { if (c.fin) { c.pause = Math.max(0, c.fin - now); c.fin = null; } }
      else if (action === 'reprendre') { if (c.pause != null) { c.fin = now + c.pause; c.pause = null; } }
      else if (action === 'basculer') { if (c.fin) { c.pause = Math.max(0, c.fin - now); c.fin = null; } else if (c.pause != null) { c.fin = now + c.pause; c.pause = null; } }
      else if (action === 'ajouter') { if (c.fin) c.fin += (+d.minutes || 0) * 60000; else if (c.pause != null) c.pause += (+d.minutes || 0) * 60000; }
      else if (action === 'reset') { c.fin = null; c.pause = null; c.titre = ''; c.resa = null; c.duree = 0; c.alerte = false; }
      else if (action === 'remplacer') { Object.assign(c, d); }
      c.par = d.par || c.par || '';
      C[resId] = c; c0 = c;
      return C;
    }, src);
    emettre('chrono.' + action, { r: resId, titre: c0.titre, fin: c0.fin }, src);
    return { ok: true, chrono: c0 };
  };

  /* Réglages front (temps d'attente affiché, son…) */
  /* Remise à zéro de l'exploitation (CRM › Paramétrage › Remise à zéro) : on efface ce qui a été vendu, réservé, fermé ou chronométré,
     on garde tout le paramétrage (activités, tarifs, templates, calendrier, modules, bornes, carte du bar, lots de tickets CE, numérotation).
     Les codes CE utilisés par des commandes effacées redeviennent disponibles. */
  api.remettreAZero = src => {
    const V = etat().ventes, n = { creneaux: Object.values(etat().creneaux).reduce((k, L) => k + (L || []).length, 0), reservations: etat().reservations.length, commandes: V.commandes.length, paiements: V.paiements.length, blocages: etat().blocages.length };
    modifier('tickets', T => { T = T || { lots: [], codes: [], usages: [] };
      const liberes = (T.usages || []).filter(u => u.cmd != null).map(u => u.code);
      T.codes = (T.codes || []).map(c => liberes.includes(c.code) && c.etat === 'utilisé' ? Object.assign({}, c, { etat: 'disponible', ou: '', quand: '', cmd: undefined }) : c);
      T.lots = (T.lots || []).map(l => { const k = (T.usages || []).filter(u => u.cmd != null && u.lot === l.id).length; return k ? Object.assign({}, l, { utilises: Math.max(0, (l.utilises || 0) - k) }) : l; });
      T.usages = (T.usages || []).filter(u => u.cmd == null); T.refus = []; return T; }, src);
    ecrire('creneaux', {}, src); ecrire('reservations', [], src); ecrire('ventes', { commandes: [], paiements: [] }, src); ecrire('blocages', [], src); ecrire('chronos', {}, src);
    try { Object.keys(localStorage).filter(k => k.startsWith((ESPACE ? ESPACE + ':' : '') + 'borne:')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
    signaler(['creneaux', 'reservations', 'ventes', 'blocages', 'chronos', 'tickets'], src, true);
    emettre('sandbox.remiseAZero', n, src);
    return { ok: true, efface: n };
  };
  api.reglages = (patch, src) => modifier('reglages', g => Object.assign(g || {}, patch || {}), src);
  /* GET /api/journal — les derniers événements (réservations, paiements, fermetures, chronos…), du plus ancien au plus récent */
  api.journal = () => lire('journal') || [];

  /* Réglage « front employé » d'une activité (visible, chronos), enregistré dans la config du centre */
  api.reglerFront = (actId, patch, src) => {
    let nom = actId;
    modifier('config', C => {
      C.activites = C.activites.map(a => { if (a.id !== actId) return a; nom = a.nom; return Object.assign({}, a, { front: Object.assign({}, a.front || {}, patch) }); });
      return C;
    }, src);
    emettre('activite.front', { act: actId, nom, patch }, src);
  };

  /* ------------------------------------------------------------------
     BORNES ET BAR — l'application des bornes (borne/index.html) lit sa
     configuration et le catalogue ici, et y écrit ses commandes et ses
     paiements ; le CRM les reçoit en direct (Bar › Commandes, Transactions).
     ------------------------------------------------------------------ */
  const arrondi = n => Math.round(n * 100) / 100;
  const ZONES_BAR = ['hall', 'pistes', 'bar'];
  /* le bar sur téléphone (bar/?piste=7 : QR code ou NFC sur la piste) : une « borne » sans monnayeur, qui ne vend que le bar, avec la carte des pistes */
  const MOBILE = { id: 'MOBILE', nom: 'Téléphone', zone: 'Pistes', type: 'Téléphone', on: true, tpe: true, cashdro: false };
  const borneDe = (C, id) => id === MOBILE.id ? MOBILE : (C.bornes || []).find(x => x.id === id);
  const cts = n => Math.round((+n || 0) * 100);

  /* SORTIE TRIVEC — ce que la caisse du bar reçoit quand une commande est payée.
     Même forme que l'adaptateur du préquel (projet_initial/backend/src/trivec/client.js :
     referenceCommande, articles[], totalCentimes), plus ce qui doit sortir sur le ticket :
     la zone de service (« Piste 7 », « Table 3 », « Bar »…) et le prénom du client.
     Aujourd'hui elle est rangée sur la commande (visible dans le CRM) ; avec le serveur,
     l'adaptateur l'enverra telle quelle (TRIVEC_MODE=reel). */
  const sortieTrivec = c => ({
    referenceCommande: c.num,
    zone: c.lieu,
    nomClient: c.nom,
    enTeteTicket: (c.lieu + ' · ' + c.nom).toUpperCase(),
    origine: 'Borne ' + c.borne,
    articles: (c.details || c.lignes.map(([nom, q, pu]) => ({ nom, q, pu }))).map(l => {
      const opts = l.opts || [];
      return {
        codeArticle: l.plu || 'TEST-' + (l.base || l.nom),
        libelle: l.base || l.nom,
        quantite: l.q,
        prixUnitaireCentimes: cts(l.pu - opts.reduce((s, o) => s + (+o.prix || 0), 0)),
        options: opts.map(o => ({ libelle: o.nom, groupe: o.g || '', prixCentimes: cts(o.prix) }))
      };
    }),
    totalCentimes: cts(c.total)
  });

  /* une commande est réglée quand paiements + tickets CE couvrent le total */
  const regle = c => arrondi((c.paye || 0) + (c.remise || 0) + (c.acompte || 0)) >= c.total;
  const resteDu = c => arrondi(c.total - (c.paye || 0) - (c.remise || 0) - (c.acompte || 0));
  /* SORTIE BOT — exactement ce que le préquel envoyait au bot Conqueror pour une commande bowling réglée :
     projet_initial/backend/src/routes/bowlingCommandes.js → botRelay.executerNouvellePartie(data)
     → événement socket « executer_nouvelle_partie », lu par bot/conqueror_bot.py :
       { nom, joueurs: [{ nom, bumpers, tarif, parties }] }
     · nom     : la « Référence » saisie dans la liste d'attente Conqueror = numéro par module du préquel
                 (numeroCommande.js : BO001, BO002… pour le bowling) ;
     · tarif   : le bouton du PDV Conqueror : '1' | '2' | '3' | '2+1' | 'CE' (joueur entièrement couvert par un ticket CE / code) ;
     · parties : nombre de parties du joueur (le bot clique une fois pour 2 / 3 / 2+1, autant de fois que de parties pour 1 et CE).
     Rien d'autre n'est envoyé (le paiement dans Conqueror, data.payer, reste désactivé comme dans le préquel) ;
     le reste (numéro, groupe, tickets CE) est gardé à côté, dans c.bot.contexte. Les sorties sont dans c.bot.envois. */
  /* Plus de 7 joueurs : une sortie par piste (BO004-1, BO004-2…), chacune au format ci-dessus ;
     le serveur appellera executerNouvellePartie une fois par sortie. */
  const sortiesBot = c => {
    let r = c.remise || 0;
    const joueurs = c.bowling.joueurs.map((j, i) => {
      const pu = ((c.details || [])[i] || {}).pu || 0, ce = pu > 0 && r >= pu - 0.001;   // les tickets couvrent les joueurs dans l'ordre (comme sur la borne)
      if (ce) r -= pu;
      return { nom: j.prenom, bumpers: !!j.barrieres, tarif: ce ? 'CE' : c.bowling.tarif, parties: c.bowling.parties };
    });
    const tailles = M.repartirPistes(joueurs.length, M.capPiste(etat()));
    let i = 0;
    return tailles.map((t, k) => ({ nom: tailles.length > 1 ? c.reference + '-' + (k + 1) : c.reference, joueurs: joueurs.slice(i, i += t) }));
  };
  /* réglée : bar → sortie Trivec ; bowling → sortie bot (et réservation dans le CRM, voir reserverBowling) */
  function valider(c) {
    c.etat = 'validee'; delete c.motif;
    if (c.act === 'bowling' && !c.reservation) {
      c.ticket = 'T-' + (4800 + c.num % 900);
      /* réponse simulée au format du bot (ouvrir_nouvelle_partie_simulee) : { succes, piste, nomJoueur, joueurs, simule } */
      const envois = sortiesBot(c);
      c.bot = { t: Date.now(), mode: 'simulation', envois, reponses: envois.map(e => ({ succes: true, piste: null, nomJoueur: e.nom, joueurs: e.joueurs.map(j => j.nom), simule: true })),
        contexte: { numero: c.num, groupe: c.nom, origine: 'Borne ' + c.borne, ticketsCE: (c.remises || []).map(x => x.code) } };
    }
    else if (c.reservation || c.act === 'anniv') c.ticket = '—';  // réservation : rien à taper en caisse pour l'instant (acompte, ou vente tapée le jour J)
    else { c.ticket = 'B-' + (4100 + c.num % 900); c.trivec = { t: Date.now(), mode: 'mock', envoi: sortieTrivec(c) }; }
  }
  /* ---- Modules de réservation sur les bornes (laser, karaoké, quiz, billard, anniversaire…) ----
     Règles du module (CRM › Sandbox › Module borne › Réservation) : délai minimum avant le créneau, horizon, paiement total ou acompte.
     La réservation est posée dès la commande pour garder la place pendant le paiement ; elle disparaît si le client abandonne
     sans payer, elle passe « payée » (ou « acompte payé ») quand il a payé. */
  /* canal « web » : les règles du bloc « Site web » du module ; un champ vide reprend celui des bornes (onglet Réservation) */
  /* le bowling réservé à l'avance sur le site : les pages de la borne (joueurs et formule, prénoms), plus le jour et l'heure */
  const ETAPES_BOWLING_WEB = ['bw-formule', 'rs-date', 'bw-joueurs', 'rs-recap'];
  /* « le jour et l'heure d'abord » (module › Site web › Ordre des pages) : la page Jour et heure passe juste avant celle de la formule */
  const dateAvant = L => { const f = L.findIndex(e => e === 'rs-formule' || e === 'bw-formule'), d = L.indexOf('rs-date'); if (f < 0 || d < f) return L; const M2 = L.filter(e => e !== 'rs-date'); M2.splice(f, 0, 'rs-date'); return M2; };
  const regleResa = (a, k, canal) => { const v = canal === 'web' ? api.modules.val(a, 'web', k) : null; return v != null && v !== '' ? v : api.modules.val(a, 'reservation', k); };
  const parPersonne = f => /joueur|enfant|personne|pers/i.test((f && f.unite) || '');
  function creneauResa(E, a, j, h, formule, nb, now, salle, canal) {
    now = now || maintenant(); canal = canal || 'borne';
    if (j < now.j || j > now.j + (+regleResa(a, 'horizon', canal) || 0)) return null;
    if (instant(j, mn(h)) < Date.now() + (+regleResa(a, 'delai', canal) || 0) * 3600e3) return null;      // « impossible de réserver moins de X heures avant »
    const s = M.grille(E, a, j).slots.find(x => x.h === h);
    const v = s && M.vuCanal(E, s, canal, now, Math.max(1, nb || 1), salle || null), f = v && v.ouvert && v.e && v.e.formules.find(x => x.nom === formule);
    return f && f.reste >= 1 ? { s, reste: f.reste } : null;          // reste = salles (pistes, tables) libres où le groupe tient ; sans salle, places du générateur
  }
  /* une formule libre à cette heure (canal, délai, horizon, salles) et vendue à cette heure-là (« vendue seulement aux jours et heures de ses règles »), avec son prix */
  function libreA(E, a, j, h, nom, nb, now, salle, canal) {
    const x = creneauResa(E, a, j, h, nom, nb, now, salle, canal); if (!x) return null;
    const px = M.prix(E, a.id, nom, j, mn(h), Math.max(1, nb || 1), 1);
    return px.trouve || !(M.formule(E, a.id, nom) || {}).strict ? { nom, reste: x.reste, prix: px.unitaire, total: px.total } : null;
  }
  /* prix et placement : comme une réservation prise au comptoir (salles, pistes…) ; sans ressource (anniversaire), juste le prix */
  function prixResa(E, a, x) {
    const nb = Math.max(1, x.nb || 1), f = M.formule(E, a.id, x.formule);
    const sim = (a.ressources || []).length ? api.reservations.simuler({ act: a.id, j: x.j, h: x.h, formule: x.formule, pers: nb, client: 'Borne', titre: '', salle: x.salle || null }) : null;
    if (sim && !sim.ok) return { ok: false, raison: sim.raison };
    const px = sim ? sim.prix : M.prix(E, a.id, x.formule, x.j, mn(x.h), nb, 1);
    const opts = (x.options || []).reduce((n, o) => n + (o.q || 0) * (o.prix || 0), 0);
    return { ok: true, f, px, nb, blocs: sim ? sim.resa.blocs : [], parties: sim ? sim.resa.parties : 1, pistes: sim ? sim.resa.pistes : 0,
      duree: sim ? sim.resa.duree : +(f || {}).duree || a.duree || 60, total: arrondi(px.total + opts) };
  }
  const lignesResa = (a, x, P) => [{ id: 'formule', nom: a.nom + ' · ' + x.formule, q: parPersonne(P.f) ? P.nb : 1, pu: parPersonne(P.f) ? P.px.unitaire : P.px.total, tva: 20 }]
    .concat((x.options || []).filter(o => o.q).map(o => ({ id: 'opt', nom: o.nom, q: o.q, pu: +o.prix || 0, tva: 20 })));
  function poserResa(c, P, src) {
    const E = etat(), a = M.act(E, c.act), x = c.reservation, now = maintenant(c.ts), contact = x.contact || {}, enfant = x.enfant || {};
    const prenoms = (x.prenoms || []).map(p => String(p || '').trim()).filter(Boolean);
    const web = c.canal === 'web';
    const r = { id: 'k' + c.num, num: c.num, cmd: c.num, jour: x.j, act: a.id, formule: x.formule, pers: P.nb, debut: mn(x.h), duree: P.duree,
      client: contact.nom || x.groupe || enfant.prenom || c.nom, titre: enfant.prenom ? 'Anniv. ' + enfant.prenom + (enfant.age ? ', ' + enfant.age + ' ans' : '') : x.groupe || '',
      tel: contact.tel || '', note: prenoms.length ? 'Participants : ' + prenoms.join(', ') : '', blocs: P.blocs, total: P.total, paye: 0, parties: P.parties, pistes: P.pistes,
      canal: web ? 'Site web' : 'Borne', src: web ? 'web' : 'borne', par: '', arrive: false, caisse: { etat: 'attente', ticket: '' }, valide: null, etatV: 'attendue', lance: false, attente: 'paiement',
      options: x.options || [], cree: now.iso.split('-').reverse().join('/'), creeTs: c.ts };
    if (enfant.prenom) r.anniv = { enfant: enfant.prenom, age: enfant.age, naissance: enfant.naissance, tranche: x.tranche || '', options: x.options || [], unitaire: P.px.unitaire };
    if (contact.email) r.email = contact.email;
    if (x.compte) r.compte = x.compte;                                   // compte client du site (Mon espace)
    if (x.joueurs) r.joueurs = x.joueurs.map(j => ({ prenom: String(j.prenom || '').trim(), barrieres: !!j.barrieres }));   // bowling : repris par « Finaliser » sur la borne
    modifier('reservations', L => (L || []).filter(y => y.id !== r.id).concat([r]), src);
  }
  function solderResa(c, src) {
    let r = null;
    modifier('reservations', L => (L || []).map(x => { if (x.id !== 'k' + c.num) return x; r = Object.assign({}, x, { paye: Math.min(x.total, arrondi((c.paye || 0) + (c.remise || 0))), solde: { borne: c.borne, ce: c.remise || 0, paye: c.paye || 0 } }); delete r.attente; return r; }), src);
    const a = M.act(etat(), c.act) || {};
    if (r) emettre('resa.reservation', { num: c.num, borne: c.borne, act: c.act, activite: a.nom, client: r.titre || r.client, enfant: r.anniv && r.anniv.enfant, age: r.anniv && r.anniv.age, j: r.jour, h: hm(r.debut), formule: r.formule, pers: r.pers, paye: r.paye, total: r.total }, src);
  }
  /* le groupe apparaît dans le CRM (Bowling › Planning), « tapé en caisse » par le bot : le suivi s'arrête là */
  function reserverBowling(c, src) {
    const now = maintenant(c.ts), id = 'k' + c.num, bw = c.bowling, barr = bw.joueurs.filter(j => j.barrieres).map(j => j.prenom);
    const solde = { titre: c.nom, joueurs: bw.joueurs, reference: c.reference, cmd: c.num, paye: c.total, arrive: true,
      note: 'Réf. Conqueror ' + c.bot.envois.map(e => e.nom + (c.bot.envois.length > 1 ? ' (' + e.joueurs.map(j => j.nom).join(', ') + ')' : '')).join(' + ') + (barr.length ? ' · barrières : ' + barr.join(', ') : ''),
      solde: { borne: c.borne, ce: c.remise || 0, paye: c.paye || 0 }, caisse: { etat: 'tape', ticket: c.ticket }, valide: { h: hm(now.min), borne: c.borne }, etatV: 'validee' };
    let r = null;
    if (c.resa) modifier('reservations', L => (L || []).map(x => x.id === c.resa ? (r = Object.assign({}, x, solde, { acompte: c.acompte || 0 })) : x), src);
    else {
      r = Object.assign({ id, num: c.num, jour: now.j, act: 'bowling', formule: bw.formule, pers: bw.joueurs.length, debut: now.min, duree: 30 * bw.parties,
        client: c.nom, tel: '', blocs: [], total: c.total, parties: bw.parties, pistes: c.bot.envois.length, canal: 'Borne', src: 'borne', par: '', lance: false,
        cree: now.iso.split('-').reverse().join('/'), creeTs: c.ts }, solde);
      modifier('reservations', L => (L || []).filter(x => x.id !== id).concat([r]), src);
    }
    emettre('bowling.commande', { num: c.num, resa: c.resa && r ? r.num : undefined, reference: c.reference, pistes: c.bot.envois.length, borne: c.borne, nom: c.nom, pers: bw.joueurs.length, formule: bw.formule, total: c.total, barrieres: barr.length, barrNoms: barr.join(', ') }, src);
  }

  /* ---- Tickets CE et QR codes (lots créés dans le CRM, CRM › Tickets CE / QR codes) ---- */
  const normCode = s => String(s || '').toUpperCase().replace(/[\s-]/g, '');
  /* des tickets CE donnés pour une commande : tous vérifiés pour son activité, puis consommés d'un coup (tous ou aucun).
     → { remises } ou { refus } ; un code donné deux fois ne compte qu'une fois */
  function utiliserCodes(codes, actId, num, ou, now, src) {
    const vus = new Set(), L = (codes || []).filter(k => { const n = normCode(k); return n && !vus.has(n) && vus.add(n); });
    let remises = [], refus = null;
    modifier('tickets', T => {
      T = T || {};
      const v = L.map(k => verifierCode(T, k, actId));
      if (v.some(x => !x.ok)) { refus = L.map((k, i) => ({ code: k, raison: v[i].raison, ok: v[i].ok })).filter(x => !x.ok); T.refus = (T.refus || []).concat(refus.map(x => ({ t: Date.now(), code: x.code, raison: x.raison, ou }))).slice(-500); return T; }
      v.forEach(x => {
        const k = T.codes.find(y => y.code === x.code), lot = (T.lots || []).find(l => l.id === k.lot);
        Object.assign(k, { etat: 'utilisé', quand: now.iso.split('-').reverse().join('/') + ' ' + hm(now.min), ou, cmd: num });
        if (lot) lot.utilises = (lot.utilises || 0) + 1;
        T.usages = (T.usages || []).concat([{ id: 'k' + num + '-' + x.code, h: hm(now.min), lot: x.lot, ou, quoi: x.contenu, code: x.code, cmd: num }]);
      });
      remises = v.map(x => ({ code: x.code, valeur: x.valeur, contenu: x.contenu, lot: x.lot }));
      return T;
    }, src);
    return refus ? { refus } : { remises };
  }
  function verifierCode(T, code, actId) {
    const c = (T.codes || []).find(x => normCode(x.code) === normCode(code));
    if (!c) return { ok: false, raison: 'Code inconnu : vérifiez-le, ou demandez à l’accueil' };
    if (c.etat === 'utilisé') return { ok: false, raison: 'Ce code a déjà été utilisé' + (c.quand ? ' (' + c.quand + ')' : '') };
    if (c.etat !== 'disponible') return { ok: false, raison: 'Ce code a été annulé' };
    const lot = (T.lots || []).find(l => l.id === c.lot) || {};
    if (lot.etat && lot.etat !== 'actif') return { ok: false, raison: 'Ce code n’est plus valable (lot ' + lot.etat + (lot.fin ? ', fin le ' + lot.fin : '') + ')' };
    /* le lot désigne son activité (lot.act : un id, ou '*' = valable partout) ; un ancien lot sans act : d'après le début de son contenu */
    const a = M.act(etat(), actId), cont = String(lot.contenu || c.contenu || ''), cible = lot.act;
    const pourTout = cible === '*' || (!cible && /^[−-]/.test(cont.trim()));       // « −5 € sur une activité »
    const pourCelle = cible ? cible === actId : !!(a && cont.toLowerCase().startsWith(a.nom.toLowerCase()));
    if (!pourTout && !pourCelle) return { ok: false, raison: 'Ce code est valable seulement pour « ' + cont + ' »' };
    return { ok: true, code: c.code, valeur: +lot.valeur || 0, contenu: cont, lot: lot.id || c.lot, org: lot.org || c.org || '' };
  }
  api.resa = {
    /* GET /api/bornes/modules/{act} — ce que la borne doit savoir pour réserver cette activité : étapes, règles, formules (cartes), options.
       canal « web » (GET /api/web/activites/{act}) : les règles du site (bloc « Site web » du module) */
    config(act, canal) {
      const E = etat(), a = M.act(E, act); if (!a) return null;
      const NOMS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], et = L => L.length > 1 ? L.slice(0, -1).join(', ') + ' et ' + L[L.length - 1] : L[0] || '';
      const quand = r => (r.jours === 'perso' ? 'le ' + et((r.joursPerso || []).slice().sort((x, y) => x - y).map(i => NOMS[i])) : { tous: 'tous les jours', lv: 'en semaine', we: 'le week-end', vac: 'pendant les vacances', ferie: 'veilles et jours fériés' }[r.jours] || '') + (r.seulVac || r.seulFerie ? ' ' + [r.seulVac && 'pendant les vacances', r.seulFerie && 'les veilles et jours fériés'].filter(Boolean).join(' ou ') : '') + (r.horsVac ? ' hors vacances' : '') + (r.de && r.a ? ' de ' + r.de + ' à ' + r.a : '') + (r.min ? ' dès ' + r.min + ' pers.' : '') + (r.max ? ' jusqu’à ' + r.max + ' pers.' : '');
      const R = (a.ressources || []).filter(x => !x.hs), voisins = a.modele === 'piste' || a.modele === 'table';
      return { act: a.id, nom: a.nom, c: a.c, modele: a.modele, etapes: ((L => canal === 'web' && regleResa(a, 'ordre', canal) === 'date' ? dateAvant(L) : L))(api.modules.type(a) === 'bowling' ? ETAPES_BOWLING_WEB : api.modules.etapes(a)),
        choixSalle: choixRessource(a) && R.length > 1, salles: R.map(x => ({ id: x.id, nom: x.nom, cap: +x.cap || 0, desc: x.desc || '' })),
        capMax: !R.length ? 0 : voisins ? (a.ressources || []).reduce((o, x) => { o.n = x.hs ? 0 : o.n + (+x.cap || 0); o.max = Math.max(o.max, o.n); return o; }, { n: 0, max: 0 }).max : Math.max(...R.map(x => +x.cap || 0)),      // le plus grand groupe accueilli (pistes, tables : voisines en service)
        regles: { delai: +regleResa(a, 'delai', canal) || 0, horizon: +regleResa(a, 'horizon', canal) || 0, paiement: regleResa(a, 'paiement', canal), acompte: +regleResa(a, 'acompte', canal) || 0,
          partiel: !!(((a.module || {}).regler || {}).partiel == null && ((a.module || {}).reservation || {}).partiel != null ? a.module.reservation.partiel : api.modules.val(a, 'regler', 'partiel')) },      // onglet Paiement (avant : onglet Bornes)
        tranches: api.modules.liste(a, 'tranches'), options: api.modules.liste(a, 'options'),
        formules: M.formules(E, a.id).map(f => ({ nom: f.nom, unite: f.unite, parPers: parPersonne(f), tranches: f.tranches || [], salles: f.salles || [], couleur: f.couleur || '',
          duree: +f.duree || 0, ages: f.ages || null, participants: f.participants || null, badge: f.badge || '', emoji: f.emoji || '', img: f.img || '', contenu: f.contenu || [],
          tarifs: (f.regles || []).map(r => ({ quand: quand(r), prix: +r.prix || 0 })),
          apartir: Math.min(...((f.regles || []).length ? f.regles : [{ prix: f.prix || 0 }]).map(r => +r.prix || 0)) })) };
    },
    /* GET /api/bornes/modules/{act}/creneaux?formule&nb — jour par jour (horizon du module), les heures encore réservables sur une borne (ou sur le site : canal « web ») */
    /* formule : un nom, ou une liste (le jour d'abord : une heure est proposée si l'une de ces formules y est libre ; prix = le plus bas, formules = celles qui restent) */
    creneaux(act, formule, nb, salle, canal) {
      const E = etat(), a = M.act(E, act), now = maintenant(), out = [], noms = Array.isArray(formule) ? formule : [formule]; if (!a) return out;
      for (let j = now.j, fin = now.j + (+regleResa(a, 'horizon', canal) || 0); j <= fin; j++) out.push({ j, iso: isoDeJour(j), heures: M.grille(E, a, j).slots.map(s => {
        const L = noms.map(nom => libreA(E, a, j, s.h, nom, nb, now, salle, canal)).filter(Boolean);
        return L.length ? { h: s.h, reste: Math.max(...L.map(x => x.reste)), prix: Math.min(...L.map(x => x.prix)), formules: L.map(x => x.nom) } : null; }).filter(Boolean) });
      return out;
    },
    /* GET /api/web/activites/{act}/formules?j&h&nb — le client a choisi le jour avant la formule : les formules encore libres à cette heure, et leur prix */
    formulesA(act, j, h, nb, salle, canal) {
      const E = etat(), a = M.act(E, act), now = maintenant(); if (!a) return [];
      return M.formules(E, a.id).map(f => libreA(E, a, j, h, f.nom, nb, now, salle, canal)).filter(Boolean);
    }
  };
  api.tickets = {
    /* POST /api/tickets/valider — vérification seule ; le code est consommé quand la commande est créée.
       Un refus (code inconnu, déjà utilisé, lot clos…) est noté : CRM › Tickets CE › Validations du jour, Statistiques › Tickets CE. */
    verifier: (code, actId, ou, src) => {
      const r = verifierCode(lire('tickets') || {}, code, actId);
      if (!r.ok && String(code || '').trim()) modifier('tickets', T => { T = T || {}; T.refus = (T.refus || []).concat([{ t: Date.now(), code: String(code).trim(), raison: r.raison, ou: ou || 'Site web' }]).slice(-500); return T; }, src || 'web');
      return r;
    }
  };
  /* GET /api/activites/{id}/tarifs?pers — les formules et leur prix à cet instant (règles du CRM : jours, heures, nombre) */
  api.tarifs = (actId, pers) => {
    const E = etat(), now = maintenant();
    return M.formules(E, actId).map(f => [f, M.prix(E, actId, f.nom, now.j, now.min, Math.max(1, pers || 1), 1)]).filter(([f, px]) => !f.strict || px.trouve)
      .map(([f, px]) => ({ nom: f.nom, unite: f.unite, unitaire: px.unitaire, total: px.total, parPers: px.parPers }));
  };

  api.bornes = {
    /* POST /api/bornes/{id}/heartbeat — la borne se signale (toutes les 20 s) : version du moteur, écran affiché, réseau, commandes en attente.
       Le CRM (Gestion des bornes › Parc) en déduit « en ligne » (vue il y a moins de 90 s), « hors ligne depuis N min » ou « jamais connectée ». */
    signaler(id, d, src) {
      const B = Object.assign({}, lire('bornes') || {});
      B[id] = { t: Date.now(), v: d && d.v != null ? d.v : VERSION, ecran: (d && d.ecran) || '', horsLigne: !!(d && d.horsLigne), file: (d && d.file) || 0 };
      ecrire('bornes', B, src);
      return B[id];
    },
    /* GET /api/bornes — le dernier signe de vie de chaque borne : { id: { t, v, ecran, horsLigne, file } } */
    vues: () => lire('bornes') || {},
    /* GET /api/bornes/{id}/config — la borne, ses modules (Gestion des bornes › Catalogue) et l'affichage commun */
    config(id) {
      const C = etat().config, b = borneDe(C, id);
      if (!b) return null;
      /* un module = une activité que la borne vend (Gestion des bornes › Catalogue), proposée au canal borne et visible ;
         une activité ajoutée dans le CRM arrive donc toute seule. Les boutons de Paramètres de diffusion
         donnent seulement le libellé, le sous-titre, l'image, l'ordre, et peuvent la masquer de l'accueil. */
      /* « Finaliser ma commande » : une case du Catalogue des bornes (présent partout tant que le CRM n'a pas rangé cette case, annivV < 6) */
      const finaliser = id !== MOBILE.id && (!(C.annivV >= 6) || ((C.vend || {})[id] || []).includes('finaliser'));
      return { borne: b, rang: (C.bornes || []).indexOf(b) + 1, modules: api.accueil(id, C), finaliser, diffusion: C.diffusion || {}, logo: C.logo || '', veille: api.veille.liste(id, C) };
    }
  };
  /* ---- Écran de veille : l'animation du centre tourne toujours ; ces diapositives (vidéos, images) passent en plus, entre deux animations.
     Paramétrage › Paramètres de diffusion › Écran de veille ; d.sauf = les bornes qui ne la montrent pas. */
  api.veille = {
    /* GET /api/bornes/{id}/veille — les diapositives d'une borne, dans l'ordre (sans id : toutes) */
    liste(id, C) {
      const D = (C || etat().config).diffusion || {};
      const L = Array.isArray(D.veille) ? D.veille : D.video ? [{ id: 'video', type: 'video', nom: 'Vidéo de veille', src: D.video }] : [];   // ancien réglage : une seule vidéo
      return L.filter(d => !id || !(d.sauf || []).includes(id));
    }
  };
  /* ---- Fichiers lourds (vidéos de veille) : POST /api/medias, GET /api/medias/{id}. Une diapositive garde « media:<id> » dans src.
     ponytail: rangés dans l'IndexedDB du navigateur, comme le reste de la sandbox (un seul poste) ; le serveur en fera de vrais fichiers. */
  const RACINE = new URL('../../', (document.currentScript || {}).src || location.href);    // le dossier du site (ce fichier est dans maquettes/sandbox/)
  const baseMedias = () => new Promise((ok, ko) => { const r = indexedDB.open(P + 'medias', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  const tx = (mode, fn) => baseMedias().then(db => new Promise((ok, ko) => { const t = db.transaction('f', mode), r = fn(t.objectStore('f')); t.oncomplete = () => { db.close(); ok(r.result); }; t.onerror = () => { db.close(); ko(t.error); }; }));
  api.medias = {
    mettre: blob => { const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); return tx('readwrite', st => st.put(blob, id)).then(() => 'media:' + id); },
    /* l'adresse à donner à <video>/<img> : un média de la sandbox, sinon un fichier du site (« borne/videos/x.mp4 », depuis la racine) ou une adresse complète */
    url: s => /^media:/.test(s || '') ? tx('readonly', st => st.get(s.slice(6))).then(b => b ? URL.createObjectURL(b) : Promise.reject(new Error('média introuvable : ' + s))) : Promise.resolve(/^(data:|blob:|https?:)/.test(s || '') ? s : new URL(s || '', RACINE).href),
    retirer: s => /^media:/.test(s || '') ? tx('readwrite', st => st.delete(s.slice(6))) : Promise.resolve()
  };
  /* les tuiles d'accueil d'un canal : activités cochées pour ce canal (Réglages › Vente) et visibles, avec le libellé, le sous-titre et l'image
     de Paramètres de diffusion (sinon « À partir de … », calculé avec les tarifs), dans l'ordre des boutons */
  function tuiles(C, garder, canal, ordre) {
    const rang = m => { const i = (ordre || []).indexOf(m.act); return i < 0 ? 999 : i; };      // l'ordre propre à l'écran, sinon l'ordre commun des boutons
    const E = { config: C }, prixMin = f => { const p = (f.regles || []).map(r => +r.prix || 0); return p.length ? Math.min(...p) : +f.prix || 0; };
    return (C.activites || [])
      .filter(a => garder(a) && (a.canaux || []).includes(canal) && a.visible !== false)
      .map(a => {
        const x = (C.boutons || []).find(y => y.act === a.id) || {}, F = M.formules(E, a.id);
        return { act: a.id, lib: x.lib || a.nom, image: x.image || '', ordre: x.ordre || 99, visible: x.visible !== false, activite: a,
          sous: x.sous || (a.modele === 'vente' ? 'Boissons et snacks' : F.length ? 'À partir de ' + eur(Math.min(...F.map(prixMin))) : '') };
      })
      .sort((x, y) => rang(x) - rang(y) || x.ordre - y.ordre);
  }
  /* GET /api/accueil/{ecran} — les tuiles de l'accueil d'une borne (ce qu'elle vend) ou du site (« web »), dans l'ordre choisi pour cet écran.
     C : une configuration à essayer (le CRM, avant d'enregistrer) ; sinon celle du centre. */
  api.accueil = (ecran, C) => {
    C = C || etat().config;
    if (ecran === 'web') return tuiles(C, a => !!api.modules.type(a) && a.modele !== 'vente', 'web', (C.dispo || {}).web);
    const vend = ecran === MOBILE.id ? ['bar'] : (C.vend || {})[ecran] || [];
    return tuiles(C, a => vend.includes(a.id), 'borne', (C.dispo || {})[ecran]).filter(m => m.visible);
  };

  /* ---- Site de réservation web (resa/) ---- */
  api.web = {
    /* GET /api/web/config — les activités vendues en ligne : « Site web » coché dans Réglages › Vente et pas masquées (le bar ne se vend pas en ligne) */
    config() {
      const C = etat().config;
      return { activites: api.accueil('web', C), logo: C.logo || '', centre: C.centre || {} };
    }
  };

  /* ---- Comptes clients du site (Mon espace) ; gérés dans CRM › Clients ----
     ponytail: maquette, mot de passe en clair et visible dans le CRM (demandé) ; le vrai serveur aura un login sécurisé (hachage, e-mails, mot de passe oublié). */
  const normEmail = s => String(s || '').trim().toLowerCase();
  const telOk = t => String(t || '').replace(/\D/g, '').length >= 10;
  const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail(e));
  const clientsTous = () => lire('clients') || [];
  /* champs modifiables, contrôlés de la même façon à la création, dans Mon espace et dans le CRM */
  function champsClient(d, id) {
    const n = {};
    if (d.nom != null) { if (!String(d.nom).trim()) return { ok: false, champ: 'nom', raison: 'Indiquez votre nom.' }; n.nom = String(d.nom).trim(); }
    if (d.email != null) { const e = normEmail(d.email); if (!emailOk(e)) return { ok: false, champ: 'email', raison: 'Cette adresse e-mail ne semble pas valide.' }; if (clientsTous().some(x => x.id !== id && x.email === e)) return { ok: false, champ: 'email', raison: 'Un compte existe déjà avec cette adresse' + (id ? '.' : ' : connectez-vous.') }; n.email = e; }
    if (d.tel != null) { if (!telOk(d.tel)) return { ok: false, champ: 'tel', raison: 'Indiquez un numéro de téléphone à 10 chiffres.' }; n.tel = String(d.tel).trim(); }
    if (d.mdp != null) { if (String(d.mdp).length < 6) return { ok: false, champ: 'mdp', raison: 'Le mot de passe doit faire au moins 6 caractères.' }; n.mdp = String(d.mdp); }
    if (d.actif != null) n.actif = !!d.actif;
    if (d.note != null) n.note = String(d.note);
    return { ok: true, n };
  }
  api.clients = {
    /* POST /api/clients — création du compte sur le site */
    creer(d, src) {
      const v = champsClient({ nom: d.nom || '', email: d.email || '', tel: d.tel || '', mdp: d.mdp || '' });
      if (!v.ok) return v;
      const c = Object.assign({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), cree: Date.now(), dernier: Date.now(), actif: true }, v.n);
      modifier('clients', L => (L || []).concat([c]), src);
      emettre('client.cree', { id: c.id, nom: c.nom, email: c.email }, src);
      return { ok: true, client: c };
    },
    /* POST /api/clients/connexion */
    connecter(email, mdp, src) {
      const c = clientsTous().find(x => x.email === normEmail(email));
      if (!c || c.mdp !== String(mdp || '')) return { ok: false, raison: 'E-mail ou mot de passe incorrect.' };
      if (c.actif === false) return { ok: false, raison: 'Ce compte est désactivé : contactez l’accueil.' };
      modifier('clients', L => (L || []).map(x => x.id === c.id ? Object.assign({}, x, { dernier: Date.now() }) : x), src);
      return { ok: true, client: c };
    },
    /* GET /api/clients/moi — ponytail: l'identifiant suffit dans la sandbox ; le serveur lira un cookie de session */
    get: id => clientsTous().find(x => x.id === id) || null,
    /* GET /api/clients (CRM) */
    liste: () => clientsTous(),
    /* PATCH /api/clients/{id} — le client (Mon espace) ou le CRM : nom, e-mail, téléphone, mot de passe, actif, note */
    modifier(id, d, src) {
      if (!clientsTous().some(x => x.id === id)) return { ok: false, raison: 'Compte introuvable' };
      const v = champsClient(d, id); if (!v.ok) return v;
      let fait = null;
      modifier('clients', L => (L || []).map(x => x.id === id ? (fait = Object.assign({}, x, v.n)) : x), src);
      return { ok: true, client: fait };
    },
    /* CRM › Clients : suppression du compte (droit à l'effacement) ; ses réservations restent, sans lien vers le compte */
    supprimer(id, src) {
      if (!clientsTous().some(x => x.id === id)) return { ok: false, raison: 'Compte introuvable' };
      modifier('clients', L => (L || []).filter(x => x.id !== id), src);
      modifier('reservations', L => (L || []).map(r => { if (r.compte !== id) return r; const x = Object.assign({}, r); delete x.compte; return x; }), src);
      return { ok: true };
    },
    /* GET /api/clients/{id}/reservations — les plus récentes d'abord */
    reservations: id => etat().reservations.filter(r => r.compte === id).sort((x, y) => y.jour - x.jour || y.debut - x.debut)
  };

  /* Règles horaires du bar (CRM › Bar › Règles horaires) : si = liste de 'c:<catégorie>' | 's:<catégorie>/<sous-catégorie>' | 'p:<article>' (ou un seul),
     jours (0 = lundi), de et a en 'HH:MM', fin incluse ; a ≤ de : jusqu'au lendemain (13:00 → 00:30).
     La règle la plus précise gagne : l'article, sinon sa sous-catégorie, sinon sa catégorie ; sans règle, servi toute la journée. */
  const SEMAINE = [0, 1, 2, 3, 4, 5, 6];
  M.horairesBar = (H, p) => { const A = (H || []).filter(h => h.actif !== false); for (const k of ['p:' + p.id, 's:' + p.cat + '/' + p.sous, 'c:' + p.cat]) { const L = A.filter(h => [].concat(h.si || []).includes(k)); if (L.length) return L; } return []; };
  const heureReelle = now => ({ js: (dateDeJour(now.j).getDay() + 6 + (now.min >= 1440 ? 1 : 0)) % 7, t: now.min % 1440 });     // après minuit, maintenant() reste sur la veille
  const dansHoraire = (h, now) => { const { js, t } = heureReelle(now), J = h.jours || SEMAINE, de = mn(h.de || '00:00'), a0 = mn(h.a || '00:00'), a = a0 <= de ? a0 + 1440 : a0;
    return (J.includes(js) && t >= de && t <= a) || (J.includes((js + 6) % 7) && t + 1440 <= a); };
  /* servi maintenant ? sinon des = l'heure où il le sera aujourd'hui ('' : plus aujourd'hui) */
  M.etatHoraire = (H, p, now) => { const L = M.horairesBar(H, p); now = now || maintenant(); if (!L.length || L.some(h => dansHoraire(h, now))) return { servi: true, des: '' };
    const { js, t } = heureReelle(now); return { servi: false, des: L.filter(h => (h.jours || SEMAINE).includes(js) && mn(h.de || '00:00') > t).map(h => h.de).sort()[0] || '' }; };

  api.bar = {
    /* GET /api/bar/catalogue?borne — produits en stock, servis dans l'espace de la borne ; chacun dit s'il est servi à cette heure (servi, des) */
    catalogue(borneId) {
      const C = etat().config, B = C.bar || {}, b = borneDe(C, borneId), now = maintenant();
      const zone = b ? String(b.zone).toLowerCase() : '';
      const produits = (B.produits || []).filter(p => p.stock !== false && (!ZONES_BAR.includes(zone) || (p.bornes || []).includes(zone))).map(p => Object.assign({}, p, M.etatHoraire(B.horaires, p, now)));
      return {
        cats: (B.cats || []).filter(([c]) => produits.some(p => p.cat === c)),
        visu: B.visu || {}, produits, zones: B.zones || [],
        upsells: (B.upsells || []).filter(u => u.actif !== false)
      };
    },
    /* POST /api/bar/commandes — part en « paiement en cours » : rien n'est envoyé en caisse avant d'être payé.
       d : { borne, nom, lieu, lignes: [{ nom, q, pu, tva }] } */
    commander(d, src) {
      const E = etat(), C = E.config, canal = d.canal === 'web' ? 'web' : 'borne';
      const b = canal === 'web' ? { id: 'WEB', nom: 'Site web' } : borneDe(C, d.borne) || { id: d.borne, nom: d.borne };
      const deja = d.num && E.ventes.commandes.find(x => x.num === d.num);
      if (deja) return { ok: true, commande: deja, deja: true };          // idempotent : un renvoi après coupure ne crée pas de doublon
      /* solde d'une réservation (site web, comptoir) : même prix, l'acompte déjà payé est déduit */
      const resa = d.resa ? E.reservations.find(x => x.id === d.resa) : null;
      if (d.resa && (!resa || resa.etatV === 'validee' || ((resa.paye || 0) >= resa.total && resa.act !== 'bowling'))) return { ok: false, raison: 'Réservation introuvable ou déjà payée : présentez-vous à l’accueil.' };
      if (resa && Math.abs(d.lignes.reduce((s, l) => s + l.q * l.pu, 0) - resa.total) > 0.01) return { ok: false, raison: 'Le montant ne correspond plus à la réservation : présentez-vous à l’accueil.' };
      let prep = null;
      if (d.reservation) {
        const a = M.act(E, d.act), x = d.reservation;
        if (!a || !creneauResa(E, a, x.j, x.h, x.formule, x.nb, undefined, x.salle, canal)) return { ok: false, code: 'creneau', raison: 'Ce créneau vient d’être pris : choisissez-en un autre.' };
        prep = prixResa(E, a, x);
        if (!prep.ok) return { ok: false, code: 'creneau', raison: prep.raison };
        const paiement = regleResa(a, 'paiement', canal);              // site web : « aucun » = rien en ligne, tout se règle sur place
        d = Object.assign({}, d, { lignes: paiement === 'aucun' ? [] : paiement === 'acompte'
          ? [{ id: 'acompte', nom: 'Acompte · ' + a.nom + ' · ' + x.formule, q: 1, pu: Math.min(+regleResa(a, 'acompte', canal) || 0, prep.total), tva: 20 }]
          : lignesResa(a, x, prep) });
      }
      let num = d.num, reference = null;
      if (!num) modifier('reglages', g => { g = g || {}; g.numeroBar = (g.numeroBar || 273000) + 1; num = g.numeroBar; return g; }, src);
      if (d.act === 'bowling' && !d.reservation) modifier('reglages', g => { g = g || {}; g.numeroModule = g.numeroModule || {}; const n = (g.numeroModule.BOWLING || 0) + 1; g.numeroModule.BOWLING = n; reference = 'BO' + String(n).padStart(3, '0'); return g; }, src);
      const now = maintenant(d.ts), lignes = d.lignes.map(l => [l.nom, l.q, l.pu, l.tva]);
      /* tickets CE (site web) : vérifiés à nouveau et consommés d'un coup ; si l'un vient d'être utilisé ailleurs, rien n'est créé */
      let remises = [];
      if ((d.remises || []).length) {
        const u = utiliserCodes(d.remises.map(r => r.code), d.act || 'bar', num, b.nom, now, src);
        if (u.refus) return { ok: false, raison: u.refus.map(x => x.raison).join(' · '), refus: u.refus };
        remises = u.remises;
      }
      const c = {
        num, ref: Math.random().toString(36).slice(2, 12).toUpperCase(), j: now.j, h: hm(now.min), ts: d.ts || Date.now(), recu: Date.now(), horsLigne: !!d.horsLigne,
        borne: b.id, origine: b.nom, lieu: d.lieu || 'Borne ' + b.id, nom: String(d.nom || '').trim() || 'Borne ' + b.id,
        lignes, details: d.lignes, total: arrondi(lignes.reduce((s, l) => s + l[1] * l[2], 0)), paye: 0, etat: d.aFinaliser ? 'afinaliser' : 'paiement',
        act: d.act || 'bar', canal, bowling: d.bowling || undefined, reservation: d.reservation || undefined, reference: reference || undefined, remises, remise: 0,
        resa: resa ? resa.id : undefined, acompte: resa ? resa.paye || 0 : 0
      };
      c.remise = arrondi(Math.min(c.total - c.acompte, remises.reduce((n, r) => n + r.valeur, 0)));
      if (regle(c)) valider(c);                                           // entièrement couverte par des tickets CE
      modifier('ventes', V => { V = V || {}; V.commandes = (V.commandes || []).concat([c]); return V; }, src);
      if (c.act === 'bowling' && c.etat === 'validee' && !c.reservation) reserverBowling(c, src);
      if (c.reservation) { poserResa(c, prep, src); if (c.etat === 'validee') solderResa(c, src); }
      if (c.act === 'bar') emettre('bar.commande', { num, borne: b.id, nom: c.nom, lieu: c.lieu, total: c.total, horsLigne: c.horsLigne, aFinaliser: c.etat === 'afinaliser' }, src);
      return { ok: true, commande: c };
    },
    /* POST /api/bornes/{id}/transactions — un paiement accepté ou refusé sur une commande.
       d : { moyen: 'Carte' | 'Espèces', montant, lignes: [[nom, q, pu, tva]], ok, op (clé unique), ts (heure du paiement) } */
    payer(num, d, src) {
      const V0 = etat().ventes, dejaT = d.op && V0.paiements.find(p => p.op === d.op);
      if (dejaT) return { ok: true, commande: V0.commandes.find(x => x.num === num), paiement: dejaT, deja: true };
      let c = null, t = null;
      modifier('ventes', V => {
        V = V || {}; V.commandes = V.commandes || []; V.paiements = V.paiements || [];
        c = V.commandes.find(x => x.num === num);
        if (!c) return V;
        const k = V.paiements.filter(p => p.cmd === num).length + 1, now = maintenant(d.ts);
        t = { num: '#' + num + (k > 1 ? '-' + k : ''), cmd: num, op: d.op || null, j: now.j, h: hm(now.min), ts: d.ts || Date.now(), borne: c.borne, moyen: d.moyen, montant: arrondi(d.montant), lignes: d.lignes, etat: d.ok ? 'ok' : 'refusée', tpe: d.moyen === 'Espèces' ? 'CashDro' : d.moyen === 'Comptoir' ? 'Comptoir' : d.moyen === 'En ligne' ? 'Paiement en ligne (simulé)' : 'TPE-' + c.borne };
        if (!(d.ok && !t.montant)) V.paiements.push(t);              // 0 € : on valide seulement, sans ligne de paiement
        if (d.ok) {
          c.paye = arrondi((c.paye || 0) + t.montant);
          if (regle(c) && c.etat !== 'validee') { valider(c); t.valide = true; }
        }
        return V;
      }, src);
      if (!c) return { ok: false, raison: 'Commande introuvable' };
      if (t.valide && c.act === 'bowling' && !c.reservation) reserverBowling(c, src);
      if (t.valide && c.reservation) solderResa(c, src);
      emettre((c.reservation ? 'resa' : c.act || 'bar') + '.paiement', { act: c.act, num, borne: c.borne, nom: c.nom, moyen: t.moyen, montant: t.montant, ok: t.etat === 'ok', reste: resteDu(c) }, src);
      return { ok: true, commande: c, paiement: t };
    },
    /* POST /api/bornes/{id}/tickets — des tickets CE ou codes promo donnés en paiement d'une commande déjà créée (borne : « Ticket CE »).
       Vérifiés pour l'activité de la commande et consommés ensemble ; ils couvrent au plus ce qui reste dû (le surplus n'est pas rendu).
       Si la commande est abandonnée sans autre paiement, ses codes redeviennent libres (abandonner). */
    payerCodes(num, codes, src) {
      const c0 = etat().ventes.commandes.find(x => x.num === num);
      if (!c0 || c0.etat === 'annulee') return { ok: false, raison: 'Commande introuvable' };
      if (resteDu(c0) <= 0) return { ok: false, raison: 'Cette commande est déjà réglée.' };
      if (!(codes || []).length) return { ok: false, raison: 'Aucun code donné' };
      const u = utiliserCodes(codes, c0.act || 'bar', num, c0.origine || c0.borne, maintenant(), src);
      if (u.refus) return { ok: false, raison: u.refus.map(x => x.raison).join(' · '), refus: u.refus };
      let c = null, valeur = 0, valide = false;
      modifier('ventes', V => {
        c = V.commandes.find(x => x.num === num);
        valeur = arrondi(Math.min(resteDu(c), u.remises.reduce((n, r) => n + r.valeur, 0)));
        c.remises = (c.remises || []).concat(u.remises); c.remise = arrondi((c.remise || 0) + valeur);
        if (regle(c) && c.etat !== 'validee') { valider(c); valide = true; }
        return V;
      }, src);
      if (valide && c.act === 'bowling' && !c.reservation) reserverBowling(c, src);
      if (valide && c.reservation) solderResa(c, src);
      emettre((c.reservation ? 'resa' : c.act || 'bar') + '.paiement', { act: c.act, num, borne: c.borne, nom: c.nom, moyen: 'Ticket CE', montant: valeur, ok: true, reste: resteDu(c) }, src);
      return { ok: true, commande: c, valeur };
    },
    /* GET /api/bar/commandes/{num}?a-finaliser — module « Finaliser ma commande » : une commande pas encore (entièrement) payée */
    retrouver(num) {
      api.bar.expirer();
      const E = etat(), n = +num, non = raison => ({ ok: false, raison });
      const c = E.ventes.commandes.find(x => x.num === n && (x.etat === 'afinaliser' || x.etat === 'paiement') && !regle(x));
      if (c) return { ok: true, commande: c };
      if (E.ventes.commandes.some(x => x.num === n && x.etat === 'annulee' && x.especes)) return non('Délai dépassé : la commande n’a pas été payée dans les ' + E.ventes.commandes.find(x => x.num === n).especes.min + ' minutes, elle est annulée. Refaites-la, ou commandez au comptoir.');
      /* le numéro d'une réservation (site web, comptoir) pas encore soldée : le client la règle sur la borne */
      const r = E.reservations.find(x => x.num === n);
      if (!r) return non('Numéro introuvable, ou commande déjà payée.');
      const ouverte = E.ventes.commandes.find(x => x.resa === r.id && x.etat === 'paiement' && !regle(x));
      if (ouverte) return { ok: true, commande: ouverte };                 // déjà commencée sur une borne
      if (r.etatV === 'absente') return non('Cette réservation a été annulée : présentez-vous à l’accueil.');
      if (r.act !== 'bowling') return non((r.paye || 0) >= r.total ? 'Cette réservation est déjà payée : présentez-vous à l’accueil.' : 'Cette réservation se règle à l’accueil.');
      if (r.etatV === 'validee' || r.attente) return non('Cette réservation est déjà validée : présentez-vous à l’accueil.');      // payée en ligne : la borne l'envoie quand même au bot
      if (r.jour !== maintenant().j) return non('Cette réservation n’est pas pour aujourd’hui.');
      return { ok: true, resa: { id: r.id, num: r.num, nom: r.titre || r.client, formule: r.formule, pers: r.pers, h: hm(r.debut), total: r.total, paye: r.paye || 0,
        joueurs: (r.joueurs || []).map(j => ({ prenom: j.prenom || '', barrieres: !!j.barrieres })) } };
    },
    /* Le réseau a coupé pendant le paiement : la commande attend que le client la finalise avec son numéro */
    aFinaliser(num, src) {
      let c = null;
      modifier('ventes', V => { V = V || {}; c = (V.commandes || []).find(x => x.num === num); if (c && c.etat === 'paiement') c.etat = 'afinaliser'; return V; }, src);
      return { ok: !!c };
    },
    /* POST /api/bar/commandes/{num}/especes — borne sans monnayeur (tablette de piste, téléphone) : « Espèces » met la commande de côté.
       Le client la paie sur une borne à monnayeur (« Finaliser ma commande » + numéro) ; pas payée à temps (Bar › Espèces au comptoir) : annulée. */
    attendreEspeces(num, src) {
      const a = (etat().config.activites || []).find(x => x.id === 'bar'), min = Math.max(1, +api.modules.val(a, 'comptoir', 'minutes') || 10);
      let c = null;
      modifier('ventes', V => { V = V || {}; c = (V.commandes || []).find(x => x.num === num && (x.etat === 'paiement' || x.etat === 'afinaliser'));
        if (c) Object.assign(c, { etat: 'afinaliser', especes: { min, expire: Date.now() + min * 60e3 } }); return V; }, src);
      if (!c) return { ok: false, raison: 'Commande introuvable ou déjà payée' };
      emettre('bar.especes', { num, borne: c.borne, nom: c.nom, lieu: c.lieu, total: c.total, min }, src);
      return { ok: true, commande: c };
    },
    /* les commandes « espèces au comptoir » dont le délai est passé sont annulées (le serveur le fera tout seul ; ici : le CRM et « Finaliser ») */
    expirer(src) {
      const L = ((etat().ventes || {}).commandes || []).filter(c => c.etat === 'afinaliser' && c.especes && c.especes.expire <= Date.now()).map(c => c.num);
      if (!L.length) return 0;
      modifier('ventes', V => { V.commandes.forEach(c => { if (L.includes(c.num)) c.etat = 'paiement'; }); return V; }, src);
      L.forEach(n => api.bar.abandonner(n, src, false, 'Pas payée au comptoir dans les ' + etat().ventes.commandes.find(c => c.num === n).especes.min + ' minutes'));
      return L.length;
    },
    /* Le client part sans finir : rien payé → annulée ; payé en partie → reste « paiement en cours », avec le reste dû */
    abandonner(num, src, force, motif) {
      let c = null;
      modifier('ventes', V => {
        V = V || {};
        c = (V.commandes || []).find(x => x.num === num);
        if (c && c.etat === 'paiement') {
          const refus = (V.paiements || []).filter(p => p.cmd === num).slice(-1)[0];
          if (c.paye && force) { c.etat = 'annulee'; c.motif = 'Classée abandonnée au CRM : ' + eur(c.paye) + ' payés, reste ' + eur(resteDu(c)) + ' non encaissé'; }
          else if (c.paye) c.motif = 'Client parti : reste ' + eur(resteDu(c)) + ' à régler';
          else { c.etat = 'annulee'; c.motif = motif || (refus && refus.etat !== 'ok' ? 'Paiement refusé, le client est parti' : 'Abandonnée par le client avant le paiement'); }
        }
        return V;
      }, src);
      if (c && c.etat === 'annulee' && (c.remises || []).length) modifier('tickets', T => {
        T = T || {};
        (T.codes || []).forEach(k => { if (k.cmd === num) { const lot = (T.lots || []).find(l => l.id === k.lot); if (lot) lot.utilises = Math.max(0, (lot.utilises || 1) - 1); Object.assign(k, { etat: 'disponible', quand: '', ou: '', cmd: null }); } });
        T.usages = (T.usages || []).filter(u => u.cmd !== num);
        return T;
      }, src);
      if (c && c.etat === 'annulee' && (c.reservation || c.act === 'anniv')) modifier('reservations', L => (L || []).filter(x => x.id !== 'k' + num), src);   // la place gardée se libère
      if (c) emettre((c.reservation ? 'resa' : c.act || 'bar') + '.abandon', { act: c.act, num, borne: c.borne, nom: c.nom, reste: resteDu(c) }, src);
      return { ok: !!c };
    }
  };

  /* ------------------------------------------------------------------
     Amorçage et remise à zéro
     ------------------------------------------------------------------ */
  function amorcer(tout, src) {
    poser('meta', JSON.stringify({ rev: 1, src: src || ONGLET, t: Date.now(), data: { version: VERSION, jour0: tout.jour0, cree: Date.now() } }));
    TRANCHES.forEach(k => { if (tout[k] !== undefined) ecrire(k, tout[k], src); });
    connus = revs();
    signaler(TRANCHES, src, true);
    emettre('sandbox.amorcee', {}, src);
  }
  function reinitialiser() {
    try {
      const k = [];
      for (let i = 0; i < localStorage.length; i++) { const c = localStorage.key(i); if (c && (c.startsWith(P) || (!ESPACE && c.startsWith('sbfs:')))) k.push(c); }
      k.forEach(c => localStorage.removeItem(c));
    } catch (e) { /* ignore */ }
    Object.keys(cache).forEach(c => delete cache[c]);
    connus = {};
  }

  connus = revs();

  /* ------------------------------------------------------------------
     MODULES DES BORNES — ce que le CRM permet de personnaliser (Sandbox › activité › Module borne), section par section.
     La borne lit api.modules.val(activité, section, clé) : sans réglage, c'est la valeur par défaut d'ici ; le CRM
     construit ses formulaires depuis le même schéma. Réglages rangés dans activite.module[section][clé].
     Types : texte, long (« **mot** » = en gras), oui, nombre, couleur, choix, image.
     src: 'bouton' = le bouton de l'accueil (Paramètres de diffusion) ; si: [clé, valeur] = champ montré seulement dans ce cas.
     ------------------------------------------------------------------ */
  const PARTIEL = { k: 'partiel', lib: 'Proposer « Tout payer » ou « Payer une partie »', type: 'oui', def: true,
    aide: 'Décoché : la borne demande tout de suite carte ou espèces, pour tout le montant. Un acompte se paie toujours en une fois.' };
  const AMBIANCE = { id: 'theme', lib: 'Ambiance', champs: [
    { k: 'accent', lib: 'Couleur du module', type: 'couleur', def: '', aide: 'Liseré de l’en-tête, choix sélectionnés, carte du récapitulatif. Sans réglage : les couleurs habituelles.' },
    { k: 'fond', lib: 'Fond des pages', type: 'choix', def: 'creme', choix: [['creme', 'Crème, comme les autres modules'], ['degrade', 'Dégradé de la couleur'], ['photo', 'Photo']] },
    { k: 'photo', lib: 'Photo de fond', type: 'image', def: '', si: ['fond', 'photo'], aide: 'Éclaircie automatiquement pour que les textes restent lisibles.' },
    { k: 'decor', lib: 'Décors animés', type: 'oui', def: true },
    { k: 'animations', lib: 'Animations', type: 'choix', def: 'normales', choix: [['normales', 'Normales'], ['reduites', 'Réduites (bornes peu puissantes)']] }] };
  /* style d'une page : 1 = la mise en page d'origine ; 2 et 3 changent surtout la feuille de style de la borne (disposition, tailles, couleurs) */
  const STYLES = {
    'bw-formule': ['Compact', 'Compteur plus petit, formules sur une seule ligne', 'Liste', 'Formules en lignes, prix à droite'],
    'bw-joueurs': ['Compact', 'Lignes serrées : plus de joueurs à l’écran', 'Cartes', 'Un joueur par carte, sur deux colonnes'],
    'bw-recap': ['Sobre', 'Carte claire avec un liseré de couleur', 'Ticket', 'Façon ticket de caisse'],
    'rs-age': ['Liste', 'Une tranche par ligne', 'Pastilles', 'Grandes pastilles rondes'],
    'rs-formule': ['Grille', 'Deux cartes par ligne, plus compactes', 'Claire', 'Cartes blanches avec un liseré de couleur'],
    'rs-salle': ['Grille', 'Deux cartes par ligne, plus compactes', 'Claire', 'Cartes blanches avec un liseré de couleur'],
    'rs-nombre': ['Carte', 'Le compteur dans une carte blanche', 'Grand', 'Le nombre dans une grande pastille de couleur'],
    'rs-date': ['Compact', 'Calendrier plus bas, quatre heures par ligne', 'Liste', 'Une heure par ligne, prix à droite'],
    'rs-options': ['Compact', 'Choix en pastilles, plus petits', 'Couleur', 'Chaque option sur une carte de couleur'],
    'rs-infos': ['Compact', 'Champs plus petits : moins de défilement', 'Cartes', 'Chaque champ dans sa carte'],
    'rs-recap': ['Sobre', 'Carte claire avec un liseré de couleur', 'Ticket', 'Façon ticket de caisse'],
    merci: ['Clair', 'Fond clair, textes foncés', 'Couleur', 'Fond à la couleur du module'],
    comptoir: ['Clair', 'Fond clair, textes foncés', 'Couleur', 'Fond à la couleur du module'],
    bar: ['Compacte', 'Trois articles par ligne', 'Liste', 'Un article par ligne, prix à droite'],
    recap: ['Compact', 'Lignes serrées', 'Ticket', 'Façon ticket de caisse'] };
  /* règles du site web (CRM › Sandbox › Module › Site web) ; comme : null = « vide, comme sur les bornes » (onglet Réservation) */
  const webDe = (P, W) => ({ id: 'web', lib: 'Site web', champs: [
    { k: 'ordre', lib: 'Ordre des pages sur le site', type: 'choix', def: P ? 'date' : 'formule', choix: [['formule', 'La formule, puis le jour et l’heure'], ['date', 'Le jour et l’heure, puis la formule']], aide: 'Le jour d’abord : le client ne voit ensuite que les formules encore libres à l’heure choisie.' },
    { k: 'paiement', lib: 'Paiement sur le site', type: 'choix', def: (W && W.webPaiement) || 'aucun', choix: [['aucun', 'Rien en ligne : tout se règle sur place'], ['acompte', 'Un acompte'], ['total', 'Tout payer en ligne']], aide: 'Le site propose l’activité seulement si « Site web » est coché dans Réglages › Vente.' },
    { k: 'acompte', lib: 'Montant de l’acompte en ligne (€)', type: 'nombre', def: P ? 20 : null, min: 0, max: 2000, si: ['paiement', 'acompte'], aide: P ? '' : 'Vide : le même que sur les bornes.' },
    { k: 'delai', lib: 'Impossible de réserver en ligne moins de … heures avant', type: 'nombre', def: P ? P.delai : null, min: 0, max: 720, aide: P ? '0 : dès maintenant.' : 'Vide : comme sur les bornes (onglet Bornes).' },
    { k: 'horizon', lib: 'Réservable en ligne jusqu’à … jours à l’avance', type: 'nombre', def: P ? P.horizon : null, min: 0, max: 365, aide: P ? '' : 'Vide : comme sur les bornes.' }] });
  const styleDe = id => { const [n2, d2, n3, d3] = STYLES[id]; return { k: 'style', lib: 'Style de la page', type: 'style', def: '1', choix: [['1', 'Classique', 'La mise en page d’origine'], ['2', n2, d2], ['3', n3, d3]] }; };
  const SCHEMAS = {
    bowling: [
      { id: 'accueil', lib: 'Accueil', apercu: 'accueil', champs: [
        { k: 'lib', lib: 'Nom sur la tuile', type: 'texte', src: 'bouton', def: 'Bowling' },
        { k: 'sous', lib: 'Sous-titre de la tuile', type: 'texte', src: 'bouton', def: '', aide: 'Vide : « À partir de … », calculé avec les tarifs.' },
        { k: 'action', lib: 'Texte du bouton', type: 'texte', def: 'Jouer' },
        { k: 'image', lib: 'Image de la tuile', type: 'image', src: 'bouton', def: '', aide: 'Sans image : l’icône de l’activité.' }] },
      webDe({ delai: 0, horizon: 14 }),
      { id: 'bw-formule', lib: 'Joueurs et formule', apercu: 'bw-formule', champs: [styleDe('bw-formule'),
        { k: 'entete', lib: 'Titre de l’en-tête', type: 'texte', def: 'Bowling' },
        { k: 'entete2', lib: 'Sous-titre de l’en-tête', type: 'texte', def: 'Une piste, des quilles, c’est parti' },
        { k: 'question', lib: 'Question du nombre de joueurs', type: 'texte', def: 'Combien de joueurs ?' },
        { k: 'joueursMin', lib: 'Joueurs minimum', type: 'nombre', def: 1, min: 1, max: 60 },
        { k: 'joueursMax', lib: 'Joueurs maximum', type: 'nombre', def: 24, min: 1, max: 60 },
        { k: 'joueursDefaut', lib: 'Joueurs proposés au départ', type: 'nombre', def: 2, min: 1, max: 60 },
        { k: 'quilles', lib: 'Quilles sous le compteur', type: 'oui', def: true },
        { k: 'questionFormule', lib: 'Question de la formule', type: 'texte', def: 'Quelle formule ?' },
        { k: 'offre', lib: 'Pastille des formules « 2 + 1 »', type: 'texte', def: 'Une offerte' },
        { k: 'prixJoueur', lib: 'Prix par joueur', type: 'oui', def: true },
        { k: 'total', lib: 'Total du groupe', type: 'oui', def: true }] },
      { id: 'bw-joueurs', lib: 'Prénoms', apercu: 'bw-joueurs', champs: [styleDe('bw-joueurs'),
        { k: 'groupe', lib: 'Nom du groupe : intitulé', type: 'texte', def: 'Nom du groupe' },
        { k: 'groupeAide', lib: 'Nom du groupe : exemple', type: 'texte', def: 'Ex. Les Strikers' },
        { k: 'groupeOblig', lib: 'Nom du groupe obligatoire', type: 'oui', def: true, aide: 'Sinon : « Groupe de » + le premier prénom.' },
        { k: 'groupeErreur', lib: 'Message si le nom manque', type: 'long', def: 'Donnez un nom à votre groupe : il s’affichera au-dessus de la piste.', si: ['groupeOblig', true] },
        { k: 'joueurs', lib: 'Intitulé de la liste', type: 'texte', def: 'Les joueurs' },
        { k: 'prenomAide', lib: 'Exemple dans chaque prénom', type: 'texte', def: 'Prénom du joueur {n}', aide: '{n} = le numéro du joueur.' },
        { k: 'ajouter', lib: 'Bouton d’ajout', type: 'texte', def: 'Ajouter un joueur' },
        { k: 'barrieres', lib: 'Proposer les barrières', type: 'oui', def: true },
        { k: 'barrieresBouton', lib: 'Bouton des barrières', type: 'texte', def: 'Barrières', si: ['barrieres', true] },
        { k: 'barrieresAide', lib: 'Explication des barrières', type: 'long', def: 'Barrières : les rigoles sont fermées, idéal pour les enfants', si: ['barrieres', true] }] },
      { id: 'bw-recap', lib: 'Récapitulatif', apercu: 'bw-recap', champs: [styleDe('bw-recap'),
        { k: 'entete2', lib: 'Sous-titre de l’en-tête', type: 'texte', def: 'Récapitulatif' },
        { k: 'groupe', lib: 'Petit titre de la carte', type: 'texte', def: 'Groupe' },
        { k: 'codes', lib: 'Tickets CE et codes promo acceptés (borne : au paiement ; site : sur le récapitulatif)', type: 'oui', def: true },
        { k: 'codeTitre', lib: 'Titre du bloc (site web)', type: 'texte', def: 'Code promo / Ticket CE', si: ['codes', true] },
        { k: 'codeAide', lib: 'Exemple dans le champ', type: 'texte', def: 'Tapez ou scannez le code', si: ['codes', true] },
        { k: 'codeBouton', lib: 'Bouton', type: 'texte', def: 'Appliquer', si: ['codes', true] }] },
      { id: 'regler', lib: 'Paiement', apercu: 'regler', champs: [
        { k: 'question', lib: 'Question', type: 'texte', def: 'Comment voulez-vous régler ?' },
        PARTIEL, { k: 'partielAide', lib: 'Sous-titre de « Payer une partie »', type: 'texte', def: 'Je choisis les joueurs', si: ['partiel', true] }] },
      { id: 'merci', lib: 'Fin', apercu: 'merci', champs: [styleDe('merci'),
        { k: 'mot', lib: 'Grand mot', type: 'texte', def: 'Strike !' },
        { k: 'reference', lib: 'Texte de la référence', type: 'texte', def: 'Votre référence à l’accueil' },
        { k: 'references', lib: 'Texte des références (plusieurs pistes)', type: 'texte', def: 'Vos références à l’accueil' },
        { k: 'message', lib: 'Message', type: 'long', def: 'Dirigez-vous vers **l’accueil** pour qu’on vous donne votre piste.', aide: 'Entre ** et ** : en gras.' },
        { k: 'bouton', lib: 'Bouton', type: 'texte', def: 'Terminer' },
        { k: 'delai', lib: 'Retour à l’accueil après (secondes)', type: 'nombre', def: 15, min: 5, max: 120 }] },
      AMBIANCE
    ]
  };
  /* Modules de réservation : un préréglage par fonctionnement d'activité (les valeurs par défaut) ; tout reste modifiable dans le CRM. */
  const TRANCHES_DEF = [{ id: 't1', lib: '4 à 6 ans', min: 4, max: 6 }, { id: 't2', lib: '7 à 16 ans', min: 7, max: 16 }];
  const OPTIONS_DEF = [{ id: 'donuts', nom: 'Donuts', type: 'choix', choix: ['Chocolat', 'Sucre'], obligatoire: true }, { id: 'champomy', nom: 'Champomy', type: 'quantite', prix: 10, max: 5, unite: 'bouteille' }];
  const PRESETS = {
    seance: { unite: 'joueurs', delai: 0, horizon: 42, paiement: 'total', etapes: ['rs-formule', 'rs-nombre', 'rs-date', 'rs-infos', 'rs-recap'], groupe: true, codes: true, style: 'classique', max: 20, defaut: 2,
      mot: 'C’est réservé !', message: 'Présentez-vous à l’accueil **10 minutes avant** votre séance.' },
    privatif: { unite: 'personnes', delai: 0, horizon: 42, paiement: 'total', etapes: ['rs-formule', 'rs-nombre', 'rs-date', 'rs-infos', 'rs-recap'], groupe: true, codes: true, style: 'classique', max: 12, defaut: 4,
      mot: 'C’est réservé !', message: 'Présentez-vous à l’accueil **5 minutes avant** : on vous ouvre la salle.' },
    table: { unite: 'joueurs', delai: 0, horizon: 14, paiement: 'total', etapes: ['rs-formule', 'rs-nombre', 'rs-date', 'rs-recap'], codes: true, style: 'classique', max: 8, defaut: 2,
      mot: 'C’est réservé !', message: 'Présentez-vous à l’accueil : on vous donne votre table.' },
    piste: { unite: 'joueurs', delai: 0, horizon: 14, paiement: 'total', etapes: ['rs-formule', 'rs-nombre', 'rs-date', 'rs-infos', 'rs-recap'], prenoms: true, codes: true, style: 'classique', max: 24, defaut: 2,
      mot: 'C’est réservé !', message: 'Présentez-vous à l’accueil **10 minutes avant**.' },
    combo: { unite: 'enfants', delai: 72, horizon: 56, paiement: 'acompte', acompte: 50, webPaiement: 'acompte', etapes: ['rs-age', 'rs-formule', 'rs-date', 'rs-options', 'rs-infos', 'rs-recap'], groupe: false, enfant: true, contact: true, nombreInfos: true,
      entAge: 'On prépare la fête !', entInfos: 'La star de la fête', vide: 'Plus de créneau libre pour cette formule dans les 6 prochaines semaines : l’accueil peut vous aider.', reste: 'à régler sur place le jour de la fête', codes: false, style: 'festif', max: 16, defaut: 8,
      tranches: TRANCHES_DEF, options: OPTIONS_DEF, titreFormule: 'Quelle fête ?', titreOptions: 'Pour le goûter', titreInfos: 'La star du jour', titreNombre: 'Combien d’enfants invités ?', carte: 'L’anniversaire de',
      note: 'Le jour de la fête, l’équipe ajuste au nombre d’enfants présents.', mot: 'Hourra !', titreFin: 'Joyeux anniversaire {enfant} !', message: '' }
  };
  /* le client choisit sa ressource (salle, expérience) au lieu de la plus petite qui convient : à la séance ou ressource entière, plusieurs ressources */
  const choixRessource = a => !!(a && a.choixRessource && (a.modele === 'seance' || a.modele === 'privatif'));
  const etapesDe = a => (choixRessource(a) ? ['rs-salle'] : []).concat(presetDe(a || {}).etapes);
  const presetDe = a => Object.assign({}, PRESETS.seance, PRESETS[a.modele] || {});
  const ambianceDe = style => ({ id: 'theme', lib: 'Ambiance', champs: [
    { k: 'style', lib: 'Style', type: 'choix', def: style, choix: [['classique', 'Classique'], ['festif', 'Festif (ballons, couleurs vives, arc-en-ciel)']] }].concat(AMBIANCE.champs.map(c => c.k === 'decor' ? Object.assign({}, c, { def: style === 'festif' }) : c)) });
  const accueilDe = (a, action) => ({ id: 'accueil', lib: 'Accueil', apercu: 'accueil', champs: [
    { k: 'lib', lib: 'Nom sur la tuile', type: 'texte', src: 'bouton', def: a.nom },
    { k: 'sous', lib: 'Sous-titre de la tuile', type: 'texte', src: 'bouton', def: '', aide: 'Vide : « À partir de … », calculé avec les tarifs.' },
    { k: 'action', lib: 'Texte du bouton', type: 'texte', def: action },
    { k: 'image', lib: 'Image de la tuile', type: 'image', src: 'bouton', def: '', aide: 'Sans image : l’icône de l’activité.' }] });
  function schemaResa(a) {
    const P = presetDe(a), L = [accueilDe(a, 'Réserver'),
      { id: 'reservation', lib: 'Bornes', champs: [
        { k: 'delai', lib: 'Impossible de réserver moins de … heures avant', type: 'nombre', def: P.delai, min: 0, max: 720, aide: '0 : dès maintenant · 2 : pas « l’heure pour l’heure » · 72 : trois jours avant au minimum.' },
        { k: 'horizon', lib: 'Réservable jusqu’à … jours à l’avance', type: 'nombre', def: P.horizon, min: 0, max: 365, aide: '0 : aujourd’hui seulement.' },
        { k: 'paiement', lib: 'Paiement sur la borne', type: 'choix', def: P.paiement, choix: [['total', 'Tout payer'], ['acompte', 'Un acompte']] },
        { k: 'acompte', lib: 'Montant de l’acompte (€)', type: 'nombre', def: P.acompte || 20, min: 0, max: 2000, si: ['paiement', 'acompte'] }] },
      { id: 'rs-age', lib: 'Âge', apercu: 'rs-age', champs: [styleDe('rs-age'),
        { k: 'entete2', lib: 'Sous-titre de l’en-tête', type: 'texte', def: P.entAge || 'C’est parti !' },
        { k: 'titre', lib: 'Question', type: 'texte', def: 'Quel âge a l’enfant ?' },
        { k: 'sous', lib: 'Explication', type: 'texte', def: 'Choisissez sa tranche d’âge : on vous montre les formules faites pour lui.' },
        { k: 'bougies', lib: 'Bougies sur les cartes', type: 'oui', def: P.style === 'festif' },
        { k: 'tranches', lib: 'Tranches d’âge', type: 'tranches', aide: 'Chaque formule dit pour quelles tranches elle est proposée (onglet Tarifs).' }] },
      { id: 'rs-salle', lib: a.ressNom || 'Salle', apercu: 'rs-salle', champs: [styleDe('rs-salle'),
        { k: 'entete2', lib: 'Sous-titre de l’en-tête', type: 'texte', def: '' },
        { k: 'titre', lib: 'Question', type: 'texte', def: 'Choisissez votre ' + String(a.ressNom || 'salle').toLowerCase() },
        { k: 'sous', lib: 'Explication', type: 'texte', def: 'Ensuite, on vous montre ses heures encore libres.' },
        { k: 'capacite', lib: 'Capacité sur les cartes', type: 'oui', def: true }] },
      { id: 'rs-formule', lib: 'Formule', apercu: 'rs-formule', champs: [styleDe('rs-formule'),
        { k: 'entete2', lib: 'Sous-titre de l’en-tête', type: 'texte', def: '', aide: 'Vide : la tranche d’âge choisie.' },
        { k: 'titre', lib: 'Question', type: 'texte', def: P.titreFormule || 'Quelle formule ?' },
        { k: 'sous', lib: 'Explication', type: 'texte', def: 'Le prix dépend du jour et de l’heure : vous le verrez à l’étape suivante.' },
        { k: 'unique', lib: 'Passer cette page s’il n’y a qu’une formule', type: 'oui', def: false, aide: 'Sur la borne seulement, et jamais si la formule a un badge. Le site montre toujours la page.' },
        { k: 'affichage', lib: 'Affichage des formules sur le site', type: 'choix', def: P.style === 'festif' ? 'roue' : 'cartes', choix: [['cartes', 'Cartes'], ['roue', 'Roue 3D (les formules tournent, avec leur photo)']], aide: 'Sur la borne : toujours les cartes.' },
        { k: 'details', lib: 'Contenu, durée et participants sur les cartes', type: 'oui', def: true, aide: 'Photo, badge, contenu, âges, participants : formule par formule, dans l’onglet Tarifs.' }] },
      { id: 'rs-nombre', lib: 'Participants', apercu: 'rs-nombre', champs: [styleDe('rs-nombre'),
        { k: 'entete2', lib: 'Sous-titre de l’en-tête', type: 'texte', def: '', aide: 'Vide : la formule choisie.' },
        { k: 'titre', lib: 'Question', type: 'texte', def: P.titreNombre || 'Combien de ' + P.unite + ' ?' },
        { k: 'unite', lib: 'Unité', type: 'texte', def: P.unite },
        { k: 'min', lib: 'Minimum', type: 'nombre', def: 1, min: 1, max: 99 },
        { k: 'max', lib: 'Maximum', type: 'nombre', def: P.max, min: 1, max: 99 },
        { k: 'defaut', lib: 'Proposé au départ', type: 'nombre', def: P.defaut, min: 1, max: 99, aide: 'Si une formule a ses participants (onglet Tarifs), ce sont les siens qui comptent. Ces réglages servent aussi quand le nombre est demandé dans « Informations ».' }] },
      { id: 'rs-date', lib: 'Jour et heure', apercu: 'rs-date', champs: [styleDe('rs-date'),
        { k: 'entete2', lib: 'Sous-titre de l’en-tête', type: 'texte', def: '', aide: 'Vide : la formule choisie.' },
        { k: 'titre', lib: 'Question', type: 'texte', def: 'Quel jour ?' },
        { k: 'sous', lib: 'Explication', type: 'texte', def: 'Les jours en couleur ont encore de la place.' },
        { k: 'prix', lib: 'Prix sur chaque heure', type: 'oui', def: true },
        { k: 'places', lib: 'Signaler « Dernière place »', type: 'oui', def: true },
        { k: 'vide', lib: 'Message quand tout est pris', type: 'long', def: P.vide || 'Plus de créneau libre pour cette formule : l’accueil peut vous aider.' }] },
      { id: 'rs-options', lib: 'Options', apercu: 'rs-options', champs: [styleDe('rs-options'),
        { k: 'entete2', lib: 'Sous-titre de l’en-tête', type: 'texte', def: 'Les petits plus' },
        { k: 'titre', lib: 'Titre', type: 'texte', def: P.titreOptions || 'Les petits plus' },
        { k: 'options', lib: 'Options', type: 'options' }] },
      { id: 'rs-infos', lib: 'Informations', apercu: 'rs-infos', champs: [styleDe('rs-infos'),
        { k: 'entete2', lib: 'Sous-titre de l’en-tête', type: 'texte', def: P.entInfos || 'Vos informations' },
        { k: 'titre', lib: 'Titre', type: 'texte', def: P.titreInfos || 'Vos informations' },
        { k: 'groupe', lib: 'Nom du groupe', type: 'oui', def: !!P.groupe },
        { k: 'groupeOblig', lib: 'Nom du groupe obligatoire', type: 'oui', def: false, si: ['groupe', true] },
        { k: 'groupeLib', lib: 'Intitulé', type: 'texte', def: 'Nom du groupe', si: ['groupe', true] },
        { k: 'groupeAide', lib: 'Exemple', type: 'texte', def: 'Ex. Les Invincibles', si: ['groupe', true] },
        { k: 'prenoms', lib: 'Prénoms des participants', type: 'oui', def: !!P.prenoms },
        { k: 'prenomsOblig', lib: 'Prénoms obligatoires', type: 'oui', def: false, si: ['prenoms', true] },
        { k: 'enfant', lib: 'Fiche de l’enfant (prénom, naissance, âge fêté)', type: 'oui', def: !!P.enfant },
        { k: 'nombre', lib: 'Nombre de participants sur cette page', type: 'oui', def: !!P.nombreInfos, aide: 'Sinon : le nombre proposé au départ (onglet Participants).' },
        { k: 'nombreTitre', lib: 'Question du nombre', type: 'texte', def: P.titreNombre || 'Combien de ' + P.unite + ' ?', si: ['nombre', true] },
        { k: 'nombreAide', lib: 'Précision', type: 'texte', def: 'À peu près : l’équipe ajuste le jour J', si: ['nombre', true] },
        { k: 'contact', lib: 'Coordonnées (nom et téléphone)', type: 'oui', def: !!P.contact },
        { k: 'contactOblig', lib: 'Coordonnées obligatoires', type: 'oui', def: true, si: ['contact', true] },
        { k: 'contactTitre', lib: 'Titre des coordonnées', type: 'texte', def: 'Vos coordonnées', si: ['contact', true] },
        { k: 'contactAide', lib: 'Précision', type: 'texte', def: 'Pour vous prévenir en cas de besoin', si: ['contact', true] }] },
      { id: 'rs-recap', lib: 'Récapitulatif', apercu: 'rs-recap', champs: [styleDe('rs-recap'),
        { k: 'entete2', lib: 'Sous-titre de l’en-tête', type: 'texte', def: 'Récapitulatif' },
        { k: 'carte', lib: 'Petit titre de la carte', type: 'texte', def: P.carte || 'Votre réservation' },
        { k: 'note', lib: 'Note sous le total', type: 'long', def: P.note || '' },
        { k: 'codes', lib: 'Tickets CE et codes promo acceptés (borne : au paiement ; site : sur le récapitulatif)', type: 'oui', def: !!P.codes },
        { k: 'codeTitre', lib: 'Titre du bloc (site web)', type: 'texte', def: 'Code promo / Ticket CE', si: ['codes', true] },
        { k: 'codeAide', lib: 'Exemple dans le champ', type: 'texte', def: 'Tapez ou scannez le code', si: ['codes', true] },
        { k: 'codeBouton', lib: 'Bouton', type: 'texte', def: 'Appliquer', si: ['codes', true] }] },
      { id: 'regler', lib: 'Paiement', apercu: 'regler', champs: [
        { k: 'question', lib: 'Question', type: 'texte', def: 'Comment voulez-vous régler ?' },
        PARTIEL, { k: 'partielAide', lib: 'Sous-titre de « Payer une partie »', type: 'texte', def: 'Je choisis ce que je paie', si: ['partiel', true] }] },
      { id: 'merci', lib: 'Fin', apercu: 'merci', champs: [styleDe('merci'),
        { k: 'mot', lib: 'Grand mot', type: 'texte', def: P.mot },
        { k: 'titre', lib: 'Titre', type: 'texte', def: P.titreFin || 'Merci {nom} !', aide: '{nom} = le groupe ou le contact · {enfant} = le prénom de l’enfant.' },
        { k: 'reste', lib: 'Après « reste environ … € »', type: 'texte', def: P.reste || 'à régler sur place', aide: 'Avec un acompte : « Acompte de 50 € payé · reste environ 90 € » suivi de ce texte.' },
        { k: 'message', lib: 'Message', type: 'long', def: P.message, aide: 'Entre ** et ** : en gras. Vide : pas de message.' },
        { k: 'bouton', lib: 'Bouton', type: 'texte', def: 'Terminer' },
        { k: 'delai', lib: 'Retour à l’accueil après (secondes)', type: 'nombre', def: 15, min: 5, max: 120 }] },
      ambianceDe(P.style)];
    const sec = id => L.find(x => x.id === id), infos = sec('rs-infos');
    if (!P.nombreInfos) infos.champs = infos.champs.filter(c => !/^nombre/.test(c.k));
    const pages = etapesDe(a).flatMap(id => id === 'rs-infos' && P.nombreInfos && !P.etapes.includes('rs-nombre')
      ? [Object.assign({}, sec('rs-nombre'), { apercu: 'rs-infos', champs: sec('rs-nombre').champs.filter(c => !['style', 'entete2', 'titre'].includes(c.k)) }), infos] : [sec(id)]);
    return L.slice(0, 2).concat([webDe(null, P)], pages, L.slice(-3));
  }
  /* le bowling réservé à l'avance sur le site : les pages de réservation d'une activité « piste » (formule, joueurs, jour et heure, informations) */
  const schemaPiste = a => { const k = 'piste|' + a.id; if (!MEMO_SCH.has(k)) MEMO_SCH.set(k, schemaResa(Object.assign({}, a, { modele: 'piste' }))); return MEMO_SCH.get(k); };
  const schemaBar = a => [accueilDe(a, 'Commander'), { id: 'bar', lib: 'Carte', apercu: 'bar', champs: [styleDe('bar')] }, { id: 'recap', lib: 'Panier', apercu: 'recap', champs: [styleDe('recap')] },
    { id: 'regler', lib: 'Paiement', apercu: 'regler', champs: [      // comme le bowling : « Payer une partie » (chacun ses articles), proposé par défaut
      { k: 'question', lib: 'Question', type: 'texte', def: 'Comment voulez-vous régler ?' },
      PARTIEL, { k: 'partielAide', lib: 'Sous-titre de « Payer une partie »', type: 'texte', def: 'Je choisis mes articles', si: ['partiel', true] }] },
    { id: 'merci', lib: 'Fin', apercu: 'merci', champs: [styleDe('merci'),
      { k: 'mot', lib: 'Grand mot', type: 'texte', def: 'Strike !' },
      { k: 'bouton', lib: 'Bouton', type: 'texte', def: 'Terminer' },
      { k: 'delai', lib: 'Retour à l’accueil après (secondes)', type: 'nombre', def: 15, min: 5, max: 120 }] },
    /* tablette de piste, téléphone : pas de monnayeur, « Espèces » met la commande de côté (api.bar.attendreEspeces) */
    { id: 'comptoir', lib: 'Espèces au comptoir', apercu: 'comptoir', champs: [styleDe('comptoir'),
      { k: 'titre', lib: 'Titre', type: 'texte', def: 'Merci pour votre commande !' },
      { k: 'message', lib: 'Message', type: 'long', def: 'Pour la finaliser, rendez-vous sur une **grande borne, au comptoir** : touchez « Finaliser ma commande », tapez ce numéro et payez en espèces.', aide: 'Entre ** et ** : en gras. Écran montré par les bornes sans monnayeur (tablettes des pistes) et par les téléphones, quand le client choisit « Espèces ».' },
      { k: 'numero', lib: 'Texte au-dessus du numéro', type: 'texte', def: 'Votre numéro de commande' },
      { k: 'minutes', lib: 'Annulée si pas payée dans les … minutes', type: 'nombre', def: 10, min: 1, max: 120 },
      { k: 'bouton', lib: 'Bouton', type: 'texte', def: 'J’ai noté mon numéro' },
      { k: 'delai', lib: 'Retour à l’accueil après (secondes)', type: 'nombre', def: 15, min: 5, max: 120, aide: 'Sur un téléphone, le numéro reste affiché.' }] }, AMBIANCE];
  const MEMO_SCH = new Map();
  api.modules = {
    /* quel module une activité a sur les bornes : le bar (parcours fixe), le bowling (Conqueror), ou une réservation (tout le reste) */
    type: a => !a ? null : a.id === 'bowling' ? 'bowling' : a.modele === 'vente' ? (a.id === 'bar' ? 'bar' : null) : 'resa',
    schema(a) {
      const t = api.modules.type(a); if (!t) return null;
      const k = [a.id, a.modele, a.nom, choixRessource(a), a.ressNom].join('|');
      if (!MEMO_SCH.has(k)) MEMO_SCH.set(k, t === 'bowling' ? SCHEMAS.bowling : t === 'bar' ? schemaBar(a) : schemaResa(a));
      return MEMO_SCH.get(k);
    },
    val(a, sec, k) {
      const v = (((a && a.module) || {})[sec] || {})[k];
      if (v !== undefined && v !== null && v !== '') return v;
      const L = api.modules.schema(a), x = (L && L.find(s => s.id === sec)) || (api.modules.type(a) === 'bowling' && /^rs-|^merci$/.test(sec) ? schemaPiste(a).find(s => s.id === sec) : null), c = x && x.champs.find(y => y.k === k);
      return c ? c.def : undefined;
    },
    /* listes du module (tranches d'âge, options) : celles du CRM, sinon celles du préréglage */
    liste(a, k) { const L = ((a && a.module) || {})[k]; return Array.isArray(L) ? L : ((PRESETS[a && a.modele] || {})[k] || []).map(x => JSON.parse(JSON.stringify(x))); },
    /* pages du module, dans l'ordre : une suite fixe, celle du préréglage (la borne saute seulement une page vide) */
    etapes: a => etapesDe(a)
  };

  window.SB = {
    VERSION, ONGLET, TRANCHES, ESPACE,
    lire, ecrire, modifier, info, revs, etat, pret, meta, amorcer, reinitialiser,
    ecouter: fn => { ecouteurs.push(fn); return () => { const i = ecouteurs.indexOf(fn); if (i >= 0) ecouteurs.splice(i, 1); }; },
    emettre, fusionListe, fusionMap, copie,
    temps: { jour0, jourDeDate, jourDeIso, dateDeJour, isoDeJour, maintenant, instant, lundiDe, iso, dateIso, vacances, ferie, ferieOuVeille, paques },
    outils: { hm, mn, eur, dureeTxt },
    moteur: M,
    api,
    sortieTrivec
  };
})();
