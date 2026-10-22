// Fermeture des créneaux CRM (quiz/karaoké) — corrige un bug côté CRM: les grilles de créneaux
// sont indépendantes par formule (ex karaoke "30 minutes" vs "1 heure", toutes deux sur un pas de
// 30min) donc réserver l'une ne ferme pas l'autre alors qu'elles se chevauchent physiquement dans
// la même salle -> double réservation possible. Même défaut pour une formule seule si son pas de
// grille (30min) est plus petit que sa durée (1h): 14h et 14h30 se chevauchent déjà entre elles.
//
// Deux usages:
// - closeOverlappingBookedSlots: pendant le sync régulier, ferme les créneaux CRM qui chevauchent
//   une résa CRM fraîchement apparue (order_id posé par un client qui a réservé en ligne).
// - closeCrmSlotForManualBooking: appelé depuis le site quand le staff crée une résa quiz/karaoké à
//   la main, ferme le(s) créneau(x) CRM qui chevauchent cette résa (aucun order_id côté CRM ici,
//   la résa n'existe que sur notre site).

const SITE_ACTIVITY_TO_CRM_SLUG = { quiz: 'quizzboxing', karaoke: 'karaoke' };

function parseHHMMToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}

function creneauInterval(row) {
  const start = parseHHMMToMinutes(row.heure_debut);
  const durationMinutes = parseHHMMToMinutes((row.formule && row.formule.duration) || '00:30');
  return { start, end: start + durationMinutes };
}

function intervalsOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

// Le créneau "23:55" est un artefact technique du CRM (généré pour représenter minuit sans utiliser
// "00:00", qui compterait comme le jour suivant) — pas un vrai horaire concurrent des 13h-23h normaux.
// Faux positif à ignorer quand une résa DANS la soirée (ex 23h) le chevauche mathématiquement de
// quelques minutes. MAIS quand la résa manuelle EST à minuit (voir closeCrmSlotForManualBooking), ces
// mêmes créneaux 23h55 sont exactement ceux qu'il faut fermer -> excludeMidnightPlaceholder:false.
const MIDNIGHT_PLACEHOLDER_HEURE = '23:55';

// Parmi les créneaux CRM d'une même date/activité, renvoie les id des créneaux encore ouverts et
// libres (open===1, pas de order_id) qui chevauchent l'intervalle donné (en minutes depuis minuit).
function findOverlappingOpenSlotIds(rows, targetInterval, excludeId, { excludeMidnightPlaceholder = true } = {}) {
  const ids = [];
  for (const row of rows) {
    if (row.id === excludeId) continue;
    if (excludeMidnightPlaceholder && row.heure_debut === MIDNIGHT_PLACEHOLDER_HEURE) continue;
    if (Number(row.open) !== 1 || row.order_id != null) continue;
    if (intervalsOverlap(targetInterval, creneauInterval(row))) {
      ids.push(row.id);
    }
  }
  return ids;
}

// Parmi les créneaux CRM d'une date donnée, calcule — pour chaque créneau fraîchement réservé côté
// CRM (order_id posé) — les autres créneaux ouverts qui se chevauchent et doivent fermer. Renvoie
// le détail (heure/durée), pas juste des id, pour pouvoir écrire un log lisible.
function computeClosuresForBookedRows(rows) {
  const bookedRows = rows.filter((r) => r.order_id != null);
  const closures = [];
  for (const booked of bookedRows) {
    const interval = creneauInterval(booked);
    const overlappingIds = new Set(findOverlappingOpenSlotIds(rows, interval, booked.id));
    if (overlappingIds.size === 0) continue;
    closures.push({
      booked,
      toClose: rows.filter((r) => overlappingIds.has(r.id)),
    });
  }
  return closures;
}

// csrfToken à fournir par l'appelant (fetché une seule fois par lot, pas par créneau — moins de
// requêtes vers le CRM, donc moins de surface pour un pépin serveur pendant la boucle). Chaque
// créneau est isolé (try/catch individuel) — un POST qui lève une vraie erreur réseau/HTTP ne doit
// pas bloquer les suivants. On n'essaie PAS de juger le succès depuis la réponse du POST elle-même
// (voir setCreneauStatut: elle n'est pas fiable) — cette fonction ne fait qu'envoyer les requêtes,
// verifyClosedSlots() ci-dessous fait la vraie vérification en relisant l'état après coup.
async function closeSlotIds(client, slug, ids, csrfToken) {
  for (const id of ids) {
    try {
      await client.setCreneauStatut(slug, id, 0, csrfToken);
    } catch (error) {
      console.error(`[creneauSync] POST fermeture créneau ${id} (${slug}) a levé une erreur, on continue les autres:`, error.message);
    }
  }
}

// Constaté en prod: le CRM répond souvent par une redirection HTML au lieu du JSON {success:true}
// attendu MÊME quand la fermeture a réellement eu lieu — impossible de se fier à la réponse du POST.
// Seule façon fiable de savoir ce qui a vraiment fermé: relire les créneaux après coup et regarder
// leur champ "open" réel.
async function verifyClosedSlots(client, slug, dateStr, ids) {
  const rows = await client.getCreneaux(slug, dateStr);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const closed = [];
  const failed = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row && Number(row.open) === 0) closed.push(id);
    else failed.push(id);
  }
  return { closed, failed };
}

// A appeler pendant le sync régulier. Karaoke seulement: grille 30min avec 2 formules (30min/1h) qui
// se chevauchent en ligne. Quiz exclu ici -> grille CRM strictement à l'heure pile (pas de créneau
// à 30min), donc un pas = une durée, aucun chevauchement possible pour une résa EN LIGNE (confirmé
// par l'exploitant). Le bouton manuel (closeCrmSlotForManualBooking) couvre quiz quand même, car une
// résa MANUELLE sur le site peut tomber hors grille CRM (ex: 15h30 alors que le CRM n'a que 15h/16h).
const AUTO_CLOSE_SLUGS = [SITE_ACTIVITY_TO_CRM_SLUG.karaoke];

// Renvoie une liste d'événements narratifs, un par créneau réservé en ligne qui a déclenché une
// fermeture: { slug, dateStr, bookedHeure, bookedDuration, closed: [{heure, duration, id}] }.
// Un jour à la fois: si le CRM tombe/bug sur UNE date, on log et on continue sur les autres dates
// de la fenêtre au lieu d'abandonner tout le lot (résilience demandée — un pépin ponctuel ne doit
// pas priver les autres jours de leur vérification).
async function closeOverlappingBookedSlots(client, dateStrings, { dryRun = true } = {}) {
  const events = [];
  let csrfToken = null; // fetché au 1er besoin réel, réutilisé pour tout le run (moins de requêtes)
  for (const slug of AUTO_CLOSE_SLUGS) {
    // Lecture des créneaux de toute la fenêtre en parallèle (GET indépendants, idempotents) plutôt
    // qu'un aller-retour CRM séquentiel par date — c'était l'un des principaux postes de temps
    // (donc de coût CPU facturé) du sync régulier. Les fermetures elles-mêmes (rares, en écriture)
    // restent traitées une par une ci-dessous, par prudence vis-à-vis du CRM.
    const rowsByDate = await Promise.all(
      dateStrings.map((dateStr) =>
        client
          .getCreneaux(slug, dateStr)
          .then((rows) => ({ dateStr, rows }))
          .catch((error) => {
            console.error(`[creneauSync] ${slug} ${dateStr} ignoré (erreur CRM):`, error.message);
            return { dateStr, rows: null };
          })
      )
    );
    for (const { dateStr, rows } of rowsByDate) {
      if (!rows) continue;
      try {
        const closures = computeClosuresForBookedRows(rows);
        for (const { booked, toClose } of closures) {
          let closedRows = toClose;
          let failedCount = 0;
          if (!dryRun) {
            if (!csrfToken) csrfToken = await client.getMetaCsrfToken(slug);
            const ids = toClose.map((r) => r.id);
            await closeSlotIds(client, slug, ids, csrfToken);
            const verify = await verifyClosedSlots(client, slug, dateStr, ids);
            closedRows = toClose.filter((r) => verify.closed.includes(r.id));
            failedCount = verify.failed.length;
          }
          events.push({
            slug,
            dateStr,
            bookedHeure: booked.heure_debut,
            bookedDuration: (booked.formule && booked.formule.duration) || null,
            closed: closedRows.map((r) => ({ heure: r.heure_debut, duration: (r.formule && r.formule.duration) || null, id: r.id })),
            failedCount,
          });
        }
      } catch (error) {
        console.error(`[creneauSync] ${slug} ${dateStr} ignoré (erreur CRM):`, error.message);
      }
    }
  }
  return events;
}

// A appeler juste après la création manuelle d'une résa quiz/karaoké sur le site. Ferme le créneau
// CRM exact + tout créneau CRM qui chevauche (autre formule/durée). Renvoie un statut exploitable
// par le front (déjà réservé côté CRM = vraie alerte, pas un simple "rien à faire").
async function closeCrmSlotForManualBooking(client, { activity, dateStr, startTime, durationMinutes }) {
  const slug = SITE_ACTIVITY_TO_CRM_SLUG[activity];
  if (!slug) {
    throw new Error(`Activité non supportée pour la fermeture CRM: ${activity}`);
  }

  // Sur notre site, "00:00" appartient au jour choisi (voir generateTimeOptions: hour=0 prolonge la
  // soirée de CE jour métier, pas le lendemain). Le CRM range ses créneaux de fin de nuit (23h55,
  // 23h30) sous la MÊME date — même convention "jour métier" que nous, donc pas de décalage de date
  // à faire. Minuit = juste 1440 sur l'échelle de cette même date, et on autorise cette fois les
  // créneaux 23h55 (le seul cas où ils représentent une vraie fermeture à faire).
  const isMidnight = startTime === 0;
  const crmDateStr = dateStr;
  const startMinutes = isMidnight ? 1440 : Math.round(startTime * 60);

  const rows = await client.getCreneaux(slug, crmDateStr);
  const targetInterval = { start: startMinutes, end: startMinutes + durationMinutes };

  const exactRow = rows.find((r) => parseHHMMToMinutes(r.heure_debut) === startMinutes);
  if (exactRow && exactRow.order_id != null) {
    return { success: false, alreadyBookedOnCrm: true, message: 'Ce créneau est déjà réservé sur le CRM.' };
  }

  const idsToClose = findOverlappingOpenSlotIds(rows, targetInterval, null, { excludeMidnightPlaceholder: !isMidnight });
  if (idsToClose.length === 0) {
    return { success: true, closed: [], message: "Aucun créneau CRM ouvert à fermer sur ce horaire (déjà fermé ou introuvable)." };
  }

  const rowsToClose = rows.filter((r) => idsToClose.includes(r.id));
  const csrfToken = await client.getMetaCsrfToken(slug);
  await closeSlotIds(client, slug, idsToClose, csrfToken);
  const verify = await verifyClosedSlots(client, slug, crmDateStr, idsToClose);
  const closed = rowsToClose.filter((r) => verify.closed.includes(r.id)).map((r) => ({ heure: r.heure_debut, duration: (r.formule && r.formule.duration) || null, id: r.id }));

  if (verify.failed.length > 0) {
    return {
      success: false,
      closed,
      failedCount: verify.failed.length,
      message: `${closed.length} créneau(x) fermé(s), mais ${verify.failed.length} n'ont pas pu être vérifiés fermés — vérifie manuellement sur le CRM.`,
    };
  }
  return { success: true, closed, message: `${closed.length} créneau(x) CRM fermé(s).` };
}

// Parmi les créneaux CRM d'une même date/activité, renvoie les id des créneaux encore FERMÉS et
// libres (open===0, pas de order_id) qui chevauchent l'intervalle donné -- l'inverse de
// findOverlappingOpenSlotIds, utilisé pour la réouverture (voir openCrmSlotForManualBooking).
function findOverlappingClosedSlotIds(rows, targetInterval, excludeId, { excludeMidnightPlaceholder = true } = {}) {
  const ids = [];
  for (const row of rows) {
    if (row.id === excludeId) continue;
    if (excludeMidnightPlaceholder && row.heure_debut === MIDNIGHT_PLACEHOLDER_HEURE) continue;
    if (Number(row.open) !== 0 || row.order_id != null) continue;
    if (intervalsOverlap(targetInterval, creneauInterval(row))) {
      ids.push(row.id);
    }
  }
  return ids;
}

// Pendant de closeSlotIds, statut=1 (ouvert) au lieu de 0.
async function openSlotIds(client, slug, ids, csrfToken) {
  for (const id of ids) {
    try {
      await client.setCreneauStatut(slug, id, 1, csrfToken);
    } catch (error) {
      console.error(`[creneauSync] POST réouverture créneau ${id} (${slug}) a levé une erreur, on continue les autres:`, error.message);
    }
  }
}

// Pendant de verifyClosedSlots, vérifie open===1 au lieu de 0.
async function verifyOpenedSlots(client, slug, dateStr, ids) {
  const rows = await client.getCreneaux(slug, dateStr);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const opened = [];
  const failed = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row && Number(row.open) === 1) opened.push(id);
    else failed.push(id);
  }
  return { opened, failed };
}

// A appeler quand le staff libère manuellement un créneau quiz/karaoké côté site (case "Fermé"
// décochée, résa déplacée hors de ce créneau...). Rouvre le créneau CRM exact + tout créneau CRM qui
// chevauche, SAUF ceux qui portent un order_id (vraie résa en ligne posée entre-temps -- on ne
// l'écrase surtout pas). Symétrique de closeCrmSlotForManualBooking.
async function openCrmSlotForManualBooking(client, { activity, dateStr, startTime, durationMinutes }) {
  const slug = SITE_ACTIVITY_TO_CRM_SLUG[activity];
  if (!slug) {
    throw new Error(`Activité non supportée pour la réouverture CRM: ${activity}`);
  }

  // Même convention "jour métier" que closeCrmSlotForManualBooking (voir son commentaire) : minuit
  // reste sur la date choisie, pas de décalage au lendemain.
  const isMidnight = startTime === 0;
  const crmDateStr = dateStr;
  const startMinutes = isMidnight ? 1440 : Math.round(startTime * 60);

  const rows = await client.getCreneaux(slug, crmDateStr);
  const targetInterval = { start: startMinutes, end: startMinutes + durationMinutes };

  const exactRow = rows.find((r) => parseHHMMToMinutes(r.heure_debut) === startMinutes);
  if (exactRow && exactRow.order_id != null) {
    return { success: false, alreadyBookedOnCrm: true, message: 'Ce créneau est déjà réservé sur le CRM -- pas touché.' };
  }

  const idsToOpen = findOverlappingClosedSlotIds(rows, targetInterval, null, { excludeMidnightPlaceholder: !isMidnight });
  if (idsToOpen.length === 0) {
    return { success: true, opened: [], message: "Aucun créneau CRM fermé à rouvrir sur ce horaire (déjà ouvert ou introuvable)." };
  }

  const rowsToOpen = rows.filter((r) => idsToOpen.includes(r.id));
  const csrfToken = await client.getMetaCsrfToken(slug);
  await openSlotIds(client, slug, idsToOpen, csrfToken);
  const verify = await verifyOpenedSlots(client, slug, crmDateStr, idsToOpen);
  const opened = rowsToOpen.filter((r) => verify.opened.includes(r.id)).map((r) => ({ heure: r.heure_debut, duration: (r.formule && r.formule.duration) || null, id: r.id }));

  if (verify.failed.length > 0) {
    return {
      success: false,
      opened,
      failedCount: verify.failed.length,
      message: `${opened.length} créneau(x) rouvert(s), mais ${verify.failed.length} n'ont pas pu être vérifiés ouverts -- vérifie manuellement sur le CRM.`,
    };
  }
  return { success: true, opened, message: `${opened.length} créneau(x) CRM rouvert(s).` };
}

module.exports = {
  SITE_ACTIVITY_TO_CRM_SLUG,
  parseHHMMToMinutes,
  creneauInterval,
  intervalsOverlap,
  findOverlappingOpenSlotIds,
  findOverlappingClosedSlotIds,
  computeClosuresForBookedRows,
  closeOverlappingBookedSlots,
  closeCrmSlotForManualBooking,
  openCrmSlotForManualBooking,
  closeSlotIds,
  openSlotIds,
  verifyClosedSlots,
  verifyOpenedSlots,
};
