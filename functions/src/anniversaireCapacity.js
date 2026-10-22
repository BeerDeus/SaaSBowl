// Ferme automatiquement les créneaux anniversaire restants d'une journée une fois la capacité
// atteinte (11 anniversaires confirmé par l'exploitant) — sauf la formule "Quiz boxing", qui utilise
// une salle séparée et ne doit jamais être ni comptée ni fermée par cette règle.
//
// Le compte doit inclure les fiches ajoutées à la main sur le site (dailyBirthdays sans crmOrderId),
// pas seulement les commandes CRM — sinon un anniversaire noté manuellement ne fait jamais atteindre
// le seuil. Une fiche dailyBirthdays qui A un crmOrderId est déjà comptée côté CRM (créneaux
// order_id) -> on ne la recompte pas une deuxième fois côté Firestore.
const { closeSlotIds, verifyClosedSlots } = require('./creneauSync');

const ANNIVERSAIRE_SLUG = 'anniversaire';
const ANNIV_QUIZ_FORMULE_NAME = 'Quiz boxing'; // confirmé par capture réseau réelle (formule_id 12)
const ANNIV_QUIZ_FORMULA_KEY = 'quiz'; // équivalent côté dailyBirthdays (script_v2.js, bd-formula)
const ANNIV_CAPACITY = 11;
// Les anniversaires se réservent souvent plus à l'avance que karaoke/quiz -> fenêtre dédiée plus
// large (3 semaines), indépendante du daysAhead du sync général (14j). Même rythme de rescan que
// karaoke (à chaque passage du sync régulier), juste une fenêtre de dates différente.
const ANNIV_CAPACITY_DAYS_AHEAD = 21;

// Génère les daysAhead prochaines dates "YYYY-MM-DD" à partir de `now`.
function computeDateWindow(now, daysAhead) {
  const dates = [];
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return dates;
}

function isQuizFormule(row) {
  return !!(row.formule && row.formule.name === ANNIV_QUIZ_FORMULE_NAME);
}

// Nombre d'anniversaires CRM (hors formule quiz) déjà réservés ce jour — en commandes distinctes,
// pas en lignes de créneaux (au cas où une résa toucherait plusieurs lignes un jour).
function countNonQuizBookings(rows) {
  const orderIds = new Set();
  for (const row of rows) {
    if (isQuizFormule(row)) continue;
    if (row.order_id != null) orderIds.add(row.order_id);
  }
  return orderIds.size;
}

// Fiches dailyBirthdays ajoutées À LA MAIN (pas de crmOrderId) pour cette date, hors formule quiz.
function countManualNonQuizBookings(dailyBirthdaysDocs) {
  let count = 0;
  for (const data of dailyBirthdaysDocs) {
    if (data.crmOrderId) continue; // déjà compté côté CRM
    if (data.formulaKey === ANNIV_QUIZ_FORMULA_KEY) continue;
    count += 1;
  }
  return count;
}

// Si la capacité est atteinte (CRM + manuel), renvoie les créneaux CRM encore ouverts/libres (hors
// quiz) à fermer.
function computeSlotsToCloseWhenFull(rows, totalBookedCount, capacity = ANNIV_CAPACITY) {
  if (totalBookedCount < capacity) return [];
  return rows.filter((r) => !isQuizFormule(r) && Number(r.open) === 1 && r.order_id == null);
}

// A appeler pendant le sync régulier, une date à la fois (un pépin sur un jour n'empêche pas les
// autres — même principe de résilience que pour karaoke). db: Firestore, pour lire les fiches
// manuelles du jour.
async function closeAnniversaireSlotsWhenFull(client, db, dateStrings, { dryRun = true } = {}) {
  const events = [];
  let csrfToken = null;

  // Lecture des 21 jours de la fenêtre en parallèle (GET + requête Firestore indépendants par
  // date) plutôt qu'un aller-retour CRM séquentiel par date — même gain que pour closeOverlappingBookedSlots.
  const dataByDate = await Promise.all(
    dateStrings.map((dateStr) =>
      Promise.all([
        client.getCreneaux(ANNIVERSAIRE_SLUG, dateStr),
        db.collection('dailyBirthdays').where('date', '==', dateStr).get(),
      ])
        .then(([rows, manualSnap]) => ({ dateStr, rows, manualSnap }))
        .catch((error) => {
          console.error(`[anniversaireCapacity] ${dateStr} ignoré (erreur CRM):`, error.message);
          return { dateStr, rows: null, manualSnap: null };
        })
    )
  );

  for (const { dateStr, rows, manualSnap } of dataByDate) {
    if (!rows) continue;
    try {
      const crmCount = countNonQuizBookings(rows);
      const manualCount = countManualNonQuizBookings(manualSnap.docs.map((d) => d.data()));
      const totalCount = crmCount + manualCount;

      const toClose = computeSlotsToCloseWhenFull(rows, totalCount);
      if (toClose.length === 0) continue;

      let closedRows = toClose;
      let failedCount = 0;
      if (!dryRun) {
        if (!csrfToken) csrfToken = await client.getMetaCsrfToken(ANNIVERSAIRE_SLUG);
        const ids = toClose.map((r) => r.id);
        await closeSlotIds(client, ANNIVERSAIRE_SLUG, ids, csrfToken);
        const verify = await verifyClosedSlots(client, ANNIVERSAIRE_SLUG, dateStr, ids);
        closedRows = toClose.filter((r) => verify.closed.includes(r.id));
        failedCount = verify.failed.length;
      }
      events.push({
        dateStr,
        bookedCount: totalCount,
        crmCount,
        manualCount,
        closed: closedRows.map((r) => ({ heure: r.heure_debut, formule: r.formule ? r.formule.name : null, id: r.id })),
        failedCount,
      });
    } catch (error) {
      console.error(`[anniversaireCapacity] ${dateStr} ignoré (erreur CRM):`, error.message);
    }
  }
  return events;
}

module.exports = {
  ANNIVERSAIRE_SLUG,
  ANNIV_QUIZ_FORMULE_NAME,
  ANNIV_QUIZ_FORMULA_KEY,
  ANNIV_CAPACITY,
  ANNIV_CAPACITY_DAYS_AHEAD,
  isQuizFormule,
  countNonQuizBookings,
  countManualNonQuizBookings,
  computeSlotsToCloseWhenFull,
  computeDateWindow,
  closeAnniversaireSlotsWhenFull,
};
