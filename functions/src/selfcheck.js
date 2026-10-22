// Self-check runnable: node functions/src/selfcheck.js
const assert = require('assert');
const {
  shouldRunNow,
  detectLaserFormula,
  buildLgTimes,
  pickLgRoom,
  buildQkSlot,
  karaokeDurationMinutes,
  extractChildFirstName,
  extractChildAge,
  extractAmountPaid,
  extractCakeAndChampomy,
  guessBirthdayFormulaKey,
  dateToStr,
  monthsSpanningDays,
  daysUntilEvent,
  DETAIL_REFRESH_DAYS_AHEAD,
} = require('./sync');
const { isTimeSlotAvailable, isQkSlotAvailable } = require('./slotConflict');
const { assignLgRoom } = require('./assignLgRoom');
const { parseHHMMToMinutes, intervalsOverlap, findOverlappingOpenSlotIds, computeClosuresForBookedRows } = require('./creneauSync');
const { countLanes, aggregateLanesByHour } = require('./bowlingLanes');
const { countNonQuizBookings, countManualNonQuizBookings, computeSlotsToCloseWhenFull, computeDateWindow, ANNIV_CAPACITY_DAYS_AHEAD } = require('./anniversaireCapacity');

// Helper de test: aplatit computeClosuresForBookedRows en une simple liste d'id fermés (triée),
// pour comparer facilement aux scénarios ci-dessous.
function closedIds(rows) {
  return computeClosuresForBookedRows(rows)
    .flatMap((c) => c.toClose.map((r) => r.id))
    .sort();
}

// shouldRunNow — fermé 2h-12h30 (magasin fermé, aucun scan quoi qu'il arrive)
assert.strictEqual(shouldRunNow(new Date(2026, 0, 1, 5, 0), null), false, 'closed band (2h-12h30) must skip');
assert.strictEqual(shouldRunNow(new Date(2026, 0, 1, 9, 0), null), false, 'closed band (2h-12h30) must skip even without lastRunAt');
assert.strictEqual(shouldRunNow(new Date(2026, 0, 1, 12, 29), new Date(2026, 0, 1, 0, 0)), false, 'still closed 1min before 12h30');
// throttle 12h30-13h: run bloqué si dernier run < 30min
assert.strictEqual(
  shouldRunNow(new Date(2026, 0, 1, 12, 40), new Date(2026, 0, 1, 12, 30)),
  false,
  '12h30-13h band must throttle to 30min'
);
assert.strictEqual(
  shouldRunNow(new Date(2026, 0, 1, 13, 5), new Date(2026, 0, 1, 12, 30)),
  true,
  '12h30-13h band must run again after 30min'
);
// 13h-00h: toujours run
assert.strictEqual(
  shouldRunNow(new Date(2026, 0, 1, 20, 0), new Date(2026, 0, 1, 19, 55)),
  true,
  '13-24h band must always run'
);

// detectLaserFormula — champ réel confirmé via crmSyncPreview (commande #252381): event.name
assert.strictEqual(detectLaserFormula({ name: 'anniversaire / Bowling Jeunes' }), null, 'no laser keyword -> null');
assert.strictEqual(
  detectLaserFormula({ name: 'anniversaire / Bowling + Laser Game' }).standalone,
  false,
  'laser + bowling ensemble -> pas autonome, 1 créneau'
);
assert.strictEqual(
  detectLaserFormula({ name: 'anniversaire / Laser Jeune' }).standalone,
  true,
  'laser sans bowling -> formule autonome, 2 créneaux'
);
// même exemple réel complet (commande #252381, xiong veronique) qui a mis en évidence le bug:
// scanner tous les champs (title, user, url...) au lieu de juste "name" donnait standalone=false à tort.
assert.strictEqual(
  detectLaserFormula({
    name: 'anniversaire / Laser Jeune',
    title: 'LJ - xiong veronique (13pers) (Acc)',
    user: 'xiong veronique',
    url: 'https://admin.spacebowling.fr/admin/activity/anniversaire/orders/252381',
    piste: 'N/D',
    object_status: 'Accompte versé',
  }).standalone,
  true,
  'exemple réel #252381: doit rester autonome malgré les autres champs texte'
);

// buildLgTimes — standalone = 2 créneaux, la 2e session démarre 1h après le DÉBUT de la 1ère
// (pas après sa fin) pour rester sur la grille 30min peu importe la durée de session.
const standaloneTimes = buildLgTimes({ y: 2026, m: 8, d: 1, h: 14, i: 0 }, { isLaser: true, standalone: true });
assert.strictEqual(standaloneTimes.length, 2, 'standalone formula must produce 2 slots');
assert.strictEqual(standaloneTimes[0].endTime, 14.5, 'first slot 30min duration (hors anniversaire)');
assert.strictEqual(standaloneTimes[1].startTime, 15, '1h après le début de la 1ère session');

// buildLgTimes — anniversaire "Laser Jeune": 20min/session, mais 2e session à start1+1h pile
// (ex réel: 15h30 puis 16h30, pas 16h20 — sinon désaligné de la grille 30min)
const annivTimes = buildLgTimes(
  { y: 2026, m: 8, d: 1, h: 15, i: 30, activity: 'anniversaire' },
  { isLaser: true, standalone: true }
);
assert.strictEqual(annivTimes[0].duration, 20, 'anniversaire session = 20min, pas 30');
assert.strictEqual(annivTimes[0].startTime, 15.5, '1ère session 15h30');
assert.strictEqual(annivTimes[1].startTime, 16.5, '2e session 1h après le début de la 1ère -> 16h30');

// extractAmountPaid — "Montant payé" différent du montant total (acompte réellement encaissé)
const orderDetailHtml = `
  <h5>Montant total</h5><p>124,00 €</p>
  <h5>Montant payé</h5>
  <p class="card-text text-primary">50,00
      €
  </p>`;
assert.strictEqual(extractAmountPaid(orderDetailHtml), 50, 'extrait le montant payé (pas le total)');
assert.strictEqual(extractAmountPaid('<p>Rien à voir ici</p>'), null, 'pas de libellé -> null');

// buildLgTimes — formule enfant = 1 créneau
const kidTimes = buildLgTimes({ y: 2026, m: 8, d: 1, h: 14, i: 0 }, { isLaser: true, standalone: false });
assert.strictEqual(kidTimes.length, 1, 'kid formula -> 1 slot');

// pickLgRoom — salle selon effectif, bascule sur l'autre salle si la préférée est prise
assert.strictEqual(pickLgRoom(15, '2026-08-01', kidTimes, [], {}), assignLgRoom(15).room, 'room follows assignLgRoom rule when free');
const room1Taken = [{ id: 'z', date: '2026-08-01', room: 1, startTime: 14, endTime: 14.5 }];
assert.strictEqual(pickLgRoom(8, '2026-08-01', kidTimes, room1Taken, {}), 2, '2 résas laser même heure -> 2e groupe bascule salle 2');
const bothRoomsTaken = [
  { id: 'z1', date: '2026-08-01', room: 1, startTime: 14, endTime: 14.5 },
  { id: 'z2', date: '2026-08-01', room: 2, startTime: 14, endTime: 14.5 },
];
assert.strictEqual(pickLgRoom(15, '2026-08-01', kidTimes, bothRoomsTaken, {}), null, '>12 pers -> room2 seule option, si prise aussi -> null (vrai conflit)');

// isTimeSlotAvailable — overlap detection
const existing = [{ id: 'x', date: '2026-08-01', room: 1, startTime: 14, endTime: 14.5 }];
assert.strictEqual(isTimeSlotAvailable('2026-08-01', 14, 14.5, 1, existing, {}), false, 'exact overlap must conflict');
assert.strictEqual(isTimeSlotAvailable('2026-08-01', 15, 15.5, 1, existing, {}), true, 'no overlap must be free');
assert.strictEqual(isTimeSlotAvailable('2026-08-01', 14, 14.5, 1, existing, { '2026-08-01.14.1': true }), false, 'manually closed slot must block');

// buildQkSlot — mirroir karaoke/quizzboxing, quizzboxing -> 'quiz'
const quizSlot = buildQkSlot({ y: 2026, m: 8, d: 1, h: 20, i: 0, activity: 'quizzboxing' });
assert.strictEqual(quizSlot.activity, 'quiz', 'quizzboxing maps to quiz activity');
assert.strictEqual(quizSlot.duration, 60, 'quizzboxing default 60min (pas de règle prix connue)');

// karaoke: durée devinée via le prix/pers (8€ -> 30min, 12€ -> 1h)
const karaoke30 = buildQkSlot({ y: 2026, m: 8, d: 1, h: 20, i: 0, activity: 'karaoke', nbr_participants: 2, amount_total: 16 });
assert.strictEqual(karaoke30.duration, 30, '8€/pers -> 30min');
assert.strictEqual(karaoke30.endTime, 20.5, '30min slot end time');
const karaoke60 = buildQkSlot({ y: 2026, m: 8, d: 1, h: 20, i: 0, activity: 'karaoke', nbr_participants: 3, amount_total: 36 });
assert.strictEqual(karaoke60.duration, 60, '12€/pers -> 1h');
assert.strictEqual(karaoke60.activity, 'karaoke', 'karaoke stays karaoke');

// isQkSlotAvailable — overlap par activity, pas par room
const qkExisting = [{ id: 'y', date: '2026-08-01', activity: 'karaoke', startTime: 20, endTime: 21 }];
assert.strictEqual(isQkSlotAvailable('2026-08-01', 20, 21, 'karaoke', qkExisting, {}), false, 'karaoke overlap conflicts');
assert.strictEqual(isQkSlotAvailable('2026-08-01', 20, 21, 'quiz', qkExisting, {}), true, 'different activity same time is free');

// extractChildFirstName — priorité au blob JSON (vrai format confirmé sur commande #260293)
const realDetailHtml = `
  <script>
    console.log({"age_enfant":"7","date_enfant":"2019-08-27","prenom_enfant":"Illyanna"});
  </script>
  <ul class="list-group">
    <li><i class="fa fa-caret-right"></i> Age fêté de l&#039;enfant<span class="float-end">7</span></li>
    <li><i class="fa fa-caret-right"></i> Prénom de l&#039;enfant<span class="float-end">Illyanna</span></li>
  </ul>`;
assert.strictEqual(extractChildFirstName(realDetailHtml), 'Illyanna', 'extrait via le blob JSON en priorité');

// bug réel vu en prod: é (échappement JSON) doit devenir "é", pas rester tel quel
const escapedNameHtml = `<script>console.log({"age_enfant":"7","prenom_enfant":"L\\u00e9andro"});</script>`;
assert.strictEqual(extractChildFirstName(escapedNameHtml), 'Léandro', 'décode les échappements unicode JSON (\\u00e9 -> é)');

// repli HTML si jamais pas de blob JSON — apostrophe en entité &#039; comme sur le vrai site
const htmlOnlyEntity = `<li><i class="fa fa-caret-right"></i> Prénom de l&#039;enfant<span class="float-end">Mégara</span></li>`;
assert.strictEqual(extractChildFirstName(htmlOnlyEntity), 'Mégara', 'repli HTML gère &#039; comme une apostrophe normale');

const detailHtmlTable = `
  <div class="card"><h4>Informations complémentaires</h4>
    <table><tr><td>Prénom de l'enfant</td><td>Mégara</td></tr>
    <tr><td>Date de naissance</td><td>07/08/2020</td></tr></table>
  </div>`;
assert.strictEqual(extractChildFirstName(detailHtmlTable), 'Mégara', 'repli HTML avec apostrophe littérale, depuis une table');
assert.strictEqual(extractChildFirstName('<p>Rien à voir ici</p>'), null, 'pas de libellé ni de blob -> null');

// extractChildAge — même blob JSON, repli HTML
assert.strictEqual(extractChildAge(realDetailHtml), 7, 'age_enfant extrait du blob JSON');
const ageHtmlOnly = `<li><i class="fa fa-caret-right"></i> Age fêté de l&#039;enfant<span class="float-end">9</span></li>`;
assert.strictEqual(extractChildAge(ageHtmlOnly), 9, 'repli HTML pour l’âge');

// extractCakeAndChampomy — depuis les lignes du tableau Produits
const productsHtml = `
  <table><tbody>
    <tr><td>Gâteau d'anniversaire Factice (Donuts au chocolat)</td><td>1</td><td>0,00 €</td></tr>
    <tr><td>Bouteille de champomy (75cl)</td><td>2</td><td>20,00 €</td></tr>
    <tr><td>Bowling + Laser Game</td><td>6</td><td>19,00 €</td></tr>
  </tbody></table>`;
const products = extractCakeAndChampomy(productsHtml);
assert.strictEqual(products.cake, 'chocolat', 'gâteau chocolat détecté');
assert.strictEqual(products.champomyCount, 2, 'quantité champomy détectée (2 bouteilles)');
const noChampomy = extractCakeAndChampomy('<table><tr><td>Bowling Enfant</td><td>6</td></tr></table>');
assert.strictEqual(noChampomy.champomyCount, 0, 'pas de champomy -> 0');
assert.strictEqual(noChampomy.cake, null, 'pas de gâteau -> null');

// guessBirthdayFormulaKey — mapping vers les 5 formulaKey du formulaire fiche anniversaire (champ "name")
assert.strictEqual(guessBirthdayFormulaKey({ name: 'anniversaire / Bowling + Laser Game' }), 'bowling_laser');
assert.strictEqual(guessBirthdayFormulaKey({ name: 'anniversaire / Laser Jeune' }), 'laser_jeune');
assert.strictEqual(guessBirthdayFormulaKey({ name: 'anniversaire / Bowling Jeunes' }), 'bowling_jeune');
assert.strictEqual(guessBirthdayFormulaKey({ name: 'anniversaire / Bowling Enfants' }), 'bowling_enfant');
assert.strictEqual(guessBirthdayFormulaKey({ name: 'anniversaire / Quiz Boxing' }), 'quiz');
// exemple réel #252381 complet, même vérif que pour detectLaserFormula
assert.strictEqual(
  guessBirthdayFormulaKey({
    name: 'anniversaire / Laser Jeune',
    title: 'LJ - xiong veronique (13pers) (Acc)',
    user: 'xiong veronique',
  }),
  'laser_jeune',
  'exemple réel #252381: doit donner laser_jeune, pas bowling_laser'
);

// monthsSpanningDays — fenêtre J+14: 1 seul mois la plupart du temps, 2 si ça déborde sur le mois suivant
assert.deepStrictEqual(monthsSpanningDays(new Date(2026, 7, 1), 14), [{ year: 2026, month: 8 }], '1er août + 14j reste en août');
assert.deepStrictEqual(
  monthsSpanningDays(new Date(2026, 7, 25), 14),
  [{ year: 2026, month: 8 }, { year: 2026, month: 9 }],
  '25 août + 14j déborde sur septembre -> 2 mois à fetch'
);
assert.deepStrictEqual(
  monthsSpanningDays(new Date(2026, 11, 25), 14),
  [{ year: 2026, month: 12 }, { year: 2027, month: 1 }],
  'fin décembre + 14j -> passe à janvier 2027 (changement d\'année géré)'
);

// dateToStr — même format "YYYY-MM-DD" que le reste du site (formatDateForStorage côté client)
assert.strictEqual(dateToStr(new Date(2026, 7, 5)), '2026-08-05', 'zero-pad mois/jour');

// --- creneauSync: fermeture des créneaux CRM en doublon (karaoke 30min vs 1h) ---
assert.strictEqual(parseHHMMToMinutes('15:30'), 930, 'HH:MM -> minutes');
assert.strictEqual(intervalsOverlap({ start: 930, end: 960 }, { start: 900, end: 960 }), true, '15h30-16h chevauche 15h-16h');
assert.strictEqual(intervalsOverlap({ start: 930, end: 960 }, { start: 870, end: 930 }), false, '14h30-15h30 touche sans chevaucher 15h30-16h');

// Exemple exploitant: résa 30min à 15h30 -> doit fermer le 1h de 15h ET le 1h de 15h30, PAS le 1h
// de 14h30 (touche sans chevaucher) ni les 30min voisins (15h/16h, back-to-back donc jamais en conflit).
const scenarioA = [
  { id: 'B', heure_debut: '15:30', open: 1, order_id: 555, formule: { duration: '00:30' } },
  { id: 'H1', heure_debut: '15:00', open: 1, order_id: null, formule: { duration: '01:00' } },
  { id: 'H2', heure_debut: '15:30', open: 1, order_id: null, formule: { duration: '01:00' } },
  { id: 'H0', heure_debut: '14:30', open: 1, order_id: null, formule: { duration: '01:00' } },
  { id: 'T30a', heure_debut: '15:00', open: 1, order_id: null, formule: { duration: '00:30' } },
  { id: 'T30b', heure_debut: '16:00', open: 1, order_id: null, formule: { duration: '00:30' } },
];
assert.deepStrictEqual(
  closedIds(scenarioA),
  ['H1', 'H2'],
  'résa 30min à 15h30 doit fermer les 1h de 15h et 15h30 uniquement'
);

// Exemple exploitant: résa 1h à 16h -> doit fermer les 30min de 16h ET 16h30, plus les 1h de 15h30
// ET 16h30 (grille 30min pour une formule 1h = les voisins immédiats se chevauchent aussi entre eux).
const scenarioB = [
  { id: 'B2', heure_debut: '16:00', open: 1, order_id: 777, formule: { duration: '01:00' } },
  { id: 'T30c', heure_debut: '16:00', open: 1, order_id: null, formule: { duration: '00:30' } },
  { id: 'T30d', heure_debut: '16:30', open: 1, order_id: null, formule: { duration: '00:30' } },
  { id: 'H3', heure_debut: '15:30', open: 1, order_id: null, formule: { duration: '01:00' } },
  { id: 'H4', heure_debut: '16:30', open: 1, order_id: null, formule: { duration: '01:00' } },
  { id: 'H5', heure_debut: '17:00', open: 1, order_id: null, formule: { duration: '01:00' } },
  { id: 'ClosedAlready', heure_debut: '16:00', open: 0, order_id: null, formule: { duration: '00:30' } },
  { id: 'Reserved', heure_debut: '20:00', open: 1, order_id: 999, formule: { duration: '00:30' } }, // résa sans rapport, ne doit rien déclencher
];
assert.deepStrictEqual(
  closedIds(scenarioB),
  ['H3', 'H4', 'T30c', 'T30d'],
  'résa 1h à 16h doit fermer les 30min de 16h/16h30 et les 1h de 15h30/16h30 (pas 17h, pas déjà fermé/réservé)'
);

// computeClosuresForBookedRows — vérifie aussi le détail narratif (heure/durée) utilisé pour les logs
const closuresB = computeClosuresForBookedRows(scenarioB);
assert.strictEqual(closuresB.length, 1, 'un seul créneau réservé (B2) dans scenarioB -> un seul événement de fermeture');
assert.strictEqual(closuresB[0].booked.heure_debut, '16:00', 'le créneau réservé identifié est bien celui de 16h');
assert.deepStrictEqual(closuresB[0].toClose.map((r) => r.heure_debut).sort(), ['15:30', '16:00', '16:30', '16:30'], 'détail des heures fermées');

// findOverlappingOpenSlotIds — utilisé pour la fermeture après résa manuelle (pas de order_id CRM,
// on chevauche juste un intervalle donné par le site).
assert.deepStrictEqual(
  findOverlappingOpenSlotIds(scenarioB, { start: 960, end: 1020 }, null).sort(),
  ['H3', 'H4', 'T30c', 'T30d'],
  'même résultat en passant directement l\'intervalle 16h-17h (cas résa manuelle)'
);

// Cas quiz manuel (grille CRM à l'heure pile, pas de créneau à 15h30): une résa manuelle du site à
// 15h30 tombe hors grille -> pas de ligne exacte, mais doit quand même fermer les créneaux à l'heure
// pile qui chevauchent. 30min -> ferme juste 15h. 1h -> ferme 15h ET 16h.
const quizRows = [
  { id: 'Q15', heure_debut: '15:00', open: 1, order_id: null, formule: { duration: '01:00' } },
  { id: 'Q16', heure_debut: '16:00', open: 1, order_id: null, formule: { duration: '01:00' } },
  { id: 'Q17', heure_debut: '17:00', open: 1, order_id: null, formule: { duration: '01:00' } },
];
assert.deepStrictEqual(
  findOverlappingOpenSlotIds(quizRows, { start: 930, end: 960 }, null),
  ['Q15'],
  'résa manuelle quiz 15h30 (30min) -> ferme uniquement 15h'
);
assert.deepStrictEqual(
  findOverlappingOpenSlotIds(quizRows, { start: 930, end: 990 }, null),
  ['Q15', 'Q16'],
  'résa manuelle quiz 15h30 (1h) -> ferme 15h et 16h'
);

// 23h55 = artefact CRM pour représenter minuit sans compter comme le jour suivant (confirmé par
// l'exploitant) -> jamais fermable, même s'il chevauche mathématiquement. Grille réelle du 18/08.
const midnightRows = [
  { id: 45224, heure_debut: '23:00', open: 1, order_id: null, formule: { duration: '00:55' } },
  { id: 45225, heure_debut: '23:00', open: 1, order_id: null, formule: { duration: '00:30' } },
  { id: 45336, heure_debut: '23:30', open: 1, order_id: null, formule: { duration: '00:55' } },
  { id: 45337, heure_debut: '23:30', open: 1, order_id: null, formule: { duration: '00:30' } },
  { id: 45448, heure_debut: '23:55', open: 1, order_id: null, formule: { duration: '00:55' } },
  { id: 45449, heure_debut: '23:55', open: 1, order_id: null, formule: { duration: '00:30' } },
];
assert.deepStrictEqual(
  findOverlappingOpenSlotIds(midnightRows, { start: 1380, end: 1440 }, null).sort(),
  [45224, 45225, 45336, 45337],
  'résa karaoké 23h/1h ferme les 4 vrais créneaux (23h+23h30) mais jamais les 23h55 (artefact minuit)'
);

// A l'inverse, une résa manuelle à MINUIT doit fermer les deux 23h55 + le 23h30/1h (mais pas le
// 23h30/30min, qui touche minuit sans le chevaucher) -> excludeMidnightPlaceholder:false ici.
assert.deepStrictEqual(
  findOverlappingOpenSlotIds(midnightRows, { start: 1440, end: 1470 }, null, { excludeMidnightPlaceholder: false }).sort(),
  [45336, 45448, 45449],
  'résa minuit (00h00) ferme les deux 23h55 et le 23h30/1h (55min), pas le 23h30/30min ni les 23h'
);

// karaokeDurationMinutes — échantillons réels capturés sur le vrai planning CRM (aout 2026)
assert.strictEqual(
  karaokeDurationMinutes({ name: 'karaoke / Formule Karaoké 30 minutes', amount_total: '8.00', nbr_participants: 2 }),
  30,
  'nom réel "...30 minutes" -> 30min'
);
assert.strictEqual(
  karaokeDurationMinutes({ name: 'karaoke / Formule Karaoké', amount_total: '36.00', nbr_participants: 3 }),
  60,
  'nom réel sans suffixe -> 1h'
);
// repli prix/participant si jamais "name" absent
assert.strictEqual(karaokeDurationMinutes({ amount_total: 24, nbr_participants: 3 }), 30, 'repli sans name: 8€/pers -> 30min');
assert.strictEqual(karaokeDurationMinutes({ amount_total: 24, nbr_participants: 2 }), 60, 'repli sans name: 12€/pers -> 1h');

// --- bowlingLanes: pistes réservées par heure (échantillons réels du vrai planning bowling) ---
assert.strictEqual(countLanes('N/D'), 1, 'pas de <span> -> 1 piste (ex réel: 7 pers)');
assert.strictEqual(countLanes('<span>Piste:N/D</span><span>Piste:N/D</span>'), 2, '2 <span> -> 2 pistes (ex réel: 14 pers)');
assert.strictEqual(countLanes(null), 1, 'champ absent -> 1 piste par défaut');

const bowlingEventsSample = [
  { y: 2026, m: 8, d: 2, h: 15, i: 0, nbr_participants: 14, user: 'Derradj Nafiha', piste: '<span>Piste:N/D</span><span>Piste:N/D</span>' },
  { y: 2026, m: 8, d: 2, h: 15, i: 0, nbr_participants: 3, user: 'Mahoudeau Guillaume', piste: 'N/D' },
  { y: 2026, m: 8, d: 2, h: 16, i: 0, nbr_participants: 4, user: 'Ferreira Milene', piste: 'N/D' },
  { y: 2026, m: 8, d: 2, h: 20, i: 0, nbr_participants: 7, user: 'Bancilhon Sophie', piste: 'N/D' },
  { y: 2026, m: 8, d: 7, h: 14, i: 0, nbr_participants: 3, user: 'Maurat Florent', piste: 'N/D' }, // autre jour -> exclu
];
const aggregated = aggregateLanesByHour(bowlingEventsSample, '2026-08-02');
assert.strictEqual(aggregated.length, 3, 'jours différents exclus, 3 heures distinctes le 02/08 (15h, 16h, 20h)');
assert.strictEqual(aggregated[0].hour, 15, 'trié par heure croissante');
assert.strictEqual(aggregated[0].totalLanes, 3, '15h: 2 pistes (14 pers) + 1 piste (3 pers) = 3');
assert.strictEqual(aggregated[0].bookings.length, 2, '15h: 2 résas distinctes');
assert.strictEqual(aggregated[1].hour, 16);
assert.strictEqual(aggregated[1].totalLanes, 1, '16h: 1 résa de 4 pers -> 1 piste');
assert.strictEqual(aggregated[2].hour, 20);
assert.strictEqual(aggregated[2].totalLanes, 1, '20h: 1 résa de 7 pers -> 1 piste (pile la limite)');

// --- anniversaireCapacity: fermeture des créneaux anniv restants une fois 11 résas atteintes ---
// Formule "Quiz boxing" (formule_id 12, confirmée par capture réseau réelle) jamais comptée, jamais
// fermée. Les 4 autres (Bowling Enfants/Jeunes, Bowling+Laser, Laser Jeune) comptent normalement.
function annivRow(id, formuleName, orderId) {
  return { id, order_id: orderId, open: orderId != null ? 1 : 1, formule: { name: formuleName } };
}
const tenBooked = Array.from({ length: 10 }, (_, i) => annivRow('b' + i, 'Bowling Enfants', 9000 + i));
const openNonQuiz = [
  annivRow('open1', 'Bowling Jeunes', null),
  annivRow('open2', 'Laser Jeune', null),
  annivRow('open3', 'Bowling + Laser Game', null),
];
const openQuiz = [annivRow('quiz1', 'Quiz boxing', null)];
const bookedQuiz = [annivRow('quizBooked', 'Quiz boxing', 9999)];

const under11 = [...tenBooked, ...openNonQuiz, ...openQuiz];
assert.strictEqual(countNonQuizBookings(under11), 10, '10 résas hors quiz comptées, quiz ignorée');
assert.deepStrictEqual(computeSlotsToCloseWhenFull(under11, countNonQuizBookings(under11)), [], 'sous la capacité (10<11) -> rien à fermer');

const eleventh = annivRow('b10', 'Bowling Enfants', 9010);
const atCapacity = [...tenBooked, eleventh, ...openNonQuiz, ...openQuiz, ...bookedQuiz];
assert.strictEqual(countNonQuizBookings(atCapacity), 11, '11 résas hors quiz (la résa quiz ne compte jamais)');
assert.deepStrictEqual(
  computeSlotsToCloseWhenFull(atCapacity, countNonQuizBookings(atCapacity)).map((r) => r.id).sort(),
  ['open1', 'open2', 'open3'],
  '11 atteint -> ferme les 3 créneaux non-quiz encore ouverts, jamais les créneaux quiz (ouvert ou réservé)'
);

// Fiches manuelles (dailyBirthdays sans crmOrderId) — doivent compter, sauf formule quiz, et ne
// jamais être recomptées si elles ont un crmOrderId (déjà comptées côté CRM).
const dailyBirthdaysDocs = [
  { date: '2026-08-29', formulaKey: 'bowling_enfant' }, // manuelle -> comptée
  { date: '2026-08-29', formulaKey: 'laser_jeune' }, // manuelle -> comptée
  { date: '2026-08-29', formulaKey: 'quiz' }, // manuelle mais quiz -> jamais comptée
  { date: '2026-08-29', formulaKey: 'bowling_jeune', crmOrderId: '258742' }, // déjà comptée côté CRM -> pas recomptée
];
assert.strictEqual(countManualNonQuizBookings(dailyBirthdaysDocs), 2, '2 fiches manuelles non-quiz comptées, quiz et déjà-CRM exclues');

// Scénario complet: 9 CRM + 2 manuelles = 11 -> doit déclencher la fermeture même si le CRM seul
// (9) est sous le seuil (c'est exactement le cas que l'exploitant a signalé comme manquant).
const nineCrm = Array.from({ length: 9 }, (_, i) => annivRow('c' + i, 'Bowling Enfants', 8000 + i));
const crmRowsForScenario = [...nineCrm, ...openNonQuiz, ...openQuiz];
const crmCountScenario = countNonQuizBookings(crmRowsForScenario);
const manualCountScenario = countManualNonQuizBookings(dailyBirthdaysDocs.slice(0, 2));
assert.strictEqual(crmCountScenario, 9, 'seulement 9 côté CRM');
assert.strictEqual(manualCountScenario, 2, '2 fiches manuelles');
assert.deepStrictEqual(
  computeSlotsToCloseWhenFull(crmRowsForScenario, crmCountScenario + manualCountScenario).map((r) => r.id).sort(),
  ['open1', 'open2', 'open3'],
  '9 CRM + 2 manuelles = 11 -> ferme quand même, le CRM seul (9) ne l\'aurait pas déclenché'
);

// Fenêtre anniversaire dédiée: 3 semaines (21j), indépendante des 14j du sync général.
assert.strictEqual(ANNIV_CAPACITY_DAYS_AHEAD, 21, 'fenêtre anniversaire = 3 semaines, pas les 14j du sync général');
const annivWindow = computeDateWindow(new Date(2026, 7, 25), ANNIV_CAPACITY_DAYS_AHEAD);
assert.strictEqual(annivWindow.length, 21, '21 dates générées');
assert.strictEqual(annivWindow[0], '2026-08-25', 'commence à aujourd\'hui');
assert.strictEqual(annivWindow[20], '2026-09-14', 'se termine 21 jours plus tard (chevauche le mois suivant, géré)');

// daysUntilEvent / seuil de refetch fiche détail: évite de re-fetcher la fiche détail commande à
// CHAQUE run de 10min pour CHAQUE commande déjà connue sur toute la fenêtre de 14j (gros poste de
// coût CPU facturé identifié en prod) — seulement pour une commande jamais vue, ou un événement à
// J/J+1/J+2.
const refNow = new Date(2026, 7, 25); // 25 août 2026
assert.strictEqual(daysUntilEvent(refNow, { y: 2026, m: 8, d: 25 }), 0, 'aujourd\'hui = 0');
assert.strictEqual(daysUntilEvent(refNow, { y: 2026, m: 8, d: 27 }), 2, 'dans 2 jours');
assert.strictEqual(daysUntilEvent(refNow, { y: 2026, m: 8, d: 30 }), 5, 'dans 5 jours');
assert.strictEqual(daysUntilEvent(refNow, { y: 2026, m: 9, d: 1 }), 7, 'à cheval sur le mois suivant');
assert.strictEqual(DETAIL_REFRESH_DAYS_AHEAD, 2, 'seuil de refetch = J+2');

console.log('selfcheck OK');
