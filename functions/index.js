const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const { SpaceBowlingClient } = require('./src/spacebowlingClient');
const { runSync, formatHour, dateToStr } = require('./src/sync');
const { closeCrmSlotForManualBooking, openCrmSlotForManualBooking, SITE_ACTIVITY_TO_CRM_SLUG } = require('./src/creneauSync');
const { aggregateLanesByHour } = require('./src/bowlingLanes');
const { closeAnniversaireSlotsWhenFull } = require('./src/anniversaireCapacity');

admin.initializeApp();

const CRM_BASE_URL = defineSecret('CRM_BASE_URL');
const CRM_EMAIL = defineSecret('CRM_EMAIL');
const CRM_PASSWORD = defineSecret('CRM_PASSWORD');
// Clé de whitelist Cloudflare (header X-Internal-Bot) fournie par l'équipe CRM pour laisser passer
// ce bot sur /login malgré leur règle anti-bot — voir spacebowlingClient.js.
const CRM_INTERNAL_BOT_KEY = defineSecret('CRM_INTERNAL_BOT_KEY');

// Écriture réelle activée. La détection laser reste un mot-clé best-effort (aucun échantillon
// réel "anniversaire+laser" confirmé) — vérifier crmSyncPreview/crmSyncAlerts après le 1er run,
// un blocage erroné se supprime comme une résa normale (bouton X du site).
const DRY_RUN = false;

// Fermeture AUTO des créneaux karaoke en doublon (30min vs 1h qui se chevauchent) pendant le sync
// régulier — activé après validation du bouton manuel (closeCrmSlot) en conditions réelles.
const AUTO_CLOSE_DUPLICATE_SLOTS = true;

// Fermeture AUTO des créneaux anniversaire restants une fois 11 réservés (hors formule Quiz boxing,
// jamais comptée/fermée) — désactivé le temps de valider sur données réelles avant de lâcher sans
// surveillance, même prudence que pour AUTO_CLOSE_DUPLICATE_SLOTS à ses débuts.
const AUTO_CLOSE_ANNIVERSAIRE_WHEN_FULL = true;

function buildClient() {
  return new SpaceBowlingClient({
    baseUrl: CRM_BASE_URL.value(),
    email: CRM_EMAIL.value(),
    password: CRM_PASSWORD.value(),
    internalBotKey: CRM_INTERNAL_BOT_KEY.value(),
  });
}

// timeoutSeconds relevé: le fetch détail par commande (prénom/âge/montant payé/gâteau) tourne
// maintenant aussi pour karaoke/quizzboxing en plus de laser/anniversaire -> plus d'événements à
// traiter séquentiellement, 60s par défaut ne suffit plus forcément.
exports.syncCrm = onSchedule(
  { schedule: 'every 10 minutes', secrets: [CRM_BASE_URL, CRM_EMAIL, CRM_PASSWORD, CRM_INTERNAL_BOT_KEY], timeoutSeconds: 300 },
  async () => {
    // Si le CRM est injoignable/en erreur, runSync échoue AVANT toute écriture Firestore (le fetch
    // planning est un seul Promise.all "tout ou rien" — voir sync.js) -> rien n'est jamais écrit ou
    // supprimé à moitié. On attrape juste ici pour un log propre; le prochain run (10min) réessaie
    // de zéro tout seul, aucune action de récupération à faire.
    try {
      const result = await runSync(admin.firestore(), buildClient(), {
        dryRun: DRY_RUN,
        closeCrmDuplicates: AUTO_CLOSE_DUPLICATE_SLOTS,
        closeAnniversaireWhenFull: AUTO_CLOSE_ANNIVERSAIRE_WHEN_FULL,
      });
      console.log('[syncCrm]', result);
    } catch (error) {
      console.error('[syncCrm] échec du run (CRM injoignable ou en erreur ?) — le prochain run réessaiera dans 10min:', error.message);
    }
  }
);

// Déclenchement manuel (bouton "Vérifier maintenant" du site, ou test/curl) — ignore le throttle
// horaire, CORS ouvert pour être appelable en fetch() depuis le site. fastCheck: ne regarde que
// aujourd'hui et saute le traitement lourd des commandes déjà connues -> rapide, pensé pour être
// cliqué pendant le service ("est-ce qu'une résa vient d'arriver dans les 5 dernières minutes ?").
exports.syncCrmManual = onRequest(
  { secrets: [CRM_BASE_URL, CRM_EMAIL, CRM_PASSWORD, CRM_INTERNAL_BOT_KEY], timeoutSeconds: 300, cors: true },
  async (req, res) => {
    try {
      const result = await runSync(admin.firestore(), buildClient(), {
        dryRun: DRY_RUN,
        skipThrottle: true,
        daysAhead: 1,
        fastCheck: true,
        closeCrmDuplicates: AUTO_CLOSE_DUPLICATE_SLOTS,
        closeAnniversaireWhenFull: AUTO_CLOSE_ANNIVERSAIRE_WHEN_FULL,
      });
      res.json(result);
    } catch (error) {
      console.error('[syncCrmManual]', error);
      // reason distinct pour le blocage Cloudflare (voir spacebowlingClient.js#isCloudflareBlock) —
      // permet au site d'afficher "bloqué côté CRM, pas un bug chez nous" plutôt qu'un message générique.
      if (error.code === 'CF_BLOCKED') {
        res.status(503).json({ skipped: true, reason: 'cloudflare_blocked', message: error.message });
        return;
      }
      res.status(503).json({ skipped: true, reason: 'crm_unreachable', message: 'Le CRM ne répond pas, réessaie dans quelques minutes.' });
    }
  }
);

// Bouton "Fermer ce créneau sur le CRM ?" affiché après création manuelle d'une résa quiz/karaoké
// sur le site (script_v2.js). Body attendu: { activity: 'quiz'|'karaoke', date: 'YYYY-MM-DD',
// startTime: number (heures, ex 15.5), durationMinutes: number }.
exports.closeCrmSlot = onRequest(
  { secrets: [CRM_BASE_URL, CRM_EMAIL, CRM_PASSWORD, CRM_INTERNAL_BOT_KEY], timeoutSeconds: 60, cors: true },
  async (req, res) => {
    const { activity, date, startTime, durationMinutes } = req.body || {};
    if (!activity || !date || typeof startTime !== 'number' || !durationMinutes) {
      res.status(400).json({ success: false, message: 'Paramètres manquants (activity, date, startTime, durationMinutes).' });
      return;
    }
    try {
      const result = await closeCrmSlotForManualBooking(buildClient(), {
        activity,
        dateStr: date,
        startTime,
        durationMinutes,
      });

      // Log (bouton "Logs" du site) — uniquement s'il s'est passé quelque chose (fermeture réelle
      // ou conflit détecté), pas pour le cas "rien à fermer" qui n'apporte rien à voir.
      const activityLabel = activity === 'karaoke' ? 'Karaoké' : 'Quiz';
      let line = null;
      if (result.alreadyBookedOnCrm) {
        line = `⚠️ Fermeture manuelle: ${activityLabel} le ${date} à ${formatHour(startTime)} — déjà réservé sur le CRM !`;
      } else if (result.closed && result.closed.length > 0) {
        const closedLabel = result.closed.map((c) => `${c.heure} (${c.duration || '?'})`).join(', ');
        const failedSuffix = result.failedCount > 0 ? ` — ⚠️ ${result.failedCount} créneau(x) en échec, à vérifier sur le CRM` : '';
        line = `🔧 Fermeture manuelle: ${activityLabel} le ${date} à ${formatHour(startTime)} (${durationMinutes}min) → fermé ${result.closed.length} créneau(x): ${closedLabel}${failedSuffix}`;
      } else if (result.failedCount > 0) {
        line = `⚠️ Fermeture manuelle: ${activityLabel} le ${date} à ${formatHour(startTime)} — échec total (${result.failedCount} créneau(x)), à vérifier sur le CRM.`;
      }
      if (line) {
        admin.firestore().collection('syncLogs').add({ at: new Date(), lines: [line] }).catch((error) => {
          console.error('[closeCrmSlot] écriture syncLogs:', error.message);
        });
      }

      res.json(result);
    } catch (error) {
      console.error('[closeCrmSlot]', error);
      res.status(500).json({ success: false, message: 'Erreur lors de la fermeture du créneau CRM.' });
    }
  }
);

// Pendant de closeCrmSlot: appelé quand le staff libère manuellement un créneau quiz/karaoké côté
// site (case "Fermé" décochée sur un créneau, ou réservation quiz/karaoké déplacée en glisser-déposer
// hors de son ancien créneau). Body attendu: { activity: 'quiz'|'karaoke', date: 'YYYY-MM-DD',
// startTime: number (heures, ex 15.5), durationMinutes: number }.
exports.openCrmSlot = onRequest(
  { secrets: [CRM_BASE_URL, CRM_EMAIL, CRM_PASSWORD, CRM_INTERNAL_BOT_KEY], timeoutSeconds: 60, cors: true },
  async (req, res) => {
    const { activity, date, startTime, durationMinutes } = req.body || {};
    if (!activity || !date || typeof startTime !== 'number' || !durationMinutes) {
      res.status(400).json({ success: false, message: 'Paramètres manquants (activity, date, startTime, durationMinutes).' });
      return;
    }
    try {
      const result = await openCrmSlotForManualBooking(buildClient(), {
        activity,
        dateStr: date,
        startTime,
        durationMinutes,
      });

      const activityLabel = activity === 'karaoke' ? 'Karaoké' : 'Quiz';
      let line = null;
      if (result.alreadyBookedOnCrm) {
        line = `⚠️ Réouverture manuelle: ${activityLabel} le ${date} à ${formatHour(startTime)} — déjà réservé sur le CRM, pas touché.`;
      } else if (result.opened && result.opened.length > 0) {
        const openedLabel = result.opened.map((c) => `${c.heure} (${c.duration || '?'})`).join(', ');
        const failedSuffix = result.failedCount > 0 ? ` — ⚠️ ${result.failedCount} créneau(x) en échec, à vérifier sur le CRM` : '';
        line = `🔓 Réouverture manuelle: ${activityLabel} le ${date} à ${formatHour(startTime)} (${durationMinutes}min) → rouvert ${result.opened.length} créneau(x): ${openedLabel}${failedSuffix}`;
      } else if (result.failedCount > 0) {
        line = `⚠️ Réouverture manuelle: ${activityLabel} le ${date} à ${formatHour(startTime)} — échec total (${result.failedCount} créneau(x)), à vérifier sur le CRM.`;
      }
      if (line) {
        admin.firestore().collection('syncLogs').add({ at: new Date(), lines: [line] }).catch((error) => {
          console.error('[openCrmSlot] écriture syncLogs:', error.message);
        });
      }

      res.json(result);
    } catch (error) {
      console.error('[openCrmSlot]', error);
      res.status(500).json({ success: false, message: 'Erreur lors de la réouverture du créneau CRM.' });
    }
  }
);

// Utilitaire admin (pas de bouton sur le site): rouvrir un créneau fermé par erreur ou pour un
// test — l'inverse de closeCrmSlot. Body: { activity: 'quiz'|'karaoke', creneauId: number }.
exports.reopenCrmSlot = onRequest(
  { secrets: [CRM_BASE_URL, CRM_EMAIL, CRM_PASSWORD, CRM_INTERNAL_BOT_KEY], timeoutSeconds: 30, cors: true },
  async (req, res) => {
    const { activity, creneauId } = req.body || {};
    const slug = SITE_ACTIVITY_TO_CRM_SLUG[activity];
    if (!slug || !creneauId) {
      res.status(400).json({ success: false, message: 'Paramètres manquants (activity, creneauId).' });
      return;
    }
    try {
      const client = buildClient();
      const csrfToken = await client.getMetaCsrfToken(slug);
      await client.setCreneauStatut(slug, creneauId, 1, csrfToken);
      res.json({ success: true });
    } catch (error) {
      console.error('[reopenCrmSlot]', error);
      res.status(500).json({ success: false, message: 'Erreur lors de la réouverture.' });
    }
  }
);

// Bouton "Monitoring Bar" du site — appelé toutes les 30s pendant que le popup est ouvert pour
// détecter les nouvelles commandes bar pendant l'absence des barmans.
// Cache Firestore partagé (25s, < 30s du polling client): si 2 postes monitorent en même temps,
// un seul déclenche un vrai appel CRM, l'autre lit le cache — pas de dédup possible côté navigateur
// puisque ce sont deux machines différentes. Petite fenêtre de double-appel si 2 requêtes arrivent
// à quelques ms d'écart pile au moment où le cache expire — sans conséquence, pas de lock ajouté.
const BAR_ORDERS_CACHE_DOC = 'getBarOrders';
const BAR_ORDERS_CACHE_TTL_MS = 40000; // < 45s du polling client (script_v2.js) côté site

exports.getBarOrders = onRequest(
  { secrets: [CRM_BASE_URL, CRM_EMAIL, CRM_PASSWORD, CRM_INTERNAL_BOT_KEY], timeoutSeconds: 30, cors: true },
  async (req, res) => {
    const cacheRef = admin.firestore().collection('_cache').doc(BAR_ORDERS_CACHE_DOC);
    try {
      const cached = await cacheRef.get();
      if (cached.exists) {
        const { orders, fetchedAt } = cached.data();
        if (fetchedAt && Date.now() - fetchedAt.toMillis() < BAR_ORDERS_CACHE_TTL_MS) {
          res.json({ success: true, orders, cached: true });
          return;
        }
      }

      const orders = await buildClient().getBarOrders();
      // Awaited (pas fire-and-forget): l'instance peut être gelée juste après la réponse, un write
      // non-attendu risquerait de ne jamais partir et de faire louper le bénéfice du cache.
      await cacheRef.set({ orders, fetchedAt: new Date() }).catch((error) => {
        console.error('[getBarOrders] écriture cache:', error.message);
      });
      res.json({ success: true, orders });
    } catch (error) {
      console.error('[getBarOrders]', error);
      res.status(503).json({ success: false, message: 'Le CRM ne répond pas.' });
    }
  }
);

// Raccourci "temps d'attente" dans l'entête du site — lit/écrit le réglage CRM affiché aux clients
// (settings/waitingTimeBowling), pour ne pas avoir à aller sur le CRM juste pour ça.
exports.getWaitingTime = onRequest(
  { secrets: [CRM_BASE_URL, CRM_EMAIL, CRM_PASSWORD, CRM_INTERNAL_BOT_KEY], timeoutSeconds: 30, cors: true },
  async (req, res) => {
    try {
      const { minutes } = await buildClient().getWaitingTimeBowling();
      res.json({ success: true, minutes });
    } catch (error) {
      console.error('[getWaitingTime]', error);
      res.status(503).json({ success: false, message: 'Le CRM ne répond pas.' });
    }
  }
);

exports.setWaitingTime = onRequest(
  { secrets: [CRM_BASE_URL, CRM_EMAIL, CRM_PASSWORD, CRM_INTERNAL_BOT_KEY], timeoutSeconds: 30, cors: true },
  async (req, res) => {
    const minutes = parseInt((req.body || {}).minutes, 10);
    if (!Number.isInteger(minutes) || minutes < 0) {
      res.status(400).json({ success: false, message: 'Paramètre "minutes" invalide.' });
      return;
    }
    try {
      await buildClient().setWaitingTimeBowling(minutes);
      res.json({ success: true, minutes });
    } catch (error) {
      console.error('[setWaitingTime]', error);
      res.status(503).json({ success: false, message: 'Le CRM ne répond pas.' });
    }
  }
);

// Onglet "Pistes réservées" du panneau Groupes du Jour — nombre de pistes bowling réservées par
// heure aujourd'hui + détail par résa (voir bowlingLanes.js pour le calcul).
exports.getBowlingLanesToday = onRequest(
  { secrets: [CRM_BASE_URL, CRM_EMAIL, CRM_PASSWORD, CRM_INTERNAL_BOT_KEY], timeoutSeconds: 30, cors: true },
  async (req, res) => {
    try {
      const now = new Date();
      const events = await buildClient().getBowlingPlanningByMonth(now.getFullYear(), now.getMonth() + 1);
      const hours = aggregateLanesByHour(events, dateToStr(now));
      res.json({ success: true, hours });
    } catch (error) {
      console.error('[getBowlingLanesToday]', error);
      res.status(503).json({ success: false, message: 'Le CRM ne répond pas.' });
    }
  }
);

// Appelé juste après la création manuelle d'une fiche anniversaire sur le site — vérifie tout de
// suite si la capacité (11, hors Quiz boxing) est atteinte pour cette date, sans attendre le
// prochain passage du sync 10min (qui ne couvrirait même pas une date future via le bouton manuel).
exports.checkAnniversaireCapacity = onRequest(
  { secrets: [CRM_BASE_URL, CRM_EMAIL, CRM_PASSWORD, CRM_INTERNAL_BOT_KEY], timeoutSeconds: 30, cors: true },
  async (req, res) => {
    const dateStr = (req.body || {}).date;
    if (!dateStr) {
      res.status(400).json({ success: false, message: 'Paramètre "date" manquant.' });
      return;
    }
    try {
      const events = await closeAnniversaireSlotsWhenFull(buildClient(), admin.firestore(), [dateStr], { dryRun: false });
      const event = events[0] || null;
      res.json({
        success: true,
        bookedCount: event ? event.bookedCount : null,
        closed: event ? event.closed : [],
      });
    } catch (error) {
      console.error('[checkAnniversaireCapacity]', error);
      res.status(503).json({ success: false, message: 'Le CRM ne répond pas.' });
    }
  }
);
