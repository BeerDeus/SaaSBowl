/* =====================================================================
   FRONT EMPLOYÉ — planning des activités et chronos (sandbox)

   Même fonctionnement que la v1 du gestionnaire laser :
   · une liste complète des créneaux de la journée (pas d'ascenseur
     interne : seule la page défile), une colonne par salle ;
   · un clic sur une case libre = nouvelle réservation sur ce créneau
     et cette salle ; un clic sur « Fermer » = créneau fermé ;
   · sur chaque réservation : Monté (et lancement du chrono), Payé,
     modifier, supprimer ; glisser-déposer vers une autre case ;
   · un chrono par salle (dans l'en-tête de sa colonne).

   Ce qui change : tout est construit depuis le CRM. Les onglets, les
   salles, les créneaux, les formules et les prix viennent de sa
   configuration ; chaque réservation, fermeture ou chrono part aussitôt
   dans le CRM et recalcule ce que le site web propose.

   Navigation sur deux lignes : Activités | Anniversaires, puis les
   activités du CRM (ou Fiches | Plan de table, qui restent ceux de la v1).
   ===================================================================== */
(function () {
  'use strict';
  const SB = window.SB;
  if (!SB) return;
  const { hm, mn, eur, dureeTxt } = SB.outils;
  const T = SB.temps, M = SB.moteur, API = SB.api;
  const SRC = 'front';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sansHtml = s => String(s || '').replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('sbx-ui:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sbx-ui:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };
  const $ = (s, r) => (r || document).querySelector(s);
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const libJour = j => { const d = T.dateDeJour(j); const t = JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()]; return t.charAt(0).toUpperCase() + t.slice(1); };
  const pl = (n, mot, plur) => n + ' ' + (n > 1 ? (plur || mot + 's') : mot);
  const majuscule = s => s ? s[0].toUpperCase() + s.slice(1) : s;

  /* ------------------------------------------------------------------
     État de l'écran (ce poste seulement)
     ------------------------------------------------------------------ */
  const U = {
    j: T.maintenant().j,
    vue: 'activites',          // activites | anniv | plan
    act: LS.get('act', null),  // activité affichée
    par: LS.get('par', ''),
    son: LS.get('son', true),
    tiroir: null,
    pop: null,
    flash: {},
    monte: false
  };

  const E = () => SB.etat();
  const actsFront = Et => (Et.config.activites || []).filter(a => a.modele !== 'vente' && a.modele !== 'combo' && (a.ressources || []).length && M.front(a, Et).visible);
  const actCourante = Et => { const A = actsFront(Et); return A.find(a => a.id === U.act) || A[0] || null; };
  const toutesRes = Et => (Et.config.activites || []).flatMap(a => (a.ressources || []).map(r => ({ a, r })));
  const resInfo = (Et, id) => toutesRes(Et).find(x => x.r.id === id);

  const nomResa = r => (r.anniv && r.anniv.enfant ? 'Anniv ' + r.anniv.enfant : '') || r.titre || r.client || 'Sans nom';
  const resteAPayer = r => Math.max(0, Math.round(((+r.total || 0) - (+r.paye || 0)) * 100) / 100);
  const CANAL_TAG = { 'Site web': 'Web', 'Borne': 'Borne', 'Tickets CE': 'CE', 'Comptoir': '' };
  const estPasse = (j, h, now) => j < now.j || (j === now.j && mn(h) + 20 < now.min);    // comme la v1 : 20 min de grâce

  /* ------------------------------------------------------------------
     Chronos
     ------------------------------------------------------------------ */
  function etatChrono(c, now) {
    if (!c) return { etat: 'repos', ms: 0 };
    if (c.fin) { const ms = c.fin - now; return { etat: ms < 0 ? 'depasse' : ms <= 60000 ? 'fin' : 'jeu', ms }; }
    if (c.pause != null) return { etat: 'pause', ms: c.pause };
    return { etat: 'repos', ms: 0 };
  }
  const fmtChrono = ms => { const n = ms < 0, x = Math.abs(ms), m = Math.floor(x / 60000), s = Math.floor(x % 60000 / 1000); return (n ? '−' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
  /* durée du chrono pour une réservation : sa durée moins 2 minutes, comme la v1 (30 → 28, 20 → 18, 1 h → 58) */
  const dureeJeu = minutes => M.tempsJeu(minutes);

  let audio = null;
  function bip(fort) {
    if (!U.son) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'square'; o.frequency.value = fort ? 660 : 880;
      g.gain.setValueAtTime(0.0001, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + (fort ? 0.6 : 0.25));
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + (fort ? 0.62 : 0.27));
    } catch (e) { /* pas de son */ }
  }
  const titreOrigine = document.title;
  let clignote = null;
  function alerteOnglet(txt) {
    clearInterval(clignote);
    if (!txt) { document.title = titreOrigine; return; }
    let b = false;
    clignote = setInterval(() => { b = !b; document.title = b ? txt : titreOrigine; }, 800);
  }

  /* un chrono compact : dans l'en-tête de la colonne de sa salle (ou dans la liste mobile) */
  function chronoHtml(a, r, Et, cls) {
    const f = M.front(a, Et);
    return `<div class="sbx-ch ${cls || ''} ${r.hs ? 'hs' : ''}" data-r="${r.id}" data-act="${a.id}" data-etat="repos" style="--c:${esc(a.c || '#567')}">
      <div class="sbx-ch-l1"><b title="${esc(r.nom)}">${esc(r.nom)}</b><small>${r.hs ? 'hors service' : r.cap + ' pers.'}</small></div>
      <div class="sbx-ch-l2"><output class="sbx-ch-temps" aria-live="off">00:00</output><span class="sbx-ch-qui">Libre</span></div>
      <div class="sbx-ch-cmd">
        ${f.chronos.map(m => `<button type="button" class="sbx-ch-pre" data-x="chrono" data-r="${r.id}" data-m="${m}" title="Lancer ${m} minutes">${m}′</button>`).join('')}
        <span class="sbx-ch-libre"><input type="number" min="1" max="600" inputmode="numeric" placeholder="min" data-r="${r.id}" aria-label="Durée libre en minutes, ${esc(r.nom)}"><button type="button" data-x="chronoLibre" data-r="${r.id}" aria-label="Lancer la durée saisie">▶</button></span>
        <span class="sbx-ch-fin"><button type="button" class="sbx-ch-pause" data-x="chronoPause" data-r="${r.id}" title="Pause">❚❚</button><button type="button" class="sbx-ch-raz" data-x="chronoReset" data-r="${r.id}" title="Arrêter et remettre à zéro">■</button></span>
      </div>
    </div>`;
  }

  /* Les compteurs historiques (onglet Anniversaires, vue mobile) suivent la même règle de boutons
     rapides : ceux des salles reliées (1 bas, 2 haut, 3 karaoké, 4 quiz) sont réécrits depuis le CRM. */
  function presetsHistoriques() {
    const Et = E(), par = {};
    (Et.config.activites || []).forEach(a => (a.ressources || []).forEach(r => { if (r.legacy) par[r.legacy] = M.front(a, Et).chronos; }));
    document.querySelectorAll('[id^="counter-"]').forEach(c => {
      const m = c.id.match(/^counter-(\d+)/), P = m && par[m[1]]; if (!P) return;
      c.querySelectorAll('.preset-btn').forEach((b, i) => {
        const v = P[i];
        if (!v) { b.style.display = 'none'; return; }
        b.style.display = '';
        if (b.dataset.minutes !== String(v)) { b.dataset.minutes = String(v); b.textContent = v + ' min'; }
      });
    });
  }

  const alertes = {};
  function tic() {
    const Et = E(), C = SB.lire('chronos') || {}, now = Date.now();
    const A = actsFront(Et), courante = U.vue === 'activites' ? actCourante(Et) : null;
    let urgent = null;
    const parAct = {}, sonne = [];
    A.forEach(a => a.ressources.forEach(r => {
      const c = C[r.id], s = etatChrono(c, now);
      const p = parAct[a.id] = parAct[a.id] || { jeu: 0, alerte: null };
      if (s.etat !== 'repos') p.jeu++;
      if (s.etat === 'fin' || s.etat === 'depasse') { p.alerte = s.etat === 'depasse' ? 'depasse' : (p.alerte || 'fin'); }
      if (c && c.fin) {
        const k = r.id + ':' + c.fin;
        if (s.etat === 'fin' && !alertes[k + 'a']) { alertes[k + 'a'] = 1; bip(false); }
        if (s.etat === 'depasse' && !alertes[k + 'b'] && s.ms > -5000) { alertes[k + 'b'] = 1; bip(true); }
        if (s.etat === 'fin' || (s.etat === 'depasse' && s.ms > -120000)) {
          urgent = urgent || (r.nom + (s.etat === 'fin' ? ' : 1 minute' : ' : terminé'));
          if (!courante || courante.id !== a.id) sonne.push({ a, r, s });
        }
      }
      document.querySelectorAll(`.sbx-ch[data-r="${r.id}"]`).forEach(t => {
        if (t.dataset.etat !== s.etat) t.dataset.etat = s.etat;
        const tps = t.querySelector('.sbx-ch-temps'), txt = s.etat === 'repos' ? '00:00' : fmtChrono(s.ms);
        if (tps.textContent !== txt) tps.textContent = txt;
        const q = s.etat === 'repos' ? 'Libre' : (sansHtml(c.titre) || (s.etat === 'pause' ? 'En pause' : 'En jeu')) + (s.etat === 'pause' ? ' (pause)' : s.etat === 'depasse' ? ' (fini)' : '');
        const qui = t.querySelector('.sbx-ch-qui'); if (qui.textContent !== q) { qui.textContent = q; qui.title = q; }
        const bp = t.querySelector('.sbx-ch-pause'), lb = s.etat === 'pause' ? '▶' : '❚❚';
        if (bp.textContent !== lb) { bp.textContent = lb; bp.title = s.etat === 'pause' ? 'Reprendre' : 'Pause'; }
      });
    }));
    /* onglets d'activité : nombre de chronos en jeu, et alerte si l'un sonne */
    document.querySelectorAll('.sbx-t2[data-act]').forEach(b => {
      const p = parAct[b.dataset.act] || { jeu: 0, alerte: null };
      const badge = b.querySelector('.sbx-t2-n'); const t = p.jeu ? String(p.jeu) : '';
      if (badge && badge.textContent !== t) { badge.textContent = t; badge.title = p.jeu ? pl(p.jeu, 'chrono') + ' en cours' : ''; }
      const al = p.alerte || '';
      if ((b.dataset.alerte || '') !== al) b.dataset.alerte = al;
    });
    /* chrono qui sonne dans une autre activité : pastille cliquable en haut à droite */
    const zone = $('#sbx-alertes');
    if (zone) {
      const html = sonne.map(x => `<button type="button" class="sbx-alerte ${x.s.etat}" data-x="allerAct" data-id="${x.a.id}"><b>${esc(x.r.nom)}</b> ${fmtChrono(x.s.ms)}<small>${esc(x.a.nom)}</small></button>`).join('');
      if (zone.dataset.h !== html) { zone.dataset.h = html; zone.innerHTML = html; }
    }
    if (urgent !== tic.dernier) { tic.dernier = urgent; alerteOnglet(urgent ? '⚠ ' + urgent : null); }
  }

  /* ------------------------------------------------------------------
     Navigation : deux lignes d'onglets
     ------------------------------------------------------------------ */
  function rendreNav() {
    const nav = $('#sbx-nav'); if (!nav) return;
    const Et = E(), A = actsFront(Et), a = actCourante(Et);
    const l1 = [['activites', 'Activités'], [U.sousAnniv || 'anniv', 'Anniversaires']].map(([v, l]) => {
      const on = v === 'activites' ? U.vue === 'activites' : U.vue !== 'activites';
      return `<button type="button" class="sbx-t1 ${on ? 'on' : ''}" data-x="vue" data-v="${v}" aria-pressed="${on}">${l}</button>`;
    }).join('');
    const l2 = U.vue === 'activites'
      ? (A.map(x => `<button type="button" class="sbx-t2 ${a && a.id === x.id ? 'on' : ''}" data-x="act" data-id="${x.id}" data-act="${x.id}" style="--c:${esc(x.c || '#567')}" aria-pressed="${!!(a && a.id === x.id)}"><i></i>${esc(x.nom)}<span class="sbx-t2-n"></span></button>`).join('')
        || '<span class="sbx-nav-vide">Aucune activité n’est affichée sur le front. Dans le CRM : l’activité › Réglages › Front employé.</span>')
      : [['anniv', 'Fiches anniversaire'], ['plan', 'Plan de table']].map(([v, l]) => `<button type="button" class="sbx-t2 ${U.vue === v ? 'on' : ''}" data-x="vue" data-v="${v}" aria-pressed="${U.vue === v}">${l}</button>`).join('');
    nav.innerHTML = `<div class="sbx-nav-1" role="tablist">${l1}</div><div class="sbx-nav-2">${l2}<div id="sbx-alertes" class="sbx-alertes" aria-live="polite"></div></div>`;
    tic();
  }

  /* ------------------------------------------------------------------
     Barre du jour
     ------------------------------------------------------------------ */
  function rendreBarre() {
    const el = $('#sbx-barre'); if (!el) return;
    const Et = E(), now = T.maintenant(), a = actCourante(Et);
    const ids = new Set(a ? a.ressources.map(r => r.id) : []);
    const lst = Et.reservations.filter(r => r.jour === U.j && (r.blocs || []).some(b => ids.has(b.r)));
    const actives = lst.filter(M.actives), absentes = lst.filter(r => !M.actives(r));
    const pers = actives.reduce((n, r) => n + (+r.pers || 0), 0);
    el.innerHTML = `
      <div class="sbx-jour">
        <button type="button" class="sbx-b sbx-b-ic" data-x="jour" data-d="-1" aria-label="Jour précédent">‹</button>
        <label class="sbx-date"><span>${libJour(U.j)}</span><input type="date" value="${T.isoDeJour(U.j)}" data-x-change="date" aria-label="Choisir une date"></label>
        <button type="button" class="sbx-b sbx-b-ic" data-x="jour" data-d="1" aria-label="Jour suivant">›</button>
        ${U.j !== now.j ? '<button type="button" class="sbx-b" data-x="jour" data-d="0">Aujourd’hui</button>' : '<span class="sbx-auj">Aujourd’hui</span>'}
      </div>
      <p class="sbx-resume">${a ? `<b>${pl(actives.length, 'réservation')}</b>, ${pers} pers.${absentes.length ? `, <span title="${esc(absentes.map(r => nomResa(r) + ' ' + hm(r.debut)).join(', '))}">${absentes.length} non présentée${absentes.length > 1 ? 's' : ''}</span>` : ''}` : ''}</p>
      <div class="sbx-barre-d">
        <button type="button" class="sbx-b sbx-b-son" data-x="son" aria-pressed="${U.son}" title="${U.son ? 'Bip activé' : 'Bip coupé'} : une minute avant la fin et à la fin">Bip</button>
        <button type="button" class="sbx-b sbx-b-pri" data-x="nouvelle" ${a ? '' : 'disabled'}>Nouvelle réservation</button>
      </div>`;
  }

  /* ------------------------------------------------------------------
     Planning : liste complète des créneaux, une colonne par salle
     ------------------------------------------------------------------ */
  function rendrePlan() {
    const el = $('#sbx-plan'); if (!el) return;
    const Et = E(), a = actCourante(Et), now = T.maintenant();
    if (!a) { el.innerHTML = '<div class="sbx-plan-vide"><p>Aucune activité à afficher.</p><p>Une activité apparaît ici dès qu’elle a au moins une salle et qu’elle est « affichée sur le front employé » dans le CRM.</p></div>'; return; }
    const g = M.grille(Et, a, U.j), R = a.ressources;
    let S = g.slots.slice();
    const occ = R.map(r => M.occupations(Et, U.j, r.id));
    /* pas de créneau ce jour mais des réservations quand même : une ligne par heure de début */
    if (!S.length && occ.some(o => o.length)) {
      const deb = [...new Set(occ.flat().map(o => o.s))].sort((x, y) => x - y);
      S = deb.map(s => ({ id: 'x-' + s, act: a.id, j: U.j, h: hm(s), fin: hm(s + 30), formules: [], canaux: [], ouvert: true, virtuel: true, seul: true }));
    }
    if (!S.length) {
      el.innerHTML = `<div class="sbx-plan-vide"><p><b>${esc(a.nom)} : aucun créneau ${U.j === now.j ? 'aujourd’hui' : 'ce jour-là'}.</b></p><p>${g.source === 'aucun' ? 'L’activité est fermée ce jour-là dans le CRM (heures comptoir).' : 'Générez des créneaux dans le CRM (Générateur de créneaux).'}</p></div>`;
      return;
    }
    const ligne = m => { let k = 0; S.forEach((s, i) => { if (mn(s.h) <= m) k = i; }); return k; };
    const ligneFin = e => { let k = 0; S.forEach((s, i) => { if (mn(s.h) < e) k = i; }); return k; };
    const nb = R.length;
    const cellules = [];

    /* en-tête : colonne créneaux + une colonne par salle, avec son chrono */
    cellules.push(`<div class="sbx-th sbx-th-cr" style="grid-row:1;grid-column:1"><b>${esc(a.nom)}</b><small>${g.source === 'comptoir' ? 'comptoir seulement' : SB.moteur.lie(a) ? 'une ' + esc((a.ressNom || 'salle').toLowerCase()) + ' par groupe' : 'places'}</small></div>`);
    R.forEach((r, c) => cellules.push(`<div class="sbx-th" style="grid-row:1;grid-column:${c + 2}">${chronoHtml(a, r, Et, 'tete')}</div>`));

    /* colonne des créneaux : heure + ce que le site propose (clic : options du créneau) */
    S.forEach((s, i) => {
      const ps = estPasse(U.j, s.h, now), v = s.virtuel ? null : M.vuCanal(Et, s, 'web', now);
      const site = s.seul ? '' : !s.ouvert ? 'Fermé partout' : ps ? '' : s.virtuel ? 'Comptoir' : !s.canaux.includes('web') ? 'Hors site' : v.txt === 'complet' ? 'Site : complet' : v.txt === 'libre' ? 'Site : libre' : 'Site : ' + v.txt;
      const cls = !s.ouvert ? 'ferme' : ps ? 'passe' : s.virtuel ? 'comptoir' : v.cls;
      cellules.push(`<button type="button" class="sbx-cr sbx-cr-${cls}" style="grid-row:${i + 2};grid-column:1" ${s.seul ? 'disabled' : `data-x="slot" data-id="${esc(s.id)}" data-act="${a.id}"`} title="${esc(a.nom + ' ' + s.h + '–' + s.fin + (site ? ' · ' + site : ''))}"><b>${s.h}</b><small>${esc(site)}</small></button>`);
    });

    /* une colonne par salle */
    R.forEach((r, c) => {
      const col = c + 2;
      /* paquets de lignes occupées (réservations et fermetures qui se chevauchent) */
      const items = occ[c].map(o => Object.assign({}, o, { l0: ligne(o.s), l1: Math.max(ligne(o.s), ligneFin(o.e)) })).sort((x, y) => x.l0 - y.l0 || x.s - y.s);
      const paquets = [];
      items.forEach(o => { const p = paquets.find(q => o.l0 <= q.l1 && o.l1 >= q.l0); if (p) { p.items.push(o); p.l0 = Math.min(p.l0, o.l0); p.l1 = Math.max(p.l1, o.l1); } else paquets.push({ l0: o.l0, l1: o.l1, items: [o] }); });
      const prises = new Set(); paquets.forEach(p => { for (let i = p.l0; i <= p.l1; i++) prises.add(i); });
      paquets.forEach(p => cellules.push(caseOccupee(Et, a, r, S, p, col, now)));
      S.forEach((s, i) => {
        if (prises.has(i)) return;
        const pos = `grid-row:${i + 2};grid-column:${col}`, ps = estPasse(U.j, s.h, now);
        const dz = `data-r="${r.id}" data-h="${s.h}"`;
        if (r.hs) { cellules.push(`<div class="sbx-c sbx-c-hs" style="${pos}" ${dz}><span>Hors service</span></div>`); return; }
        if (ps) { cellules.push(`<div class="sbx-c sbx-c-passe" style="${pos}" ${dz}><span>Passé</span></div>`); return; }
        if (!s.ouvert) { cellules.push(`<div class="sbx-c sbx-c-ferme" style="${pos}" ${dz}><span>Fermé partout</span><button type="button" class="sbx-c-fer" data-x="slot" data-id="${esc(s.id)}" data-act="${a.id}">Options</button></div>`); return; }
        cellules.push(`<div class="sbx-c sbx-c-libre" style="${pos}" ${dz}>
          <button type="button" class="sbx-c-res" data-x="creer" data-act="${a.id}" data-r="${r.id}" data-h="${s.h}" aria-label="Réserver ${esc(r.nom)} à ${s.h}"><span>+ Réserver</span></button>
          <button type="button" class="sbx-c-fer" data-x="fermerCase" data-r="${r.id}" data-s="${mn(s.h)}" data-e="${M.finSlot(s)}" title="Fermer ${esc(r.nom)} de ${s.h} à ${s.fin}">Fermer</button>
        </div>`);
      });
    });
    const now0 = U.j === now.j ? S.findIndex(s => mn(s.h) <= now.min && M.finSlot(s) > now.min) : -1;
    if (now0 >= 0) cellules.push(`<i class="sbx-maint" style="grid-row:${now0 + 2};grid-column:1 / span ${nb + 1}" aria-hidden="true"></i>`);
    el.innerHTML = `<div class="sbx-grille" style="--n:${nb};--c:${esc(a.c || '#567')}" data-act="${a.id}">${cellules.join('')}</div>`;
    el.classList.toggle('large', 96 + nb * 212 > el.clientWidth + 2);   // trop de salles : défilement horizontal
    tic();
  }

  /* une case occupée : une ou plusieurs réservations (séance partagée), et/ou une fermeture */
  function caseOccupee(Et, a, r, S, p, col, now) {
    const res = p.items.filter(o => !o.bloque), bloq = p.items.filter(o => o.bloque);
    const s0 = Math.min(...p.items.map(o => o.s)), e0 = Math.max(...p.items.map(o => o.e));
    const total = res.reduce((n, o) => n + (+o.resa.pers || 0), 0);
    const seance = a.modele === 'seance' && res.length && res.every(o => o.s === res[0].s);
    const slot = S[p.l0], ps = slot && estPasse(U.j, slot.h, now);
    const plus = seance && total < r.cap && !bloq.length && slot && slot.ouvert && !ps && hm(res[0].s) === slot.h;
    const tete = res.length ? `<div class="sbx-c-h"><span>${hm(s0)}–${hm(e0)}</span>${a.modele === 'seance' ? `<em class="sbx-jauge ${total > r.cap ? 'trop' : total === r.cap ? 'plein' : ''}" title="${total} joueurs sur ${r.cap}">${total}/${r.cap}</em>` : ''}${plus ? `<button type="button" class="sbx-plus" data-x="creer" data-act="${a.id}" data-r="${r.id}" data-h="${slot.h}" title="Ajouter un groupe à cette séance">+ groupe</button>` : ''}</div>` : '';
    const fermes = bloq.map(o => `<div class="sbx-bloq"><span>Fermé ${hm(o.s)}–${hm(o.e)}${o.bloque.motif ? ' · ' + esc(o.bloque.motif) : ''}</span><button type="button" data-x="debloquer" data-id="${o.bloque.id}">Rouvrir</button></div>`).join('');
    const conflit = res.length > 1 && !seance;
    return `<div class="sbx-c sbx-c-occ ${conflit ? 'conflit' : ''} ${bloq.length && !res.length ? 'sbx-c-bloq' : ''}" style="grid-row:${p.l0 + 2} / span ${p.l1 - p.l0 + 1};grid-column:${col}" data-r="${r.id}" data-h="${slot ? slot.h : hm(s0)}">
      ${tete}${res.map(o => carteResa(Et, a, r, o, now, seance)).join('')}${fermes}
    </div>`;
  }

  /* une réservation, avec les boutons de la v1 */
  function carteResa(Et, a, r, o, now, seance) {
    const x = o.resa, coul = M.couleur(Et, x), ra = M.act(Et, x.act);
    const reste = resteAPayer(x), paye = !reste && (+x.total || 0) > 0;
    const tags = [];
    if (ra && ra.id !== a.id) tags.push(`<em class="t-act">${esc(ra.nom)}</em>`);
    const ct = CANAL_TAG[x.canal]; if (ct) tags.push(`<em class="t-canal">${ct}</em>`);
    if (x.etatV === 'validee') tags.push('<em class="t-ok" title="Validée par le client sur une borne">Validée</em>');
    if (x.src === 'front' || x.canal === 'Comptoir') tags.push('<em class="t-cpt">Comptoir</em>');
    const C = (SB.lire('chronos') || {})[r.id];
    const joue = C && C.resa === x.id && (C.fin || C.pause != null);
    const fl = U.flash[x.id] && Date.now() - U.flash[x.id] < 6000 ? 'flash' : '';
    const pay = paye ? '<span class="t-paye">Payé</span>' : x.paye > 0 ? `<span class="t-du">${eur(+x.paye)} versés, reste ${eur(reste)}</span>` : (+x.total ? `<span class="t-du">${eur(reste)} à régler</span>` : '');
    const heure = o.s !== (seance ? o.s : -1) && (o.e - o.s) !== x.duree ? ` ${hm(o.s)}–${hm(o.e)}` : '';
    const peutMonter = x.jour <= now.j;
    return `<article class="sbx-r ${x.lance ? 'monte' : ''} ${joue ? 'joue' : ''} ${fl}" style="--p:${esc(coul)}" draggable="true" data-id="${x.id}" data-i="${o.i}">
      <div class="sbx-r-l1"><button type="button" class="sbx-r-nom" data-x="ouvrir" data-id="${x.id}" title="Voir la réservation">${esc(nomResa(x))}</button><span class="sbx-r-p">${x.pers}<small> p.</small></span></div>
      <div class="sbx-r-l2">${esc(x.formule)}, ${dureeTxt(o.e - o.s)}${heure ? '<b>' + heure + '</b>' : ''}${tags.join('')}</div>
      ${x.tel || x.par || x.deplacePar || x.note ? `<div class="sbx-r-l3">${x.tel ? `<span>${esc(x.tel)}</span>` : ''}${x.par ? `<span>Pris par ${esc(x.par)}</span>` : ''}${x.deplacePar ? `<span>Déplacé par ${esc(x.deplacePar)}</span>` : ''}${x.note ? `<span class="sbx-r-note">${esc(x.note)}</span>` : ''}</div>` : ''}
      <div class="sbx-r-act">
        ${peutMonter ? `<button type="button" class="sbx-monte ${x.lance ? 'on' : ''}" data-x="monte" data-id="${x.id}" data-r="${r.id}" aria-pressed="${!!x.lance}" title="${x.lance ? 'Monté (cliquer pour annuler)' : 'Le groupe est monté : proposer le chrono'}">${joue ? 'En jeu' : 'Monté'}</button>` : ''}
        <label class="sbx-paye ${paye ? 'on' : ''}"><input type="checkbox" data-x-change="paye" data-id="${x.id}" ${paye ? 'checked' : ''}><span>Payé</span></label>
        ${pay}
        <span class="sbx-r-ic">${ra && ra.modele !== 'combo' ? `<button type="button" data-x="editer" data-id="${x.id}" title="Modifier la réservation" aria-label="Modifier">✎</button>` : ''}${ra && ra.modele !== 'combo' ? `<button type="button" class="sbx-r-sup" data-x="supprimer" data-id="${x.id}" title="Supprimer la réservation" aria-label="Supprimer">✕</button>` : ''}</span>
      </div>
    </article>`;
  }

  /* ------------------------------------------------------------------
     Tiroir : nouvelle réservation / fiche / modification
     ------------------------------------------------------------------ */
  function ouvrirTiroir(t) { U.tiroir = t; fermerPop(); rendreTiroir(true); }
  function fermerTiroir() { U.tiroir = null; const el = $('#sbx-tiroir'); if (el) { el.hidden = true; el.innerHTML = ''; } }

  function formDefaut(d) {
    const Et = E(), A = actsFront(Et);
    const a = M.act(Et, d.act) || actCourante(Et) || A[0];
    if (!a) return null;
    const j = d.j != null ? d.j : U.j, g = M.grille(Et, a, j), now = T.maintenant();
    const libres = g.slots.filter(s => s.ouvert && !estPasse(j, s.h, now));
    const h = d.h || (libres[0] && libres[0].h) || (g.slots[0] && g.slots[0].h) || '';
    const F = M.formules(Et, a.id);
    let formule = d.formule || (F[0] && F[0].nom) || '';
    const s = g.slots.find(x => x.h === h);
    if (!d.formule && s) { const e = M.etatSlot(Et, s); const ok = e.formules.find(f => f.reste > 0); if (ok) formule = ok.nom; }
    return { act: a.id, j, h, formule, pers: d.pers || (a.modele === 'privatif' ? 4 : 6), salle: d.salle || '', client: '', tel: '', note: '', par: U.par, paye: false };
  }

  function rendreTiroir(complet) {
    const el = $('#sbx-tiroir'); if (!el) return;
    const t = U.tiroir;
    if (!t) { el.hidden = true; return; }
    el.hidden = false;
    const Et = E();
    const saisie = el.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (!complet && saisie) { majApercu(); return; }
    if (t.mode === 'fiche') {
      const r = Et.reservations.find(x => x.id === t.id);
      if (!r) { el.innerHTML = `<div class="sbx-tir-in"><header class="sbx-tir-h"><h2>Réservation supprimée</h2><button type="button" class="sbx-b sbx-b-ic" data-x="fermerTiroir" aria-label="Fermer">×</button></header><p class="sbx-tir-p">Elle a été supprimée sur un autre poste ou dans le CRM.</p></div>`; return; }
      el.innerHTML = t.edition ? formulaire(Et, t.f, r) : fiche(Et, r);
    } else el.innerHTML = formulaire(Et, t.f, null);
    majApercu();
    if (complet && t.mode === 'creer') { const n = el.querySelector('[name="client"]'); if (n) setTimeout(() => n.focus(), 30); }
  }

  function optionsHeures(Et, a, j, choisi) {
    const g = M.grille(Et, a, j), now = T.maintenant();
    return g.slots.map(s => {
      const ps = estPasse(j, s.h, now);
      const e = M.etatSlot(Et, s), libre = e.formules.some(f => f.reste > 0);
      const lib = !s.ouvert ? 'fermé' : ps ? 'passé' : e.lie ? (libre ? '' : 'complet en ligne') : s.virtuel ? '' : (e.formules.reduce((n, f) => n + f.reste, 0) + ' pl. en ligne');
      return `<option value="${s.h}" ${s.h === choisi ? 'selected' : ''} ${(!s.ouvert || ps) && s.h !== choisi ? 'disabled' : ''}>${s.h}${lib ? ' — ' + lib : ''}</option>`;
    }).join('') || '<option value="">Aucun créneau ce jour</option>';
  }

  function formulaire(Et, f, r) {
    const A = actsFront(Et), a = M.act(Et, f.act);
    const F = M.formules(Et, a.id);
    const salles = a.ressources.map(x => `<label class="sbx-chip ${x.hs ? 'off' : ''}"><input type="radio" name="salle" value="${x.id}" ${f.salle === x.id ? 'checked' : ''} ${x.hs ? 'disabled' : ''}><span>${esc(x.nom)}<small data-salle-info="${x.id}"></small></span></label>`).join('');
    const employes = (window.__sbxFirestore ? Object.values(window.__sbxFirestore.lireCol('cleaners')).map(c => c.name) : []).filter(Boolean);
    return `<form class="sbx-tir-in" data-form="resa" autocomplete="off">
      <header class="sbx-tir-h"><h2>${r ? 'Modifier la réservation' : 'Nouvelle réservation'}</h2><button type="button" class="sbx-b sbx-b-ic" data-x="fermerTiroir" aria-label="Fermer">×</button></header>
      ${r ? '' : `<fieldset class="sbx-f"><legend>Activité</legend><div class="sbx-chips">${A.map(x => `<label class="sbx-chip" style="--c:${esc(x.c || '#567')}"><input type="radio" name="act" value="${x.id}" ${x.id === a.id ? 'checked' : ''}><span>${esc(x.nom)}</span></label>`).join('')}</div></fieldset>`}
      <div class="sbx-f2">
        <label class="sbx-f"><span>Jour</span><input type="date" name="date" value="${T.isoDeJour(f.j)}" required></label>
        <label class="sbx-f"><span>Heure</span><select name="h" required>${optionsHeures(Et, a, f.j, f.h)}</select></label>
      </div>
      <fieldset class="sbx-f"><legend>Formule</legend><div class="sbx-chips">${F.map(x => `<label class="sbx-chip"><input type="radio" name="formule" value="${esc(x.nom)}" ${x.nom === f.formule ? 'checked' : ''}><span>${esc(x.nom)}<small>${dureeTxt(+x.duree || a.duree)}, <span data-prix="${esc(x.nom)}"></span></small></span></label>`).join('') || '<p class="sbx-err">Aucune formule : ajoutez-en une dans le CRM.</p>'}</div></fieldset>
      <div class="sbx-f2">
        <label class="sbx-f"><span>Nombre de joueurs</span><span class="sbx-nb"><button type="button" class="sbx-b sbx-b-ic" data-x="nb" data-d="-1" aria-label="Un joueur de moins">−</button><input type="number" name="pers" min="1" max="99" value="${f.pers}" inputmode="numeric" required><button type="button" class="sbx-b sbx-b-ic" data-x="nb" data-d="1" aria-label="Un joueur de plus">+</button></span></label>
        <label class="sbx-f"><span>Total</span><input name="total" inputmode="decimal" placeholder="calculé" value="${f.total != null ? esc(f.total) : ''}"></label>
      </div>
      <fieldset class="sbx-f"><legend>${esc(a.ressNom || 'Salle')}</legend><div class="sbx-chips"><label class="sbx-chip"><input type="radio" name="salle" value="" ${!f.salle ? 'checked' : ''}><span>Au mieux<small data-salle-info="auto"></small></span></label>${salles}</div></fieldset>
      <div class="sbx-f2">
        <label class="sbx-f"><span>Nom du client</span><input name="client" value="${esc(f.client)}" placeholder="Nom ou nom du groupe"></label>
        <label class="sbx-f"><span>Téléphone</span><input name="tel" type="tel" value="${esc(f.tel)}" placeholder="06…"></label>
      </div>
      <label class="sbx-f"><span>Note pour l’équipe</span><input name="note" value="${esc(f.note)}" placeholder="Anniversaire surprise, arrivée en retard…"></label>
      <div class="sbx-f2">
        <label class="sbx-f"><span>Qui a pris la réservation ?</span><input name="par" list="sbx-employes" value="${esc(f.par)}" placeholder="Votre prénom" required><datalist id="sbx-employes">${employes.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
        ${r ? '' : `<label class="sbx-f sbx-f-case"><input type="checkbox" name="paye" ${f.paye ? 'checked' : ''}><span>Déjà payé</span></label>`}
      </div>
      <div class="sbx-apercu" data-apercu></div>
      <footer class="sbx-tir-pied">
        <button type="submit" class="sbx-b sbx-b-pri sbx-b-grand">${r ? 'Enregistrer' : 'Réserver'}</button>
        <button type="button" class="sbx-b" data-x="${r ? 'retourFiche' : 'fermerTiroir'}">Annuler</button>
      </footer>
    </form>`;
  }

  function fiche(Et, r) {
    const a = M.act(Et, r.act), reste = resteAPayer(r), now = T.maintenant();
    const salles = (r.blocs || []).map(b => { const i = resInfo(Et, b.r); return (i ? i.r.nom + (i.a.id !== r.act ? ' (' + i.a.nom + ')' : '') : b.r) + ' ' + hm(b.s) + '–' + hm(b.e); });
    const etat = { validee: 'Validée sur une borne', attendue: 'Attendue', absente: 'Non présentée, annulée', pointee: 'Montée (comptoir)' }[r.etatV] || 'Attendue';
    const caisse = { tape: 'Tapée en caisse', main: 'Tapée à la main', attente: 'Pas encore en caisse', reprendre: 'À reprendre en caisse' }[(r.caisse || {}).etat] || '';
    const an = r.anniv;
    const vis = new Set(actsFront(Et).flatMap(x => x.ressources.map(z => z.id))), B = r.blocs.filter(b => vis.has(b.r));
    const bl = (r.jour === now.j && B.find(x => x.e > now.min)) || B[0];
    return `<div class="sbx-tir-in">
      <header class="sbx-tir-h"><h2>${esc(nomResa(r))}</h2><button type="button" class="sbx-b sbx-b-ic" data-x="fermerTiroir" aria-label="Fermer">×</button></header>
      <p class="sbx-tir-quoi" style="--p:${esc(M.couleur(Et, r))}"><b>${esc(a ? a.nom : r.act)}, ${esc(r.formule)}</b><br>${libJour(r.jour)}, ${hm(r.debut)}–${hm(r.debut + r.duree)}<br>${pl(+r.pers, 'joueur')}</p>
      <dl class="sbx-dl">
        <dt>Salle</dt><dd>${esc(salles.join(', ') || '—')}</dd>
        <dt>Client</dt><dd>${esc(r.client || '—')}${r.tel ? '<br>' + esc(r.tel) : ''}</dd>
        ${an ? `<dt>Anniversaire</dt><dd>${esc(an.enfant)}, ${an.age} ans${an.gateau ? ', gâteau' : ''}${an.bonbons ? ', bonbons' : ''}${an.champomy ? ', champomy' : ''}${an.table ? ', ' + esc(an.table) : ''}</dd>` : ''}
        <dt>Origine</dt><dd>${esc(r.canal || 'Comptoir')}${r.par ? ', prise par ' + esc(r.par) : ''}${r.num ? ', commande ' + r.num : ''}${r.cree ? ', le ' + esc(r.cree) : ''}</dd>
        <dt>Arrivée</dt><dd>${etat}</dd>
        <dt>Paiement</dt><dd>${eur(+r.total || 0)} au total${r.paye ? ', ' + eur(+r.paye) + ' déjà réglé' : ''}${reste ? `, <b class="sbx-du">${eur(reste)} à régler</b>` : ', <b class="sbx-ok">payé</b>'}${caisse ? '<br><small>' + caisse + '</small>' : ''}</dd>
        ${r.note ? `<dt>Note</dt><dd>${esc(r.note)}</dd>` : ''}
        ${r.deplacePar ? `<dt>Déplacée</dt><dd>par ${esc(r.deplacePar)}</dd>` : ''}
      </dl>
      <div class="sbx-tir-actions">
        ${r.jour <= now.j && bl ? `<button type="button" class="sbx-b sbx-b-pri" data-x="monte" data-id="${r.id}" data-r="${bl.r}">${r.lance ? 'Relancer le chrono' : 'Monté : lancer le chrono'}${B.length > 1 ? ' (' + esc(resInfo(Et, bl.r).r.nom) + ')' : ''}</button>` : ''}
        ${reste ? `<button type="button" class="sbx-b" data-x="payer" data-id="${r.id}">Payé (${eur(reste)})</button>` : ''}
        ${a && a.modele !== 'combo' ? `<button type="button" class="sbx-b" data-x="editer" data-id="${r.id}">Modifier</button>` : ''}
      </div>
      <footer class="sbx-tir-pied sbx-tir-pied-d">
        ${a && a.modele === 'combo' ? '<p class="sbx-tir-p">Un anniversaire se modifie dans le CRM. Ici, on peut faire glisser son passage d’une salle à l’autre.</p>' : `<button type="button" class="sbx-b sbx-b-danger" data-x="supprimer" data-id="${r.id}">Supprimer la réservation</button>`}
      </footer>
    </div>`;
  }

  function lireForm(form) {
    const d = Object.fromEntries(new FormData(form).entries());
    const t = U.tiroir, f = Object.assign({}, t.f);
    if (d.act) f.act = d.act;
    if (d.date) f.j = T.jourDeIso(d.date);
    ['h', 'formule', 'client', 'tel', 'note', 'par'].forEach(k => { if (d[k] != null) f[k] = d[k]; });
    f.pers = Math.max(1, parseInt(d.pers, 10) || 1);
    f.salle = d.salle || '';
    f.total = d.total;
    f.paye = !!form.querySelector('[name="paye"]') && form.querySelector('[name="paye"]').checked;
    return f;
  }
  const versApi = f => ({ act: f.act, j: f.j, h: f.h, formule: f.formule, pers: f.pers, salle: f.salle || null, client: f.client, tel: f.tel, note: f.note, par: f.par, paye: f.paye, total: f.total === '' ? null : f.total });

  function txtImpact(i) {
    if (!i) return '';
    const p = [];
    if (i.fermes && i.fermes.length) p.push((i.fermes.length > 1 ? i.fermes.slice(0, -1).join(', ') + ' et ' + i.fermes.slice(-1) + ' ne seront plus proposés' : i.fermes[0] + ' ne sera plus proposé') + ' sur le site');
    if (i.reduits && i.reduits.length) p.push('sur le site : ' + i.reduits.join(', '));
    if (i.rouverts && i.rouverts.length) p.push(i.rouverts.join(', ') + (i.rouverts.length > 1 ? ' redeviennent disponibles' : ' redevient disponible') + ' sur le site');
    return p.join(' ; ');
  }
  let tApercu = null;
  function majApercu() {
    clearTimeout(tApercu);
    tApercu = setTimeout(() => {
      const el = $('#sbx-tiroir'); if (!el || !U.tiroir) return;
      const form = el.querySelector('form[data-form="resa"]'), zone = el.querySelector('[data-apercu]');
      if (!form || !zone) return;
      const f = lireForm(form);
      const Et = E(), a = M.act(Et, f.act); if (!a) return;
      el.querySelectorAll('[data-prix]').forEach(s => { const p = M.prix(Et, a.id, s.dataset.prix, f.j, mn(f.h || '00:00'), f.pers, 1); s.textContent = eur(p.unitaire) + (p.parPers ? ' par joueur' : ''); });
      const fo = M.formule(Et, a.id, f.formule), d = (fo && +fo.duree) || a.duree, s = mn(f.h || '00:00');
      const idIgn = U.tiroir.id || null;
      a.ressources.forEach(x => {
        const v = M.peutPlacer(Et, a, x, f.j, s, s + d, f.pers, idIgn);
        const sp = el.querySelector(`[data-salle-info="${x.id}"]`);
        if (sp) sp.textContent = v.ok ? (a.modele === 'seance' ? (v.deja ? v.deja + ' déjà en jeu, ' : '') + 'reste ' + v.reste : 'libre') : (x.hs ? 'hors service' : 'indisponible');
        const lab = sp && sp.closest('.sbx-chip'); if (lab) lab.classList.toggle('off', !v.ok);
      });
      const sim = API.reservations.simuler(versApi(f), idIgn);
      const auto = el.querySelector('[data-salle-info="auto"]');
      if (auto) auto.textContent = sim.ok && !f.salle ? sim.resa.blocs.map(b => (a.ressources.find(x => x.id === b.r) || {}).nom).join(', ') : '';
      const btn = form.querySelector('[type="submit"]');
      if (!sim.ok) { zone.className = 'sbx-apercu err'; zone.innerHTML = `<b>Impossible</b> ${esc(sim.raison)}`; btn.disabled = true; return; }
      btn.disabled = false;
      const imp = txtImpact(sim.impact), px = sim.prix;
      const avec = a.modele === 'seance' && sim.resa.blocs.length === 1 ? (() => { const v = M.peutPlacer(Et, a, a.ressources.find(x => x.id === sim.resa.blocs[0].r), f.j, sim.resa.debut, sim.resa.debut + sim.resa.duree, f.pers, idIgn); return v.deja ? ', avec ' + v.deja + ' joueur' + (v.deja > 1 ? 's' : '') + ' déjà prévu' + (v.deja > 1 ? 's' : '') : ''; })() : '';
      zone.className = 'sbx-apercu ' + (imp ? 'web' : '');
      zone.innerHTML = `<p><b>${eur(sim.resa.total)}</b>${px.parPers ? ` <span>(${eur(px.unitaire)} × ${f.pers})</span>` : ''}${px.regle && px.regle.min ? ' <span>tarif groupe dès ' + px.regle.min + ' joueurs</span>' : ''}</p>
        <p>${esc(sim.resa.blocs.map(b => (a.ressources.find(x => x.id === b.r) || {}).nom).join(', '))}, ${hm(sim.resa.debut)}–${hm(sim.resa.debut + sim.resa.duree)}${avec}</p>
        <p class="sbx-apercu-web">${imp ? esc(majuscule(imp)) + '.' : 'Aucun changement pour le site web.'}</p>`;
    }, 90);
  }

  /* ------------------------------------------------------------------
     Bulle d'un créneau : ce que voient le site, les bornes, le comptoir
     ------------------------------------------------------------------ */
  function fermerPop() { U.pop = null; const p = $('#sbx-pop'); if (p) { p.hidden = true; p.innerHTML = ''; } }
  function ouvrirPop(slotId, actId, ancre) { U.pop = { slotId, actId, ancre: ancre.getBoundingClientRect() }; rendrePop(); }
  function rendrePop() {
    const p = $('#sbx-pop'); if (!p || !U.pop) return;
    const Et = E(), a = M.act(Et, U.pop.actId), s = a && M.grille(Et, a, U.j).slots.find(x => x.id === U.pop.slotId);
    if (!a || !s) { fermerPop(); return; }
    const e = M.etatSlot(Et, s), now = T.maintenant();
    const canal = c => { const v = M.vuCanal(Et, s, c, now); return v.ouvert ? (v.cls === 'partiel' ? 'en partie (' + v.txt + ')' : 'oui' + (v.txt && v.txt !== 'libre' ? ' (' + v.txt + ')' : '')) : 'non, ' + (v.txt === 'hors site' ? 'retiré du site' : v.txt); };
    p.innerHTML = `<div class="sbx-pop-in" role="dialog" aria-label="Créneau ${esc(a.nom)} ${s.h}">
      <header><b>${esc(a.nom)}, ${s.h}–${s.fin}</b><button type="button" class="sbx-b sbx-b-ic" data-x="fermerPop" aria-label="Fermer">×</button></header>
      ${s.virtuel ? '<p class="sbx-pop-note">Heures comptoir : aucun créneau n’a été généré dans le CRM pour ce jour, rien n’est vendu en ligne.</p>' : ''}
      <ul class="sbx-pop-f">${e.formules.map(f => `<li><span>${esc(f.nom)}</span><b>${s.virtuel ? (f.reste ? 'possible' : 'non') : e.lie ? (f.reste ? pl(f.reste, (a.ressNom || 'salle').toLowerCase()) + ' libre' + (f.reste > 1 ? 's' : '') : 'indisponible') : f.reste + ' / ' + f.places + ' places'}</b>${f.raison ? `<small>${esc(f.raison)}</small>` : ''}</li>`).join('')}</ul>
      ${s.virtuel ? '' : `<dl class="sbx-pop-c"><dt>Site web</dt><dd>${canal('web')}</dd><dt>Bornes</dt><dd>${canal('borne')}</dd><dt>Comptoir</dt><dd>${s.ouvert ? 'oui' : 'non, fermé'}</dd></dl>
      <div class="sbx-pop-a">
        ${s.ouvert ? `<button type="button" class="sbx-b" data-x="web" data-id="${esc(s.id)}" data-v="${s.canaux.includes('web') ? 1 : 0}">${s.canaux.includes('web') ? 'Retirer du site web' : 'Remettre sur le site web'}</button>` : ''}
        <button type="button" class="sbx-b ${s.ouvert ? 'sbx-b-danger' : 'sbx-b-pri'}" data-x="fermer" data-id="${esc(s.id)}" data-v="${s.ouvert ? 1 : 0}">${s.ouvert ? (a.ressources.length > 1 ? 'Fermer partout (toutes les ' + esc((a.ressNom || 'salle').toLowerCase()) + 's)' : 'Fermer le créneau partout') : 'Rouvrir le créneau'}</button>
      </div>
      ${a.ressources.length > 1 ? `<p class="sbx-pop-note2">Pour fermer une seule ${esc((a.ressNom || 'salle').toLowerCase())}, utilisez « Fermer » dans sa case.</p>` : ''}`}
    </div>`;
    p.hidden = false;
    const r = U.pop.ancre, w = Math.min(340, window.innerWidth - 24);
    p.style.width = w + 'px';
    let x = r.right + 8; if (x + w > window.innerWidth - 12) x = Math.max(12, r.left - w - 8);
    let y = r.top; const h = p.offsetHeight; if (y + h > window.innerHeight - 12) y = Math.max(12, window.innerHeight - h - 12);
    p.style.left = x + 'px'; p.style.top = y + 'px';
  }

  /* ------------------------------------------------------------------
     Messages et confirmation
     ------------------------------------------------------------------ */
  function message(titre, detail, type, action) {
    const fil = $('#sbx-fil'); if (!fil) return;
    const n = document.createElement('div');
    n.className = 'sbx-msg ' + (type || '');
    n.setAttribute('role', type === 'err' ? 'alert' : 'status');
    n.innerHTML = `<b>${esc(titre)}</b>${detail ? `<span>${esc(detail)}</span>` : ''}${action ? `<button type="button" class="sbx-b">${esc(action.lib)}</button>` : ''}`;
    if (action) n.querySelector('button').addEventListener('click', () => { action.fn(); n.remove(); });
    n.addEventListener('click', e => { if (e.target === n || e.target.tagName === 'B' || e.target.tagName === 'SPAN') n.remove(); });
    fil.appendChild(n);
    while (fil.children.length > 4) fil.firstChild.remove();
    setTimeout(() => n.remove(), type === 'err' ? 9000 : detail ? 8000 : 5000);
  }
  function lienCRM() {
    const p = $('#sbx-lien'); if (!p) return;
    const t = new Date();
    p.querySelector('span').textContent = 'Relié au CRM, à jour à ' + [t.getHours(), t.getMinutes(), t.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
    p.classList.remove('pulse'); void p.offsetWidth; p.classList.add('pulse');
  }
  function demander(texte, oui, libOui, non) {
    const d = $('#sbx-dlg');
    d.innerHTML = `<div class="sbx-dlg-in" role="alertdialog" aria-modal="true" aria-label="${esc(texte)}"><p>${esc(texte)}</p><div><button type="button" class="sbx-b sbx-b-pri" data-dlg="oui">${esc(libOui || 'Oui')}</button><button type="button" class="sbx-b" data-dlg="non">${esc(non || 'Annuler')}</button></div></div>`;
    d.hidden = false;
    const fin = ok => { d.hidden = true; d.innerHTML = ''; if (ok) oui(); };
    d.querySelector('[data-dlg="oui"]').onclick = () => fin(true);
    d.querySelector('[data-dlg="non"]').onclick = () => fin(false);
    d.onclick = e => { if (e.target === d) fin(false); };
    setTimeout(() => d.querySelector('[data-dlg="oui"]').focus(), 20);
  }

  /* « Monté » (v1) : le groupe est monté → on propose de lancer le chrono de sa salle */
  function monte(id, resId) {
    const Et = E(), r = Et.reservations.find(x => x.id === id); if (!r) return;
    const info = resInfo(Et, resId); if (!info) return;
    const C = (SB.lire('chronos') || {})[resId];
    const joue = C && C.resa === r.id && (C.fin || C.pause != null);
    if (r.lance && !U.tiroir) {           // déjà monté : on annule (comme la v1, le bouton bascule)
      API.reservations.modifier(r.id, { lance: false, arrive: r.etatV === 'validee', etatV: r.etatV === 'pointee' ? 'attendue' : r.etatV }, SRC);
      if (joue) demander(`Arrêter aussi le chrono de ${info.r.nom} ?`, () => API.chrono(resId, 'reset', {}, SRC), 'Arrêter le chrono', 'Laisser tourner');
      return;
    }
    API.reservations.modifier(r.id, Object.assign({ lance: true, arrive: true }, r.etatV !== 'validee' ? { etatV: 'pointee' } : {}), SRC);
    const b = r.blocs.find(x => x.r === resId) || r.blocs[0];
    const minutes = dureeJeu(b ? b.e - b.s : r.duree);
    const titre = nomResa(r) + ', ' + r.pers + ' p.';
    const go = () => { API.chrono(resId, 'lancer', { minutes, titre, resa: r.id, par: U.par }, SRC); message(info.r.nom + ' : chrono de ' + minutes + ' min lancé', titre, 'ok'); };
    const occupe = C && (C.fin || C.pause != null) && C.resa !== r.id;
    demander(occupe ? `Le chrono de ${info.r.nom} tourne déjà (${sansHtml(C.titre) || 'sans nom'}). Le remplacer par ${minutes} min pour ${nomResa(r)} ?` : `Lancer le chrono de ${minutes} minutes pour ${nomResa(r)} (${info.r.nom}) ?`, go, occupe ? 'Remplacer' : 'Lancer', 'Pas maintenant');
  }

  function payer(id, oui) {
    const r = E().reservations.find(x => x.id === id); if (!r) return;
    if (oui) API.reservations.modifier(r.id, { paye: +r.total || 0, payeAvant: +r.paye || 0, caisse: Object.assign({}, r.caisse || {}, { etat: (r.caisse || {}).etat === 'tape' ? 'tape' : 'main' }) }, SRC);
    else API.reservations.modifier(r.id, { paye: +r.payeAvant || 0, caisse: Object.assign({}, r.caisse || {}, { etat: (r.caisse || {}).etat === 'main' ? 'attente' : (r.caisse || {}).etat }) }, SRC);
  }

  const X = {
    vue(d) { allerVue(d.v); },
    act(d) { U.act = d.id; LS.set('act', d.id); fermerPop(); rendreNav(); rendreBarre(); rendrePlan(); },
    allerAct(d) { U.act = d.id; LS.set('act', d.id); allerVue('activites'); },
    jour(d) { const n = T.maintenant().j; U.j = +d.d === 0 ? n : U.j + (+d.d); fermerPop(); rendreBarre(); rendrePlan(); },
    son() { U.son = !U.son; LS.set('son', U.son); if (U.son) bip(false); rendreBarre(); },
    nouvelle() { const f = formDefaut({}); if (!f) { message('Aucune activité à réserver', 'Rendez une activité visible sur le front employé dans le CRM.', 'err'); return; } ouvrirTiroir({ mode: 'creer', f }); },
    creer(d) { const f = formDefaut({ act: d.act, h: d.h, salle: d.r }); if (f) ouvrirTiroir({ mode: 'creer', f }); },
    ouvrir(d) { ouvrirTiroir({ mode: 'fiche', id: d.id }); },
    fermerTiroir() { fermerTiroir(); },
    retourFiche() { if (U.tiroir) { U.tiroir.edition = false; rendreTiroir(true); } },
    editer(d) { const r = E().reservations.find(x => x.id === d.id); if (!r) return; U.tiroir = { mode: 'fiche', id: r.id, edition: true, f: { act: r.act, j: r.jour, h: hm(r.debut), formule: r.formule, pers: r.pers, salle: r.blocs.length === 1 ? r.blocs[0].r : '', client: r.client, tel: r.tel || '', note: r.note || '', par: r.par || U.par, paye: false, total: '' } }; fermerPop(); rendreTiroir(true); },
    nb(d, el) { const i = el.closest('form').querySelector('[name="pers"]'); i.value = Math.max(1, (parseInt(i.value, 10) || 1) + (+d.d)); U.tiroir.f = lireForm(el.closest('form')); majApercu(); },
    monte(d) { monte(d.id, d.r); },
    payer(d) { payer(d.id, true); },
    supprimer(d) {
      const r = E().reservations.find(x => x.id === d.id); if (!r) return;
      demander(`Voulez-vous vraiment supprimer la réservation de ${nomResa(r)} (${hm(r.debut)}, ${r.pers} p.) ?`, () => {
        const res = API.reservations.supprimer(r.id, SRC);
        fermerTiroir();
        const imp = txtImpact(res.impact);
        message('Réservation supprimée', imp ? majuscule(imp) + '.' : '', 'ok');
      }, 'Supprimer');
    },
    slot(d, el) { ouvrirPop(d.id, d.act, el); },
    fermerPop() { fermerPop(); },
    web(d) { const ferme = d.v === '1'; const r = API.fermerCreneau(d.id, 'web', ferme, U.par, SRC); fermerPop(); if (!r.ok) message('Action impossible', r.raison, 'err'); else message(r.slot.h + (ferme ? ' retiré du site web' : ' remis sur le site web'), ferme ? 'Le comptoir et les bornes peuvent toujours le vendre.' : ''); },
    fermer(d) { const ferme = d.v === '1'; const r = API.fermerCreneau(d.id, 'tous', ferme, U.par, SRC); fermerPop(); if (!r.ok) message('Action impossible', r.raison, 'err'); else message(r.slot.h + (ferme ? ' fermé partout' : ' rouvert'), ferme ? 'Plus vendu nulle part : site, bornes, comptoir.' : 'De nouveau en vente.'); },
    /* « Fermé » de la v1, en un clic : la salle est fermée sur ce créneau, le site suit aussitôt */
    fermerCase(d) {
      const r = API.bloquer({ r: d.r, j: U.j, s: +d.s, e: +d.e, motif: '', par: U.par }, SRC);
      if (!r.ok) { message('Fermeture impossible', r.raison, 'err'); return; }
      const imp = txtImpact(r.impact);
      message((resInfo(E(), d.r) || { r: { nom: 'Salle' } }).r.nom + ' fermée à ' + hm(+d.s), imp ? majuscule(imp) + '.' : 'Le site web n’est pas concerné.', 'ok', { lib: 'Annuler', fn: () => API.debloquer(r.blocage.id, SRC) });
    },
    debloquer(d) { API.debloquer(d.id, SRC); },
    chrono(d) { API.chrono(d.r, 'lancer', { minutes: +d.m, titre: '', par: U.par }, SRC); },
    chronoLibre(d, el) { const i = el.parentNode.querySelector('input'); const m = parseInt(i.value, 10); if (!m || m < 1 || m > 600) { i.focus(); message('Durée invalide', 'Entre 1 et 600 minutes.', 'err'); return; } i.value = ''; X.chrono({ r: d.r, m }); },
    chronoPause(d) { API.chrono(d.r, 'basculer', {}, SRC); },
    chronoReset(d) {
      const C = (SB.lire('chronos') || {})[d.r] || {}, info = resInfo(E(), d.r);
      const go = () => API.chrono(d.r, 'reset', {}, SRC);
      if (C.fin && C.fin > Date.now() + 60000) demander(`Arrêter le chrono de ${info ? info.r.nom : 'cette salle'} ? Il reste ${fmtChrono(C.fin - Date.now())}.`, go, 'Arrêter'); else go();
    },
    reinit() { demander('Effacer toute la sandbox (CRM et front) et repartir des données de démonstration ?', () => { SB.reinitialiser(); location.reload(); }, 'Tout effacer'); },
    simWeb() { ouvrirSimWeb(); }
  };

  /* ------------------------------------------------------------------
     Outil de test : réserver comme un client sur le site
     ------------------------------------------------------------------ */
  function ouvrirSimWeb() {
    const A = (E().config.activites || []).filter(a => a.modele !== 'vente' && a.modele !== 'combo' && (E().creneaux[a.id] || []).length);
    const d = $('#sbx-dlg');
    const st = { act: (A.find(a => a.id === U.act) || A.find(a => SB.moteur.lie(a)) || A[0] || {}).id, j: U.j };
    const rendre = () => {
      const Et = E(), a = M.act(Et, st.act);
      if (!a) { d.innerHTML = '<div class="sbx-dlg-in"><p>Aucune activité n’a de créneaux en ligne.</p><div><button type="button" class="sbx-b" data-dlg="non">Fermer</button></div></div>'; d.querySelector('[data-dlg="non"]').onclick = () => { d.hidden = true; }; return; }
      const vus = M.slotsJour(Et, a.id, st.j).map(s => ({ s, v: M.vuCanal(Et, s, 'web') }));
      if (!st.h || !vus.some(x => x.s.h === st.h)) { const o = vus.find(x => x.v.ouvert); st.h = o ? o.s.h : (vus[0] && vus[0].s.h); }
      d.innerHTML = `<form class="sbx-dlg-in sbx-sim" data-form="sim">
        <h2>Réserver comme sur le site</h2>
        <p class="sbx-tir-p">Passe par les mêmes règles que le site public. Pratique pour vérifier qu’une réservation prise au comptoir a bien retiré le créneau.</p>
        <label class="sbx-f"><span>Activité</span><select name="act">${A.map(x => `<option value="${x.id}" ${x.id === a.id ? 'selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></label>
        <div class="sbx-f2"><label class="sbx-f"><span>Jour</span><input type="date" name="date" value="${T.isoDeJour(st.j)}"></label>
        <label class="sbx-f"><span>Heure (ce que le site affiche)</span><select name="h">${vus.map(({ s, v }) => `<option value="${s.h}" ${st.h === s.h ? 'selected' : ''}>${s.h} — ${v.ouvert ? v.txt : 'non proposé (' + v.txt + ')'}</option>`).join('') || '<option value="">Aucun créneau</option>'}</select></label></div>
        <div class="sbx-f2"><label class="sbx-f"><span>Formule</span><select name="formule">${M.formules(Et, a.id).map(f => `<option ${st.formule === f.nom ? 'selected' : ''}>${esc(f.nom)}</option>`).join('')}</select></label>
        <label class="sbx-f"><span>Joueurs</span><input type="number" name="pers" min="1" value="${st.pers || 4}"></label></div>
        <label class="sbx-f"><span>Nom</span><input name="client" value="${esc(st.client || 'Client du site')}"></label>
        ${a.modele === 'piste' ? `<label class="sbx-f"><span>Prénoms des joueurs (virgules ; * = barrières)</span><input name="prenoms" value="${esc(st.prenoms != null ? st.prenoms : 'Léo*, Jade, Sam, Nora')}"></label>` : ''}
        <div><button type="submit" class="sbx-b sbx-b-pri">Valider comme le site</button><button type="button" class="sbx-b" data-dlg="non">Fermer</button></div>
        <p class="sbx-apercu" data-res hidden></p>
      </form>`;
      const f = d.querySelector('form');
      f.addEventListener('change', e => { st[e.target.name] = e.target.value; if (e.target.name === 'act') { st.h = null; st.formule = null; } if (e.target.name === 'date') st.j = T.jourDeIso(e.target.value); if (['act', 'date'].includes(e.target.name)) rendre(); });
      f.addEventListener('submit', e => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(f).entries());
        const joueurs = v.prenoms != null ? v.prenoms.split(',').map(s => s.trim()).filter(Boolean).map(s => ({ prenom: s.replace(/\*$/, '').trim(), barrieres: /\*$/.test(s) })) : undefined;
        const r = API.reservations.creerWeb({ act: v.act, j: T.jourDeIso(v.date), h: v.h, formule: v.formule, pers: +v.pers, client: v.client, joueurs }, SRC);
        const z = f.querySelector('[data-res]'); z.hidden = false;
        if (!r.ok) { z.className = 'sbx-apercu err'; z.innerHTML = `<b>Refusé</b> ${esc(r.raison.replace(/^Refusé par le site : /, ''))}`; return; }
        z.className = 'sbx-apercu web'; z.innerHTML = `<b>Réservé en ligne · n° ${r.resa.num}</b> ${esc(M.act(E(), v.act).nom)} ${v.h}, ${v.pers} joueurs${txtImpact(r.impact) ? ' — ' + esc(txtImpact(r.impact)) : ''}`;
        Object.assign(st, v, { j: T.jourDeIso(v.date) });
        setTimeout(rendre, 1400);
      });
      d.querySelector('[data-dlg="non"]').onclick = () => { d.hidden = true; d.innerHTML = ''; };
    };
    d.hidden = false; rendre();
    d.onclick = e => { if (e.target === d) { d.hidden = true; d.innerHTML = ''; } };
  }

  /* ------------------------------------------------------------------
     Glisser-déposer (v1) : une réservation vers une autre case
     ------------------------------------------------------------------ */
  let glisse = null;
  function brancherGlisser(racine) {
    racine.addEventListener('dragstart', e => {
      const l = e.target.closest && e.target.closest('.sbx-r'); if (!l) return;
      glisse = { id: l.dataset.id, i: +l.dataset.i };
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', l.dataset.id); } catch (x) { /* ignore */ }
      l.classList.add('glisse');
    });
    racine.addEventListener('dragend', () => { glisse = null; document.querySelectorAll('.sbx-c.cible, .glisse').forEach(x => x.classList.remove('cible', 'glisse')); });
    racine.addEventListener('dragover', e => {
      if (!glisse) return;
      const c = e.target.closest && e.target.closest('.sbx-c[data-r]'); if (!c) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.sbx-c.cible').forEach(x => x !== c && x.classList.remove('cible'));
      c.classList.add('cible');
    });
    racine.addEventListener('drop', e => {
      if (!glisse) return;
      const c = e.target.closest && e.target.closest('.sbx-c[data-r]'); if (!c) return;
      e.preventDefault();
      const g = glisse; glisse = null;
      const r = API.reservations.deplacer(g.id, g.i, c.dataset.r, mn(c.dataset.h), U.par, SRC);
      if (!r.ok) { message('Déplacement refusé', r.raison, 'err'); rendrePlan(); return; }
      U.flash[g.id] = Date.now();
      const imp = txtImpact(r.impact);
      message(nomResa(r.resa) + ' déplacée', (resInfo(E(), c.dataset.r) || { r: {} }).r.nom + ', ' + c.dataset.h + (imp ? '. ' + majuscule(imp) + '.' : ''), 'ok');
    });
  }

  /* ------------------------------------------------------------------
     Vues : Activités / Anniversaires (fiches, plan de table de la v1)
     ------------------------------------------------------------------ */
  function allerVue(v) {
    U.vue = v;
    if (v !== 'activites') U.sousAnniv = v;     // « Anniversaires » rouvre la dernière sous-vue (fiches ou plan de table)
    fermerPop();
    const ids = { activites: 'toggle-laser-game', anniv: 'toggle-birthdays', plan: 'toggle-table-plan' };
    const b = document.getElementById(ids[v]); if (b) b.click();      // l'ancien code affiche la bonne vue
    document.body.classList.toggle('sbx-vue-act', v === 'activites');
    rendreNav();
    if (v === 'activites') { rendreBarre(); rendrePlan(); }
  }

  let tRendu = null;
  function toutRendre() { if (!U.monte) return; rendreNav(); if (U.vue === 'activites') { rendreBarre(); rendrePlan(); } if (U.tiroir) rendreTiroir(false); if (U.pop) rendrePop(); }

  function ruban() {
    const r = document.createElement('div');
    r.id = 'sbx-ruban'; r.className = 'sbx sbx-ruban';
    r.innerHTML = `<p><b>Sandbox</b> Données locales, aucune connexion à la production.</p>
      <nav><a class="sbx-b" href="e-v2.html" target="sbx-crm" rel="noopener">Ouvrir le CRM</a><a class="sbx-b" href="laser/chrono.html" target="sbx-chronos" rel="noopener">Page chronos</a><button type="button" class="sbx-b" data-x="simWeb">Réserver comme sur le site</button><button type="button" class="sbx-b" data-x="reinit">Repartir de zéro</button></nav>`;
    document.body.prepend(r);
  }
  function entete() {
    const h = $('.main-header'); if (!h) return;
    const vieux = $('#manual-sync-btn'); if (vieux) vieux.hidden = true;
    const p = document.createElement('span');
    p.id = 'sbx-lien'; p.className = 'sbx sbx-lien'; p.innerHTML = '<i></i><span>Relié au CRM</span>';
    p.title = 'Le front et le CRM partagent le même état : rien à synchroniser à la main.';
    h.insertBefore(p, h.children[1] || null);
    lienCRM();
  }
  /* panneaux historiques (Groupes du jour, Attente billard) : volets repliables sous 1840 px */
  function volets() {
    [['general-notes-container', 'Groupes du jour'], ['notepad-container', 'Attente billard']].forEach(([id, lib]) => {
      const c = document.getElementById(id); if (!c || c.querySelector('.sbx-volet')) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sbx-volet'; b.textContent = lib; b.setAttribute('aria-expanded', 'false');
      b.addEventListener('click', () => { const o = c.classList.toggle('sbx-ouvert'); b.setAttribute('aria-expanded', String(o)); });
      c.prepend(b);
    });
    const maj = () => document.body.classList.toggle('sbx-volets', window.innerWidth < 1840);
    maj(); window.addEventListener('resize', maj);
  }

  function monter() {
    if (U.monte) return;
    const vue = $('#laser-game-view'), barre = $('.view-toggle-container'); if (!vue) return;
    U.monte = true;
    /* l'ancienne barre d'onglets et les anciens Laser / Quiz-Karaoké sont remplacés */
    [...vue.children].forEach(el => el.classList.add('sbx-ancien'));
    if (barre) barre.classList.add('sbx-ancien');
    const ph = $('.sticky-placeholder'); if (ph) ph.classList.add('sbx-ancien');
    const nav = document.createElement('nav');
    nav.id = 'sbx-nav'; nav.className = 'sbx sbx-nav'; nav.setAttribute('aria-label', 'Vues');
    (barre || vue).parentNode.insertBefore(nav, barre || vue);
    const racine = document.createElement('section');
    racine.id = 'sbx'; racine.className = 'sbx sbx-tableau';
    racine.setAttribute('aria-label', 'Planning de l’activité');
    racine.innerHTML = '<div id="sbx-barre" class="sbx-barre"></div><div id="sbx-plan" class="sbx-plan"></div>';
    vue.prepend(racine);
    ['sbx-tiroir:aside', 'sbx-pop:div', 'sbx-dlg:div', 'sbx-fil:div'].forEach(x => { const [id, tag] = x.split(':'); const e = document.createElement(tag); e.id = id; e.className = 'sbx ' + id; if (id === 'sbx-tiroir' || id === 'sbx-pop' || id === 'sbx-dlg') e.hidden = true; document.body.appendChild(e); });
    $('#sbx-tiroir').setAttribute('aria-label', 'Réservation');
    ruban(); entete(); volets();
    /* les pastilles « chrono qui sonne » sont à côté des onglets ; quand on a défilé plus bas, elles flottent en bas à gauche */
    if ('IntersectionObserver' in window) new IntersectionObserver(e => document.body.classList.toggle('sbx-nav-cache', !e[0].isIntersecting)).observe(nav);

    document.addEventListener('click', e => {
      const el = e.target.closest('[data-x]');
      if (el && el.closest('.sbx')) { const f = X[el.dataset.x]; if (f) { e.preventDefault(); f(el.dataset, el, e); } return; }
      if (U.pop && !e.target.closest('#sbx-pop')) fermerPop();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (!$('#sbx-dlg').hidden) { $('#sbx-dlg').hidden = true; return; } if (U.pop) { fermerPop(); return; } if (U.tiroir) fermerTiroir(); }
      if (e.key === 'Enter' && e.target.matches && e.target.matches('.sbx-ch-libre input')) { e.preventDefault(); X.chronoLibre({ r: e.target.dataset.r }, e.target); }
    });
    document.addEventListener('change', e => {
      if (e.target.matches('[data-x-change="date"]') && e.target.value) { U.j = T.jourDeIso(e.target.value); rendreBarre(); rendrePlan(); return; }
      if (e.target.matches('[data-x-change="paye"]')) { payer(e.target.dataset.id, e.target.checked); return; }
      const form = e.target.closest('form[data-form="resa"]');
      if (form) {
        const t = U.tiroir; t.f = lireForm(form);
        if (['act', 'date'].includes(e.target.name)) {
          const nf = formDefaut({ act: t.f.act, j: t.f.j });
          Object.assign(nf, { client: t.f.client, tel: t.f.tel, note: t.f.note, par: t.f.par, pers: t.f.pers }); t.f = nf;
          $('#sbx-tiroir').innerHTML = formulaire(E(), t.f, t.edition ? E().reservations.find(r => r.id === t.id) : null);
        } else if (e.target.name === 'h') {
          const Et = E(), a = M.act(Et, t.f.act), s = M.grille(Et, a, t.f.j).slots.find(x => x.h === t.f.h);
          if (s) { const F = M.etatSlot(Et, s).formules, ok = F.find(f => f.nom === t.f.formule && f.reste > 0) || F.find(f => f.reste > 0); if (ok && ok.nom !== t.f.formule) { const r = form.querySelector(`[name="formule"][value="${CSS.escape(ok.nom)}"]`); if (r) { r.checked = true; t.f.formule = ok.nom; } } }
        }
        majApercu();
      }
    });
    document.addEventListener('input', e => { const form = e.target.closest('form[data-form="resa"]'); if (form) { U.tiroir.f = lireForm(form); majApercu(); } });
    document.addEventListener('submit', e => {
      const form = e.target.closest('form[data-form="resa"]'); if (!form) return;
      e.preventDefault();
      const t = U.tiroir, f = lireForm(form);
      if (f.par) { U.par = f.par; LS.set('par', f.par); }
      let r;
      if (t.edition) {
        const patch = { h: f.h, formule: f.formule, pers: f.pers, client: f.client, tel: f.tel, note: f.note, j: f.j };
        if (f.salle) patch.salle = f.salle;
        if (f.total !== '' && f.total != null) patch.total = f.total;
        r = API.reservations.modifier(t.id, patch, SRC);
      } else r = API.reservations.creer(versApi(f), SRC);
      if (!r.ok) { message('Réservation impossible', r.raison, 'err'); majApercu(); return; }
      U.flash[r.resa.id] = Date.now();
      const a = M.act(E(), r.resa.act), imp = txtImpact(r.impact);
      if (t.edition) { U.tiroir = { mode: 'fiche', id: r.resa.id }; rendreTiroir(true); } else fermerTiroir();
      if (r.resa.jour !== U.j) U.j = r.resa.jour;
      if (a && U.act !== a.id && actsFront(E()).some(x => x.id === a.id)) { U.act = a.id; LS.set('act', a.id); }
      toutRendre();
      message((t.edition ? 'Modifiée : ' : 'Réservé : ') + a.nom + ' ' + hm(r.resa.debut) + ', ' + nomResa(r.resa) + ' (' + r.resa.pers + ' p.)', imp ? majuscule(imp) + '.' : 'Le site web n’est pas concerné.', 'ok');
    });
    brancherGlisser(racine);
    window.addEventListener('resize', () => { if (U.pop) fermerPop(); const p = $('#sbx-plan'); if (p && p.firstChild) p.classList.toggle('large', p.firstChild.scrollWidth > p.clientWidth + 2); });

    /* le temps passe : chronos 4×/s ; créneaux passés et ligne « maintenant » chaque minute */
    setInterval(tic, 250);
    let minute = T.maintenant().min, aujourdhui = T.maintenant().j;
    setInterval(() => {
      const t = T.maintenant();
      if (t.j !== aujourdhui) { if (U.j === aujourdhui) U.j = t.j; aujourdhui = t.j; minute = t.min; toutRendre(); return; }
      if (t.min !== minute) { minute = t.min; if (!glisse && U.vue === 'activites' && !document.querySelector('.sbx-ch-libre input:focus')) rendrePlan(); }
    }, 5000);

    /* ce qui arrive du CRM et des autres postes */
    let cfgAvant = JSON.stringify((E().config || {}).activites || []);
    const ids = new Set(E().reservations.map(r => r.id));
    SB.ecouter(m => {
      if (m.evt) {
        if (m.local) return;
        const d = m.evt.details || {};
        if (m.evt.type === 'reservation.creee') {
          U.flash[d.id] = Date.now();
          const imp = txtImpact(d.impact);
          message((d.canal === 'Site web' ? 'Nouvelle réservation en ligne : ' : 'Réservé sur un autre poste : ') + d.nom + ' ' + d.h + (d.j !== T.maintenant().j ? ', ' + libJour(d.j).toLowerCase() : '') + ', ' + d.client + ' (' + d.pers + ' p.)', imp ? majuscule(imp) + '.' : '', 'web');
        }
        if (m.evt.type === 'creneau.ferme' || m.evt.type === 'creneau.rouvert') message(d.nom + ' ' + d.h + ' : ' + (d.portee === 'web' ? (m.evt.type === 'creneau.ferme' ? 'retiré du site' : 'remis sur le site') : (m.evt.type === 'creneau.ferme' ? 'fermé partout' : 'rouvert')) + (d.par ? ' par ' + d.par : ''), '');
        return;
      }
      const c = m.cles || [];
      if (!c.length) return;
      if (!m.local) lienCRM();
      if (c.includes('config') && !m.local) {
        const avant = JSON.parse(cfgAvant), apres = (E().config || {}).activites || [], Et = E();
        apres.forEach(a => {
          const b = avant.find(x => x.id === a.id);
          const vis = M.front(a, Et).visible && a.modele !== 'vente' && a.modele !== 'combo' && (a.ressources || []).length;
          if (!b && vis) message('Nouvelle activité : ' + a.nom, 'Un onglet, ' + pl(a.ressources.length, 'colonne') + ' et ' + pl(a.ressources.length, 'chrono') + ', créés dans le CRM.', 'web');
          else if (b) {
            const visAvant = M.front(b, Et).visible && (b.ressources || []).length;
            if (vis && !visAvant) message(a.nom + ' est maintenant sur le front', 'Réglé dans le CRM.', 'web');
            if (!vis && visAvant) message(a.nom + ' n’est plus affichée ici', 'Réglé dans le CRM.');
            (a.ressources || []).forEach(x => { const y = (b.ressources || []).find(z => z.id === x.id); if (y && !!y.hs !== !!x.hs) message(x.nom + (x.hs ? ' hors service' : ' remise en service'), 'Réglé dans le CRM.', x.hs ? 'err' : 'ok'); if (!y && vis) message(a.nom + ' : ' + x.nom + ' ajoutée', 'Une colonne et un chrono de plus.', 'web'); });
          }
        });
        avant.forEach(b => { if (!apres.some(a => a.id === b.id)) message('Activité retirée : ' + b.nom, 'Supprimée dans le CRM.'); });
        cfgAvant = JSON.stringify(apres);
      }
      if (c.includes('reservations')) E().reservations.forEach(r => { if (!ids.has(r.id)) { ids.add(r.id); if (!m.local) U.flash[r.id] = Date.now(); } });
      if (c.length === 1 && c[0] === 'chronos') { if (U.tiroir) rendreTiroir(false); tic(); return; }    // un chrono : pas besoin de tout redessiner
      clearTimeout(tRendu);
      tRendu = setTimeout(() => {
        if (glisse) return;
        const focusChrono = document.activeElement && document.activeElement.closest && document.activeElement.closest('.sbx-ch-libre');
        rendreNav();
        if (c.includes('config')) presetsHistoriques();
        if (U.vue === 'activites') { rendreBarre(); if (!focusChrono) rendrePlan(); }
        if (U.tiroir) rendreTiroir(false);
        if (U.pop) rendrePop();
      }, 40);
    });

    rendreNav(); rendreBarre(); rendrePlan(); presetsHistoriques();
    document.body.classList.add('sbx-vue-act');
    adapterMobile();
  }

  /* mobile : « Planning » = onglets + liste des créneaux ; « Chronos » = tous les chronos */
  function adapterMobile() {
    if (!window.matchMedia('(max-width: 768px)').matches) return;
    const vl = $('#mobile-laser-view .mobile-calendar-container'), vc = $('#mobile-chronos-view');
    const sn = $('#mobile-laser-view .mobile-sub-nav'); if (sn) sn.style.display = 'none';
    if (vl) {
      [...vl.children].forEach(c => c.classList.add('sbx-ancien'));
      const z = document.createElement('section'); z.className = 'sbx sbx-tableau sbx-mob'; vl.appendChild(z);
      z.appendChild($('#sbx-nav')); z.appendChild($('#sbx-barre')); z.appendChild($('#sbx-plan'));
    }
    if (vc) {
      [...vc.children].forEach(c => { if (!c.classList.contains('enable-notifications-btn')) c.classList.add('sbx-ancien'); });
      const z = document.createElement('section'); z.id = 'sbx-chronos-mob'; z.className = 'sbx sbx-tableau sbx-mob sbx-ch-liste'; vc.appendChild(z);
      const remplir = () => { const Et = E(); z.innerHTML = actsFront(Et).map(a => `<h3 class="sbx-ch-act" style="--c:${esc(a.c || '#567')}">${esc(a.nom)}</h3>` + a.ressources.map(r => chronoHtml(a, r, Et, 'liste')).join('')).join(''); tic(); };
      remplir(); SB.ecouter(m => { if ((m.cles || []).includes('config')) remplir(); });
    }
    document.querySelectorAll('.mobile-nav-btn').forEach(b => { if (b.dataset.view === 'mobile-laser-view') b.textContent = 'Planning'; if (b.dataset.view === 'mobile-qk-view') b.style.display = 'none'; if (b.dataset.view === 'mobile-chronos-view') b.textContent = 'Chronos'; });
    document.body.classList.add('sbx-mobile');
  }

  /* ------------------------------------------------------------------
     Démarrage : après la connexion de l'ancien gestionnaire. Si la
     sandbox est vide (CRM jamais ouvert), on charge le CRM en arrière-
     plan : c'est lui qui fournit la configuration.
     ------------------------------------------------------------------ */
  function demarrer() {
    if (SB.pret()) { monter(); return; }
    const att = document.createElement('div');
    att.className = 'sbx sbx-amorce'; att.innerHTML = '<p>Préparation de la sandbox : chargement de la configuration du CRM…</p>';
    const vue = $('#laser-game-view'); if (vue) vue.prepend(att);
    const f = document.createElement('iframe');
    f.src = 'e-v2.html'; f.title = 'Amorçage de la sandbox'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;top:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const debut = Date.now();
    const t = setInterval(() => {
      if (SB.pret()) { clearInterval(t); att.remove(); setTimeout(() => f.remove(), 500); monter(); }
      else if (Date.now() - debut > 15000) { clearInterval(t); att.innerHTML = '<p>La configuration du CRM n’a pas pu être chargée. Ouvrez <a href="e-v2.html" target="sbx-crm">le CRM</a> une fois dans ce navigateur, puis rechargez cette page.</p>'; }
    }, 250);
  }
  let lance = false;
  const go = () => { if (lance) return; const mc = $('#main-container'), mob = $('#mobile-container'); if ((mc && mc.style.display === 'block') || (mob && mob.style.display === 'block')) { lance = true; demarrer(); } };
  document.addEventListener('sbx:auth', () => setTimeout(go, 30));
  document.addEventListener('DOMContentLoaded', () => { let n = 0; const t = setInterval(() => { go(); if (lance || ++n > 80) clearInterval(t); }, 150); });
  window.__sbxFront = { U, toutRendre, X };
})();
