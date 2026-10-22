/* =====================================================================
   SANDBOX — Firebase local pour le front employé

   La copie du gestionnaire laser pointait sur la base de PRODUCTION
   (projet bowlingbackend) et sur ses Cloud Functions (fermeture de vrais
   créneaux sur le site, temps d'attente, sync CRM…). Ici, tout reste dans
   le navigateur :

   · window.firebaseTools garde exactement la même forme que l'original
     (auth, db, doc, getDoc, setDoc, updateDoc, onSnapshot, query, where…),
     donc script_v2.js tourne sans modification ;
   · les « collections » vivent dans localStorage (clés sbfs:*), avec mise
     à jour en direct entre onglets ;
   · les appels aux Cloud Functions sont interceptés et servis par la
     sandbox partagée avec le CRM (sandbox/centre-partage.js) ;
   · deux documents sont reliés au CRM :
       timers/liveState  ⇄ chronos partagés (les 4 chronos historiques de
                           l'onglet Anniversaires = Salle du bas, Salle du
                           haut, Karaoké, Quiz : champ « legacy » des salles)
       crmSyncPreview    ⇐ anniversaires réservés dans le CRM (lecture seule),
                           pour « Générer depuis CRM », la liste des paniers…

   Ce fichier est un script classique (pas un module) : il fonctionne aussi
   en ouvrant index.html directement depuis le disque (file://).
   ===================================================================== */
(function () {
  'use strict';
  const PFX = 'sbfs:';
  const SB = window.SB;

  /* ---------------- stockage des collections ---------------- */
  const cache = {};
  function lireCol(chemin) {
    let s = null; try { s = localStorage.getItem(PFX + chemin); } catch (e) { s = null; }
    if (!s) return {};
    if (cache[chemin] && cache[chemin].raw === s) return cache[chemin].data;
    try { const d = JSON.parse(s); cache[chemin] = { raw: s, data: d }; return d; } catch (e) { return {}; }
  }
  function ecrireCol(chemin, data) {
    const s = JSON.stringify(data);
    try { localStorage.setItem(PFX + chemin, s); } catch (e) { console.error('[sandbox] stockage plein ?', e); throw e; }
    cache[chemin] = { raw: s, data };
    planifier(chemin);
  }
  const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));

  /* ---------------- valeurs spéciales ---------------- */
  const SENT = '__sbx';
  const serverTimestamp = () => ({ [SENT]: 'ts' });
  const deleteField = () => ({ [SENT]: 'del' });
  const arrayUnion = (...items) => ({ [SENT]: 'union', items });
  class Timestamp {
    constructor(ms) { this._ms = ms; this.seconds = Math.floor(ms / 1000); this.nanoseconds = (ms % 1000) * 1e6; }
    toDate() { return new Date(this._ms); }
    toMillis() { return this._ms; }
    valueOf() { return this._ms; }
  }
  /* données stockées -> données lues (horodatages) */
  function versLecture(v) {
    if (Array.isArray(v)) return v.map(versLecture);
    if (v && typeof v === 'object') {
      if (typeof v.__ts === 'number' && Object.keys(v).length === 1) return new Timestamp(v.__ts);
      const o = {}; Object.keys(v).forEach(k => { o[k] = versLecture(v[k]); }); return o;
    }
    return v;
  }
  /* valeur écrite -> valeur stockée (résout serverTimestamp, arrayUnion, deleteField) */
  function resoudre(val, ancien) {
    if (val && typeof val === 'object' && val[SENT]) {
      if (val[SENT] === 'ts') return { __ts: Date.now() };
      if (val[SENT] === 'union') { const a = Array.isArray(ancien) ? ancien.slice() : []; val.items.forEach(x => { if (!a.some(y => JSON.stringify(y) === JSON.stringify(x))) a.push(clone(x)); }); return a; }
      if (val[SENT] === 'del') return undefined;
    }
    if (val instanceof Timestamp) return { __ts: val._ms };
    if (val instanceof Date) return { __ts: val.getTime() };
    if (Array.isArray(val)) return val.map(x => resoudre(x));
    if (val && typeof val === 'object') { const o = {}; Object.keys(val).forEach(k => { const r = resoudre(val[k], ancien && typeof ancien === 'object' ? ancien[k] : undefined); if (r !== undefined) o[k] = r; }); return o; }
    return val;
  }
  function fusion(cible, src) {         // setDoc(..., { merge: true }) : fusion profonde des objets
    Object.keys(src).forEach(k => {
      const v = src[k];
      if (v && typeof v === 'object' && v[SENT] === 'del') { delete cible[k]; return; }
      if (v && typeof v === 'object' && !Array.isArray(v) && !v[SENT] && !(v instanceof Timestamp) && !(v instanceof Date) && cible[k] && typeof cible[k] === 'object' && !Array.isArray(cible[k]) && cible[k].__ts === undefined) fusion(cible[k], v);
      else { const r = resoudre(v, cible[k]); if (r === undefined) delete cible[k]; else cible[k] = r; }
    });
    return cible;
  }
  function poserChemin(cible, chemin, v) {    // updateDoc : « a.b.c » est un chemin
    const p = chemin.split('.'); let o = cible;
    for (let i = 0; i < p.length - 1; i++) { if (!o[p[i]] || typeof o[p[i]] !== 'object') o[p[i]] = {}; o = o[p[i]]; }
    const der = p[p.length - 1];
    const r = resoudre(v, o[der]);
    if (r === undefined) delete o[der]; else o[der] = r;
  }
  const lireChamp = (o, chemin) => chemin.split('.').reduce((x, k) => x == null ? undefined : x[k], o);

  /* ---------------- références ---------------- */
  const db = { type: 'firestore-local', app: { name: 'sandbox' } };
  let compteurId = 0;
  const autoId = () => (Date.now().toString(36) + (compteurId++).toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 20);
  function collection(base, ...seg) {
    const p = base && base.type === 'collection' ? [base.path, ...seg] : base && base.type === 'doc' ? [base.path + '/' + base.id, ...seg] : seg;
    return { type: 'collection', path: p.join('/'), id: p[p.length - 1] };
  }
  function doc(base, ...seg) {
    if (base && base.type === 'collection' && !seg.length) return { type: 'doc', path: base.path, id: autoId() };
    const p = base && base.type === 'collection' ? [base.path, ...seg] : base && base.type === 'doc' ? [base.path + '/' + base.id, ...seg] : seg;
    const id = String(p.pop());
    return { type: 'doc', path: p.join('/'), id };
  }
  const where = (field, op, value) => ({ k: 'where', field, op, value });
  const orderBy = (field, dir) => ({ k: 'orderBy', field, dir: dir || 'asc' });
  const limit = n => ({ k: 'limit', n });
  const query = (ref, ...c) => ({ type: 'query', path: ref.path, contraintes: (ref.contraintes || []).concat(c) });

  /* ---------------- documents virtuels reliés au CRM ---------------- */
  const VIRTUELS = {};
  /* Salles exposées dans timers/liveState : les 4 chronos historiques gardent leur numéro (1 bas, 2 haut,
     3 karaoké, 4 quiz : champ « legacy »), toutes les autres salles des activités affichées sur le front
     employé y sont aussi, sous l'identifiant de la salle. L'ancien code ne lit que 1 à 4 ; la page
     chronos les lit toutes. */
  function sallesChrono() {
    if (!SB || !SB.pret()) return {};
    const E = SB.etat(), o = {}; let i = 0;
    (E.config.activites || []).forEach(a => {
      if (a.modele === 'vente' || a.modele === 'combo') return;
      const vis = SB.moteur.front(a, E).visible;
      (a.ressources || []).forEach(r => { if (r.legacy || vis) o[r.legacy || r.id] = { r, a, ordre: i++ }; });
    });
    return o;
  }
  const html = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const texteTitre = t => { if (!t) return ''; const p = String(t).split(/<br\s*\/?>/i); return (p.length > 1 ? p.slice(1).join(' ') : p[0]).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); };
  VIRTUELS['timers/liveState'] = {
    lire() {
      const L = sallesChrono(), C = SB ? SB.etat().chronos : {}, out = {};
      Object.keys(L).forEach(n => {
        const { r, a, ordre } = L[n], c = C[r.id] || {};
        out[n] = { endTime: c.fin || null, isCountingDown: !!c.fin, isPaused: c.fin ? false : c.pause != null, pausedRemainingMs: c.fin ? null : (c.pause != null ? c.pause : null), notified: !!c.alerte, title: c.titre ? html(r.nom) + '<br><span style="font-size:0.8em; font-weight:normal;">' + html(c.titre) + '</span>' : null, label: r.nom, activite: a.nom, couleur: a.c || null, ordre };
      });
      return Object.keys(out).length ? out : null;
    },
    ecrire(data, avant) {
      const L = sallesChrono();
      Object.keys(data).forEach(n => {
        const x = L[n]; const v = data[n]; if (!x || !v || typeof v !== 'object') return;
        if (avant && JSON.stringify(avant[n]) === JSON.stringify(v)) return;     // salle inchangée
        const r = x.r, C = SB.etat().chronos[r.id] || {};
        const patch = { fin: v.isCountingDown && v.endTime ? v.endTime : null, pause: v.isPaused ? (v.pausedRemainingMs || 0) : null };
        if (v.title !== undefined) patch.titre = texteTitre(v.title);   /* « Salle Bas<br><span>Anniv : Maël</span> » → « Anniv : Maël » */
        if (!patch.fin && patch.pause == null) { patch.titre = ''; patch.resa = null; }
        if (patch.fin && !C.fin && C.pause == null) { patch.lance = Date.now(); patch.duree = Math.round((patch.fin - Date.now()) / 60000); }
        SB.api.chrono(r.id, 'remplacer', patch, 'front');
      });
    },
    sources: ['chronos', 'config']
  };
  /* anniversaires réservés dans le CRM, au format de l'ancien scan (crmSyncPreview) */
  function cleFormule(nom) {
    const n = String(nom || '').toLowerCase();
    if (/quiz/.test(n)) return 'quiz';
    if (/laser/.test(n) && /bowling/.test(n)) return 'bowling_laser';
    if (/laser/.test(n)) return 'laser_jeune';
    if (/jeune/.test(n)) return 'bowling_jeune';
    return 'bowling_enfant';
  }
  const COLL_VIRTUELLES = {
    crmSyncPreview: {
      lire() {
        if (!SB || !SB.pret()) return {};
        const E = SB.etat(), combos = new Set((E.config.activites || []).filter(a => a.modele === 'combo').map(a => a.id)), out = {};
        E.reservations.filter(r => combos.has(r.act)).forEach(r => {
          const d = SB.temps.dateDeJour(r.jour), an = r.anniv || {};
          const m = /Anniv\.?\s+([^,]+),\s*(\d+)/.exec(r.titre || '');
          out['crm_' + (r.num || r.id)] = {
            activity: 'anniversaire', order_id: r.num || r.id, y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: Math.floor(r.debut / 60), i: r.debut % 60,
            childFirstName: an.enfant || (m ? m[1] : ''), childAge: an.age || (m ? +m[2] : null), nbr_participants: r.pers, birthdayFormulaKey: cleFormule(r.formule),
            champomyCount: an.champomy ? 1 : 0, cake: 'chocolat', user: r.client, phone: r.tel || '', depositPaid: (r.paye || 0) > 0, source: 'crm-sandbox'
          };
        });
        return out;
      },
      sources: ['reservations', 'config']
    }
  };

  /* ---------------- lecture ---------------- */
  function lireDoc(ref) {
    const cle = ref.path + '/' + ref.id;
    if (VIRTUELS[cle]) { const d = VIRTUELS[cle].lire(); return d == null ? undefined : d; }
    if (COLL_VIRTUELLES[ref.path]) return COLL_VIRTUELLES[ref.path].lire()[ref.id];
    return lireCol(ref.path)[ref.id];
  }
  function docSnap(ref, data) {
    const d = data === undefined ? undefined : versLecture(clone(data));
    return { id: ref.id, ref, exists: () => d !== undefined, data: () => d === undefined ? undefined : versLecture(clone(data)), get: f => d === undefined ? undefined : lireChamp(d, f), metadata: { hasPendingWrites: false, fromCache: false } };
  }
  function comparer(a, b) {
    const x = a instanceof Timestamp ? a._ms : a && a.__ts !== undefined ? a.__ts : a;
    const y = b instanceof Timestamp ? b._ms : b && b.__ts !== undefined ? b.__ts : b;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  function executer(q) {
    const tous = COLL_VIRTUELLES[q.path] ? COLL_VIRTUELLES[q.path].lire() : lireCol(q.path);
    let lst = Object.keys(tous).map(id => ({ id, data: tous[id] }));
    const C = q.contraintes || [];
    C.filter(c => c.k === 'where').forEach(c => {
      lst = lst.filter(x => {
        const v = lireChamp(x.data, c.field), w = c.value;
        switch (c.op) {
          case '==': return JSON.stringify(v) === JSON.stringify(w);
          case '!=': return JSON.stringify(v) !== JSON.stringify(w);
          case '<': return v != null && comparer(v, w) < 0;
          case '<=': return v != null && comparer(v, w) <= 0;
          case '>': return v != null && comparer(v, w) > 0;
          case '>=': return v != null && comparer(v, w) >= 0;
          case 'in': return Array.isArray(w) && w.some(z => JSON.stringify(z) === JSON.stringify(v));
          case 'array-contains': return Array.isArray(v) && v.some(z => JSON.stringify(z) === JSON.stringify(w));
          default: return true;
        }
      });
    });
    const tri = C.filter(c => c.k === 'orderBy');
    if (tri.length) lst.sort((a, b) => { for (const t of tri) { const r = comparer(lireChamp(a.data, t.field), lireChamp(b.data, t.field)) * (t.dir === 'desc' ? -1 : 1); if (r) return r; } return 0; });
    const lim = C.find(c => c.k === 'limit');
    if (lim) lst = lst.slice(0, lim.n);
    return lst;
  }
  function querySnap(q, lst) {
    const docs = lst.map(x => docSnap({ type: 'doc', path: q.path, id: x.id }, x.data));
    return { docs, empty: !docs.length, size: docs.length, forEach: fn => docs.forEach(fn), docChanges: () => docs.map(d => ({ type: 'added', doc: d })) };
  }

  /* ---------------- écoute en direct ---------------- */
  const abonnes = new Set();
  const enAttente = new Set();
  let planifie = false;
  function planifier(chemin) {
    enAttente.add(chemin);
    if (planifie) return;
    planifie = true;
    setTimeout(() => {
      planifie = false;
      const ch = new Set(enAttente); enAttente.clear();
      abonnes.forEach(a => { if (ch.has(a.path) || ch.has('*')) a.rafraichir(); });
    }, 0);
  }
  function onSnapshot(ref, a, b, c) {
    let suivant = a, erreur = b;
    if (a && typeof a === 'object' && !Array.isArray(a) && typeof a !== 'function' && (b || c)) { suivant = b; erreur = c; }   // onSnapshot(ref, options, cb)
    if (a && typeof a === 'object' && typeof a.next === 'function') { suivant = a.next.bind(a); erreur = a.error && a.error.bind(a); }
    const cleDoc = ref.type === 'doc' ? ref.path + '/' + ref.id : null;
    const abo = { path: ref.path, dernier: null, actif: true };
    if (cleDoc && VIRTUELS[cleDoc]) abo.path = 'virtuel:' + cleDoc;
    if (!cleDoc && COLL_VIRTUELLES[ref.path]) abo.path = 'virtuel:' + ref.path;
    abo.rafraichir = () => {
      if (!abo.actif) return;
      try {
        let snap, sig;
        if (ref.type === 'doc') { const d = lireDoc(ref); sig = JSON.stringify(d === undefined ? null : d); snap = docSnap(ref, d); }
        else { const lst = executer(ref.type === 'query' ? ref : { path: ref.path, contraintes: [] }); sig = JSON.stringify(lst); snap = querySnap(ref, lst); }
        if (sig === abo.dernier) return;
        abo.dernier = sig;
        suivant && suivant(snap);
      } catch (e) { console.error('[sandbox] onSnapshot', ref.path, e); erreur && erreur(e); }
    };
    abonnes.add(abo);
    setTimeout(abo.rafraichir, 0);
    return () => { abo.actif = false; abonnes.delete(abo); };
  }
  /* autres onglets */
  window.addEventListener('storage', e => {
    if (!e.key) { planifier('*'); return; }
    if (e.key.startsWith(PFX)) planifier(e.key.slice(PFX.length));
  });
  /* état partagé avec le CRM : rafraîchit les documents virtuels */
  if (SB) SB.ecouter(m => {
    const cles = m.cles || [];
    if (!cles.length) return;
    Object.keys(VIRTUELS).forEach(k => { if (VIRTUELS[k].sources.some(s => cles.includes(s))) planifier('virtuel:' + k); });
    Object.keys(COLL_VIRTUELLES).forEach(k => { if (COLL_VIRTUELLES[k].sources.some(s => cles.includes(s))) planifier('virtuel:' + k); });
  });

  /* ---------------- écriture ---------------- */
  function ecrireDoc(ref, fn) {
    const cle = ref.path + '/' + ref.id;
    if (VIRTUELS[cle]) {
      const avant = VIRTUELS[cle].lire() || {};
      const apres = fn(clone(avant), true);
      if (apres !== undefined) VIRTUELS[cle].ecrire(apres, avant);
      planifier('virtuel:' + cle);
      return;
    }
    if (COLL_VIRTUELLES[ref.path]) { console.warn('[sandbox] ' + ref.path + ' est en lecture seule (il vient du CRM)'); return; }
    const col = clone(lireCol(ref.path));
    const r = fn(col[ref.id] === undefined ? undefined : col[ref.id], false);
    if (r === undefined) delete col[ref.id]; else col[ref.id] = r;
    ecrireCol(ref.path, col);
  }
  const setDoc = (ref, data, opts) => new Promise(ok => {
    ecrireDoc(ref, (ancien) => opts && (opts.merge || opts.mergeFields) ? fusion(ancien && typeof ancien === 'object' ? ancien : {}, data) : resoudre(data, ancien));
    ok();
  });
  const updateDoc = (ref, data) => new Promise((ok, ko) => {
    const cle = ref.path + '/' + ref.id;
    if (!VIRTUELS[cle] && lireDoc(ref) === undefined) { const e = new Error('No document to update: ' + cle); e.code = 'not-found'; ko(e); return; }
    ecrireDoc(ref, (ancien) => { const o = ancien && typeof ancien === 'object' ? ancien : {}; Object.keys(data).forEach(k => poserChemin(o, k, data[k])); return o; });
    ok();
  });
  const deleteDoc = ref => new Promise(ok => { ecrireDoc(ref, () => undefined); ok(); });
  const addDoc = (colRef, data) => new Promise(ok => { const ref = { type: 'doc', path: colRef.path, id: autoId() }; ecrireDoc(ref, () => resoudre(data)); ok(ref); });
  const getDoc = ref => Promise.resolve(docSnap(ref, lireDoc(ref)));
  const getDocs = q => Promise.resolve(querySnap(q, executer(q.type === 'query' ? q : { path: q.path, contraintes: [] })));
  function writeBatch() {
    const ops = [];
    const b = {
      set(ref, data, opts) { ops.push(() => setDoc(ref, data, opts)); return b; },
      update(ref, data) { ops.push(() => updateDoc(ref, data)); return b; },
      delete(ref) { ops.push(() => deleteDoc(ref)); return b; },
      commit: async () => { for (const op of ops) await op(); }
    };
    return b;
  }

  /* ---------------- authentification ---------------- */
  const UTILISATEUR = { uid: 'sandbox-admin', displayName: 'Sandbox', email: 'sandbox@local', photoURL: '' };
  const auth = { currentUser: null, app: db.app, name: 'auth-local' };
  const abonnesAuth = new Set();
  let connecte = true;
  try { connecte = localStorage.getItem(PFX + '__deconnecte') !== '1'; } catch (e) { connecte = true; }
  function prevenir() {
    auth.currentUser = connecte ? UTILISATEUR : null;
    tools.currentUser = auth.currentUser;
    abonnesAuth.forEach(cb => {
      Promise.resolve().then(() => cb(auth.currentUser)).then(() => {
        document.dispatchEvent(new CustomEvent('sbx:auth', { detail: { connecte } }));
      }).catch(e => console.error('[sandbox] auth', e));
    });
  }
  function onAuthStateChanged(a, cb) { abonnesAuth.add(cb); setTimeout(() => { auth.currentUser = connecte ? UTILISATEUR : null; tools.currentUser = auth.currentUser; Promise.resolve(cb(auth.currentUser)).then(() => document.dispatchEvent(new CustomEvent('sbx:auth', { detail: { connecte } }))).catch(e => console.error('[sandbox] auth', e)); }, 0); return () => abonnesAuth.delete(cb); }
  function signInWithPopup() { connecte = true; try { localStorage.removeItem(PFX + '__deconnecte'); } catch (e) { /* ignore */ } prevenir(); return Promise.resolve({ user: UTILISATEUR }); }
  function signOut() { connecte = false; try { localStorage.setItem(PFX + '__deconnecte', '1'); } catch (e) { /* ignore */ } prevenir(); return Promise.resolve(); }
  function GoogleAuthProvider() { this.setCustomParameters = () => {}; this.addScope = () => {}; }

  /* compte administrateur et petite équipe fictive au premier lancement */
  (function amorcer() {
    const u = lireCol('users');
    if (!u[UTILISATEUR.uid]) { u[UTILISATEUR.uid] = { email: UTILISATEUR.email, displayName: UTILISATEUR.displayName, role: 'admin' }; ecrireCol('users', u); }
    const c = lireCol('cleaners');
    if (!Object.keys(c).length) {
      ecrireCol('cleaners', { e1: { name: 'Inès', color: '#2f5fd0' }, e2: { name: 'Hugo', color: '#e05a1e' }, e3: { name: 'Sami', color: '#0f9f8a' }, e4: { name: 'Clara', color: '#be185d' } });
    }
  })();

  /* ---------------- Cloud Functions : servies en local ---------------- */
  const fetchOrigine = window.fetch ? window.fetch.bind(window) : null;
  const reponse = (o, statut) => Promise.resolve(new Response(JSON.stringify(o), { status: statut || 200, headers: { 'Content-Type': 'application/json' } }));
  async function corps(init) { try { return init && init.body ? JSON.parse(init.body) : {}; } catch (e) { return {}; } }
  const FONCTIONS = {
    async getWaitingTime() { const g = SB ? SB.etat().reglages : {}; return { success: true, minutes: g.attente != null ? g.attente : 15 }; },
    async setWaitingTime(init) { const b = await corps(init); const m = Math.max(0, parseInt(b.minutes, 10) || 0); if (SB) SB.api.reglages({ attente: m }, 'front'); return { success: true, minutes: m }; },
    async syncCrmManual() { return { success: true, newOrders: [], message: 'Sandbox : le CRM et le front sont reliés en direct, il n’y a plus rien à aller chercher.' }; },
    async closeCrmSlot() { return { success: true, message: 'Sandbox : fermez le créneau directement sur le planning (il est partagé avec le CRM).' }; },
    async openCrmSlot() { return { success: true }; },
    async checkAnniversaireCapacity(init) {
      const b = await corps(init); if (!SB || !SB.pret() || !b.date) return { success: true, closed: [] };
      const E = SB.etat(), j = SB.temps.jourDeIso(b.date), combos = (E.config.activites || []).filter(a => a.modele === 'combo').map(a => a.id);
      const n = E.reservations.filter(r => r.jour === j && combos.includes(r.act) && !/quiz/i.test(r.formule)).length;
      const fiches = Object.values(lireCol('dailyBirthdays')).filter(x => x.date === b.date && x.formulaKey !== 'quiz' && !x.crmOrderId).length;
      return { success: true, bookedCount: n + fiches, closed: [] };
    },
    async getBowlingLanesToday() {
      if (!SB || !SB.pret()) return { success: true, hours: [] };
      const E = SB.etat(), t = SB.temps.maintenant(), pistes = new Set((E.config.activites || []).filter(a => a.modele === 'piste').flatMap(a => a.ressources.map(r => r.id)));
      const parH = {};
      E.reservations.filter(r => r.jour === t.j && SB.moteur.actives(r)).forEach(r => {
        const n = (r.blocs || []).filter(b => pistes.has(b.r)).length; if (!n) return;
        const h = Math.floor(r.debut / 60);
        (parH[h] = parH[h] || { hour: h, totalLanes: 0, bookings: [] });
        parH[h].totalLanes += n; parH[h].bookings.push({ lanes: n, participants: r.pers, client: r.titre || r.client });
      });
      return { success: true, hours: Object.values(parH).sort((a, b) => a.hour - b.hour) };
    },
    async getBarOrders() { return { success: true, orders: [] }; }
  };
  if (fetchOrigine) {
    window.fetch = function (entree, init) {
      const url = typeof entree === 'string' ? entree : entree && entree.url ? entree.url : String(entree);
      if (/cloudfunctions\.net\//.test(url) || /firestore\.googleapis\.com|identitytoolkit\.googleapis\.com/.test(url)) {
        const nom = url.split('?')[0].split('/').pop();
        if (FONCTIONS[nom]) return FONCTIONS[nom](init).then(o => reponse(o)).catch(e => reponse({ success: false, message: String(e) }, 500));
        console.warn('[sandbox] appel de production bloqué :', url);
        return reponse({ success: false, message: 'Sandbox : appel de production bloqué' }, 503);
      }
      return fetchOrigine(entree, init);
    };
  }

  /* ---------------- l'objet attendu par script_v2.js ---------------- */
  const tools = {
    auth, db, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut,
    doc, getDoc, setDoc, updateDoc, onSnapshot, collection, addDoc, getDocs, writeBatch, query, where, deleteDoc, deleteField,
    orderBy, limit, arrayUnion, serverTimestamp, Timestamp,
    currentUser: null,
    __sandbox: true
  };
  window.firebaseTools = tools;
  window.__sbxFirestore = { lireCol, ecrireCol, executer, VIRTUELS, COLL_VIRTUELLES };
})();
