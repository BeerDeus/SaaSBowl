// Orchestration sync CRM (Space Bowling) -> LaserGameTest (Firestore).
// Une seule fonction planifiée (voir index.js, "every 10 minutes") ; le throttle par
// plage horaire est géré ici en interne pour éviter 4 Cloud Scheduler jobs séparés.
const { assignLgRoom } = require('./assignLgRoom');
const { isTimeSlotAvailable, isQkSlotAvailable } = require('./slotConflict');
const { closeOverlappingBookedSlots } = require('./creneauSync');
const { closeAnniversaireSlotsWhenFull, computeDateWindow, ANNIV_CAPACITY_DAYS_AHEAD } = require('./anniversaireCapacity');

// Durée d'une session laser: 20min pour les formules anniversaire (confirmé par l'exploitant),
// 30min par défaut ailleurs (pas confirmé, le laser peut se déclencher sur karaoke/quizzboxing aussi).
function laserDurationMinutes(event) {
  return event.activity === 'anniversaire' ? 20 : 30;
}
// Site en prod: pas besoin de creuser 2-3 mois à chaque run comme au début (tests). Une fenêtre
// glissante de J à J+14 suffit pour toutes les activités et coûte beaucoup moins cher en requêtes.
const DAYS_AHEAD_DEFAULT = 14;

// La fiche détail commande (getOrderDetail, 1 requête HTTP + parsing HTML par commande) ne change
// quasi jamais une fois la commande déjà connue (montant payé, gâteau...) -> inutile de la
// re-fetcher pour CHAQUE commande active à CHAQUE run de 10min sur toute la fenêtre de 14j (c'était
// le vrai poste de coût CPU facturé du sync, largement devant les lectures de créneaux). On la
// refetch seulement pour une commande jamais vue, ou dont l'événement a lieu très bientôt (le
// paiement/gâteau a plus de chances d'être finalisé/modifié juste avant).
const DETAIL_REFRESH_DAYS_AHEAD = 2;

function daysUntilEvent(now, event) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(event.y, event.m - 1, event.d);
  return Math.round((eventDay.getTime() - today.getTime()) / 86400000);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function eventDateStr(event) {
  return `${event.y}-${pad2(event.m)}-${pad2(event.d)}`;
}

function eventStartTime(event) {
  return event.h + (event.i || 0) / 60;
}

// 15.5 -> "15h30" — pour les logs lisibles (bouton "Logs" du site)
function formatHour(t) {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}

function dateToStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Mois distincts (year/month) couverts par la fenêtre [aujourd'hui, aujourd'hui+daysAhead[ — l'API
// CRM ne répond que par mois entier, donc on fetch le(s) mois concerné(s) puis on filtre les jours.
function monthsSpanningDays(now, daysAhead) {
  const seen = new Set();
  const months = [];
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    if (!seen.has(key)) {
      seen.add(key);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }
  }
  return months;
}

// La fiche détail commande (getOrderDetail) embarque un blob JSON propre dans un
// <script>console.log({"age_enfant":"7","date_enfant":"...","prenom_enfant":"Illyanna"})</script>
// (confirmé sur un vrai exemple) — bien plus fiable que de dépouiller le HTML visible.
// Repli sur le libellé "Prénom de l'enfant" du HTML si jamais ce blob disparaît un jour
// (apostrophes en &#039; dans ce HTML, d'où le décodage avant le match).
function stripHtmlToLines(html) {
  const text = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&#0?39;|&apos;|&rsquo;/gi, "'")
    .replace(/&nbsp;/gi, ' ');
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

// Le blob JSON est capturé par regex (pas un vrai JSON.parse sur toute la page), donc les
// échappements type é ("é") restent tels quels si on ne les redécode pas nous-même.
function decodeJsonStringValue(raw) {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

function extractChildFirstName(html) {
  const jsonMatch = String(html || '').match(/"prenom_enfant"\s*:\s*"([^"]*)"/);
  if (jsonMatch && jsonMatch[1]) return decodeJsonStringValue(jsonMatch[1]);

  const lines = stripHtmlToLines(html);
  const idx = lines.findIndex((l) => /pr[ée]nom de l'enfant/i.test(l));
  if (idx === -1 || idx + 1 >= lines.length) return null;
  return lines[idx + 1];
}

// "Montant payé" (l'acompte réellement encaissé, différent du montant total de la commande) —
// visible seulement sur la fiche détail, pas dans le JSON du planning mensuel.
function extractAmountPaid(html) {
  const lines = stripHtmlToLines(html);
  const idx = lines.findIndex((l) => /montant pay/i.test(l));
  if (idx === -1) return null;
  for (let j = idx + 1; j <= idx + 3 && j < lines.length; j++) {
    const m = lines[j].match(/^(\d+)[,.](\d{2})$/);
    if (m) return parseFloat(`${m[1]}.${m[2]}`);
  }
  return null;
}

// Même blob JSON que le prénom ({"age_enfant":"7",...}) — pour pré-remplir la fiche anniversaire.
function extractChildAge(html) {
  const jsonMatch = String(html || '').match(/"age_enfant"\s*:\s*"([^"]*)"/);
  if (jsonMatch && jsonMatch[1]) {
    const n = parseInt(jsonMatch[1], 10);
    return Number.isNaN(n) ? null : n;
  }
  const lines = stripHtmlToLines(html);
  const idx = lines.findIndex((l) => /fêté de l'enfant/i.test(l));
  if (idx === -1 || idx + 1 >= lines.length) return null;
  const n = parseInt(lines[idx + 1], 10);
  return Number.isNaN(n) ? null : n;
}

// Gâteau + nb bouteilles de champomy: lignes du tableau "Produits" de la fiche détail
// (ex: "Gâteau d'anniversaire Factice (Donuts au chocolat)", "Bouteille de champomy (75cl)").
// Pas de blob JSON pour ça, on dépouille les lignes du tableau produits.
function extractCakeAndChampomy(html) {
  const lines = stripHtmlToLines(html);
  let cake = null;
  let champomyCount = 0;

  const cakeLine = lines.find((l) => /g[âa]teau/i.test(l));
  if (cakeLine) {
    cake = /sucre/i.test(cakeLine) ? 'sucre' : 'chocolat';
  }

  const champomyIdx = lines.findIndex((l) => /champomy/i.test(l));
  if (champomyIdx !== -1) {
    for (let j = champomyIdx + 1; j <= champomyIdx + 2 && j < lines.length; j++) {
      const n = parseInt(lines[j], 10);
      if (!Number.isNaN(n)) {
        champomyCount = n;
        break;
      }
    }
  }

  return { cake, champomyCount };
}

// Champ confirmé sur un vrai exemple (crmSyncPreview, commande #252381): event.name vaut
// "anniversaire / Laser Jeune" ou "anniversaire / Bowling + Laser Game" — c'est LE champ formule,
// contrairement à title ("LJ - xiong veronique (13pers) (Acc)", juste un résumé abrégé) qui ne le
// contient pas. Scanner tous les champs (ancien comportement) faisait remonter des faux positifs
// "bowling" venant d'ailleurs et cassait la détection "Laser Jeune" à chaque fois.
function formulaText(event) {
  if (event.name) return String(event.name).toLowerCase();
  // repli si jamais "name" est absent sur un événement (karaoke/quizzboxing ?) — comportement d'origine
  return Object.values(event)
    .filter((v) => typeof v === 'string')
    .join(' ')
    .toLowerCase();
}

// "anniversaire / Bowling + Laser Game" -> bowling_laser, "Laser Jeune" -> laser_jeune, etc.
// Mapping vers les 5 formulaKey déjà connues du formulaire fiche anniversaire (script_v2.js).
function guessBirthdayFormulaKey(event) {
  const text = formulaText(event);
  if (text.includes('quiz')) return 'quiz';
  if (text.includes('laser')) return text.includes('bowling') ? 'bowling_laser' : 'laser_jeune';
  return text.includes('jeune') ? 'bowling_jeune' : 'bowling_enfant';
}

// Espace pas encore dans le JSON CRM: seul object_status ("Accompte versé"...) et amount_total
// (montant total, pas le montant de l'acompte précisément) sont disponibles à ce jour.
function depositInfo(event) {
  const status = event.object_status || '';
  return {
    depositPaid: /accompte|acompte/i.test(status),
    depositStatus: status || null,
    amountTotal: event.amount_total != null ? event.amount_total : null,
  };
}

// Confirmé sur le vrai CRM: formule "Bowling + Laser Game" (laser inclus dans un pack plus large,
// 1 seul créneau) vs "Laser Jeune" (100% laser, autonome, 2 créneaux) — via event.name (voir formulaText).
function detectLaserFormula(event) {
  const text = formulaText(event);
  if (!text.includes('laser')) return null;
  const standalone = !text.includes('bowling'); // laser sans bowling associé -> formule 100% laser
  return { isLaser: true, standalone };
}

// Mirroir direct karaoke/quizzboxing -> qkReservations (pas de détection, toute résa CRM de ces
// activités se bloque). "quizzboxing" -> 'quiz' est une supposition (pas d'activité "quiz" séparée
// côté CRM), à confirmer avec un vrai échantillon.
const QK_ACTIVITY_MAP = { karaoke: 'karaoke', quizzboxing: 'quiz' };
const QK_DURATION_MINUTES = 60; // défaut (quizzboxing, pas de règle prix connue pour l'instant)

// Karaoke: confirmé sur du vrai planning CRM (aout/sept réel) — event.name vaut littéralement
// "karaoke / Formule Karaoké 30 minutes" ou "karaoke / Formule Karaoké" (sans suffixe -> 1h).
// Fiable, contrairement à l'ancienne règle prix/participant (8€/pers -> 30min, 12€/pers -> 1h) qui
// marchait par coïncidence tarifaire et casserait au moindre changement de prix — gardée en repli
// uniquement si "name" est absent un jour (jamais observé en pratique).
function karaokeDurationMinutes(event) {
  if (event.name) {
    return String(event.name).toLowerCase().includes('30 minutes') ? 30 : 60;
  }
  const perPerson = event.nbr_participants ? (event.amount_total || 0) / event.nbr_participants : null;
  if (perPerson == null) return QK_DURATION_MINUTES;
  return Math.abs(perPerson - 8) < Math.abs(perPerson - 12) ? 30 : 60;
}

function buildQkSlot(event) {
  const start = eventStartTime(event);
  const duration = event.activity === 'karaoke' ? karaokeDurationMinutes(event) : QK_DURATION_MINUTES;
  return {
    startTime: start,
    endTime: start + duration / 60,
    activity: QK_ACTIVITY_MAP[event.activity],
    duration,
  };
}

// standalone -> 2 crénaux (30 min d'écart) ; sinon (laser inclus dans une formule enfant) -> 1 créneau.
// Pas de room ici: le choix de salle dépend de ce qui est déjà occupé (voir pickLgRoom).
function buildLgTimes(event, detection) {
  const duration = laserDurationMinutes(event);
  const start1 = eventStartTime(event);
  const end1 = start1 + duration / 60;
  const times = [{ startTime: start1, endTime: end1, duration }];
  if (detection.standalone) {
    // 1h après le DÉBUT de la 1ère session (pas après sa fin) -> reste sur la grille 30min
    // peu importe la durée réelle de session (20 ou 30min). Ex: 15h30 puis 16h30.
    const start2 = start1 + 1;
    times.push({ startTime: start2, endTime: start2 + duration / 60, duration });
  }
  return times;
}

// 2 salles: bas (room 1, max 12) et haut (room 2, max 16). Essaie la salle préférée
// (assignLgRoom, selon l'effectif) puis bascule sur l'autre si occupée au même horaire —
// deux résas laser à la même heure se placent chacune dans une salle plutôt que de se bloquer
// l'une l'autre. Renvoie null seulement si aucune salle ne convient (vrai conflit).
function pickLgRoom(nbrParticipants, dateStr, times, dayReservations, closedSlots) {
  const preferred = assignLgRoom(nbrParticipants).room;
  const candidates = preferred === 1 ? [1, 2] : [2]; // room 1 (max 12) ne peut pas accueillir un groupe >12
  for (const room of candidates) {
    const allFree = times.every((t) => isTimeSlotAvailable(dateStr, t.startTime, t.endTime, room, dayReservations, closedSlots));
    if (allFree) return room;
  }
  return null;
}

// [2h-12h30) fermé (personne sur place, aucune résa site possible) -> rien à faire, aucun fetch CRM.
// [12h30-13h) et [0h-2h) -> toutes les 30min (rattrape les résas CRM prises pendant la fermeture,
// sans taper le CRM à la cadence pleine avant l'ouverture réelle). [13h-0h) -> à chaque run (10min).
function shouldRunNow(now, lastRunAt) {
  const minutesOfDay = now.getHours() * 60 + now.getMinutes();
  if (minutesOfDay >= 120 && minutesOfDay < 750) return false; // 2h00 - 12h30
  const throttledBand = (minutesOfDay >= 750 && minutesOfDay < 780) || minutesOfDay < 120; // 12h30-13h ou 0h-2h
  if (throttledBand && lastRunAt) {
    const elapsedMs = now.getTime() - lastRunAt.getTime();
    if (elapsedMs < 30 * 60 * 1000) return false;
  }
  return true;
}

// dailyBirthdays n'était jamais nettoyée (le bouton "Tout supprimer" du site ne se déclenche
// quasiment plus depuis que le CRM pré-génère des fiches futures) -> la collection ne fait que
// grossir, relue en entier par chaque appareil connecté à chaque modif (gros poste de lectures
// Firestore qui grimpe jour après jour). Ces fiches passées ne servent plus jamais -> purge
// automatique, une fois par jour (pas la peine de scanner la collection à chaque run de 10min).
const BIRTHDAYS_RETENTION_DAYS = 30;
async function cleanupOldBirthdays(db, now) {
  const cleanupRef = db.collection('syncMeta').doc('lastBirthdaysCleanup');
  const cleanupSnap = await cleanupRef.get();
  const lastCleanupAt = cleanupSnap.exists && cleanupSnap.data().at ? cleanupSnap.data().at.toDate() : null;
  if (lastCleanupAt && now.getTime() - lastCleanupAt.getTime() < 24 * 60 * 60 * 1000) return;

  const cutoffStr = dateToStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - BIRTHDAYS_RETENTION_DAYS));
  const oldSnap = await db.collection('dailyBirthdays').where('date', '<', cutoffStr).get();
  if (!oldSnap.empty) {
    const batch = db.batch();
    oldSnap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
  }
  await cleanupRef.set({ at: now, deleted: oldSnap.size });
}

async function runSync(db, client, { dryRun = true, skipThrottle = false, daysAhead = DAYS_AHEAD_DEFAULT, fastCheck = false, closeCrmDuplicates = false, closeAnniversaireWhenFull = false } = {}) {
  const now = new Date();

  // Indépendant du throttle horaire ci-dessous (pas d'appel CRM, juste Firestore) -> une erreur ici
  // ne doit jamais empêcher le reste du sync de tourner.
  try {
    await cleanupOldBirthdays(db, now);
  } catch (error) {
    console.error('[sync] nettoyage dailyBirthdays:', error.message);
  }

  const metaRef = db.collection('syncMeta').doc('lastRun');
  const metaSnap = await metaRef.get();
  const lastRunAt = metaSnap.exists && metaSnap.data().at ? metaSnap.data().at.toDate() : null;

  if (!skipThrottle && !shouldRunNow(now, lastRunAt)) {
    return { skipped: true, reason: 'throttled_or_closed' };
  }

  const windowStartStr = dateToStr(now);
  const windowEndStr = dateToStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead));

  const months = monthsSpanningDays(now, daysAhead);
  const fetchJobs = ['anniversaire', 'quizzboxing', 'karaoke'].flatMap((activity) =>
    months.map(({ year, month }) => ({ activity, year, month }))
  );

  // closedSlots ne dépend pas du planning CRM -> lu en parallèle du fetch CRM plutôt qu'après,
  // ça ne coûte rien de plus en temps (le plus lent des deux gagne).
  const [closedSnap, events] = await Promise.all([
    db.collection('closedSlots').doc('all').get(),
    Promise.all(
      fetchJobs.map(({ activity, year, month }) =>
        client
          .getPlanningByMonth(activity, year, month)
          .then((list) => (Array.isArray(list) ? list.map((e) => ({ ...e, activity })) : []))
      )
    ).then((lists) =>
      lists
        .flat()
        // Le fetch reste par mois entier (limite de l'API CRM) -> on ne garde que les jours de la fenêtre.
        .filter((e) => {
          const d = eventDateStr(e);
          return d >= windowStartStr && d < windowEndStr;
        })
    ),
  ]);
  const closedSlots = closedSnap.exists ? closedSnap.data() : {};

  const activeLaserOrderIds = new Set();
  const activeQkOrderIds = new Set();
  const newOrders = []; // commandes jamais vues avant ce run (pour le bouton "vérifier maintenant")
  const logLines = []; // journal lisible du run (bouton "Logs" du site), uniquement pour du vraiment nouveau
  const batch = db.batch();

  // "Déjà connue ?" est une simple lecture Firestore indépendante par commande -> vérifiées toutes
  // en parallèle d'un coup plutôt qu'une par une dans la boucle (le gros gain de vitesse du bouton
  // "vérifier maintenant", qui saute ensuite le travail lourd pour tout ce qui est déjà connu).
  const previewChecks = await Promise.all(
    events.map(async (event) => {
      const orderId = String(event.order_id);
      const previewRef = db.collection('crmSyncPreview').doc(`${event.activity}_${orderId}`);
      const previewSnap = await previewRef.get();
      return { event, orderId, previewRef, exists: previewSnap.exists };
    })
  );

  for (const { event, orderId, previewRef, exists } of previewChecks) {
    const detection = detectLaserFormula(event);
    const dateStr = eventDateStr(event);

    if (!exists) {
      newOrders.push({
        orderId,
        activity: event.activity,
        clientName: event.user || null,
        date: dateStr,
        time: `${event.h}h${String(event.i || 0).padStart(2, '0')}`,
      });
    } else if (fastCheck) {
      // Commande déjà connue: en mode "vérification rapide" (bouton du site) on ne refait pas tout
      // le travail lourd (fetch fiche détail, placement créneaux) pour elle, seule la nouveauté compte.
      continue;
    }

    // Prénom/âge enfant, montant encaissé, gâteau/champomy: absents du planning mensuel, seulement
    // sur la fiche détail commande. Un fetch de plus par résa qui va être écrite quelque part (laser
    // détecté, anniversaire pour la fiche, ou karaoke/quizzboxing pour avoir le vrai acompte encaissé
    // et pas le montant total) — best-effort, une fiche introuvable ne doit pas faire échouer le sync.
    let childFirstName = null;
    let childAge = null;
    let amountPaid = null;
    let cake = null;
    let champomyCount = null;
    let birthdayFormulaKey = null;
    // ponytail: debug temporaire pour voir le résultat du fetch directement dans Firestore
    // (les logs Cloud Run sont trop pénibles à consulter côté client) — à retirer une fois validé.
    let childFirstNameDebug = null;
    let detailFetched = false;
    const needsDetailFetch = !exists || daysUntilEvent(now, event) <= DETAIL_REFRESH_DAYS_AHEAD;
    if (needsDetailFetch && (detection || event.activity === 'anniversaire' || QK_ACTIVITY_MAP[event.activity])) {
      detailFetched = true;
      try {
        const detailHtml = await client.getOrderDetail(event.activity, orderId);
        childFirstName = extractChildFirstName(detailHtml);
        childAge = extractChildAge(detailHtml);
        amountPaid = extractAmountPaid(detailHtml);
        if (event.activity === 'anniversaire') {
          const products = extractCakeAndChampomy(detailHtml);
          cake = products.cake;
          champomyCount = products.champomyCount;
          birthdayFormulaKey = guessBirthdayFormulaKey(event);
        }
        childFirstNameDebug = { ok: true, htmlLength: String(detailHtml || '').length, found: childFirstName !== null };
      } catch (error) {
        childFirstNameDebug = { ok: false, error: String(error.message || error) };
        console.error(`[sync] fiche détail commande ${orderId} inaccessible:`, error.message);
      }
    }

    // Champs issus de la fiche détail: seulement inclus dans les écritures (merge:true) quand on
    // vient de la fetcher pour de vrai -> sinon on écraserait la vraie valeur déjà connue par null.
    const nameFields = detailFetched ? { childFirstName } : {};
    const birthdayDetailFields = detailFetched ? { childFirstName, childAge, cake, champomyCount, birthdayFormulaKey, childFirstNameDebug } : {};
    const deposit = { ...depositInfo(event), ...(detailFetched ? { amountPaid } : {}) };
    batch.set(
      previewRef,
      {
        ...event,
        detection,
        ...deposit,
        ...birthdayDetailFields,
        seenAt: now,
      },
      { merge: true }
    );

    if (dryRun) continue;

    // --- Volet laser (détection best-effort, toutes activités confondues) ---
    if (detection) {
      activeLaserOrderIds.add(orderId);
      const times = buildLgTimes(event, detection);

      // Sessions déjà déplacées/éditées à la main sur le site (locallyModified) -> on n'y touche plus,
      // on ne recalcule/écrit que les sessions encore "brutes" (jamais modifiées manuellement).
      const sessionRefs = times.map((_, i) => db.collection('laserGameReservations').doc(`crm_${orderId}_${i + 1}`));
      const sessionSnaps = await Promise.all(sessionRefs.map((r) => r.get()));
      const pending = times
        .map((t, i) => ({ t, ref: sessionRefs[i] }))
        .filter((_, i) => !(sessionSnaps[i].exists && sessionSnaps[i].data().locallyModified));

      if (pending.length > 0) {
        const dayReservationsSnap = await db.collection('laserGameReservations').where('date', '==', dateStr).get();
        const dayReservations = dayReservationsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => r.crmOrderId !== orderId); // ne pas se bloquer soi-même sur un re-sync

        const alertRef = db.collection('crmSyncAlerts').doc(`lg_${orderId}`);
        const alertSnap = await alertRef.get();
        const alreadyFlagged = alertSnap.exists && alertSnap.data().resolved === false;

        const room = alreadyFlagged
          ? null
          : pickLgRoom(
              event.nbr_participants || 1,
              dateStr,
              pending.map((p) => p.t),
              dayReservations,
              closedSlots
            );

        if (!alreadyFlagged && room == null) {
          batch.set(
            alertRef,
            {
              resolved: false,
              type: 'lg',
              crmOrderId: orderId,
              clientName: event.user || null,
              date: dateStr,
              attemptedTimes: pending.map((p) => ({ startTime: p.t.startTime, endTime: p.t.endTime })),
              nbrParticipants: event.nbr_participants || 1,
              ...nameFields,
              reason: 'Laser: les 2 salles sont prises sur ce créneau — à placer manuellement.',
              detectedAt: now,
            },
            { merge: true }
          );
          if (!exists) {
            logLines.push(`⚠️ Laser: conflit le ${dateStr} vers ${formatHour(pending[0].t.startTime)} (${event.user || 'client'}) — les 2 salles sont prises, à placer manuellement.`);
          }
        } else if (!alreadyFlagged) {
          pending.forEach(({ t, ref }) => {
            batch.set(
              ref,
              {
                clientName: event.user || null,
                date: dateStr,
                startTime: t.startTime,
                endTime: t.endTime,
                duration: t.duration,
                room,
                groups: [event.nbr_participants || 1],
                source: 'crm',
                crmOrderId: orderId,
                ...nameFields,
                ...deposit,
              },
              { merge: true }
            );
          });
          if (!exists) {
            const timesStr = pending.map((p) => `${formatHour(p.t.startTime)} (${p.t.duration}min)`).join(' + ');
            logLines.push(`🔫 Laser créé: ${dateStr} ${timesStr} — ${event.user || 'client'} (Salle ${room === 1 ? 'Bas' : 'Haut'})`);
          }
        }
      }
    }

    // --- Volet karaoke/quizzboxing (miroir direct vers qkReservations) ---
    if (QK_ACTIVITY_MAP[event.activity]) {
      activeQkOrderIds.add(orderId);
      const qkRef = db.collection('qkReservations').doc(`crm_${orderId}`);
      const qkSnap = await qkRef.get();
      const qkLocallyModified = qkSnap.exists && qkSnap.data().locallyModified;

      if (qkLocallyModified) {
        // déjà déplacée/éditée à la main sur le site -> on n'y touche plus
        continue;
      }

      const qkSlot = buildQkSlot(event);

      const dayQkSnap = await db.collection('qkReservations').where('date', '==', dateStr).get();
      const dayQkReservations = dayQkSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => r.crmOrderId !== orderId);

      const qkAlertRef = db.collection('crmSyncAlerts').doc(`qk_${orderId}`);
      const qkAlertSnap = await qkAlertRef.get();
      const qkAlreadyFlagged = qkAlertSnap.exists && qkAlertSnap.data().resolved === false;

      const qkConflict =
        !qkAlreadyFlagged &&
        !isQkSlotAvailable(dateStr, qkSlot.startTime, qkSlot.endTime, qkSlot.activity, dayQkReservations, closedSlots);

      if (qkConflict) {
        batch.set(
          qkAlertRef,
          {
            resolved: false,
            type: 'qk',
            crmOrderId: orderId,
            clientName: event.user || null,
            date: dateStr,
            attemptedTimes: [{ startTime: qkSlot.startTime, endTime: qkSlot.endTime }],
            activity: qkSlot.activity,
            nbrParticipants: event.nbr_participants || 1,
            reason: `${qkSlot.activity}: chevauche une réservation existante — à placer manuellement.`,
            detectedAt: now,
          },
          { merge: true }
        );
        if (!exists) {
          logLines.push(`⚠️ ${qkSlot.activity === 'karaoke' ? 'Karaoké' : 'Quiz'}: conflit le ${dateStr} à ${formatHour(qkSlot.startTime)} (${event.user || 'client'}) — chevauche une résa existante, à placer manuellement.`);
        }
      } else if (!qkAlreadyFlagged) {
        batch.set(
          qkRef,
          {
            clientName: event.user || null,
            date: dateStr,
            startTime: qkSlot.startTime,
            endTime: qkSlot.endTime,
            duration: qkSlot.duration,
            activity: qkSlot.activity,
            players: event.nbr_participants || 1,
            source: 'crm',
            crmOrderId: orderId,
            ...deposit,
          },
          { merge: true }
        );
        if (!exists) {
          logLines.push(`${qkSlot.activity === 'karaoke' ? '🎤 Karaoké' : '🎯 Quiz'} créé: ${dateStr} ${formatHour(qkSlot.startTime)} (${qkSlot.duration}min) — ${event.user || 'client'}`);
        }
      }
    }
  }

  // Résa CRM disparue du planning (annulée) -> on libère ce qu'on avait bloqué pour elle.
  // Uniquement en run complet (pas fastCheck, qui ne regarde qu'aujourd'hui et sauterait les
  // commandes déjà connues -> les prendrait à tort pour des annulations) et seulement dans la
  // fenêtre qu'on vient de fetch (sinon on jugerait des résas hors fenêtre qu'on n'a pas revues).
  if (!dryRun && !fastCheck) {
    const crmLgSnap = await db.collection('laserGameReservations').where('source', '==', 'crm').get();
    for (const docSnap of crmLgSnap.docs) {
      const data = docSnap.data();
      const inWindow = data.date >= windowStartStr && data.date < windowEndStr;
      if (inWindow && data.crmOrderId && !activeLaserOrderIds.has(data.crmOrderId)) {
        batch.delete(docSnap.ref);
      }
    }
    const crmQkSnap = await db.collection('qkReservations').where('source', '==', 'crm').get();
    for (const docSnap of crmQkSnap.docs) {
      const data = docSnap.data();
      const inWindow = data.date >= windowStartStr && data.date < windowEndStr;
      if (inWindow && data.crmOrderId && !activeQkOrderIds.has(data.crmOrderId)) {
        batch.delete(docSnap.ref);
      }
    }
  }

  batch.set(metaRef, { at: now }, { merge: true });
  await batch.commit();

  // Fermetures auto CRM (bug CRM ou règle de capacité, pas Firestore — déjà committé au-dessus) ->
  // une erreur ici ne doit jamais faire échouer le sync.
  if (!dryRun && (closeCrmDuplicates || closeAnniversaireWhenFull)) {
    const windowDates = [];
    for (let i = 0; i < daysAhead; i++) {
      windowDates.push(dateToStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)));
    }

    if (closeCrmDuplicates) {
      try {
        const closureEvents = await closeOverlappingBookedSlots(client, windowDates, { dryRun: false });
        for (const e of closureEvents) {
          const bookedLabel = `${e.slug === 'karaoke' ? 'Karaoké' : 'Quiz'} réservé en ligne le ${e.dateStr} à ${e.bookedHeure} (${e.bookedDuration || '?'})`;
          const closedLabel = e.closed.map((c) => `${c.heure} (${c.duration || '?'})`).join(', ') || '(aucun)';
          const failedSuffix = e.failedCount > 0 ? ` — ⚠️ ${e.failedCount} créneau(x) en échec, à vérifier sur le CRM` : '';
          logLines.push(`🔒 ${bookedLabel} → fermé ${e.closed.length} créneau(x) en doublon: ${closedLabel}${failedSuffix}`);
        }
      } catch (error) {
        console.error('[sync] fermeture créneaux CRM en doublon:', error.message);
      }
    }

    if (closeAnniversaireWhenFull) {
      try {
        const annivWindowDates = computeDateWindow(now, ANNIV_CAPACITY_DAYS_AHEAD);
        const annivEvents = await closeAnniversaireSlotsWhenFull(client, db, annivWindowDates, { dryRun: false });
        for (const e of annivEvents) {
          const closedLabel = e.closed.map((c) => `${c.heure} (${c.formule || '?'})`).join(', ') || '(aucun)';
          const failedSuffix = e.failedCount > 0 ? ` — ⚠️ ${e.failedCount} créneau(x) en échec, à vérifier sur le CRM` : '';
          logLines.push(`🎂 Anniversaires complets (${e.bookedCount} = ${e.crmCount} CRM + ${e.manualCount} manuel) le ${e.dateStr} → fermé ${e.closed.length} créneau(x) restants (quiz conservée): ${closedLabel}${failedSuffix}`);
        }
      } catch (error) {
        console.error('[sync] fermeture créneaux anniversaire (capacité):', error.message);
      }
    }
  }

  // Journal lisible (bouton "Logs" du site) — un doc par run, uniquement si ce run a fait quelque
  // chose de notable (sinon des centaines de docs vides tous les 10min pour rien).
  if (!dryRun && logLines.length > 0) {
    try {
      await db.collection('syncLogs').add({ at: now, lines: logLines });
    } catch (error) {
      console.error('[sync] écriture syncLogs:', error.message);
    }
  }

  return { skipped: false, eventsProcessed: events.length, newOrders };
}

module.exports = {
  runSync,
  shouldRunNow,
  detectLaserFormula,
  buildLgTimes,
  pickLgRoom,
  buildQkSlot,
  karaokeDurationMinutes,
  formatHour,
  extractChildFirstName,
  extractChildAge,
  extractAmountPaid,
  extractCakeAndChampomy,
  guessBirthdayFormulaKey,
  eventDateStr,
  eventStartTime,
  dateToStr,
  monthsSpanningDays,
  daysUntilEvent,
  DETAIL_REFRESH_DAYS_AHEAD,
};
