/* =====================================================================
   Batterie de tests SpaceBowling : moteur partagé, CRM, borne.
   Ouvrir tests/index.html (même serveur que le CRM), ou lancer
   « python tests/lancer.py » (Chrome ou Edge sans fenêtre).

   Tout tourne dans deux cadres (CRM et borne K-02) sur une sandbox à part
   (window.SBX_ESPACE = 'test' → clés « sbx-test:* »). Chaque test pilote
   les vrais écrans (clics, saisies) ou appelle SB.api, puis vérifie
   l'état. À chaque nouvelle fonction du CRM ou de la borne : ajouter
   son test ici, dans la bonne suite.
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ Mini-cadre de test */
  const TESTS = [];
  let suiteCourante = '';
  const suite = (nom, f) => { suiteCourante = nom; f(); };
  const test = (nom, fn, o = {}) => TESTS.push({ suite: suiteCourante, nom, fn, delai: o.delai || 30000 });
  class Echec extends Error {}
  const ok = (v, msg) => { if (!v) throw new Echec(msg || 'condition fausse'); };
  const egal = (obtenu, attendu, msg) => { const a = JSON.stringify(obtenu), b = JSON.stringify(attendu); if (a !== b) throw new Echec((msg ? msg + ' : ' : '') + 'attendu ' + b + ', obtenu ' + a); };
  const pause = ms => new Promise(r => setTimeout(r, ms));
  async function attendre(f, ms = 6000, quoi) {
    const t0 = Date.now();
    for (;;) {
      let v = null; try { v = f(); } catch (e) { v = null; }
      if (v) return v;
      if (Date.now() - t0 > ms) throw new Echec('délai dépassé : ' + (quoi || String(f).replace(/\s+/g, ' ').slice(0, 90)));
      await pause(40);
    }
  }
  const prix = t => +String(t).replace(/[^\d,]/g, '').replace(',', '.');      // « 9,00 € / joueur » → 9
  const arrondi = n => Math.round(n * 100) / 100;

  /* ------------------------------------------------------------------ Les deux cadres */
  const erreurs = { crm: [], borne: [], site: [] };
  const cadre = id => document.getElementById(id);
  /* erreurs JS d'un cadre (exceptions, promesses rejetées, console.error) : chaque test vérifie qu'il n'y en a pas eu */
  function espionner(nom, w) {
    const L = erreurs[nom] = (w.__erreurs || []).slice();            // erreurs pendant le chargement (relevé en tête de page)
    w.addEventListener('error', e => L.push((e.message || 'erreur') + (e.filename ? ' (' + e.filename.split('/').pop().split('?')[0] + ':' + e.lineno + ')' : '')));
    w.addEventListener('unhandledrejection', e => L.push('promesse rejetée : ' + ((e.reason && e.reason.message) || e.reason)));
    const ce = w.console.error.bind(w.console);
    w.console.error = (...a) => { L.push(a.map(x => (x && x.message) || String(x)).join(' ')); ce(...a); };
  }
  const sansErreur = nom => { const x = (erreurs[nom] || []).splice(0); ok(!x.length, 'erreurs JS dans ' + nom + ' : ' + x.join(' | ')); };
  function charger(id, url) {
    return new Promise(res => { const f = cadre(id); f.onload = () => { espionner(id, f.contentWindow); res(f.contentWindow); }; f.src = url; });
  }

  /* CRM : une action comme un clic (bouton data-a fabriqué), une expression évaluée dans sa page */
  const C = () => cadre('crm').contentWindow;
  const crm = x => C().eval(x);
  const cq = s => C().document.querySelector(s);
  const cqa = s => [...C().document.querySelectorAll(s)];
  async function action(a, data = {}) {
    const b = C().document.createElement('button'); b.dataset.a = a; Object.entries(data).forEach(([k, v]) => { b.dataset[k] = v; });
    C().document.getElementById('app').appendChild(b); b.click(); b.remove(); await pause(20);
  }
  const SBc = () => C().SB;

  /* borne K-02 : l'écran affiché, la vue courante (la précédente glisse encore 0,4 s), clics et saisies */
  const B = () => cadre('borne').contentWindow;
  const ecran = () => B().document.getElementById('borne').dataset.ecran;
  const vue = s => B().document.querySelector('#ecran .vue:last-child ' + s);
  const vues = s => [...B().document.querySelectorAll('#ecran .vue:last-child ' + s)];
  const bq = s => B().document.querySelector(s);
  const texte = () => (B().document.querySelector('#ecran .vue:last-child') || {}).textContent || '';
  async function borne(query = 'borne=K-02') { await charger('borne', '../borne/index.html?' + query); await attendre(() => ecran(), 6000, 'démarrage de la borne'); }
  const surEcran = (e, ms) => attendre(() => ecran() === e && vue('*'), ms || 6000, 'écran « ' + e + ' » (actuel : ' + ecran() + ')');
  async function clic(sel, global) {
    const el = await attendre(() => { const x = global ? bq(sel) : vue(sel); return x && !x.disabled && x; }, 5000, 'bouton ' + sel + ' sur « ' + ecran() + ' »');
    el.click(); await pause(60); return el;
  }
  async function saisir(sel, v) {
    const el = await attendre(() => vue(sel), 5000, 'champ ' + sel);
    el.value = v; el.dispatchEvent(new (B().Event)('input', { bubbles: true })); await pause(20);
  }
  async function accueil(q) { await borne(q); await surEcran('veille'); await clic('.veille'); await surEcran('accueil'); }
  /* paiement simulé par carte, quel que soit le chemin (Paiement › Tout payer › Moyen › Terminal) */
  async function payerCarte() {
    await attendre(() => ['regler', 'moyen', 'tpe', 'merci'].includes(ecran()), 6000, 'écran de paiement');
    if (ecran() === 'regler' && vue('[data-a="tout"]')) { await clic('[data-a="tout"]'); await attendre(() => ['moyen', 'tpe'].includes(ecran())); }
    if (['moyen', 'regler'].includes(ecran())) await clic('[data-a="moyen"][data-m="Carte"]');      // « Payer une partie » décoché : carte ou espèces dès la page de paiement
    if (ecran() !== 'merci') { await surEcran('tpe'); await clic('[data-a="simOk"]'); }
    await surEcran('merci', 8000);
  }
  async function finirCarte() {
    for (let k = 0; k < 10 && ecran() !== 'merci'; k++) {
      await attendre(() => !bq('#couche .flash') && ['regler', 'moyen', 'tpe', 'merci'].includes(ecran()), 6000, 'écran de paiement (actuel : ' + ecran() + ')');
      if (ecran() === 'regler') await clic('[data-a="tout"]'); else if (ecran() === 'moyen') await clic('[data-a="moyen"][data-m="Carte"]'); else if (ecran() === 'tpe') await clic('[data-a="simOk"]');
      await pause(250);
    }
    await surEcran('merci', 6000);
  }
  /* depuis le règlement ou le choix du moyen : la tuile « Ticket CE », puis les codes un par un */
  async function versTicket() {
    await attendre(() => ['regler', 'moyen'].includes(ecran()), 6000, 'écran de paiement');
    if (vue('[data-a="tout"]')) { await clic('[data-a="tout"]'); await surEcran('moyen'); }
    await clic('[data-a="moyen"][data-m="Ticket CE"]'); await surEcran('ticket');
  }
  async function scanner(code) { await saisir('[data-f="ceCode"]', code); await clic('[data-a="ceAjouter"]'); }
  const FAITS = { resas: [], ventes: [] };              // créés par les parcours de la borne, vérifiés ensuite dans le CRM
  /* le premier jour (à partir de J+2) qui a des créneaux pour cette activité */
  const jourAvec = (act, de = 2) => { const SB = SBc(), now = SB.temps.maintenant(); for (let j = now.j + de; j < now.j + 60; j++) if (SB.moteur.slotsJour(SB.etat(), act, j).length) return j; return null; };
  const heuresBorne = (act, f, nb, j) => ((SBc().api.resa.creneaux(act, f, nb).find(x => x.j === j) || {}).heures || []).map(x => x.h);
  /* Ctrl+Alt+H sur la borne : coupe ou rend le réseau (mode test) */
  const reseau = () => B().document.dispatchEvent(new (B().KeyboardEvent)('keydown', { key: 'h', ctrlKey: true, altKey: true, bubbles: true }));
  const saisirCrm = (sel, v) => { const el = cq(sel); ok(el, 'champ ' + sel); el.value = v; el.dispatchEvent(new (C().Event)('input', { bubbles: true })); el.dispatchEvent(new (C().Event)('change', { bubbles: true })); return pause(40); };
  /* bar : un article simple (sans option obligatoire ni alcool, disponible maintenant) dans le panier */
  async function articleSimple(q) {
    if (q !== 'ici') { await accueil(q); await clic('[data-a="module"][data-act="bar"]'); }       // 'ici' : déjà sur la carte (téléphone)
    await surEcran('bar');
    const simple = () => vues('.carte-p:not(.off)').find(p => !p.querySelector('.cp-n small') && !p.querySelector('.b18'));
    await clic('.carte-c[data-a="rub"]');
    let prod = null;
    for (const c of vues('.rail [data-a="rub"]').map(b => b.dataset.c)) {
      vue(`.rail [data-a="rub"][data-c="${CSS.escape(c)}"]`).click(); await pause(120);
      if ((prod = simple())) break;
      for (const x of vues('.carte-c[data-a="sous"]').map(b => b.dataset.s)) { const b = vue(`[data-a="sous"][data-s="${CSS.escape(x)}"]`); if (b) { b.click(); await pause(120); } if ((prod = simple())) break; }
      if (prod) break;
    }
    ok(prod, 'aucun article simple trouvé');
    prod.querySelector('.cp-plus').click(); await pause(100);
  }
  /* bar : du panier jusqu'à l'écran de paiement (offres refusées, prénom, lieu) */
  async function barJusquAuPaiement(nom, avant) {
    await clic('[data-a="continuer"]', true);
    for (let k = 0; k < 6 && ecran() !== 'recap'; k++) { const non = bq('#couche [data-a="upNon"]'); if (non) non.click(); await pause(250); }
    await surEcran('recap'); await saisir('[data-f="nom"]', nom); await clic('[data-a="valider"]', true); await surEcran('ou');
    await clic('.zone-t'); if (vue('.num')) await clic('.num');
    if (avant) await avant();
    await clic('[data-a="ouOk"]', true);
  }
  /* laser : de l'accueil au récapitulatif */
  async function laserRecap(groupe) {
    await accueil(); await clic('[data-a="module"][data-act="laser"]'); await surEcran('rs-formule');
    await clic('.an-f'); await surEcran('rs-nombre'); await clic('[data-a="rsSuite"][data-e="rs-nombre"]'); await surEcran('rs-date');
    await clic('.an-j.dispo'); await clic('.an-h'); await clic('[data-a="rsSuite"][data-e="rs-date"]'); await surEcran('rs-infos');
    await saisir('[data-f="rsGroupe"]', groupe); await clic('[data-a="rsSuite"][data-e="rs-infos"]'); await surEcran('rs-recap');
  }
  /* tickets CE de test, liés à une activité (lot.act ; '*' = partout) : renvoie le code créé */
  function codeTest(act, contenu, valeur) {
    const id = 'T' + act.replace('*', 'X').toUpperCase().slice(0, 3) + Math.random().toString(36).slice(2, 6).toUpperCase(), code = id + '-0001-' + (1000 + Math.floor(Math.random() * 9000));
    SBc().modifier('tickets', X => { X = X || { lots: [], codes: [], usages: [] }; X.lots.push({ id, org: 'CE essai', type: 'Ticket CE', contenu, act, nb: 1, valeur, utilises: 0, annules: 0, etat: 'actif' }); X.codes.push({ id: code, code, lot: id, org: 'CE essai', contenu, etat: 'disponible' }); return X; }, 'test');
    return code;
  }
  /* bowling : de l'accueil au récapitulatif */
  async function bowlingRecap(groupe) {
    await accueil(); await clic('[data-a="module"][data-act="bowling"]'); await surEcran('bw-formule');
    await clic('.formule'); await clic('[data-bwsuite]'); await surEcran('bw-joueurs');
    await saisir('[data-f="groupe"]', groupe);
    for (const [i, el] of vues('[data-f="prenom"]').entries()) { el.value = ['Zoé', 'Max', 'Lou', 'Noé'][i] || 'J' + i; el.dispatchEvent(new (B().Event)('input', { bubbles: true })); }
    await clic('[data-a="bwJoueursOk"]'); await surEcran('bw-recap');
  }
  const numMerci = () => +((texte().match(/n°\s*(\d{6})/) || [])[1] || 0);
  const resa = id => (SBc().etat().reservations || []).find(r => r.id === id);
  const reglerModule = (act, f) => SBc().modifier('config', c => { const a = c.activites.find(x => x.id === act); a.module = a.module || {}; f(a.module); return c; }, 'test');

  /* =====================================================================
     SUITE 1 — MOTEUR PARTAGÉ (SB, centre-partage.js)
     ===================================================================== */
  suite('Moteur', () => {
    test('Sandbox de test amorcée par le CRM, à part de la vraie', () => {
      const SB = SBc(), E = SB.etat();
      egal(SB.ESPACE, 'test', 'espace');
      ok(localStorage.getItem('sbx-test:config'), 'clé sbx-test:config absente');
      ['bowling', 'laser', 'karaoke', 'quiz', 'anniv', 'billard', 'bar'].forEach(id => ok(E.config.activites.some(a => a.id === id), 'activité manquante : ' + id));
      ok((E.config.bornes || []).some(b => b.id === 'K-02'), 'borne K-02 absente');
    });
    test('Pâques et jours fériés', () => {
      const T = SBc().temps, d = (y, m, j) => new Date(y, m - 1, j), iso = x => T.iso(x);
      egal(iso(T.paques(2026)), '2026-04-05', 'Pâques 2026'); egal(iso(T.paques(2027)), '2027-03-28', 'Pâques 2027');
      [[1, 1], [4, 6], [5, 1], [5, 8], [5, 14], [5, 25], [7, 14], [8, 15], [11, 1], [11, 11], [12, 25]].forEach(([m, j]) => ok(T.ferie(d(2026, m, j)), 'férié attendu le ' + j + '/' + m + '/2026'));
      ok(!T.ferie(d(2026, 10, 12)), '12/10/2026 n’est pas férié');
      ok(T.ferieOuVeille(d(2026, 12, 24)), 'veille de Noël');
    });
    test('Vacances scolaires (zone C)', () => {
      const T = SBc().temps;
      ok(T.vacances(new Date(2026, 6, 20)), '20 juillet : vacances');
      ok(!T.vacances(new Date(2026, 9, 6)), '6 octobre : pas de vacances');
    });
    test('Type de module de chaque activité', () => {
      const M = SBc().api.modules, A = id => SBc().etat().config.activites.find(a => a.id === id);
      egal(M.type(A('bowling')), 'bowling'); egal(M.type(A('bar')), 'bar');
      ['laser', 'karaoke', 'quiz', 'anniv', 'billard'].forEach(id => egal(M.type(A(id)), 'resa', id));
    });
    test('Suite de pages fixe (le préréglage), même si un ordre est enregistré', () => {
      const M = SBc().api.modules, A = id => SBc().etat().config.activites.find(a => a.id === id);
      egal(M.etapes(A('laser')), ['rs-formule', 'rs-nombre', 'rs-date', 'rs-infos', 'rs-recap'], 'laser');
      egal(M.etapes(A('anniv')), ['rs-age', 'rs-formule', 'rs-date', 'rs-options', 'rs-infos', 'rs-recap'], 'anniversaire');
      ['karaoke', 'quiz', 'billard'].forEach(id => { const L = M.etapes(A(id)); ok(L.includes('rs-formule') && L.includes('rs-date') && L[L.length - 1] === 'rs-recap', id + ' : ' + L); });
      const a = JSON.parse(JSON.stringify(A('laser'))); a.module = { etapes: ['rs-recap', 'rs-date', 'rs-formule'] };
      egal(M.etapes(a), ['rs-formule', 'rs-nombre', 'rs-date', 'rs-infos', 'rs-recap'], 'ordre enregistré ignoré');
    });
    test('Chaque page a son « Style de la page » (1, 2, 3)', () => {
      const M = SBc().api.modules;
      SBc().etat().config.activites.filter(a => M.type(a)).forEach(a => M.schema(a).filter(s => s.apercu && s.apercu === s.id && !['accueil', 'regler'].includes(s.id)).forEach(s => {
        const c = s.champs[0] || {};
        ok(c.k === 'style' && c.def === '1' && c.choix.map(x => x[0]).join() === '1,2,3', a.id + ' › ' + s.id + ' sans style');
      }));
    });
    test('Onglets du module Anniversaire dans l’ordre des pages', () => {
      const a = SBc().etat().config.activites.find(x => x.id === 'anniv');
      egal(SBc().api.modules.schema(a).map(s => s.lib), ['Accueil', 'Bornes', 'Site web', 'Âge', 'Formule', 'Jour et heure', 'Options', 'Participants', 'Informations', 'Récapitulatif', 'Paiement', 'Fin', 'Ambiance']);
    });
    test('Délais de réservation par défaut (anniversaire 72 h, quiz 2 h, laser 0)', () => {
      const M = SBc().api.modules, A = id => SBc().etat().config.activites.find(a => a.id === id);
      egal(+M.val(A('anniv'), 'reservation', 'delai'), 72, 'anniversaire'); egal(+M.val(A('quiz'), 'reservation', 'delai'), 2, 'quiz'); egal(+M.val(A('laser'), 'reservation', 'delai'), 0, 'laser');
      egal(M.val(A('anniv'), 'reservation', 'paiement'), 'acompte'); egal(+M.val(A('anniv'), 'reservation', 'acompte'), 50);
    });
    test('Créneaux anniversaire : rien avant 72 h, jusqu’à l’horizon', () => {
      const SB = SBc(), C = SB.api.resa.config('anniv'), now = SB.temps.maintenant(), J = SB.api.resa.creneaux('anniv', C.formules[0].nom, 8);
      egal(C.formules.length, 5, 'formules anniversaire'); egal(C.tranches.length, 2, 'tranches d’âge'); egal(C.options.length, 2, 'options');
      ok(J.some(x => x.heures.length), 'aucun créneau anniversaire libre');
      J.forEach(x => x.heures.forEach(h => ok((x.j - now.j) * 1440 + SB.outils.mn(h.h) - now.min >= 72 * 60, 'créneau trop tôt : ' + x.iso + ' ' + h.h)));
      egal(J.length, +SB.api.modules.val(SB.etat().config.activites.find(a => a.id === 'anniv'), 'reservation', 'horizon') + 1, 'jours proposés');
    });
    test('Tarifs bowling cohérents', () => {
      const T = SBc().api.tarifs('bowling', 4);
      ok(T.length, 'aucune formule bowling à cette heure');
      T.forEach(f => { ok(f.unitaire > 0, f.nom + ' sans prix'); egal(arrondi(f.total), arrondi(f.unitaire * 4), f.nom + ' : total de 4 joueurs'); });
    });
    test('Catalogue des bornes (K-02 vend le Laser, K-04 seulement le bar)', () => {
      const m = id => SBc().api.bornes.config(id).modules.map(x => x.act);
      ['bowling', 'laser', 'karaoke', 'anniv', 'bar'].forEach(id => ok(m('K-02').includes(id), 'K-02 sans ' + id));
      egal(m('K-04'), ['bar'], 'K-04');
    });
    test('Réservation Laser par l’API : place gardée, paiement, réservation soldée', () => {
      const SB = SBc(), C = SB.api.resa.config('laser'), f = C.formules[0].nom, J = SB.api.resa.creneaux('laser', f, 2).find(x => x.heures.length);
      ok(J, 'aucun créneau laser libre');
      const h = J.heures[J.heures.length - 1];
      const r = SB.api.bar.commander({ borne: 'K-02', act: 'laser', nom: 'Test API', lieu: 'Accueil', ts: Date.now(), lignes: [], remises: [],
        reservation: { formule: f, j: J.j, h: h.h, nb: 2, tranche: '', options: [], groupe: 'Test API', prenoms: [], enfant: null, contact: null } }, 'test');
      ok(r.ok, 'commande refusée : ' + r.raison);
      const id = 'k' + r.commande.num; ok(resa(id), 'place non gardée'); egal(resa(id).attente, 'paiement');
      egal(r.commande.total, arrondi(h.prix * 2), 'montant');
      const p = SB.api.bar.payer(r.commande.num, { moyen: 'Carte', montant: r.commande.total, lignes: [], ok: true, op: 'test-' + Date.now(), ts: Date.now() }, 'test');
      ok(p.ok && p.commande.etat === 'validee', 'paiement non validé');
      egal(resa(id).paye, resa(id).total, 'réservation soldée'); ok(!resa(id).attente, 'encore en attente');
    });
    test('Réservation abandonnée : la place se libère', () => {
      const SB = SBc(), f = SB.api.resa.config('laser').formules[0].nom, J = SB.api.resa.creneaux('laser', f, 2).filter(x => x.heures.length).slice(-1)[0];
      const r = SB.api.bar.commander({ borne: 'K-02', act: 'laser', nom: 'Abandon', lieu: 'Accueil', ts: Date.now(), lignes: [], remises: [],
        reservation: { formule: f, j: J.j, h: J.heures[0].h, nb: 2, tranche: '', options: [], groupe: 'Abandon', prenoms: [], enfant: null, contact: null } }, 'test');
      ok(r.ok, r.raison); ok(resa('k' + r.commande.num), 'place non gardée');
      SB.api.bar.abandonner(r.commande.num, 'test');
      ok(!resa('k' + r.commande.num), 'la place est restée prise');
    });
    /* Créneaux liés, calculés sur une copie de l'état (rien n'est écrit) : le scénario Karaoké à 2 salles de l'exploitant */
    const karaoke = () => {
      const SB = SBc(), E = SB.copie(SB.etat()), a = E.config.activites.find(x => x.id === 'karaoke'), j = SB.temps.maintenant().j + 5, { mn, hm } = SB.outils;
      a.ressources = [{ id: 'S1', nom: 'Salle 1', cap: 10 }, { id: 'S2', nom: 'Salle 2', cap: 12 }]; a.battement = 0;
      E.config.prix.karaoke = [{ nom: '30 minutes', duree: 30, unite: 'la salle', regles: [{ prix: 25 }] }, { nom: '1 heure', duree: 60, unite: 'la salle', regles: [{ prix: 40 }] }];
      E.creneaux = Object.assign({}, E.creneaux, { karaoke: ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'].map(h => ({ id: 'k' + h, act: 'karaoke', j, h, fin: hm(mn(h) + 30),
        formules: [{ nom: '30 minutes', places: 2, pris: 0 }, { nom: '1 heure', places: 2, pris: 0 }], canaux: ['web', 'borne', 'comptoir'], ouvert: true })) });
      E.reservations = []; E.blocages = [];
      const K = { SB, E, a, j, mn };
      K.dispo = (h, pers) => SB.moteur.etatSlot(E, E.creneaux.karaoke.find(x => x.h === h), pers).formules.map(f => f.reste);      // [30 min, 1 h]
      K.reserver = (salle, h, duree) => E.reservations.push({ id: 'r' + salle + h, jour: j, act: 'karaoke', formule: '1 heure', pers: 6, debut: mn(h), duree, blocs: [{ r: salle, s: mn(h), e: mn(h) + duree }], etatV: 'attendue', titre: 'Martin' });
      K.salle = (h, duree, pers) => { const r = SB.moteur.proposer(E, a, j, mn(h), mn(h) + duree, pers); return r.ok ? r.blocs[0].r : r.raison; };
      return K;
    };
    test('Battement à 0 par défaut (les anciennes activités indépendantes ne perdent pas de créneaux)', () => {
      SBc().etat().config.activites.filter(a => (a.ressources || []).length).forEach(a => egal(+a.battement || 0, 0, a.id));
      ok(!SBc().etat().config.activites.some(a => 'chevauchement' in a), 'ancien réglage « chevauchement » encore là');
    });
    test('Créneaux liés : 1 h réservée à 13:30 en salle 1 ferme ses créneaux qui chevauchent, pas la salle 2', () => {
      const K = karaoke();
      egal(K.dispo('13:00'), [2, 2], '13:00 avant');
      K.reserver('S1', '13:30', 60);
      egal(K.dispo('13:00'), [2, 1], '13:00 (30 min libre dans les 2 salles, 1 h seulement en salle 2)');
      egal(K.dispo('13:30'), [1, 1], '13:30'); egal(K.dispo('14:00'), [1, 1], '14:00'); egal(K.dispo('14:30'), [2, 2], '14:30');
      egal(K.salle('13:30', 60, 6), 'S2', 'groupe placé dans la salle libre');
    });
    test('Créneaux liés : la taille du groupe choisit la salle (la plus petite où il tient)', () => {
      const K = karaoke();
      egal(K.salle('15:00', 60, 8), 'S1', '8 pers.'); egal(K.salle('15:00', 60, 11), 'S2', '11 pers.');
      K.reserver('S1', '13:30', 60);
      egal(K.dispo('13:30', 11), [1, 1], '11 pers. à 13:30 : salle 2'); egal(K.dispo('13:30', 13), [0, 0], '13 pers. : aucune salle assez grande');
      K.reserver('S2', '13:30', 30);
      egal(K.dispo('13:30', 4), [0, 0], 'les deux salles prises');
      const r = K.SB.moteur.etatSlot(K.E, K.E.creneaux.karaoke.find(x => x.h === '15:00'), 13).formules[0].raison;
      ok(/assez grande/.test(r), 'raison donnée : ' + r);
    });
    test('Fermeture à la main d’une salle à un créneau (sans battement)', () => {
      const K = karaoke(); K.a.battement = 10;
      K.E.blocages.push({ id: 'b1', act: 'karaoke', r: 'S2', j: K.j, s: K.mn('13:30'), e: K.mn('14:00'), motif: 'test' });
      egal(K.dispo('13:30'), [1, 1], '13:30 : salle 1 seulement'); egal(K.dispo('13:00'), [2, 1], '13:00 : 30 min dans les 2 salles, 1 h en salle 1');
      egal(K.dispo('14:00'), [2, 2], '14:00 : salle 2 rouverte');
      const refus = K.salle('13:30', 30, 11); ok(/Salle 2 fermée 13:30–14:00/.test(refus), 'la salle fermée a accepté le groupe : ' + refus);
    });
    test('Salle choisie par le client : disponibilité de cette salle seulement, page « salle » en tête du parcours', () => {
      const K = karaoke(); K.reserver('S1', '13:30', 60);
      const st = (h, salle) => K.SB.moteur.etatSlot(K.E, K.E.creneaux.karaoke.find(x => x.h === h), 4, salle).formules.map(f => f.reste);
      egal(st('13:30', 'S1'), [0, 0], 'salle 1 prise'); egal(st('13:30', 'S2'), [1, 1], 'salle 2 libre'); egal(st('13:30'), [1, 1], 'sans choix : une salle libre');
      egal(K.SB.moteur.proposer(K.E, K.a, K.j, K.mn('15:00'), K.mn('16:00'), 4, null, 'S2').blocs[0].r, 'S2', 'groupe placé dans la salle choisie, pas la plus petite');
      const a = Object.assign({}, K.a, { choixRessource: true }), M = K.SB.api.modules;
      egal(M.etapes(a)[0], 'rs-salle', 'page de choix en tête'); ok(M.schema(a).some(x => x.id === 'rs-salle' && x.champs[0].type === 'style'), 'onglet « salle » dans l’éditeur');
      ok(!M.etapes(K.a).includes('rs-salle'), 'page de choix sans le réglage');
    });
    test('Bar : règles horaires (la plus précise gagne, passage de minuit, jours)', () => {
      const M = SBc().moteur, lun = SBc().temps.jourDeIso('2026-10-12'), p = { id: 'x', cat: 'ALCOOL', sous: 'Gin' }, servi = (H, j, min) => M.etatHoraire(H, p, { j, min }).servi;
      const H = [{ id: 1, si: 'c:ALCOOL', jours: [0, 1, 2, 3, 4, 5, 6], de: '13:00', a: '00:30' }];
      ok(servi([], lun, 600), 'sans règle : toujours servi');
      egal([servi(H, lun, 779), servi(H, lun, 780), servi(H, lun, 1455), servi(H, lun, 1470), servi(H, lun, 1471)], [false, true, true, true, false], '13:00 → 00:30 inclus, après minuit');
      egal(M.etatHoraire(H, p, { j: lun, min: 600 }).des, '13:00', 'heure d’ouverture du jour');
      const H2 = H.concat([{ id: 2, si: 's:ALCOOL/Gin', jours: [0, 1, 2, 3, 4], de: '18:00', a: '23:00' }]);
      egal([servi(H2, lun, 840), servi(H2, lun, 1140), servi(H2, lun + 5, 1140)], [false, true, false], 'la sous-catégorie l’emporte sur la catégorie, et ses jours comptent');
      ok(servi(H2.concat([{ id: 3, si: 'p:x', de: '10:00', a: '11:00' }]), lun, 630), 'l’article l’emporte sur tout');
      ok(servi([Object.assign({}, H[0], { actif: false })], lun, 600), 'règle inactive ignorée');
      ok(servi([{ id: 4, si: 'c:ALCOOL', jours: [1], de: '00:00', a: '02:00' }], lun, 1450), 'mardi 00:10 : la règle du mardi compte');
      ok(!servi(H.concat([{ id: 5, si: ['p:y', 'p:x'], de: '10:00', a: '11:00' }]), lun, 900), 'règle sur plusieurs articles : chacun la suit (et elle l’emporte sur la catégorie)');
    });
    test('Formule rattachée à une salle (Tarifs) : sa durée et son prix ne valent que là', () => {
      const K = karaoke(); K.E.config.prix.karaoke[1].salles = ['S2'];
      egal(K.dispo('13:00'), [2, 1], '1 h seulement en salle 2');
      egal(K.SB.moteur.etatSlot(K.E, K.E.creneaux.karaoke[0], 4, 'S1').formules.map(f => f.reste), [1, 0], 'salle 1 choisie : pas de 1 h');
      K.reserver('S2', '13:00', 60); egal(K.dispo('13:00'), [1, 0], 'salle 2 prise : plus de 1 h nulle part');
    });
    test('Créneau ouvert à certaines salles seulement (1 h en salle 2)', () => {
      const K = karaoke();
      K.E.creneaux.karaoke.forEach(sl => { sl.formules[1].salles = ['S2']; });
      egal(K.dispo('13:00'), [2, 1], '30 min dans les 2 salles, 1 h seulement en salle 2');
      egal(K.dispo('13:00', 4), [2, 1], 'groupe de 4');
      K.reserver('S2', '13:00', 60);
      egal(K.dispo('13:00'), [1, 0], 'salle 2 prise : plus de 1 h, même si la salle 1 est libre');
      const r = K.SB.moteur.proposer(K.E, K.a, K.j, K.mn('15:00'), K.mn('16:00'), 4, null, null, ['S2']);
      ok(r.ok && r.blocs[0].r === 'S2', 'le groupe de 4 doit aller en salle 2 (seule ouverte), pas en salle 1');
      ok(!K.SB.moteur.proposer(K.E, K.a, K.j, K.mn('15:00'), K.mn('16:00'), 4, null, 'S1', ['S2']).ok, 'salle 1 forcée alors qu’elle n’est pas ouverte');
    });
    test('Battement entre deux groupes', () => {
      const K = karaoke(); K.a.battement = 10; K.reserver('S1', '13:30', 60);
      egal(K.dispo('13:00'), [1, 1], '13:00 : la salle 1 doit être libre 10 min avant');
      egal(K.dispo('14:30'), [1, 1], '14:30 : la salle 1 a besoin de 10 min de ménage');
      egal(K.dispo('15:00'), [2, 2], '15:00');
    });
    test('Laser et Quiz : une salle par groupe, plus de séance partagée', () => {
      const SB = SBc(), E = SB.copie(SB.etat()), a = E.config.activites.find(x => x.id === 'laser'), j = SB.temps.maintenant().j + 5, m = SB.outils.mn('15:00');
      const [petite, grande] = a.ressources.slice().sort((x, y) => x.cap - y.cap);
      E.reservations = [{ id: 'l1', jour: j, act: 'laser', formule: '1 partie', pers: 4, debut: m, duree: 20, blocs: [{ r: petite.id, s: m, e: m + 20 }], etatV: 'attendue', titre: 'Groupe A' }];
      ok(!SB.moteur.peutPlacer(E, a, petite, j, m, m + 20, 3).ok, 'un 2e groupe a rejoint la séance');
      const r = SB.moteur.proposer(E, a, j, m, m + 20, 3); ok(r.ok && r.blocs[0].r === grande.id, 'le 2e groupe doit aller dans l’autre salle');
      ok(!SB.moteur.proposer(E, a, j, m, m + 20, grande.cap + 1).ok, 'un groupe plus grand que la plus grande salle a été accepté');
      egal(SB.api.resa.config('laser').capMax, Math.max(...a.ressources.filter(x => !x.hs).map(x => x.cap)), 'plus grand groupe accueilli');
    });
    test('Tarifs : la règle la plus précise gagne (week-end, soirée après minuit, groupe, férié)', () => {
      const SB = SBc(), E = SB.copie(SB.etat()), M = SB.moteur, mn = SB.outils.mn, j = iso => SB.temps.jourDeIso(iso);
      E.config.prix.test = [{ nom: 'T', unite: 'par joueur', regles: [{ jours: 'tous', prix: 10 }, { jours: 'we', prix: 12 }, { jours: 'tous', de: '18:00', a: '02:00', prix: 14 }, { jours: 'tous', min: 10, prix: 8 }, { jours: 'ferie', prix: 20 }] }];
      const px = (d, h, n) => M.prix(E, 'test', 'T', j(d), h, n || 2, 1).unitaire;
      egal(px('2026-10-14', mn('14:00')), 10, 'mercredi 14:00'); egal(px('2026-10-17', mn('14:00')), 12, 'samedi 14:00');
      egal(px('2026-10-14', mn('20:00')), 14, 'mercredi 20:00'); egal(px('2026-10-14', 1440 + 60), 14, 'mercredi 01:00, même journée d’exploitation');
      egal(px('2026-10-14', mn('14:00'), 12), 8, 'groupe de 12'); egal(px('2026-11-11', mn('14:00')), 20, '11 novembre');
      egal(M.prix(E, 'test', 'T', j('2026-10-14'), mn('14:00'), 4, 1).total, 40, 'total de 4 joueurs');
    });
    test('Tarifs : « vacances scolaires » et « veilles et fériés » se combinent avec les jours', () => {
      const SB = SBc(), E = SB.copie(SB.etat()), j = iso => SB.temps.jourDeIso(iso), T = SB.temps;
      E.config.prix.test = [{ nom: 'V', unite: 'par joueur', regles: [{ jours: 'tous', prix: 10 }, { jours: 'we', seulVac: true, prix: 15 }, { jours: 'lv', seulVac: true, seulFerie: true, de: '20:00', a: '22:00', prix: 7 }] }];
      const px = (d, h) => SB.moteur.prix(E, 'test', 'V', j(d), h || 840, 2, 1).unitaire, d0 = s2 => SB.temps.dateIso(s2);
      ok(T.vacances(d0('2026-10-24')) && !T.vacances(d0('2026-10-10')), 'calendrier : 24/10 en vacances, 10/10 non');
      egal(px('2026-10-24'), 15, 'samedi pendant les vacances'); egal(px('2026-10-10'), 10, 'samedi hors vacances'); egal(px('2026-10-21'), 10, 'mercredi pendant les vacances (règle du week-end)');
      egal(px('2026-10-21', 1260), 7, 'mercredi 21:00 en vacances'); egal(px('2026-11-11', 1260), 7, 'mercredi 21:00 férié (vacances OU férié)'); egal(px('2026-10-14', 1260), 10, 'mercredi 21:00 ni vacances ni férié');
    });
    test('Tarifs : la fin d’une plage horaire est incluse (minuit compris), et 17:00 reste au tarif du soir', () => {
      const SB = SBc(), E = SB.copie(SB.etat()), j = SB.temps.jourDeIso('2026-10-14'), mn = SB.outils.mn;
      E.config.prix.test = [{ nom: 'S', unite: 'par joueur', regles: [{ jours: 'tous', prix: 10 }, { jours: 'tous', de: '19:00', a: '00:00', prix: 15 }] },
        { nom: 'A', unite: 'par joueur', regles: [{ jours: 'tous', de: '13:00', a: '17:00', prix: 7.5 }, { jours: 'tous', de: '17:00', a: '02:00', prix: 8.5 }] },
        { nom: 'Q', unite: 'par joueur', regles: [{ jours: 'tous', de: '14:00', a: '19:00', max: 6, prix: 12 }, { jours: 'tous', de: '19:00', a: '22:00', prix: 14 }] },
        { nom: 'N', unite: 'par joueur', regles: [{ jours: 'tous', prix: 10 }, { jours: 'tous', de: '00:00', a: '02:00', prix: 6 }] }];
      const px = (f, m, n) => SB.moteur.prix(E, 'test', f, j, m, n || 2, 1).unitaire;
      egal(px('S', 1440), 15, '00:00 dans « 19:00 à 00:00 »'); egal(px('S', 1470), 10, '00:30 hors de « 19:00 à 00:00 »'); egal(px('S', mn('19:00')), 15, '19:00');
      egal(px('A', mn('17:00')), 8.5, '17:00 : tarif du soir'); egal(px('A', mn('16:00')), 7.5, '16:00'); egal(px('A', 1560), 8.5, '02:00 compris');
      egal(px('Q', mn('19:00'), 4), 14, '19:00 : « 19:00 à 22:00 » malgré le « 6 pers. max » de l’autre');
      egal(px('N', 1470), 6, '00:30 dans « 00:00 à 02:00 »');
    });
    test('Tarifs : une formule « stricte » sans règle valable n’est pas trouvée', () => {
      const SB = SBc(), E = SB.copie(SB.etat()), j = SB.temps.jourDeIso('2026-10-14');
      E.config.prix.test = [{ nom: 'Promo', strict: true, regles: [{ jours: 'we', prix: 5 }] }];
      ok(!SB.moteur.prix(E, 'test', 'Promo', j, 600, 2, 1).trouve, 'mercredi'); ok(SB.moteur.prix(E, 'test', 'Promo', j + 3, 600, 2, 1).trouve, 'samedi');
    });
    test('Un créneau vu par un canal : ouvert, hors canal, fermé, passé, formule fermée', () => {
      const K = karaoke(), M = K.SB.moteur, s0 = K.E.creneaux.karaoke[0], now = K.SB.temps.maintenant(), v = x => M.vuCanal(K.E, Object.assign({}, s0, x), 'borne').ouvert;
      ok(v({}), 'ouvert'); ok(!v({ canaux: ['web'] }), 'hors canal borne'); ok(!v({ ouvert: false }), 'fermé'); ok(!v({ j: now.j - 1 }), 'passé');
      egal(M.etatSlot(K.E, Object.assign({}, s0, { formules: [{ nom: '30 minutes', ferme: true }, { nom: '1 heure' }] })).formules.map(f => f.reste), [0, 2], 'formule fermée');
    });
    test('Heures « comptoir » sans générateur : créneaux virtuels au comptoir seulement (lot supprimé : rien sur la borne ni le site)', () => {
      const SB = SBc(), E = SB.copie(SB.etat()), a = E.config.activites.find(x => x.id === 'karaoke'), j = SB.temps.maintenant().j + 45, js = (SB.temps.dateDeJour(j).getDay() + 6) % 7;
      E.creneaux.karaoke = (E.creneaux.karaoke || []).filter(x => x.j !== j);
      E.config.regles = Object.assign({}, E.config.regles, { karaoke: Array.from({ length: 7 }, () => ({ comptoir: { ouvert: true, debut: '14:00', fin: '16:00', pas: 30 }, borne: { ouvert: false }, web: { ouvert: false } })) });
      let g = SB.moteur.grille(E, a, j); egal([g.source, g.slots.map(x => x.h)], ['comptoir', ['14:00', '14:30', '15:00', '15:30']], 'heures comptoir');
      ok(g.slots.every(x => !x.canaux.includes('borne')), 'sur la borne sans réglage');
      E.config.regles.karaoke[js].borne.ouvert = true; g = SB.moteur.grille(E, a, j); ok(g.slots.every(x => !x.canaux.includes('borne') && !x.canaux.includes('web')), 'heures comptoir vendues sur la borne ou le site');
    });
    test('Bowling : pas de durée vendue, environ 11 min par partie et par joueur et par piste', () => {
      const SB = SBc(), E = SB.etat(), a = E.config.activites.find(x => x.id === 'bowling');
      egal([SB.moteur.partiesDe('1 partie'), SB.moteur.partiesDe('2 parties'), SB.moteur.partiesDe('2 + 1')], [1, 2, 3], 'parties');
      egal(SB.moteur.dureeFormule(E, a, '2 parties', 4), 90, '4 joueurs, 2 parties');
      egal(SB.moteur.dureeFormule(E, a, '2 parties', 8), 90, '8 joueurs sur 2 pistes (4 + 4)');
      egal(SB.moteur.dureeFormule(E, a, '2 + 1', 3), 100, '3 joueurs, 3 parties (99 min, arrondi à 5)');
      egal(SB.moteur.dureeFormule(E, Object.assign({}, a, { minPartie: 10 }), '1 partie', 6), 60, 'réglage du CRM');
    });
    test('Bowling : répartition des joueurs sur les pistes', () => {
      const M = SBc().moteur; egal(M.repartirPistes(7, 7), [7]); egal(M.repartirPistes(8, 7), [4, 4]); egal(M.repartirPistes(14, 7), [7, 7]); egal(M.repartirPistes(15, 7), [5, 5, 5]);
    });
    test('Délais de réservation respectés pour chaque activité réservable sur la borne', () => {
      const SB = SBc(), now = SB.temps.maintenant(), M = SB.api.modules;
      SB.etat().config.activites.filter(a => M.type(a) === 'resa').forEach(a => {
        const C = SB.api.resa.config(a.id); if (!C.formules.length) return;
        const d = C.regles.delai, J = SB.api.resa.creneaux(a.id, C.formules[0].nom, 2);
        egal(J.length, C.regles.horizon + 1, a.id + ' : jours proposés');
        J.forEach(x => x.heures.forEach(h => ok((x.j - now.j) * 1440 + SB.outils.mn(h.h) - now.min >= d * 60 - 1, a.id + ' : ' + x.iso + ' ' + h.h + ' avant le délai de ' + d + ' h')));
      });
    });
    test('Tickets CE : valable pour son activité, consommé une fois, rendu si la commande est abandonnée', () => {
      const SB = SBc(), code = 'TEST-CE-' + Date.now().toString(36).toUpperCase(), T = SB.api.tarifs('bowling', 2)[0];
      ok(T, 'pas de tarif bowling à cette heure');
      SB.modifier('tickets', X => { X = X || { lots: [], codes: [], usages: [] }; X.lots.push({ id: 'L-TEST', org: 'Test', type: 'Ticket CE', contenu: 'Bowling · 1 partie', nb: 1, valeur: 7.5, etat: 'actif', utilises: 0, annules: 0 }); X.codes.push({ id: code, code, lot: 'L-TEST', org: 'Test', contenu: 'Bowling · 1 partie', etat: 'disponible' }); return X; }, 'test');
      ok(SB.api.tickets.verifier(code, 'bowling').ok, 'refusé au bowling'); ok(!SB.api.tickets.verifier(code, 'laser').ok, 'accepté au laser');
      const cmd = () => SB.api.bar.commander({ borne: 'K-02', act: 'bowling', nom: 'CE test', lieu: 'Accueil', ts: Date.now(), lignes: [{ id: 'j1', nom: 'Bowling · A', q: 1, pu: T.unitaire, tva: 20 }, { id: 'j2', nom: 'Bowling · B', q: 1, pu: T.unitaire, tva: 20 }], remises: [{ code }],
        bowling: { formule: T.nom, parties: 1, tarif: '1', joueurs: [{ prenom: 'A', barrieres: false }, { prenom: 'B', barrieres: false }] } }, 'test');
      const r = cmd(); ok(r.ok, r.raison); egal(r.commande.remise, Math.min(7.5, r.commande.total), 'remise');
      ok(!SB.api.tickets.verifier(code, 'bowling').ok, 'encore valable après usage'); ok(!cmd().ok, 'utilisé deux fois');
      SB.api.bar.abandonner(r.commande.num, 'test'); ok(SB.api.tickets.verifier(code, 'bowling').ok, 'pas rendu après abandon');
    });
    test('Bar : paiement en deux fois, abandon avec un reste, commande à finaliser', () => {
      const SB = SBc(), P = SB.api.bar.catalogue('K-02').produits.find(x => !(x.options || []).some(g => g.obligatoire) && !x.alcool && x.servi !== false), L = [{ id: P.id, nom: P.nom, q: 2, pu: P.prix, tva: P.tva }];
      const cmd = x => SB.api.bar.commander(Object.assign({ borne: 'K-02', act: 'bar', nom: 'Test bar', lieu: 'Comptoir du bar', ts: Date.now(), lignes: L }, x || {}), 'test').commande;
      const pay = (c, m) => SB.api.bar.payer(c.num, { moyen: 'Carte', montant: m, lignes: [], ok: true, op: 'op-' + Math.random(), ts: Date.now() }, 'test').commande;
      let c = cmd(); egal(c.etat, 'paiement'); c = pay(c, P.prix); egal(c.etat, 'paiement', 'après la 1re moitié'); c = pay(c, P.prix); egal(c.etat, 'validee', 'après la 2e moitié');
      c = cmd(); pay(c, P.prix); SB.api.bar.abandonner(c.num, 'test');
      const c2 = SB.etat().ventes.commandes.find(x => x.num === c.num); egal(c2.etat, 'paiement', 'payée en partie : pas annulée'); ok(/reste/.test(c2.motif || ''), 'motif : ' + c2.motif); FAITS.barPartiel = c.num;
      c = cmd({ aFinaliser: true }); egal(c.etat, 'afinaliser'); const r = SB.api.bar.retrouver(c.num); ok(r.ok && r.commande.num === c.num, 'Finaliser ne la retrouve pas');
      ok(!SB.api.bar.retrouver(123456).ok, 'numéro inconnu retrouvé');
    });
    test('Réservation web du bowling : acompte, prénoms et barrières retrouvés par « Finaliser »', () => {
      const SB = SBc(), now = SB.temps.maintenant(), E = SB.etat(), sl = SB.moteur.slotsJour(E, 'bowling', now.j).find(x => SB.outils.mn(x.h) > now.min + 30 && SB.moteur.vuCanal(E, x, 'web').ouvert);
      if (!sl) return;                        // plus de créneau bowling sur le site aujourd'hui : fin de journée
      const r = SB.api.reservations.creerWeb({ act: 'bowling', j: now.j, h: sl.h, formule: sl.formules[0].nom, pers: 3, client: 'Famille Web', titre: 'Les Web', joueurs: [{ prenom: 'Ana', barrieres: true }, { prenom: 'Bob' }, { prenom: 'Cid' }] }, 'test');
      ok(r.ok, r.raison); ok(r.resa.paye > 0 && r.resa.paye < r.resa.total, 'acompte en ligne');
      const x = SB.api.bar.retrouver(r.resa.num); ok(x.ok && x.resa, 'Finaliser ne retrouve pas la réservation');
      egal(x.resa.joueurs.map(y => [y.prenom, y.barrieres]), [['Ana', true], ['Bob', false], ['Cid', false]], 'prénoms et barrières');
      FAITS.web = r.resa.num;
    });
    test('Décaler une réservation : laser (la salle suit), anniversaire (places du créneau), le prix convenu reste', () => {
      const SB = SBc(), f = SB.api.resa.config('laser').formules[0].nom, J = SB.api.resa.creneaux('laser', f, 2).filter(x => x.heures.length > 1).slice(-1)[0]; ok(J, 'pas assez d’heures laser');
      const c = SB.api.bar.commander({ borne: 'K-02', act: 'laser', nom: 'Décalage', lieu: 'Accueil', ts: Date.now(), lignes: [], remises: [], reservation: { formule: f, j: J.j, h: J.heures[0].h, nb: 2, options: [], groupe: 'Décalage', prenoms: [], enfant: null, contact: null } }, 'test');
      ok(c.ok, c.raison); SB.api.bar.payer(c.commande.num, { moyen: 'Carte', montant: c.commande.total, lignes: [], ok: true, op: 'd' + Date.now(), ts: Date.now() }, 'test');
      const id = 'k' + c.commande.num, total = resa(id).total, h2 = J.heures[1].h;
      const m = SB.api.reservations.modifier(id, { j: J.j, h: h2, total }, 'test'); ok(m.ok, m.raison);
      egal([resa(id).jour, SB.outils.hm(resa(id).debut), resa(id).total, resa(id).paye, resa(id).canal], [J.j, h2, total, total, 'Borne'], 'laser décalé, prix et paiement gardés');
      const A = SB.api.resa.config('anniv'), fa = A.formules[0].nom, JA = SB.api.resa.creneaux('anniv', fa, 8).filter(x => x.heures.length).slice(0, 2); ok(JA.length === 2, 'pas assez de jours anniversaire');
      const ca = SB.api.bar.commander({ borne: 'K-02', act: 'anniv', nom: 'Léo', lieu: 'Accueil', ts: Date.now(), lignes: [], remises: [], reservation: { formule: fa, j: JA[0].j, h: JA[0].heures[0].h, nb: 8, tranche: '', options: [], groupe: '', prenoms: [], enfant: { prenom: 'Léo', naissance: '2018-11-02', age: 8 }, contact: { nom: 'Julie', tel: '0612345678' } } }, 'test');
      ok(ca.ok, ca.raison); const ida = 'k' + ca.commande.num, ta = resa(ida).total;
      const ma = SB.api.reservations.modifier(ida, { j: JA[1].j, h: JA[1].heures[0].h, total: ta }, 'test'); ok(ma.ok, 'anniversaire non décalé : ' + ma.raison);
      egal([resa(ida).jour, SB.outils.hm(resa(ida).debut), resa(ida).total, resa(ida).anniv.enfant], [JA[1].j, JA[1].heures[0].h, ta, 'Léo'], 'anniversaire décalé');
      SB.api.bar.abandonner(ca.commande.num, 'test', true); SB.api.reservations.supprimer(ida, 'test'); SB.api.reservations.supprimer(id, 'test');
    });
    test('Espèces au comptoir : commande mise de côté, retrouvée par son numéro, annulée après le délai', () => {
      const SB = SBc(), c = SB.api.bar.commander({ borne: 'T-01', nom: 'Cash', lieu: 'Piste 1', ts: Date.now(), lignes: [{ id: 'x', nom: 'Coca-Cola 33 cl', q: 2, pu: 3, tva: 10 }] }, 'test');
      ok(c.ok, c.raison); const n = c.commande.num;
      const a = SB.api.bar.attendreEspeces(n, 'test'); ok(a.ok, a.raison);
      egal([a.commande.etat, a.commande.especes.min], ['afinaliser', 10], 'mise de côté, 10 minutes par défaut');
      ok(SB.api.bar.retrouver(n).ok, 'pas retrouvée avec son numéro');
      SB.modifier('ventes', V => { V.commandes.find(x => x.num === n).especes.expire = Date.now() - 1; return V; }, 'test');
      const r = SB.api.bar.retrouver(n); ok(!r.ok && /Délai dépassé/.test(r.raison), 'numéro expiré accepté : ' + JSON.stringify(r));
      const x = SB.etat().ventes.commandes.find(y => y.num === n); egal([x.etat, /10 minutes/.test(x.motif)], ['annulee', true], 'annulée, avec la raison');
      egal(SB.api.bornes.config('MOBILE').modules.map(m => m.act), ['bar'], 'le téléphone ne vend que le bar');
    });
    test('Fermer un créneau sur le site seulement, ou partout', () => {
      const SB = SBc(), j = jourAvec('laser'); ok(j, 'pas de jour laser');
      const L = () => SB.moteur.slotsJour(SB.etat(), 'laser', j), s0 = L()[0], f = SB.api.resa.config('laser').formules[0].nom;
      SB.api.fermerCreneau(s0.id, 'web', true, 'test', 'test'); ok(!L()[0].canaux.includes('web') && L()[0].ouvert, 'fermé au site seulement');
      ok(heuresBorne('laser', f, 2, j).includes(s0.h), 'la borne ne le propose plus alors qu’il ne fallait fermer que le site');
      SB.api.fermerCreneau(s0.id, 'web', false, 'test', 'test'); SB.api.fermerCreneau(s0.id, 'tous', true, 'test', 'test');
      ok(!L()[0].ouvert && L()[0].canaux.includes('web'), 'fermé partout'); ok(!heuresBorne('laser', f, 2, j).includes(s0.h), 'la borne le propose encore');
      SB.api.fermerCreneau(s0.id, 'tous', false, 'test', 'test'); ok(heuresBorne('laser', f, 2, j).includes(s0.h), 'pas rouvert');
    });
    test('Créneau complet : toutes les salles prises, l’heure n’est plus proposée ; elle revient quand on libère', () => {
      const SB = SBc(), j = jourAvec('laser'), s0 = SB.moteur.slotsJour(SB.etat(), 'laser', j)[0], f = SB.api.resa.config('laser').formules[0].nom;
      const creer = n => SB.api.reservations.creer({ act: 'laser', j, h: s0.h, formule: f, pers: 2, client: n }, 'test');
      const r1 = creer('Plein 1'), r2 = creer('Plein 2'); ok(r1.ok && r2.ok, (r1.raison || '') + (r2.raison || ''));
      ok(r1.resa.blocs[0].r !== r2.resa.blocs[0].r, 'les deux groupes dans la même salle');
      ok(!heuresBorne('laser', f, 2, j).includes(s0.h), 'heure encore proposée'); ok(!creer('Plein 3').ok, '3e groupe accepté');
      SB.api.reservations.supprimer(r1.resa.id, 'test'); ok(heuresBorne('laser', f, 2, j).includes(s0.h), 'heure pas revenue'); SB.api.reservations.supprimer(r2.resa.id, 'test');
    });
    test('Salles fermées à la main : l’heure disparaît quand plus aucune salle n’est ouverte', () => {
      const SB = SBc(), j = jourAvec('laser'), s0 = SB.moteur.slotsJour(SB.etat(), 'laser', j)[0], f = SB.api.resa.config('laser').formules[0].nom, m = SB.outils.mn(s0.h);
      const R = SB.etat().config.activites.find(a => a.id === 'laser').ressources, B = R.map(x => SB.api.bloquer({ r: x.id, j, s: m, e: m + 30, motif: 'test' }, 'test').blocage);
      ok(!heuresBorne('laser', f, 2, j).includes(s0.h), 'heure proposée alors que toutes les salles sont fermées');
      SB.api.debloquer(B[0].id, 'test'); ok(heuresBorne('laser', f, 2, j).includes(s0.h), 'heure pas revenue avec une salle rouverte'); SB.api.debloquer(B[1].id, 'test');
    });
    test('Déplacer une réservation dans une autre salle, refusé si elle est prise', () => {
      const SB = SBc(), j = jourAvec('laser'), s0 = SB.moteur.slotsJour(SB.etat(), 'laser', j)[0], f = SB.api.resa.config('laser').formules[0].nom;
      const r1 = SB.api.reservations.creer({ act: 'laser', j, h: s0.h, formule: f, pers: 3, client: 'Dep 1' }, 'test'); ok(r1.ok, r1.raison);
      const autre = SB.etat().config.activites.find(a => a.id === 'laser').ressources.find(x => x.id !== r1.resa.blocs[0].r);
      ok(SB.api.reservations.deplacer(r1.resa.id, 0, autre.id, null, 'test', 'test').ok, 'déplacement refusé');
      const r2 = SB.api.reservations.creer({ act: 'laser', j, h: s0.h, formule: f, pers: 3, client: 'Dep 2' }, 'test'); ok(r2.ok, r2.raison);
      ok(!SB.api.reservations.deplacer(r1.resa.id, 0, r2.resa.blocs[0].r, null, 'test', 'test').ok, 'déplacé dans une salle prise');
      SB.api.reservations.supprimer(r1.resa.id, 'test'); SB.api.reservations.supprimer(r2.resa.id, 'test');
    });
    test('Comptoir : une formule que le créneau ne propose pas est refusée, sauf « forcer »', () => {
      const SB = SBc(), j = jourAvec('karaoke'), s0 = SB.moteur.slotsJour(SB.etat(), 'karaoke', j)[0], f2 = (s0.formules[1] || {}).nom;
      ok(f2, 'créneau karaoké à deux formules');
      const d = { act: 'karaoke', j, h: s0.h, formule: f2, pers: 4, client: 'Comptoir' };
      SB.modifier('creneaux', C0 => { const L = C0.karaoke.find(x => x.id === s0.id); L.formules = L.formules.filter(f => f.nom !== f2); return C0; }, 'test');
      try {
        const r = SB.api.reservations.simuler(d); ok(!r.ok && /pas proposée/.test(r.raison || ''), 'formule absente acceptée : ' + (r.raison || 'ok'));
        ok(SB.api.reservations.simuler(Object.assign({ forcer: true }, d)).ok, '« forcer » refusé');
      } finally { SB.modifier('creneaux', C0 => { const L = C0.karaoke.find(x => x.id === s0.id); if (!L.formules.some(f => f.nom === f2)) L.formules.push({ nom: f2, places: 1, pris: 0 }); return C0; }, 'test'); }
    });
    test('Déplacer une des pistes d’un groupe sur deux pistes', () => {
      const SB = SBc(), j = jourAvec('bowling'); ok(j, 'pas de jour bowling');
      const s0 = SB.moteur.slotsJour(SB.etat(), 'bowling', j).slice(-1)[0], r = SB.api.reservations.creer({ act: 'bowling', j, h: s0.h, formule: s0.formules[0].nom, pers: 10, client: 'Deux pistes' }, 'test');
      ok(r.ok && r.resa.blocs.length === 2, 'groupe de 10 pas sur 2 pistes : ' + (r.raison || ''));
      try {
        const a = SB.moteur.act(SB.etat(), 'bowling'), b = r.resa.blocs[1], libre = a.ressources.find(x => !x.hs && !r.resa.blocs.some(y => y.r === x.id) && SB.moteur.peutPlacer(SB.etat(), a, x, j, b.s, b.e, 0).ok);
        ok(libre, 'aucune piste libre pour le test');
        const dp = SB.api.reservations.deplacer(r.resa.id, 1, libre.id, null, 'test', 'test'); ok(dp.ok, 'déplacement refusé : ' + dp.raison);
      } finally { SB.api.reservations.supprimer(r.resa.id, 'test'); }
    });
    test('Plus grand groupe sur des tables ou pistes : la plus longue suite de voisines en service', () => {
      const SB = SBc(), avant = SB.copie(SB.etat().config.activites.find(x => x.id === 'billard').ressources);
      SB.modifier('config', c => { c.activites.find(x => x.id === 'billard').ressources = [{ id: 'T1', nom: 'T1', cap: 4 }, { id: 'T2', nom: 'T2', cap: 4 }, { id: 'T3', nom: 'T3', cap: 4, hs: true }, { id: 'T4', nom: 'T4', cap: 4 }]; return c; }, 'test');
      try { egal(SB.api.resa.config('billard').capMax, 8, 'T1 + T2 (T3 hors service coupe la suite)'); }
      finally { SB.modifier('config', c => { c.activites.find(x => x.id === 'billard').ressources = avant; return c; }, 'test'); }
    });
    test('Tarifs : « hors vacances » rend la règle plus précise que « tous les jours »', () => {
      const SB = SBc(), E = SB.copie(SB.etat()), j = SB.temps.jourDeIso('2026-10-14');
      E.config.prix.test = [{ nom: 'H', unite: 'par joueur', regles: [{ jours: 'tous', prix: 10 }, { jours: 'tous', horsVac: true, prix: 8 }] }];
      egal(SB.moteur.prix(E, 'test', 'H', j, 840, 2, 1).unitaire, 8, 'mercredi hors vacances');
      egal(SB.moteur.prix(E, 'test', 'H', SB.temps.jourDeIso('2026-10-21'), 840, 2, 1).unitaire, 10, 'mercredi en vacances');
    });
    test('Fusion à trois (le CRM et une borne écrivent en même temps)', () => {
      const r = SBc().fusionListe([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'a', v: 2 }, { id: 'b', v: 1 }, { id: 'c', v: 1 }], [{ id: 'a', v: 1 }, { id: 'd', v: 1 }]);
      egal(r.map(x => x.id).sort(), ['a', 'c', 'd'], 'b supprimé ailleurs, c ajouté ici, d ajouté ailleurs'); egal(r.find(x => x.id === 'a').v, 2, 'modification gardée');
    });
    test('Tickets CE : un code ne sert que dans l’activité de son lot (même renommée) ; « valable partout » marche partout', () => {
      const V = (c, a) => SBc().api.tickets.verifier(c, a), ACTS = ['bowling', 'laser', 'karaoke', 'quiz', 'anniv', 'billard'];
      const laser = codeTest('laser', 'Nom changé · 1 partie', 9), tout = codeTest('*', 'Cadeau', 5), bar = codeTest('bar', 'Boisson offerte', 3.5);
      ok(V(laser, 'laser').ok, 'code laser refusé au laser');
      ACTS.filter(a => a !== 'laser').concat(['bar']).forEach(a => ok(!V(laser, a).ok, 'code laser accepté en ' + a));
      ok(/seulement pour « Nom changé · 1 partie »/.test(V(laser, 'karaoke').raison), 'motif du refus : ' + V(laser, 'karaoke').raison);
      ACTS.forEach(a => ok(V(tout, a).ok, '« valable partout » refusé en ' + a));
      ok(V(bar, 'bar').ok && !V(bar, 'bowling').ok, 'boisson offerte : bar seulement');
    });
    test('Paiement par tickets CE (payerCodes) : vérifiés pour l’activité, tous ou aucun, un code compté une fois, plafonnés à ce qui reste dû', () => {
      const SB = SBc(), a = codeTest('bar', 'Boisson offerte', 7.5), b = codeTest('bar', 'Boisson offerte', 7.5), l = codeTest('laser', 'Laser · 1 partie', 9), etat = k => SB.etat().tickets.codes.find(c => c.code === k).etat;
      const r = SB.api.bar.commander({ borne: 'K-02', act: 'bar', nom: 'CE au paiement', lieu: 'Bar', ts: Date.now(), lignes: [{ id: 'x', nom: 'Article', q: 1, pu: 10, tva: 10 }] }, 'test'); ok(r.ok, r.raison);
      const n = r.commande.num, k1 = SB.api.bar.payerCodes(n, [a, l], 'test');
      ok(!k1.ok && k1.refus.length === 1 && etat(a) === 'disponible', 'un code refusé : rien ne doit être consommé');
      const k2 = SB.api.bar.payerCodes(n, [a, a], 'test');
      ok(k2.ok, k2.raison); egal([k2.valeur, k2.commande.remise, k2.commande.etat, etat(a)], [7.5, 7.5, 'paiement', 'utilisé'], 'premier ticket');
      const k3 = SB.api.bar.payerCodes(n, [b], 'test');
      egal([k3.valeur, k3.commande.remise, k3.commande.etat], [2.5, 10, 'validee'], 'second ticket, plafonné au reste dû');
      ok(!SB.api.bar.payerCodes(n, [l], 'test').ok, 'commande déjà réglée : encore des tickets acceptés');
    });
    test('Ticket CE inconnu refusé', () => { const r = SBc().api.tickets.verifier('ZZZZ-0000', 'bowling'); ok(!r.ok && r.raison, 'code inconnu accepté'); });
    test('Écran de veille : chaque borne reçoit ses diapositives (sauf), l’ancienne vidéo unique est encore lue', () => {
      const V = SBc().api.veille, C = { diffusion: { veille: [{ id: 'a', type: 'video', src: 'x.mp4', sauf: ['K-02'] }, { id: 'b', type: 'image', src: 'y.jpg' }] } };
      egal(V.liste('K-01', C).map(d => d.id), ['a', 'b'], 'K-01');
      egal(V.liste('K-02', C).map(d => d.id), ['b'], 'K-02 exclue de « a »');
      egal(V.liste('K-01', { diffusion: { video: 'v.mp4' } }).map(d => [d.type, d.src]), [['video', 'v.mp4']], 'ancien réglage « Vidéo de veille »');
      egal(V.liste('K-01', { diffusion: { veille: [], video: 'v.mp4' } }), [], 'une liste vide l’emporte sur l’ancien réglage');
    });
    test('Médias de la veille : un fichier rangé dans le navigateur se relit puis se retire ; une adresse part de la racine du site', async () => {
      const M = SBc().api.medias, src = await M.mettre(new Blob(['abc'], { type: 'video/mp4' }));
      ok(/^media:/.test(src), 'référence : ' + src);
      egal(await (await C().fetch(await M.url(src))).text(), 'abc', 'contenu relu');
      egal(await M.url('borne/videos/x.mp4'), new URL('../borne/videos/x.mp4', location.href).href, 'adresse depuis la racine');
      await M.retirer(src);
      let rate = false; await M.url(src).catch(() => { rate = true; }); ok(rate, 'média retiré encore lisible');
    });
  });

  /* =====================================================================
     SUITE 2 — CRM (maquettes/e-v2.html)
     ===================================================================== */
  suite('CRM', () => {
    test('Le CRM s’ouvre sans erreur, branché à la sandbox, migrations à jour', () => {
      ok(cq('.arbre'), 'menu absent'); ok(C().__sbxCRM, 'le CRM n’est pas branché à la sandbox (erreur au démarrage ?)'); ok(C().document.getElementById('app').innerHTML.length > 2000, 'page vide');
      const c = SBc().etat().config;
      egal(c.annivV, 6, 'version des migrations');
      ['K-01', 'K-02', 'K-03'].forEach(b => ok(c.vend[b].includes('laser'), b + ' ne vend pas le Laser'));
      sansErreur('crm');
    });
    test('Chaque écran et chaque onglet s’affichent', async () => {
      const E = Object.keys(crm('ECRANS_LIB')).filter(e => e !== 'activite');
      for (const e of E) {
        await action('aller', { e });
        egal(crm('S.ecran'), e === 'diffusion' ? 'parametrage' : e, 'écran ' + e); sansErreur('crm');   // « diffusion » vit dans Paramétrage
        for (const id of e === 'parametrage' ? cqa('[data-a="param"]').map(b => b.dataset.id) : []) { await action('param', { id }); sansErreur('crm'); ok(C().document.getElementById('app').textContent.length > 200, 'Paramétrage › ' + id + ' vide'); }
        const O = [...new Set(cqa(`[data-a="sousO"][data-e="${e}"]`).map(b => b.dataset.o))];
        for (const o of O) { await action('sousO', { e, o }); sansErreur('crm'); ok(C().document.getElementById('app').textContent.length > 200, e + ' › ' + o + ' vide'); }
      }
    }, { delai: 60000 });
    test('Chaque activité et ses onglets s’affichent', async () => {
      for (const a of crm('CENTRE.activites').filter(x => x.modele !== 'vente')) {
        await action('ouvrir', { id: a.id }); sansErreur('crm');
        const e = 'act-' + a.id, O = [...new Set(cqa(`[data-a="sousO"][data-e="${e}"]`).map(b => b.dataset.o))];
        for (const o of O) { await action('sousO', { e, o }); sansErreur('crm'); }
      }
    }, { delai: 60000 });
    test('Sandbox › Module borne : chaque onglet de chaque activité', async () => {
      await action('aller', { e: 'sandbox', o: 'activites' });
      for (const a of crm('CENTRE.activites').filter(x => SBc().api.modules.type(x))) {
        await action('act', { id: a.id }); sansErreur('crm');
        ok(cq('[data-modform]'), a.id + ' : pas de formulaire de module');
        ok(!cq('.mod-etapes') && !cqa('.mod-secs .chip').some(b => /Parcours/.test(b.textContent)), a.id + ' : l’éditeur d’étapes est revenu');
        const apercu = cq('[data-apercu]'); ok(apercu && apercu.src.includes('apercu=' + a.id), a.id + ' : aperçu absent');
        for (const s of cqa('.mod-secs .chip').map(b => b.dataset.s)) {
          await action('modSec', { act: a.id, s }); sansErreur('crm');
          const x = SBc().api.modules.schema(a).find(y => y.id === s);
          if (x.champs[0] && x.champs[0].type === 'style') egal(cqa('.mod-st').length, 3, a.id + ' › ' + s + ' : boutons de style');
        }
      }
    }, { delai: 60000 });
    test('Fiche « Commande # » : changer le jour ou l’heure d’une réservation', async () => {
      const SB = SBc(), f = SB.api.resa.config('laser').formules[0].nom, J = SB.api.resa.creneaux('laser', f, 2).filter(x => x.heures.length > 1).slice(-1)[0]; ok(J, 'pas assez d’heures laser');
      const sim = SB.api.reservations.creer({ act: 'laser', j: J.j, h: J.heures[0].h, formule: f, pers: 2, client: 'Fiche décalage' }, 'test'); ok(sim.ok, sim.raison);
      const r = sim.resa; crm(`window.__sbxCRM.charger(['reservations'])`);      // créée dans la page du CRM elle-même : il ne s'écoute pas
      await attendre(() => crm('CENTRE.reservations').some(x => x.id === r.id), 5000, 'réservation dans le CRM');
      await action('detail', { id: r.id }); ok(cq('.tiroir [data-a="decal"]'), 'bouton « Changer le jour ou l’heure » absent');
      await action('decal', { id: r.id }); ok(cq('.tiroir [data-f="decalJour"]') && cqa('.tiroir [data-a="decalH"]').length, 'pas d’heures proposées');
      const h2 = cqa('.tiroir [data-a="decalH"]').map(b => b.dataset.h).find(h => h !== J.heures[0].h); ok(h2, 'pas d’autre heure');
      await action('decalH', { h: h2 }); await action('decalOk');
      await attendre(() => SB.outils.hm((SB.etat().reservations.find(x => x.id === r.id) || {}).debut) === h2, 4000, 'réservation déplacée');
      await action('fermer'); SB.api.reservations.supprimer(r.id, 'test'); sansErreur('crm');
    });
    test('Gestion des bornes : monnayeur (CashDro) réglable par borne ; module Bar : pages Fin et Espèces au comptoir', async () => {
      await action('aller', { e: 'bornes', o: 'parc' });
      const caseT = () => cq('[data-a="cashdro"][data-id="T-01"]'); ok(caseT(), 'case CashDro absente');
      egal([caseT().getAttribute('aria-pressed'), cq('[data-a="cashdro"][data-id="K-02"]').getAttribute('aria-pressed')], ['false', 'true'], 'par défaut : tablette sans, kiosque avec');
      await action('cashdro', { id: 'K-02' });
      await attendre(() => (SBc().lire('config').bornes.find(b => b.id === 'K-02') || {}).cashdro === false, 3000, 'réglage enregistré pour les bornes');
      await action('cashdro', { id: 'K-02' });
      await attendre(() => SBc().lire('config').bornes.find(b => b.id === 'K-02').cashdro === true, 3000, 'réglage rétabli');
      await action('aller', { e: 'bornes', o: 'catalogue' });
      ok(cq('[data-a="cocher"][data-b="K-02"][data-id="finaliser"].on'), 'colonne « Finaliser la commande » absente ou décochée');
      const bar = SBc().etat().config.activites.find(x => x.id === 'bar');
      egal(SBc().api.modules.schema(bar).map(s => s.id), ['accueil', 'bar', 'recap', 'regler', 'merci', 'comptoir', 'theme'], 'onglets du module Bar');
      sansErreur('crm');
    });
    test('Sandbox : ressources et prix dans les onglets de l’activité ; onglets du module rangés (pages, règles, apparence)', async () => {
      await action('aller', { e: 'sandbox', o: 'activites' }); await action('act', { id: 'laser' });
      const blocs = cqa('.recette .bloc > header .lab').map(x => x.textContent); ok(!blocs.includes('Formules et prix') && !blocs.includes('Ressources'), 'blocs en double encore dans la Sandbox : ' + blocs.join(', '));
      ok(cq('[data-a="ouvrir"][data-o="capacite"]') && cq('[data-a="ouvrir"][data-o="tarifs"]'), 'liens vers Capacité et Tarifs');
      const g = cqa('.mod-g').map(x => x.querySelector('.lab').textContent); egal(g, ['Pages affichées, dans l’ordre', 'Règles de réservation', 'Apparence'], 'groupes d’onglets');
      ok(/Bornes/.test(cqa('.mod-g')[1].textContent) && /Site web/.test(cqa('.mod-g')[1].textContent) && !/Formule/.test(cqa('.mod-g')[1].textContent), 'règles mélangées aux pages');
      await action('ouvrir', { id: 'laser', o: 'capacite' }); ok(cq('[data-f="actRess.laser"]'), 'nom de la ressource absent de l’onglet Capacité');
      sansErreur('crm');
    });
    test('Catalogue des bornes : cocher une activité la met sur la borne', async () => {
      /* coché = vendu par la borne ; la tuile apparaît si l'activité a aussi le canal « Bornes » */
      const vend = () => SBc().etat().config.vend['K-03'], tuiles = () => SBc().api.bornes.config('K-03').modules.map(m => m.act);
      const q = SBc().etat().config.activites.find(a => a.id === 'quiz'), canal = q.canaux.includes('borne');
      ok(!vend().includes('quiz'), 'K-03 vend déjà le Quiz');
      await action('cocher', { b: 'K-03', id: 'quiz' }); await attendre(() => vend().includes('quiz'), 4000, 'Quiz coché sur K-03');
      egal(tuiles().includes('quiz'), canal, 'tuile Quiz sur K-03 (canal Bornes : ' + canal + ')');
      await action('cocher', { b: 'K-03', id: 'quiz' }); await attendre(() => !vend().includes('quiz'), 4000, 'Quiz décoché sur K-03');
      ok(!tuiles().includes('quiz'), 'tuile Quiz restée sur K-03');
      sansErreur('crm');
    });
    test('Planning : fermer une salle à un créneau d’un clic, puis la rouvrir', async () => {
      await action('aller', { e: 'planning' });
      const c = await attendre(() => cq('.fr-c[data-r]'), 4000, 'case libre dans la frise du planning');
      const { r, j, s: d } = c.dataset, avant = SBc().etat().blocages.length;
      c.click(); await pause(60);
      const b = await attendre(() => SBc().etat().blocages.find(x => x.r === r && x.j === +j && x.s === +d), 4000, 'fermeture enregistrée');
      ok(b.e > b.s && SBc().etat().blocages.length === avant + 1, 'fermeture mal formée');
      const x = await attendre(() => cq(`.fr-x[data-id="${b.id}"]`), 4000, 'case « fermée » affichée');
      x.click(); await pause(60);
      await attendre(() => !SBc().etat().blocages.some(y => y.id === b.id), 4000, 'salle rouverte');
      sansErreur('crm');
    });
    test('Onglet Créneaux : grille par salle (karaoké à 2 salles, 1 h réservée en salle 1)', async () => {
      crm(`(() => { const a = actById('karaoke'); a.ressources = [{ id: 'KS1', nom: 'Salle 1', cap: 10, act: 'karaoke' }, { id: 'KS2', nom: 'Salle 2', cap: 12, act: 'karaoke' }]; a.battement = 0; window.__sbxCRM.sauver(); })()`);
      const j = crm('AUJ') + 3, slots = SBc().moteur.slotsJour(SBc().etat(), 'karaoke', j), h = slots[1] && slots[1].h;
      ok(slots.length > 4, 'pas de créneaux karaoké le jour ' + j);
      const r = SBc().api.reservations.creer({ act: 'karaoke', j, h, formule: '1 heure', pers: 6, client: 'Martin', salle: 'KS1' }, 'test'); ok(r.ok, r.raison);
      C().__sbxCRM.charger(['reservations']);
      await action('ouvrir', { id: 'karaoke', o: 'creneaux' }); await action('slotNav', { abs: j });
      const ligne = nom => cqa('.gs tbody tr').find(tr => tr.querySelector('th').textContent.includes(nom)), cases = nom => [...ligne(nom).querySelectorAll('td')];
      ok(ligne('Salle 1') && ligne('Salle 2'), 'une ligne par salle');
      const res = ligne('Salle 1').querySelector('.gs-res');
      ok(res && res.closest('td').colSpan === 2 && /Martin/.test(res.textContent), 'la réservation d’1 h doit couvrir 2 colonnes en salle 1');
      egal(cases('Salle 1')[0].textContent.trim(), '30 min', 'salle 1 à ' + slots[0].h + ' : seulement 30 min avant le groupe');
      ok(/30 min · 1 h/.test(cases('Salle 2')[1].textContent), 'salle 2 à ' + h + ' : 30 min et 1 h');
      cases('Salle 2')[1].querySelector('button').click(); await pause(60);
      await attendre(() => cases('Salle 2')[1].querySelector('.gs-x'), 3000, 'case « fermée » en salle 2');
      egal(SBc().moteur.etatSlot(SBc().etat(), slots[1]).formules.map(f => f.reste), [0, 0], 'plus aucune salle à ' + h);
      ligne('Salle 2').querySelector('.gs-x').click(); await pause(60);
      await attendre(() => !ligne('Salle 2').querySelector('.gs-x'), 3000, 'salle 2 rouverte');
      egal(SBc().moteur.etatSlot(SBc().etat(), slots[1]).formules.map(f => f.reste), [1, 1], 'salle 2 de nouveau réservable à ' + h);
      const ligneResa = cqa('.lig').find(b => /Martin/.test(b.textContent));
      ok(ligneResa && /Salle 1/.test(ligneResa.textContent), 'réservation du jour avec sa salle, dans l’onglet Créneaux');
      sansErreur('crm');
    });
    test('Nouvelle activité : nom, nombre et capacité des ressources se mettent à jour pendant la frappe', async () => {
      crm('S.nouv.ressources = []'); await action('aller', { e: 'sandbox', o: 'nouvelle' }); await action('nouvFonct', { id: 'privatif' });   // l'exemple pré-rempli a des noms saisis à la main
      const tape = (sel, v) => { const el = cq(sel); ok(el, sel); el.focus(); el.value = v; el.dispatchEvent(new (C().Event)('input', { bubbles: true })); return el; };
      const boites = () => cqa('[data-nouv="ress"] [data-f$=".nom"]');
      tape('[data-f="nouv.ressNom"]', 'Plateforme'); tape('[data-f="nouv.nb"]', '3'); await pause(30);
      egal(boites().length, 3, 'trois encadrés sans rafraîchir'); egal(boites().map(x => x.value), ['Plateforme 1', 'Plateforme 2', 'Plateforme 3'], 'noms des encadrés');
      ok(/Chaque plateforme/.test(cq('[data-nouv="ress"]').textContent), 'texte sous les encadrés'); ok(/3 × Plateforme/.test(cq('[data-nouv="apercu"]').textContent), 'aperçu');
      ok(/Plateforme/.test(cq('[data-nouv="droite"]').textContent), '« Ce que ça donne »');
      tape('[data-f="nouv.cap"]', '9'); await pause(30); egal(cqa('[data-nouv="ress"] [data-f$=".cap"]').map(x => +x.value), [9, 9, 9], 'capacité par défaut suivie');
      const b2 = tape('[data-f="nouvRes.1.nom"]', 'VIP'); await pause(30); ok(C().document.activeElement === b2, 'le champ en cours de saisie a perdu le curseur');
      tape('[data-f="nouv.nb"]', '1'); await pause(30); egal(boites().length, 1, 'un seul encadré'); tape('[data-f="nouv.nb"]', '2'); await pause(30);
      egal(boites().map(x => x.value), ['Plateforme 1', 'VIP'], 'le nom saisi revient quand on remonte le nombre');
      tape('[data-f="nouv.ressNom"]', 'Mur'); await pause(30); egal(boites()[0].value, 'Mur 1', 'nom automatique suivi'); egal(boites()[1].value, 'VIP', 'nom saisi gardé');
      sansErreur('crm');
    });
    test('Nouvelle activité à 3 salles : une salle par groupe, salles au choix dans les templates', async () => {
      const id = crm(`(() => { Object.assign(S.nouv, { nom: 'Escape test', fonct: 'privatif', ressNom: 'Salle', nb: 3, cap: 6, duree: 60 }); S.nouv.ressources = []; nouvRessources(S.nouv); S.nouv.ressources.forEach((x, i) => { x.cap = [4, 6, 8][i]; }); return 'act' + (CENTRE.activites.length + 1); })()`);
      await action('creer');
      const a = await attendre(() => SBc().etat().config.activites.find(x => x.id === id), 4000, 'activité créée');
      egal(a.ressources.map(x => x.cap), [4, 6, 8], 'capacités des 3 salles'); ok(SBc().moteur.lie(a), 'pas en « une salle par groupe »');
      await action('versTpl', { id }); await action('tplNouv');
      egal(cqa('[data-a="tplSalle"][data-ri="0"]').length, 4, 'choix « Toutes » + 3 salles dans la règle');
      const s3 = a.ressources[2].id;
      await action('tplSalle', { ri: 0, id: s3 }); egal(crm('tplCourant()').regles[0].salles, [s3], 'règle limitée à la salle 3');
      const j = crm('AUJ') + 12; crm(`S.gen.du = S.gen.au = SB.temps.isoDeJour(${j})`);
      await action('tplVersGen'); await action('genererSlots');
      const sl = await attendre(() => { const L = SBc().moteur.slotsJour(SBc().etat(), id, j); return L.length && L; }, 4000, 'créneaux générés');
      egal(sl[0].formules[0].salles, [s3], 'créneau limité à la salle 3');
      const st = SBc().moteur.etatSlot(SBc().etat(), sl[0], 3).formules[0]; egal([st.places, st.reste], [1, 1], 'une seule salle ouverte');
      const r = SBc().api.reservations.simuler({ act: id, j, h: sl[0].h, formule: sl[0].formules[0].nom, pers: 3, client: 'Test' });
      ok(r.ok && r.resa.blocs[0].r === s3, 'le groupe de 3 doit aller en salle 3 (seule ouverte), pas en salle 1 : ' + (r.raison || r.resa.blocs[0].r));
      await action('tplSalle', { ri: 0, id: '' }); ok(!crm('tplCourant()').regles[0].salles, '« Toutes les salles » ne remet pas la règle à toutes');
      sansErreur('crm');
    });
    test('Supprimer une activité : l’Admin seulement, en deux clics', async () => {
      crm(`(() => { Object.assign(S.nouv, { nom: 'Sup test', fonct: 'seance', ressNom: 'Salle', nb: 1, cap: 6, duree: 30 }); S.nouv.ressources = []; nouvRessources(S.nouv); })()`);
      await action('creer'); const id = crm(`CENTRE.activites.find(a => a.nom === 'Sup test').id`); await attendre(() => SBc().etat().config.activites.find(x => x.id === id), 4000, 'activité créée');
      const existe = () => crm(`CENTRE.activites.some(a => a.id === '${id}')`);
      try {
        await action('aller', { e: 'sandbox', o: 'activites' }); await action('act', { id });
        ok(cq(`[data-a="supActivite"][data-id="${id}"]`), 'bouton de suppression absent pour l’Admin');
        await action('supActivite', { id }); ok(existe(), 'supprimée dès le premier clic'); ok(cq('[data-a="supActNon"]') && /Irréversible/.test(cq('#app').textContent), 'pas de confirmation');
        await action('supActNon'); ok(!cq('[data-a="supActNon"]') && existe(), 'Annuler ne referme pas la confirmation');
        crm(`S.role = 'Manager'`); await action('act', { id });
        ok(!cq(`[data-a="supActivite"][data-id="${id}"]`), 'bouton visible pour un Manager');
        await action('supActivite', { id }); await action('supActivite', { id }); ok(existe(), 'un Manager a pu supprimer');
      } finally { crm(`S.role = 'Admin'`); }
      await action('act', { id }); await action('supActivite', { id }); await action('supActivite', { id });
      ok(!existe(), 'pas supprimée après confirmation'); await attendre(() => !SBc().etat().config.activites.some(x => x.id === id), 4000, 'suppression transmise au moteur');
      sansErreur('crm');
    });
    test('Droits par rôle : onglets Tarifs, Capacité et Réglages des activités', async () => {
      const onglets = () => cqa('[data-a="sousO"][data-e="act-laser"]').map(b => b.dataset.o), app = () => cq('#app').textContent;
      await action('aller', { e: 'comptes' }); ok(/Activités : onglet Tarifs/.test(app()) && /onglet Capacité/.test(app()) && /onglet Réglages/.test(app()), 'droits absents du tableau');
      try {
        crm(`S.role = 'Accueil'`); await action('ouvrir', { id: 'laser', o: 'tarifs' });
        ok(!['tarifs', 'capacite', 'reglages'].some(o => onglets().includes(o)), 'onglets visibles sans le droit : ' + onglets()); ok(!cq('[data-f^="px.laser."]'), 'tarifs affichés sans le droit');
        await action('droit', { r: 'Accueil', id: 'act_tarifs' }); await action('ouvrir', { id: 'laser', o: 'tarifs' });
        ok(onglets().includes('tarifs') && !onglets().includes('capacite') && cq('[data-f^="px.laser."]'), 'droit Tarifs donné : ' + onglets());
        await action('droit', { r: 'Accueil', id: 'act_tarifs' });
        crm(`S.role = 'Manager'`); await action('ouvrir', { id: 'laser', o: 'reglages' }); ok(['tarifs', 'capacite', 'reglages'].every(o => onglets().includes(o)), 'Manager : ' + onglets());
      } finally { crm(`S.role = 'Admin'`); await action('ouvrir', { id: 'laser', o: 'creneaux' }); }
      ok(['tarifs', 'capacite', 'reglages'].every(o => onglets().includes(o)), 'Admin : ' + onglets()); sansErreur('crm');
    });
    test('Onglet Planning : seulement Bowling et Anniversaire (la semaine), les autres ont tout dans Créneaux', async () => {
      const onglets = id => cqa(`[data-a="sousO"][data-e="act-${id}"]`).map(b => b.dataset.o);
      for (const id of ['laser', 'karaoke', 'quiz']) { await action('ouvrir', { id, o: 'planning' }); ok(!onglets(id).includes('planning'), id + ' a encore un onglet Planning'); egal(crm(`sous('act-${id}', 'creneaux')`), 'creneaux', id + ' : un ancien lien Planning ouvre Créneaux'); ok(/Réservations du jour/.test(C().document.getElementById('app').textContent), id + ' : pas de réservations du jour'); }
      for (const id of ['bowling', 'anniv']) { await action('ouvrir', { id, o: 'planning' }); ok(onglets(id).includes('planning'), id + ' sans onglet Planning'); ok(/de la semaine/.test(C().document.getElementById('app').textContent), id + ' : pas de vue de la semaine'); }
      sansErreur('crm');
    });
    test('Règles de capacité : « au choix du client » se règle, la description des salles aussi', async () => {
      const id = crm(`(CENTRE.activites.find(a => a.nom === 'Escape test') || {}).id`); ok(id, 'activité de test absente');
      await action('aller', { e: 'sandbox', o: 'activites' }); await action('act', { id });
      ok(cq(`[data-a="choixRess"][data-pre="${id}"][data-v="1"]`), 'pas de choix « au choix du client »');
      await action('choixRess', { pre: id, v: '1' }); await attendre(() => SBc().etat().config.activites.find(a => a.id === id).choixRessource === true, 4000, 'réglage enregistré');
      ok(SBc().api.resa.config(id).choixSalle, 'la borne ne le sait pas'); ok(SBc().api.modules.etapes(SBc().etat().config.activites.find(a => a.id === id))[0] === 'rs-salle', 'pas de page de choix');
      await action('ouvrir', { id, o: 'capacite' }); const r3 = crm(`actById('${id}').ressources[2].id`);
      await saisirCrm(`[data-f="res.${id}.${r3}.desc"]`, 'Le manoir hanté');
      await attendre(() => (SBc().api.resa.config(id).salles.find(x => x.id === r3) || {}).desc === 'Le manoir hanté', 4000, 'description sur la borne');
      await action('choixRess', { pre: id, v: '0' }); await attendre(() => !SBc().api.resa.config(id).choixSalle, 4000, 'retour à l’automatique');
      crm(`S.nouv.choixRessource = false`); await action('aller', { e: 'sandbox', o: 'nouvelle' }); await action('nouvFonct', { id: 'privatif' });
      ok(cq('[data-nouv="capa"] [data-a="choixRess"][data-pre="nouv"]'), 'réglage absent de la création'); await action('choixRess', { pre: 'nouv', v: '1' });
      ok(cq('[data-f="nouvRes.0.desc"]'), 'description absente à la création'); await action('choixRess', { pre: 'nouv', v: '0' });
      sansErreur('crm');
    });
    test('Module borne : le nom de l’activité se change dans le CRM (la tuile suit si elle avait le même nom)', async () => {
      await action('aller', { e: 'sandbox', o: 'activites' }); await action('act', { id: 'quiz' });
      const avant = crm(`actById('quiz').nom`), tuile = () => (SBc().etat().config.boutons || []).find(b => b.act === 'quiz') || {};
      await saisirCrm('[data-f="actNom.quiz"]', 'Quiz Arena');
      await attendre(() => SBc().etat().config.activites.find(a => a.id === 'quiz').nom === 'Quiz Arena', 4000, 'nom enregistré');
      ok(/Quiz Arena/.test(cq('.arbre').textContent), 'menu pas mis à jour');
      if (tuile().lib) ok(tuile().lib === 'Quiz Arena' || tuile().lib !== avant, 'tuile : ' + tuile().lib);
      await saisirCrm('[data-f="actNom.quiz"]', avant); await attendre(() => SBc().etat().config.activites.find(a => a.id === 'quiz').nom === avant, 4000, 'nom remis');
      sansErreur('crm');
    });
    test('Activité à une seule salle : même fonctionnement, sans choix de salle', async () => {
      await action('versTpl', { id: 'quiz' }); await action('tplNouv');
      egal(cqa('[data-a="tplSalle"]').length, 0, 'pas de choix de salle avec une seule salle');
      ok(SBc().moteur.lie(SBc().etat().config.activites.find(x => x.id === 'quiz')), 'quiz pas en « une salle par groupe »');
      sansErreur('crm');
    });
    test('Un clic sur un écran ou un onglet ramène à aujourd’hui', async () => {
      const auj = crm('AUJ');
      crm('S.jour = AUJ - 1'); await action('ouvrir', { id: 'bowling', o: 'planning' }); egal(crm('S.jour'), auj, 'onglet Planning du bowling');
      await action('slotNav', { abs: auj + 4 }); await action('sousO', { e: 'act-karaoke', o: 'creneaux' }); egal(crm('slotJourVal()'), auj, 'onglet Créneaux');
      crm('S.jour = AUJ + 2'); await action('aller', { e: 'planning' }); egal(crm('S.jour'), auj, 'Planning général');
      await action('jour', { d: 1 }); egal(crm('S.jour'), auj + 1, 'les flèches de jour marchent toujours');
      sansErreur('crm');
    });
    test('Générateur : un template génère ses créneaux, le lot se supprime en deux clics (les réservations restent)', async () => {
      await action('versTpl', { id: 'laser' }); await action('tplNouv'); const idTpl = crm('tplCourant().id');
      crm(`(() => { const t = tplCourant(); t.nom = 'Test lot'; t.pas = 60; t.regles = [{ formules: [PRIX.laser[0].nom], jours: [0, 1, 2, 3, 4, 5, 6], de: '14:00', a: '17:00' }]; })()`);
      const j = crm('AUJ') + 30; crm(`S.gen.du = S.gen.au = SB.temps.isoDeJour(${j})`);
      await action('tplVersGen'); await action('genererSlots');
      const L = () => SBc().moteur.slotsJour(SBc().etat(), 'laser', j);
      await attendre(() => L().length === 4, 4000, '4 créneaux de 14:00 à 17:00');
      egal(L().map(x => x.h), ['14:00', '15:00', '16:00', '17:00']);
      const lot = L()[0].lot; ok(lot && L().every(x => x.lot === lot), 'lot');
      const r = SBc().api.reservations.creer({ act: 'laser', j, h: '15:00', formule: crm('PRIX.laser[0].nom'), pers: 2, client: 'Lot' }, 'test'); ok(r.ok, r.raison); C().__sbxCRM.charger(['reservations']);
      await action('lotSup', { act: 'laser', k: lot }); egal(L().length, 4, 'supprimé dès le 1er clic');
      await action('lotSup', { act: 'laser', k: lot }); await attendre(() => !L().length, 4000, 'créneaux du lot supprimés');
      ok(resa(r.resa.id), 'la réservation a disparu avec le lot');
      await action('tplSel', { id: idTpl }); await action('tplSup'); ok(!crm(`tplsDe('laser').some(t => t.id === '${idTpl}')`), 'template de test pas supprimé');
      sansErreur('crm');
    });
    test('Template : règles cumulées, après minuit, vacances et fériés ; dupliquer, supprimer', async () => {
      const H = (regles, c) => crm(`heuresTemplate(${JSON.stringify({ pas: 60, regles })}, 2, ${JSON.stringify(c || {})}).map(([m, F]) => [m, [...F.keys()]])`);
      egal(H([{ formules: ['A'], jours: [2], de: '14:00', a: '15:00' }, { formules: ['B'], jours: [2], de: '15:00', a: '16:00' }]), [[840, ['A']], [900, ['A', 'B']], [960, ['B']]], 'règles cumulées');
      egal(H([{ formules: ['A'], jours: [2], de: '23:00', a: '01:00' }]).map(x => x[0]), [1380, 1440, 1500], 'après minuit');
      egal(H([{ formules: ['A'], jours: [2], de: '14:00', a: '14:00', seulVac: true }]).length, 0, '« vacances » un jour normal');
      egal(H([{ formules: ['A'], jours: [2], de: '14:00', a: '14:00', seulVac: true }], { vac: true }).length, 1, '« vacances » en vacances');
      egal(H([{ formules: ['A'], jours: [2], de: '14:00', a: '14:00', horsFerie: true }], { ferie: true }).length, 0, '« hors fériés » un férié');
      egal(H([{ formules: ['A'], jours: [2], de: '14:00', a: '14:00', seulVac: true, seulFerie: true }], { ferie: true }).length, 1, 'vacances OU férié');
      await action('versTpl', { id: 'karaoke' }); const n = crm(`tplsDe('karaoke').length`); await action('tplNouv'); const id = crm('tplCourant().id');
      await action('tplHors', { ri: 0, k: 'seulVac' }); await action('tplHors', { ri: 0, k: 'horsVac' });
      ok(crm('tplCourant().regles[0].horsVac') && !crm('tplCourant().regles[0].seulVac'), '« vacances » et « hors vacances » ensemble');
      await action('tplDup'); egal(crm(`tplsDe('karaoke').length`), n + 2, 'dupliqué'); await action('tplSup');
      await action('tplSel', { id }); await action('tplSup'); egal(crm(`tplsDe('karaoke').length`), n, 'templates de test supprimés'); sansErreur('crm');
    });
    test('Fermer un créneau, une formule ou une journée dans le CRM : la borne suit', async () => {
      const j = jourAvec('laser'), f = crm('PRIX.laser[0].nom'), s0 = SBc().moteur.slotsJour(SBc().etat(), 'laser', j)[0], H = () => heuresBorne('laser', f, 2, j);
      C().__sbxCRM.charger(['creneaux']);
      ok(H().includes(s0.h), 'heure pas proposée au départ');
      await action('slotOuvert', { id: s0.id }); await attendre(() => !H().includes(s0.h), 4000, 'créneau fermé');
      await action('slotOuvert', { id: s0.id }); await attendre(() => H().includes(s0.h), 4000, 'créneau rouvert');
      await action('slotFormule', { id: s0.id, n: f }); await attendre(() => !H().includes(s0.h), 4000, 'formule fermée');
      await action('slotFormule', { id: s0.id, n: f }); await attendre(() => H().includes(s0.h), 4000, 'formule rouverte');
      await action('slotJour', { act: 'laser', j, v: '0' }); await attendre(() => !H().length, 4000, 'journée fermée');
      await action('slotJour', { act: 'laser', j, v: '1' }); await attendre(() => H().length, 4000, 'journée rouverte');
      sansErreur('crm');
    });
    test('Module borne : un texte changé dans le CRM s’affiche sur la borne', async () => {
      await action('aller', { e: 'sandbox', o: 'activites' }); await action('act', { id: 'laser' }); await action('modSec', { act: 'laser', s: 'accueil' });
      await saisirCrm('[data-f="mod.laser.accueil.action"]', 'Je fonce');
      await attendre(() => SBc().api.modules.val(SBc().etat().config.activites.find(a => a.id === 'laser'), 'accueil', 'action') === 'Je fonce', 4000, 'texte enregistré');
      await accueil(); ok(/Je fonce/.test(vue('[data-a="module"][data-act="laser"]').textContent), 'la tuile Laser n’a pas le nouveau texte');
      crm(`(() => { poserMod(actById('laser'), 'accueil', 'action', undefined); window.__sbxCRM.sauver(); })()`); sansErreur('crm'); sansErreur('borne');
    });
    test('Tarifs : « vacances scolaires » se coche et exclut « hors vacances »', async () => {
      await action('ouvrir', { id: 'laser', o: 'tarifs' }); ok(cq('[data-a="pxHors"][data-k="seulVac"]'), 'pas de choix « vacances scolaires »');
      const r = () => crm('PRIX.laser[0].regles[0]');
      await action('pxHors', { pre: 'laser', fi: 0, ri: 0, k: 'seulVac' }); ok(r().seulVac, 'pas coché');
      await action('pxHors', { pre: 'laser', fi: 0, ri: 0, k: 'horsVac' }); ok(r().horsVac && !r().seulVac, '« vacances » et « hors vacances » ensemble');
      await action('pxHors', { pre: 'laser', fi: 0, ri: 0, k: 'horsVac' }); ok(!r().horsVac && !r().seulVac, 'pas décoché');
      sansErreur('crm');
    });
    test('Tarifs : les règles d’une formule se rangent à la poignée ⠿ (glisser-déposer), pas d’une formule à l’autre', async () => {
      await action('ouvrir', { id: 'laser', o: 'tarifs' });
      const L0 = crm('PRIX.laser[0].regles').map(r => r.prix); ok(L0.length >= 2, 'il faut 2 règles');
      const W = C(), g = cq('[data-glisse="px:laser|0|0"]'), cible = cq('[data-cible="px:laser|0|1"]'); ok(g && cible, 'poignées absentes');
      const dt = new W.DataTransfer(), r = cible.getBoundingClientRect(), pos = { clientX: r.left + 10, clientY: r.bottom - 2 };
      g.dispatchEvent(new W.DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      cible.dispatchEvent(new W.DragEvent('dragover', Object.assign({ bubbles: true, cancelable: true, dataTransfer: dt }, pos)));
      cible.dispatchEvent(new W.DragEvent('drop', Object.assign({ bubbles: true, cancelable: true, dataTransfer: dt }, pos))); await pause(80);
      egal(crm('PRIX.laser[0].regles').map(x => x.prix), [L0[1], L0[0]].concat(L0.slice(2)), 'règles inversées');
      await attendre(() => SBc().etat().config.prix.laser[0].regles[0].prix === L0[1], 4000, 'ordre enregistré');
      ok(!crm(`compatible('px:laser|0|0', 'px:laser|1|0')`), 'une règle peut passer dans une autre formule');
      crm(`deplacer('px:laser|0|1', 'px:laser|0|0', false)`); egal(crm('PRIX.laser[0].regles').map(x => x.prix), L0, 'ordre remis'); C().document.getElementById('app').innerHTML = C().rendre();
      sansErreur('crm');
    });
    test('Tarifs : un prix changé dans le CRM est celui de la borne', async () => {
      await action('ouvrir', { id: 'laser', o: 'tarifs' });
      const sel = '[data-f="px.laser.0.0.prix"]'; ok(cq(sel), 'champ du prix'); const avant = cq(sel).value;
      await saisirCrm(sel, '99');
      await attendre(() => +SBc().api.resa.config('laser').formules[0].tarifs[0].prix === 99, 4000, 'prix 99 sur la borne');
      await saisirCrm(sel, avant); await attendre(() => +SBc().api.resa.config('laser').formules[0].tarifs[0].prix === +String(avant).replace(',', '.'), 4000, 'prix remis');
      sansErreur('crm');
    });
    test('Tickets CE : un lot créé dans le CRM donne des codes valables', async () => {
      crm(`Object.assign(S.lotForm, { org: 'CE Test', type: 'Ticket CE', contenu: 'Bowling · 1 partie', nb: 3, valeur: 7.5 })`);
      await action('creerLot');
      const L = await attendre(() => { const x = SBc().etat().tickets.codes.filter(c => c.org === 'CE Test'); return x.length >= 3 && x; }, 4000, 'codes du lot enregistrés');
      ok(SBc().api.tickets.verifier(L[0].code, 'bowling').ok, 'code refusé'); FAITS.codeCE = L[1].code; sansErreur('crm');
    });
    test('Paramétrage : crayon pour l’ordre des activités ; jeton secret des routes d’API', async () => {
      await action('aller', { e: 'tdb' }); ok(!cq('[data-a="ordreAct"]'), 'crayon visible hors Paramétrage');
      await action('aller', { e: 'parametrage' }); ok(cq('[data-a="ordreAct"]'), 'pas de crayon en Paramétrage');
      const noms = () => crm(`CENTRE.activites.filter(a => a.modele !== 'vente').map(a => a.id)`);
      await action('ordreAct'); const avant = noms(); ok(cqa('.arbre .ord-l').length === avant.length, 'pas de flèches sur chaque activité');
      await action('actOrdre', { id: avant[1], d: '-1' }); egal(noms().slice(0, 2), [avant[1], avant[0]], 'activité pas montée');
      await attendre(() => { const A = SBc().etat().config.activites.filter(a => a.modele !== 'vente').sort((x, y) => (x.ordre ?? 1e3) - (y.ordre ?? 1e3)); return A[0].id === avant[1]; }, 4000, 'ordre pas enregistré');
      await action('actOrdre', { id: avant[1], d: '1' }); egal(noms(), avant, 'ordre pas revenu'); await action('ordreAct'); ok(!cq('.arbre .ord-l'), 'mode ordre pas terminé');
      await action('param', { id: 'api' }); await action('jetonNouv');
      const j = () => (SBc().lire('reglages') || {}).apiJeton; ok(/^sb_[0-9a-f]{64}$/.test(j() || ''), 'jeton pas généré : ' + j());
      const j1 = j(); await action('jetonVoir'); ok(!cq('#app').textContent.includes(j1), 'jeton affiché en clair sans le demander');
      await action('jetonNouv'); egal(j(), j1, 'remplacé sans confirmation'); await action('jetonNouv'); ok(j() !== j1, 'pas remplacé après confirmation');
      sansErreur('crm');
    });
    test('Bar › Produits : la catégorie déroule ses sous-catégories (flèche), un re-clic la replie', async () => {
      await action('aller', { e: 'bar', o: 'produits' }); await action('prodCat', { c: 'tous' });
      const c = crm(`CATS.find(([k, ss]) => ss.length > 1)[0]`), n = crm(`CATS.find(([k]) => k === '${c}')[1].length`);
      const cat = () => cqa('.snav .cat').find(b => b.dataset.c === c), sous = () => cqa('.snav .ss').length;
      egal(sous(), 0, 'sous-catégories ouvertes d’office'); ok(cat().querySelector('.fl svg'), 'pas de flèche');
      await action('prodCat', { c }); egal(sous(), n, 'sous-catégories pas déroulées'); ok(cat().classList.contains('ouv') && cq('.snav .ss-l.anim'), 'pas d’animation à l’ouverture');
      await pause(30); await action('prodCat', { c, s: crm(`CATS.find(([k]) => k === '${c}')[1][0]`) }); ok(!cq('.snav .ss-l.anim'), 'l’animation rejoue à chaque clic');
      await action('prodCat', { c }); egal(sous(), n, 'revenir à la catégorie ne doit pas la replier');
      await action('prodCat', { c }); egal(sous(), 0, 're-clic : pas repliée'); ok(!cat().classList.contains('ouv'), 'flèche pas revenue');
      await action('prodCat', { c }); egal(sous(), n, 'pas redéroulée'); await action('prodCat', { c: 'tous' }); sansErreur('crm');
    });
    test('Bar › Règles horaires : hors de ses horaires l’article est grisé sur la borne ; ventes additionnelles repliables', async () => {
      const hh = n => String((new Date().getHours() + n + 24) % 24).padStart(2, '0') + ':00';
      await action('aller', { e: 'bar', o: 'horaires' }); await action('horAjout');
      const h = crm('HORAIRES_BAR[HORAIRES_BAR.length - 1]'), P = SBc().api.bar.catalogue('K-02').produits[0], c = P.cat;
      const cat = () => SBc().api.bar.catalogue('K-02').produits.filter(p => p.cat === c);
      try {
        await action('choixOuvre', { k: 'hor.' + h.id }); const q = cq('.cbx-pop .cbx-q'); ok(q && cq('.cbx-pop input[type=checkbox]'), 'pas de recherche ni de cases dans le sélecteur');
        q.value = 'sod'; q.dispatchEvent(new (C().Event)('input', { bubbles: true })); const vus = cqa('.cbx-pop li[role=option]:not([hidden])').map(li => li.textContent);
        ok(vus.length && vus.every(t => /sod/i.test(t)), 'recherche pas filtrée : ' + vus.slice(0, 5));
        const cases = () => cqa('.cbx-pop input[type=checkbox]'), deux = crm(`PRODUITS.filter(p => p.cat !== '${c}').slice(0, 2).map(p => 'p:' + p.id)`);
        cases().filter(x => x.checked).forEach(x => x.click()); [...deux, 'c:' + c].forEach(v => cases().find(x => x.value === v).click());
        ok(cq('.cbx-pop .cbx-q') && cq('.cbx-pop .cbx-q').value === 'sod', 'cocher efface la recherche ou ferme la liste'); ok(/3 choisis/.test(cq('.cbx-fin').textContent), 'compteur pas à jour');
        await action('choixOuvre', { k: 'hor.' + h.id }); ok(!cq('.cbx-pop'), '« Terminé » ne ferme pas');
        egal(crm('HORAIRES_BAR.find(x => x.id === "' + h.id + '").si'), [...deux, 'c:' + c], 'plusieurs choix pas enregistrés');
        egal(cqa(`[data-a="horRetire"][data-id="${h.id}"]`).length, 3, 'les choix ne s’affichent pas sous la règle');
        await action('horRetire', { id: h.id, k: deux[0] }); egal(crm('HORAIRES_BAR.find(x => x.id === "' + h.id + '").si'), [deux[1], 'c:' + c], 'la croix ne retire pas');
        await action('choixOuvre', { k: 'hor.' + h.id }); cases().find(x => x.value === deux[1]).click(); await action('choixOuvre', { k: 'hor.' + h.id });
        egal(crm('HORAIRES_BAR.find(x => x.id === "' + h.id + '").si'), ['c:' + c], 'décocher ne retire pas');
        await saisirCrm(`[data-f="hor.${h.id}.de"]`, hh(2)); await saisirCrm(`[data-f="hor.${h.id}.a"]`, hh(3));
        await attendre(() => cat().length && cat().every(p => p.servi === false), 4000, 'articles pas grisés hors horaires');
        ok(cq('.sous [data-o="horaires"] .n'), 'pas de compteur sur l’onglet');
        await saisirCrm(`[data-f="hor.${h.id}.de"]`, hh(-1)); await saisirCrm(`[data-f="hor.${h.id}.a"]`, hh(1));
        await attendre(() => cat().every(p => p.servi), 4000, 'articles pas revenus dans les horaires');
        await action('sousO', { e: 'bar', o: 'produits' }); await action('prodCat', { c }); ok(/→/.test(cq('#app').textContent), 'horaires absents de la liste des produits');
        await action('prod', { id: P.id }); ok(!cq('[data-f$=".des"]') && /Règles horaires/.test(cq('.tiroir').textContent), 'fiche : encore « Disponible à partir de »'); await action('fermer');
      } finally { await action('sousO', { e: 'bar', o: 'horaires' }); await action('horSup', { id: h.id }); }
      await attendre(() => !(SBc().etat().config.bar.horaires || []).length, 4000, 'règle supprimée');
      await action('sousO', { e: 'bar', o: 'borne' }); const u = crm('UPSELLS[0].id');
      ok(!cq('[data-f^="up."][data-f$=".titre"]') && cqa('[data-a="upOuvre"]').length >= 2, 'règles des ventes additionnelles pas repliées');
      await action('upOuvre', { id: u }); ok(cq(`[data-f="up.${u}.titre"]`), 'la règle ne s’ouvre pas');
      await action('upPlie'); ok(!cq('[data-a="upOuvre"]') && /Afficher/.test(cq('#app').textContent), 'bloc pas réduit');
      await action('upPlie'); await action('upOuvre', { id: u }); ok(!cq('[data-f^="up."][data-f$=".titre"]'), 'la règle ne se replie pas'); sansErreur('crm');
    });
    test('Bar : créer, renommer une catégorie et une sous-catégorie (nom déjà pris refusé)', async () => {
      await action('aller', { e: 'bar', o: 'produits' }); await action('catNouv');
      const c0 = crm('S.prodCat'); ok(crm('CATS').some(([c]) => c === c0), 'catégorie pas créée');
      const ren = async (sel, v) => { const el = cq(sel); el.value = v; el.dispatchEvent(new (C().Event)('change', { bubbles: true })); await pause(40); };
      await ren('[data-ren="cat"]', 'TEST CAT'); egal(crm('S.prodCat'), 'TEST CAT', 'renommée');
      await action('sousNouv'); await ren('[data-ren="sous"]', 'Sous test');
      egal(crm('CATS').find(([c]) => c === 'TEST CAT')[1], ['Sous test'], 'sous-catégorie');
      await ren('[data-ren="cat"]', crm('CATS[0][0]')); egal(crm('S.prodCat'), 'TEST CAT', 'renommée vers un nom déjà pris');
      await attendre(() => (SBc().etat().config.bar.cats || []).some(([c, ss]) => c === 'TEST CAT' && ss.includes('Sous test')), 4000, 'catégorie enregistrée');
      sansErreur('crm');
    });
    test('Bar : créer un article, le ranger, le mettre en stock : il arrive sur la borne', async () => {
      await action('prodNouv'); const id = crm('S.prod'), P = () => crm(`PRODUITS.find(x => x.id === '${id}')`);
      egal([P().cat, P().sous, P().stock], ['TEST CAT', 'Sous test', false], 'nouvel article');
      await saisirCrm(`[data-f="prod.${id}.nom"]`, 'Limonade test'); await saisirCrm(`[data-f="prod.${id}.prix"]`, '3,50'); await saisirCrm(`[data-f="prod.${id}.plu"]`, '9999');
      await saisirCrm(`[data-f="prod.${id}.sous"]`, ''); egal(P().sous, '', 'sortie de la sous-catégorie'); await saisirCrm(`[data-f="prod.${id}.sous"]`, 'Sous test');
      await action('prodStock', { id });
      await attendre(() => SBc().api.bar.catalogue('K-02').produits.some(x => x.id === id && x.nom === 'Limonade test' && x.prix === 3.5 && x.plu === '9999'), 4000, 'article sur la borne');
      await accueil(); await clic('[data-a="module"][data-act="bar"]'); await surEcran('bar');
      ok(vues('.carte-c').some(x => /TEST CAT/.test(x.textContent)), 'catégorie absente de l’écran du bar');
      FAITS.article = id; sansErreur('crm'); sansErreur('borne');
    });
    test('Bar : catégorie non vide protégée ; article, sous-catégorie et catégorie supprimés', async () => {
      await action('aller', { e: 'bar', o: 'produits' }); await action('prodCat', { c: 'TEST CAT' });
      await action('catSup'); await action('catSup'); ok(crm('CATS').some(([c]) => c === 'TEST CAT'), 'catégorie non vide supprimée');
      ok(/contient encore 1 article/.test(C().document.getElementById('app').textContent), 'pas de message'); await action('barNon');
      await action('prodSup', { id: FAITS.article }); ok(crm(`PRODUITS.some(x => x.id === '${FAITS.article}')`), 'retiré dès le 1er clic');
      await action('prodSup', { id: FAITS.article }); ok(!crm(`PRODUITS.some(x => x.id === '${FAITS.article}')`), 'article pas retiré');
      await action('prodCat', { c: 'TEST CAT', s: 'Sous test' }); await action('sousSup'); await action('sousSup'); egal(crm('CATS').find(([c]) => c === 'TEST CAT')[1], [], 'sous-catégorie');
      await action('catSup'); await action('catSup'); ok(!crm('CATS').some(([c]) => c === 'TEST CAT'), 'catégorie vide pas supprimée');
      await attendre(() => !SBc().etat().config.bar.cats.some(([c]) => c === 'TEST CAT') && !SBc().etat().config.bar.produits.some(x => x.id === FAITS.article), 4000, 'suppression enregistrée');
      ok(!SBc().api.bar.catalogue('K-02').produits.some(x => x.id === FAITS.article), 'encore sur la borne'); sansErreur('crm');
    });
    test('Bar : commande payée en partie « à traiter », encaissée au comptoir ; paiement jamais terminé classé abandonné', async () => {
      const num = FAITS.barPartiel; ok(num, 'pas de commande partielle (suite Moteur)');
      C().__sbxCRM.charger(['ventes']); await action('aller', { e: 'bar', o: 'commandes' });
      ok(crm(`soucisBar(COMMANDES_BAR.find(c => c.num === ${num}) || {})`).includes('partie'), 'commande partielle pas « à traiter »');
      const badge = cq('[data-a="sousO"][data-e="bar"][data-o="commandes"] .n'); ok(badge && +badge.textContent >= 1, 'pas de badge');
      await action('cmdBar', { n: num }); ok(cq('.soucis'), 'pas d’encart dans la commande');
      await action('barEncaisser', { n: num }); await attendre(() => SBc().etat().ventes.commandes.find(c => c.num === num).etat === 'validee', 4000, 'commande validée');
      ok(!crm(`soucisBar(COMMANDES_BAR.find(c => c.num === ${num}))`), 'encore à traiter'); await action('fermer');
      const v = SBc().api.bar.commander({ borne: 'K-02', act: 'bar', nom: 'Vieille', lieu: 'Comptoir du bar', ts: Date.now() - 20 * 60e3, lignes: [{ id: 'x', nom: 'Eau', q: 1, pu: 2, tva: 10 }] }, 'test').commande;
      C().__sbxCRM.charger(['ventes']); ok(/jamais/.test(crm(`soucisBar(COMMANDES_BAR.find(c => c.num === ${v.num}))`)), 'paiement jamais terminé pas « à traiter »');
      await action('barAbandon', { n: v.num }); await attendre(() => SBc().etat().ventes.commandes.find(x => x.num === v.num).etat === 'annulee', 4000, 'classée abandonnée');
      const pp = SBc().api.bar.commander({ borne: 'K-02', act: 'bar', nom: 'Partie', lieu: 'Comptoir du bar', ts: Date.now(), lignes: [{ id: 'x', nom: 'Eau', q: 2, pu: 2, tva: 10 }] }, 'test').commande;
      SBc().api.bar.payer(pp.num, { moyen: 'Carte', montant: 2, lignes: [], ok: true, op: 'pp-' + Date.now(), ts: Date.now() }, 'test'); C().__sbxCRM.charger(['ventes']);
      await action('barAbandon', { n: pp.num }); const c3 = SBc().etat().ventes.commandes.find(x => x.num === pp.num);
      ok(c3.etat === 'annulee' && /2.*payés/.test(c3.motif), 'commande payée en partie pas classée : ' + c3.etat + ' · ' + c3.motif);
      ok(!crm(`COMMANDES_BAR.some(c => c.num === ${pp.num} && soucisBar(c))`), 'encore à traiter');
      const nb = SBc().etat().ventes.paiements.length, ok0 = SBc().api.bar.commander({ borne: 'K-02', act: 'bar', nom: 'Zéro', lieu: 'Comptoir du bar', ts: Date.now(), lignes: [{ id: 'x', nom: 'Eau', q: 1, pu: 0, tva: 10 }] }, 'test');
      ok(ok0.ok && ok0.commande.etat === 'validee' && SBc().etat().ventes.paiements.length === nb, 'commande à 0 € : ligne de paiement créée ou pas validée');
      sansErreur('crm');
    });
    test('Choisir un style l’enregistre pour la borne', async () => {
      await action('aller', { e: 'sandbox', o: 'activites' }); await action('act', { id: 'laser' }); await action('modSec', { act: 'laser', s: 'rs-date' });
      cq('.mod-st[data-v="2"]').click();
      await attendre(() => ((SBc().etat().config.activites.find(a => a.id === 'laser').module || {})['rs-date'] || {}).style === '2', 4000, 'style 2 enregistré');
      cq('.mod-st[data-v="1"]').click();
      await attendre(() => ((SBc().etat().config.activites.find(a => a.id === 'laser').module || {})['rs-date'] || {}).style === '1', 4000, 'style 1 enregistré');
      sansErreur('crm');
    });
    test('Tickets CE : un clic sur un code ouvre sa fiche (vrai QR code, activité, lot), annuler puis réactiver ; un lot pour chaque formule de chaque activité', async () => {
      await action('aller', { e: 'ce' }); await action('sousO', { e: 'ce', o: 'liste' });
      const tr = await attendre(() => cq('tr.clic[data-a="code"]'), 3000, 'liste des codes'), code = tr.dataset.c;
      tr.querySelector('td:nth-child(3)').click(); await pause(60);
      const t = await attendre(() => cq('.tiroir'), 2000, 'fiche du code');
      egal(t.querySelector('.qr-grand code').textContent, code, 'code de la fiche');
      ok(t.querySelector('svg.qr path').getAttribute('d').length > 500, 'QR code vide');
      ok(/Valable pour/.test(t.textContent) && /seulement|toutes les activités|d’après son contenu/.test(t.textContent), 'activité du code absente');
      /* le générateur de QR (sandbox/qr.js), comparé à un QR relu par un vrai lecteur (OpenCV) le 14/10/2026 */
      const M = C().QR.matrice('L2026-07-0002-3508'), s = M.map(r => r.map(b => +b).join('')).join('|'); let h = 5381; for (const ch of s) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
      egal([M.length, h], [25, 3240863957], 'QR code de référence');
      const libre = crm(`(CODES.find(c => c.etat === 'disponible') || {}).code`); ok(libre, 'aucun code disponible');
      const etat = () => (SBc().lire('tickets').codes.find(c => c.code === libre) || {}).etat;
      await action('code', { c: libre }); await action('codeAnnuler', { c: libre });
      await attendre(() => etat() === 'annulé', 3000, 'code annulé enregistré');
      ok(cq('.tiroir [data-a="codeReactiver"]'), 'bouton Réactiver absent de la fiche');
      await action('codeReactiver', { c: libre });
      await attendre(() => etat() === 'disponible', 3000, 'code réactivé enregistré');
      await action('fermer'); ok(!cq('.tiroir'), 'fiche restée ouverte');
      await action('sousO', { e: 'ce', o: 'creer' });
      const O = cqa('[data-f="lotForm.contenu"] option').map(o => o.textContent);
      ['Bowling', 'Laser Game', 'Karaoké', 'Billard', 'Anniversaire'].forEach(n => ok(O.some(o => o.startsWith(n + ' · ')), 'pas de contenu « ' + n + ' » pour un lot'));
      sansErreur('crm');
    });
    test('Paramètres de diffusion : écran de veille (adresse, choix par borne, retrait) et logo du centre', async () => {
      await action('aller', { e: 'parametrage' }); await action('param', { id: 'diffusion' });
      ok(!cq('[data-f="diff.video"]'), 'l’ancien champ « Vidéo de veille » est encore là');
      const i = crm('DIFFUSION.veille.length');
      await action('veilleAdresse');
      await saisirCrm(`[data-f="veille.${i}.src"]`, 'borne/videos/anniversaires.mp4'); await saisirCrm(`[data-f="veille.${i}.nom"]`, 'Anniv test');
      await action('veilleCase', { i, b: 'K-01' });
      await attendre(() => SBc().api.veille.liste().some(d => d.nom === 'Anniv test'), 4000, 'diapositive enregistrée');
      ok(!SBc().api.bornes.config('K-01').veille.some(d => d.nom === 'Anniv test'), 'K-01 décochée mais la reçoit');
      ok(SBc().api.bornes.config('K-02').veille.some(d => d.nom === 'Anniv test' && d.type === 'video'), 'K-02 ne la reçoit pas');
      ok(cq('[data-a="veilleCase"][data-b="K-02"]') && !cq('[data-a="veilleCase"][data-b="E-01"]'), 'tableau par borne (sans l’écran de préparation)');
      await action('veilleSuppr', { i: crm(`DIFFUSION.veille.findIndex(d => d.nom === 'Anniv test')`) });
      await attendre(() => !SBc().api.veille.liste().some(d => d.nom === 'Anniv test'), 4000, 'diapositive retirée');
      const logo = 'data:image/png;base64,iVBORw0KGgo=';
      crm(`cibleImage('logo.centre').img = '${logo}'`); await action('param', { id: 'diffusion' });
      await attendre(() => SBc().lire('config').logo === logo, 4000, 'nouveau logo envoyé aux bornes');
      ok(cq('.logo-ap img').src === logo && cq('[data-a="logoDefaut"]'), 'aperçu du logo ou bouton « logo d’origine » absent');
      await action('logoDefaut');
      await attendre(() => SBc().lire('config').logo === crm('LOGO_DEF'), 4000, 'logo d’origine remis');
      sansErreur('crm');
    });
    /* ---- modules branchés sur les vraies données (21 octobre 2026) : CA, statistiques, encaissement comptoir, journal, parc, refus CE ---- */
    test('Tableau de bord et Statistiques : chiffre d’affaires calculé sur les vrais paiements de la sandbox', async () => {
      const SB = SBc(), m = 7.25;
      crm(`window.__sbxCRM.charger(['ventes'])`); const avant = crm('recalculerCA(); CA[CA.length - 1].tot');
      const c = SB.api.bar.commander({ borne: 'K-02', nom: 'Stat test', lieu: 'Bar', lignes: [{ nom: 'Chips', q: 1, pu: m, tva: 10 }] }, 'test'); ok(c.ok, c.raison);
      const p = SB.api.bar.payer(c.commande.num, { moyen: 'Carte', montant: m, lignes: [['Chips', 1, m, 10]], ok: true, op: 'stat-' + Date.now().toString(36), ts: Date.now() }, 'test'); ok(p.ok, p.raison);
      crm(`window.__sbxCRM.charger(['ventes'])`); crm('recalculerCA()');
      const auj = crm('CA[CA.length - 1]');
      ok(auj.tot >= m && auj.par.bar >= m && auj.canaux.borne >= m && auj.moyens.tpe >= m && auj.trans >= 1 && auj.cmdBar >= 1, 'le jour ne compte pas le paiement : ' + JSON.stringify([auj.tot, auj.par, auj.canaux, auj.moyens, auj.trans]));
      egal(crm('CA.length'), 365, '365 jours'); ok(Math.abs(auj.tot - avant - m) < 0.01, 'le CA du jour n’a pas augmenté du montant payé : ' + avant + ' → ' + auj.tot);
      ok(Math.abs(crm('tvaDe(' + JSON.stringify(p.paiement) + ')') - (m - m / 1.1)) < 0.01, 'TVA à 10 % du paiement');
      await action('aller', { e: 'stats' });
      for (const o of ['ensemble', 'affluence', 'bar', 'canaux', 'paiements', 'ce']) { await action('sousO', { e: 'stats', o }); sansErreur('crm'); ok(C().document.getElementById('app').textContent.length > 300, 'Statistiques › ' + o + ' vide'); }
      await action('sousO', { e: 'stats', o: 'bar' }); ok(/Chips/.test(C().document.getElementById('app').textContent), 'l’article vendu n’apparaît pas dans Ventes bar');
      await action('aller', { e: 'tdb' }); ok(cqa('.widgets .bloc').length >= 6 && !/Masqué/.test(cq('.widgets').textContent), 'tableau de bord vide ou CA masqué pour l’Admin');
      ok(crm('PRODUITS.every(p => !p.ventes)'), 'des ventes de démonstration restent sur les produits'); sansErreur('crm');
    });
    test('Encaisser une réservation au comptoir : une transaction « Comptoir » est enregistrée, visible dans Transactions et le Journal', async () => {
      const SB = SBc(), f = SB.api.resa.config('karaoke').formules[0].nom, J = SB.api.resa.creneaux('karaoke', f, 4).filter(x => x.heures.length).slice(-1)[0]; ok(J, 'pas de créneau karaoké');
      const sim = SB.api.reservations.creer({ act: 'karaoke', j: J.j, h: J.heures[0].h, formule: f, pers: 4, client: 'Encaissement test' }, 'test'); ok(sim.ok, sim.raison);
      crm(`window.__sbxCRM.charger(['reservations'])`); await action('detail', { id: sim.resa.id }); await action('encaisser', { id: sim.resa.id });
      const r = SB.etat().reservations.find(x => x.id === sim.resa.id), t = SB.etat().ventes.paiements.find(p => p.resa === sim.resa.id);
      ok(r && r.paye === r.total && r.total > 0, 'réservation pas soldée'); ok(t && t.moyen === 'Comptoir' && t.montant === r.total && t.borne === 'COMPTOIR' && t.etat === 'ok', 'paiement comptoir absent des ventes');
      ok(SB.api.journal().some(e => e.type === 'resa.encaisse'), 'l’encaissement n’est pas dans le journal');
      const x = SB.api.reservations.encaisser(sim.resa.id, {}, 'test'); ok(!x.ok, 'un second encaissement a été accepté');
      await action('fermer'); await action('aller', { e: 'transactions' }); ok(C().document.getElementById('app').textContent.includes(t.num), 'transaction absente de l’écran Transactions');
      egal(crm('TRANS').find(y => y.num === t.num).act, 'karaoke', 'activité de la transaction comptoir');
      await action('aller', { e: 'parametrage' }); await action('param', { id: 'journal' }); ok(/encaissés au comptoir/.test(C().document.getElementById('app').textContent), 'journal vide dans Paramétrage'); sansErreur('crm');
      SB.api.reservations.supprimer(sim.resa.id, 'test');
    });
    test('Gestion des bornes : une borne ouverte se signale (heartbeat), les autres sont « jamais connectées »', async () => {
      await borne(); await attendre(() => (SBc().api.bornes.vues() || {})['K-02'], 6000, 'signe de vie de K-02');
      crm('majEtatBornes()'); const B = crm('CENTRE.bornes');
      ok(B.find(b => b.id === 'K-02').on && !B.find(b => b.id === 'K-02').jamais, 'K-02 pas en ligne'); ok(B.find(b => b.id === 'K-01').jamais && !B.find(b => b.id === 'K-01').on, 'K-01 devrait être « jamais connectée »');
      egal(crm('anomalies()').filter(a => /hors ligne/.test(a.titre)).length, 0, 'une borne jamais connectée ne doit pas remonter en anomalie');
      await action('aller', { e: 'bornes', o: 'parc' }); const t = C().document.getElementById('app').textContent; ok(/En ligne/.test(t) && /Jamais connectée/.test(t) && !/Fonctionnelle/.test(t), 'états du parc'); sansErreur('crm');
    });
    test('Tickets CE : un code refusé est noté (Validations du jour, Statistiques › Tickets CE)', async () => {
      const SB = SBc(), n0 = (SB.lire('tickets').refus || []).length;
      const r = SB.api.tickets.verifier('XXXX-0000-0000', 'bowling', 'Test'); ok(!r.ok, 'un code inconnu a été accepté');
      egal((SB.lire('tickets').refus || []).length, n0 + 1, 'refus non noté');
      crm(`window.__sbxCRM.charger(['tickets'])`); await action('aller', { e: 'ce', o: 'suivi' }); ok(/XXXX-0000-0000/.test(C().document.getElementById('app').textContent), 'refus absent de Validations du jour');
      await action('aller', { e: 'stats' }); await action('sousO', { e: 'stats', o: 'ce' }); ok(/Tentatives refusées/.test(C().document.getElementById('app').textContent), 'KPI absent');
      crm('window.__sbxCRM.sauver()'); ok((SBc().lire('tickets').refus || []).length >= n0 + 1, 'la sauvegarde du CRM a effacé les refus'); sansErreur('crm');
    });
  });

  /* =====================================================================
     SUITE 3 — BORNE (borne/index.html, K-02)
     ===================================================================== */
  suite('Borne', () => {
    test('Accueil : tuiles prêtes et « Finaliser ma commande »', async () => {
      await accueil();
      const tuile = act => vue(`[data-a="module"][data-act="${act}"]`);
      [['bowling', 'Jouer'], ['laser', 'Réserver'], ['anniv', 'Réserver'], ['karaoke', 'Réserver'], ['bar', 'Commander']].forEach(([a, mot]) => {
        ok(tuile(a), 'tuile ' + a + ' absente'); ok(!tuile(a).classList.contains('bientot') && tuile(a).textContent.includes(mot), a + ' : « ' + mot + ' » attendu');
      });
      ok(vue('[data-a="aller"][data-e="finaliser"]'), 'Finaliser absent'); sansErreur('borne');
    });
    test('Bowling : joueurs, formule, prénoms, récapitulatif, paiement, référence', async () => {
      await accueil(); await clic('[data-a="module"][data-act="bowling"]'); await surEcran('bw-formule');
      const n0 = +vue('[data-bwn]').textContent; await clic('[data-a="bwN"][data-d="1"]'); egal(+vue('[data-bwn]').textContent, n0 + 1, 'joueur ajouté');
      await clic('.formule'); await clic('[data-bwsuite]'); await surEcran('bw-joueurs');
      await clic('[data-a="bwJoueursOk"]'); ok(vue('[data-groupe].requis'), 'le nom du groupe n’est pas exigé'); egal(ecran(), 'bw-joueurs');
      await saisir('[data-f="groupe"]', 'Les Testeurs');
      const P = ['Léa', 'Tom', 'Inès', 'Hugo', 'Nino', 'Jade'];
      for (const [i, el] of vues('[data-f="prenom"]').entries()) { el.value = P[i]; el.dispatchEvent(new (B().Event)('input', { bubbles: true })); }
      await clic('[data-a="bwBarr"][data-i="1"]');
      await clic('[data-a="bwJoueursOk"]'); await surEcran('bw-recap');
      ok(texte().includes('Les Testeurs') && texte().includes('1 avec barrières'), 'récapitulatif incomplet');
      const du = +vue('[data-total]').dataset.total; ok(du > 0, 'total nul');
      await clic('[data-a="bwValider"]'); await payerCarte();
      const ref = (texte().match(/BO\d{3}/) || [])[0]; ok(ref, 'pas de référence BO sur la page de fin');
      const c = SBc().etat().ventes.commandes.find(x => x.reference === ref); ok(c && c.etat === 'validee', 'commande non validée');
      const r = resa('k' + c.num); ok(r && r.act === 'bowling' && r.joueurs.length === n0 + 1, 'groupe absent des réservations');
      FAITS.resas.push(r.id); FAITS.ventes.push(c.num);
      ok(r.joueurs[1].barrieres && r.joueurs[0].prenom === 'Léa', 'prénoms ou barrières perdus'); sansErreur('borne');
    });
    test('Laser : formule, joueurs, calendrier, informations, paiement, réservation', async () => {
      await accueil(); await clic('[data-a="module"][data-act="laser"]'); await surEcran('rs-formule');
      await clic('.an-f'); await surEcran('rs-nombre');
      await clic('[data-a="rsNb"][data-d="1"]'); egal(vue('[data-zone="rsNb"] b').textContent, '3', 'nombre de joueurs');
      for (let k = 0; k < 40 && !vue('[data-a="rsNb"][data-d="1"]').disabled; k++) { vue('[data-a="rsNb"][data-d="1"]').click(); await pause(5); }
      ok(+vue('[data-zone="rsNb"] b').textContent <= SBc().api.resa.config('laser').capMax, 'plus de joueurs que la plus grande salle');
      for (let k = 0; k < 40 && +vue('[data-zone="rsNb"] b').textContent > 3; k++) { vue('[data-a="rsNb"][data-d="-1"]').click(); await pause(5); }
      await clic('[data-a="rsSuite"][data-e="rs-nombre"]'); await surEcran('rs-date');
      ok(vue('.an-mois b'), 'calendrier sans mois'); await clic('.an-j.dispo'); const h = await clic('.an-h');
      const pu = prix(h.querySelector('small').textContent), heure = h.querySelector('b').textContent;
      await clic('[data-a="rsSuite"][data-e="rs-date"]'); await surEcran('rs-infos');
      await saisir('[data-f="rsGroupe"]', 'Les Lasers');
      await clic('[data-a="rsSuite"][data-e="rs-infos"]'); await surEcran('rs-recap');
      egal(+vue('[data-total]').dataset.total, arrondi(pu * 3), 'total du récapitulatif');
      await clic('[data-a="rsPayer"]'); await payerCarte();
      const num = numMerci(); ok(num, 'pas de numéro de réservation');
      const r = resa('k' + num); ok(r, 'réservation absente'); FAITS.resas.push(r.id); FAITS.ventes.push(num);
      egal([r.act, r.pers, r.titre, SBc().outils.hm(r.debut), r.canal, r.paye], ['laser', 3, 'Les Lasers', heure, 'Borne', r.total], 'réservation');
      sansErreur('borne');
    });
    test('Calendrier mois par mois : flèches et bornes', async () => {
      await accueil(); await clic('[data-a="module"][data-act="anniv"]'); await surEcran('rs-age');
      await clic('.an-age:last-child'); await attendre(() => ['rs-formule', 'rs-date'].includes(ecran()));
      if (ecran() === 'rs-formule') { await clic('.an-f'); await surEcran('rs-date'); }
      const lib = m => { const t = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
      const attendus = [...new Set(SBc().api.resa.creneaux('anniv', SBc().api.resa.config('anniv').formules[0].nom, 8).map(x => x.iso.slice(0, 7)))].map(lib);
      ok(vue('.an-j.dispo'), 'le mois affiché d’abord n’a pas de jour libre');
      for (let k = 0; k < 15 && !vue('[data-a="rsMois"][data-d="-1"]').disabled; k++) await clic('[data-a="rsMois"][data-d="-1"]');
      const vus = [vue('.an-mois b').textContent];
      for (let k = 0; k < 15 && !vue('[data-a="rsMois"][data-d="1"]').disabled; k++) { await clic('[data-a="rsMois"][data-d="1"]'); vus.push(vue('.an-mois b').textContent); }
      egal(vus, attendus, 'mois parcourus');
      sansErreur('borne');
    });
    test('Anniversaire : 72 h, options et fiche obligatoires, acompte, page de fin', async () => {
      await accueil(); await clic('[data-a="module"][data-act="anniv"]'); await surEcran('rs-age');
      await clic('.an-age'); await attendre(() => ['rs-formule', 'rs-date'].includes(ecran()));
      if (ecran() === 'rs-formule') { await clic('.an-f'); await surEcran('rs-date'); }
      const j = await clic('.an-j.dispo'), h = await clic('.an-h'), now = SBc().temps.maintenant();
      ok((+j.dataset.j - now.j) * 1440 + SBc().outils.mn(h.dataset.h) - now.min >= 72 * 60, 'créneau à moins de 72 h');
      await clic('[data-a="rsSuite"][data-e="rs-date"]'); await surEcran('rs-options');
      await clic('[data-a="rsSuite"][data-e="rs-options"]'); egal(ecran(), 'rs-options', 'les donuts ne sont pas exigés');
      await clic('.an-c[data-c="0"]'); await clic('[data-a="rsQte"][data-d="1"]');
      await clic('[data-a="rsSuite"][data-e="rs-options"]'); await surEcran('rs-infos');
      await clic('[data-a="rsSuite"][data-e="rs-infos"]'); egal(ecran(), 'rs-infos', 'la fiche de l’enfant n’est pas exigée');
      await saisir('[data-f="rsEnfant"]', 'Léo'); await saisir('[data-f="rsNaissance"]', '2018-11-02');
      await saisir('[data-f="rsNom"]', 'Julie Martin'); await saisir('[data-f="rsTel"]', '0612345678');
      await clic('[data-a="rsSuite"][data-e="rs-infos"]'); await surEcran('rs-recap');
      ok(texte().includes('Léo') && /acompte/i.test(texte()), 'récapitulatif sans enfant ou sans acompte');
      egal(+vue('[data-total]').dataset.total, 50, 'acompte à payer');
      await clic('[data-a="rsPayer"]'); await payerCarte();
      ok(/Joyeux anniversaire Léo/i.test(texte()), 'page de fin : ' + texte().slice(0, 80));
      const r = resa('k' + numMerci()); ok(r && r.anniv && r.anniv.enfant === 'Léo', 'réservation anniversaire absente'); FAITS.resas.push(r.id); FAITS.ventes.push(r.num);
      egal(r.paye, 50, 'acompte payé'); ok(r.options.some(o => /Donuts/.test(o.nom)), 'option donuts perdue'); ok(r.tel === '0612345678', 'téléphone perdu');
      sansErreur('borne');
    }, { delai: 45000 });
    test('Bar : panier, prénom obligatoire, lieu, paiement', async () => {
      await accueil(); await clic('[data-a="module"][data-act="bar"]'); await surEcran('bar');
      /* un article simple (sans option ni alcool, disponible à cette heure) : catégorie par catégorie, sous-catégorie par sous-catégorie */
      const simple = () => vues('.carte-p:not(.off)').find(p => !p.querySelector('.cp-n small') && !p.querySelector('.b18'));
      await clic('.carte-c[data-a="rub"]');
      let prod = null;
      for (const c of vues('.rail [data-a="rub"]').map(b => b.dataset.c)) {
        vue(`.rail [data-a="rub"][data-c="${CSS.escape(c)}"]`).click(); await pause(120);
        if ((prod = simple())) break;
        for (const x of vues('.carte-c[data-a="sous"]').map(b => b.dataset.s)) { const b = vue(`[data-a="sous"][data-s="${CSS.escape(x)}"]`); if (b) { b.click(); await pause(120); } if ((prod = simple())) break; }
        if (prod) break;
      }
      ok(prod, 'aucun article simple trouvé');
      prod.querySelector('.cp-plus').click(); await pause(100);
      egal(bq('[data-n]').textContent, '1', 'panier');
      await clic('[data-a="continuer"]', true);
      for (let k = 0; k < 6 && ecran() !== 'recap'; k++) { const non = bq('#couche [data-a="upNon"]'); if (non) non.click(); await pause(250); }
      await surEcran('recap');
      await clic('[data-a="valider"]', true); ok(vue('.nomcmd.requis'), 'le prénom n’est pas exigé');
      await saisir('[data-f="nom"]', 'Testeur'); await clic('[data-a="valider"]', true); await surEcran('ou');
      await clic('.zone-t'); if (vue('.num')) await clic('.num');
      await clic('[data-a="ouOk"]', true); await payerCarte();
      const num = numMerci(), c = SBc().etat().ventes.commandes.find(x => x.num === num);
      ok(c && c.act === 'bar' && c.etat === 'validee' && c.nom === 'Testeur', 'commande bar non validée'); FAITS.ventes.push(num); sansErreur('borne');
    });
    test('« Payer une partie » : option de l’onglet Paiement de chaque module (décochée : carte ou espèces tout de suite)', async () => {
      const MODS = ['bar', 'bowling', 'laser'], act = id => SBc().etat().config.activites.find(x => x.id === id);
      egal(MODS.map(id => SBc().api.modules.val(act(id), 'regler', 'partiel')), [true, true, true], 'réglage par défaut');
      await articleSimple(); await barJusquAuPaiement('Partiel'); await surEcran('regler');
      ok(vue('[data-a="partie"]') && /Payer une partie/.test(vue('[data-a="partie"]').textContent), '« Payer une partie » absent pour le bar');
      try {
        MODS.forEach(id => reglerModule(id, m => { m.regler = { partiel: false }; }));
        await accueil(); await articleSimple(); await barJusquAuPaiement('Direct'); await surEcran('regler');
        ok(!vue('[data-a="tout"]') && !vue('[data-a="partie"]') && vue('[data-a="moyen"][data-m="Carte"]'), 'bar : carte ou espèces pas demandés tout de suite');
        await payerCarte();
        await bowlingRecap('Les Directs'); await clic('[data-a="bwValider"]'); await surEcran('regler');
        ok(!vue('[data-a="tout"]') && !vue('[data-a="partie"]') && vue('[data-a="moyen"][data-m="Carte"]'), 'bowling : carte ou espèces pas demandés tout de suite');
        await payerCarte();
        await laserRecap('Laser direct'); await clic('[data-a="rsPayer"]'); await attendre(() => ['moyen', 'tpe', 'regler'].includes(ecran()), 4000, 'paiement');
        ok(ecran() !== 'regler', 'laser : « Tout payer / Payer une partie » encore demandé'); await payerCarte();
        FAITS.resas.push(resa('k' + numMerci()).id);
        reglerModule('laser', m => { delete m.regler; m.reservation = Object.assign({}, m.reservation, { partiel: false }); });
        egal(SBc().api.resa.config('laser').regles.partiel, false, 'l’ancien réglage (onglet Bornes) est perdu');
      } finally { MODS.forEach(id => reglerModule(id, m => { delete m.regler; if (m.reservation) delete m.reservation.partiel; })); }
      sansErreur('borne');
    }, { delai: 60000 });
    test('Tablette de piste sans monnayeur : « Espèces » met la commande de côté, payée ensuite sur une grande borne', async () => {
      await articleSimple('borne=T-01'); await barJusquAuPaiement('Cash piste'); await surEcran('regler');
      await clic('[data-a="tout"]'); await surEcran('moyen');
      ok(/grande borne/.test(vue('[data-a="moyen"][data-m="Espèces"]').textContent), 'Espèces pas proposées (ou sans explication)');
      await clic('[data-a="moyen"][data-m="Espèces"]'); await surEcran('comptoir');
      const n = +vue('.s-code').textContent.replace(/\D/g, ''); ok(/Finaliser ma commande/.test(texte()) && n, 'écran : ' + texte().slice(0, 120));
      const c = SBc().etat().ventes.commandes.find(x => x.num === n); ok(c && c.etat === 'afinaliser' && c.especes && c.lieu !== 'Borne T-01', 'commande pas mise de côté');
      await attendre(() => crm(`COMMANDES_BAR.some(x => x.num === ${n} && etatBar(x)[0] === 'Attente espèces')`), 5000, '« Attente espèces » dans le CRM');
      await accueil(); await clic('[data-a="aller"][data-e="finaliser"]'); await surEcran('finaliser');
      for (const d of String(n)) await clic(`[data-a="chiffre"][data-n="${d}"]`);
      await clic('[data-a="chercher"]'); await surEcran('retrouvee'); await clic('[data-a="aller"][data-e="regler"]'); await surEcran('regler');
      await clic('[data-a="tout"]'); await surEcran('moyen'); await clic('[data-a="moyen"][data-m="Espèces"]'); await surEcran('especes');
      for (let k = 0; k < 6 && ecran() === 'especes'; k++) { const b = vue('[data-a="piece"][data-v="20"]'); if (b) b.click(); await pause(300); }
      await surEcran('merci', 6000);
      const v = SBc().etat().ventes.commandes.find(x => x.num === n); ok(v.etat === 'validee', 'pas validée : ' + v.etat);
      ok(SBc().etat().ventes.paiements.some(t => t.cmd === n && t.moyen === 'Espèces' && t.etat === 'ok'),'paiement espèces absent');
      FAITS.ventes.push(n); sansErreur('borne'); sansErreur('crm');
    }, { delai: 45000 });
    test('Bar sur téléphone (bar/?piste=3) : la carte tout de suite, la piste déjà choisie, carte en ligne ou espèces au comptoir', async () => {
      await charger('borne', '../bar/index.html?piste=3&t=' + Date.now()); await surEcran('bar');
      ok(/Piste 3/.test(bq('.tete').textContent), 'la piste n’est pas affichée');
      await articleSimple('ici'); await clic('[data-a="continuer"]', true);
      for (let k = 0; k < 6 && ecran() !== 'recap'; k++) { const non = bq('#couche [data-a="upNon"]'); if (non) non.click(); await pause(250); }
      await surEcran('recap'); await saisir('[data-f="nom"]', 'Tel'); await clic('[data-a="valider"]', true); await surEcran('ou');
      egal((vue('.num.on') || {}).textContent, '3', 'piste 3 pas cochée'); await clic('[data-a="ouOk"]', true);
      await surEcran('regler'); await clic('[data-a="tout"]'); await surEcran('moyen');
      ok(/en ligne/i.test(vue('[data-a="moyen"][data-m="Carte"]').textContent), 'carte pas « en ligne »');
      await clic('[data-a="moyen"][data-m="Carte"]'); await surEcran('tpe'); ok(!vue('.tpe-scene'), 'terminal de borne affiché sur le téléphone');
      await clic('[data-a="simOk"]'); await surEcran('merci', 6000);
      const n = numMerci(), c = SBc().etat().ventes.commandes.find(x => x.num === n);
      egal([c.borne, c.origine, c.lieu, c.etat], ['MOBILE', 'Téléphone', 'Piste 3', 'validee'], 'commande du téléphone');
      ok(SBc().etat().ventes.paiements.some(t => t.cmd === n && t.moyen === 'En ligne' && t.etat === 'ok'), 'paiement « En ligne » absent');
      await pause(1200); egal(ecran(), 'merci', 'le téléphone ne doit pas repartir tout seul');
      await clic('[data-a="terminer"]'); await surEcran('bar'); FAITS.ventes.push(n);
      await articleSimple('ici'); await clic('[data-a="continuer"]', true);
      for (let k = 0; k < 6 && ecran() !== 'recap'; k++) { const non = bq('#couche [data-a="upNon"]'); if (non) non.click(); await pause(250); }
      await surEcran('recap'); await saisir('[data-f="nom"]', 'Tel cash'); await clic('[data-a="valider"]', true); await surEcran('ou'); await clic('[data-a="ouOk"]', true);
      await surEcran('regler'); await clic('[data-a="tout"]'); await surEcran('moyen'); await clic('[data-a="moyen"][data-m="Espèces"]'); await surEcran('comptoir');
      ok(vue('.s-code') && /Nouvelle commande/.test(texte()), 'écran espèces : ' + texte().slice(0, 100));
      sansErreur('borne');
    }, { delai: 45000 });
    test('Ticket CE au paiement du laser : un code bowling refusé, un code laser accepté ; tout couvert, la réservation est payée', async () => {
      const bowling = codeTest('bowling', 'Bowling · 1 partie', 7.5), laser = codeTest('laser', 'Laser Game · 1 partie', 500);
      await laserRecap('Groupe CE'); ok(vue('.ce-indice') && !vue('[data-f="rsCode"]'), 'récapitulatif : indice absent ou ancien encadré présent');
      await clic('[data-a="rsPayer"]', true); await versTicket();
      await scanner(bowling); await attendre(() => /seulement pour « Bowling/.test((vue('[data-ce-err]') || {}).textContent), 3000, 'refus du code bowling');
      egal(vues('.remise').length, 0, 'code bowling accepté au laser');
      await scanner(laser); await attendre(() => vues('.remise').length === 1, 3000, 'code laser accepté');
      ok(/n’est pas rendue/.test(texte()), 'avertissement : la différence n’est pas rendue');
      await clic('[data-a="ceValider"]', true); await surEcran('merci', 6000);
      ok(!SBc().api.tickets.verifier(laser, 'laser').ok && SBc().api.tickets.verifier(bowling, 'bowling').ok, 'état des codes après paiement');
      sansErreur('borne');
    });
    test('Ticket CE au bar : « Boisson offerte » acceptée, un code bowling refusé ; le client part sans payer le reste, le ticket redevient libre', async () => {
      const boisson = codeTest('bar', 'Boisson offerte', .5), bowling = codeTest('bowling', 'Bowling · 1 partie', 7.5), etat = () => SBc().etat().tickets.codes.find(c => c.code === boisson).etat;
      await articleSimple(); await barJusquAuPaiement('Ticket bar'); await versTicket();
      await scanner(bowling); await attendre(() => /seulement/.test((vue('[data-ce-err]') || {}).textContent), 3000, 'refus du code bowling au bar');
      await scanner(boisson); await attendre(() => vues('.remise').length === 1, 3000, 'boisson offerte acceptée');
      await clic('[data-a="ceValider"]', true);
      await attendre(() => etat() === 'utilisé' && ecran() === 'moyen', 6000, 'ticket consommé, reste à payer (écran : ' + ecran() + ')');
      ok(/0,50|Reste/.test(texte()) || vue('.montant'), 'reste à payer absent');
      const c = SBc().etat().ventes.commandes.filter(x => x.nom === 'Ticket bar').pop(); egal(c.remise, .5, 'remise de la commande');
      SBc().api.bar.abandonner(c.num, 'test');
      await attendre(() => etat() === 'disponible', 4000, 'ticket rendu après abandon');
      sansErreur('borne');
    });
    test('Écran de veille : l’animation du strike, puis les diapositives de cette borne, puis l’animation', async () => {
      const avant = SBc().lire('config').diffusion, img = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="9" height="16"><rect width="9" height="16" fill="red"/></svg>');
      const poser = d => SBc().modifier('config', c => { c.diffusion = d; return c; }, 'test');
      try {
        poser(Object.assign({}, avant, { animDuree: 1, veille: [{ id: 't1', type: 'image', nom: 'Test', src: img, duree: 1, sauf: [] }, { id: 't2', type: 'image', nom: 'Pas sur K-02', src: img, duree: 1, sauf: ['K-02'] }] }));
        await borne(); await surEcran('veille');
        egal(vues('.v-anim .v-scene .pin').length, 10, 'les 10 quilles'); ok(vue('.v-strike') && vue('.v-boule'), 'boule ou « Strike ! » absents');
        await attendre(() => vue('.v-diapo:last-child img.v-media[src^="data:"]'), 4000, 'l’image après l’animation');
        await attendre(() => vue('.v-diapo:last-child .v-anim'), 4000, 'retour de l’animation (« Pas sur K-02 » sautée)');
        await clic('.veille'); await surEcran('accueil');
      } finally { poser(avant); }
      sansErreur('borne');
    });
    test('Catalogue des bornes : « Finaliser » se décoche ; un seul module sans Finaliser : la veille ouvre directement le module', async () => {
      const avant = SBc().lire('config').vend['T-02'].slice(), vend = L => SBc().modifier('config', c => { c.vend['T-02'] = L; return c; }, 'test');
      ok(avant.includes('finaliser'), '« Finaliser » pas coché par défaut');
      try {
        vend(['bar']); await borne('borne=T-02'); await surEcran('veille'); await clic('.veille'); await surEcran('bar');
        vend(['bar', 'finaliser']); await borne('borne=T-02'); await surEcran('veille'); await clic('.veille'); await surEcran('accueil');
        ok(vue('[data-e="finaliser"]'), '« Finaliser ma commande » absent');
        vend(['bowling', 'bar']); await borne('borne=T-02'); await surEcran('veille'); await clic('.veille'); await surEcran('accueil');
        ok(!vue('[data-e="finaliser"]'), '« Finaliser ma commande » décoché mais affiché');
      } finally { vend(avant); }
      sansErreur('borne');
    });
    test('Finaliser : un numéro inconnu est refusé', async () => {
      await accueil(); await clic('[data-a="aller"][data-e="finaliser"]'); await surEcran('finaliser');
      for (const n of '987654') await clic(`[data-a="chiffre"][data-n="${n}"]`);
      await clic('[data-a="chercher"]'); ok(vue('[data-err]').textContent.trim(), 'pas de message'); egal(ecran(), 'finaliser'); sansErreur('borne');
    });
    test('Styles de page : la classe st-N suit le réglage du CRM', async () => {
      reglerModule('laser', m => { m['rs-formule'] = Object.assign({}, m['rs-formule'], { style: '3' }); });
      await borne('borne=K-02&apercu=laser&page=rs-formule'); await surEcran('rs-formule');
      ok(bq('#ecran .vue:last-child').classList.contains('st-3'), 'style 3 non appliqué');
      reglerModule('laser', m => { delete m['rs-formule'].style; });
      await borne('borne=K-02&apercu=laser&page=rs-formule'); await surEcran('rs-formule');
      ok(!/st-\d/.test(bq('#ecran .vue:last-child').className), 'style resté après retour au style 1'); sansErreur('borne');
    });
    test('Après minuit, la borne affiche 00:00 (et non 24:00)', async () => {
      const SB = SBc(), j = jourAvec('laser'), f = SB.api.resa.config('laser').formules[0].nom, id = 'laser-' + j + '-1440';
      SB.modifier('creneaux', C0 => { C0.laser = (C0.laser || []).concat([{ id, act: 'laser', j, h: '24:00', fin: '24:30', formules: [{ nom: f, places: 2, pris: 0 }], canaux: ['web', 'borne', 'comptoir'], ouvert: true }]); return C0; }, 'test');
      try {
        ok(heuresBorne('laser', f, 2, j).includes('24:00'), 'créneau de minuit pas proposé');
        await accueil(); await clic('[data-a="module"][data-act="laser"]'); await surEcran('rs-formule'); await clic(`.an-f[data-f="${CSS.escape(f)}"]`);
        await surEcran('rs-nombre'); await clic('[data-a="rsSuite"][data-e="rs-nombre"]'); await surEcran('rs-date');
        for (let k = 0; k < 4 && !vue(`.an-j.dispo[data-j="${j}"]`); k++) await clic('[data-a="rsMois"][data-d="1"]');
        await clic(`.an-j.dispo[data-j="${j}"]`); const h = await attendre(() => vue('.an-h[data-h="24:00"]'), 4000, 'heure de minuit');
        egal(h.querySelector('b').textContent, '00:00', 'heure affichée'); ok(!/24:00/.test(texte()), '« 24:00 » affiché');
        h.click(); await pause(60); await clic('[data-a="rsSuite"][data-e="rs-date"]'); await surEcran('rs-infos'); await saisir('[data-f="rsGroupe"]', 'Minuit');
        await clic('[data-a="rsSuite"][data-e="rs-infos"]'); await surEcran('rs-recap'); ok(/00:00/.test(texte()) && !/24:00/.test(texte()), 'récapitulatif : ' + texte().slice(0, 120));
        sansErreur('borne');
      } finally { SB.modifier('creneaux', C0 => { C0.laser = C0.laser.filter(x => x.id !== id); return C0; }, 'test'); }
    });
    test('Payer une partie au bowling, puis le reste', async () => {
      await bowlingRecap('Les Partiels'); await clic('[data-a="bwValider"]'); await surEcran('regler');
      await clic('[data-a="partie"]'); await surEcran('partie'); await clic('[data-a="ps"][data-d="1"]'); await clic('[data-a="partieOk"]', true);
      await attendre(() => ['moyen', 'tpe'].includes(ecran())); if (ecran() === 'moyen') await clic('[data-a="moyen"][data-m="Carte"]');
      await surEcran('tpe'); await clic('[data-a="simOk"]'); await surEcran('regler', 6000); ok(/Déjà réglé/.test(texte()), 'pas de « Déjà réglé »');
      await payerCarte();
      const c = SBc().etat().ventes.commandes.filter(x => x.nom === 'Les Partiels').pop(); ok(c && c.etat === 'validee', 'commande non validée');
      egal(SBc().etat().ventes.paiements.filter(t => t.cmd === c.num && t.etat === 'ok').length, 2, 'deux paiements'); sansErreur('borne');
    }, { delai: 45000 });
    test('Espèces : la monnaie est rendue', async () => {
      await articleSimple(); await barJusquAuPaiement('Espèces test');
      await attendre(() => ['regler', 'moyen'].includes(ecran())); if (ecran() === 'regler') await clic('[data-a="tout"]');
      await surEcran('moyen'); await clic('[data-a="moyen"][data-m="Espèces"]'); await surEcran('especes'); await clic('[data-a="piece"][data-v="20"]');
      await surEcran('merci', 6000); ok(vue('.m-rendu') && /monnaie/i.test(vue('.m-rendu').textContent), 'pas de monnaie rendue affichée'); sansErreur('borne');
    });
    test('Paiement refusé, puis accepté par carte', async () => {
      await articleSimple(); await barJusquAuPaiement('Refus test');
      await attendre(() => ['regler', 'moyen'].includes(ecran())); if (ecran() === 'regler') await clic('[data-a="tout"]');
      if (ecran() === 'moyen') await clic('[data-a="moyen"][data-m="Carte"]'); await surEcran('tpe'); await clic('[data-a="simKo"]'); await surEcran('refuse');
      await clic('[data-a="moyen"][data-m="Carte"]'); await surEcran('tpe'); await clic('[data-a="simOk"]'); await surEcran('merci', 6000);
      const c = SBc().etat().ventes.commandes.filter(x => x.nom === 'Refus test').pop(); ok(c && c.etat === 'validee', 'commande non validée');
      ok(SBc().etat().ventes.paiements.some(t => t.cmd === c.num && t.etat === 'refusée'), 'refus pas enregistré'); sansErreur('borne');
    });
    test('Retour depuis le paiement : la place gardée est rendue', async () => {
      await laserRecap('Retour test'); await clic('[data-a="rsPayer"]');
      const r = await attendre(() => SBc().etat().reservations.find(x => x.titre === 'Retour test'), 4000, 'place gardée');
      await attendre(() => vue('[data-a="rsRevenir"]'), 4000, 'bouton Retour'); await clic('[data-a="rsRevenir"]'); await surEcran('rs-recap');
      await attendre(() => !SBc().etat().reservations.some(x => x.id === r.id), 4000, 'place rendue'); sansErreur('borne');
    });
    test('Finaliser une réservation web : prénoms, barrières et acompte repris, le reste payé', async () => {
      if (!FAITS.web) return;
      await accueil(); await clic('[data-a="aller"][data-e="finaliser"]'); await surEcran('finaliser');
      for (const n of String(FAITS.web)) await clic(`[data-a="chiffre"][data-n="${n}"]`);
      await clic('[data-a="chercher"]'); await surEcran('bw-recap');
      ok(/Les Web/.test(texte()) && /Ana/.test(texte()) && /barrières/i.test(texte()) && /Acompte payé en ligne/.test(texte()), 'récapitulatif : ' + texte().slice(0, 120));
      await clic('[data-a="bwValider"]'); await payerCarte();
      const r = SBc().etat().reservations.find(x => x.num === FAITS.web); egal(r.paye, r.total, 'réservation soldée'); sansErreur('borne');
    });
    test('Sans réseau : commande gardée sur la borne, finalisée au retour du réseau', async () => {
      await articleSimple(); await barJusquAuPaiement('Hors ligne', async () => { reseau(); await pause(60); });
      await surEcran('sauvee'); const num = +vue('.s-code').textContent.replace(/\D/g, ''); ok(/^9\d{5}$/.test(String(num)), 'numéro hors ligne : ' + num);
      reseau(); await attendre(() => (SBc().etat().ventes.commandes.find(c => c.num === num) || {}).etat === 'afinaliser', 6000, 'commande partie au retour du réseau');
      await accueil(); await clic('[data-a="aller"][data-e="finaliser"]'); await surEcran('finaliser');
      for (const n of String(num)) await clic(`[data-a="chiffre"][data-n="${n}"]`);
      await clic('[data-a="chercher"]'); await surEcran('retrouvee'); await clic('[data-a="aller"][data-e="regler"]', true); await payerCarte();
      egal(SBc().etat().ventes.commandes.find(c => c.num === num).etat, 'validee', 'commande payée'); sansErreur('borne');
    }, { delai: 45000 });
    test('Ticket CE au bowling : « Payer une partie », un joueur payé par ticket, le reste à la carte', async () => {
      if (!FAITS.codeCE) return;
      await bowlingRecap('Les CE'); ok(vue('.ce-indice') && !vue('[data-f="code"]'), 'récapitulatif : indice absent ou ancien encadré présent');
      await clic('[data-a="bwValider"]'); await surEcran('regler');
      await clic('[data-a="partie"]'); await surEcran('partie'); await clic('[data-a="ps"][data-d="1"]'); await clic('[data-a="partieOk"]', true);
      await surEcran('moyen'); egal(vues('.gchoix').map(b => b.dataset.m), ['Carte', 'Espèces', 'Ticket CE'], 'moyens de paiement');
      await clic('[data-a="moyen"][data-m="Ticket CE"]'); await surEcran('ticket');
      await scanner(FAITS.codeCE); await attendre(() => vues('.remise').length === 1, 3000, 'ticket accepté');
      await clic('[data-a="ceValider"]', true); await finirCarte();
      const c = SBc().etat().ventes.commandes.filter(x => x.nom === 'Les CE').pop();
      ok(c && c.etat === 'validee' && c.remise > 0 && c.remise <= 7.5 && (c.remises || []).some(r => r.code === FAITS.codeCE), 'commande : ' + JSON.stringify(c && { etat: c.etat, remise: c.remise }));
      egal(Math.round((c.paye + c.remise) * 100) / 100, c.total, 'tickets + carte = total');
      ok(c.bot && c.bot.contexte.ticketsCE.includes(FAITS.codeCE), 'ticket absent de l’envoi au bot');
      ok(!SBc().api.tickets.verifier(FAITS.codeCE, 'bowling').ok, 'code encore valable'); sansErreur('borne');
    }, { delai: 45000 });
    test('Bar : option obligatoire, puis « J’ai plus de 18 ans » pour l’alcool', async () => {
      const cat = SBc().api.bar.catalogue('K-02'), dispo = x => x.servi !== false;
      const opt = cat.produits.find(x => dispo(x) && !x.alcool && (x.options || []).some(g => g.obligatoire)), alc = cat.produits.find(x => dispo(x) && x.alcool && !(x.options || []).length);
      ok(opt && alc, 'pas d’article à option obligatoire ou d’alcool disponible maintenant');
      const ouvrir = async x => { await clic(`.rail [data-a="rub"][data-c="${CSS.escape(x.cat)}"]`); if (x.sous) await clic(`[data-a="sous"][data-s="${CSS.escape(x.sous)}"]`); };
      await accueil(); await clic('[data-a="module"][data-act="bar"]'); await surEcran('bar'); await clic('.carte-c[data-a="rub"]');
      await ouvrir(opt); await clic(`.carte-p[data-id="${opt.id}"]`);
      const aj = await attendre(() => bq('#couche [data-a="ajouter"]'), 4000, 'fiche de l’article'); ok(aj.disabled || /choisi/i.test(bq('#couche').textContent), 'ajout possible sans choisir');
      aj.click(); await pause(80); egal(bq('[data-n]').textContent, '', 'ajouté sans l’option obligatoire');
      bq('#couche [data-a="opt"][data-g="0"][data-c="0"]').click(); await pause(80); bq('#couche [data-a="ajouter"]').click(); await pause(150);
      egal(bq('[data-n]').textContent, '1', 'article à option dans le panier');
      await ouvrir(alc); await clic(`.cp-plus[data-id="${alc.id}"]`); await attendre(() => bq('[data-n]').textContent === '2', 4000, 'alcool dans le panier');
      await clic('[data-a="continuer"]', true);
      for (let k = 0; k < 6 && ecran() !== 'recap'; k++) { const non = bq('#couche [data-a="upNon"]'); if (non) non.click(); await pause(250); }
      await surEcran('recap'); await saisir('[data-f="nom"]', 'Majeur'); await clic('[data-a="valider"]', true); egal(ecran(), 'recap', 'commande d’alcool sans « J’ai plus de 18 ans »');
      await clic('[data-a="majeur"]', true); await clic('[data-a="valider"]', true); await surEcran('ou'); sansErreur('borne');
    }, { delai: 45000 });
    test('Bar : un article qui n’est plus servi à cette heure est grisé et retiré du panier', async () => {
      const hh = n => String((new Date().getHours() + n + 24) % 24).padStart(2, '0') + ':00';
      await accueil(); await clic('[data-a="module"][data-act="bar"]'); await surEcran('bar'); await clic('.carte-c[data-a="rub"]');
      const cat = () => SBc().api.bar.catalogue('K-02').produits;
      let P = null;
      for (const c of vues('.rail [data-a="rub"]').map(b => b.dataset.c)) {
        vue(`.rail [data-a="rub"][data-c="${CSS.escape(c)}"]`).click(); await pause(150);
        if ((P = vues('.carte-p:not(.off) .cp-plus').map(x => cat().find(p => p.id === x.dataset.id)).find(p => p && !p.alcool && !(p.options || []).length))) break;
      }
      ok(P, 'aucun article simple');
      await clic(`.cp-plus[data-id="${P.id}"]`); await attendre(() => bq('[data-n]').textContent === '1', 4000, 'article dans le panier');
      crm(`(() => { HORAIRES_BAR.push({ id: 'htest', si: 'p:${P.id}', jours: [0, 1, 2, 3, 4, 5, 6], de: '${hh(2)}', a: '${hh(3)}', actif: true }); window.__sbxCRM.sauver(); })()`);
      try {
        await attendre(() => /Plus servi à cette heure/.test((bq('#couche') || {}).textContent || ''), 5000, 'message « plus servi »');
        egal(bq('[data-n]').textContent, '', 'article encore dans le panier');
        ok(vues('.carte-p.off').some(x => x.textContent.includes(P.nom) && /dès|plus servi/.test(x.textContent)), 'article pas grisé');
      } finally { crm(`(() => { HORAIRES_BAR.splice(HORAIRES_BAR.findIndex(h => h.id === 'htest'), 1); window.__sbxCRM.sauver(); })()`); }
      await attendre(() => cat().find(p => p.id === P.id).servi, 4000, 'règle de test retirée'); sansErreur('borne');
    });
    test('Nouvelle activité créée dans le CRM : réservable de bout en bout sur la borne', async () => {
      const id = crm(`(CENTRE.activites.find(a => a.nom === 'Escape test') || {}).id`); ok(id, 'activité de test absente (suite CRM)');
      crm(`(() => { const a = actById('${id}'); a.visible = true; const b = DIFFUSION.boutons.find(x => x.act === a.id); if (b) b.visible = true; window.__sbxCRM.sauver(); })()`);
      await attendre(() => SBc().api.bornes.config('K-02').modules.some(m => m.act === id), 4000, 'tuile sur K-02');
      await accueil(); ok(/Réserver/.test(vue(`[data-a="module"][data-act="${id}"]`).textContent), 'tuile pas prête');
      await clic(`[data-a="module"][data-act="${id}"]`);
      for (let k = 0; k < 4 && ecran() !== 'rs-date'; k++) { await attendre(() => /^rs-/.test(ecran())); if (ecran() === 'rs-formule') await clic('.an-f'); else if (ecran() === 'rs-nombre') await clic('[data-a="rsSuite"][data-e="rs-nombre"]'); await pause(200); }
      await surEcran('rs-date'); for (let k = 0; k < 6 && !vue('.an-j.dispo'); k++) await clic('[data-a="rsMois"][data-d="1"]');
      await clic('.an-j.dispo'); await clic('.an-h'); await clic('[data-a="rsSuite"][data-e="rs-date"]'); await surEcran('rs-infos');
      await saisir('[data-f="rsGroupe"]', 'Les Évadés'); await clic('[data-a="rsSuite"][data-e="rs-infos"]'); await surEcran('rs-recap');
      await clic('[data-a="rsPayer"]'); await payerCarte();
      const r = resa('k' + numMerci()); ok(r && r.act === id, 'réservation absente'); const a = SBc().etat().config.activites.find(x => x.id === id);
      egal(r.blocs[0].r, a.ressources[2].id, 'placée dans la seule salle ouverte par le template (salle 3)'); FAITS.resas.push(r.id); sansErreur('borne');
    }, { delai: 45000 });
    test('Escape game : le client choisit sa salle, ne voit que ses heures, la réservation est dans cette salle', async () => {
      const id = crm(`(CENTRE.activites.find(a => a.nom === 'Escape test') || {}).id`); ok(id, 'activité de test absente');
      await action('choixRess', { pre: id, v: '1' }); await attendre(() => SBc().api.resa.config(id).choixSalle, 4000, 'réglage');
      const S3 = SBc().api.resa.config(id).salles[2];
      try {
        await accueil(); await clic(`[data-a="module"][data-act="${id}"]`); await surEcran('rs-salle');
        egal(vues('[data-a="rsSalle"]').length, 3, 'une carte par salle'); ok(/Jusqu’à 8 pers\./.test(texte()), 'capacité sur les cartes');
        await clic(`[data-a="rsSalle"][data-s="${vues('[data-a="rsSalle"]')[0].dataset.s}"]`);
        for (let k = 0; k < 4 && ecran() !== 'rs-date'; k++) { await attendre(() => /^rs-/.test(ecran())); if (ecran() === 'rs-formule') await clic('.an-f'); else if (ecran() === 'rs-nombre') await clic('[data-a="rsSuite"][data-e="rs-nombre"]'); await pause(150); }
        await surEcran('rs-date'); ok(vue('.an-vide') && !vue('.an-j.dispo'), 'la salle 1 (fermée par le template) propose des heures');
        await clic('[data-a="rsPrec"][data-e="rs-date"]'); for (let k = 0; k < 4 && ecran() !== 'rs-salle'; k++) { if (vue('[data-a="rsPrec"]')) await clic('[data-a="rsPrec"]'); await pause(150); }
        await surEcran('rs-salle'); await clic(`[data-a="rsSalle"][data-s="${S3.id}"]`);
        for (let k = 0; k < 4 && ecran() !== 'rs-date'; k++) { await attendre(() => /^rs-/.test(ecran())); if (ecran() === 'rs-formule') await clic('.an-f'); else if (ecran() === 'rs-nombre') await clic('[data-a="rsSuite"][data-e="rs-nombre"]'); await pause(150); }
        await surEcran('rs-date'); for (let k = 0; k < 6 && !vue('.an-j.dispo'); k++) await clic('[data-a="rsMois"][data-d="1"]');
        await clic('.an-j.dispo'); await clic('.an-h'); await clic('[data-a="rsSuite"][data-e="rs-date"]'); await surEcran('rs-infos');
        await saisir('[data-f="rsGroupe"]', 'Les Fantômes'); await clic('[data-a="rsSuite"][data-e="rs-infos"]'); await surEcran('rs-recap');
        ok(texte().includes(S3.nom), 'salle absente du récapitulatif');
        await clic('[data-a="rsPayer"]'); await payerCarte();
        const r = resa('k' + numMerci()); ok(r, 'réservation absente'); egal(r.blocs[0].r, S3.id, 'réservation dans la salle choisie'); FAITS.resas.push(r.id);
        sansErreur('borne');
      } finally { await action('choixRess', { pre: id, v: '0' }); }
    }, { delai: 60000 });
    test('Escape game : une formule, une durée et un prix par salle', async () => {
      const id = crm(`(CENTRE.activites.find(a => a.nom === 'Escape test') || {}).id`); ok(id, 'activité de test absente');
      const R = crm(`actById('${id}').ressources.map(x => x.id)`), j = crm('AUJ') + 13;
      crm(`(() => { PRIX['${id}'] = [{ nom: 'Le Manoir', unite: 'par joueur', duree: 60, couleur: '#7c3aed', salles: ['${R[0]}'], regles: [{ jours: 'tous', prix: 28 }] }, { nom: 'La Station', unite: 'par joueur', duree: 75, couleur: '#0ea5e9', salles: ['${R[2]}'], regles: [{ jours: 'tous', prix: 32 }] }]; actById('${id}').choixRessource = true; window.__sbxCRM.sauver(); })()`);
      await action('ouvrir', { id, o: 'tarifs' }); const puce = (fi, x) => cq(`[data-a="pxSalle"][data-pre="${id}"][data-fi="${fi}"][data-id="${x}"]`);
      ok(puce(1, R[2]).classList.contains('on') && !puce(1, '').classList.contains('on'), 'salle de la formule absente de sa ligne');
      await action('pxSalle', { pre: id, fi: '0', id: R[2] }); egal(crm(`PRIX['${id}'][0].salles`), [R[0], R[2]], 'deux salles sur trois');
      await action('pxSalle', { pre: id, fi: '0', id: R[1] }); ok(!crm(`PRIX['${id}'][0].salles`), 'les trois cochées : « Toutes »');
      await action('pxSalle', { pre: id, fi: '0', id: R[0] }); egal(crm(`PRIX['${id}'][0].salles`), [R[0]], 'depuis « Toutes », une salle cochée');
      await action('versTpl', { id }); await action('tplNouv'); const idTpl = crm('tplCourant().id');
      crm(`(() => { const t = tplCourant(); t.pas = 60; t.regles = [{ formules: ['Le Manoir', 'La Station'], jours: [0, 1, 2, 3, 4, 5, 6], de: '14:00', a: '17:00' }]; S.gen.du = S.gen.au = SB.temps.isoDeJour(${j}); })()`);
      await action('tplVersGen'); await action('genererSlots'); await attendre(() => SBc().moteur.slotsJour(SBc().etat(), id, j).length === 4, 4000, 'créneaux générés');
      try {
        await accueil(); await clic(`[data-a="module"][data-act="${id}"]`); await surEcran('rs-salle');
        const carte = x => vue(`[data-a="rsSalle"][data-s="${x}"]`).textContent;
        ok(/1h/.test(carte(R[0])) && /28/.test(carte(R[0])), 'carte du Manoir : ' + carte(R[0])); ok(/1h15/.test(carte(R[2])) && /32/.test(carte(R[2])), 'carte de la Station : ' + carte(R[2]));
        await clic(`[data-a="rsSalle"][data-s="${R[2]}"]`);
        await surEcran('rs-formule'); egal(vues('.an-f').length, 1, 'seule la formule de cette salle (la page s’affiche même pour une formule)'); await clic('.an-f');
        await attendre(() => ['rs-nombre', 'rs-date'].includes(ecran()), 4000, 'après la formule'); if (ecran() === 'rs-nombre') await clic('[data-a="rsSuite"][data-e="rs-nombre"]');
        await surEcran('rs-date'); for (let k = 0; k < 4 && !vue(`.an-j.dispo[data-j="${j}"]`); k++) await clic('[data-a="rsMois"][data-d="1"]');
        await clic(`.an-j.dispo[data-j="${j}"]`); const h = await clic('.an-h'); ok(/32/.test(h.textContent), 'prix de la Station sur l’heure : ' + h.textContent);
        await clic('[data-a="rsSuite"][data-e="rs-date"]'); await surEcran('rs-infos'); await saisir('[data-f="rsGroupe"]', 'Les Astronautes');
        await clic('[data-a="rsSuite"][data-e="rs-infos"]'); await surEcran('rs-recap'); ok(/La Station/.test(texte()), 'formule absente du récapitulatif');
        await clic('[data-a="rsPayer"]'); await payerCarte();
        const r = resa('k' + numMerci()); ok(r, 'réservation absente');
        egal([r.formule, r.blocs[0].r, r.duree, r.total], ['La Station', R[2], 75, 32 * r.pers], 'formule, salle, durée, prix'); FAITS.resas.push(r.id);
        sansErreur('borne');
      } finally { crm(`(() => { actById('${id}').choixRessource = false; window.__sbxCRM.sauver(); })()`); await action('tplSel', { id: idTpl }); await action('tplSup'); }
    }, { delai: 60000 });
    test('Styles 2 et 3 : toutes les pages de tous les modules s’affichent', async () => {
      const M = SBc().api.modules;
      for (const a of SBc().etat().config.activites.filter(x => M.type(x))) {
        const pages = M.schema(a).filter(sec => sec.champs[0] && sec.champs[0].type === 'style').map(sec => sec.id);
        for (const st of ['2', '3']) {
          reglerModule(a.id, m => pages.forEach(p2 => { m[p2] = Object.assign({}, m[p2], { style: st }); }));
          await borne('borne=K-02&apercu=' + a.id + '&page=' + pages[0]);
          for (const p2 of pages) {
            const page = (M.schema(a).find(sec => sec.id === p2) || {}).apercu || p2;
            B().postMessage({ apercu: page }, location.origin);
            await attendre(() => ecran() === page && vue('*'), 4000, a.id + ' › ' + page + ' (style ' + st + ')');
            if (page === p2) ok(bq('#ecran .vue:last-child').classList.contains('st-' + st), a.id + ' › ' + page + ' sans la classe st-' + st);
            sansErreur('borne');
          }
        }
        reglerModule(a.id, m => pages.forEach(p2 => { if (m[p2]) delete m[p2].style; }));
      }
    }, { delai: 120000 });
    test('Aperçu : chaque page de chaque module s’affiche', async () => {
      const M = SBc().api.modules;
      for (const a of SBc().etat().config.activites.filter(x => M.type(x))) {
        const pages = [...new Set(M.schema(a).map(s => s.apercu).filter(Boolean))];
        await borne('borne=K-02&apercu=' + a.id + '&page=' + pages[0]);
        for (const p of pages) {
          B().postMessage({ apercu: p }, location.origin);
          await attendre(() => ecran() === p && vue('*'), 4000, a.id + ' › ' + p);
          sansErreur('borne');
        }
      }
    }, { delai: 90000 });
  });

  /* =====================================================================
     SUITE 4 — SYNCHRONISATION CRM ⇄ BORNE
     ===================================================================== */
  suite('Synchronisation', () => {
    test('Les réservations faites sur la borne arrivent dans le CRM', async () => {
      const ids = FAITS.resas; ok(ids.length, 'aucune réservation faite sur la borne (lancer aussi la suite Borne)');
      await attendre(() => ids.every(id => crm('CENTRE.reservations').some(r => r.id === id)), 6000, 'réservations dans le CRM');
      sansErreur('crm');
    });
    test('Une réservation prise ailleurs (comptoir) arrive dans le CRM, et sa suppression aussi', async () => {
      if (!B().SB) await borne();
      const SBb = B().SB, j = jourAvec('karaoke'), s0 = SBb.moteur.slotsJour(SBb.etat(), 'karaoke', j)[0];
      const r = SBb.api.reservations.creer({ act: 'karaoke', j, h: s0.h, formule: SBb.api.resa.config('karaoke').formules[0].nom, pers: 4, client: 'Comptoir sync' }, 'front');
      ok(r.ok, r.raison); await attendre(() => crm('CENTRE.reservations').some(x => x.id === r.resa.id), 6000, 'réservation dans le CRM');
      SBb.api.reservations.supprimer(r.resa.id, 'front'); await attendre(() => !crm('CENTRE.reservations').some(x => x.id === r.resa.id), 6000, 'suppression dans le CRM');
      sansErreur('crm');
    });
    test('Une salle fermée ailleurs apparaît fermée dans la grille du CRM', async () => {
      if (!B().SB) await borne();
      const SBb = B().SB, j = jourAvec('quiz'), aq = SBb.etat().config.activites.find(a => a.id === 'quiz'), x = aq.ressources[0], s0 = SBb.moteur.slotsJour(SBb.etat(), 'quiz', j).find(y => SBb.moteur.peutPlacer(SBb.etat(), aq, x, j, SBb.outils.mn(y.h), SBb.outils.mn(y.h) + 60, 0).ok), m = SBb.outils.mn(s0.h);   // une heure où la salle est libre
      const b = SBb.api.bloquer({ r: x.id, j, s: m, e: m + 60, motif: 'sync' }, 'front').blocage;
      await attendre(() => crm('BLOCAGES').some(y => y.id === b.id), 6000, 'fermeture dans le CRM');
      await action('ouvrir', { id: 'quiz', o: 'creneaux' }); await action('slotNav', { abs: j }); ok(cq(`.gs-x[data-id="${b.id}"]`), 'case « fermée » absente de la grille');
      SBb.api.debloquer(b.id, 'front'); await attendre(() => !crm('BLOCAGES').some(y => y.id === b.id), 6000, 'réouverture dans le CRM'); sansErreur('crm');
    });
    test('Les ventes de la borne arrivent dans les transactions du CRM', async () => {
      const nums = FAITS.ventes; ok(nums.length, 'aucune vente faite sur la borne (lancer aussi la suite Borne)');
      await action('aller', { e: 'transactions' });
      await attendre(() => nums.every(n => C().document.getElementById('app').textContent.includes(String(n))), 6000, 'transactions dans le CRM');
      sansErreur('crm');
    });
  });

  /* =====================================================================
     SUITE — SITE DE RÉSERVATION WEB (resa/) : les vrais écrans du site, dans un troisième cadre
     ===================================================================== */
  const Wsite = () => cadre('site').contentWindow;
  const sq = s => Wsite().document.querySelector(s);
  const sqa = s => [...Wsite().document.querySelectorAll(s)];
  const etatSite = () => Wsite().__resa.S;
  /* une adresse neuve à chaque fois (?t=) : le cadre se recharge vraiment, même quand seul le #… change */
  async function site(hash = '') { await charger('site', '../resa/index.html?t=' + Date.now() + hash); await attendre(() => Wsite().__resa && sq('.haut'), 6000, 'démarrage du site'); }
  const surEtape = e => attendre(() => etatSite().route === 'parcours' && etatSite().etape === e && sq('.e-' + e), 6000, 'étape « ' + e + ' » du site (actuelle : ' + (Wsite().__resa ? etatSite().route + ' ' + (etatSite().etape || '') : '?') + ')');
  const surVue = v => attendre(() => etatSite().route === v && sq('#app'), 6000, 'page « ' + v + ' » du site (actuelle : ' + etatSite().route + ')');
  async function clicS(sel) { const el = await attendre(() => { const x = sq(sel); return x && !x.disabled && x; }, 5000, 'site : ' + sel + ' (page ' + etatSite().route + ' ' + (etatSite().etape || '') + ')'); el.click(); await pause(60); return el; }
  async function saisirS(sel, v) { const el = await attendre(() => sq(sel), 5000, 'site : champ ' + sel); el.value = v; el.dispatchEvent(new (Wsite().Event)('input', { bubbles: true })); await pause(20); return el; }
  const suivantS = () => clicS('.panneau [data-a="suivant"]');
  async function compteSite(nom, email, tel, mdp) {
    await clicS('[data-a="onglet"][data-o="creer"]');
    const f = sq('[data-form="creer"]'); ok(f, 'formulaire de création de compte absent');
    Object.entries({ nom, email, tel, mdp }).forEach(([k, v]) => { f.elements[k].value = v; });
    f.requestSubmit(); await pause(80);
  }
  const resaNum = n => (SBc().etat().reservations || []).find(r => r.num === n);
  const reglerWeb = (act, web) => reglerModule(act, m => { m.web = Object.assign({}, m.web, web); });

  suite('Site web', () => {
    test('Le site montre les activités cochées « Site web » et visibles, avec leur prochaine place libre', async () => {
      const attendu = SBc().api.web.config().activites.map(m => m.act);
      ['bowling', 'laser', 'karaoke', 'quiz', 'anniv'].forEach(id => ok(attendu.includes(id), 'pas sur le site : ' + id));
      ok(!attendu.includes('billard') && !attendu.includes('bar'), 'billard ou bar vendus en ligne');
      await site(); await surVue('accueil');
      egal(sqa('.act').map(a => a.dataset.act), attendu, 'tuiles du site');
      ok(sqa('.act .act-dispo').length === attendu.length, 'disponibilité absente sur une tuile');
      ok(sq('.scene .boule-r') && sq('.planete'), 'décor de l’accueil absent');
      SBc().modifier('config', c => { c.activites.find(a => a.id === 'quiz').visible = false; return c; }, 'test');
      await attendre(() => !sq('.act[data-act="quiz"]'), 5000, 'le quiz masqué reste sur le site');
      SBc().modifier('config', c => { c.activites.find(a => a.id === 'quiz').visible = true; return c; }, 'test');
      await attendre(() => sq('.act[data-act="quiz"]'), 5000, 'le quiz ne revient pas'); sansErreur('site');
    });
    test('Règles du site : vides = celles des bornes, paiement « rien en ligne » par défaut, délai propre au site', () => {
      const SB = SBc(), anniv = SB.api.resa.config('anniv', 'web').regles;
      egal([anniv.delai, anniv.horizon, anniv.paiement, anniv.acompte], [72, +SB.api.modules.val(SB.etat().config.activites.find(a => a.id === 'anniv'), 'reservation', 'horizon'), 'acompte', 50], 'anniversaire en ligne : acompte de 50 €');
      egal(SB.api.resa.config('laser', 'web').regles.paiement, 'aucun', 'laser : rien en ligne par défaut');
      egal(SB.api.resa.config('anniv').regles.paiement, 'acompte', 'la borne garde son acompte');
      egal(SB.api.resa.config('bowling', 'web').etapes, ['rs-date', 'bw-formule', 'bw-joueurs', 'rs-recap'], 'pages du bowling en ligne (le jour d’abord)');
      egal(SB.api.resa.config('laser', 'web').etapes, ['rs-formule', 'rs-nombre', 'rs-date', 'rs-infos', 'rs-recap'], 'laser : la formule d’abord par défaut');
      reglerWeb('laser', { delai: 5 });
      const now = SB.temps.maintenant(), f = SB.api.resa.config('laser').formules[0].nom;
      SB.api.resa.creneaux('laser', f, 2, null, 'web').forEach(x => x.heures.forEach(h => ok((x.j - now.j) * 1440 + SB.outils.mn(h.h) - now.min >= 5 * 60, 'heure trop proche en ligne : ' + x.iso + ' ' + h.h)));
      reglerWeb('laser', { delai: null });
    });
    test('Comptes clients : création, doublon refusé, connexion, compte désactivé', () => {
      const C = SBc().api.clients;
      ok(!C.creer({ nom: 'A', email: 'pas-un-mail', tel: '0612345678', mdp: 'secret1' }, 'test').ok, 'e-mail invalide accepté');
      ok(!C.creer({ nom: 'A', email: 'a@b.fr', tel: '06', mdp: 'secret1' }, 'test').ok, 'téléphone invalide accepté');
      const r = C.creer({ nom: 'Ana Test', email: 'Ana@Test.fr', tel: '06 12 34 56 78', mdp: 'secret1' }, 'test'); ok(r.ok, r.raison);
      egal(r.client.email, 'ana@test.fr', 'e-mail rangé en minuscules');
      ok(!C.creer({ nom: 'Autre', email: 'ana@test.fr', tel: '0612345678', mdp: 'secret1' }, 'test').ok, 'doublon accepté');
      ok(!C.connecter('ana@test.fr', 'mauvais', 'test').ok, 'mauvais mot de passe accepté');
      ok(C.connecter('ANA@test.fr', 'secret1', 'test').ok, 'connexion refusée');
      C.modifier(r.client.id, { actif: false }, 'test'); ok(!C.connecter('ana@test.fr', 'secret1', 'test').ok, 'compte désactivé accepté');
      C.modifier(r.client.id, { actif: true }, 'test'); FAITS.client = r.client.id;
    });
    test('Laser de bout en bout : formule, joueurs, jour, compte créé, réservation « Site web » sans paiement en ligne', async () => {
      const SB = SBc(), f = SB.api.resa.config('laser', 'web').formules[0].nom;
      ok(SB.api.resa.creneaux('laser', f, 2, null, 'web').some(x => x.heures.length), 'aucune heure laser en ligne');
      await site(); await clicS('.act[data-act="laser"]'); await surEtape('rs-formule');
      await clicS('.an-f'); await surEtape('rs-nombre'); ok(/1 partie|parties/i.test(sq('.panneau').textContent), 'formule absente du récapitulatif');
      await clicS('[data-a="nb"][data-d="1"]'); egal(etatSite().rs.nb, 3, 'compteur');
      await suivantS(); await surEtape('rs-date');
      ok(sq('.panneau [data-a="suivant"]').disabled, 'Continuer actif sans heure');
      await clicS('.an-j.dispo'); await clicS('.an-h'); const h = etatSite().rs.h, j = etatSite().rs.j;
      ok(!sq('.panneau [data-a="suivant"]').disabled, 'Continuer inactif avec une heure'); await suivantS(); await surEtape('rs-infos');
      await saisirS('[data-f="groupe"]', 'Les Comètes');
      await suivantS(); ok(sq('[data-champ="compte"].err'), 'pas de compte : Continuer devrait demander de se connecter');
      await compteSite('Léo Web', 'leo@web.fr', '0611223344', 'motdepasse');
      await attendre(() => sq('.moi'), 4000, 'compte créé et connecté'); ok(/Léo/.test(sq('.nav .compte').textContent), 'prénom dans l’en-tête');
      await suivantS(); await surEtape('rs-recap');
      ok(/Les Comètes/.test(sq('.recap').textContent) && /sur place/.test(sq('#contenu').textContent), 'récapitulatif incomplet');
      await suivantS(); ok(sq('[data-champ="cgv"].err'), 'CGV non cochées acceptées');
      await clicS('[data-f="cgv"]'); await suivantS(); await surVue('merci');
      const num = etatSite().cmd.num, r = resaNum(num); ok(r, 'réservation absente du moteur');
      egal([r.canal, r.src, r.act, r.pers, r.titre, r.email, r.paye, r.jour, SB.outils.hm(r.debut)], ['Site web', 'web', 'laser', 3, 'Les Comètes', 'leo@web.fr', 0, j, h], 'réservation');
      ok(r.compte && SB.api.clients.get(r.compte).email === 'leo@web.fr', 'pas liée au compte');
      ok(r.blocs.length === 1, 'pas de salle attribuée');
      ok(!SB.moteur.peutPlacer(SB.etat(), SB.etat().config.activites.find(a => a.id === 'laser'), SB.etat().config.activites.find(a => a.id === 'laser').ressources.find(x => x.id === r.blocs[0].r), r.jour, r.debut, r.debut + r.duree, 2).ok, 'la salle reste libre pour la borne et le comptoir');
      ok(new RegExp('n° ' + num).test(sq('.merci').textContent) && sq('.confettis'), 'page de fin');
      FAITS.webLaser = num; sansErreur('site');
    }, { delai: 40000 });
    test('Réservation du site dans le CRM : fiche avec le vrai e-mail et le lien vers le compte', async () => {
      const r = resaNum(FAITS.webLaser); ok(r, 'lancer le test précédent');
      await attendre(() => crm('CENTRE.reservations').some(x => x.id === r.id), 6000, 'réservation absente du CRM');
      await action('detail', { id: r.id });
      ok(/leo@web\.fr/.test(cq('.tiroir').textContent) && /Site web/.test(cq('.tiroir').textContent), 'fiche de réservation');
      ok(cq('.tiroir [data-a="client"]'), 'lien vers le compte client'); await action('fermer'); sansErreur('crm');
    });
    test('Acompte en ligne : place gardée, paiement refusé puis accepté, acompte payé', async () => {
      reglerWeb('karaoke', { paiement: 'acompte', acompte: 10 });
      await site('#/karaoke'); await attendre(() => etatSite().route === 'parcours', 5000, 'parcours karaoké');
      for (let k = 0; k < 6 && etatSite().etape !== 'rs-date'; k++) { if (sq('#contenu .an-f')) await clicS('#contenu .an-f'); else await suivantS(); await pause(150); }
      await surEtape('rs-date'); await clicS('.an-j.dispo'); await clicS('.an-h'); await suivantS();
      await attendre(() => ['rs-infos', 'rs-recap'].includes(etatSite().etape) && sq('.e-' + etatSite().etape), 5000, 'après le jour'); if (etatSite().etape === 'rs-infos') await suivantS();
      await surEtape('rs-recap'); ok(/Acompte de 10 €/.test(sq('#contenu').textContent), 'acompte non annoncé');
      ok(/Payer l’acompte/.test(sq('.panneau [data-a="suivant"]').textContent), 'bouton de paiement');
      await clicS('[data-f="cgv"]'); await suivantS(); await surVue('paiement');
      const num = etatSite().cmd.num; ok(resaNum(num) && resaNum(num).attente === 'paiement', 'place non gardée pendant le paiement');
      await clicS('[data-a="simKo"]'); ok(/refusé/.test(sq('.paie').textContent), 'refus non affiché');
      await clicS('[data-a="simOk"]'); await surVue('merci');
      const r = resaNum(num); egal([r.paye, !!r.attente, r.canal], [10, false, 'Site web'], 'acompte payé');
      ok(SBc().etat().ventes.paiements.some(p => p.cmd === num && p.etat === 'ok' && p.moyen === 'En ligne'), 'paiement en ligne absent des transactions');
      reglerWeb('karaoke', { paiement: null, acompte: null }); sansErreur('site');
    }, { delai: 40000 });
    test('Retour depuis le paiement : la place gardée est rendue', async () => {
      reglerWeb('karaoke', { paiement: 'total' });
      await site('#/karaoke');
      for (let k = 0; k < 6 && etatSite().etape !== 'rs-date'; k++) { if (sq('#contenu .an-f')) await clicS('#contenu .an-f'); else await suivantS(); await pause(150); }
      await surEtape('rs-date'); await clicS('.an-j.dispo'); await clicS('.an-h'); await suivantS();
      await attendre(() => ['rs-infos', 'rs-recap'].includes(etatSite().etape) && sq('.e-' + etatSite().etape), 5000, 'après le jour'); if (etatSite().etape === 'rs-infos') await suivantS();
      await surEtape('rs-recap'); await clicS('[data-f="cgv"]'); await suivantS(); await surVue('paiement');
      const num = etatSite().cmd.num; ok(resaNum(num), 'place non gardée');
      await clicS('[data-a="annulerPaiement"]'); await surEtape('rs-recap');
      ok(!resaNum(num), 'la place est restée prise'); reglerWeb('karaoke', { paiement: null }); sansErreur('site');
    }, { delai: 40000 });
    test('Bowling sur le site : jour, joueurs et formule (libres à cette heure), prénoms et barrières obligatoires, récapitulatif', async () => {
      await site('#/bowling'); await surEtape('rs-date');
      await clicS('.an-j.dispo'); await clicS('.an-h'); ok(/dès/.test(sq('.an-h.on').textContent), 'prix « dès » sur les heures');
      await suivantS(); await surEtape('bw-formule');
      ok(sq('.quilles .piste-b'), 'quilles absentes'); const n0 = etatSite().rs.nb;
      await clicS('[data-a="nb"][data-d="1"]'); egal(etatSite().rs.nb, n0 + 1, 'compteur de joueurs');
      ok(sq('.panneau [data-a="suivant"]').disabled, 'Continuer actif sans formule');
      const libres = SBc().api.resa.formulesA('bowling', etatSite().rs.j, etatSite().rs.h, n0 + 1, null, 'web');
      egal(sqa('.formule').map(b => b.dataset.f), SBc().api.resa.config('bowling', 'web').formules.map(f => f.nom).filter(n => libres.some(x => x.nom === n)), 'formules libres à cette heure');
      ok(!/dès/.test(sq('.formule .f-tot').textContent), 'prix exact attendu');
      await clicS('.formule'); await suivantS(); await surEtape('bw-joueurs');
      egal(sqa('[data-f^="joueur."]').length, n0 + 1, 'un champ par joueur');
      await suivantS(); ok(sq('[data-champ="groupe"].err'), 'nom du groupe pas demandé');
      await saisirS('[data-f="groupe"]', 'Les Quilles');
      await suivantS(); ok(sq('[data-champ="joueur-0"].err'), 'prénoms pas demandés');
      for (const [i, el] of sqa('[data-f^="joueur."]').entries()) await saisirS(`[data-f="joueur.${i}"]`, ['Zoé', 'Max', 'Lou', 'Noé'][i] || 'J' + i);
      await clicS('[data-a="barr"][data-i="0"]');
      if (!etatSite().client) await compteSite('Zoé Quille', 'zoe@web.fr', '0622334455', 'motdepasse');
      await attendre(() => sq('.moi'), 4000, 'compte');
      await suivantS(); await surEtape('rs-recap'); ok(/Les Quilles/.test(sq('#contenu').textContent) && /barrières/.test(sq('#contenu').textContent), 'récapitulatif bowling');
      await clicS('[data-f="cgv"]'); await suivantS(); await surVue('merci');
      const r = resaNum(etatSite().cmd.num); ok(r, 'réservation absente');
      egal([r.act, r.titre, r.pers, r.canal, r.joueurs[0].prenom, r.joueurs[0].barrieres, r.joueurs[1].barrieres], ['bowling', 'Les Quilles', n0 + 1, 'Site web', 'Zoé', true, false], 'réservation bowling');
      ok(/borne/.test(sq('.arrivee').textContent), 'consigne d’arrivée');
      ok(!SBc().etat().ventes.commandes.find(c => c.num === r.num).bot, 'envoyée au bot dès la réservation');
      sansErreur('site');
    }, { delai: 40000 });
    test('Bowling du jour réservé en ligne, tout payé : « Finaliser » sur la borne l’envoie au bot sans rien faire payer', () => {
      const SB = SBc(), now = SB.temps.maintenant(), f = SB.api.resa.config('bowling', 'web').formules[0].nom;
      reglerWeb('bowling', { paiement: 'total' });
      const J = SB.api.resa.creneaux('bowling', f, 2, null, 'web').find(x => x.j === now.j && x.heures.length);
      if (!J) { reglerWeb('bowling', { paiement: null }); return; }            // plus de bowling en ligne aujourd'hui : fin de journée
      const c = SB.api.bar.commander({ canal: 'web', act: 'bowling', nom: 'Les Finaux', lieu: 'Site web', ts: Date.now(), lignes: [], remises: [],
        reservation: { formule: f, j: J.j, h: J.heures[0].h, nb: 2, options: [], groupe: 'Les Finaux', prenoms: ['Ana', 'Bob'], joueurs: [{ prenom: 'Ana', barrieres: true }, { prenom: 'Bob' }], contact: { nom: 'Ana', tel: '0600000000', email: 'f@web.fr' } } }, 'test');
      ok(c.ok, c.raison); SB.api.bar.payer(c.commande.num, { moyen: 'En ligne', montant: c.commande.total, lignes: [], ok: true, op: 't' + Date.now(), ts: Date.now() }, 'test');
      const r = resaNum(c.commande.num); egal(r.paye, r.total, 'payée en ligne');
      const x = SB.api.bar.retrouver(r.num); ok(x.ok && x.resa, 'Finaliser refuse la réservation payée : ' + x.raison);
      const v = SB.api.bar.commander({ borne: 'K-02', act: 'bowling', nom: r.titre, lieu: 'Accueil', ts: Date.now(), resa: r.id, remises: [],
        lignes: x.resa.joueurs.map((j, i) => ({ id: 'j' + i, nom: j.prenom, q: 1, pu: r.total / 2, tva: 20 })), bowling: { formule: f, parties: 1, tarif: '1', joueurs: x.resa.joueurs } }, 'test');
      ok(v.ok && v.commande.etat === 'validee' && v.commande.bot, 'pas envoyée au bot');
      egal(resaNum(r.num).etatV, 'validee', 'réservation validée');
      ok(!SB.api.bar.retrouver(r.num).ok, 'finalisable deux fois');
      reglerWeb('bowling', { paiement: null });
    });
    test('Mon espace : les réservations du compte, coordonnées modifiées, déconnexion', async () => {
      await site('#/espace'); await surVue('espace');
      ok(sq('.ma-resa'), 'aucune réservation dans Mon espace');
      const f = sq('[data-form="profil"]'); f.elements.tel.value = '0699887766'; f.requestSubmit(); await pause(80);
      const id = etatSite().client.id; egal(SBc().api.clients.get(id).tel, '0699887766', 'téléphone modifié');
      const f2 = sq('[data-form="profil"]'); f2.elements.email.value = 'pas-un-mail'; f2.requestSubmit(); await pause(80);      // la page s'est redessinée : le formulaire est neuf ok(sq('[data-champ="profil"].err'), 'e-mail invalide accepté');
      await clicS('[data-a="deconnexion"]'); ok(sq('[data-form="connexion"], [data-form="creer"]'), 'toujours connecté'); sansErreur('site');
    });
    test('CRM › Clients : liste, fiche, mot de passe visible et modifiable, droits par rôle', async () => {
      const c = SBc().api.clients.liste().find(x => x.email === 'leo@web.fr'); ok(c, 'compte du site absent');
      await action('aller', { e: 'clients' }); await attendre(() => /leo@web\.fr/.test(cq('#app').textContent), 5000, 'compte dans la liste');
      ok(cqa('.arbre .grp').some(g => /Centre/.test(g.textContent) && /Clients/.test(g.textContent)), 'Clients pas dans le groupe Centre');
      await action('client', { id: c.id }); ok(cq('.tiroir [data-f="cli.mdp"]') && cq('.tiroir [data-f="cli.mdp"]').value === 'motdepasse', 'mot de passe pas visible');
      ok(/Laser/.test(cq('.tiroir').textContent), 'réservations du client absentes');
      await action('fermer'); ok(!cq('.tiroir') && !crm('S.client'), 'la croix ne ferme pas la fiche client'); await action('client', { id: c.id });
      await saisirCrm('.tiroir [data-f="cli.mdp"]', 'nouveau1'); await action('cliEnregistrer');
      ok(SBc().api.clients.connecter('leo@web.fr', 'nouveau1', 'test').ok, 'nouveau mot de passe refusé');
      crm(`S.role = 'Accueil'`); await action('client', { id: c.id });
      ok(cq('.tiroir') && !cq('.tiroir [data-f="cli.mdp"]') && !cq('.tiroir [data-a="cliEnregistrer"]'), 'Accueil peut modifier');
      crm(`S.role = 'Bar'`); await action('fermer'); ok(!cqa('.arbre button').some(b => /Clients/.test(b.textContent)), 'le Bar voit les clients');
      crm(`S.role = 'Admin'`); await action('aller', { e: 'tdb' }); sansErreur('crm');
    });
    test('Anniversaire : roue des formules (réglage du module), détail à taille fixe sur PC, fiche sur mobile ; cartes au choix', async () => {
      const A = SBc().etat().config.activites.find(a => a.id === 'anniv'), C = SBc().api.resa.config('anniv', 'web');
      egal(SBc().api.modules.val(A, 'rs-formule', 'affichage'), 'roue', 'roue par défaut pour l’anniversaire');
      egal(SBc().api.modules.val(SBc().etat().config.activites.find(a => a.id === 'laser'), 'rs-formule', 'affichage'), 'cartes', 'cartes par défaut ailleurs');
      const t = C.tranches.find(x => C.formules.filter(f => !f.tranches.length || f.tranches.includes(x.id)).length > 1); ok(t, 'aucune tranche avec plusieurs formules');
      const versFormule = async () => { await site('#/anniv'); await surEtape('rs-age'); await clicS(`[data-a="age"][data-t="${t.id}"]`); await surEtape('rs-formule'); };
      await versFormule();
      ok(sq('.roue .roue-c.actif') && sqa('.roue-c').length > 1 && sq('.roue-detail'), 'roue ou détail absents');
      const titre1 = sq('.roue-detail h2').textContent, haut1 = sq('.roue-detail').offsetHeight;
      await clicS('.roue-fl.bas'); await pause(700);
      ok(sq('.roue-detail h2').textContent !== titre1, 'le détail ne suit pas la roue'); egal(sq('.roue-detail').offsetHeight, haut1, 'le détail change de taille');
      cadre('site').style.width = '390px';                   // mobile : la fiche s'ouvre avant de choisir
      try {
        await versFormule(); ok(!sq('.roue-detail') || !sq('.roue-detail').offsetHeight, 'détail affiché sur mobile');
        sq('.roue-c.actif').click(); await attendre(() => sq('.modale'), 3000, 'fiche de la formule');
        ok(sq('.modale .mf-ph:not(.vide)') && /À partir de/.test(sq('.modale').textContent), 'fiche incomplète');
        sq('.modale .btn.sec').click(); ok(!sq('.modale'), 'la fiche ne se ferme pas');
        sq('.roue-c.actif').click(); await attendre(() => sq('.modale [data-a="formuleOk"]'), 3000, 'fiche'); sq('.modale [data-a="formuleOk"]').click(); await surEtape('rs-date');
      } finally { cadre('site').style.width = ''; }
      reglerModule('anniv', m => { m['rs-formule'] = Object.assign({}, m['rs-formule'], { affichage: 'cartes' }); });
      await versFormule(); ok(!sq('.roue') && sqa('.grille-f .an-f').length > 1, 'cartes absentes');
      reglerModule('anniv', m => { delete m['rs-formule'].affichage; }); sansErreur('site');
    }, { delai: 40000 });
    test('Le jour d’abord (réglage du module) : seules les formules libres à l’heure choisie, à leur prix', async () => {
      const SB = SBc(); reglerWeb('laser', { ordre: 'date' });
      try {
        egal(SB.api.resa.config('laser', 'web').etapes.slice(0, 2), ['rs-date', 'rs-formule'], 'pages');
        const F = SB.api.resa.config('laser', 'web').formules.map(f => f.nom), J = SB.api.resa.creneaux('laser', F, 2, null, 'web').find(x => x.heures.some(h => h.formules.length === F.length)); ok(J && F.length > 1, 'aucune heure avec toutes les formules');
        const h = J.heures.find(x => x.formules.length === F.length).h, slot = SB.moteur.slotsJour(SB.etat(), 'laser', J.j).find(x => x.h === h);
        SB.modifier('creneaux', C => { C.laser = C.laser.map(x => x.id !== slot.id ? x : Object.assign({}, x, { formules: x.formules.map(f => f.nom === F[1] ? Object.assign({}, f, { ferme: true }) : f) })); return C; }, 'test');
        egal(SB.api.resa.formulesA('laser', J.j, h, 2, null, 'web').map(x => x.nom), [F[0]], 'formules libres à ' + h);
        ok(SB.api.resa.creneaux('laser', F, 2, null, 'web').find(x => x.j === J.j).heures.some(x => x.h === h), 'l’heure doit rester proposée (une formule libre)');
        await site('#/laser'); await surEtape('rs-date');
        etatSite().rs.j = J.j; etatSite().rs.h = h; Wsite().__resa.rendre(true); await suivantS(); await surEtape('rs-formule');
        egal(sqa('#contenu .an-f').map(b => b.dataset.f), [F[0]], 'cartes proposées');
        ok(new RegExp('À ' + h.slice(0, 2)).test(sq('#contenu .an-f').textContent), 'prix à l’heure choisie');
        await clicS('#contenu .an-f'); await surEtape('rs-nombre'); egal([etatSite().rs.j, etatSite().rs.h], [J.j, h], 'le jour choisi est gardé');
        SB.modifier('creneaux', C => { C.laser = C.laser.map(x => x.id !== slot.id ? x : Object.assign({}, x, { formules: x.formules.map(f => Object.assign({}, f, { ferme: false })) })); return C; }, 'test');
      } finally { reglerWeb('laser', { ordre: null }); }
      sansErreur('site');
    }, { delai: 40000 });
    test('Infos pratiques et textes légaux : pages du site remplies avec l’établissement du CRM ; horaire du jour en bas de page', async () => {
      await action('aller', { e: 'parametrage' }); await action('param', { id: 'etablissement' });
      ok(cq('[data-f="etab.email"]') && cq('[data-f="etabH.normal.0"]'), 'fiche Établissement absente');
      await saisirCrm('[data-f="etab.email"]', 'accueil@centre-test.fr'); await saisirCrm('[data-f="etab.tel"]', '04 66 00 00 00');
      await attendre(() => (SBc().etat().config.centre || {}).email === 'accueil@centre-test.fr', 4000, 'établissement enregistré');
      await site('#/infos'); await surVue('infos');
      ok(/04 66 00 00 00/.test(sq('#app').textContent) && sqa('.horaires tbody tr').length === 7, 'infos pratiques');
      ok(/Ouvert aujourd’hui|Fermé aujourd’hui/.test(sq('.pied-site').textContent), 'horaire du jour absent du bas de page');
      for (const [k, mot] of [['cgv', 'rétractation'], ['mentions', 'Éditeur du site'], ['confidentialite', 'CNIL']]) { await site('#/' + k); await surVue(k); ok(new RegExp(mot).test(sq('#app').textContent), k + ' : texte absent'); }
      ok(/accueil@centre-test\.fr/.test(sq('#app').textContent), 'e-mail du centre absent');
      sansErreur('site'); sansErreur('crm');
    });
    test('Mon espace : « Annuler » prépare un e-mail au centre', async () => {
      const c = SBc().api.clients.liste().find(x => x.email === 'leo@web.fr'); ok(c, 'compte du site absent');
      localStorage.setItem('test:resa:session', c.id);
      await site('#/espace'); await surVue('espace');
      const a = sq('.ma-resa a[href^="mailto:"]'); ok(a, 'bouton Annuler absent');
      ok(a.href.startsWith('mailto:accueil@centre-test.fr') && /annulation/i.test(decodeURIComponent(a.href)), 'e-mail mal préparé : ' + a.href.slice(0, 80));
      sansErreur('site');
    });
    test('Paramètres de diffusion : une photo par tuile', async () => {
      await action('aller', { e: 'parametrage' }); await action('param', { id: 'diffusion' });
      ok(cq('input[type="file"][data-img="mod.laser.accueil.image"]'), 'ajout de photo absent pour le laser');
      sansErreur('crm');
    });
    test('Nouvelle activité : badge, icône et contenu des formules saisis dans le CRM, sur la borne et sur le site', async () => {
      const id = crm(`(CENTRE.activites.find(a => a.nom === 'Escape test') || {}).id`); ok(id, 'activité de test absente (suite CRM)');
      crm(`(() => { const a = actById('${id}'); a.visible = true; if (!a.canaux.includes('web')) a.canaux.push('web'); window.__sbxCRM.sauver(); })()`);
      await action('ouvrir', { id, o: 'tarifs' });
      ok(cq(`[data-f="anf.${id}.0.badge"]`), 'champ Badge absent de l’onglet Tarifs');
      await saisirCrm(`[data-f="anf.${id}.0.badge"]`, 'Spécial Halloween'); await saisirCrm(`[data-f="anf.${id}.0.emoji"]`, '🎃');
      await saisirCrm(`[data-f="anf.${id}.0.contenu"]`, 'Ambiance hantée\nLampes torches fournies');
      await attendre(() => (SBc().api.resa.config(id).formules[0] || {}).badge === 'Spécial Halloween', 4000, 'badge enregistré dans le moteur');
      const F = SBc().api.resa.config(id).formules, f0 = F[0];
      egal([f0.emoji, f0.contenu], ['🎃', ['Ambiance hantée', 'Lampes torches fournies']], 'icône et contenu');
      /* le site : la tuile, puis la carte de la formule */
      await site(); await surVue('accueil'); ok(sq(`.act[data-act="${id}"]`), 'activité absente de l’accueil du site');
      await site('#/' + id); await attendre(() => etatSite().route === 'parcours' && etatSite().etape, 5000, 'parcours du site');
      if (etatSite().etape === 'rs-salle') { const s0 = SBc().api.resa.config(id).salles.find(x => !(f0.salles || []).length || f0.salles.includes(x.id)); await clicS(`[data-a="salle"][data-s="${s0.id}"]`); }
      await surEtape('rs-formule');
      ok(sqa('#contenu .an-badge').some(b => /Spécial Halloween/.test(b.textContent)), 'badge absent de la carte sur le site');
      egal(Wsite().getComputedStyle(sq('#contenu .an-badge')).animationName, 'grossit', 'badge animé sur le site comme sur la borne');
      ok(/Lampes torches fournies/.test(sq('#contenu').textContent) && /🎃/.test(sq('#contenu').textContent), 'contenu ou icône absents sur le site');
      /* la borne : la carte de la formule, ou la carte de la salle si la page Formule est passée (une seule formule) */
      await attendre(() => SBc().api.bornes.config('K-02').modules.some(m => m.act === id), 4000, 'tuile sur K-02');
      await accueil(); await clic(`[data-a="module"][data-act="${id}"]`);
      await attendre(() => ['rs-salle', 'rs-formule'].includes(ecran()), 5000, 'première page du module');
      ok(vues('.an-badge').some(b => /Spécial Halloween/.test(b.textContent)), 'badge absent sur la borne (page ' + ecran() + ')');
      await accueil(); ok(!/Spécial Halloween/.test(vue(`[data-a="module"][data-act="${id}"]`).textContent), 'badge sur la tuile de la borne : il ne va que sur la formule');
      await site(); await surVue('accueil'); ok(!/Spécial Halloween/.test(sq(`.act[data-act="${id}"]`).textContent), 'badge sur la tuile du site : il ne va que sur la formule');
      /* une formule seule (anniversaire 4-6 ans) : sa page s'affiche (par défaut) ; si le module la fait passer, pas quand elle porte un badge */
      const C = SBc().api.resa.config('anniv'), t = C.tranches.find(x => C.formules.filter(f => !f.tranches.length || f.tranches.includes(x.id)).length === 1); ok(t, 'aucune tranche à une seule formule');
      const nom = C.formules.find(f => !f.tranches.length || f.tranches.includes(t.id)).nom, i = C.formules.findIndex(f => f.nom === nom);
      const poserBadge = v => SBc().modifier('config', c => { c.prix.anniv[i].badge = v; return c; }, 'test');
      try {
        poserBadge('Spécial Halloween'); await accueil(); await clic('[data-a="module"][data-act="anniv"]'); await surEcran('rs-age');
        await clic(`[data-a="rsAge"][data-t="${t.id}"]`); await surEcran('rs-formule'); ok(/Spécial Halloween/.test(texte()), 'badge absent de la formule seule');
        poserBadge(''); await accueil(); await clic('[data-a="module"][data-act="anniv"]'); await surEcran('rs-age');
        await clic(`[data-a="rsAge"][data-t="${t.id}"]`); await surEcran('rs-formule');                 // une seule formule : la page s'affiche (réglage par défaut)
        reglerModule('anniv', m => { m['rs-formule'] = Object.assign({}, m['rs-formule'], { unique: true }); }); poserBadge('Spécial Halloween');
        await accueil(); await clic('[data-a="module"][data-act="anniv"]'); await surEcran('rs-age');
        await clic(`[data-a="rsAge"][data-t="${t.id}"]`); await surEcran('rs-formule');                 // « passer la page » activé, mais la formule a un badge
        poserBadge(''); await accueil(); await clic('[data-a="module"][data-act="anniv"]'); await surEcran('rs-age');
        await clic(`[data-a="rsAge"][data-t="${t.id}"]`); await surEcran('rs-date');                    // « passer la page » activé, sans badge
      } finally { poserBadge(''); reglerModule('anniv', m => { if (m['rs-formule']) delete m['rs-formule'].unique; }); }
      sansErreur('site'); sansErreur('borne');
    }, { delai: 45000 });
    test('Boutons de l’accueil : un seul par activité, l’anniversaire présent, ceux des activités supprimées retirés', async () => {
      crm(`DIFFUSION.boutons.push(Object.assign({}, DIFFUSION.boutons.find(b => b.act === 'laser'), { lib: 'Doublon', ordre: 40 })); DIFFUSION.boutons.push({ act: 'disparue', lib: 'Orpheline', ordre: 50, visible: true }); DIFFUSION.boutons = DIFFUSION.boutons.filter(b => b.act !== 'anniv')`);
      await action('aller', { e: 'parametrage' });
      await attendre(() => { const B = SBc().etat().config.boutons; return B.some(b => b.act === 'anniv') && !B.some(b => b.act === 'disparue'); }, 5000, 'boutons rangés');
      const B = SBc().etat().config.boutons;
      egal(B.filter(b => b.act === 'laser').length, 1, 'un seul bouton laser');
      ok(!B.some(b => b.lib === 'Doublon'), 'le doublon est resté');
      egal(B.map(b => b.ordre).sort((x, y) => x - y), B.map((_, i) => i + 1), 'ordres sans trou');
      sansErreur('crm');
    });
    test('Disposition de l’accueil : un ordre propre à une borne, un autre pour le site', async () => {
      const SB = SBc(), K1 = SB.api.accueil('K-01').map(m => m.act), K2 = SB.api.accueil('K-02').map(m => m.act), W = SB.api.accueil('web').map(m => m.act);
      ok(K2.length > 1 && W.length > 1, 'pas assez de tuiles');
      await action('aller', { e: 'bornes', o: 'catalogue' }); ok(/Disposition de l’accueil/.test(cq('#app').textContent), 'bloc Disposition absent');
      await action('dispoEcran', { k: 'K-02' }); await action('dispo', { k: 'K-02', act: K2[1], d: -1 });
      await attendre(() => SB.api.accueil('K-02')[0].act === K2[1], 4000, 'ordre de K-02 enregistré');
      egal(SB.api.bornes.config('K-02').modules.map(m => m.act), [K2[1], K2[0]].concat(K2.slice(2)), 'tuiles de K-02');
      egal(SB.api.accueil('K-01').map(m => m.act), K1, 'K-01 a bougé aussi');
      await action('dispoEcran', { k: 'web' }); await action('dispo', { k: 'web', act: W[W.length - 1], d: -1 });
      const W2 = W.slice(); [W2[W.length - 2], W2[W.length - 1]] = [W2[W.length - 1], W2[W.length - 2]];
      await attendre(() => JSON.stringify(SB.api.web.config().activites.map(m => m.act)) === JSON.stringify(W2), 4000, 'ordre du site enregistré');
      await site(); await surVue('accueil'); egal(sqa('.act').map(a => a.dataset.act), W2, 'tuiles du site');
      await action('dispoRaz', { k: 'web' }); await action('dispoEcran', { k: 'K-02' }); await action('dispoRaz', { k: 'K-02' });
      await attendre(() => JSON.stringify(SB.api.accueil('K-02').map(m => m.act)) === JSON.stringify(K2), 4000, 'ordre commun rétabli');
      sansErreur('crm'); sansErreur('site');
    });
    test('Formule renommée : templates et créneaux suivent ; alerte si une formule ne se vend dans aucun créneau', async () => {
      const id = crm(`(CENTRE.activites.find(a => a.nom === 'Escape test') || {}).id`); ok(id, 'activité de test absente');
      const nom0 = crm(`PRIX['${id}'][0].nom`);
      crm(`window.__etatF = (id, n) => [(TEMPLATES[id] || []).some(t => (t.regles || []).some(r => (r.formules || []).includes(n))), (SLOTS[id] || []).some(s => (s.formules || []).some(f => f.nom === n))]`);
      const etat = n => crm(`__etatF(${JSON.stringify(id)}, ${JSON.stringify(n)})`);
      ok(etat(nom0).some(Boolean), 'la formule n’est ni dans un template ni dans un créneau');
      const avant = etat(nom0);
      await action('ouvrir', { id, o: 'tarifs' }); await saisirCrm(`[data-f="px.${id}.0.nom"]`, nom0 + ' X');
      egal(etat(nom0 + ' X'), avant, 'le nouveau nom a remplacé l’ancien'); egal(etat(nom0), [false, false], 'l’ancien nom est resté');
      await saisirCrm(`[data-f="px.${id}.0.nom"]`, nom0); egal(etat(nom0), avant, 'retour au nom d’origine');
      crm(`PRIX['${id}'].push({ nom: 'Jamais proposée', unite: 'la salle', duree: 30, regles: [{ jours: 'tous', prix: 9 }] })`);
      await action('ouvrir', { id, o: 'creneaux' }); ok(cq('.alerte-c') && /Jamais proposée/.test(cq('.alerte-c').textContent), 'pas d’alerte pour une formule absente des créneaux');
      crm(`PRIX['${id}'].pop()`); await action('ouvrir', { id, o: 'creneaux' }); ok(!cq('.alerte-c') || !/Jamais proposée/.test(cq('.alerte-c').textContent), 'alerte encore là : ' + (cq('.alerte-c') || {}).textContent);
      sansErreur('crm');
    });
    test('Une formule par salle (escalade) : en automatique, pas de page Salle, toutes les formules avec leur salle ; conseil si « au choix du client »', async () => {
      const id = crm(`(CENTRE.activites.find(a => a.nom === 'Escape test') || {}).id`); ok(id, 'activité de test absente');
      const avant = crm(`JSON.stringify(PRIX['${id}'])`), R = JSON.parse(crm(`JSON.stringify(actById('${id}').ressources.map(x => x.id))`));
      try {
        crm(`PRIX['${id}'].forEach((f, i) => { f.salles = [${JSON.stringify(R)}[i % ${R.length}]]; }); window.__sbxCRM.sauver()`);
        await action('choixRess', { pre: id, v: '1' }); await action('aller', { e: 'sandbox', o: 'activites' }); await action('act', { id });
        ok(cqa('.alerte-c').some(x => /Conseil/.test(x.textContent)), 'pas de conseil « automatique »');
        await action('choixRess', { pre: id, v: '0' }); await attendre(() => !SBc().api.resa.config(id).choixSalle, 4000, 'automatique enregistré');
        const C = SBc().api.resa.config(id);
        await site('#/' + id); await surEtape('rs-formule');
        egal(sqa('#contenu .an-f').length, C.formules.length, 'toutes les formules sur la page Formule');
        C.formules.forEach(f => { const x = sq(`#contenu .an-f[data-f="${f.nom}"]`), salle = C.salles.find(y => y.id === f.salles[0]); ok(x && salle && x.textContent.includes(salle.nom), f.nom + ' : salle absente de la carte'); });
      } finally { crm(`PRIX['${id}'] = JSON.parse(${JSON.stringify(avant)}); window.__sbxCRM.sauver()`); }
      sansErreur('site'); sansErreur('crm');
    });
    test('CRM › Module : l’onglet « Site web » règle le paiement en ligne', async () => {
      await action('aller', { e: 'sandbox', o: 'activites' }); await action('act', { id: 'laser' });
      await action('modSec', { act: 'laser', s: 'web' }); ok(/Paiement sur le site/.test(cq('[data-modform]').textContent), 'onglet Site web');
      await action('modChoix', { act: 'laser', s: 'web', k: 'paiement', v: 'total' });
      await attendre(() => SBc().api.resa.config('laser', 'web').regles.paiement === 'total', 4000, 'réglage enregistré');
      await action('modChoix', { act: 'laser', s: 'web', k: 'paiement', v: 'aucun' }); sansErreur('crm');
    });
  });

  suite('Remise à zéro', () => {
    test('Remise à zéro : l’exploitation est vidée, le paramétrage gardé (templates, tarifs, carte du bar, lots CE)', async () => {
      const E0 = SBc().etat(), garde = e => JSON.stringify([e.config.templates, e.config.prix, e.config.bar.cats, e.config.bar.produits.map(x => x.id), e.config.activites.map(a => a.id), e.tickets.lots.map(l => l.id)]);
      const avant = garde(E0); ok(Object.values(E0.creneaux).some(L => L.length) && E0.reservations.length && E0.ventes.commandes.length, 'rien à effacer : la batterie n’a pas tourné ?');
      await action('aller', { e: 'parametrage' }); await action('param', { id: 'remise' }); ok(/Remise à zéro/.test(C().document.getElementById('app').textContent), 'page de remise à zéro');
      await action('remiseZero'); ok(cq('[data-a="remiseZero"]') && /Oui, tout effacer/.test(cq('[data-a="remiseZero"]').textContent), 'pas de confirmation');
      C().__avantRemise = 1; await action('remiseZero');           // le CRM se recharge : même cadre, nouvelle page (le marqueur disparaît)
      await attendre(() => !C().__avantRemise && C().__sbxCRM && C().document.querySelector('.arbre'), 10000, 'CRM rechargé'); espionner('crm', C());
      const E = SBc().etat();
      egal([Object.values(E.creneaux).reduce((k, L) => k + L.length, 0), E.reservations.length, E.ventes.commandes.length, E.ventes.paiements.length, E.blocages.length], [0, 0, 0, 0, 0], 'créneaux, réservations, commandes, paiements, fermetures');
      egal(garde(E), avant, 'paramétrage modifié');
      egal(E.clients.length, E0.clients.length, 'comptes clients du site effacés');
      ok(!E.tickets.usages.some(u => u.cmd != null), 'utilisations de codes CE par des commandes encore là');
      ok(/remise à zéro/i.test(C().document.body.textContent), 'pas de message après la remise à zéro');
      await action('aller', { e: 'bar', o: 'commandes' }); egal(crm('COMMANDES_BAR.length'), 0, 'commandes bar affichées');
      await action('aller', { e: 'transactions' }); egal(crm('TRANS.length'), 0, 'transactions affichées'); sansErreur('crm');
    }, { delai: 30000 });
  });

  /* ------------------------------------------------------------------ Lancement */
  const P = new URLSearchParams(location.search), filtreSuite = P.get('suite'), filtreTest = (P.get('test') || '').toLowerCase();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function lancer() {
    const go = document.getElementById('go'), etat = document.getElementById('etat'), res = document.getElementById('res');
    go.disabled = true; etat.className = ''; etat.textContent = 'Préparation…'; res.innerHTML = '';
    /* sandbox de test neuve : le CRM l'amorce comme sur un nouveau poste ; puis, comme l'admin, on coche l'Anniversaire sur K-02 (Gestion des bornes › Catalogue) */
    Object.keys(localStorage).filter(k => k.startsWith('sbx-test:') || k.startsWith('test:')).forEach(k => localStorage.removeItem(k));
    const t0 = Date.now(), R = [];
    await charger('crm', '../maquettes/e-v2.html');
    try { await attendre(() => C().SB && C().SB.pret() && C().document.querySelector('.arbre') && C().__sbxCRM, 10000, 'démarrage du CRM (' + (erreurs.crm.join(' | ') || 'sans erreur relevée') + ')'); }
    catch (e) { R.push({ suite: 'Préparation', nom: 'Démarrage du CRM', ok: false, ms: 0, erreur: e.message }); }
    if (!R.length && !SBc().etat().config.vend['K-02'].includes('anniv')) { await action('cocher', { b: 'K-02', id: 'anniv' }); await attendre(() => SBc().etat().config.vend['K-02'].includes('anniv'), 4000).catch(() => {}); }
    const choisis = TESTS.filter(t => (!filtreSuite || t.suite === filtreSuite) && (!filtreTest || t.nom.toLowerCase().includes(filtreTest)));
    const blocs = {};
    const ligne = (t, cls, txt, err) => `<div class="t ${cls}"><i>${txt}</i><span>${esc(t.nom)}</span><small>${t.ms != null ? t.ms + ' ms' : ''}</small>${err ? `<pre>${esc(err)}</pre>` : ''}</div>`;
    for (const [i, t] of choisis.entries()) {
      if (!blocs[t.suite]) { const s = document.createElement('section'); s.className = 'suite'; s.innerHTML = `<h2>${esc(t.suite)} <small></small></h2><div></div>`; res.appendChild(s); blocs[t.suite] = s; }
      const zone = blocs[t.suite].lastElementChild, el = document.createElement('div'); zone.appendChild(el);
      el.innerHTML = ligne(t, 'encours', '…'); etat.textContent = (i + 1) + ' / ' + choisis.length + ' · ' + t.suite;
      const d = Date.now(); let erreur = null;
      try {
        if (R.length && R[0].suite === 'Préparation') throw new Echec('le CRM n’a pas démarré');
        await Promise.race([t.fn(), pause(t.delai).then(() => { throw new Echec('test trop long (> ' + t.delai / 1000 + ' s)'); })]);
      } catch (e) { erreur = e instanceof Echec ? e.message : (e && e.stack) || String(e); }
      const r = { suite: t.suite, nom: t.nom, ok: !erreur, ms: Date.now() - d, erreur };
      R.push(r); el.innerHTML = ligne(r, r.ok ? 'ok' : 'ko', r.ok ? '✔' : '✘', erreur);
      const L = R.filter(x => x.suite === t.suite); blocs[t.suite].querySelector('h2 small').textContent = L.filter(x => x.ok).length + ' / ' + L.length;
      Object.keys(erreurs).forEach(k => { erreurs[k].length = 0; });       // une erreur ne déborde pas sur le test suivant
    }
    const ko = R.filter(r => !r.ok).length, duree = Math.round((Date.now() - t0) / 1000);
    etat.className = ko ? 'ko' : 'ok'; etat.textContent = ko ? ko + ' échec' + (ko > 1 ? 's' : '') + ' sur ' + R.length + ' · ' + duree + ' s' : 'Tout est bon · ' + R.length + ' tests · ' + duree + ' s';
    go.disabled = false; go.textContent = 'Relancer';
    if (P.get('cli')) fetch('/__resultats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resultats: R, duree }) }).catch(() => {});
    return R;
  }
  document.getElementById('go').addEventListener('click', lancer);
  if (P.get('cli') || P.get('auto')) lancer();
})();
