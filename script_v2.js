document.addEventListener('DOMContentLoaded', function() {
    // === NOUVEAU : OUTILS FIREBASE ===
    // On récupère les outils que nous avons rendus disponibles dans le HTML via window.firebaseTools
    const {
        auth, db, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut,
        doc, getDoc, setDoc, updateDoc, onSnapshot, collection, addDoc, getDocs, writeBatch, query, where, deleteDoc, deleteField,orderBy, limit, arrayUnion, serverTimestamp
    } = window.firebaseTools;

    // === NOUVEAU : GESTION DE L'AUTHENTIFICATION ===
    const mainContainer = document.getElementById('main-container');
    const authContainer = document.getElementById('auth-container');
    const authStatus = document.getElementById('auth-status');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    
    let isTablePlanGenerated = false; // Pour savoir si on l'a déjà fait une fois
    let isEditMode = false; // Pour le mode Drag & Drop
    let currentBirthdaysList = []; // NOUVEAU : Déplacé ici pour être accessible par toutes les fonctions
    let currentGoatName = "";
    let currentUser = null; // Pour stocker les infos de l'utilisateur connecté
    let unsubscribes = []; // Pour stocker nos écouteurs Firebase et les arrêter à la déconnexion
    let currentCleaningUser = "Anonyme"; // On essaiera de choper le user connecté
    let specialPeriodsCache = [];
    let EMPLOYEES = []; 
    let CLEANER_COLORS = {};
    
    // NOUVEAU : La variable est déclarée ici pour être disponible partout immédiatement
    let stickyCountersData = new Map(); 

    if (window.firebaseTools && window.firebaseTools.auth && window.firebaseTools.auth.currentUser) {
        currentCleaningUser = window.firebaseTools.auth.currentUser.displayName || window.firebaseTools.auth.currentUser.email;
    }

    // Surveille les changements d'état de connexion
onAuthStateChanged(auth, async (user) => {
    // On arrête toujours les anciens écouteurs en premier
    unsubscribes.forEach(unsub => unsub());
    unsubscribes = [];

    // On récupère les conteneurs principaux
    const authContainer = document.getElementById('auth-container');
    const mainContainer = document.getElementById('main-container');
    const mobileContainer = document.getElementById('mobile-container');
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    

    if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        const userManagementBtn = document.getElementById('open-user-management-modal');
        if (userManagementBtn) userManagementBtn.style.display = 'none';

        if (userDocSnap.exists() && ['admin', 'moderator'].includes(userDocSnap.data().role)) {
            // L'utilisateur est connecté et autorisé
            currentUser = user;
            
            // On cache le formulaire de connexion
            authContainer.style.display = 'none';
            
            
            // On affiche la bonne interface (mobile ou desktop)
            if (isMobile) {
                mobileContainer.style.display = 'block';
                mainContainer.style.display = 'none';
            } else {
                mobileContainer.style.display = 'none';
                mainContainer.style.display = 'block';
                // NOUVEAU : On récupère les éléments avant de les modifier
                const notepadContainer = document.getElementById('notepad-container');
                const generalNotesContainer = document.getElementById('general-notes-container');
                if (notepadContainer) notepadContainer.style.display = 'flex';
                if (generalNotesContainer) generalNotesContainer.style.display = 'flex';
            }
            

            // On met à jour l'interface utilisateur
            document.getElementById('auth-status').textContent = `Connecté : ${user.displayName}`;
            document.getElementById('login-btn').style.display = 'none';
            document.getElementById('logout-btn').style.display = 'block';
            
            if (userDocSnap.data().role === 'admin' && userManagementBtn) {
                userManagementBtn.style.display = 'block';
            }
            
            // On lance l'application et la navigation mobile si nécessaire
            initializeApp();
            // NOUVEAU : on démarre l'écoute du plan de table seulement maintenant, une fois
            // initializeApp() terminé (donc formatDateForStorage/formatDateForDisplay déjà exposées
            // sur window). L'appeler plus tôt (juste après sa déclaration, hors de initializeApp)
            // levait une ReferenceError au chargement de la page et bloquait tout le reste du script,
            // y compris l'ouverture du menu hamburger.
            updateTablePlanDateDisplay();
            subscribeToTablePlan();
            setupMobileNavigation();

        } else {
            // L'utilisateur n'a pas les droits ou n'existe pas encore correctement
            // On le déconnecte et on affiche le message approprié
            let statusMessage = "Accès refusé. Vos permissions sont insuffisantes.";
            if (!userDocSnap.exists()) {
                await setDoc(userDocRef, {
                    email: user.email,
                    displayName: user.displayName,
                    role: 'viewer'
                });
                statusMessage = "Compte créé. Contactez un admin pour obtenir les droits.";
            }
            signOut(auth);
            // Si la déconnexion échoue, on s'assure quand même que l'interface est correcte
            document.getElementById('auth-status').textContent = statusMessage;
            authContainer.style.display = 'flex';
            mainContainer.style.display = 'none';
            mobileContainer.style.display = 'none';
        }
    } else {
            // L'utilisateur est déconnecté
            currentUser = null;
            
            // On affiche UNIQUEMENT le formulaire de connexion
            authContainer.style.display = 'flex';
            mainContainer.style.display = 'none';
            mobileContainer.style.display = 'none';

            // NOUVEAU : On cache les panneaux latéraux
            const notepadContainer = document.getElementById('notepad-container');
            const generalNotesContainer = document.getElementById('general-notes-container');
            if (notepadContainer) notepadContainer.style.display = 'none';
            if (generalNotesContainer) generalNotesContainer.style.display = 'none';

        // On met à jour les messages et boutons
        document.getElementById('auth-status').textContent = "Veuillez vous connecter pour continuer...";
        document.getElementById('login-btn').style.display = 'block';
        document.getElementById('logout-btn').style.display = 'none';
    }
});

    // Clic sur le bouton de connexion
    loginBtn.addEventListener('click', () => {
        const provider = new GoogleAuthProvider();
    
        // On force l'affichage de la sélection de compte à chaque connexion.
        // Ceci permet de contourner les bugs de session corrompue sur certains navigateurs.
        provider.setCustomParameters({
          prompt: 'select_account'
        });
    
        signInWithPopup(auth, provider).catch(error => {
            console.error("Erreur de connexion : ", error);
            authStatus.textContent = "Erreur lors de la connexion. Veuillez réessayer.";
        });
    });

    // Clic sur le bouton de déconnexion
    logoutBtn.addEventListener('click', () => {
        signOut(auth);
    });


    // =========================================================================
    // === TOUT VOTRE CODE EST MAINTENANT DANS CETTE FONCTION D'INITIALISATION ===
    // =========================================================================
    
    function initializeApp() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(registration => {
                console.log('Service Worker enregistré avec succès :', registration);
            })
            .catch(error => {
                console.log('Échec de l\'enregistrement du Service Worker :', error);
            });
    }
    // Configuration
    const OPENING_HOUR = 13; // 13h
    const TIME_SLOT_STEP = 0.5; // Pas de 30 minutes
    const SLOT_GRACE_MINUTES = 20; // Délai (en min) après le début d'un créneau pendant lequel on peut encore réserver
    
    // Éléments du DOM
    const currentDateDisplay = document.getElementById('current-date');
    const prevDayButton = document.getElementById('prev-day');
    const nextDayButton = document.getElementById('next-day');
    const room1Slots = document.querySelector('#room-1 .time-slots');
    const room2Slots = document.querySelector('#room-2 .time-slots');
    const calendarBtn = document.getElementById('calendar-btn');
    const calendarInput = document.getElementById('calendar-input');
    const editModal = document.getElementById('edit-reservation-modal');
    const editForm = document.getElementById('edit-reservation-form');
    const editReservationId = document.getElementById('edit-reservation-id');
    const editClientName = document.getElementById('edit-client-name');
    const editClientPhone = document.getElementById('edit-client-phone');
    const editReservationDate = document.getElementById('edit-reservation-date');
    const editStartTime = document.getElementById('edit-start-time');
    const editGroupsContainer = document.getElementById('edit-groups-container');
    const addGroupBtn = document.getElementById('add-group-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const notepadContainer = document.getElementById('notepad-container');
    const generalNotesContainer = document.getElementById('general-notes-container');
    

    const specialDateStartInput = document.getElementById('special-date-start');
    const specialDateEndInput = document.getElementById('special-date-end');
    const addSpecialPeriodBtn = document.getElementById('add-special-period');
    const specialPeriodsListDiv = document.getElementById('special-periods-list');
    const openSpecialPeriodsModalBtn = document.getElementById('open-special-periods-modal');
    const specialPeriodsModal = document.getElementById('special-periods-modal');
    const closeButton = specialPeriodsModal.querySelector('.close-button');

    const openPricingModalBtn = document.getElementById('open-pricing-modal');
    const pricingModal = document.getElementById('pricing-modal');
    const closePricingModalBtn = pricingModal.querySelector('.close-button');
    const pricingRulesContainer = document.getElementById('pricing-rules-container');
    const addPricingRuleBtn = document.getElementById('add-pricing-rule');
    const savePricingBtn = document.getElementById('save-pricing');
    const resetPricingDefaultsBtn = document.getElementById('reset-pricing-defaults');

    const toggleLaserGameBtn = document.getElementById('toggle-laser-game');
    const toggleQuizKaraokeBtn = document.getElementById('toggle-quiz-karaoke');
	const toggleBirthdaysBtn = document.getElementById('toggle-birthdays');
    const toggleTablePlanBtn = document.getElementById('toggle-table-plan');
    const laserGameView = document.getElementById('laser-game-view');
    const quizKaraokeView = document.getElementById('quiz-karaoke-view');
	const birthdaysView = document.getElementById('birthdays-view');
    const tablePlanView = document.getElementById('table-plan-view');

    // Éléments du calendrier Quiz/Karaoké
    const qkCurrentDateDisplay = document.getElementById('qk-current-date');
    const qkPrevDayButton = document.getElementById('qk-prev-day');
    const qkNextDayButton = document.getElementById('qk-next-day');
    const qkCalendarBtn = document.getElementById('qk-calendar-btn');
    const qkCalendarInput = document.getElementById('qk-calendar-input');
    const quizSlots = document.querySelector('#room-quiz .time-slots');
    const karaokeSlots = document.querySelector('#room-karaoke .time-slots');
    
    const userManagementModal = document.getElementById('user-management-modal');
    const openUserManagementBtn = document.getElementById('open-user-management-modal');
    const closeUserManagementBtn = userManagementModal.querySelector('.close-button');
    const userListContainer = document.getElementById('user-list-container');
    
let reservations = [];
    let qkReservations = [];
    let closedSlots = {};
    let crmSyncAlerts = [];

    // Variables pour stocker les écouteurs actifs afin de pouvoir les stopper
    let currentReservationsUnsub = null;
    let currentQkReservationsUnsub = null;
    let currentDayNoteUnsub = null;

    // Fonction pour lancer l'écoute sur une date précise
    function subscribeToDate(dateTarget) {
        const dateStr = formatDateForStorage(dateTarget);

        // 1. On arrête les anciens écouteurs s'ils existent (pour ne pas payer double)
        if (currentReservationsUnsub) currentReservationsUnsub();
        if (currentQkReservationsUnsub) currentQkReservationsUnsub();
        if (currentDayNoteUnsub) currentDayNoteUnsub();

        // Écouteur de la "Note du jour" liée à la date affichée
        currentDayNoteUnsub = onSnapshot(doc(db, "dayNotes", dateStr), (docSnap) => {
            const noteText = (docSnap.exists() && docSnap.data().text) ? docSnap.data().text : '';
            if (typeof updateDayNoteDisplay === 'function') {
                updateDayNoteDisplay(dateStr, noteText);
            }
        });

        // 2. Écouteur OPTIMISÉ Laser Game (Filtre 'where' ajouté)
        const lgQuery = query(collection(db, "laserGameReservations"), where("date", "==", dateStr));
        currentReservationsUnsub = onSnapshot(lgQuery, (querySnapshot) => {
            if (typeof showOfflineBanner === 'function') showOfflineBanner(false); // les données arrivent → en ligne
            reservations = [];
            querySnapshot.forEach((doc) => {
                reservations.push({ id: doc.id, ...doc.data() });
            });
            displayReservationsForDate(currentDate);
        }, (error) => {
            console.error("Écoute Laser Game interrompue :", error);
            if (typeof showOfflineBanner === 'function') showOfflineBanner(true);
        });

        // 3. Écouteur OPTIMISÉ Quiz/Karaoké (Filtre 'where' ajouté)
        const qkQuery = query(collection(db, "qkReservations"), where("date", "==", dateStr));
        currentQkReservationsUnsub = onSnapshot(qkQuery, (querySnapshot) => {
            qkReservations = [];
            querySnapshot.forEach((doc) => {
                qkReservations.push({ id: doc.id, ...doc.data() });
            });
            displayQkReservationsForDate(currentDate);
        }, (error) => {
            console.error("Écoute Quiz/Karaoké interrompue :", error);
            if (typeof showOfflineBanner === 'function') showOfflineBanner(true);
        });
        
        // Ajout aux écouteurs globaux pour le nettoyage à la déconnexion
        // (Note: unsubscribes est ton tableau global défini plus haut)
        if (!unsubscribes.includes(currentReservationsUnsub)) unsubscribes.push(() => currentReservationsUnsub && currentReservationsUnsub());
        if (!unsubscribes.includes(currentQkReservationsUnsub)) unsubscribes.push(() => currentQkReservationsUnsub && currentQkReservationsUnsub());
        unsubscribes.push(() => currentDayNoteUnsub && currentDayNoteUnsub());
    }

    // NOUVEAU : On écoute les créneaux fermés
    const unsubClosedSlots = onSnapshot(doc(db, "closedSlots", "all"), (docSnap) => {
        if (docSnap.exists()) {
            closedSlots = docSnap.data();
        } else {
            closedSlots = {};
        }
        // On rafraîchit les deux calendriers car les créneaux fermés les affectent
        displayReservationsForDate(currentDate);
        displayQkReservationsForDate(currentDate);
    });
    unsubscribes.push(unsubClosedSlots);

    // Alertes de superposition CRM (sync auto vs résa existante) non résolues
    const crmAlertsQuery = query(collection(db, "crmSyncAlerts"), where("resolved", "==", false));
    const unsubCrmAlerts = onSnapshot(crmAlertsQuery, (querySnapshot) => {
        crmSyncAlerts = [];
        querySnapshot.forEach((doc) => {
            crmSyncAlerts.push({ id: doc.id, ...doc.data() });
        });
        updateCrmAlertButton();
    });
    unsubscribes.push(unsubCrmAlerts);

    function updateCrmAlertButton() {
        const btn = document.getElementById('crm-alert-btn');
        if (!btn) return;
        if (crmSyncAlerts.length > 0) {
            btn.style.display = 'flex';
            btn.querySelector('.crm-alert-count').textContent = crmSyncAlerts.length;
            renderCrmAlertPanel();
        } else {
            btn.style.display = 'none';
            const panel = document.getElementById('crm-alert-panel');
            if (panel) panel.style.display = 'none';
        }
    }

    function renderCrmAlertPanel() {
        const list = document.getElementById('crm-alert-list');
        if (!list) return;
        list.innerHTML = '';
        crmSyncAlerts
            .slice()
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
            .forEach((alert) => {
                const item = document.createElement('div');
                item.className = 'crm-alert-item';
                item.draggable = true;
                item.title = 'Glisse cette carte directement sur le créneau de ton choix';
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', `crmalert:${alert.id}`);
                    e.dataTransfer.effectAllowed = 'move';
                });
                item.innerHTML = `
                    <div>🧲 <b>${alert.clientName || 'Client inconnu'}</b> — ${alert.date || '?'} (${alert.nbrParticipants || '?'}p)</div>
                    ${alert.childFirstName ? `<div style="font-size:0.85em;">🎈 Enfant : ${alert.childFirstName}</div>` : ''}
                    <div style="font-size:0.85em; opacity:0.85;">${describeCrmAlert(alert)}</div>
                `;
                const actions = document.createElement('div');
                actions.className = 'crm-alert-actions';

                const jumpBtn = document.createElement('button');
                jumpBtn.textContent = '📍 Voir le créneau';
                jumpBtn.className = 'crm-alert-jump-btn';
                jumpBtn.onclick = () => jumpToCrmAlert(alert);

                const resolveBtn = document.createElement('button');
                resolveBtn.textContent = '✓';
                resolveBtn.title = 'Marquer réglé (déjà placé manuellement)';
                resolveBtn.className = 'crm-alert-resolve-btn';
                resolveBtn.onclick = () => resolveCrmAlert(alert.id);

                actions.appendChild(jumpBtn);
                actions.appendChild(resolveBtn);
                item.appendChild(actions);
                list.appendChild(item);
            });
    }

    // Avertissement affiché en tête de la modale de déplacement quand la résa vient du CRM.
    function crmMoveWarningPrefix(isCrmSourced) {
        return isCrmSourced ? '⚠️ Attention, vous déplacez une réservation Internet injectée via le CRM.\n\n' : '';
    }

    // "Laser : 14h / 14h30 indisponible" / "Quiz : 14h indisponible" / "Karaoké : 14h indisponible"
    function describeCrmAlert(alert) {
        const times = (alert.attemptedTimes || []).map(t => formatTime(t.startTime)).join(' / ');
        if (alert.type === 'qk') {
            const label = alert.activity === 'quiz' ? 'Quiz' : 'Karaoké';
            return `${label} : ${times} indisponible`;
        }
        return `Laser : ${times} indisponible`;
    }

    // Amène le calendrier sur le jour de l'alerte et fait clignoter le(s) créneau(x) concerné(s)
    // pour que le staff voie tout de suite où placer la résa à la main.
    function jumpToCrmAlert(alert) {
        if (!alert.date) return;
        const [y, m, d] = alert.date.split('-').map(Number);
        currentDate = new Date(y, m - 1, d);
        updateDateDisplay();
        updateQkDateDisplay();
        subscribeToDate(currentDate);

        const panel = document.getElementById('crm-alert-panel');
        if (panel) panel.style.display = 'none';

        setTimeout(() => {
            const containers = alert.type === 'qk'
                ? [alert.activity === 'quiz' ? quizSlots : karaokeSlots]
                : [room1Slots, room2Slots];
            (alert.attemptedTimes || []).forEach((t) => {
                containers.forEach((container) => {
                    if (!container) return;
                    const cell = container.querySelector(`[data-time="${t.startTime}"]`);
                    if (cell) {
                        cell.classList.add('crm-alert-target');
                        cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => cell.classList.remove('crm-alert-target'), 6000);
                    }
                });
            });
        }, 400);
    }

    // Dépose d'une carte d'alerte CRM sur un créneau -> crée la/les résa(s) à cet endroit et
    // résout l'alerte. Pour une formule laser à 2 sessions, la 2e garde le même écart que celui
    // calculé côté sync (30min), ancré sur le créneau choisi par le staff.
    async function handleCrmAlertDrop(alertId, targetSlot, container) {
        const alert = crmSyncAlerts.find(a => a.id === alertId);
        if (!alert || !alert.attemptedTimes || alert.attemptedTimes.length === 0) return;

        const dateStr = formatDateForStorage(currentDate);
        const anchorStart = parseFloat(targetSlot.dataset.time);
        const baseStart = alert.attemptedTimes[0].startTime;
        const isLaserGame = container === room1Slots || container === room2Slots;

        if (isLaserGame) {
            if (targetSlot.classList.contains('booked')) return;
            const newRoom = parseInt(targetSlot.closest('.room').id.split('-')[1]);
            const sessions = alert.attemptedTimes.map(t => {
                const startTime = anchorStart + (t.startTime - baseStart);
                return { startTime, endTime: startTime + (t.endTime - t.startTime) };
            });

            for (const s of sessions) {
                if (!isTimeSlotAvailable(dateStr, s.startTime, s.endTime, newRoom)) {
                    showCustomAlert("Le créneau choisi n'est pas disponible.");
                    return;
                }
            }

            const placeMessage = `${crmMoveWarningPrefix(true)}Placer la résa de "${alert.clientName}" à ${formatTime(anchorStart)} (salle ${newRoom}) ?\nQui place cette réservation ?`;
            showCustomAlert(placeMessage, 'prompt', async (moverName) => {
                try {
                    for (let i = 0; i < sessions.length; i++) {
                        const ref = doc(db, "laserGameReservations", `crm_${alert.crmOrderId}_${i + 1}`);
                        await setDoc(ref, {
                            clientName: alert.clientName,
                            date: dateStr,
                            startTime: sessions[i].startTime,
                            endTime: sessions[i].endTime,
                            duration: (sessions[i].endTime - sessions[i].startTime) * 60,
                            room: newRoom,
                            groups: [alert.nbrParticipants || 1],
                            source: 'crm',
                            crmOrderId: alert.crmOrderId,
                            childFirstName: alert.childFirstName || null,
                            locallyModified: true,
                            lastMovedBy: moverName,
                            lastMovedAt: serverTimestamp(),
                            paid: false,
                            monte: false,
                            createdAt: serverTimestamp()
                        }, { merge: true });
                    }
                    await setDoc(doc(db, "crmSyncAlerts", alert.id), { resolved: true }, { merge: true });
                    showToast('Réservation placée');
                } catch (error) {
                    console.error("Erreur placement alerte CRM :", error);
                    showCustomAlert("Le placement a échoué.");
                }
            });
        } else {
            if (targetSlot.classList.contains('booked')) return;
            const newActivity = container === quizSlots ? 'quiz' : 'karaoke';
            const t = alert.attemptedTimes[0];
            const newEnd = anchorStart + (t.endTime - t.startTime);

            if (!isQkSlotAvailable(dateStr, anchorStart, newEnd, newActivity)) {
                showCustomAlert("Le créneau choisi n'est pas disponible.");
                return;
            }

            const placeMessage = `${crmMoveWarningPrefix(true)}Placer la résa de "${alert.clientName}" à ${formatTime(anchorStart)} (${newActivity}) ?\nQui place cette réservation ?`;
            showCustomAlert(placeMessage, 'prompt', async (moverName) => {
                try {
                    const ref = doc(db, "qkReservations", `crm_${alert.crmOrderId}`);
                    await setDoc(ref, {
                        clientName: alert.clientName,
                        date: dateStr,
                        startTime: anchorStart,
                        endTime: newEnd,
                        duration: (newEnd - anchorStart) * 60,
                        activity: newActivity,
                        players: alert.nbrParticipants || 1,
                        source: 'crm',
                        crmOrderId: alert.crmOrderId,
                        locallyModified: true,
                        lastMovedBy: moverName,
                        lastMovedAt: serverTimestamp(),
                        paid: false,
                        monte: false,
                        createdAt: serverTimestamp()
                    }, { merge: true });
                    await setDoc(doc(db, "crmSyncAlerts", alert.id), { resolved: true }, { merge: true });
                    showToast('Réservation placée');
                } catch (error) {
                    console.error("Erreur placement alerte CRM :", error);
                    showCustomAlert("Le placement a échoué.");
                }
            });
        }
    }

    async function resolveCrmAlert(alertId) {
        try {
            await setDoc(doc(db, "crmSyncAlerts", alertId), { resolved: true }, { merge: true });
        } catch (error) {
            console.error("Erreur résolution alerte CRM :", error);
        }
    }

    const crmAlertBtnEl = document.getElementById('crm-alert-btn');
    if (crmAlertBtnEl) {
        crmAlertBtnEl.addEventListener('click', () => {
            const panel = document.getElementById('crm-alert-panel');
            if (panel) panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
        });
    }

    const unsubTimers = onSnapshot(doc(db, "timers", "liveState"), (docSnap) => {
        if (docSnap.exists()) {
            const liveTimers = docSnap.data();
            for (const room in liveTimers) {
                if (counters[room]) {
                    // On met à jour l'état local avec les données de Firestore
                    counters[room].endTime = liveTimers[room].endTime;
                    counters[room].isCountingDown = liveTimers[room].isCountingDown;
                    counters[room].isPaused = !!liveTimers[room].isPaused;
                    counters[room].pausedRemainingMs = liveTimers[room].pausedRemainingMs != null ? liveTimers[room].pausedRemainingMs : null;
					counters[room].customTitle = liveTimers[room].title || null;
                }
            }
            // L'intervalle global s'occupera de mettre à jour l'affichage, plus besoin d'appel direct.
        }
    });
    unsubscribes.push(unsubTimers);
function updateAllTimersDisplay() {
    // On boucle sur chaque salle (1 à 4)
    for (const room of [1, 2, 3, 4]) {
        const counter = counters[room];

        // --- Bouton Stop/Reprendre : le libellé et le style reflètent l'état pause/en cours ---
        const allStopBtns = [
            ...document.querySelectorAll(`#counter-${room} .stop-btn`),
            ...document.querySelectorAll(`#counter-${room}-anniv .stop-btn`)
        ];
        allStopBtns.forEach(btn => {
            if (!btn) return;
            if (counter.isPaused) {
                btn.textContent = '▶ Reprendre';
                btn.classList.add('is-paused');
            } else {
                btn.textContent = 'Stop';
                btn.classList.remove('is-paused');
            }
        });

        // Si le chrono est censé tourner d'après notre état local (synchronisé avec Firestore)
        if (counter.isCountingDown && counter.endTime) {
                const now = Date.now();
                const diffMs = counter.endTime - now;
                const isNegative = diffMs < 0;
                const absMs = Math.abs(diffMs);

                const minutes = Math.floor(absMs / 60000);
                const seconds = Math.floor((absMs % 60000) / 1000);
                const sign = isNegative ? "-" : "";
                const newTime = `${sign}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                
                // On met à jour chaque afficheur (desktop, mobile ET anniv)
                const allDisplays = [
                    ...document.querySelectorAll(`#counter-${room} .counter-display`),
                    ...document.querySelectorAll(`#counter-${room}-anniv .counter-display`)
                ];

                allDisplays.forEach(display => {
                    if(display) {
                         display.textContent = newTime;
                         display.classList.remove('timer-paused');
                         if (isNegative) {
                             display.classList.add('timer-ended');
                             display.classList.remove('one-minute-left');
                         } else {
                             display.classList.remove('timer-ended');
                             if (absMs <= 60000) display.classList.add('one-minute-left');
                             else display.classList.remove('one-minute-left');
                         }
                    }
                });

                // GESTION DU TITRE DYNAMIQUE
                if (counters[room].customTitle) {
                    const titles = [
                        document.querySelector(`#laser-game-view #counter-${room} .counter-titre h3`), // Vue Laser
                        document.querySelector(`#quiz-karaoke-view #counter-${room} .counter-titre h3`), // Vue Quiz (NOUVEAU)
                        document.querySelector(`#counter-${room}-anniv .counter-titre h3`) // Vue Anniv
                    ];
                    titles.forEach(t => {
                        if(t) t.innerHTML = counters[room].customTitle;
                    });
                }
            } else if (counter.isPaused) {
                // NOUVEAU : chrono EN PAUSE -- on affiche le temps restant figé (pas remis à 00:00,
                // pour bien le distinguer visuellement d'un Reset) et on garde le titre personnalisé.
                const absMs = counter.pausedRemainingMs || 0;
                const minutes = Math.floor(absMs / 60000);
                const seconds = Math.floor((absMs % 60000) / 1000);
                const newTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

                const allDisplays = [
                    ...document.querySelectorAll(`#counter-${room} .counter-display`),
                    ...document.querySelectorAll(`#counter-${room}-anniv .counter-display`)
                ];
                allDisplays.forEach(display => {
                    if (display) {
                        display.textContent = newTime;
                        display.classList.remove('timer-ended', 'one-minute-left');
                        display.classList.add('timer-paused');
                    }
                });

                // On conserve le titre personnalisé (ex: anniversaire en cours) pendant la pause.
                if (counters[room].customTitle) {
                    const titles = [
                        document.querySelector(`#laser-game-view #counter-${room} .counter-titre h3`),
                        document.querySelector(`#quiz-karaoke-view #counter-${room} .counter-titre h3`),
                        document.querySelector(`#counter-${room}-anniv .counter-titre h3`)
                    ];
                    titles.forEach(t => {
                        if (t) t.innerHTML = counters[room].customTitle;
                    });
                }
            } else {
             // Si le chrono est arrêté (Reset/Stop)
            
            // On définit les titres par défaut avec le saut de ligne <br>
            const defaultTitlesHtml = {
                1: "⬇️ Salle Bas ⬇️<br><span style='font-size:0.8em; font-weight:normal;'>Max: 12 joueurs</span>",
                2: "⬆️ Salle Haut ⬆️<br><span style='font-size:0.8em; font-weight:normal;'>Max: 16 joueurs</span>",
                3: "🎙️ Karaoké 🎙️<br><span style='font-size:0.8em; font-weight:normal;'>Max: 10 joueurs</span>",
                4: "🚨 QuizzBoxing 🚨<br><span style='font-size:0.8em; font-weight:normal;'>Max: 12 joueurs</span>"
            };

            const titles = [
                document.querySelector(`#laser-game-view #counter-${room} .counter-titre h3`), // Vue Laser
                document.querySelector(`#quiz-karaoke-view #counter-${room} .counter-titre h3`), // Vue Quiz (NOUVEAU)
                document.querySelector(`#counter-${room}-anniv .counter-titre h3`) // Vue Anniv
            ];
            
            titles.forEach(t => {
                if (t && defaultTitlesHtml[room]) {
                    // MODIFICATION : On utilise innerHTML pour le saut de ligne
                    t.innerHTML = defaultTitlesHtml[room];
                }
            });

            // ... reste du code (00:00, classes) inchangé ...
             const allDisplays = [
                ...document.querySelectorAll(`#counter-${room} .counter-display`),
                ...document.querySelectorAll(`#counter-${room}-anniv .counter-display`)
            ];
            allDisplays.forEach(display => {
                if(display) {
                    display.textContent = "00:00";
                    display.classList.remove('timer-ended', 'one-minute-left', 'timer-paused');
                }
            });
        }
    }
}

// ==========================================
// === LISTE "PANIERS DE BONBONS" (prénom + nb enfants, pour préparation rapide) ===
// ==========================================

function printCandyList(dateStr, birthdays) {
    const sorted = [...birthdays].sort((a, b) => a.time.localeCompare(b.time));
    const totalChildren = sorted.reduce((sum, bd) => sum + (parseInt(bd.count) || 0), 0);
    const [dy, dm, dd] = dateStr.split('-').map(Number);
    const dateLabel = (dy && dm && dd) ? formatDateForDisplay(new Date(dy, dm - 1, dd)) : dateStr;

    const printWindow = window.open('', '_blank');
    const rows = sorted.map(bd => `
        <tr>
            <td>${bd.name || '?'}</td>
            <td class="count">${bd.count || 0}</td>
        </tr>
    `).join('');

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Paniers de bonbons - ${dateLabel}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { font-size: 1.3em; margin-bottom: 4px; }
                p.total { color: #555; margin-top: 0; margin-bottom: 20px; }
                table { border-collapse: collapse; width: 100%; max-width: 400px; }
                th, td { border: 1px solid #999; padding: 8px 12px; text-align: left; font-size: 1.1em; }
                th { background: #f0f0f0; }
                td.count, th.count { text-align: center; }
            </style>
        </head>
        <body>
            <h1>🍬 Paniers de bonbons — ${dateLabel}</h1>
            <p class="total">${sorted.length} anniversaire(s) — ${totalChildren} enfant(s) au total</p>
            <table>
                <thead><tr><th>Prénom</th><th class="count">Nb enfants</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}

// ==========================================
// === GESTION IMPRESSION FICHES A5 (SPACE THEME) ===
// ==========================================

function printBirthdaySheets(birthdays) {
    // On trie par heure pour l'impression
    const sortedBirthdays = [...birthdays].sort((a, b) => a.time.localeCompare(b.time));

    const printWindow = window.open('', '_blank');
    
    // Chemin du logo
    const logoSrc = 'logo.png'; 

    let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Fiches Réservation - Space Bowling</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Roboto:wght@400;700&display=swap');
            
            @page { 
                size: A4 landscape; 
                margin: 0; 
            }
            
            @media print { 
                body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } 
                .page-break { page-break-after: always; }
            }

            body { 
                font-family: 'Roboto', sans-serif; 
                margin: 0; 
                background: white; 
            }
            
            .a4-page {
                width: 297mm;
                height: 210mm;
                display: flex; 
                margin: 0 auto;
                background: white;
                overflow: hidden;
            }

            .sheet {
                width: 148.5mm; 
                height: 210mm;
                position: relative;
                box-sizing: border-box;
                display: flex; 
                flex-direction: column; 
                justify-content: flex-start; 
                align-items: center;    
                padding-top: 15mm; 
                border-right: 1px dashed #ccc; 
                
                /* Cadre double "Tech" */
                border: 10px solid white; 
                outline: 2px solid #1a2a6c; 
                outline-offset: -10px;
                overflow: hidden; 
            }

            .sheet:last-child {
                border-right: none;
            }

            /* --- PLANÈTE CSS (Saturne) --- */
            .planet-container {
                position: absolute;
                bottom: -30px;
                right: -30px;
                width: 150px;
                height: 150px;
                z-index: 1;
                opacity: 0.3;
                transform: rotate(-20deg);
            }
            .planet-body {
                width: 80px;
                height: 80px;
                border-radius: 50%;
                border: 2px solid #1a2a6c;
                background: transparent;
                position: absolute;
                top: 35px;
                left: 35px;
            }
            .planet-ring {
                width: 140px;
                height: 40px;
                border-radius: 50%;
                border: 2px solid #e74c3c; 
                position: absolute;
                top: 55px;
                left: 5px;
            }

            /* --- FUSÉE --- */
            .rocket-icon {
                position: absolute;
                top: 50%;
                left: 10%;
                font-size: 80px;
                opacity: 0.1;
                z-index: 0;
                transform: rotate(45deg);
                filter: grayscale(100%);
            }

            /* --- ÉTOILES ET DÉCORS --- */
            .deco {
                position: absolute;
                z-index: 1;
                font-family: Arial, sans-serif;
            }
            .star-group { top: 20px; left: 20px; color: #1a2a6c; font-size: 20px; opacity: 0.4; }
            .confetti-1 { bottom: 80px; left: 30px; color: #f1c40f; font-size: 24px; opacity: 0.6; transform: rotate(15deg); }
            .confetti-2 { bottom: 120px; left: 60px; color: #3498db; font-size: 18px; opacity: 0.5; }
            .star-1 { top: 120px; right: 40px; color: #e74c3c; font-size: 22px; opacity: 0.5; }

            /* --- CONTENU --- */
            .logo-container {
                margin-bottom: 10px;
                z-index: 2;
                background: white; 
                padding: 10px;
                border-radius: 10px;
            }

            .logo-img {
                width: 150px; 
                height: auto;
                display: block;
            }

            .reserved-label {
                font-family: 'Orbitron', sans-serif;
                font-size: 1.5em;
                letter-spacing: 3px;
                font-weight: 800;
                text-transform: uppercase;
                color: #e74c3c; 
                border: 2px solid #e74c3c;
                padding: 5px 10px;
                margin-bottom: 15px;
                border-radius: 8px;
                background: white;
                z-index: 2;
            }

            .name {
                font-family: 'Orbitron', sans-serif;
                font-size: 2.6em; 
                font-weight: 900;
                text-transform: uppercase;
                margin: 0;
                line-height: 1.1;
                color: #1a2a6c; 
                padding: 0 5mm;
                word-wrap: break-word;
                z-index: 2;
                text-align: center;
            }
            
            .age-span {
                font-size: 0.6em;
                color: #555;
                font-weight: normal;
                white-space: nowrap;
            }

            .formula-display {
                font-family: 'Orbitron', sans-serif;
                font-size: 1.2em;
                color: #e67e22; /* Orange */
                font-weight: bold;
                margin-top: 5px;
                margin-bottom: 15px;
                z-index: 2;
                text-align: center;
                background: rgba(255,255,255,0.8);
                padding: 2px 10px;
                border-radius: 4px;
            }

            .count-badge {
                margin-top: 10px;
                background: white;
                color: #333;
                border-radius: 50px;
                padding: 10px 30px;
                font-size: 1.8em;
                font-weight: bold;
                border: 2px dashed #3498db; 
                z-index: 2;
            }

            .time-info {
                margin-top: auto; 
                margin-bottom: 25mm;
                font-size: 1.6em;
                font-weight: bold;
                color: #333;
                font-family: 'Orbitron', sans-serif;
                z-index: 2;
                background: white;
                padding: 5px 15px;
                border-radius: 5px;
            }

        </style>
    </head>
    <body>`;

    // Boucle par pas de 2
    for (let i = 0; i < sortedBirthdays.length; i += 2) {
        const bd1 = sortedBirthdays[i];
        const bd2 = sortedBirthdays[i + 1]; 

        if (i > 0) htmlContent += `<div class="page-break"></div>`;

        htmlContent += `<div class="a4-page">`;

        const createSheet = (bd) => `
            <div class="sheet">
                <div class="planet-container">
                    <div class="planet-body"></div>
                    <div class="planet-ring"></div>
                </div>
                <div class="rocket-icon">🚀</div>
                <div class="deco star-group">✨ + ✦</div>
                <div class="deco star-1">★</div>
                <div class="deco confetti-1">🎈</div>
                <div class="deco confetti-2">✦</div>

                <div class="logo-container">
                    <img src="${logoSrc}" class="logo-img" alt="Space Bowling">
                </div>
                
                <div class="reserved-label">Réservation Anniversaire</div>
                
                <div class="name">
                    ${bd.name} <span class="age-span">(${bd.age} ans)</span>
                </div>
                
                <div class="formula-display">${bd.formulaLabel}</div>

                <div class="count-badge">${getBirthdayCountNumber(bd) ?? '?'} Enfants</div>
                <div class="time-info">Arrivée : ${bd.time}</div>
            </div>`;

        // Fiche Gauche
        htmlContent += createSheet(bd1);

        // Fiche Droite
        if (bd2) {
            htmlContent += createSheet(bd2);
        } else {
            htmlContent += `<div class="sheet" style="border:none; outline:none;"></div>`;
        }

        htmlContent += `</div>`; 
    }

    htmlContent += `
        <script>
            window.onload = function() { 
                setTimeout(function() {
                    window.print(); 
                }, 500);
            }
        <\/script>
    </body></html>`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

    // Ajoutez en haut du fichier (avec les autres constantes)
let notificationPermissionGranted = false;
// Fonctions pour gérer l'alerte d'onglet
let tabAlertInterval;

function startTabAlert(room) {
    // Sauvegarde le titre original si nécessaire
    if (!counters[room].originalTitle || counters[room].originalTitle.includes('⚠')) {
        counters[room].originalTitle = document.title;
    }
    
    // Nettoie tout intervalle existant
    if (tabAlertInterval) clearInterval(tabAlertInterval);
    
    // Configure le nouveau clignotement
    tabAlertInterval = setInterval(() => {
        document.title = document.title === counters[room].originalTitle 
            ? `⚠ SALLE ${room} - 1 MINUTE ⚠` 
            : counters[room].originalTitle;
    }, 800);
}

function stopTabAlert() {
    if (tabAlertInterval) {
        clearInterval(tabAlertInterval);
        tabAlertInterval = null;
        // Restaure le titre original
        for (let room of [1, 2, 3, 4]) {
            if (counters[room].originalTitle) {
                document.title = counters[room].originalTitle;
                break;
            }
        }
    }
}
async function subscribeUserToPush() {
    try {
        const registration = await navigator.serviceWorker.ready;
        
        let subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            console.log('Utilisateur déjà abonné.');
            return;
        }

        // --- MODIFICATION ICI ---
        // Remplace la chaîne ci-dessous par la VRAIE clé publique que tu as générée
        const vapidPublicKey = 'BG2LuAcxHXjC5UGivgbSYtReVmxubcKFaLILhs_H8gtJ_wZikBgcbUcqISOVsc040gNv45GJgC8fZWCkF96c1qs'; 
        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
        });

        console.log('Nouvel abonnement !', subscription);
        
        if (window.firebaseTools && window.firebaseTools.currentUser) {
            const { db, doc, setDoc } = window.firebaseTools;
            const subscRef = doc(db, "pushSubscriptions", window.firebaseTools.currentUser.uid);
            await setDoc(subscRef, JSON.parse(JSON.stringify(subscription)));
            
            new Notification('Abonnement réussi !', {
                body: 'Les notifications push sont maintenant activées.',
                icon: 'favicon.ico'
            });
        }

    } catch (error) {
        console.error("Erreur lors de l'abonnement aux notifications push:", error);
    }
}

// Fonction utilitaire à ajouter pour convertir la clé VAPID
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
// NOUVEAU : Gère la demande de permission pour les notifications
function setupNotifications() {
    const notificationBtns = document.querySelectorAll('.enable-notifications-btn');

    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log("Ce navigateur ne supporte pas les notifications push.");
        return;
    }

    notificationBtns.forEach(btn => {
        if (Notification.permission === 'default') {
            btn.style.display = 'block';
        }

        btn.addEventListener('click', () => {
            Notification.requestPermission().then(permission => {
                notificationBtns.forEach(b => b.style.display = 'none');
                
                if (permission === 'granted') {
                    // C'est ici qu'on lance la logique d'abonnement
                    subscribeUserToPush();
                }
            });
        });
    });
}
    let currentDate = new Date();

    if (currentDate.getHours() < 2 || (currentDate.getHours() === 2 && currentDate.getMinutes() <= 10)) {
        currentDate.setDate(currentDate.getDate() - 1);
    }
    
    // Compteurs pour chaque salle
let counters = {
    1: { 
        endTime: null,
        interval: null,
        flashInterval: null,
        originalTitle: document.title, // Stocke le titre original
        // MODIFICATION ICI
        displays: document.querySelectorAll('#counter-1 .counter-display'),
        isCountingDown: false,
        isPaused: false,
        pausedRemainingMs: null,
        notified: false
    },
    2: { 
        endTime: null,
        interval: null,
        flashInterval: null,
        originalTitle: document.title, // Stocke le titre original
        // MODIFICATION ICI
        displays: document.querySelectorAll('#counter-2 .counter-display'),
        isCountingDown: false,
        isPaused: false,
        pausedRemainingMs: null,
        notified: false
    },
    3: { 
        endTime: null,
        interval: null,
        flashInterval: null,
        originalTitle: document.title, // Stocke le titre original
        // MODIFICATION ICI
        displays: document.querySelectorAll('#counter-3 .counter-display'),
        isCountingDown: false,
        isPaused: false,
        pausedRemainingMs: null,
        notified: false
    },
    4: { 
        endTime: null,
        interval: null,
        flashInterval: null,
        originalTitle: document.title, // Stocke le titre original
        // MODIFICATION ICI
        displays: document.querySelectorAll('#counter-4 .counter-display'),
        isCountingDown: false,
        isPaused: false,
        pausedRemainingMs: null,
        notified: false
    }
};
// Exposé pour le module PiP (chronos détachables), qui vit hors de cette closure.
// Même référence : les mises à jour Firestore restent visibles.
window.counters = counters;


// CORRECTION : Les listeners pour le modal sont déplacés ici
openSpecialPeriodsModalBtn.addEventListener('click', () => {
    specialPeriodsModal.style.display = 'flex'; // Utilise flex pour centrer
    displaySpecialPeriods(); // S'assure que la liste est à jour à l'ouverture
});

// Logique pour fermer le modal via le bouton (X)
closeButton.addEventListener('click', () => {
    specialPeriodsModal.style.display = 'none';
});

// Logique pour fermer le modal en cliquant en dehors
window.addEventListener('click', (event) => {
    // Si on clique sur le fond du modal des périodes spéciales
    if (event.target === specialPeriodsModal) {
        specialPeriodsModal.style.display = 'none';
    }
    // Si on clique sur le fond du modal de création/modification
    if (event.target === editModal) {
        closeEditModal(); // On utilise la fonction existante pour bien réinitialiser le titre
    }
    if (event.target === userManagementModal) {
        userManagementModal.style.display = 'none';
    }
});

// ==================================================================
// === MODALE ADMIN "💶 Gérer les tarifs" ===
// ==================================================================
let pricingEditState = null; // copie de travail (non sauvegardée tant qu'on ne clique pas "Enregistrer")
let currentPricingTab = 'laser';

function getDefaultTierForActivity(activity) {
    return activity === 'quiz' ? { min: 4, max: 6, price: 0 } : { duration: 20, price: 0 };
}

function addPricingRule(activity) {
    if (!pricingEditState[activity]) pricingEditState[activity] = [];
    pricingEditState[activity].push({
        special: false,
        days: [1, 2, 3, 4, 5],
        timeStart: 0,
        timeEnd: 24,
        tiers: [getDefaultTierForActivity(activity)]
    });
}

function removePricingRule(activity, ruleIdx) {
    pricingEditState[activity].splice(ruleIdx, 1);
}

function movePricingRule(activity, ruleIdx, direction) {
    const rules = pricingEditState[activity];
    const target = ruleIdx + direction;
    if (target < 0 || target >= rules.length) return;
    const tmp = rules[ruleIdx];
    rules[ruleIdx] = rules[target];
    rules[target] = tmp;
}

function addPricingTier(activity, ruleIdx) {
    pricingEditState[activity][ruleIdx].tiers.push(getDefaultTierForActivity(activity));
}

function removePricingTier(activity, ruleIdx, tierIdx) {
    pricingEditState[activity][ruleIdx].tiers.splice(tierIdx, 1);
}

function renderPricingRules() {
    if (!pricingRulesContainer) return;
    const rules = pricingEditState[currentPricingTab] || [];
    pricingRulesContainer.innerHTML = '';

    if (rules.length === 0) {
        pricingRulesContainer.innerHTML = '<p>Aucune règle pour cette activité. Cliquez sur "+ Ajouter une règle".</p>';
        return;
    }

    const dayLabels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

    rules.forEach((rule, idx) => {
        const ruleEl = document.createElement('div');
        ruleEl.className = 'pricing-rule-card';

        let daysHtml = '<div class="pricing-days-row">';
        for (let dnum = 0; dnum < 7; dnum++) {
            const checked = (rule.days || []).includes(dnum) ? 'checked' : '';
            daysHtml += `<label class="pricing-day-label"><input type="checkbox" class="pr-day" data-idx="${idx}" data-day="${dnum}" ${checked}> ${dayLabels[dnum]}</label>`;
        }
        daysHtml += '</div>';

        const specialValue = rule.special === true ? 'true' : (rule.special === false ? 'false' : 'any');

        let tiersHtml = '<div class="pr-tiers">';
        (rule.tiers || []).forEach((tier, tIdx) => {
            if (currentPricingTab === 'quiz') {
                tiersHtml += `
                <div class="pr-tier-row">
                    <input type="number" class="pr-tier-min" data-idx="${idx}" data-tidx="${tIdx}" value="${tier.min}" min="1">
                    <span>à</span>
                    <input type="number" class="pr-tier-max" data-idx="${idx}" data-tidx="${tIdx}" value="${tier.max}" min="1">
                    <span>joueurs =</span>
                    <input type="number" class="pr-tier-price" data-idx="${idx}" data-tidx="${tIdx}" value="${tier.price}" min="0" step="0.5">
                    <span>€/pers.</span>
                    <button type="button" class="delete-btn pr-remove-tier" data-idx="${idx}" data-tidx="${tIdx}">X</button>
                </div>`;
            } else {
                tiersHtml += `
                <div class="pr-tier-row">
                    <input type="number" class="pr-tier-duration" data-idx="${idx}" data-tidx="${tIdx}" value="${tier.duration}" min="1">
                    <span>min =</span>
                    <input type="number" class="pr-tier-price" data-idx="${idx}" data-tidx="${tIdx}" value="${tier.price}" min="0" step="0.5">
                    <span>€/pers.</span>
                    <button type="button" class="delete-btn pr-remove-tier" data-idx="${idx}" data-tidx="${tIdx}">X</button>
                </div>`;
            }
        });
        tiersHtml += `<button type="button" class="button-secondary pr-add-tier" data-idx="${idx}">+ Ajouter un palier</button></div>`;

        ruleEl.innerHTML = `
            <div class="pricing-rule-header">
                <strong>Règle ${idx + 1}</strong>
                <div class="pricing-rule-actions">
                    <button type="button" class="button-secondary pr-move-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>▲</button>
                    <button type="button" class="button-secondary pr-move-down" data-idx="${idx}" ${idx === rules.length - 1 ? 'disabled' : ''}>▼</button>
                    <button type="button" class="delete-btn pr-remove-rule" data-idx="${idx}">Supprimer</button>
                </div>
            </div>
            <div class="pricing-context-row">
                <label class="pricing-context-label">Contexte :
                    <select class="pr-special" data-idx="${idx}">
                        <option value="false" ${specialValue === 'false' ? 'selected' : ''}>Jours normaux</option>
                        <option value="true" ${specialValue === 'true' ? 'selected' : ''}>Vacances / fériés / veille de férié</option>
                        <option value="any" ${specialValue === 'any' ? 'selected' : ''}>Peu importe (toute l'année)</option>
                    </select>
                </label>
            </div>
            ${daysHtml}
            <div class="pricing-time-row">
                <label>De <input type="number" class="pr-time-start" data-idx="${idx}" value="${rule.timeStart ?? 0}" min="0" max="24" step="0.5"> h</label>
                <label>à <input type="number" class="pr-time-end" data-idx="${idx}" value="${rule.timeEnd ?? 24}" min="0" max="24" step="0.5"> h</label>
            </div>
            ${tiersHtml}
        `;
        pricingRulesContainer.appendChild(ruleEl);
    });
}

function readPricingRuleFieldsFromDom() {
    // Les champs texte/nombre sont lus directement dans le DOM au moment de l'enregistrement
    // (pas de resynchronisation à chaque frappe, pour éviter de perdre le focus au clavier).
    const rules = pricingEditState[currentPricingTab] || [];
    rules.forEach((rule, idx) => {
        const specialEl = pricingRulesContainer.querySelector(`.pr-special[data-idx="${idx}"]`);
        if (specialEl) {
            rule.special = specialEl.value === 'true' ? true : (specialEl.value === 'false' ? false : null);
        }
        const dayEls = pricingRulesContainer.querySelectorAll(`.pr-day[data-idx="${idx}"]`);
        const days = [];
        dayEls.forEach(cb => { if (cb.checked) days.push(parseInt(cb.dataset.day, 10)); });
        rule.days = days;

        const startEl = pricingRulesContainer.querySelector(`.pr-time-start[data-idx="${idx}"]`);
        const endEl = pricingRulesContainer.querySelector(`.pr-time-end[data-idx="${idx}"]`);
        if (startEl) rule.timeStart = parseFloat(startEl.value) || 0;
        if (endEl) rule.timeEnd = parseFloat(endEl.value) || 24;

        rule.tiers.forEach((tier, tIdx) => {
            const priceEl = pricingRulesContainer.querySelector(`.pr-tier-price[data-idx="${idx}"][data-tidx="${tIdx}"]`);
            if (priceEl) tier.price = parseFloat(priceEl.value) || 0;
            if (currentPricingTab === 'quiz') {
                const minEl = pricingRulesContainer.querySelector(`.pr-tier-min[data-idx="${idx}"][data-tidx="${tIdx}"]`);
                const maxEl = pricingRulesContainer.querySelector(`.pr-tier-max[data-idx="${idx}"][data-tidx="${tIdx}"]`);
                if (minEl) tier.min = parseFloat(minEl.value) || 0;
                if (maxEl) tier.max = parseFloat(maxEl.value) || 0;
            } else {
                const durEl = pricingRulesContainer.querySelector(`.pr-tier-duration[data-idx="${idx}"][data-tidx="${tIdx}"]`);
                if (durEl) tier.duration = parseFloat(durEl.value) || 0;
            }
        });
    });
}

if (pricingRulesContainer) {
    pricingRulesContainer.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('pr-add-tier')) {
            readPricingRuleFieldsFromDom();
            addPricingTier(currentPricingTab, parseInt(target.dataset.idx, 10));
            renderPricingRules();
        } else if (target.classList.contains('pr-remove-tier')) {
            readPricingRuleFieldsFromDom();
            removePricingTier(currentPricingTab, parseInt(target.dataset.idx, 10), parseInt(target.dataset.tidx, 10));
            renderPricingRules();
        } else if (target.classList.contains('pr-remove-rule')) {
            readPricingRuleFieldsFromDom();
            removePricingRule(currentPricingTab, parseInt(target.dataset.idx, 10));
            renderPricingRules();
        } else if (target.classList.contains('pr-move-up')) {
            readPricingRuleFieldsFromDom();
            movePricingRule(currentPricingTab, parseInt(target.dataset.idx, 10), -1);
            renderPricingRules();
        } else if (target.classList.contains('pr-move-down')) {
            readPricingRuleFieldsFromDom();
            movePricingRule(currentPricingTab, parseInt(target.dataset.idx, 10), 1);
            renderPricingRules();
        }
    });
}

if (openPricingModalBtn) {
    openPricingModalBtn.addEventListener('click', () => {
        pricingEditState = JSON.parse(JSON.stringify(getPricingConfig()));
        currentPricingTab = 'laser';
        document.querySelectorAll('.pricing-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.activity === currentPricingTab);
        });
        renderPricingRules();
        pricingModal.style.display = 'flex';
    });
}

if (closePricingModalBtn) {
    closePricingModalBtn.addEventListener('click', () => {
        pricingModal.style.display = 'none';
    });
}

window.addEventListener('click', (event) => {
    if (event.target === pricingModal) {
        pricingModal.style.display = 'none';
    }
});

document.querySelectorAll('.pricing-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        readPricingRuleFieldsFromDom();
        currentPricingTab = btn.dataset.activity;
        document.querySelectorAll('.pricing-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
        renderPricingRules();
    });
});

if (addPricingRuleBtn) {
    addPricingRuleBtn.addEventListener('click', () => {
        readPricingRuleFieldsFromDom();
        addPricingRule(currentPricingTab);
        renderPricingRules();
    });
}

if (savePricingBtn) {
    savePricingBtn.addEventListener('click', async () => {
        readPricingRuleFieldsFromDom();
        savePricingBtn.disabled = true;
        savePricingBtn.textContent = '💾 Enregistrement...';
        await savePricingConfig(pricingEditState);
        savePricingBtn.disabled = false;
        savePricingBtn.textContent = '💾 Enregistrer les tarifs';
        showCustomAlert('Tarifs enregistrés !');
    });
}

if (resetPricingDefaultsBtn) {
    resetPricingDefaultsBtn.addEventListener('click', () => {
        showCustomAlert('Réinitialiser tous les tarifs aux valeurs par défaut ? Cette action écrasera vos modifications non enregistrées.', 'confirm', () => {
            pricingEditState = JSON.parse(JSON.stringify(DEFAULT_PRICING));
            renderPricingRules();
        });
    });
}

    // Initialisation
    setupNotifications();
    subscribeToDate(currentDate);
    updateDateDisplay();
    setupCounters();
    setupDragAndDrop();
// === NOUVEAU : GESTION BILLARD ===
    const billardList = document.getElementById('billard-queue-list');
    const billardCount = document.getElementById('billard-queue-count');
    const billardAddBtn = document.getElementById('billard-add-btn');
    const billardNewName = document.getElementById('billard-new-name');

    // Listener Firebase pour la file d'attente Billard
    unsubscribes.push(onSnapshot(doc(db, "queues", "billard"), (docSnap) => {
        if(billardList) billardList.innerHTML = '';
        let queue = [];
        if (docSnap.exists() && docSnap.data().list) {
            queue = docSnap.data().list;
        }
        // Exposé pour le module PiP (chronos détachables), même principe que window.counters.
        window.billardQueue = queue;

        if(billardCount) billardCount.textContent = queue.length;
        
        queue.forEach(item => {
            const div = document.createElement('div');
            div.className = 'queue-item billard-item';
            div.innerHTML = `<span>${item.name}</span> <button class="check-btn" data-id="${item.id}">✔</button>`;
            
            div.querySelector('.check-btn').addEventListener('click', async (e) => {
                const idToRemove = e.target.dataset.id;
                const newQueue = queue.filter(q => q.id !== idToRemove);
                await setDoc(doc(db, "queues", "billard"), { list: newQueue });
            });
            billardList.appendChild(div);
        });
    }));

    if(billardAddBtn) {
            billardAddBtn.addEventListener('click', async () => {
                const name = billardNewName.value.trim();
                if(!name) return;
                
                // NOUVEAU : Utilisation de arrayUnion pour éviter les conflits d'écriture et forcer l'ajout
                const docRef = doc(db, "queues", "billard");
                await setDoc(docRef, { list: arrayUnion({ id: Date.now().toString(), name: name }) }, { merge: true });
                
                billardNewName.value = '';
            });

            billardNewName.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') billardAddBtn.click();
        });
    }

    // === NOUVEAU : GESTION DE LA "NOTE DU JOUR" ===
    let dayNoteCurrentDateStr = null; // Date à laquelle est rattachée la note affichée

    // Appelée par l'écouteur Firestore (subscribeToDate) à chaque changement de jour/note
    function updateDayNoteDisplay(dateStr, noteText) {
        dayNoteCurrentDateStr = dateStr;

        const indicator = document.getElementById('day-note-indicator');
        const textarea = document.getElementById('day-note-textarea');
        const title = document.getElementById('day-note-title');

        // Petit astérisque rouge si une note existe pour ce jour
        if (indicator) {
            indicator.style.display = (noteText && noteText.trim() !== '') ? 'block' : 'none';
        }

        // On ne réécrit pas le champ pendant que l'utilisateur est en train d'y écrire
        if (textarea && document.activeElement !== textarea) {
            textarea.value = noteText || '';
        }

        if (title) {
            title.textContent = 'Note du ' + formatDateForDisplay(currentDate);
        }
    }
    window.updateDayNoteDisplay = updateDayNoteDisplay;

    const dayNoteToggle = document.getElementById('day-note-toggle');
    const dayNotePanel = document.getElementById('day-note-panel');
    const dayNoteClose = document.getElementById('day-note-close');
    const dayNoteSave = document.getElementById('day-note-save');
    const dayNoteTextarea = document.getElementById('day-note-textarea');
    const dayNoteStatus = document.getElementById('day-note-status');

    if (dayNoteToggle && dayNotePanel) {
        dayNoteToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dayNotePanel.style.display === 'flex';
            dayNotePanel.style.display = isOpen ? 'none' : 'flex';
            if (!isOpen) {
                // À l'ouverture, on rafraîchit le titre et on efface l'ancien statut
                const title = document.getElementById('day-note-title');
                if (title) title.textContent = 'Note du ' + formatDateForDisplay(currentDate);
                if (dayNoteStatus) dayNoteStatus.textContent = '';
            }
        });

        if (dayNoteClose) {
            dayNoteClose.addEventListener('click', () => {
                dayNotePanel.style.display = 'none';
            });
        }

        // Ferme le volet si on clique en dehors (mais pas sur le bouton lui-même)
        document.addEventListener('click', (e) => {
            if (dayNotePanel.style.display === 'flex' &&
                !e.target.closest('#day-note-panel') &&
                !e.target.closest('#day-note-toggle')) {
                dayNotePanel.style.display = 'none';
            }
        });

        if (dayNoteSave) {
            dayNoteSave.addEventListener('click', async () => {
                const dateStr = dayNoteCurrentDateStr || formatDateForStorage(currentDate);
                const text = dayNoteTextarea ? dayNoteTextarea.value.trim() : '';
                try {
                    await setDoc(doc(db, "dayNotes", dateStr), { text: text }, { merge: true });
                    if (dayNoteStatus) {
                        dayNoteStatus.textContent = '✅ Enregistré';
                        setTimeout(() => { if (dayNoteStatus) dayNoteStatus.textContent = ''; }, 2000);
                    }
                } catch (err) {
                    console.error("Erreur sauvegarde note du jour :", err);
                    if (dayNoteStatus) dayNoteStatus.textContent = '❌ Erreur';
                }
            });
        }
    }

    // === NOUVEAU : GESTION DES GROUPES ===
    const openGroupsModalBtn = document.getElementById('open-groups-modal');
    const groupsMgmtModal = document.getElementById('groups-management-modal');
    const closeGroupsModalBtn = document.getElementById('close-groups-modal');
    const addGroupCreationBtn = document.getElementById('add-group-creation-btn');
    
    const createGroupModal = document.getElementById('create-group-modal');
    const closeCreateGroupModalBtn = document.getElementById('close-create-group-modal');
    const createGroupForm = document.getElementById('create-group-form');
    const groupActivitiesContainer = document.getElementById('group-activities-container');
    const addGroupActBtn = document.getElementById('add-group-activity-btn');
    const groupActNameInput = document.getElementById('group-act-name');
    const groupActPriceInput = document.getElementById('group-act-price');
    
    let tempGroupActivities = [];
    let currentEditGroupId = null; // Pour savoir si on édite un groupe

    // Positionne la liste de la modale "Gérer les groupes" sur les groupes du jour
    // (ou, à défaut, sur le prochain groupe à venir), plutôt qu'en tout début de liste.
    function scrollGroupsListToToday() {
        const container = document.getElementById('all-groups-list');
        if (!container) return;

        // Jour "business" courant (avant 02h10, on considère encore la veille)
        const now = new Date();
        const businessNow = new Date(now);
        if (now.getHours() < 2 || (now.getHours() === 2 && now.getMinutes() <= 10)) {
            businessNow.setDate(businessNow.getDate() - 1);
        }
        const todayStr = formatDateForStorage(businessNow);

        const cards = Array.from(container.querySelectorAll('.group-item-card'));
        if (cards.length === 0) return;

        // Premier groupe dont la date est >= aujourd'hui (comparaison de chaînes "YYYY-MM-DD" = ordre chronologique)
        let target = cards.find(c => c.dataset.date && c.dataset.date >= todayStr);
        if (!target) target = cards[cards.length - 1]; // tous passés → dernier (le plus récent)

        // On remonte jusqu'au premier en-tête (mois / vacances) du bloc pour garder le contexte
        let anchor = target;
        while (anchor.previousElementSibling && anchor.previousElementSibling.tagName === 'H3') {
            anchor = anchor.previousElementSibling;
        }

        // Défilement à l'intérieur du conteneur uniquement (pas de la page entière)
        const cRect = container.getBoundingClientRect();
        const aRect = anchor.getBoundingClientRect();
        container.scrollTop += (aRect.top - cRect.top) - 8; // petite marge de 8px
    }

    if(openGroupsModalBtn) {
        openGroupsModalBtn.addEventListener('click', () => {
            groupsMgmtModal.style.display = 'flex';
            // On positionne la liste sur les groupes du jour (ou le prochain à venir)
            requestAnimationFrame(scrollGroupsListToToday);
        });
        
        closeGroupsModalBtn.addEventListener('click', () => {
            groupsMgmtModal.style.display = 'none';
        });
        
        window.addEventListener('click', (event) => {
            if (event.target === groupsMgmtModal) {
                groupsMgmtModal.style.display = 'none';
            }
            if (event.target === createGroupModal) {
                createGroupModal.style.display = 'none';
            }
        });

        addGroupCreationBtn.addEventListener('click', () => {
            currentEditGroupId = null; // On réinitialise l'édition
            createGroupForm.reset();
            tempGroupActivities = [];
            renderTempActivities();
            document.getElementById('group-date').value = formatDateForStorage(new Date());
            document.getElementById('group-is-ok').checked = false;
            createGroupModal.querySelector('h2').textContent = 'Nouveau Groupe';
            createGroupModal.style.display = 'flex';
        });

        closeCreateGroupModalBtn.addEventListener('click', () => {
            createGroupModal.style.display = 'none';
        });

        addGroupActBtn.addEventListener('click', () => {
            const name = groupActNameInput.value.trim();
            const priceRaw = groupActPriceInput.value.trim();
            
            // NOUVEAU : Si le prix est vide ou "?" on met "?", sinon on tente de convertir en nombre
            let price = '?';
            if (priceRaw && priceRaw !== '?') {
                const parsedPrice = parseFloat(priceRaw.replace(',', '.'));
                if (!isNaN(parsedPrice)) {
                    price = parsedPrice;
                }
            }
            
            if(!name) return; // NOUVEAU : On bloque l'ajout uniquement si le nom est vide
            
            tempGroupActivities.push({ name, price });
            groupActNameInput.value = '';
            groupActPriceInput.value = '';
            renderTempActivities();
        });

        createGroupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (tempGroupActivities.length === 0) {
                showCustomAlert("Veuillez ajouter au minimum une activité (avec son prix) avant d'enregistrer le groupe.");
                return;
            }

            const name = document.getElementById('group-name').value.trim();
            // NOUVEAU : On sauvegarde la valeur telle quelle pour accepter "20+2", "?" etc.
            const countRaw = document.getElementById('group-count').value.trim();
            const count = countRaw || '0'; 
            
            const timeRaw = document.getElementById('group-time').value;
            const time = timeRaw ? timeRaw : '??-??';
            const date = document.getElementById('group-date').value;
            const isOk = document.getElementById('group-is-ok').checked;
            
            const groupData = {
                name, count, date, time, isOk,
                activities: tempGroupActivities
            };
            
            try {
                if (currentEditGroupId) {
                    await updateDoc(doc(db, "groups", currentEditGroupId), groupData);
                    showCustomAlert('Groupe modifié avec succès !');
                } else {
                    groupData.createdAt = Date.now();
                    groupData.hasArrived = false;
                    await addDoc(collection(db, "groups"), groupData);
                    showCustomAlert('Groupe créé avec succès !');
                }
                createGroupModal.style.display = 'none';
            } catch(err) {
                console.error("Erreur groupe:", err);
                showCustomAlert('Erreur lors de l\'enregistrement.');
            }
        });
    }

    function renderTempActivities() {
        if(!groupActivitiesContainer) return;
        groupActivitiesContainer.innerHTML = '';
        tempGroupActivities.forEach((act, index) => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.background = '#f1f2f6';
            div.style.padding = '5px';
            div.style.borderRadius = '3px';
            div.style.fontSize = '0.9em';
            div.innerHTML = `<span>${act.name} - ${act.price}€</span> <button type="button" class="delete-btn" style="padding: 2px 5px; font-size: 10px;" data-index="${index}">X</button>`;
            div.querySelector('button').addEventListener('click', (e) => {
                tempGroupActivities.splice(e.target.dataset.index, 1);
                renderTempActivities();
            });
            groupActivitiesContainer.appendChild(div);
        });
    }

    // Listener global pour synchroniser les groupes
    let allGroupsCache = []; // NOUVEAU : Cache pour garder les groupes en mémoire
    
    unsubscribes.push(onSnapshot(collection(db, "groups"), (snapshot) => {
        let allGroups = [];
        snapshot.forEach(doc => allGroups.push({ id: doc.id, ...doc.data() }));
        
        // Tri chronologique : Date puis Heure
        allGroups.sort((a, b) => {
            // NOUVEAU : Tri par date, puis les "??-??" en priorité, puis par heure classique
            if (a.date !== b.date) return new Date(a.date) - new Date(b.date);
            if (a.time === '??-??' && b.time !== '??-??') return -1;
            if (b.time === '??-??' && a.time !== '??-??') return 1;
            if (a.time === '??-??' && b.time === '??-??') return 0;
            return (a.time || '00:00').localeCompare(b.time || '00:00');
        });
        
        allGroupsCache = allGroups; // Sauvegarde dans le cache
        if (typeof window.renderAllGroupsList === 'function') {
            window.renderAllGroupsList(); // Appel de la fonction d'affichage
        }
    }));

    // NOUVEAU : Extraction de la logique d'affichage dans une fonction accessible
    window.renderAllGroupsList = function() {
        const allGroups = allGroupsCache;
        
        // 1. Remplissage de la modale de gestion (TOUS les groupes)
        const allGroupsList = document.getElementById('all-groups-list');
        if(allGroupsList) {
            allGroupsList.innerHTML = '';
            
            // Correction ici : on garde juste le if sur une ligne, sans else
            if(allGroups.length === 0) allGroupsList.innerHTML = '<p style="text-align:center; color:#999;">Aucun groupe pour le moment.</p>';
            
            let currentMonthStr = "";
            let currentSpStr = "";

            // Fonction utilitaire pour trouver la période spéciale d'une date
            const getSpecialPeriodForDate = (dateStr) => {
                const periods = getSpecialPeriods();
                const checkTime = new Date(dateStr);
                checkTime.setHours(12, 0, 0, 0);

                for (const period of periods) {
                    const startTime = new Date(period.start);
                    startTime.setHours(0, 0, 0, 0);
                    if (period.end) {
                        const endTime = new Date(period.end);
                        endTime.setHours(23, 59, 59, 999);
                        if (checkTime >= startTime && checkTime <= endTime) return period;
                    } else {
                        if (checkTime.getTime() === startTime.getTime()) return period;
                    }
                }
                return null;
            };

            allGroups.forEach(g => {
                // --- NOUVEAU : LOGIQUE DES EN-TÊTES (Mois & Vacances) ---
                const dateObj = new Date(g.date);
                const monthStrRaw = dateObj.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                const monthStr = monthStrRaw.charAt(0).toUpperCase() + monthStrRaw.slice(1);
                
                const sp = getSpecialPeriodForDate(g.date);
                let spStr = "";
                if (sp) {
                    const startStr = new Date(sp.start).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
                    if (sp.end) {
                        const endStr = new Date(sp.end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
                        spStr = `🌴 Vacances Scolaires du ${startStr} au ${endStr}`;
                    } else {
                        spStr = `🌴 Jour Férié / Spécial le ${startStr}`;
                    }
                }

                let printMonth = false;
                let printSp = false;

                if (currentMonthStr !== monthStr) {
                    printMonth = true;
                    currentMonthStr = monthStr;
                }

                if (currentSpStr !== spStr) {
                    if (spStr !== "") {
                        printSp = true;
                    } else if (currentSpStr !== "" && !printMonth) {
                        printMonth = true; // Réaffiche le mois courant pour marquer la fin des vacances
                    }
                    currentSpStr = spStr;
                }

                if (printMonth) {
                    const header = document.createElement('h3');
                    header.style.padding = '10px';
                    header.style.backgroundColor = '#ecf0f1';
                    header.style.color = '#2c3e50';
                    header.style.borderRadius = '5px';
                    header.style.marginTop = '15px';
                    header.style.marginBottom = '10px';
                    header.style.fontSize = '1.2em';
                    header.textContent = monthStr;
                    allGroupsList.appendChild(header);
                }

                if (printSp) {
                    const header = document.createElement('h3');
                    header.style.padding = '12px';
                    header.style.backgroundColor = '#f39c12';
                    header.style.color = 'white';
                    header.style.borderRadius = '5px';
                    header.style.marginTop = '20px';
                    header.style.marginBottom = '10px';
                    header.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    header.style.fontSize = '1.35em';
                    header.textContent = spStr;
                    allGroupsList.appendChild(header);
                }
                // --- FIN LOGIQUE DES EN-TÊTES ---

                const dateFr = new Date(g.date).toLocaleDateString('fr-FR');
                const div = document.createElement('div');
                div.className = 'group-item-card';
                div.dataset.date = g.date; // Sert au défilement automatique vers aujourd'hui à l'ouverture
                div.style.marginBottom = '10px';
                if(g.hasArrived) div.style.backgroundColor = '#d4edda';
                
                let actsHtml = g.activities ? g.activities.map(a => `<span class="group-act-badge">${a.name} (${a.price}€)</span>`).join('') : '';
                
                // NOUVEAU : S'adapte au texte libre. Ex: "20+2" devient "20+2p"
                const countDisplay = g.count === '?' ? '?' : g.count + 'p';
                
                div.innerHTML = `
                    <h5>
                        <span>${g.name} (${countDisplay}) - ${dateFr} à ${g.time} ${g.isOk ? '<span class="group-ok-badge">(Ok)</span>' : ''}</span>
                        <div>
                            <button class="edit-btn edit-group-btn" data-id="${g.id}">✏️</button>
                            <button class="delete-btn delete-group-btn" data-id="${g.id}" style="margin-left: 5px;">🗑️</button>
                        </div>
                    </h5>
                    <div>${actsHtml}</div>
                    <div style="margin-top: 10px;">
                        <label style="font-size: 0.9em; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            <input type="checkbox" class="toggle-group-arrived" data-id="${g.id}" ${g.hasArrived ? 'checked' : ''}>
                            Valider la venue
                        </label>
                    </div>
                `;
                
                div.querySelector('.edit-group-btn').addEventListener('click', () => {
                    currentEditGroupId = g.id;
                    document.getElementById('group-name').value = g.name;
                    document.getElementById('group-count').value = g.count;
                    document.getElementById('group-date').value = g.date;
                    document.getElementById('group-time').value = g.time === '??-??' ? '' : g.time;
                    document.getElementById('group-is-ok').checked = g.isOk || false;
                    
                    tempGroupActivities = g.activities ? [...g.activities] : [];
                    renderTempActivities();
                    
                    createGroupModal.querySelector('h2').textContent = 'Modifier le Groupe';
                    createGroupModal.style.display = 'flex';
                });

                div.querySelector('.delete-group-btn').addEventListener('click', (e) => {
                    showCustomAlert("Supprimer ce groupe ?", "confirm", async () => {
                        await deleteDoc(doc(db, "groups", e.target.dataset.id));
                    });
                });
                
                div.querySelector('.toggle-group-arrived').addEventListener('change', async (e) => {
                    await updateDoc(doc(db, "groups", e.target.dataset.id), { hasArrived: e.target.checked });
                });
                
                allGroupsList.appendChild(div);
            });
        }
        
        // 2. Remplissage du panneau latéral gauche (UNIQUEMENT les groupes du jour)
        const todayGroupsList = document.getElementById('today-groups-list');
        if(todayGroupsList) {
            todayGroupsList.innerHTML = '';
            
            // Calcul du "jour business"
            const now = new Date();
            if (now.getHours() < 2 || (now.getHours() === 2 && now.getMinutes() <= 10)) {
                now.setDate(now.getDate() - 1);
            }
            const todayStr = formatDateForStorage(now);
            const todayGroups = allGroups.filter(g => g.date === todayStr);
            
            if(todayGroups.length === 0) {
                let nextGroupMsg = "";
                const nextGroup = allGroups.find(g => g.date > todayStr);
                if (nextGroup) {
                    const nextDateStr = new Date(nextGroup.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
                    nextGroupMsg = `<p style="text-align:center; color:#3498db; font-size: 0.85em; margin-top:5px; font-weight:bold;">Prochain groupe : ${nextDateStr}</p>`;
                }
                todayGroupsList.innerHTML = `<p style="text-align:center; color:#999; font-style: italic; font-size: 0.9em; margin-top:20px; margin-bottom:5px;">Aucun groupe prévu aujourd'hui.</p>${nextGroupMsg}`;
            }
            
            todayGroups.forEach(g => {
                const total = g.activities ? g.activities.reduce((sum, act) => sum + (typeof act.price === 'number' ? act.price : 0), 0) : 0;
                const div = document.createElement('div');
                div.className = 'group-item-card';
                if(g.hasArrived) div.style.backgroundColor = '#d4edda'; // Un petit fond vert pour bien voir qu'ils sont là
                
                let actsHtml = g.activities ? g.activities.map(a => `<span class="group-act-badge">${a.name} (${a.price}€)</span>`).join('') : '';
                
                // NOUVEAU : S'adapte au texte libre pour le panneau latéral
                const countTodayDisplay = g.count === '?' ? '?' : g.count + ' personnes';
                
                div.innerHTML = `
                    <h5>${g.hasArrived ? '✅ ' : ''}${g.name} - ${g.time} ${g.isOk ? '<span class="group-ok-badge">(Ok)</span>' : ''}</h5>
                    <div style="display: flex; justify-content: space-between; align-items: center; color: #7f8c8d; font-size: 0.9em; margin-bottom: 5px;">
                        <span>${countTodayDisplay}</span>
                        <label style="cursor: pointer; display: flex; align-items: center; gap: 3px; color: #34495e;">
                            <input type="checkbox" class="toggle-group-arrived-today" data-id="${g.id}" ${g.hasArrived ? 'checked' : ''}>
                            Venu
                        </label>
                    </div>
                    <div>${actsHtml}</div>
                `;
                
                div.querySelector('.toggle-group-arrived-today').addEventListener('change', async (e) => {
                    await updateDoc(doc(db, "groups", e.target.dataset.id), { hasArrived: e.target.checked });
                });

                todayGroupsList.appendChild(div);
            });
        }
    };
    displaySpecialPeriods(); // Affiche la liste des périodes sauvegardées
    setupStickyHeader();
    setupCountersSticky();

    toggleLaserGameBtn.addEventListener('click', () => {
        laserGameView.style.display = 'block';
        quizKaraokeView.style.display = 'none';
        birthdaysView.style.display = 'none';
        tablePlanView.style.display = 'none';
        toggleLaserGameBtn.classList.add('active');
        toggleQuizKaraokeBtn.classList.remove('active');
        toggleBirthdaysBtn.classList.remove('active');
        toggleTablePlanBtn.classList.remove('active');

        recalculateStickyOffsets(); // NOUVEAU : Pour la cohérence
    });

    toggleQuizKaraokeBtn.addEventListener('click', () => {
        laserGameView.style.display = 'none';
        quizKaraokeView.style.display = 'block';
        birthdaysView.style.display = 'none';
        tablePlanView.style.display = 'none';
        toggleLaserGameBtn.classList.remove('active');
        toggleQuizKaraokeBtn.classList.add('active');
        toggleBirthdaysBtn.classList.remove('active');
        toggleTablePlanBtn.classList.remove('active');

        recalculateStickyOffsets(); // NOUVEAU : Pour la cohérence
    });

	toggleBirthdaysBtn.addEventListener('click', () => {
    laserGameView.style.display = 'none';
    quizKaraokeView.style.display = 'none';
    birthdaysView.style.display = 'block'; // Vue affichée
    tablePlanView.style.display = 'none';
    toggleLaserGameBtn.classList.remove('active');
    toggleQuizKaraokeBtn.classList.remove('active');
    toggleBirthdaysBtn.classList.add('active');
    toggleTablePlanBtn.classList.remove('active');

    recalculateStickyOffsets(); // NOUVEAU : On force le recalcul pour la vue anniversaires
});

    // NOUVEAU : Listener pour afficher le plan de table
    toggleTablePlanBtn.addEventListener('click', () => {
        laserGameView.style.display = 'none';
        quizKaraokeView.style.display = 'none';
        birthdaysView.style.display = 'none';
        tablePlanView.style.display = 'block';
        toggleLaserGameBtn.classList.remove('active');
        toggleQuizKaraokeBtn.classList.remove('active');
        toggleBirthdaysBtn.classList.remove('active');
        toggleTablePlanBtn.classList.add('active');
        document.querySelectorAll('.counters-containerDisplay').forEach(el => el.classList.remove('sticky'));
        document.querySelectorAll('.counters-sticky-placeholder').forEach(el => el.classList.remove('active'));
    });
    
    // Initialisation pour la vue Quiz/Karaoké
    updateQkDateDisplay();
    subscribeToDate(currentDate);

    // Écouteurs d'événements pour le nouveau formulaire et calendrier
    
    qkPrevDayButton.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() - 1);
        updateDateDisplay();
        updateQkDateDisplay();
        subscribeToDate(currentDate);
    });

    qkNextDayButton.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() + 1);
        updateDateDisplay();
        updateQkDateDisplay();
        subscribeToDate(currentDate);
    });

qkCalendarInput.addEventListener('change', function(e) {
    if (!e.target.value) return;
    const parts = e.target.value.split('-');
    currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
    updateDateDisplay();
    updateQkDateDisplay();
    subscribeToDate(currentDate);
});
    openUserManagementBtn.addEventListener('click', () => {
        userManagementModal.style.display = 'flex';
        displayUsersInModal(); // On charge les utilisateurs à l'ouverture
    });

    closeUserManagementBtn.addEventListener('click', () => {
        userManagementModal.style.display = 'none';
    });
    setInterval(function() {
    const now = new Date();
    
    // === MODIFICATION : COMPARAISON AVEC HEURE DÉCALÉE ===
    const businessNow = new Date(now);
    if (now.getHours() < 2 || (now.getHours() === 2 && now.getMinutes() <= 10)) {
        businessNow.setDate(businessNow.getDate() - 1);
    }
    
    // Rafraîchit l'affichage du calendrier uniquement si le jour affiché est le jour "business" actuel
    if(isSameDay(currentDate, businessNow)) {
        displayReservationsForDate(currentDate);
    }
}, 60000);
    
    // Événements
prevDayButton.addEventListener('click', goToPreviousDay);
nextDayButton.addEventListener('click', goToNextDay);
    calendarBtn.addEventListener('click', function(e) {
        e.preventDefault();
        // Réinitialise la valeur pour forcer l'ouverture à chaque clic
        calendarInput.value = '';
        
        // Méthode moderne préférée
        if (typeof calendarInput.showPicker === 'function') {
            calendarInput.showPicker();
        } 
        // Fallback pour anciens navigateurs
        else {
            calendarInput.click();
        }
    });

calendarInput.addEventListener('change', function(e) {
    if (!e.target.value) return;
    const parts = e.target.value.split('-');
    currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
    updateDateDisplay();
    updateQkDateDisplay();
    subscribeToDate(currentDate);
});

// Boutons "Aujourd'hui" (Laser + QK) et date cliquable pour revenir au jour courant
['today-btn', 'qk-today-btn'].forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) btn.addEventListener('click', goToToday);
});
[currentDateDisplay, qkCurrentDateDisplay].forEach(el => {
    if (el) {
        el.style.cursor = 'pointer';
        el.title = "Revenir à aujourd'hui";
        el.addEventListener('click', goToToday);
    }
});

// === Fermeture uniforme des fenêtres (Échap + clic extérieur) + bannière hors-ligne ===
// Attachés une seule fois même en cas de reconnexion (évite les doublons d'écouteurs).
if (!window.__globalUxHandlersSet) {
    window.__globalUxHandlersSet = true;

    // Ferme la fenêtre visible la plus "au-dessus" (z-index le plus élevé)
    const closeTopModal = () => {
        const open = Array.from(document.querySelectorAll('.modal'))
            .filter(m => getComputedStyle(m).display !== 'none');
        if (open.length === 0) return false;
        open.sort((a, b) => (parseInt(getComputedStyle(a).zIndex) || 0) - (parseInt(getComputedStyle(b).zIndex) || 0));
        open[open.length - 1].style.display = 'none';
        return true;
    };

    // Touche Échap → ferme la fenêtre du dessus (ou le volet Note du jour)
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const notePanel = document.getElementById('day-note-panel');
        if (notePanel && notePanel.style.display === 'flex') {
            notePanel.style.display = 'none';
            return;
        }
        closeTopModal();
    });

    // Clic sur le fond (backdrop) d'une fenêtre → fermeture
    document.addEventListener('click', (e) => {
        if (e.target.classList && e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    // Bannière "hors-ligne" pilotée par l'état réseau du navigateur
    window.addEventListener('offline', () => showOfflineBanner(true));
    window.addEventListener('online', () => {
        showOfflineBanner(false);
        // NOUVEAU : voir le commentaire détaillé sur le listener 'visibilitychange' juste en dessous
        // -- même correctif, déclenché ici par un vrai retour réseau plutôt qu'un retour au premier plan.
        subscribeToDate(currentDate);
    });
    if (!navigator.onLine) showOfflineBanner(true);

    // NOUVEAU : re-souscrit le calendrier (Laser Game + Quiz/Karaoké) dès que l'onglet redevient
    // visible -- corrige un bug réel signalé : une résa karaoke déjà enregistrée en base (via le sync
    // CRM ou saisie sur un autre poste) restait invisible sur le planning tant qu'on ne rafraîchissait
    // pas la page à la main (F5). Cause probable : l'écouteur onSnapshot Firestore peut se figer
    // silencieusement (connexion WebSocket coupée SANS déclencher son callback d'erreur) après une
    // longue inactivité de l'onglet, une mise en veille du PC, ou une coupure réseau brève -- rien
    // n'existait pour détecter ce cas précis (seule une VRAIE erreur onSnapshot déclenchait la bannière
    // hors-ligne ci-dessus, pas un simple silence). En resouscrivant (subscribeToDate désabonne puis
    // réabonne, ce qui redonne systématiquement l'état exact de Firestore au moment de l'appel, contrairement
    // à un écouteur resté bloqué), on rattrape ce cas sans attendre que quelqu'un pense à faire F5.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            subscribeToDate(currentDate);
        }
    });
}

// Affiche/masque la bannière indiquant une perte de connexion
function showOfflineBanner(show) {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.style.display = show ? 'block' : 'none';
}

async function updateTimerInDb(room, data) {
        const timerDocRef = doc(db, "timers", "liveState");
        try {
            await setDoc(timerDocRef, {
                [room]: data
            }, { merge: true });
        } catch (error) {
            console.error("Erreur lors de la mise à jour du timer dans Firestore :", error);
        }
    }

// NOUVEAU : synchro fiche anniversaire <-> créneau laser (même crmOrderId), pour que "Monté" côté
// planning laser et "Go" côté fiche anniversaire se répercutent l'un sur l'autre au lieu d'être deux
// états indépendants. Le crmOrderId reste stable même si la salle/l'horaire est déplacé ensuite.
function getSortedLaserTimerKeys(bd) {
    return Object.keys(bd.timers || {})
        .filter(k => bd.timers[k].type === 'laser')
        .sort((a, b) => parseInt(a.split('_')[1], 10) - parseInt(b.split('_')[1], 10));
}

function getCrmSessionIndex(reservationId, crmOrderId) {
    const prefix = `crm_${crmOrderId}_`;
    if (!reservationId || !reservationId.startsWith(prefix)) return null;
    const n = parseInt(reservationId.slice(prefix.length), 10);
    return Number.isFinite(n) ? n : null;
}

// "Monté" côté planning laser -> lance aussi le chrono sur la fiche anniversaire correspondante.
async function syncBirthdayChronoFromReservation(reservation) {
    if (!reservation.crmOrderId) return; // pas une résa CRM -> rien à lier
    try {
        const bdSnap = await getDocs(query(collection(db, "dailyBirthdays"), where("crmOrderId", "==", String(reservation.crmOrderId))));
        if (bdSnap.empty) return; // fiche pas encore générée -> rien à synchroniser pour l'instant
        const bdDoc = bdSnap.docs[0];
        const bd = { id: bdDoc.id, ...bdDoc.data() };

        const availableLaserKeys = getSortedLaserTimerKeys(bd).filter(k => !bd.timers[k].endTime);
        if (availableLaserKeys.length === 0) return; // pas de créneau laser dispo (déjà lancé, ou aucun)

        let targetKey = availableLaserKeys[0];
        if (availableLaserKeys.length > 1) {
            // Anniversaire avec 2 créneaux laser (rare) : on matche par ordre de session CRM
            // (crm_<order>_1, crm_<order>_2...) plutôt qu'au hasard.
            const sessionIdx = getCrmSessionIndex(reservation.id, reservation.crmOrderId);
            if (sessionIdx && availableLaserKeys[sessionIdx - 1]) targetKey = availableLaserKeys[sessionIdx - 1];
        }

        let playTime = reservation.duration;
        if (reservation.duration === 20) playTime = 18;
        else if (reservation.duration === 30) playTime = 28;
        const roomName = reservation.room === 1 ? "⬇️ Salle Bas ⬇️" : "⬆️ Salle Haut ⬆️";

        showCustomAlert(`Voulez-vous aussi lancer le chrono laser de ${playTime} minutes sur la fiche anniversaire de ${bd.name} ?`, 'confirm', async () => {
            const endTime = Date.now() + (playTime * 60000);
            try {
                await updateDoc(doc(db, "dailyBirthdays", bd.id), {
                    [`timers.${targetKey}.endTime`]: endTime,
                    [`timers.${targetKey}.room`]: reservation.room
                });
                await updateTimerInDb(reservation.room, {
                    endTime,
                    isCountingDown: true,
                    notified: false,
                    title: `${roomName}<br><span style="font-size:0.8em; font-weight:normal;">Anniv : ${bd.name}</span>`
                });
            } catch (e) {
                console.warn("Erreur synchro chrono fiche anniversaire depuis 'Monté' :", e);
            }
        });
    } catch (err) {
        console.warn("Sync fiche anniversaire depuis 'Monté' non effectuée :", err);
    }
}

// "Go" côté fiche anniversaire -> marque aussi "Monté" le créneau laser correspondant.
async function syncReservationMonteFromBirthday(bd, room) {
    if (!bd.crmOrderId) return; // fiche pas issue du CRM -> rien à lier
    try {
        const resSnap = await getDocs(query(collection(db, "laserGameReservations"), where("crmOrderId", "==", String(bd.crmOrderId))));
        if (resSnap.empty) return;
        const candidates = [];
        resSnap.forEach(d => candidates.push({ id: d.id, ...d.data() }));

        // Priorité à la résa dont la salle correspond exactement à celle choisie sur la fiche ;
        // sinon, s'il n'y en a qu'une seule pour cette commande, on la prend quand même.
        let target = candidates.find(r => r.room === room && !r.monte);
        if (!target && candidates.length === 1 && !candidates[0].monte) target = candidates[0];
        if (!target) return;

        await setDoc(doc(db, "laserGameReservations", target.id), { monte: true }, { merge: true });
    } catch (err) {
        console.warn("Sync réservation laser depuis la fiche anniversaire non effectuée :", err);
    }
}

// === FONCTION REFONDUE AVEC DÉLÉGATION D'ÉVÉNEMENTS (PLUS ROBUSTE) ===
function setupCounters() {
    // On empêche d'attacher les écouteurs plusieurs fois si initializeApp est relancé
    if (window.countersEventsBound) return;
    window.countersEventsBound = true;

    // On écoute les clics sur tout le document (Délégation)
    // Cela permet aux boutons de fonctionner même s'ils sont déplacés dans le DOM (Vue Mobile)
    document.body.addEventListener('click', function(e) {
        const target = e.target;

        // Fonction utilitaire pour trouver le numéro de la salle (1, 2, 3, 4) depuis le bouton cliqué
        const getRoom = (el) => {
            const container = el.closest('[id^="counter-"]');
            if (!container) return null;
            // Extrait le chiffre après "counter-" (ex: counter-1 ou counter-1-anniv)
            const match = container.id.match(/counter-(\d+)/); 
            return match ? parseInt(match[1]) : null;
        };

        // --- GESTION DU BOUTON STOP ---
        if (target.closest('.stop-btn')) {
            const room = getRoom(target);
            if (room) stopCounter(room);
        }

        // --- GESTION DU BOUTON RESET ---
        else if (target.closest('.reset-btn')) {
            const room = getRoom(target);
            if (room) resetCounter(room);
        }

        // --- GESTION DES BOUTONS PRÉDÉFINIS (10, 20, 30 min) ---
        else if (target.closest('.preset-btn')) {
            const btn = target.closest('.preset-btn');
            const room = getRoom(btn);
            const minutes = parseInt(btn.getAttribute('data-minutes'));
            if (room && minutes) setPresetTime(room, minutes);
        }

        // --- GESTION DU BOUTON DÉPART PERSONNALISÉ (INPUT) ---
        else if (target.closest('.start-custom-btn')) {
            const btn = target.closest('.start-custom-btn');
            const room = getRoom(btn);
            // On cherche l'input qui est dans le même conteneur de contrôles
            const controlsContainer = btn.closest('.counter-controls');
            
            if (controlsContainer && room) {
                const input = controlsContainer.querySelector('.custom-time-input');
                if (input) {
                    const minutes = parseInt(input.value);
                    const maxMinutes = parseInt(input.getAttribute('max')) || 120;
                    
                    if (minutes && minutes > 0 && minutes <= maxMinutes) {
                        setPresetTime(room, minutes);
                        input.value = ''; // On vide le champ après lancement
                    } else {
                        showCustomAlert(`Veuillez entrer une durée valide (1-${maxMinutes} minutes)`);
                    }
                }
            }
        }
    });

    // --- GESTION DE LA TOUCHE ENTRÉE DANS L'INPUT ---
    document.body.addEventListener('keypress', function(e) {
        if (e.target.classList.contains('custom-time-input') && e.key === 'Enter') {
            e.preventDefault(); // Empêche le comportement par défaut
            const input = e.target;
            const controlsContainer = input.closest('.counter-controls');
            if (controlsContainer) {
                // On simule un clic sur le bouton vert à côté
                const btn = controlsContainer.querySelector('.start-custom-btn');
                if (btn) btn.click();
            }
        }
    });
}

    function setPresetTime(room, minutes, customTitle = null) {
        const now = Date.now();
        // On prépare les données pour ce chrono spécifique.
        const timerData = {
        endTime: now + (minutes * 60000),
        isCountingDown: true,
        notified: false, 
        title: customTitle // On utilise le titre passé en paramètre (ou null par défaut)
    };

    // On met à jour l'état local pour une réactivité immédiate sur l'appareil actuel.
    counters[room].endTime = timerData.endTime;
    counters[room].isCountingDown = timerData.isCountingDown;
    counters[room].notified = timerData.notified;
    counters[room].customTitle = customTitle; // Mise à jour locale du titre

    // On envoie la mise à jour pour ce chrono uniquement à Firestore.
    updateTimerInDb(room, timerData);
}
    
    function startCounter(room) {
        // Ne pas relancer si déjà en cours
        if (counters[room].interval) return;
        
        counters[room].interval = setInterval(() => {
            updateCounterDisplay(room);
        }, 200);
    }

// Bouton "Stop" : PAUSE le chrono (garde le temps restant en mémoire) s'il tourne, ou le
// REPREND depuis ce temps restant s'il est déjà en pause. Contrairement à Reset, rien n'est
// perdu -- c'est ce qui le distingue du bouton Reset (qui efface tout).
function stopCounter(room) {
    const counter = counters[room];

    if (counter.isCountingDown && counter.endTime) {
        // En cours -> on met en pause : on fige le temps restant au lieu de l'effacer.
        stopTabAlert();
        const remainingMs = Math.max(0, counter.endTime - Date.now());
        const timerData = {
            endTime: null,
            isCountingDown: false,
            isPaused: true,
            pausedRemainingMs: remainingMs,
            notified: counter.notified || false
        };
        counter.endTime = timerData.endTime;
        counter.isCountingDown = timerData.isCountingDown;
        counter.isPaused = timerData.isPaused;
        counter.pausedRemainingMs = timerData.pausedRemainingMs;
        counter.notified = timerData.notified;
        updateTimerInDb(room, timerData);
    } else if (counter.isPaused) {
        // En pause -> on reprend le compte à rebours depuis le temps restant mémorisé.
        const remainingMs = counter.pausedRemainingMs || 0;
        const timerData = {
            endTime: Date.now() + remainingMs,
            isCountingDown: true,
            isPaused: false,
            pausedRemainingMs: null,
            notified: remainingMs > 60000 ? false : counter.notified
        };
        counter.endTime = timerData.endTime;
        counter.isCountingDown = timerData.isCountingDown;
        counter.isPaused = timerData.isPaused;
        counter.pausedRemainingMs = timerData.pausedRemainingMs;
        counter.notified = timerData.notified;
        updateTimerInDb(room, timerData);
    }
    // Si le chrono est déjà à l'arrêt complet (ni en cours, ni en pause), Stop ne fait rien --
    // c'est Reset qui sert à repartir d'un état vide.
}

// Bouton "Reset" : efface complètement le chrono, y compris un éventuel temps en pause.
// Contrairement à Stop, rien n'est gardé en mémoire.
function resetCounter(room) {
    stopTabAlert();

    const timerData = {
        endTime: null,
        isCountingDown: false,
        isPaused: false,
        pausedRemainingMs: null,
        notified: false
    };

    counters[room].endTime = timerData.endTime;
    counters[room].isCountingDown = timerData.isCountingDown;
    counters[room].isPaused = timerData.isPaused;
    counters[room].pausedRemainingMs = timerData.pausedRemainingMs;
    counters[room].notified = timerData.notified;

    updateTimerInDb(room, timerData);
}
    
function updateCounterDisplay(room) {
    if (!counters[room].isCountingDown || !counters[room].endTime) return;

    const now = Date.now();
    const diffMs = counters[room].endTime - now;
    const isNegative = diffMs < 0;
    const absMs = Math.abs(diffMs);

    const minutes = Math.floor(absMs / 60000);
    const seconds = Math.floor((absMs % 60000) / 1000);
    const sign = isNegative ? "-" : "";
    const newTime = `${sign}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    counters[room].displays.forEach(display => {
        display.textContent = newTime;

        if (isNegative) {
            display.classList.add('timer-ended');
            display.classList.remove('one-minute-left');
        } else {
            display.classList.remove('timer-ended');
            // Notification à 1 minute
            if (absMs <= 60000 && absMs > 0) {
                if (!counters[room].notified) {
                    counters[room].notified = true;
                    triggerAlert(room);
                }
                display.classList.add('one-minute-left');
            } else {
                display.classList.remove('one-minute-left');
            }
        }
    });
}
    
function generateTimeOptions(forDate, selectElement, ctx = null) {
    // Sécurité : si aucun menu déroulant n'est fourni, on ne fait rien.
    if (!selectElement) return;

    selectElement.innerHTML = '';
    const openingHour = getOpeningHourForDate(forDate);
    const closingHour = getClosingHourForDate(forDate);
    const dateStr = formatDateForStorage(forDate);

    const addOption = (hour) => {
        // Si un contexte est fourni, on masque les créneaux de DÉBUT indisponibles
        // (déjà occupés, fermés, ou passés) — sauf le créneau d'origine d'une réservation
        // en cours d'édition (ctx.forceHour), qui doit toujours rester sélectionnable.
        if (ctx && hour !== ctx.forceHour && !isStartHourAvailable(dateStr, hour, ctx)) return;
        const option = document.createElement('option');
        option.value = hour;
        option.textContent = formatTime(hour);
        selectElement.appendChild(option);
    };

    for (let hour = openingHour; hour < 24; hour += TIME_SLOT_STEP) addOption(hour);
    for (let hour = 0; hour < closingHour; hour += TIME_SLOT_STEP) addOption(hour);
}

// Un créneau de DÉBUT est-il sélectionnable ? (pas passé, pas fermé, pas déjà occupé)
// ctx : { type:'lg'|'qk', room, activity, ignoreId }
function isStartHourAvailable(dateStr, hour, ctx) {
    // 1. Créneau passé (avec le délai de grâce de 20 min)
    const slotDateTime = getReservationFullDate(dateStr, hour);
    if (slotDateTime.getTime() + SLOT_GRACE_MINUTES * 60000 < Date.now()) return false;

    // 2. Créneau fermé manuellement
    const closedKey = ctx.type === 'lg'
        ? `${dateStr}.${hour}.${ctx.room}`
        : `${dateStr}.${hour}.${ctx.activity}`;
    if (closedSlots[closedKey]) return false;

    // 3. Créneau déjà occupé par une autre réservation (même salle / même activité)
    const list = ctx.type === 'lg'
        ? reservations.filter(r => r.room === ctx.room && r.id !== ctx.ignoreId)
        : qkReservations.filter(r => r.activity === ctx.activity && r.id !== ctx.ignoreId);
    for (const r of list) {
        if (r.startTime <= hour && hour < r.endTime) return false;
    }
    return true;
}

// Régénère le menu déroulant des heures du modal en fonction de son état courant
// (type, salle/activité, date, réservation éditée). Préserve la sélection si possible.
function refreshEditTimeOptions() {
    const typeEl = document.getElementById('edit-reservation-type');
    if (!typeEl || !typeEl.value) return;
    const type = typeEl.value;
    const dateStr = editReservationDate.value || formatDateForStorage(currentDate);
    const forDate = new Date(dateStr.replace(/-/g, '/'));
    const id = document.getElementById('edit-reservation-id').value || null;
    const ctx = { type, ignoreId: id };

    // En édition, on garde toujours le créneau d'origine sélectionnable
    if (id) {
        const src = type === 'lg' ? reservations.find(r => r.id === id) : qkReservations.find(r => r.id === id);
        if (src) ctx.forceHour = src.startTime;
    }

    if (type === 'lg') {
        const roomEl = document.querySelector('input[name="edit-room"]:checked');
        if (!roomEl) return; // salle pas encore définie
        ctx.room = parseInt(roomEl.value);
    } else {
        const actEl = document.querySelector('input[name="edit-activity"]:checked');
        if (!actEl) return;
        ctx.activity = actEl.value;
    }

    const prev = editStartTime.value;
    generateTimeOptions(forDate, editStartTime, ctx);
    if (prev && [...editStartTime.options].some(o => o.value === prev)) {
        editStartTime.value = prev;
    }
}

// Décrit précisément pourquoi un créneau [start, end[ est indisponible (message clair pour l'employé),
// ou renvoie null si le créneau est libre. ctx : { type, room, activity, ignoreId }
function describeSlotConflict(dateStr, start, end, ctx) {
    // 1. Un créneau fermé manuellement dans la plage
    for (let h = start; h < end; h += TIME_SLOT_STEP) {
        const key = ctx.type === 'lg' ? `${dateStr}.${h}.${ctx.room}` : `${dateStr}.${h}.${ctx.activity}`;
        if (closedSlots[key]) {
            return `Le créneau de ${formatTime(h)} est marqué « Fermé ». Rouvrez-le ou choisissez un autre horaire.`;
        }
    }
    // 2. Chevauchement avec une réservation existante
    const list = ctx.type === 'lg'
        ? reservations.filter(r => r.room === ctx.room && r.id !== ctx.ignoreId)
        : qkReservations.filter(r => r.activity === ctx.activity && r.id !== ctx.ignoreId);
    const conflicts = list.filter(r =>
        (start >= r.startTime && start < r.endTime) ||
        (end > r.startTime && end <= r.endTime) ||
        (start <= r.startTime && end >= r.endTime)
    ).sort((a, b) => a.startTime - b.startTime);
    if (conflicts.length > 0) {
        const c = conflicts[0];
        return `Chevauche la réservation de « ${c.clientName} » (${formatTime(c.startTime)} → ${formatTime(c.endTime)}).\nCe créneau se libère à ${formatTime(c.endTime)}.`;
    }
    return null;
}
    
    function formatTime(hour) {
        const isHalfHour = hour % 1 !== 0;
        const hourPart = Math.floor(hour);
        const minutePart = isHalfHour ? '30' : '00';
        
        if (hourPart === 0) {
            return `00h${minutePart}`;
        } else if (hourPart < 24) {
            return `${hourPart}h${minutePart}`;
        }
        return '';
    }
    
    function getReservationFullDate(dateStr, startTime) {
        const parts = dateStr.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; 
        const day = parseInt(parts[2], 10);

        const reservationDate = new Date(year, month, day);

        if (startTime < 5) { 
            reservationDate.setDate(reservationDate.getDate() + 1);
        }

        reservationDate.setHours(Math.floor(startTime), (startTime % 1) * 60, 0, 0);
        return reservationDate;
    }


async function updateClosedSlots(hour, room, isClosed, dateStr) {
    const docRef = doc(db, "closedSlots", "all");
    const key = `${dateStr}.${hour}.${room}`; // Exemple: "2025-10-13.14.5.1"

    try {
        // CORRECTION : Au lieu d'essayer d'importer et d'utiliser deleteField (qui pose problème),
        // on met simplement la valeur à true (fermé) ou false (ouvert).
        // Firestore gère très bien le booléen et ton affichage fonctionnera parfaitement.
        await setDoc(docRef, { [key]: isClosed }, { merge: true });

    } catch (error) {
        console.error("Erreur lors de la mise à jour des créneaux fermés :", error);
    }

    // NOUVEAU : pour Quiz/Karaoké (les seules activités gérées par le CRM en ligne -- `room` vaut ici
    // 'quiz' ou 'karaoke', voir l'appel dans generateQkTimeSlots ; le bowling/laser game n'a pas de
    // pendant CRM donc `room` y est un numéro de salle, jamais l'une de ces 2 chaînes), on répercute
    // aussi le blocage/déblocage sur le CRM -- sinon un client peut réserver en ligne sur un créneau
    // qu'on vient de fermer côté site (ex: groupe lancé en retard, encore sur place), ou inversement
    // un créneau reste bloqué inutilement sur le CRM après réouverture côté site.
    if (room === 'quiz' || room === 'karaoke') {
        syncManualSlotCloseToCrm(room, hour, isClosed, dateStr);
    }
}
    
function isTimeSlotAvailable(date, startTime, endTime, room, reservationIdToIgnore = null) {
    const dateStr = date;
    
    // On utilise la variable globale `closedSlots` qui est mise à jour en temps réel
    for (let hour = startTime; hour < endTime; hour += TIME_SLOT_STEP) {
        const key = `${dateStr}.${hour}.${room}`;
        if (closedSlots[key]) {
            return false;
        }
    }

    // Le reste de la logique de vérification des collisions de réservations ne change pas
    const sameDayReservations = reservations.filter(res => 
        res.date === date && res.room === room
    );

    for (const res of sameDayReservations) {
        if (res.id === reservationIdToIgnore) continue;
        if (
            (startTime >= res.startTime && startTime < res.endTime) ||
            (endTime > res.startTime && endTime <= res.endTime) ||
            (startTime <= res.startTime && endTime >= res.endTime)
        ) {
            return false;
        }
    }
    return true;
}
    
async function deleteReservation(id) {
    showCustomAlert('Voulez-vous vraiment supprimer cette réservation ?', 'confirm', async () => {
        try {
            // On supprime le document directement depuis Firestore
            await deleteDoc(doc(db, "laserGameReservations", id));
            // Pas besoin de rafraîchir, onSnapshot s'en occupe !
        } catch (error) {
            console.error("Erreur lors de la suppression: ", error);
            showCustomAlert("La suppression a échoué.");
        }
    });
}
    
    function displayReservationsForDate(date) {
        const dateStr = formatDateForStorage(date);
        const room1Reservations = reservations.filter(res => 
            res.date === dateStr && res.room === 1
        ).sort((a, b) => a.startTime - b.startTime);
        
        const room2Reservations = reservations.filter(res => 
            res.date === dateStr && res.room === 2
        ).sort((a, b) => a.startTime - b.startTime);
        
        displayRoomReservations(room1Reservations, room1Slots);
        displayRoomReservations(room2Reservations, room2Slots);
    }
    
    function displayRoomReservations(reservations, container) {
        container.innerHTML = '';
        
        const openingHour = getOpeningHourForDate(currentDate); 
        const closingHour = getClosingHourForDate(currentDate);

        for (let hour = openingHour; hour < 24; hour += TIME_SLOT_STEP) {
            addTimeSlotToContainer(hour, reservations, container);
        }
        
        for (let hour = 0; hour < closingHour; hour += TIME_SLOT_STEP) {
            addTimeSlotToContainer(hour, reservations, container);
        }
    }
    
function addTimeSlotToContainer(hour, reservations, container) {
    const timeSlot = document.createElement('div');
    timeSlot.className = 'time-slot';
    timeSlot.dataset.time = hour;
    
    const timeSlotHeader = document.createElement('div');
    timeSlotHeader.className = 'time-slot-header';
    timeSlotHeader.textContent = formatTime(hour);
    
    timeSlot.appendChild(timeSlotHeader);
    
    const reservation = reservations.find(res => 
        res.startTime <= hour && res.endTime > hour
    );
    
    if (reservation) {
        timeSlot.classList.add('booked');
        if (reservation.startTime === hour) {
            timeSlot.setAttribute('draggable', true);
            timeSlot.dataset.reservationId = reservation.id;
        }
        if (reservation.paid) {
            timeSlot.classList.add('paid');
        }

        let clientDisplayName = reservation.clientName;
        if (reservation.type === 'anniversaire') {
            timeSlot.classList.add('anniversaire');
            clientDisplayName += ' (Anniversaire)';
        } else if (reservation.type === 'groupe') {
            timeSlot.classList.add('groupe');
        }
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'time-slot-info';
        const totalPlayers = reservation.groups.reduce((sum, current) => sum + current, 0);
        let playersDisplay;

        if (reservation.groups.length > 1) {
            const groupsDetail = reservation.groups.join(' + ');
            playersDisplay = `<b>${totalPlayers}p</b> (${groupsDetail})`;
        } else {
            playersDisplay = `<b>${totalPlayers}p</b>`;
        }

        if (reservation.source === 'crm') {
            timeSlot.classList.add('crm-synced');
            const crmBadge = document.createElement('span');
            crmBadge.className = 'crm-badge';
            crmBadge.title = 'Généré automatiquement depuis le CRM, pas une réservation manuelle';
            crmBadge.textContent = '🤖 CRM';
            timeSlotHeader.appendChild(crmBadge);
        }

        // Anniversaire + laser: prénom de l'enfant en avant, nom de la résa (parent) en petit
        let infoHtml = reservation.childFirstName
            ? `<span class="child-name-highlight">🎈 ${reservation.childFirstName}</span><br><span style="font-size:0.8em; opacity:0.75;">${clientDisplayName}</span> - ${playersDisplay} (${reservation.duration}min)`
            : `${clientDisplayName} - ${playersDisplay} (${reservation.duration}min)`;
        if (reservation.phone) {
            infoHtml += `<br>${reservation.phone}`;
        }
        if (reservation.bookedBy) {
            infoHtml += `<br><span style="font-size:0.8em; opacity:0.7;">✍️ ${reservation.bookedBy}</span>`;
        }
        if (reservation.lastMovedBy) {
            infoHtml += `<br><span style="font-size:0.8em; opacity:0.7;">🖐️ Déplacé par ${reservation.lastMovedBy}</span>`;
        }
        if (reservation.depositStatus) {
            const depositIcon = reservation.depositPaid ? '✅' : '⏳';
            const amountValue = reservation.amountPaid != null ? reservation.amountPaid : reservation.amountTotal;
            const amount = amountValue != null ? ` — ${amountValue}€ encaissé` : '';
            infoHtml += `<br><span style="font-size:0.8em; opacity:0.8;">${depositIcon} ${reservation.depositStatus}${amount}</span>`;
        }
        const laserPrice = calculateLaserPrice(reservation);
        if (laserPrice != null) {
            infoHtml += `<br><span style="font-size:0.85em; font-weight:bold; opacity:0.9;">💶 ${laserPrice}€ à régler</span>`;
        }
        infoDiv.innerHTML = infoHtml;
        timeSlot.appendChild(infoDiv);
        
        if (reservation.startTime === hour) {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'X';
            deleteBtn.title = 'Supprimer la réservation';
            deleteBtn.className = 'delete-btn';
            deleteBtn.onclick = () => deleteReservation(reservation.id);
            timeSlotHeader.appendChild(deleteBtn);

            const montéBtn = document.createElement('button');
            montéBtn.textContent = 'Monté';
            montéBtn.className = 'monte-btn';
            
            // --- DÉBUT MODIFICATION BOUTON MONTÉ ---
            if (reservation.monte) {
                montéBtn.classList.add('active');
            }

            montéBtn.addEventListener('click', async function() {
                const newMonteState = !reservation.monte;
                
                // 1. Sauvegarde en base de données
                const docRef = doc(db, "laserGameReservations", reservation.id);
                try {
                    await setDoc(docRef, { monte: newMonteState }, { merge: true });
                } catch (e) {
                    console.error("Erreur mise à jour 'monté':", e);
                }

                // 2. Logique du chrono (Si on active "Monté")
                if (newMonteState) {
                    // NOUVEAU : anniversaire lié au CRM -> on synchronise la fiche anniversaire
                    // correspondante (même crmOrderId) au lieu de lancer un chrono générique, pour
                    // éviter 2 chronos désynchronisés pour le même anniversaire.
                    const isBirthdayLinked = reservation.type === 'anniversaire' || !!reservation.childFirstName;

                    if (isBirthdayLinked) {
                        syncBirthdayChronoFromReservation(reservation);
                    } else {
                        const totalPlayers = reservation.groups.reduce((sum, current) => sum + current, 0);
                        const roomNameBase = reservation.room === 1 ? "⬇️ Salle Bas ⬇️" : "⬆️ Salle Haut ⬆️";

                        // --- MODIFICATION ICI : CALCUL DU TEMPS RÉEL DE JEU ---
                        let playTime = reservation.duration; // Par défaut

                        if (reservation.duration === 20) {
                            playTime = 18; // 20 min devient 18 min
                        } else if (reservation.duration === 30) {
                            playTime = 28; // 30 min devient 28 min
                        }
                        // -----------------------------------------------------

                        // On utilise 'playTime' pour le message et pour le lancement du chrono
                        const confirmMessage = `Voulez-vous lancer le chrono de ${playTime} minutes pour ${reservation.clientName} ?`;

                        showCustomAlert(confirmMessage, 'confirm', () => {
                            // Titre avec le saut de ligne <br>
                            const customTitle = `${roomNameBase}<br><span style="font-size:0.8em; font-weight:normal;">${reservation.clientName} (${totalPlayers}p)</span>`;

                            // Lancement du chrono avec la durée ajustée (playTime)
                            setPresetTime(reservation.room, playTime, customTitle);
                        });
                    }
                }
            });
            if (reservation.monte) {
                montéBtn.classList.add('active');
            }

            const paidContainer = document.createElement('div');
            paidContainer.className = 'paid-checkbox-container';

            const paidCheckbox = document.createElement('input');
            paidCheckbox.type = 'checkbox';
            paidCheckbox.id = `paid-${reservation.id}`;
            paidCheckbox.checked = reservation.paid;

            // MODIFIÉ : Ajout de la sauvegarde vers Firestore
            paidCheckbox.addEventListener('change', async () => {
                const docRef = doc(db, "laserGameReservations", reservation.id);
                try {
                    await setDoc(docRef, { paid: paidCheckbox.checked }, { merge: true });
                } catch (e) {
                    console.error("Erreur mise à jour 'paid':", e);
                }
            });

            const paidLabel = document.createElement('label');
            paidLabel.htmlFor = `paid-${reservation.id}`;
            paidLabel.textContent = 'Payé';
            
            paidContainer.appendChild(paidCheckbox);
            paidContainer.appendChild(paidLabel);

            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'reservation-buttons';

            const leftButtons = document.createElement('div');
            leftButtons.className = 'left-buttons';

            const editBtn = document.createElement('button');
            editBtn.innerHTML = '✏️';
            editBtn.title = 'Modifier la réservation';
            editBtn.className = 'edit-btn';
            editBtn.onclick = () => openEditModal(reservation.id);

            leftButtons.appendChild(editBtn);
            leftButtons.appendChild(montéBtn);

            buttonsContainer.appendChild(leftButtons);
            buttonsContainer.appendChild(paidContainer);

            timeSlot.appendChild(buttonsContainer);
        }
    } else {
        const now = new Date();
        let isAutomaticallyClosed = false;
        
        // === MODIFICATION : LOGIQUE DE FERMETURE AUTOMATIQUE DÉCALÉE ===
        // On calcule le "jour commercial" actuel (businessToday)
        const businessNow = new Date(now);
        if (now.getHours() < 2 || (now.getHours() === 2 && now.getMinutes() <= 10)) {
            businessNow.setDate(businessNow.getDate() - 1);
        }
        
        const businessToday = new Date(businessNow);
        businessToday.setHours(0, 0, 0, 0);

        // On compare la date affichée (currentDate) avec ce jour commercial
        // Note: currentDate est déjà un objet Date sans heures (géré par le calendrier) ou avec heures (init), 
        // mais pour la comparaison de jour strict, on normalise.
        const displayedDate = new Date(currentDate);
        displayedDate.setHours(0,0,0,0);

        if (displayedDate < businessToday) {
            isAutomaticallyClosed = true;
        } 
        else if (isSameDay(displayedDate, businessNow)) {
            const slotDate = new Date(currentDate);
            if (hour < OPENING_HOUR) {
                slotDate.setDate(slotDate.getDate() + 1);
            }
            const slotTime = new Date(slotDate);
            slotTime.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
            const closingTime = new Date(slotTime.getTime() + SLOT_GRACE_MINUTES * 60000);
            if (now > closingTime) {
                isAutomaticallyClosed = true;
            }
        }
        // =============================================================

        if (isAutomaticallyClosed) {
            timeSlot.classList.add('auto-closed');
            const closedText = document.createElement('div');
            closedText.className = 'auto-closed-text';
            closedText.textContent = 'Passé';
            timeSlot.appendChild(closedText);
        } else {
            const dateStr = formatDateForStorage(currentDate);
            const room = container.parentElement.id === 'room-1' ? 1 : 2;
            
            timeSlot.addEventListener('click', (e) => {
                if (timeSlot.classList.contains('closed')) return;

                if (e.target.classList.contains('closed-checkbox') || e.target.closest('.closed-checkbox-container')) {
                    return;
                }
                openCreateModalForSlot(hour, room);
            });

            const closedContainer = document.createElement('div');
            closedContainer.className = 'closed-checkbox-container';
            const closedCheckbox = document.createElement('input');
            closedCheckbox.type = 'checkbox';
            closedCheckbox.id = `closed-${dateStr}-${hour}-${room}`;
            closedCheckbox.className = 'closed-checkbox';

            const key = `${dateStr}.${hour}.${room}`;
            if (closedSlots[key]) {
                closedCheckbox.checked = true;
                timeSlot.classList.add('closed');
            }

            closedCheckbox.addEventListener('change', function() {
                timeSlot.classList.toggle('closed', this.checked);
                updateClosedSlots(hour, room, this.checked, dateStr);
            });
            const closedLabel = document.createElement('label');
            closedLabel.htmlFor = closedCheckbox.id;
            closedLabel.textContent = 'Fermé';
            closedContainer.appendChild(closedCheckbox);
            closedContainer.appendChild(closedLabel);
            timeSlot.appendChild(closedContainer);
        }
    }

    container.appendChild(timeSlot);
}


function goToPreviousDay() {
    currentDate.setDate(currentDate.getDate() - 1);
    // On met à jour l'affichage des deux calendriers
    updateDateDisplay();
    updateQkDateDisplay();
    subscribeToDate(currentDate);
}
function goToNextDay() {
    currentDate.setDate(currentDate.getDate() + 1);
    // On met à jour l'affichage des deux calendriers
    updateDateDisplay();
    updateQkDateDisplay();
    subscribeToDate(currentDate);
}
// Retour rapide au jour courant (bouton "Aujourd'hui" / clic sur la date)
function goToToday() {
    const today = new Date();
    // Si on est déjà sur aujourd'hui, on ne recharge pas inutilement
    if (isSameDay(currentDate, today)) return;
    currentDate = today;
    updateDateDisplay();
    updateQkDateDisplay();
    subscribeToDate(currentDate);
}
    
    function updateDateDisplay() {
        currentDateDisplay.textContent = formatDateForDisplay(currentDate);
    }
    
    function formatDateForStorage(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    // Exposée globalement: du code ajouté plus tard (plan de table, monitoring bar...) vit en dehors
    // de cette fonction (initializeApp) et ne peut pas voir ses fonctions internes par simple portée.
    window.formatDateForStorage = formatDateForStorage;
    
    function isSameDay(date1, date2) {
        return (
            date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate()
        );
    }
async function triggerAlert(room) {
    const roomNames = {
        1: "⬇️ Salle Bas ⬇️",
        2: "⬆️ Salle Haut ⬆️",
        3: "🎙️ Karaoké 🎙️",
        4: "🚨 QuizzBoxing 🚨"
    };
    const roomName = roomNames[room] || `Salle ${room}`;
    const title = `${roomName} : 1 minute restante !`;
    const options = {
        body: 'La partie se termine dans 60 secondes.',
        icon: 'favicon.ico',
        vibrate: [200, 100, 200]
    };

    // On vérifie que les notifications sont bien autorisées
    if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
        try {
            // On récupère l'enregistrement du Service Worker actif
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
                // On demande au Service Worker d'afficher la notification pour nous
                // C'est la méthode fiable pour les mobiles
                await registration.showNotification(title, options);
            } else {
                // Fallback au cas où le service worker ne serait pas prêt
                new Notification(title, options);
            }
        } catch (error) {
            console.error("Erreur lors de l'affichage de la notification via le Service Worker:", error);
        }
    }

    // La logique pour faire clignoter l'onglet (utile sur PC) ne change pas
    startTabAlert(room);
}

function openEditModal(reservationId) {
    const reservation = reservations.find(res => res.id === reservationId);
    if (!reservation) return;

    editForm.reset();
    editModal.querySelector('h2').textContent = 'Modifier la Réservation (Laser Game)';

    // Affiche les options Laser Game, cache celles pour QK
    document.getElementById('edit-groups-container-wrapper').style.display = 'block';
    document.getElementById('edit-laser-game-type').style.display = 'block';
    document.getElementById('edit-laser-game-options').style.display = 'flex';
    document.getElementById('edit-qk-options').style.display = 'none';
    document.getElementById('edit-players-group').style.display = 'none';

    // Gère l'attribut 'required' pour éviter les erreurs de validation.
    // min/value aussi remis à une valeur cohérente : un edit Quiz précédent laisse min="4" en
    // mémoire (form.reset() ne touche pas les attributs posés en JS), et si value retombe à "2"
    // (défaut HTML) le champ reste invalide (caché, mais bloque quand même TOUT le formulaire) tant
    // que la page n'est pas rechargée.
    const editPlayersFieldLg = document.getElementById('edit-players');
    editPlayersFieldLg.required = false;
    editPlayersFieldLg.min = 2;
    editPlayersFieldLg.value = 2;

    // Remplit le formulaire
    editReservationId.value = reservation.id;
    document.getElementById('edit-reservation-type').value = 'lg'; // Type Laser Game
    editClientName.value = reservation.clientName;
    editClientPhone.value = reservation.phone;
    document.getElementById('edit-booked-by').value = reservation.bookedBy || '';
    editReservationDate.value = reservation.date;

    const resDate = new Date(reservation.date.replace(/-/g, '/'));
    document.querySelector(`input[name="edit-duration"][value="${reservation.duration}"]`).checked = true;
    document.querySelector(`input[name="edit-room"][value="${reservation.room}"]`).checked = true;
    // On masque les créneaux indisponibles, en ignorant la réservation en cours d'édition
    generateTimeOptions(resDate, editStartTime, { type: 'lg', room: reservation.room, ignoreId: reservation.id, forceHour: reservation.startTime });
    editStartTime.value = reservation.startTime;

    const type = reservation.type || 'none';
    document.querySelector(`input[name="edit-booking-type"][value="${type}"]`).checked = true;

    editGroupsContainer.innerHTML = '';
    reservation.groups.forEach(playerCount => {
        addGroupInput(playerCount);
    });

    editModal.style.display = 'flex';
}

function addGroupInput(value = 3) {
    const groupRow = document.createElement('div');
    groupRow.className = 'edit-group-row';
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'players-group-input';
    input.value = value;
    input.min = 2; // Le minimum par groupe est de 2
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'X';
    removeBtn.className = 'delete-btn';
    removeBtn.onclick = () => {
        groupRow.remove();
    };
    groupRow.appendChild(input);
    groupRow.appendChild(removeBtn);
    editGroupsContainer.appendChild(groupRow);
}

function closeEditModal() {
    editModal.style.display = 'none';
    // Restaure le titre original au cas où il aurait été changé pour "Nouvelle Réservation"
    editModal.querySelector('h2').textContent = 'Modifier la Réservation';
}

    addGroupBtn.addEventListener('click', () => addGroupInput());
    cancelEditBtn.addEventListener('click', closeEditModal);
    editModal.querySelector('.close-button').addEventListener('click', closeEditModal);

    // Quand on change de salle (LG) ou d'activité (QK) dans le modal,
    // on régénère la liste des heures pour refléter les créneaux réellement disponibles.
    document.querySelectorAll('input[name="edit-room"], input[name="edit-activity"]').forEach(radio => {
        radio.addEventListener('change', refreshEditTimeOptions);
    });

// REMPLACEZ VOTRE FONCTION EXISTANTE PAR CELLE-CI
editForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const id = document.getElementById('edit-reservation-id').value;
    const reservationType = document.getElementById('edit-reservation-type').value;
    
    const newDateStr = editReservationDate.value;
    const newStartTime = parseFloat(editStartTime.value);
    const newReservationDateTime = getReservationFullDate(newDateStr, newStartTime);

    // Logique de validation de date passée.
    // On autorise la création/déplacement jusqu'à SLOT_GRACE_MINUTES après le début du créneau
    // (ex: créneau de 19h réservable jusqu'à 19h20).
    const graceLimit = new Date(newReservationDateTime.getTime() + SLOT_GRACE_MINUTES * 60000);
    if (graceLimit < new Date()) {
        let isPast = true;
        if(id && reservationType === 'lg') {
            const originalRes = reservations.find(r => r.id === id);
            if(originalRes && originalRes.date === newDateStr && originalRes.startTime === newStartTime) isPast = false;
        } else if (id && reservationType === 'qk') {
            const originalRes = qkReservations.find(r => r.id === id);
            if(originalRes && originalRes.date === newDateStr && originalRes.startTime === newStartTime) isPast = false;
        }
        if(isPast) {
            showCustomAlert("Impossible de créer ou déplacer une réservation dans un créneau passé.");
            return;
        }
    }

    try {
        if (reservationType === 'lg') {
            // --- LOGIQUE POUR LASER GAME ---
            const newRoom = parseInt(document.querySelector('input[name="edit-room"]:checked').value);
            const newDuration = parseInt(document.querySelector('input[name="edit-duration"]:checked').value);
            const newEndTime = newStartTime + (newDuration / 60);
            const newGroups = Array.from(document.querySelectorAll('.players-group-input')).map(input => parseInt(input.value)).filter(val => val > 0);
            
            // Logique de validation (capacité, etc.)
            const totalPlayers = newGroups.reduce((sum, current) => sum + current, 0);
            const maxPlayers = newRoom === 1 ? 12 : 16;
            if (totalPlayers > maxPlayers) {
                showCustomAlert(`Le nombre total de joueurs (${totalPlayers}) dépasse la capacité de la salle (${maxPlayers}).`);
                return;
            }
            if (!isTimeSlotAvailable(newDateStr, newStartTime, newEndTime, newRoom, id)) {
                const reason = describeSlotConflict(newDateStr, newStartTime, newEndTime, { type: 'lg', room: newRoom, ignoreId: id });
                showCustomAlert(reason || "Le créneau n'est pas entièrement disponible ou est fermé.");
                return;
            }

            // Prépare les données à sauvegarder
            // --- Ligne précédente ---
            const dataToSave = {
                clientName: editClientName.value,
                phone: editClientPhone.value,
                bookedBy: document.getElementById('edit-booked-by').value.trim() || null,
                date: newDateStr,
                startTime: newStartTime,
                endTime: newEndTime,
                duration: newDuration,
                room: newRoom,
                groups: newGroups,
                type: document.querySelector('input[name="edit-booking-type"]:checked').value === 'none' ? null : document.querySelector('input[name="edit-booking-type"]:checked').value
            };

            // Résa importée du CRM modifiée à la main -> ne plus la réécrire au prochain sync
            if (id) {
                const originalRes = reservations.find(r => r.id === id);
                if (originalRes && originalRes.source === 'crm') {
                    dataToSave.locallyModified = true;
                }
            }

            // --- Code à remplacer / ajouter ---
            const saveLgData = async () => {
                if (id) { // Cas d'une MODIFICATION
                    const docRef = doc(db, "laserGameReservations", id);
                    await setDoc(docRef, dataToSave, { merge: true });
                    showToast('Réservation Laser Game mise à jour');
                } else { // Cas d'une NOUVELLE réservation
                    dataToSave.paid = false;
                    dataToSave.monte = false;
                    dataToSave.createdAt = serverTimestamp(); // Date/heure de création (traçabilité, Firebase uniquement)
                    await addDoc(collection(db, "laserGameReservations"), dataToSave);
                    showToast('Réservation Laser Game enregistrée');
                }
                closeEditModal(); 
            };

            // --- NOUVEAU : Vérification de priorité Anniversaire ---
            const bookingType = document.querySelector('input[name="edit-booking-type"]:checked').value;
            const dayOfWeek = newReservationDateTime.getDay();
            const isTargetDay = (dayOfWeek === 0 || dayOfWeek === 3 || dayOfWeek === 6); // Dimanche (0), Mercredi (3), Samedi (6)
            const isTargetTime = newStartTime >= 13 && newStartTime < 18; // Entre 13h00 et 17h30 inclus
            const isAdvance = (newReservationDateTime.getTime() - Date.now()) > (2 * 24 * 60 * 60 * 1000); // Plus de 48h à l'avance
            
            if (isTargetDay && isTargetTime && isAdvance && bookingType !== 'anniversaire') {
                const warnMsg = "⚠️ Priorité Anniversaires\n\nCe créneau (Mer/Sam/Dim entre 13h et 18h) est en forte demande pour les anniversaires.\nÊtes-vous sûr de vouloir bloquer la salle pour une réservation classique plus de 48h à l'avance ?";
                showCustomAlert(warnMsg, 'confirm', saveLgData);
            } else {
                await saveLgData();
            }

            // --- Ligne suivante ---
        } else if (reservationType === 'qk') {
            // --- LOGIQUE POUR QUIZ/KARAOKÉ ---
            const newActivity = document.querySelector('input[name="edit-activity"]:checked').value;
            const newPlayers = parseInt(document.getElementById('edit-players').value);
            const newDuration = parseInt(document.querySelector('input[name="edit-qk-duration"]:checked').value);
            const newEndTime = newStartTime + (newDuration / 60);

            // Logique de validation
            const maxPlayers = newActivity === 'quiz' ? 12 : 10;
            if (newPlayers > maxPlayers) {
                showCustomAlert(`Le ${newActivity} ne peut accueillir que ${maxPlayers} joueurs maximum.`);
                return;
            }
            if (!isQkSlotAvailable(newDateStr, newStartTime, newEndTime, newActivity, id)) {
                const reason = describeSlotConflict(newDateStr, newStartTime, newEndTime, { type: 'qk', activity: newActivity, ignoreId: id });
                showCustomAlert(reason || "Ce créneau n'est pas disponible.");
                return;
            }

            // Prépare les données à sauvegarder
            const dataToSave = {
                clientName: editClientName.value,
                phone: editClientPhone.value,
                bookedBy: document.getElementById('edit-booked-by').value.trim() || null,
                date: newDateStr,
                startTime: newStartTime,
                endTime: newEndTime,
                activity: newActivity,
                players: newPlayers,
                duration: newDuration
            };

            // Résa importée du CRM modifiée à la main -> ne plus la réécrire au prochain sync
            if (id) {
                const originalRes = qkReservations.find(r => r.id === id);
                if (originalRes && originalRes.source === 'crm') {
                    dataToSave.locallyModified = true;
                }
            }

            if (id) { // Cas d'une MODIFICATION
                const docRef = doc(db, "qkReservations", id);
                await setDoc(docRef, dataToSave, { merge: true }); // 'merge: true' préserve 'paid' et 'monte'
                showToast('Réservation Quiz/Karaoké mise à jour');
            } else { // Cas d'une NOUVELLE réservation
                dataToSave.paid = false;
                dataToSave.monte = false;
                dataToSave.createdAt = serverTimestamp(); // Date/heure de création (traçabilité, Firebase uniquement)
                await addDoc(collection(db, "qkReservations"), dataToSave);
                showToast('Réservation Quiz/Karaoké enregistrée');
                // Résa entrée à la main -> le CRM ne sait pas que ce créneau vient d'être pris.
                offerToCloseCrmSlot(newActivity, newDateStr, newStartTime, newDuration);
            }
        }

        closeEditModal(); // Ferme le pop-up dans tous les cas de succès
    } catch (error) {
        console.error("Erreur lors de la sauvegarde via le modal :", error);
        showCustomAlert("Une erreur est survenue lors de la sauvegarde.");
    }
});

    function formatDateForDisplay(date) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('fr-FR', options);
    }
    // Exposée globalement — même raison que formatDateForStorage plus haut (setupMobileNavigation
    // vit hors de initializeApp et ne voit pas ses fonctions internes par simple portée).
    window.formatDateForDisplay = formatDateForDisplay;

    specialPeriodsCache = [];

    function loadSpecialPeriodsData() {
        const docRef = doc(db, "settings", "specialPeriods");

        // Écoute en temps réel sur le Cloud pour tous les PCs
        onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists() && docSnap.data().items) {
                specialPeriodsCache = docSnap.data().items;
            } else {
                specialPeriodsCache = [];
            }
            displaySpecialPeriods();
            if (typeof displayReservationsForDate === 'function') {
                displayReservationsForDate(currentDate);
            }
            if (typeof displayQkReservationsForDate === 'function') {
                displayQkReservationsForDate(currentDate);
            }
            if (typeof window.renderAllGroupsList === 'function') {
                window.renderAllGroupsList();
            }
        });
    }
    loadSpecialPeriodsData();

    function getSpecialPeriods() {
        return specialPeriodsCache;
    }

    async function saveSpecialPeriods(periods) {
        try {
            await setDoc(doc(db, "settings", "specialPeriods"), { items: periods });
        } catch (e) {
            console.error("Erreur sauvegarde périodes", e);
            showCustomAlert("Erreur lors de la sauvegarde sur le Cloud.");
        }
    }

    function displaySpecialPeriods() {
        const periods = getSpecialPeriods();
        specialPeriodsListDiv.innerHTML = '';
        if (periods.length === 0) {
            specialPeriodsListDiv.innerHTML = '<p>Aucune période spéciale enregistrée.</p>';
            return;
        }

        periods.forEach((period, index) => {
            const periodEl = document.createElement('div');
            periodEl.style.display = 'flex';
            periodEl.style.justifyContent = 'space-between';
            periodEl.style.padding = '5px';
            periodEl.style.borderBottom = '1px solid #eee';
            const dateText = period.end 
                ? `Du ${formatDateForDisplay(new Date(period.start))} au ${formatDateForDisplay(new Date(period.end))}`
                : `Le ${formatDateForDisplay(new Date(period.start))}`;
            periodEl.innerHTML = `<span>${dateText}</span>`;
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Supprimer';
            deleteBtn.className = 'delete-btn';
            deleteBtn.onclick = () => {
                showCustomAlert('Voulez-vous vraiment supprimer cette période ?', 'confirm', () => {
                    let periods = getSpecialPeriods();
                    periods.splice(index, 1);
                    saveSpecialPeriods(periods);
                });
            };
            periodEl.appendChild(deleteBtn);
            specialPeriodsListDiv.appendChild(periodEl);
        });
    }

    addSpecialPeriodBtn.addEventListener('click', () => {
        const startDate = specialDateStartInput.value;
        const endDate = specialDateEndInput.value;

        if (!startDate) {
            alert('Veuillez sélectionner au moins une date de début.');
            return;
        }

        const newPeriod = {
            start: startDate,
            end: endDate || null
        };
        
        const periods = getSpecialPeriods();
        periods.push(newPeriod);
        periods.sort((a, b) => new Date(a.start) - new Date(b.start));
        saveSpecialPeriods(periods);
        
        specialDateStartInput.value = '';
        specialDateEndInput.value = '';
    });

    // Cache des jours fériés français par année (calculés une seule fois)
    const _frenchHolidaysCache = {};

    function getFrenchPublicHolidays(year) {
        if (_frenchHolidaysCache[year]) return _frenchHolidaysCache[year];

        // Calcul du dimanche de Pâques (algorithme de Meeus/Jones/Butcher)
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = avril
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        const easter = new Date(year, month - 1, day);

        const addDays = (base, days) => {
            const dt = new Date(base);
            dt.setDate(dt.getDate() + days);
            return dt;
        };
        const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

        const holidays = new Set([
            `${year}-01-01`,          // Jour de l'an
            fmt(addDays(easter, 1)),  // Lundi de Pâques
            `${year}-05-01`,          // Fête du travail
            `${year}-05-08`,          // Victoire 1945
            fmt(addDays(easter, 39)), // Ascension
            fmt(addDays(easter, 50)), // Lundi de Pentecôte
            `${year}-07-14`,          // Fête nationale
            `${year}-08-15`,          // Assomption
            `${year}-11-01`,          // Toussaint
            `${year}-11-11`,          // Armistice 1918
            `${year}-12-25`           // Noël
        ]);

        _frenchHolidaysCache[year] = holidays;
        return holidays;
    }

    function isFrenchPublicHoliday(date) {
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return getFrenchPublicHolidays(date.getFullYear()).has(dateStr);
    }

    function isSpecialDay(date) {
        // 1. Jours fériés français calculés automatiquement (ouverture dès 13h, comme un week-end)
        if (isFrenchPublicHoliday(date)) return true;

        // 2. Périodes spéciales saisies manuellement (vacances scolaires, etc.)
        const periods = getSpecialPeriods();

        // Normalisation à midi pour éviter tout souci de fuseau horaire / changement d'heure
        const checkTime = new Date(date);
        checkTime.setHours(12, 0, 0, 0);

        // "YYYY-MM-DD" interprété en heure LOCALE (et non UTC) pour éviter les décalages d'un jour
        const parseLocalDate = (str) => {
            const [y, mo, d] = str.split('-').map(Number);
            return new Date(y, mo - 1, d);
        };

        for (const period of periods) {
            if (!period.start) continue;

            const startTime = parseLocalDate(period.start);
            startTime.setHours(0, 0, 0, 0);

            // Un jour unique (pas de date de fin) couvre toute sa journée
            const endTime = period.end ? parseLocalDate(period.end) : parseLocalDate(period.start);
            endTime.setHours(23, 59, 59, 999);

            if (checkTime >= startTime && checkTime <= endTime) {
                return true;
            }
        }
        return false;
    }

    function getOpeningHourForDate(date) {
        if (isSpecialDay(date)) {
            return 13;
        }
        const dayOfWeek = date.getDay();
        if ([1, 2, 4, 5].includes(dayOfWeek)) {
            return 17;
        }
        return 13;
    }
    
    function getClosingHourForDate(date) {
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 6) { // Samedi
            return 2;
        }
        return 1;
    }

// ==================================================================
// === TARIFICATION (Laser / Karaoké / Quiz) — montant à régler ===
// === Tous les tarifs sont exprimés PAR PERSONNE.               ===
// === Modifiable via le menu ☰ > "💶 Gérer les tarifs".          ===
// ==================================================================

// Tarifs par défaut (utilisés tant qu'aucune configuration n'a été enregistrée
// dans Firestore, et comme base pour le bouton "Réinitialiser aux tarifs par défaut").
// "special" : false = jours normaux uniquement / true = vacances scolaires, jours fériés
// et veille de jour férié uniquement / null (ou absent) = s'applique dans les deux cas.
// Les règles sont évaluées DANS L'ORDRE : la première qui correspond au jour, à l'heure
// et au contexte (normal / spécial) est utilisée — utile pour découper une même journée
// en plusieurs tranches horaires (ex : lundi 8h-15h à 8€, 15h-21h à 16€, 21h-00h à 25€).
const DEFAULT_PRICING = {
    laser: [
        { special: false, days: [1, 2, 3, 4], timeStart: 0, timeEnd: 24, tiers: [{ duration: 20, price: 6 }, { duration: 30, price: 8 }] },
        { special: false, days: [5, 6, 0], timeStart: 0, timeEnd: 24, tiers: [{ duration: 20, price: 9 }, { duration: 30, price: 13 }] },
        { special: true, days: [0, 1, 2, 3, 4, 5, 6], timeStart: 0, timeEnd: 24, tiers: [{ duration: 20, price: 9 }, { duration: 30, price: 13 }] }
    ],
    karaoke: [
        { special: null, days: [0, 1, 2, 3, 4, 5, 6], timeStart: 0, timeEnd: 24, tiers: [{ duration: 30, price: 8 }, { duration: 60, price: 12 }] }
    ],
    quiz: [
        { special: false, days: [0], timeStart: 0, timeEnd: 19, tiers: [{ min: 4, max: 6, price: 25 }, { min: 7, max: 12, price: 21 }] },
        { special: false, days: [0], timeStart: 19, timeEnd: 24, tiers: [{ min: 4, max: 6, price: 20 }, { min: 7, max: 12, price: 16 }] },
        { special: false, days: [1, 2, 3, 4], timeStart: 0, timeEnd: 24, tiers: [{ min: 4, max: 6, price: 20 }, { min: 7, max: 12, price: 16 }] },
        { special: false, days: [5], timeStart: 0, timeEnd: 17, tiers: [{ min: 4, max: 6, price: 20 }, { min: 7, max: 12, price: 16 }] },
        { special: false, days: [5], timeStart: 17, timeEnd: 24, tiers: [{ min: 4, max: 6, price: 25 }, { min: 7, max: 12, price: 21 }] },
        { special: false, days: [6], timeStart: 0, timeEnd: 24, tiers: [{ min: 4, max: 6, price: 25 }, { min: 7, max: 12, price: 21 }] },
        { special: true, days: [0, 1, 2, 3, 4, 5, 6], timeStart: 0, timeEnd: 24, tiers: [{ min: 4, max: 6, price: 25 }, { min: 7, max: 12, price: 21 }] }
    ]
};

let pricingCache = null; // null tant que non chargé/non configuré => on retombe sur DEFAULT_PRICING

function loadPricingData() {
    const docRef = doc(db, "settings", "pricing");
    onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists() && docSnap.data().activities) {
            pricingCache = docSnap.data().activities;
        } else {
            pricingCache = null;
        }
        if (typeof renderPricingRules === 'function' && pricingModal && pricingModal.style.display !== 'none') {
            pricingEditState = JSON.parse(JSON.stringify(getPricingConfig()));
            renderPricingRules();
        }
        if (typeof displayReservationsForDate === 'function') {
            displayReservationsForDate(currentDate);
        }
        if (typeof displayQkReservationsForDate === 'function') {
            displayQkReservationsForDate(currentDate);
        }
    });
}

function getPricingConfig() {
    return pricingCache || DEFAULT_PRICING;
}

async function savePricingConfig(config) {
    try {
        await setDoc(doc(db, "settings", "pricing"), { activities: config });
    } catch (e) {
        console.error("Erreur sauvegarde tarifs", e);
        showCustomAlert("Erreur lors de la sauvegarde des tarifs.");
    }
}

// Veille de jour férié (ex : dimanche avant un lundi férié)
function isEveOfFrenchPublicHoliday(date) {
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return isFrenchPublicHoliday(tomorrow);
}

// Contexte "tarif spécial" : jour férié, veille de jour férié, ou période spéciale
// (vacances scolaires saisies dans "Gérer les périodes"). Ne modifie pas isSpecialDay()
// dont dépend déjà la logique des horaires d'ouverture.
function isHighTariffContext(date) {
    return isSpecialDay(date) || isEveOfFrenchPublicHoliday(date);
}

// Trouve la première règle de tarification qui correspond au jour de la semaine,
// à l'heure (décimale) et au contexte (normal / spécial) demandés.
function findMatchingPricingRule(activity, date, hour) {
    const rules = getPricingConfig()[activity];
    if (!Array.isArray(rules)) return null;
    const dayOfWeek = date.getDay();
    const special = isHighTariffContext(date);

    for (const rule of rules) {
        if (Array.isArray(rule.days) && !rule.days.includes(dayOfWeek)) continue;
        const tStart = (rule.timeStart != null) ? rule.timeStart : 0;
        const tEnd = (rule.timeEnd != null) ? rule.timeEnd : 24;
        if (!(hour >= tStart && hour < tEnd)) continue;
        if (rule.special === true && !special) continue;
        if (rule.special === false && special) continue;
        return rule;
    }
    return null;
}

// Sélectionne le palier tarifaire correspondant à une durée (laser / karaoké).
function findDurationTier(tiers, duration) {
    if (!Array.isArray(tiers)) return null;
    return tiers.find(t => t.duration === duration) || null;
}

// Sélectionne le palier tarifaire correspondant à un nombre de joueurs (quiz),
// avec repli sur le palier le plus proche si l'effectif sort des bornes configurées.
function findPlayersTier(tiers, players) {
    if (!Array.isArray(tiers) || tiers.length === 0) return null;
    let match = tiers.find(t => players >= t.min && players <= t.max);
    if (match) return match;
    const sorted = [...tiers].sort((a, b) => a.min - b.min);
    if (players < sorted[0].min) return sorted[0];
    return sorted[sorted.length - 1];
}

function parseLocalDateStr(dateStr) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, d);
}

// Montant total à régler pour une réservation laser (par personne x nb de joueurs).
function calculateLaserPrice(reservation) {
    if (!reservation || !reservation.date || !Array.isArray(reservation.groups)) return null;
    // Les anniversaires et réservations de groupe ont leur propre tarif dédié :
    // pas de montant à afficher ici pour ces créneaux. Les résas anniversaire importées
    // du CRM ne portent pas toujours "type: 'anniversaire'" (seul childFirstName est renseigné) :
    // on se base donc aussi sur la présence d'un prénom d'enfant.
    if (reservation.type === 'anniversaire' || reservation.type === 'groupe' || reservation.childFirstName) return null;
    const date = parseLocalDateStr(reservation.date);
    const rule = findMatchingPricingRule('laser', date, reservation.startTime);
    if (!rule) return null;
    const tier = findDurationTier(rule.tiers, reservation.duration);
    if (!tier) return null;
    const totalPlayers = reservation.groups.reduce((sum, current) => sum + current, 0);
    return tier.price * totalPlayers;
}

// Montant total à régler pour une réservation quiz ou karaoké.
// Retourne { total, unitPrice, players } (ou null si aucun tarif ne correspond) pour
// permettre d'afficher le détail du calcul (ex: "4×25€ - 25€") quand un acompte est déduit.
function calculateQkPrice(reservation) {
    if (!reservation || !reservation.date || !reservation.activity) return null;
    const date = parseLocalDateStr(reservation.date);
    const rule = findMatchingPricingRule(reservation.activity, date, reservation.startTime);
    if (!rule) return null;
    const players = reservation.players || 0;

    let tier;
    if (reservation.activity === 'quiz') {
        tier = findPlayersTier(rule.tiers, players);
    } else {
        tier = findDurationTier(rule.tiers, reservation.duration);
    }
    if (!tier) return null;
    return { total: tier.price * players, unitPrice: tier.price, players: players };
}

    loadPricingData();

const customAlertModal = document.getElementById('custom-alert-modal');
const customAlertMessage = document.getElementById('custom-alert-message');
const customAlertInput = document.getElementById('custom-alert-input');
const customAlertOk = document.getElementById('custom-alert-ok');
const customAlertConfirm = document.getElementById('custom-alert-confirm');
const customAlertCancel = document.getElementById('custom-alert-cancel');

// type: 'alert' (juste OK) | 'confirm' (Confirmer/Annuler, onConfirm() sans argument)
// | 'prompt' (Confirmer/Annuler + champ texte obligatoire, onConfirm(valeurSaisie))
function showCustomAlert(message, type = 'alert', onConfirm = null) {
    customAlertMessage.textContent = message;
    customAlertMessage.style.whiteSpace = 'pre-line'; // Respecte les sauts de ligne (\n) sans injecter de HTML

    if (type === 'prompt') {
        customAlertOk.style.display = 'none';
        customAlertConfirm.style.display = 'inline-block';
        customAlertCancel.style.display = 'inline-block';
        customAlertInput.style.display = 'block';
        customAlertInput.value = '';
        setTimeout(() => customAlertInput.focus(), 50);
    } else if (type === 'confirm') {
        customAlertOk.style.display = 'none';
        customAlertConfirm.style.display = 'inline-block';
        customAlertCancel.style.display = 'inline-block';
        customAlertInput.style.display = 'none';
    } else {
        customAlertOk.style.display = 'inline-block';
        customAlertConfirm.style.display = 'none';
        customAlertCancel.style.display = 'none';
        customAlertInput.style.display = 'none';
    }

    const closeModal = () => {
        customAlertModal.style.display = 'none';
        customAlertConfirm.onclick = null;
    };

    customAlertOk.onclick = closeModal;
    customAlertCancel.onclick = closeModal;
    customAlertConfirm.onclick = () => {
        if (type === 'prompt') {
            const value = customAlertInput.value.trim();
            if (!value) { customAlertInput.focus(); return; } // nom obligatoire, on ne ferme pas
            if (typeof onConfirm === 'function') onConfirm(value);
            closeModal();
            return;
        }
        if (typeof onConfirm === 'function') {
            onConfirm();
        }
        closeModal();
    };

    customAlertModal.style.display = 'flex';
}
// NOUVEAU : exposée sur window, comme formatDateForStorage/formatDateForDisplay plus haut --
// showCustomAlert() est appelée depuis le bloc "plan de table" (mergeAdjacentTable, unmergeTable,
// deleteTableAssignment, toggleRabTable, ...), déclaré en dehors de initializeApp() : sans cette
// exposition, ces appels levaient "Uncaught ReferenceError: showCustomAlert is not defined" dès
// qu'une alerte devait s'afficher (bouton 🗑️/📦/❌ notamment).
window.showCustomAlert = showCustomAlert;

// Notification non-bloquante (toast) : disparaît seule, ne demande aucun clic.
// type : 'success' (défaut) | 'error' | 'info'
function showToast(message, type = 'success', duration = 2600) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    const icon = type === 'error' ? '⚠️' : (type === 'info' ? 'ℹ️' : '✅');
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    // Animation d'entrée
    requestAnimationFrame(() => toast.classList.add('show'));

    // Retrait automatique
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
// Exposée globalement — même raison que formatDateForStorage ci-dessus.
window.showToast = showToast;

// Appelé juste après la création manuelle d'une fiche anniversaire — vérifie tout de suite si la
// capacité (11, hors Quiz boxing) est atteinte pour cette date et ferme sur le CRM sans attendre le
// sync 10min (qui ne couvrirait même pas une date future via le bouton "Vérifier maintenant").
const CHECK_ANNIV_CAPACITY_URL = 'https://us-central1-bowlingbackend.cloudfunctions.net/checkAnniversaireCapacity';
async function checkAnniversaireCapacityNow(dateStr) {
    try {
        const res = await fetch(CHECK_ANNIV_CAPACITY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateStr })
        });
        const data = await res.json();
        if (data.success && data.closed && data.closed.length > 0) {
            showToast(`🎂 Capacité atteinte (${data.bookedCount}) le ${dateStr} → ${data.closed.length} créneau(x) fermé(s) sur le CRM (Quiz boxing conservé).`, 'info', 4000);
        }
    } catch (error) {
        console.error('Erreur vérification capacité anniversaire', error);
    }
}

// Bouton "Vérifier les nouvelles résa CRM" — déclenche un sync immédiat (ignore le throttle
// horaire côté fonction) pour voir si une résa web est arrivée dans les dernières minutes
// (ex: client qui vient sur place pendant qu'une résa karaoke vient d'être faite en ligne).
// Les résas sont déjà dans Firestore après l'appel -> le calendrier se met à jour tout seul
// (onSnapshot), la modale sert juste à dire ce qui a été trouvé.
const SYNC_MANUAL_URL = 'https://us-central1-bowlingbackend.cloudfunctions.net/syncCrmManual';
const CLOSE_CRM_SLOT_URL = 'https://us-central1-bowlingbackend.cloudfunctions.net/closeCrmSlot';
// NOUVEAU : pendant de CLOSE_CRM_SLOT_URL, pour rouvrir un créneau CRM (case "Fermé" décochée).
const OPEN_CRM_SLOT_URL = 'https://us-central1-bowlingbackend.cloudfunctions.net/openCrmSlot';

// Propose de fermer le créneau CRM correspondant après une résa quiz/karaoké entrée à la main sur
// le site (le CRM ne le sait pas, un client pourrait réserver en ligne sur le même horaire —
// et pour le karaoké, la formule 30min/1h en trop reste ouverte même si on ferme la bonne).
function offerToCloseCrmSlot(activity, dateStr, startTime, durationMinutes) {
    showCustomAlert(
        "Fermer ce créneau sur le CRM pour éviter qu'un client le réserve en ligne ?",
        'confirm',
        async () => {
            try {
                const res = await fetch(CLOSE_CRM_SLOT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ activity, date: dateStr, startTime, durationMinutes })
                });
                const data = await res.json();
                if (data.alreadyBookedOnCrm) {
                    showCustomAlert("⚠️ Ce créneau est déjà réservé sur le CRM — vérifie qu'il n'y a pas de double réservation !");
                } else if (data.success) {
                    showToast(data.message || 'Créneau CRM fermé.');
                } else {
                    showCustomAlert(data.message || "Erreur lors de la fermeture du créneau CRM.");
                }
            } catch (error) {
                console.error('Erreur fermeture créneau CRM', error);
                showCustomAlert("Erreur réseau lors de la fermeture du créneau CRM.");
            }
        }
    );
}

// NOUVEAU : répercute automatiquement (sans demander confirmation, contrairement à
// offerToCloseCrmSlot ci-dessus) le blocage/déblocage sur le CRM quand le staff coche/décoche la
// case "Fermé" d'un créneau quiz/karaoké -- ex: un groupe est lancé en retard et occupe encore la
// salle après l'heure prévue, on coche "Fermé" pour empêcher une résa en ligne sur ce créneau le
// temps qu'ils terminent, puis on décoche une fois la salle libérée. Pas de confirm ici (contrairement
// à offerToCloseCrmSlot) : cocher/décocher la case EST déjà l'action explicite du staff, une 2e
// confirmation ne ferait que ralentir un geste pensé pour être rapide dans l'urgence.
// Seuls quiz/karaoke sont concernés : ce sont les seules activités gérées par le CRM en ligne
// (bowling/laser game n'ont pas de créneau CRM correspondant).
async function syncManualSlotCloseToCrm(activity, hour, isClosed, dateStr) {
    const url = isClosed ? CLOSE_CRM_SLOT_URL : OPEN_CRM_SLOT_URL;
    const durationMinutes = 30; // Une case "Fermé" couvre toujours un seul créneau de 30min (TIME_SLOT_STEP).
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activity, date: dateStr, startTime: hour, durationMinutes })
        });
        const data = await res.json();
        if (data.alreadyBookedOnCrm) {
            showCustomAlert("⚠️ Ce créneau est déjà réservé sur le CRM — vérifie qu'il n'y a pas de double réservation !");
        } else if (!data.success) {
            showCustomAlert(data.message || `Erreur lors de la ${isClosed ? 'fermeture' : 'réouverture'} du créneau CRM.`);
        }
        // Pas de toast en cas de succès simple : la case à cocher elle-même donne déjà le retour visuel voulu.
    } catch (error) {
        console.error(`Erreur ${isClosed ? 'fermeture' : 'réouverture'} créneau CRM (case Fermé) :`, error);
        showCustomAlert(`Erreur réseau lors de la ${isClosed ? 'fermeture' : 'réouverture'} du créneau CRM.`);
    }
}

const manualSyncBtn = document.getElementById('manual-sync-btn');
if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', async () => {
        const originalText = manualSyncBtn.textContent;
        manualSyncBtn.disabled = true;
        manualSyncBtn.textContent = '⏳ Vérification...';
        try {
            const res = await fetch(SYNC_MANUAL_URL);
            const data = await res.json();
            const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

            if (data.reason === 'crm_unreachable') {
                showCustomAlert(`Vérification à ${now} : ${data.message || "le CRM ne répond pas, réessaie dans quelques minutes."}`);
            } else if (data.skipped) {
                showCustomAlert(`Vérification à ${now} : rien à vérifier (bowling fermé).`);
            } else if (!data.newOrders || data.newOrders.length === 0) {
                showCustomAlert(`Vérification à ${now} : aucune nouvelle réservation depuis la dernière synchro.`);
            } else {
                const lines = data.newOrders
                    .map(o => `• ${o.clientName || '?'} — ${o.activity} — ${o.date} à ${o.time}`)
                    .join('\n');
                showCustomAlert(
                    `Vérification à ${now} : ${data.newOrders.length} nouvelle(s) réservation(s) !\n\n${lines}\n\nDéjà ajoutées au calendrier.`
                );
            }
        } catch (error) {
            console.error('Erreur vérification manuelle CRM:', error);
            showCustomAlert("Erreur lors de la vérification. Réessaie.");
        } finally {
            manualSyncBtn.disabled = false;
            manualSyncBtn.textContent = originalText;
        }
    });
}

// Raccourci "temps d'attente" (réglage CRM affiché aux clients) directement depuis l'entête —
// évite d'aller sur le CRM juste pour ça.
const GET_WAITING_TIME_URL = 'https://us-central1-bowlingbackend.cloudfunctions.net/getWaitingTime';
const SET_WAITING_TIME_URL = 'https://us-central1-bowlingbackend.cloudfunctions.net/setWaitingTime';
const waitingTimeInput = document.getElementById('waiting-time-input');
const waitingTimeSaveBtn = document.getElementById('waiting-time-save-btn');

async function loadWaitingTime() {
    if (!waitingTimeInput) return;
    try {
        const res = await fetch(GET_WAITING_TIME_URL);
        const data = await res.json();
        if (data.success && typeof data.minutes === 'number') {
            waitingTimeInput.value = data.minutes;
        }
    } catch (error) {
        console.error("Erreur chargement temps d'attente", error);
    }
}

async function saveWaitingTime() {
    if (!waitingTimeInput) return;
    const minutes = parseInt(waitingTimeInput.value, 10);
    if (isNaN(minutes) || minutes < 0) {
        showCustomAlert("Temps d'attente invalide.");
        return;
    }
    waitingTimeSaveBtn.disabled = true;
    try {
        const res = await fetch(SET_WAITING_TIME_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minutes })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`⏱️ Temps d'attente mis à jour : ${data.minutes} min`);
        } else {
            showCustomAlert(data.message || "Erreur lors de la mise à jour.");
        }
    } catch (error) {
        console.error("Erreur sauvegarde temps d'attente", error);
        showCustomAlert("Erreur réseau lors de la mise à jour du temps d'attente.");
    } finally {
        waitingTimeSaveBtn.disabled = false;
    }
}

if (waitingTimeSaveBtn) waitingTimeSaveBtn.addEventListener('click', saveWaitingTime);
if (waitingTimeInput) {
    waitingTimeInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveWaitingTime(); });
    loadWaitingTime();
}

// Onglet "🎳 Pistes réservées" du panneau Groupes du Jour — nombre de pistes bowling réservées par
// heure aujourd'hui (calculé côté CRM, on relit juste son propre décompte), détail dépliable par résa.
const GET_BOWLING_LANES_URL = 'https://us-central1-bowlingbackend.cloudfunctions.net/getBowlingLanesToday';
const tabGroupsTodayBtn = document.getElementById('tab-groups-today');
const tabLanesReservedBtn = document.getElementById('tab-lanes-reserved');
const todayGroupsListEl = document.getElementById('today-groups-list');
const lanesReservedPanelEl = document.getElementById('lanes-reserved-panel');
const lanesReservedListEl = document.getElementById('lanes-reserved-list');
const lanesReservedRefreshBtn = document.getElementById('lanes-reserved-refresh-btn');
let lanesReservedLoaded = false;
let lanesReservedRefreshInterval = null;

function renderLanesReserved(hours) {
    if (!lanesReservedListEl) return;
    const cutoffHour = new Date().getHours() - 2;
    const visibleHours = (hours || []).filter(h => h.hour > cutoffHour);
    if (visibleHours.length === 0) {
        lanesReservedListEl.innerHTML = '<p style="text-align:center; color:#999; font-style: italic; font-size: 0.9em; margin-top:20px;">Aucune réservation bowling aujourd\'hui.</p>';
        return;
    }
    lanesReservedListEl.innerHTML = visibleHours.map(h => `
        <div>
            <div class="lanes-hour-header">
                <span>${h.hour}h</span>
                <span>${h.totalLanes} piste${h.totalLanes > 1 ? 's' : ''}</span>
            </div>
            <div class="lanes-hour-detail" style="display: none;">
                ${h.bookings.map(b => `<div class="lanes-booking-row">${b.lanes} piste${b.lanes > 1 ? 's' : ''} — ${b.participants} pers.${b.client ? ' — ' + b.client : ''}</div>`).join('')}
            </div>
        </div>
    `).join('');
    lanesReservedListEl.querySelectorAll('.lanes-hour-header').forEach(header => {
        header.addEventListener('click', () => {
            const detail = header.nextElementSibling;
            detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
        });
    });
}

async function loadLanesReserved() {
    if (!lanesReservedListEl) return;
    lanesReservedListEl.innerHTML = '<p style="text-align:center; color:#999; font-size: 0.9em; margin-top:20px;">Chargement...</p>';
    try {
        const res = await fetch(GET_BOWLING_LANES_URL);
        const data = await res.json();
        if (data.success) {
            renderLanesReserved(data.hours);
        } else {
            lanesReservedListEl.innerHTML = '<p style="text-align:center; color:#e74c3c; font-size: 0.85em;">Erreur de chargement.</p>';
        }
    } catch (error) {
        console.error('Erreur chargement pistes réservées', error);
        lanesReservedListEl.innerHTML = '<p style="text-align:center; color:#e74c3c; font-size: 0.85em;">Erreur réseau.</p>';
    }
}

if (tabGroupsTodayBtn && tabLanesReservedBtn) {
    tabGroupsTodayBtn.addEventListener('click', () => {
        tabGroupsTodayBtn.classList.add('active');
        tabLanesReservedBtn.classList.remove('active');
        todayGroupsListEl.style.display = 'flex';
        if (lanesReservedPanelEl) lanesReservedPanelEl.style.display = 'none';
    });
    tabLanesReservedBtn.addEventListener('click', () => {
        tabLanesReservedBtn.classList.add('active');
        tabGroupsTodayBtn.classList.remove('active');
        todayGroupsListEl.style.display = 'none';
        if (lanesReservedPanelEl) lanesReservedPanelEl.style.display = 'flex';
        if (!lanesReservedLoaded) {
            lanesReservedLoaded = true;
            loadLanesReserved();
        }
        if (!lanesReservedRefreshInterval) {
            lanesReservedRefreshInterval = setInterval(loadLanesReserved, 10 * 60 * 1000);
        }
    });
}

if (lanesReservedRefreshBtn) {
    lanesReservedRefreshBtn.addEventListener('click', () => {
        loadLanesReserved();
    });
}

function setupDragAndDrop() {
    const containers = [room1Slots, room2Slots, quizSlots, karaokeSlots];
    containers.forEach(container => {
        container.addEventListener('dragstart', e => {
            if (e.target.classList.contains('booked')) {
                e.target.classList.add('dragging');
                // On utilise l'ID de la réservation qui est une chaîne de caractères
                e.dataTransfer.setData('text/plain', e.target.dataset.reservationId);
                e.dataTransfer.effectAllowed = 'move';
                // On cache l'élément original pendant le déplacement
                setTimeout(() => { e.target.style.visibility = 'hidden'; }, 0);
            }
        });

        container.addEventListener('dragover', e => {
            e.preventDefault();
            const targetSlot = e.target.closest('.time-slot');
            if (targetSlot && !targetSlot.classList.contains('booked') && !targetSlot.classList.contains('auto-closed')) {
                targetSlot.classList.add('drag-over');
                e.dataTransfer.dropEffect = 'move';
            }
        });

        container.addEventListener('dragleave', e => {
            const targetSlot = e.target.closest('.time-slot');
            if (targetSlot) {
                targetSlot.classList.remove('drag-over');
            }
        });

        container.addEventListener('dragend', e => {
            // On s'assure que l'élément redevient visible à la fin du drag, même si l'opération est annulée
            e.target.style.visibility = 'visible';
            if (e.target.classList.contains('dragging')) {
                e.target.classList.remove('dragging');
            }
        });

        container.addEventListener('drop', e => {
            e.preventDefault();
            const targetSlot = e.target.closest('.time-slot');
            if (!targetSlot) return;

            targetSlot.classList.remove('drag-over');
            // CORRECTION : On ne convertit plus l'ID en nombre, on le garde en chaîne de caractères.
            const rawDragData = e.dataTransfer.getData('text/plain');

            if (targetSlot.classList.contains('auto-closed') || targetSlot.classList.contains('closed')) {
                return;
            }

            // Drag venant d'une alerte de superposition CRM (pas une résa existante à déplacer)
            if (rawDragData.startsWith('crmalert:')) {
                handleCrmAlertDrop(rawDragData.slice('crmalert:'.length), targetSlot, container);
                return;
            }
            const reservationId = rawDragData;

            const isLaserGame = container === room1Slots || container === room2Slots;

            if (isLaserGame) {
                if (targetSlot.classList.contains('booked')) return;
                
                // CORRECTION : La recherche se fait maintenant avec l'ID en string
                const reservation = reservations.find(r => r.id === reservationId);
                if (!reservation) return;

                const newStartTime = parseFloat(targetSlot.dataset.time);
                const durationInHours = reservation.endTime - reservation.startTime;
                const newEndTime = newStartTime + durationInHours;
                const newRoom = parseInt(targetSlot.closest('.room').id.split('-')[1]);
                const dateStr = formatDateForStorage(currentDate);

                if (!isTimeSlotAvailable(dateStr, newStartTime, newEndTime, newRoom, reservationId)) {
                    const reason = describeSlotConflict(dateStr, newStartTime, newEndTime, { type: 'lg', room: newRoom, ignoreId: reservationId });
                    showCustomAlert(reason || "Le créneau de destination n'est pas entièrement disponible ou est fermé.");
                    return;
                }

                const oldTime = formatTime(reservation.startTime);
                const newTime = formatTime(newStartTime);
                const message = `${crmMoveWarningPrefix(reservation.source === 'crm')}Déplacer la réservation de "${reservation.clientName}" de ${oldTime} à ${newTime} ?\nQui déplace cette réservation ?`;

                // CORRECTION : On sauvegarde les modifications dans Firestore.
                showCustomAlert(message, 'prompt', async (moverName) => {
                    const docRef = doc(db, "laserGameReservations", reservationId);
                    try {
                        await setDoc(docRef, {
                            startTime: newStartTime,
                            endTime: newEndTime,
                            room: newRoom,
                            locallyModified: true,
                            lastMovedBy: moverName,
                            lastMovedAt: serverTimestamp()
                        }, { merge: true }); // 'merge: true' est crucial pour ne pas écraser les autres données
                    } catch (error) {
                        console.error("Erreur lors du déplacement : ", error);
                        showCustomAlert("Le déplacement a échoué.");
                    }
                    // onSnapshot s'occupera de rafraîchir l'affichage.
                });
            } else { // Quiz / Karaoké
                const draggedReservation = qkReservations.find(r => r.id === reservationId);
                if (!draggedReservation) return;

                const newStartTime = parseFloat(targetSlot.dataset.time);
                const durationInHours = draggedReservation.endTime - draggedReservation.startTime;
                const newEndTime = newStartTime + durationInHours;
                const newActivity = targetSlot.closest('.room').id.includes('quiz') ? 'quiz' : 'karaoke';
                const dateStr = formatDateForStorage(currentDate);

                if (draggedReservation.activity !== newActivity) {
                    const maxPlayers = newActivity === 'quiz' ? 12 : 10;
                    if (draggedReservation.players > maxPlayers) {
                        showCustomAlert(`Impossible de déplacer: ${draggedReservation.players} joueurs dépassent la capacité du ${newActivity} (${maxPlayers} max).`);
                        return;
                    }
                }
                
                if (!isQkSlotAvailable(dateStr, newStartTime, newEndTime, newActivity, reservationId)) {
                    const reason = describeSlotConflict(dateStr, newStartTime, newEndTime, { type: 'qk', activity: newActivity, ignoreId: reservationId });
                    showCustomAlert(reason || "Le créneau de destination n'est pas entièrement disponible.");
                    return;
                }
                
                if (newStartTime === draggedReservation.startTime && newActivity === draggedReservation.activity) {
                    return; // Rien n'a changé
                }

                const oldTime = formatTime(draggedReservation.startTime);
                const newTime = formatTime(newStartTime);
                const message = `${crmMoveWarningPrefix(draggedReservation.source === 'crm')}Déplacer la réservation de "${draggedReservation.clientName}" de ${oldTime} vers ${newTime} (${newActivity}) ?\nQui déplace cette réservation ?`;

                // CORRECTION : On sauvegarde les modifications dans Firestore.
                showCustomAlert(message, 'prompt', async (moverName) => {
                    const docRef = doc(db, "qkReservations", reservationId);
                     try {
                        await setDoc(docRef, {
                            startTime: newStartTime,
                            endTime: newEndTime,
                            activity: newActivity,
                            locallyModified: true,
                            lastMovedBy: moverName,
                            lastMovedAt: serverTimestamp()
                        }, { merge: true });
                        // NOUVEAU : un glisser-déposer expose le nouveau créneau au même risque de
                        // double réservation en ligne qu'une résa entrée à la main (le CRM ne sait pas
                        // qu'on vient de poser ce client ici) -- on propose donc pareil de le fermer sur
                        // le CRM. Même fonction que pour une nouvelle résa manuelle (offerToCloseCrmSlot
                        // ci-dessus), avec le NOUVEL horaire/activité de destination.
                        offerToCloseCrmSlot(newActivity, dateStr, newStartTime, durationInHours * 60);
                    } catch (error) {
                        console.error("Erreur lors du déplacement QK : ", error);
                        showCustomAlert("Le déplacement a échoué.");
                    }
                });
            }
        });
    });
}

function openCreateModalForSlot(hour, room) {
    // Réinitialise le formulaire pour une nouvelle entrée
    editForm.reset();
    editGroupsContainer.innerHTML = ''; // Vide les groupes précédents
    addGroupInput(); // Ajoute un champ de groupe par défaut

    // Change le titre du modal et vide l'ID pour indiquer une création
    editModal.querySelector('h2').textContent = 'Nouvelle Réservation (Laser Game)';
    editReservationId.value = ''; // Crucial pour distinguer la création de la mise à jour
    document.getElementById('edit-reservation-type').value = 'lg'; // Important

    // Affiche les options Laser Game, cache celles pour QK
    document.getElementById('edit-groups-container-wrapper').style.display = 'block';
    document.getElementById('edit-laser-game-type').style.display = 'block';
    document.getElementById('edit-laser-game-options').style.display = 'flex';
    document.getElementById('edit-qk-options').style.display = 'none';
    document.getElementById('edit-players-group').style.display = 'none';

    // Gère l'attribut 'required' pour éviter les erreurs de validation (min/value aussi remis à
    // plat, voir commentaire équivalent dans openEditModal)
    const editPlayersFieldLgCreate = document.getElementById('edit-players');
    editPlayersFieldLgCreate.required = false;
    editPlayersFieldLgCreate.min = 2;
    editPlayersFieldLgCreate.value = 2;

    // Pré-remplit les informations connues
    editReservationDate.value = formatDateForStorage(currentDate);
    document.querySelector(`input[name="edit-room"][value="${room}"]`).checked = true;
    // Génère les heures en masquant les créneaux indisponibles pour cette salle
    generateTimeOptions(currentDate, editStartTime, { type: 'lg', room: room, ignoreId: null });
    editStartTime.value = hour;

    // Définit des valeurs par défaut pour la durée et le type
    document.querySelector('input[name="edit-duration"][value="20"]').checked = true;
    document.querySelector('input[name="edit-booking-type"][value="none"]').checked = true;

    // Affiche le modal
    editModal.style.display = 'flex';
}

// Vérifie si un créneau est disponible pour Quiz/Karaoké
function isQkSlotAvailable(date, startTime, endTime, activity, reservationIdToIgnore = null) {
    // On vérifie d'abord les créneaux fermés manuellement (comme pour le Laser Game)
    for (let hour = startTime; hour < endTime; hour += TIME_SLOT_STEP) {
        const key = `${date}.${hour}.${activity}`;
        if (closedSlots[key]) {
            return false;
        }
    }

    const sameDayReservations = qkReservations.filter(res =>
        res.date === date && res.activity === activity && res.id !== reservationIdToIgnore
    );

    for (const res of sameDayReservations) {
        if (
            (startTime >= res.startTime && startTime < res.endTime) ||
            (endTime > res.startTime && endTime <= res.endTime) ||
            (startTime <= res.startTime && endTime >= res.endTime)
        ) {
            return false;
        }
    }
    return true;
}

// Affiche le calendrier pour Quiz/Karaoké pour une date donnée
function displayQkReservationsForDate(date) {
    const dateStr = formatDateForStorage(date);
    const quizReservations = qkReservations.filter(res => res.date === dateStr && res.activity === 'quiz');
    const karaokeReservations = qkReservations.filter(res => res.date === dateStr && res.activity === 'karaoke');

    displayActivityReservations(quizReservations, quizSlots, 'quiz');
    displayActivityReservations(karaokeReservations, karaokeSlots, 'karaoke');
}

function displayActivityReservations(reservations, container, activityName) {
    container.innerHTML = '';
    // MODIFIÉ : On utilise les fonctions dynamiques pour les heures d'ouverture et de fermeture
    const openingHour = getOpeningHourForDate(currentDate); 
    const closingHour = getClosingHourForDate(currentDate);

    for (let hour = openingHour; hour < 24; hour += TIME_SLOT_STEP) {
        addActivityTimeSlot(hour, reservations, container, activityName);
    }
    for (let hour = 0; hour < closingHour; hour += TIME_SLOT_STEP) {
        addActivityTimeSlot(hour, reservations, container, activityName);
    }
}

function addActivityTimeSlot(hour, reservations, container, activityName) {
    const reservation = reservations.find(res => res.startTime <= hour && res.endTime > hour);

    if (reservation) {
        if (reservation.startTime === hour) {
            const timeSlot = document.createElement('div');
            timeSlot.className = 'time-slot booked';
            timeSlot.dataset.time = hour;
            timeSlot.dataset.activity = activityName;
            timeSlot.dataset.reservationId = reservation.id;
            timeSlot.setAttribute('draggable', true);

            if (reservation.paid) {
                timeSlot.classList.add('paid');
            }

            const canMerge = reservation.duration > 30 && reservation.startTime % 1 === 0;
            if (canMerge) {
                timeSlot.style.gridColumn = 'span 2';
            }

            const timeSlotHeader = document.createElement('div');
            timeSlotHeader.className = 'time-slot-header';
            timeSlotHeader.textContent = formatTime(hour);
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'X';
            deleteBtn.title = 'Supprimer la réservation';
            deleteBtn.className = 'delete-btn';
            deleteBtn.onclick = () => deleteQkReservation(reservation.id);
            timeSlotHeader.appendChild(deleteBtn);
            timeSlot.appendChild(timeSlotHeader);

            if (reservation.source === 'crm') {
                timeSlot.classList.add('crm-synced');
                const crmBadge = document.createElement('span');
                crmBadge.className = 'crm-badge';
                crmBadge.title = 'Généré automatiquement depuis le CRM, pas une réservation manuelle';
                crmBadge.textContent = '🤖 CRM';
                timeSlotHeader.appendChild(crmBadge);
            }

            const infoDiv = document.createElement('div');
            infoDiv.className = 'time-slot-info';
            let infoHtml = `${reservation.clientName} - <b>${reservation.players}p</b> (${reservation.duration}min)`;
            if (reservation.phone) infoHtml += `<br>${reservation.phone}`;
            if (reservation.bookedBy) infoHtml += `<br><span style="font-size:0.8em; opacity:0.7;">✍️ ${reservation.bookedBy}</span>`;
            if (reservation.lastMovedBy) infoHtml += `<br><span style="font-size:0.8em; opacity:0.7;">🖐️ Déplacé par ${reservation.lastMovedBy}</span>`;
            if (reservation.depositStatus) {
                const depositIcon = reservation.depositPaid ? '✅' : '⏳';
                const amountValue = reservation.amountPaid != null ? reservation.amountPaid : reservation.amountTotal;
                const amount = amountValue != null ? ` — ${amountValue}€ encaissé` : '';
                infoHtml += `<br><span style="font-size:0.8em; opacity:0.8;">${depositIcon} ${reservation.depositStatus}${amount}</span>`;
            }
            const qkPrice = calculateQkPrice(reservation);
            if (qkPrice != null) {
                // On déduit l'acompte déjà encaissé (même montant que la ligne de dépôt ci-dessus)
                // pour afficher directement le reste à régler, avec le détail du calcul entre
                // parenthèses dès qu'un acompte est déduit (ex: "4×25€ - 25€").
                const qkAmountReceived = reservation.amountPaid != null ? reservation.amountPaid : (reservation.amountTotal != null ? reservation.amountTotal : 0);
                const qkRemaining = Math.max(0, qkPrice.total - qkAmountReceived);
                const qkDetail = qkAmountReceived > 0
                    ? ` (${qkPrice.players}×${qkPrice.unitPrice}€ - ${qkAmountReceived}€)`
                    : '';
                infoHtml += `<br><span style="font-size:0.85em; font-weight:bold; opacity:0.9;">💶 ${qkRemaining}€ à régler${qkDetail}</span>`;
            }
            infoDiv.innerHTML = infoHtml;
            timeSlot.appendChild(infoDiv);

            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'reservation-buttons';
            const leftButtons = document.createElement('div');
            leftButtons.className = 'left-buttons';
            const editBtn = document.createElement('button');
            editBtn.innerHTML = '✏️';
            editBtn.title = 'Modifier la réservation';
            editBtn.className = 'edit-btn';
            editBtn.onclick = () => openQkEditModal(reservation.id);
            const monteBtn = document.createElement('button');
            monteBtn.textContent = 'Monté';
            monteBtn.className = 'monte-btn';
            if (reservation.monte) monteBtn.classList.add('active');
            // MODIFIÉ : Ajout de la sauvegarde vers Firestore
            monteBtn.addEventListener('click', async function() {
                const newMonteState = !reservation.monte;
                
                // 1. Sauvegarde en base de données
                const docRef = doc(db, "qkReservations", reservation.id);
                try {
                    await setDoc(docRef, { monte: newMonteState }, { merge: true });
                } catch(e) {
                    console.error("Erreur mise à jour 'monté':", e);
                }

                // 2. Logique du chrono (Si on active "Monté")
                if (newMonteState) {
                    
                    // Détermination de la salle et du nom
                    let roomNum;
                    let roomNameBase;
                    
                    if (reservation.activity === 'quiz') {
                        roomNum = 4; // ID du compteur Quiz
                        roomNameBase = "🚨 QuizzBoxing 🚨";
                    } else {
                        roomNum = 3; // ID du compteur Karaoké
                        roomNameBase = "🎙️ Karaoké 🎙️";
                    }

                    // Calcul du temps réel (Même logique que le Laser : 20->18, 30->28)
                    let playTime = reservation.duration;
                    if (reservation.duration === 20) playTime = 18;
                    else if (reservation.duration === 30) playTime = 28;
                    
                    const confirmMessage = `Voulez-vous lancer le chrono de ${playTime} minutes pour ${reservation.clientName} (${reservation.activity}) ?`;

                    showCustomAlert(confirmMessage, 'confirm', () => {
                        // Titre avec le saut de ligne <br>
                        const customTitle = `${roomNameBase}<br><span style="font-size:0.8em; font-weight:normal;">${reservation.clientName} (${reservation.players}p)</span>`;
                        
                        // Lancement du chrono
                        setPresetTime(roomNum, playTime, customTitle);
                    });
                }
            });
            const paidContainer = document.createElement('div');
            paidContainer.className = 'paid-checkbox-container';
            const paidCheckbox = document.createElement('input');
            paidCheckbox.type = 'checkbox';
            paidCheckbox.id = `qk-paid-${reservation.id}`;
            paidCheckbox.checked = reservation.paid;
            // MODIFIÉ : Ajout de la sauvegarde vers Firestore
            paidCheckbox.addEventListener('change', async () => {
                const docRef = doc(db, "qkReservations", reservation.id);
                try {
                    await setDoc(docRef, { paid: paidCheckbox.checked }, { merge: true });
                } catch(e) {
                    console.error("Erreur mise à jour 'paid':", e);
                }
            });
            const paidLabel = document.createElement('label');
            paidLabel.htmlFor = `qk-paid-${reservation.id}`;
            paidLabel.textContent = 'Payé';
            paidContainer.appendChild(paidCheckbox);
            paidContainer.appendChild(paidLabel);
            leftButtons.appendChild(editBtn);
            leftButtons.appendChild(monteBtn);
            buttonsContainer.appendChild(leftButtons);
            buttonsContainer.appendChild(paidContainer);
            timeSlot.appendChild(buttonsContainer);

            container.appendChild(timeSlot);
        } else {
            const originalReservation = reservations.find(res => res.startTime < hour && res.endTime > hour);
            if (!originalReservation) return; // Sécurité
            
            const wasMerged = originalReservation.duration > 30 && originalReservation.startTime % 1 === 0;

            if (!wasMerged) {
                const timeSlot = document.createElement('div');
                timeSlot.className = 'time-slot booked';
                timeSlot.dataset.time = hour;
                timeSlot.dataset.activity = activityName;
                if (originalReservation.paid) {
                    timeSlot.classList.add('paid');
                }
                const timeSlotHeader = document.createElement('div');
                timeSlotHeader.className = 'time-slot-header';
                timeSlotHeader.textContent = formatTime(hour);
                timeSlot.appendChild(timeSlotHeader);

                const indicator = document.createElement('div');
                indicator.className = 'continuation-indicator';
                indicator.textContent = '↗️';
                timeSlot.appendChild(indicator);

                container.appendChild(timeSlot);
            }
        }
    } else {
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        timeSlot.dataset.time = hour;
        timeSlot.dataset.activity = activityName;

        const timeSlotHeader = document.createElement('div');
        timeSlotHeader.className = 'time-slot-header';
        timeSlotHeader.textContent = formatTime(hour);
        timeSlot.appendChild(timeSlotHeader);
        const now = new Date();
        let isAutomaticallyClosed = false;

        // === MODIFICATION : LOGIQUE DE FERMETURE AUTOMATIQUE DÉCALÉE (QK) ===
        const businessNow = new Date(now);
        if (now.getHours() < 2 || (now.getHours() === 2 && now.getMinutes() <= 10)) {
            businessNow.setDate(businessNow.getDate() - 1);
        }
        const businessToday = new Date(businessNow);
        businessToday.setHours(0, 0, 0, 0);

        const displayedDate = new Date(currentDate);
        displayedDate.setHours(0,0,0,0);

        if (displayedDate < businessToday) isAutomaticallyClosed = true;
        else if (isSameDay(displayedDate, businessNow)) {
            const slotDate = new Date(currentDate);
            if (hour < OPENING_HOUR) slotDate.setDate(slotDate.getDate() + 1);
            const slotTime = new Date(slotDate);
            slotTime.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
            const closingTime = new Date(slotTime.getTime() + SLOT_GRACE_MINUTES * 60000);
            if (now > closingTime) isAutomaticallyClosed = true;
        }
        if (isAutomaticallyClosed) {
            timeSlot.classList.add('auto-closed');
            const closedText = document.createElement('div');
            closedText.className = 'auto-closed-text';
            closedText.textContent = 'Passé';
            timeSlot.appendChild(closedText);
        } else {
            // J'ajoute l'événement 'e' pour empêcher l'ouverture du modal au clic sur la case
            timeSlot.addEventListener('click', (e) => {
                // Si on clique sur la case ou son conteneur, on ne fait rien
                if (e.target.classList.contains('closed-checkbox') || e.target.closest('.closed-checkbox-container')) {
                    return;
                }
                openQkCreateModalForSlot(hour, activityName)
            });

            // On crée et ajoute la case à cocher pour fermer le créneau
            const dateStr = formatDateForStorage(currentDate);

            const closedContainer = document.createElement('div');
            closedContainer.className = 'closed-checkbox-container';
            const closedCheckbox = document.createElement('input');
            closedCheckbox.type = 'checkbox';
            // L'ID est maintenant unique pour chaque activité (quiz/karaoke)
            closedCheckbox.id = `closed-${dateStr}-${hour}-${activityName}`;
            closedCheckbox.className = 'closed-checkbox';

            // La clé utilisée pour la base de données inclut aussi le nom de l'activité
            const key = `${dateStr}.${hour}.${activityName}`;
            if (closedSlots[key]) {
                closedCheckbox.checked = true;
                timeSlot.classList.add('closed');
            }

            closedCheckbox.addEventListener('change', function() {
                timeSlot.classList.toggle('closed', this.checked);
                // On utilise la fonction existante en lui passant le nom de l'activité
                updateClosedSlots(hour, activityName, this.checked, dateStr);
            });
            const closedLabel = document.createElement('label');
            closedLabel.htmlFor = closedCheckbox.id;
            closedLabel.textContent = 'Fermé';
            closedContainer.appendChild(closedCheckbox);
            closedContainer.appendChild(closedLabel);
            timeSlot.appendChild(closedContainer);
        }
        container.appendChild(timeSlot);
    }
}

// Met à jour l'affichage de la date pour le calendrier QK
function updateQkDateDisplay() {
    qkCurrentDateDisplay.textContent = formatDateForDisplay(currentDate);
}

async function deleteQkReservation(id) {
    showCustomAlert('Voulez-vous vraiment supprimer cette réservation ?', 'confirm', async () => {
        try {
            // On supprime le document correspondant à l'ID dans la collection Firestore
            await deleteDoc(doc(db, "qkReservations", id));
            // Le rafraîchissement de l'affichage est automatique grâce à onSnapshot.
        } catch (error) {
            console.error("Erreur lors de la suppression de la réservation QK :", error);
            showCustomAlert("La suppression a échoué.");
        }
    });
}

function openQkCreateModalForSlot(hour, activity) {
    // Réinitialise le formulaire
    editForm.reset();
    editModal.querySelector('h2').textContent = 'Nouvelle Réservation (Quiz/Karaoké)';

    // Vide les champs spécifiques au Laser Game
    document.getElementById('edit-groups-container-wrapper').style.display = 'none';
    document.getElementById('edit-laser-game-type').style.display = 'none';
    document.getElementById('edit-laser-game-options').style.display = 'none';

    // Affiche les champs pour QK
    document.getElementById('edit-qk-options').style.display = 'flex';
    document.getElementById('edit-players-group').style.display = 'block';

    // Gère l'attribut 'required' pour éviter les erreurs de validation
    document.getElementById('edit-players').required = true;

    // Indique qu'on crée une réservation de type 'qk'
    document.getElementById('edit-reservation-type').value = 'qk';
    document.getElementById('edit-reservation-id').value = ''; // Important: vide l'ID

    // Pré-remplit les valeurs
    document.getElementById('edit-reservation-date').value = formatDateForStorage(currentDate);
    document.querySelector(`input[name="edit-activity"][value="${activity}"]`).checked = true;
    // Génère les heures en masquant les créneaux indisponibles pour cette activité
    generateTimeOptions(currentDate, document.getElementById('edit-start-time'), { type: 'qk', activity: activity, ignoreId: null });
    document.getElementById('edit-start-time').value = hour;
    document.querySelector('input[name="edit-qk-duration"][value="60"]').checked = true;
    
    const playersInput = document.getElementById('edit-players');
    if (activity === 'quiz') {
        playersInput.min = 4;
        playersInput.value = 4;
    } else { // karaoke
        playersInput.min = 2;
        playersInput.value = 2;
    }

    editModal.style.display = 'flex';
}

function openQkEditModal(reservationId) {
    
    const reservation = qkReservations.find(res => res.id === reservationId);
    if (!reservation) return;

    editForm.reset();
    editModal.querySelector('h2').textContent = 'Modifier la Réservation (Quiz/Karaoké)';

    // Cache les options Laser Game et affiche celles pour QK
    document.getElementById('edit-groups-container-wrapper').style.display = 'none';
    document.getElementById('edit-laser-game-type').style.display = 'none';
    document.getElementById('edit-laser-game-options').style.display = 'none';
    document.getElementById('edit-qk-options').style.display = 'flex';
    document.getElementById('edit-players-group').style.display = 'block';

    // Gère l'attribut 'required' pour éviter les erreurs de validation
    document.getElementById('edit-players').required = true;

    // Remplit le formulaire avec les données de la réservation
    document.getElementById('edit-reservation-id').value = reservation.id;
    document.getElementById('edit-reservation-type').value = 'qk'; // Type QK
    document.getElementById('edit-client-name').value = reservation.clientName;
    document.getElementById('edit-client-phone').value = reservation.phone;
    document.getElementById('edit-booked-by').value = reservation.bookedBy || '';
    document.getElementById('edit-reservation-date').value = reservation.date;
    
    // Limites posées AVANT la valeur, et valeur bornée dessus : une fiche ancienne avec un nombre
    // de joueurs sous le minimum de l'activité ne doit jamais recréer un champ invalide.
    const editPlayersInput = document.getElementById('edit-players');
    if (reservation.activity === 'quiz') {
        editPlayersInput.min = 4;
        editPlayersInput.max = 12;
    } else { // Karaoké
        editPlayersInput.min = 2;
        editPlayersInput.max = 10;
    }
    editPlayersInput.value = Math.min(Math.max(reservation.players, editPlayersInput.min), editPlayersInput.max);
    const resDate = new Date(reservation.date.replace(/-/g, '/'));
    document.querySelector(`input[name="edit-activity"][value="${reservation.activity}"]`).checked = true;
    document.querySelector(`input[name="edit-qk-duration"][value="${reservation.duration}"]`).checked = true;
    // On masque les créneaux indisponibles, en ignorant la réservation en cours d'édition
    generateTimeOptions(resDate, document.getElementById('edit-start-time'), { type: 'qk', activity: reservation.activity, ignoreId: reservation.id, forceHour: reservation.startTime });
    document.getElementById('edit-start-time').value = reservation.startTime;

    editModal.style.display = 'flex';
}

function setupStickyHeader() {
    const toggleContainer = document.querySelector('.view-toggle-container');
    const placeholder = document.querySelector('.sticky-placeholder');

    // On récupère la position originale des boutons
    const offsetTop = toggleContainer.offsetTop;

    // On s'assure que le placeholder a la même hauteur que la barre de boutons
    placeholder.style.height = `${toggleContainer.offsetHeight}px`;

    window.addEventListener('scroll', () => {
        if (window.pageYOffset > offsetTop) {
            toggleContainer.classList.add('sticky');
            placeholder.classList.add('active');
        } else {
            toggleContainer.classList.remove('sticky');
            placeholder.classList.remove('active');
        }
    });
}

// --- LOGIQUE STICKY COMPLÈTE ET CORRIGÉE POUR TOUTES LES VUES ---

// Global map pour stocker les infos de chaque chrono sticky

function setupCountersSticky() {
    // Désactivé sur mobile
    if (window.matchMedia("(max-width: 768px)").matches) return;

    const counterDisplays = document.querySelectorAll('.counters-containerDisplay');

    counterDisplays.forEach(counterDisplay => {
        const placeholder = counterDisplay.nextElementSibling;
        if (!placeholder || !placeholder.classList.contains('counters-sticky-placeholder')) return;
        
        // CORRECTION ICI : On cible les vrais IDs de tes conteneurs au lieu d'une classe .view
        const parentView = counterDisplay.closest('#laser-game-view, #quiz-karaoke-view, #birthdays-view');
        if (!parentView) return;

        let offsetTop = null;
        // On calcule l'offset initial uniquement si la vue est visible au chargement
        if (parentView.style.display !== 'none') {
            offsetTop = counterDisplay.offsetTop;
            placeholder.style.height = `${counterDisplay.offsetHeight}px`;
        }

        // On enregistre les données pour chaque chrono
        stickyCountersData.set(counterDisplay, {
            placeholder: placeholder,
            offsetTop: offsetTop,
            parentView: parentView
        });
    });

    // Un seul écouteur de scroll global pour toutes les vues
    window.addEventListener('scroll', handleGlobalScrollSticky);
}

// Fonction qui gère le sticky au scroll pour tous les éléments enregistrés
function handleGlobalScrollSticky() {
    if (window.matchMedia("(max-width: 768px)").matches) return;

    stickyCountersData.forEach((data, counterDisplay) => {
        const { placeholder, offsetTop, parentView } = data;

        // Si la vue parente est masquée, on retire le sticky si il était activé
        if (parentView.style.display === 'none') {
            counterDisplay.classList.remove('sticky');
            placeholder.classList.remove('active');
            return; 
        }

        // Si l'offsetTop n'est pas encore calculé (vue masquée au chargement), on ne fait rien
        if (offsetTop === null) return;

        // Logique sticky classique
        if (window.pageYOffset > offsetTop) {
            counterDisplay.classList.add('sticky');
            placeholder.classList.add('active');
        } else {
            counterDisplay.classList.remove('sticky');
            placeholder.classList.remove('active');
        }
    });
}

// NOUVELLE FONCTION à appeler après avoir rendu une vue visible
function recalculateStickyOffsets() {
    // requestAnimationFrame assure que l'UI est bien mise à jour avant le calcul
    requestAnimationFrame(() => {
        stickyCountersData.forEach((data, counterDisplay) => {
            const { parentView } = data;
            // Si la vue est visible ET que l'offsetTop n'a jamais été calculé
            if (parentView.style.display !== 'none' && data.offsetTop === null) {
                // On calcule l'offsetTop précis maintenant que l'élément est rendu
                data.offsetTop = counterDisplay.offsetTop;
                data.placeholder.style.height = `${counterDisplay.offsetHeight}px`;
                // On retire tout état sticky existant pour éviter les sauts
                counterDisplay.classList.remove('sticky');
                data.placeholder.classList.remove('active');
            }
        });
        // On force une vérification du sticky immédiatement après le recalcul
        handleGlobalScrollSticky(); 
    });
}

async function displayUsersInModal() {
    const userListContainer = document.getElementById('user-list-container');
    userListContainer.innerHTML = 'Chargement...';

    try {
        const usersCollection = collection(db, 'users');
        const userSnapshot = await getDocs(usersCollection);
        
        userListContainer.innerHTML = '';

        userSnapshot.forEach(userDoc => {
            const userData = userDoc.data();
            const userId = userDoc.id;

            const userRow = document.createElement('div');
            userRow.className = 'user-row';

            const userInfo = document.createElement('div');
            userInfo.className = 'user-info';
            userInfo.innerHTML = `${userData.displayName || 'Nom inconnu'} <span>${userData.email}</span>`;

            // Conteneur pour les contrôles (select + bouton)
            const userControls = document.createElement('div');
            userControls.style.display = 'flex';
            userControls.style.alignItems = 'center';

            const roleSelect = document.createElement('select');
            roleSelect.className = 'user-role-select';
            roleSelect.dataset.userid = userId;

            const roles = ['admin', 'moderator', 'viewer'];
            roles.forEach(role => {
                const option = document.createElement('option');
                option.value = role;
                option.textContent = role.charAt(0).toUpperCase() + role.slice(1);
                if (userData.role === role) {
                    option.selected = true;
                }
                roleSelect.appendChild(option);
            });

            roleSelect.addEventListener('change', async (e) => {
                const newRole = e.target.value;
                const userIdToUpdate = e.target.dataset.userid;
                await updateUserRole(userIdToUpdate, newRole);
            });
            
            // NOUVEAU : Création du bouton de suppression
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Supprimer';
            deleteBtn.className = 'user-delete-btn';
            deleteBtn.dataset.userid = userId;
            deleteBtn.dataset.useremail = userData.email; // On stocke l'email pour le message de confirmation

            // NOUVEAU : Événement au clic sur le bouton supprimer
            deleteBtn.addEventListener('click', (e) => {
                const userIdToDelete = e.target.dataset.userid;
                const userEmail = e.target.dataset.useremail;
                deleteUser(userIdToDelete, userEmail);
            });

            userControls.appendChild(roleSelect);
            userControls.appendChild(deleteBtn); // On ajoute le bouton

            userRow.appendChild(userInfo);
            userRow.appendChild(userControls); // On ajoute le conteneur de contrôles
            userListContainer.appendChild(userRow);
        });

    } catch (error) {
        console.error("Erreur lors de la récupération des utilisateurs:", error);
        userListContainer.innerHTML = 'Erreur lors du chargement des utilisateurs.';
    }
}

function deleteUser(userId, userEmail) {
    // On vérifie que l'admin ne se supprime pas lui-même
    if (currentUser && userId === currentUser.uid) {
        showCustomAlert("Vous ne pouvez pas supprimer votre propre compte administrateur.");
        return;
    }

    const message = `Voulez-vous vraiment supprimer l'utilisateur "${userEmail}" ? Cette action est irréversible.`;
    
    showCustomAlert(message, 'confirm', async () => {
        try {
            // On supprime le document de l'utilisateur dans la collection "users"
            await deleteDoc(doc(db, "users", userId));
            showCustomAlert("Utilisateur supprimé avec succès.");
            displayUsersInModal(); // On rafraîchit la liste
        } catch (error) {
            console.error("Erreur lors de la suppression de l'utilisateur :", error);
            showCustomAlert("La suppression a échoué.");
        }
    });
}

/**
 * Met à jour le rôle d'un utilisateur dans Firestore.
 * @param {string} userId - L'ID de l'utilisateur à mettre à jour.
 * @param {string} newRole - Le nouveau rôle à assigner.
 */
async function updateUserRole(userId, newRole) {
    try {
        const userDocRef = doc(db, 'users', userId);
        await setDoc(userDocRef, { role: newRole }, { merge: true });
        showCustomAlert(`Rôle mis à jour avec succès pour ${newRole}.`);
    } catch (error) {
        console.error("Erreur lors de la mise à jour du rôle:", error);
        showCustomAlert("La mise à jour du rôle a échoué.");
    }
}

    // ==========================================
    // === LOGIQUE ANNIVERSAIRES DU JOUR V3 ===
    // ==========================================

    const birthdayForm = document.getElementById('birthday-form');
    // --- GESTION REPLI/DÉPLI DU FORMULAIRE ANNIV ---
    const toggleFormBtn = document.getElementById('toggle-bd-form-btn');
    const formContainer = document.querySelector('.birthday-form-container');

    if (toggleFormBtn && formContainer) {
        toggleFormBtn.addEventListener('click', () => {
            // On ajoute/enlève la classe qui cache le form en CSS
            formContainer.classList.toggle('collapsed');
        });
    }
    const bdTimeSelect = document.getElementById('bd-time');
    const birthdaysGrid = document.getElementById('birthdays-grid');

    // Configuration des formules (Durées en minutes et nb boissons)
    const FORMULAS_CONFIG = {
        'bowling_enfant': { label: '🎳 Bowling Enfant 👶', drinksCount: 1, activities: [{type: 'bowling', duration: 50}] },
        'bowling_jeune':  { label: '🎳 Bowling Jeune 🎳',  drinksCount: 2, activities: [{type: 'bowling', duration: 80}] },
        'bowling_laser':  { label: '🎳 Bowling + Laser 🔫', drinksCount: 2, activities: [{type: 'laser', duration: 20}, {type: 'bowling', duration: 50}] },
        'laser_jeune':    { label: '🔫 Laser Jeune 🔫', drinksCount: 2, activities: [{type: 'laser', duration: 20, id: 'L1'}, {type: 'laser', duration: 20, id: 'L2'}] },
        'quiz':           { label: '🚨 Quiz Boxing 🥊', drinksCount: 1, activities: [{type: 'quiz', duration: 60}] }
    };

    // 1. Initialiser les heures
    function initBirthdayTimes() {
        if(!bdTimeSelect) return;
        bdTimeSelect.innerHTML = '';
        for (let h = 13; h <= 17; h++) {
            ['00', '30'].forEach(min => {
                if (h === 17 && min === '30') return;
                const opt = document.createElement('option');
                opt.value = `${h}h${min}`;
                opt.textContent = `${h}h${min}`;
                bdTimeSelect.appendChild(opt);
            });
        }
    }
    initBirthdayTimes();

    // Date par défaut = aujourd'hui, modifiable pour noter à la main une résa prise 1-2 semaines à
    // l'avance (sans passer par le CRM) — compte quand même pour la capacité du jour choisi.
    const bdDateInput = document.getElementById('bd-date');
    if (bdDateInput && !bdDateInput.value) bdDateInput.value = formatDateForStorage(new Date());

    // Construit le document "dailyBirthdays" (timers + checklist selon la formule) — utilisé par
    // le formulaire manuel ET par l'auto-génération depuis le CRM, pour ne pas dupliquer la logique.
    function buildBirthdayData({ name, age, count, time, cake, champomy, formulaKey, noDeposit, date, extra = {} }) {
        const config = FORMULAS_CONFIG[formulaKey] || FORMULAS_CONFIG['bowling_enfant'];
        const champomyCount = parseInt(champomy) || 0;

        const timersState = {};
        config.activities.forEach((act, index) => {
            const key = `${act.type}_${index}`;

            let activityLabel = 'Bowling';
            if (act.type === 'laser') {
                activityLabel = act.id ? `Laser ${act.id}` : 'Laser';
            } else if (act.type === 'quiz') {
                activityLabel = 'Quiz';
            }

            timersState[key] = {
                type: act.type,
                duration: act.duration,
                endTime: null,
                room: null,
                label: activityLabel
            };
        });

        const initialChecklist = { cake: false, cakeBetweenGames: false, ticketPrinted: false };
        for (let i = 1; i <= config.drinksCount; i++) {
            initialChecklist[`drink${i}`] = false;
        }
        if (champomyCount > 0) {
            for (let i = 1; i <= champomyCount; i++) {
                initialChecklist[`champomy_${i}`] = false;
            }
        }

        return {
            name,
            age: String(age),
            count: String(count),
            time,
            cake,
            champomy: champomyCount,
            formulaKey,
            formulaLabel: config.label,
            timers: timersState,
            checklist: initialChecklist,
            noDeposit: !!noDeposit,
            date,
            createdAt: Date.now(),
            ...extra
        };
    }

    // 2. Sauvegarder un anniversaire
    if(birthdayForm) {
        birthdayForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const checkAge = parseInt(document.getElementById('bd-age').value);
            const checkCount = parseInt(document.getElementById('bd-count').value);

            if (checkAge < 0 || checkAge > 16) {
                showCustomAlert("L'âge doit être compris entre 0 et 16 ans.");
                return;
            }
            if (checkCount < 4 || checkCount > 16) {
                showCustomAlert("Le nombre d'enfants doit être compris entre 4 et 16.");
                return;
            }

            const data = buildBirthdayData({
                name: document.getElementById('bd-name').value,
                age: document.getElementById('bd-age').value,
                count: document.getElementById('bd-count').value,
                time: document.getElementById('bd-time').value,
                cake: document.getElementById('bd-cake').value,
                champomy: document.getElementById('bd-champomy').value,
                formulaKey: document.getElementById('bd-formula').value,
                noDeposit: document.getElementById('bd-no-deposit') ? document.getElementById('bd-no-deposit').checked : false,
                date: document.getElementById('bd-date').value || formatDateForStorage(new Date())
            });

            try {
                await addDoc(collection(db, "dailyBirthdays"), data);
                birthdayForm.reset();
                if (bdDateInput) bdDateInput.value = formatDateForStorage(new Date()); // reset() vide le champ date
                showCustomAlert("Fiche anniversaire créée !");
                if (data.formulaKey !== 'quiz') checkAnniversaireCapacityNow(data.date);
            } catch (error) {
                console.error("Erreur créa anniv:", error);
                showCustomAlert("Erreur lors de la création.");
            }
        });
    }

    // 3. Auto-génération des fiches anniversaire depuis le CRM (crmSyncPreview) sur une période donnée
    // (startDateStr/endDateStr: "YYYY-MM-DD", bornes incluses)
    async function autoGenerateBirthdayFichesFromCrm(startDateStr, endDateStr) {
        const previewSnap = await getDocs(query(collection(db, "crmSyncPreview"), where("activity", "==", "anniversaire")));
        const events = previewSnap.docs
            .map(d => d.data())
            .filter(e => {
                const dateStr = `${e.y}-${String(e.m).padStart(2, '0')}-${String(e.d).padStart(2, '0')}`;
                return dateStr >= startDateStr && dateStr <= endDateStr;
            });

        // "Déjà une fiche pour cette commande ?" est indépendant par événement -> vérifié en
        // parallèle pour tout le monde d'un coup plutôt qu'un aller-retour Firestore par résa.
        const dedupeChecks = await Promise.all(
            events.map(event =>
                Promise.all([
                    getDocs(query(collection(db, "dailyBirthdays"), where("crmOrderId", "==", String(event.order_id)))),
                    getDoc(doc(db, "crmDismissedBirthdays", String(event.order_id)))
                ]).then(([snap, dismissedSnap]) => ({ event, alreadyExists: !snap.empty, dismissed: dismissedSnap.exists() }))
            )
        );

        let created = 0, skipped = 0, dismissed = 0, failed = 0;
        for (const { event, alreadyExists, dismissed: wasDismissed } of dedupeChecks) {
            const orderId = String(event.order_id);
            if (alreadyExists) { skipped++; continue; }
            // La fiche a été supprimée manuellement par le staff (no-show, doublon...) -- on ne la
            // recrée pas juste parce qu'elle n'existe plus, sinon elle "ressuscite" à chaque nouveau
            // scan CRM tant que la commande reste dans crmSyncPreview.
            if (wasDismissed) { dismissed++; continue; }

            const dateStr = `${event.y}-${String(event.m).padStart(2, '0')}-${String(event.d).padStart(2, '0')}`;
            const minutes = (event.i || 0) >= 15 ? 30 : 0; // arrondi à la demi-heure (grille du site)
            const time = `${event.h}h${minutes === 30 ? '30' : '00'}`;
            const age = Math.min(16, Math.max(0, event.childAge != null ? event.childAge : 6));
            // NOUVEAU : nombre d'enfants lu de façon robuste (nbr_participants, sinon le "(13pers)" du
            // titre CRM) et plus plafonné à 16. S'il reste introuvable, 4 par défaut MAIS la fiche est
            // marquée "à vérifier" (badge ⚠️) au lieu d'afficher un nombre faux sans prévenir.
            const crmCount = getCrmBirthdayFicheCount(event);
            const count = crmCount !== null ? crmCount : 4;
            // NOUVEAU : vrai acompte encaissé sur le CRM (ex: 14€) au lieu des 50€ supposés.
            const deposit = resolveCrmBirthdayDeposit(event);
            const formulaKey = FORMULAS_CONFIG[event.birthdayFormulaKey] ? event.birthdayFormulaKey : 'bowling_enfant';
            // Le CRM se trompe parfois largement sur le nb de champomy (ex: 6 alors que personne n'en
            // prend) -> on plafonne à 2 par défaut, ajustable ensuite via le stepper sur la fiche.
            const champomy = Math.min(2, event.champomyCount || 0);

            const data = buildBirthdayData({
                name: event.childFirstName || event.user || 'Enfant',
                age,
                count,
                time,
                cake: event.cake || 'chocolat',
                champomy,
                formulaKey,
                // Sans acompte = rien d'encaissé : vrai montant CRM s'il est connu, sinon statut CRM
                // (event.depositPaid, voir depositInfo() côté sync).
                noDeposit: deposit.amount === 0,
                date: dateStr,
                extra: {
                    source: 'crm',
                    crmOrderId: orderId,
                    // Montant réellement encaissé, seulement s'il a été relevé sur la fiche commande CRM
                    // (sinon la fiche garde l'ancien calcul, et refreshCrmBirthdayFichesFromPreview le
                    // complétera dès que le sync l'aura relevé).
                    ...(deposit.known ? { depositAmount: deposit.amount } : {}),
                    ...(crmCount === null ? { countToCheck: true } : {})
                }
            });

            try {
                await addDoc(collection(db, "dailyBirthdays"), data);
                created++;
            } catch (error) {
                console.error('Erreur auto-génération fiche', orderId, error);
                failed++;
            }
        }

        showCustomAlert(`${created} fiche(s) créée(s), ${skipped} déjà existante(s)${dismissed ? `, ${dismissed} ignorée(s) (supprimée(s) précédemment)` : ''}${failed ? `, ${failed} échec(s)` : ''}.`);
    }

    const autoGenerateBdBtn = document.getElementById('auto-generate-bd-btn');
    const autoGenerateStartInput = document.getElementById('auto-generate-start');
    const autoGenerateEndInput = document.getElementById('auto-generate-end');
    if (autoGenerateBdBtn && autoGenerateStartInput && autoGenerateEndInput) {
        const todayStr = formatDateForStorage(new Date());
        autoGenerateStartInput.value = todayStr;
        autoGenerateEndInput.value = todayStr;
        autoGenerateBdBtn.addEventListener('click', () => {
            const start = autoGenerateStartInput.value;
            const end = autoGenerateEndInput.value;
            if (!start || !end) {
                showCustomAlert("Choisis une date de début et de fin.");
                return;
            }
            showCustomAlert(`Générer les fiches anniversaire CRM du ${start} au ${end} ?`, 'confirm', async () => {
                await autoGenerateBirthdayFichesFromCrm(start, end);
                // La grille live (onSnapshot) met un instant à recevoir les nouveaux docs -> petit délai
                // avant de sauter/scroller sur le 1er jour généré.
                setTimeout(() => jumpBdFilterToDate(start), 700);
            });
        });
    }

    // Ajuste le nb de champomy d'une fiche (le CRM se trompe parfois) -> bouton +/- sous chaque carte.
    async function adjustBdChampomy(bdId, currentChampomy, currentChecklist, delta) {
        const newCount = Math.max(0, (currentChampomy || 0) + delta);
        const newChecklist = { ...(currentChecklist || {}) };
        if (delta > 0) {
            newChecklist[`champomy_${newCount}`] = false;
        } else if (delta < 0 && currentChampomy > 0) {
            delete newChecklist[`champomy_${currentChampomy}`];
        }
        try {
            await setDoc(doc(db, "dailyBirthdays", bdId), { champomy: newCount, checklist: newChecklist }, { merge: true });
        } catch (error) {
            console.error('Erreur ajustement champomy:', error);
        }
    }

    // "Fiches par date" — pas une vue à part: scrolle vers le séparateur de date correspondant
    // dans la grille live (déjà triée + séparée par date), pas de requête/listener en plus.
    let bdFilterDate = new Date();
    const bdPrevDayBtn = document.getElementById('bd-prev-day');
    const bdNextDayBtn = document.getElementById('bd-next-day');
    const bdTodayBtn = document.getElementById('bd-today-btn');
    const bdCurrentDateSpan = document.getElementById('bd-current-date');
    const bdCalendarInput = document.getElementById('bd-calendar-input');

    function updateBdFilterDisplay() {
        if (bdCurrentDateSpan) bdCurrentDateSpan.textContent = formatDateForDisplay(bdFilterDate);
        if (bdCalendarInput) bdCalendarInput.value = formatDateForStorage(bdFilterDate);
    }

    function scrollToBdFilterDate() {
        const dateStr = formatDateForStorage(bdFilterDate);
        const target = document.querySelector(`.bd-date-separator[data-date="${dateStr}"]`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            showToast('Aucune fiche pour cette date', 'info');
        }
    }

    function jumpBdFilterToDate(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        bdFilterDate = new Date(y, m - 1, d);
        updateBdFilterDisplay();
        scrollToBdFilterDate();
    }

    if (bdPrevDayBtn) {
        bdPrevDayBtn.addEventListener('click', () => {
            bdFilterDate.setDate(bdFilterDate.getDate() - 1);
            updateBdFilterDisplay();
            scrollToBdFilterDate();
        });
    }
    if (bdNextDayBtn) {
        bdNextDayBtn.addEventListener('click', () => {
            bdFilterDate.setDate(bdFilterDate.getDate() + 1);
            updateBdFilterDisplay();
            scrollToBdFilterDate();
        });
    }
    if (bdTodayBtn) {
        bdTodayBtn.addEventListener('click', () => {
            bdFilterDate = new Date();
            updateBdFilterDisplay();
            scrollToBdFilterDate();
        });
    }
    if (bdCalendarInput) {
        updateBdFilterDisplay();
        bdCalendarInput.addEventListener('change', (e) => {
            if (!e.target.value) return;
            const parts = e.target.value.split('-');
            bdFilterDate = new Date(parts[0], parts[1] - 1, parts[2]);
            updateBdFilterDisplay();
            scrollToBdFilterDate();
        });
    }

    // Bouton "Supprimer tous les anniversaires" (à côté de "Fiches par date") : purge complète,
    // peu importe l'état (fait ou pas). currentBirthdaysList est déjà la collection entière
    // (tenue à jour par le onSnapshot dailyBirthdays, sans filtre de date).
    const deleteAllBirthdaysBtn = document.getElementById('delete-all-birthdays-btn');
    if (deleteAllBirthdaysBtn) {
        deleteAllBirthdaysBtn.addEventListener('click', () => {
            if (currentBirthdaysList.length === 0) return showCustomAlert("Aucune fiche anniversaire à supprimer.");

            const message = `Supprimer TOUTES les fiches anniversaire (${currentBirthdaysList.length}) ?\n\nCette action est définitive.`;
            showCustomAlert(message, 'confirm', async () => {
                try {
                    // Firestore limite un batch à 500 opérations : on découpe par sécurité.
                    for (let i = 0; i < currentBirthdaysList.length; i += 450) {
                        const batch = writeBatch(db);
                        currentBirthdaysList.slice(i, i + 450).forEach(bd => {
                            batch.delete(doc(db, "dailyBirthdays", bd.id));
                        });
                        await batch.commit();
                    }
                    showCustomAlert("Toutes les fiches anniversaire ont été supprimées !");
                } catch (e) {
                    console.error("Erreur suppression totale anniversaires", e);
                    showCustomAlert("Erreur lors de la suppression.");
                }
            });
        });
    }

// ==========================================
    // === GESTION OPTIMISÉE DES ANNIVERSAIRES ===
    // ==========================================

    // 1. Fonction Debounce (pour ne pas sauvegarder à chaque lettre)
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    // Création de la fonction de sauvegarde différée (1.5 secondes)
    const saveNoteDebounced = debounce(async (id, text) => {
        try {
            await updateDoc(doc(db, "dailyBirthdays", id), { notes: text });
            // Optionnel : petit log ou indicateur visuel discret que c'est sauvegardé
            // console.log("Note sauvegardée"); 
        } catch (e) {
            console.error("Erreur sauvegarde note", e);
        }
    }, 1500);
    
    const printBdBtn = document.getElementById('print-bd-btn');
    if (printBdBtn) {
        printBdBtn.addEventListener('click', () => {
            if (currentBirthdaysList.length === 0) {
                showCustomAlert("Aucun anniversaire à imprimer pour aujourd'hui.");
                return;
            }
            printBirthdaySheets(currentBirthdaysList);
        });
    }

    // Liste "paniers de bonbons" : juste prénom + nb d'enfants par anniversaire d'une date choisie,
    // pour préparer les paniers sans avoir besoin des fiches complètes.
    // NOUVEAU : lecture seule -- combine les fiches déjà créées avec les résas CRM prévues ce
    // jour-là mais pas encore transformées en fiche (crmSyncPreview), SANS jamais créer de vraie
    // fiche dailyBirthdays. Objectif : consulter la liste des bonbons en avance sans se retrouver
    // avec plein de fiches à l'écran (et le souci de sécurité si on doit ensuite les supprimer).
    async function runPrintCandyList(dateStr) {
        const finalDateStr = dateStr || formatDateForStorage(new Date());

        // 1. Fiches déjà existantes ce jour-là (créées manuellement ou via un "Générer depuis CRM").
        const existingSnap = await getDocs(query(collection(db, "dailyBirthdays"), where("date", "==", finalDateStr)));
        const dayBirthdays = [];
        const existingOrderIds = new Set();
        existingSnap.forEach(d => {
            const data = d.data();
            dayBirthdays.push({ name: data.name, count: data.count, time: data.time });
            if (data.crmOrderId) existingOrderIds.add(String(data.crmOrderId));
        });

        // 2. Résas CRM prévues ce jour-là mais pas encore une fiche -- juste pour l'affichage/impression,
        //    sans jamais écrire dans dailyBirthdays. On respecte aussi crmDismissedBirthdays : une résa
        //    délibérément supprimée (no-show...) ne doit pas réapparaître dans le comptage des bonbons.
        const previewSnap = await getDocs(query(collection(db, "crmSyncPreview"), where("activity", "==", "anniversaire")));
        const pendingEvents = previewSnap.docs
            .map(d => d.data())
            .filter(e => `${e.y}-${String(e.m).padStart(2, '0')}-${String(e.d).padStart(2, '0')}` === finalDateStr)
            .filter(e => !existingOrderIds.has(String(e.order_id)));

        const dismissedChecks = await Promise.all(
            pendingEvents.map(e =>
                getDoc(doc(db, "crmDismissedBirthdays", String(e.order_id))).then(snap => ({ e, dismissed: snap.exists() }))
            )
        );
        dismissedChecks
            .filter(({ dismissed }) => !dismissed)
            .forEach(({ e }) => {
                const minutes = (e.i || 0) >= 15 ? 30 : 0; // arrondi à la demi-heure (grille du site)
                const crmCount = getCrmBirthdayFicheCount(e); // même lecture robuste que les fiches
                dayBirthdays.push({
                    name: e.childFirstName || e.user || 'Enfant',
                    count: crmCount !== null ? crmCount : 4,
                    time: `${e.h}h${minutes === 30 ? '30' : '00'}`
                });
            });

        if (dayBirthdays.length === 0) {
            showCustomAlert("Aucun anniversaire ce jour-là.");
            return;
        }
        printCandyList(finalDateStr, dayBirthdays);
    }

    const candyListDateInput = document.getElementById('candy-list-date');
    const printCandyListBtn = document.getElementById('print-candy-list-btn');
    if (candyListDateInput && !candyListDateInput.value) {
        candyListDateInput.value = formatDateForStorage(new Date());
    }
    if (printCandyListBtn) {
        printCandyListBtn.addEventListener('click', () => runPrintCandyList(candyListDateInput.value));
    }

    // NOUVEAU : même bouton "Liste paniers", dupliqué dans la modale anniversaires mobile (menu
    // ☰ > 🎂 Liste Anniversaires) pour consulter/imprimer les paniers de bonbons depuis un iPhone.
    const mobileCandyListDateInput = document.getElementById('mobile-candy-list-date');
    const mobilePrintCandyListBtn = document.getElementById('mobile-print-candy-list-btn');
    if (mobileCandyListDateInput && !mobileCandyListDateInput.value) {
        mobileCandyListDateInput.value = formatDateForStorage(new Date());
    }
    if (mobilePrintCandyListBtn) {
        mobilePrintCandyListBtn.addEventListener('click', () => runPrintCandyList(mobileCandyListDateInput.value));
    }


    // Fenêtre glissante (J-7 à J+30) au lieu de tout l'historique: la collection ne fait que grossir
    // (fiches CRM générées jusqu'à 21j à l'avance, jamais nettoyées), donc sans filtre de date CET
    // écouteur relisait TOUTES les fiches jamais créées à chaque device connecté et à chaque
    // modification -> gros poste de lectures Firestore qui grimpe chaque jour.
    const birthdaysWindowStart = formatDateForStorage(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const birthdaysWindowEnd = formatDateForStorage(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    const unsubBirthdays = onSnapshot(
        query(
            collection(db, "dailyBirthdays"),
            where("date", ">=", birthdaysWindowStart),
            where("date", "<=", birthdaysWindowEnd)
        ),
        (snapshot) => {
            if(!birthdaysGrid) return;

            // --- 1. SAUVEGARDE DE L'ÉTAT AVANT RAFRAÎCHISSEMENT ---
            const openStates = { prices: new Set(), notes: new Set() };
            
            // On sauvegarde quels panneaux sont ouverts
            document.querySelectorAll('.price-details').forEach(el => {
                if (el.style.display === 'block') openStates.prices.add(el.dataset.id);
            });
            document.querySelectorAll('.notes-area').forEach(el => {
                if (el.style.display === 'block') openStates.notes.add(el.dataset.id);
            });

            // GESTION DU FOCUS ET DU TEXTE EN COURS DE FRAPPE
            const activeEl = document.activeElement;
            let focusedElementId = null;
            let focusedElementCursorPos = 0;
            let currentTypingValue = null;

            if (activeEl && activeEl.classList.contains('notes-area')) {
                focusedElementId = activeEl.dataset.id;
                focusedElementCursorPos = activeEl.selectionStart;
                currentTypingValue = activeEl.value;
            }

            // --- 2. GÉNÉRATION DU CONTENU ---
            birthdaysGrid.innerHTML = '';

            // Suppression de l'ancien bouton "Tout supprimer" s'il existe (pour éviter les doublons)
            const existingDeleteAll = document.getElementById('delete-all-bd-container');
            if (existingDeleteAll) existingDeleteAll.remove();

            const birthdays = [];
            snapshot.forEach(doc => birthdays.push({id: doc.id, ...doc.data()}));
            currentBirthdaysList = birthdays;

            // NOUVEAU : complète les fiches CRM avec le vrai acompte encaissé (et un nombre d'enfants
            // manquant) depuis crmSyncPreview -- en arrière-plan, la mise à jour revient par ce même
            // écouteur. Voir refreshCrmBirthdayFichesFromPreview().
            refreshCrmBirthdayFichesFromPreview(birthdays).catch(err => console.warn('Synchro acompte fiches CRM :', err));

            // Tri par date puis par heure d'arrivée (les fiches CRM peuvent couvrir plusieurs jours,
            // pas seulement "aujourd'hui" comme avant)
            birthdays.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.time.localeCompare(b.time));

            // Somme des donuts par jour (1 par enfant, bd.count), séparée choco/sucre selon bd.cake
            // + somme des champomy du jour
            const donutsByDate = {};
            birthdays.forEach(bd => {
                if (!donutsByDate[bd.date]) donutsByDate[bd.date] = { chocolat: 0, sucre: 0, champomy: 0 };
                donutsByDate[bd.date][bd.cake === 'sucre' ? 'sucre' : 'chocolat'] += parseInt(bd.count) || 0;
                donutsByDate[bd.date].champomy += parseInt(bd.champomy) || 0;
            });

            // Compteur pour le bouton "Tout supprimer"
            let finishedCount = 0;
            let lastBdDate = null;

            birthdays.forEach(bd => {
                if (bd.date !== lastBdDate) {
                    lastBdDate = bd.date;
                    const dateHeader = document.createElement('h3');
                    dateHeader.className = 'bd-date-separator';
                    dateHeader.dataset.date = bd.date || '';
                    const [dy, dm, dd] = (bd.date || '').split('-').map(Number);
                    const dateLabel = (dy && dm && dd) ? formatDateForDisplay(new Date(dy, dm - 1, dd)) : (bd.date || 'Date inconnue');
                    const donuts = donutsByDate[bd.date] || { chocolat: 0, sucre: 0, champomy: 0 };
                    dateHeader.innerHTML = `${dateLabel} <span class="bd-donut-count">🍩 Choco: ${donuts.chocolat} — 🍬 Sucre: ${donuts.sucre} — 🍾 Champomy: ${donuts.champomy}</span>`;
                    birthdaysGrid.appendChild(dateHeader);
                }
                // =========================================================
                // 1. CALCULS ET ETATS
                // =========================================================

                // A. Calcul "Arrivé"
                const arrivedClass = bd.arrived ? 'arrived' : '';

                // B. Calcul "Tout coché ?" (Sauf paid/activity/champomy)
                // CORRIGÉ : "cakeBetweenGames" (case "↔️ Entre les 2 jeux") est un RÉGLAGE du moment
                // gâteau, pas une tâche à faire -- elle restait décochée dans la plupart des cas, donc la
                // fiche ne passait jamais en "complétée" même une fois tout coché et payé. Pire : sur les
                // formules à une seule activité (Bowling Enfant/Jeune, Quiz), cette case n'est même pas
                // affichée mais existe quand même dans la checklist -> fiche impossible à compléter.
                const NON_TASK_CHECKLIST_KEYS = ['paid', 'activity', 'champomy', 'cakeBetweenGames'];
                let allCheckboxesChecked = true;
                if (bd.checklist) {
                    Object.keys(bd.checklist).forEach(key => {
                        if (!NON_TASK_CHECKLIST_KEYS.includes(key) && !bd.checklist[key]) {
                            allCheckboxesChecked = false;
                        }
                    });
                }

                // C. Calcul "Activités terminées ?"
                const now = Date.now();
                let allActivitiesFinished = true;
                if (bd.timers) {
                    Object.values(bd.timers).forEach(t => {
                        if (!t.endTime || t.endTime > now) {
                            allActivitiesFinished = false;
                        }
                    });
                }

                // D. Est-ce que c'est DÉJÀ payé ?
                const isPaidAlready = bd.checklist && bd.checklist.paid;

                // E. Calcul des classes CSS spéciales
                // Alerte clignotante : Fini + Coché MAIS Pas payé
                const triggerBlinkAlert = allActivitiesFinished && allCheckboxesChecked && !isPaidAlready;
                const alertClass = triggerBlinkAlert ? 'blink-alert' : '';

                // Carte terminée : Tout coché ET Payé
                const isFinished = allCheckboxesChecked && isPaidAlready;
                const finishedClass = isFinished ? 'finished' : '';

                // Incrémentation du compteur de fin
                if (isFinished) {
                    finishedCount++;
                }

                // =========================================================
                // 2. CRÉATION DE LA CARTE HTML
                // =========================================================
                const card = document.createElement('div');
                card.className = `birthday-card formula-${bd.formulaKey} ${arrivedClass} ${finishedClass}`;
                
                const cakeLabels = { 'chocolat': '🍩 Choco', 'sucre': '🍬 Sucre' };
                const champomyText = bd.champomy > 0 ? ` - 🍾 x${bd.champomy}` : '';

                // Restauration état ouvert/fermé
                const isPriceOpen = openStates.prices.has(bd.id);
                const priceDisplayStyle = isPriceOpen ? 'block' : 'none';
                
                const isNoteOpen = openStates.notes.has(bd.id);
                const noteDisplay = isNoteOpen ? 'block' : 'none';
                
                // Calcul Prix
                const getPriceInfo = () => {
                    const dateParts = bd.date.split('-');
                    const bdDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]); 
                    const day = bdDate.getDay(); 
                    const isLowTariff = (day >= 1 && day <= 3); // Lun-Mer
                    let price = 0;
                    switch(bd.formulaKey) {
                        case 'bowling_enfant': price = isLowTariff ? 12 : 15; break;
                        case 'bowling_jeune':  price = isLowTariff ? 14 : 17; break;
                        case 'bowling_laser':  price = isLowTariff ? 18 : 19; break;
                        case 'laser_jeune':    price = isLowTariff ? 18 : 19; break;
                        case 'quiz':           price = isLowTariff ? 21 : 24; break;
                        default: price = 0;
                    }
                    
                    const formulaTotal = price * (getBirthdayCountNumber(bd) || 0); // NOUVEAU : plus de "NaN€" si le nombre manque
                    const champomyCount = bd.champomy || 0;
                    const champomyTotal = champomyCount * 10; // 10€ par bouteille
                    const total = formulaTotal + champomyTotal;
                    
                    return { 
                        unit: price, 
                        total: total, 
                        isLow: isLowTariff,
                        champomyTotal: champomyTotal,
                        champomyCount: champomyCount
                    };
                };
                const priceInfo = getPriceInfo();
                // NOUVEAU : acompte réellement encaissé (fiche CRM : montant relevé sur la commande, ex 14€)
                // au lieu de 50€ en dur ; 0 si la fiche est "sans acompte". Un montant inhabituel est
                // signalé en rouge, ici ET en haut de la carte (sinon caché dans le détail du prix).
                const depositAmount = getBirthdayDepositAmount(bd);
                const unusualDeposit = isUnusualBirthdayDeposit(depositAmount);
                const remainingToPay = priceInfo.total - depositAmount;
                const acompteText = depositAmount > 0
                    ? `<span style="font-size:0.8em; font-weight:${unusualDeposit ? 'bold' : 'normal'}; color:${unusualDeposit ? '#e74c3c' : '#666'};">(Acompte -${depositAmount}€${unusualDeposit ? ` ⚠️ au lieu de ${getStandardBirthdayDeposit()}€` : ''})</span>`
                    : '';
                const unusualDepositHtml = unusualDeposit
                    ? `<div class="bd-deposit-warning" style="background:#fdecea; border:1px solid #e74c3c; color:#c0392b; border-radius:4px; padding:3px 6px; font-size:0.8em; font-weight:bold; margin-bottom:5px;" title="Montant relevé sur la commande CRM — à vérifier avec le client">⚠️ Acompte CRM : ${depositAmount}€ au lieu de ${getStandardBirthdayDeposit()}€</div>`
                    : '';
                // NOUVEAU : nombre d'enfants absent/invalide -> "⚠️ ?" au lieu de "undefined" ; nombre
                // pris par défaut à la génération (introuvable sur le CRM) -> petit ⚠️ à côté.
                const childCount = getBirthdayCountNumber(bd);
                const childCountHtml = childCount !== null
                    ? `${childCount}${bd.countToCheck ? ' <span title="Nombre absent de la commande CRM, mis à 4 par défaut — à vérifier" style="color:#e67e22; cursor:help;">⚠️</span>' : ''}`
                    : '<span title="Nombre d\'enfants inconnu — à vérifier sur le CRM puis corriger avec + / -" style="color:#e74c3c; cursor:help;">⚠️ ?</span>';

                // --- GÉNÉRATION TIMERS ---
                let timersHtml = '';
                // Ordre d'affichage des lignes d'activité : Laser toujours au-dessus de Bowling
                // (indépendant de l'ordre réel de lancement, géré par le switch ci-dessus), puis
                // Quiz. À type égal (ex: laser_jeune -> laser_0/laser_1), on garde l'ordre des clés.
                const TIMER_TYPE_DISPLAY_ORDER = { laser: 0, bowling: 1, quiz: 2 };
                const sortedTimerKeys = Object.keys(bd.timers || {}).sort((a, b) => {
                    const orderA = TIMER_TYPE_DISPLAY_ORDER[bd.timers[a].type];
                    const orderB = TIMER_TYPE_DISPLAY_ORDER[bd.timers[b].type];
                    const rankA = orderA !== undefined ? orderA : 99;
                    const rankB = orderB !== undefined ? orderB : 99;
                    if (rankA !== rankB) return rankA - rankB;
                    return a.localeCompare(b);
                });

                sortedTimerKeys.forEach(key => {
                    const timer = bd.timers[key];
                    let controlsHtml = '';
                    const isRunning = timer.endTime && timer.endTime > 0;
                    const laneValue = timer.lane || ''; 

                    if (isRunning) {
                        let extraInputHtml = '';
                        if (timer.type === 'bowling') {
                            extraInputHtml = `<input type="text" class="bowling-lane-input" data-key="${key}" value="${laneValue}" placeholder="Pistes" style="width:50px; padding:3px; margin-right:5px; font-size:0.9em; border:1px solid #ccc; border-radius:3px;">`;
                        }

                        const roomLabel = timer.type === 'laser' 
                            ? (timer.room == 1 ? '<span style="color:#2980b9; font-weight:bold; margin-right:5px;">(Bas)</span>' : '<span style="color:#e67e22; font-weight:bold; margin-right:5px;">(Haut)</span>') 
                            : ''; 
                        
                        const remainingMs = Math.max(0, timer.endTime - now);
                        let timeString = "Terminé";
                        let timeClass = "";
                        
                        if (remainingMs > 0) {
                            const minutes = Math.floor(remainingMs / 60000);
                            const seconds = Math.floor((remainingMs % 60000) / 1000);
                            timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                            timeClass = "active";
                        } else {
                            timeString = "Terminé";
                            timeClass = "";
                        }
                            
                        controlsHtml = `
                        <div style="display:flex; align-items:center; justify-content:flex-end; width:100%;">
                            ${extraInputHtml}
                            ${roomLabel}
                            <span class="card-timer-display ${timeClass}" 
                                    data-endtime="${timer.endTime}" 
                                    style="font-family:monospace; font-size:1.2em; font-weight:bold; ${remainingMs <= 0 ? 'color:#e74c3c;' : 'color:#e67e22;'}">
                                    ${timeString}
                            </span>
                        </div>
                        `;
                    } else {
                        if (timer.type === 'bowling') {
                            controlsHtml = `
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <input type="text" class="bowling-lane-input" data-key="${key}" value="${laneValue}" placeholder="Pistes" style="width:50px; padding:3px; font-size:0.9em; border:1px solid #ccc; border-radius:3px;">
                                    
                                    <input type="number" class="bowling-custom-time-${key}" placeholder="${timer.duration}" style="width:35px; padding:2px; text-align:center; border:1px solid #ccc; border-radius:3px;">
                                    
                                    <button type="button" class="timer-btn-mini start-bowling-btn" data-key="${key}" style="background-color:#3498db; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Go</button>
                                </div>
                            `;
                        } else if (timer.type === 'laser') {
                            controlsHtml = `
                                <div style="display:flex; gap:5px; align-items:center;">
                                    <select class="room-select-mini room-select-${key}" style="padding:2px;">
                                        <option value="1">Bas</option>
                                        <option value="2">Haut</option>
                                    </select>
                                    <input type="number" class="laser-custom-time-${key}" placeholder="18" style="width:35px; padding:2px; text-align:center; border:1px solid #ccc; border-radius:3px;">
                                    <button type="button" class="timer-btn-mini start-laser-btn" data-key="${key}" style="background-color:#2ecc71; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Go</button>
                                </div>
                            `;
                        }
                        else if (timer.type === 'quiz') {
                            controlsHtml = `
                                <div style="display:flex; gap:5px; align-items:center;">
                                    <button type="button" class="timer-btn-mini start-quiz-btn" data-key="${key}" style="background-color:#d35400; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Lancer 60'</button>
                                </div>
                            `;
                        }
                    }

                    timersHtml += `
                        <div class="activity-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; background:#f9f9f9; padding:5px; border-radius:4px;">
                            <span class="activity-label" style="text-transform:capitalize; font-weight:bold;">${timer.label}</span>
                            <div class="activity-controls" style="flex:1; display:flex; justify-content:flex-end;">
                                ${controlsHtml}
                            </div>
                        </div>
                    `;
                });

                // HTML Checklist
                const config = FORMULAS_CONFIG[bd.formulaKey];
                const drinksCount = config ? config.drinksCount : 1;
                let drinksChecklistHtml = '';
                
                for(let i=1; i<=drinksCount; i++) {
                    const key = `drink${i}`;
                    const isChecked = bd.checklist && bd.checklist[key];
                    drinksChecklistHtml += `<div class="checklist-item ${isChecked?'checked':''}"><input type="checkbox" class="bd-check" data-field="${key}" ${isChecked?'checked':''}> ${drinksCount>1?'Boisson '+i:'Boisson'}</div>`;
                }

                let champomyChecklistHtml = '';
                if(bd.champomy > 0) {
                     for(let i=1; i<=bd.champomy; i++) {
                        const key = `champomy_${i}`; 
                        const isChecked = bd.checklist && bd.checklist[key];
                        champomyChecklistHtml += `<div class="checklist-item ${isChecked?'checked':''}"><input type="checkbox" class="bd-check" data-field="${key}" ${isChecked?'checked':''}> 🍾 Champomy ${i}</div>`;
                     }
                }
                const isCakeChecked = bd.checklist && bd.checklist.cake;
                const isCakeBetween = bd.checklist && bd.checklist.cakeBetweenGames;
                const hasTwoActivities = config && config.activities && config.activities.length >= 2;
                const isTicketPrinted = bd.checklist && bd.checklist.ticketPrinted;
                const isPaid = bd.checklist && bd.checklist.paid;
                const noteIndicator = (bd.notes && bd.notes.trim().length > 0) ? '<span style="color:red; font-weight:bold;">*</span>' : '';

                const noteValue = (focusedElementId === bd.id && currentTypingValue !== null) ? currentTypingValue : (bd.notes || '');

                // Switch d'inversion d'ordre (uniquement formule "Bowling + Laser") : dans de rares
                // cas tous les créneaux laser de l'heure sont pris, donc on démarre par le bowling
                // (50min) le temps qu'un créneau laser se libère. Verrouillé dès qu'un des deux jeux
                // est lancé, pour ne pas mélanger un chrono déjà en cours. Le curseur se place côté
                // "Bowling" ou côté "Laser" selon lequel démarre en premier ; l'encadré devient bleu
                // quand c'est le bowling (sinon il reste blanc).
                let bowlingLaserOrderHtml = '';
                if (bd.formulaKey === 'bowling_laser' && bd.timers) {
                    const laserKey = Object.keys(bd.timers).find(k => bd.timers[k].type === 'laser');
                    const bowlingKey = Object.keys(bd.timers).find(k => bd.timers[k].type === 'bowling');
                    if (laserKey && bowlingKey) {
                        const laserIdx = parseInt(laserKey.slice(laserKey.lastIndexOf('_') + 1), 10);
                        const bowlingIdx = parseInt(bowlingKey.slice(bowlingKey.lastIndexOf('_') + 1), 10);
                        const bowlingIsFirst = bowlingIdx < laserIdx;
                        const orderLocked = !!(bd.timers[laserKey].endTime || bd.timers[bowlingKey].endTime);
                        // Labellisé Laser (gauche) -> Bowling (droite) ; le curseur se pose du côté
                        // du jeu qui démarre en premier (gauche = Laser par défaut, droite = Bowling).
                        const knobLeft = bowlingIsFirst ? '18px' : '2px';
                        const trackColor = bowlingIsFirst ? '#2196f3' : '#ccc';
                        const boxBg = bowlingIsFirst ? '#e3f2fd' : '#ffffff';
                        const boxBorder = bowlingIsFirst ? '#2196f3' : '#ddd';
                        const bowlingLabelStyle = bowlingIsFirst ? 'font-weight:bold; color:#1565c0;' : 'color:#999;';
                        const laserLabelStyle = !bowlingIsFirst ? 'font-weight:bold; color:#1565c0;' : 'color:#999;';
                        const switchTitle = orderLocked
                            ? "Un des deux jeux est déjà lancé -- ordre verrouillé"
                            : "Laser complet à cette heure ? Bascule pour commencer par le bowling.";
                        bowlingLaserOrderHtml = `
                            <div class="bd-order-switch" style="display:flex; align-items:center; justify-content:center; gap:6px; font-size:0.72em; white-space:nowrap; background:${boxBg}; border:1px solid ${boxBorder}; border-radius:6px; padding:4px 8px; margin-top:4px;">
                                <span style="${laserLabelStyle}">Laser</span>
                                <div class="swap-bowling-laser-switch" role="switch" aria-checked="${bowlingIsFirst}" title="${switchTitle}" style="position:relative; flex-shrink:0; width:34px; height:18px; border-radius:9px; background:${trackColor}; cursor:${orderLocked ? 'not-allowed' : 'pointer'}; opacity:${orderLocked ? '0.55' : '1'};">
                                    <div style="position:absolute; top:2px; left:${knobLeft}; width:14px; height:14px; border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.35); transition:left .15s ease;"></div>
                                </div>
                                <span style="${bowlingLabelStyle}">Bowling</span>
                            </div>
                        `;
                    }
                }

                card.innerHTML = `
                   <div class="birthday-header" style="display:flex; flex-direction:column; gap:5px;">
    
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%; border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:5px;">
                        <h3 style="margin:0; font-size:1.1em;">${bd.name} (${bd.age} ans)</h3>
                        
                        <div style="display:flex; gap:10px; align-items:center;">
                            <label style="font-size:0.7em; display:flex; flex-direction:column; align-items:center; cursor:pointer;">
                                <input type="checkbox" class="bd-present-check" ${bd.presented?'checked':''}>
                                Présent
                            </label>
                
                            <label style="font-size:0.7em; display:flex; flex-direction:column; align-items:center; cursor:pointer;">
                                <input type="checkbox" class="bd-all-here-check" ${bd.allHere?'checked':''}>
                                Tous là
                            </label>
                        </div>
                    </div>
                
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.9em; color:#666; margin-bottom:5px;">
                        <div>Arrivée : <strong>${bd.time}</strong></div>
                    </div>
                    ${unusualDepositHtml}

                    <div class="bd-count-controls">
                        <span>Enfants : </span>
                        <button class="count-btn btn-minus">-</button>
                        <span style="font-weight:bold; color:#2c3e50; font-size:1.1em; margin:0 5px;">${childCountHtml}</span>
                        <button class="count-btn btn-plus">+</button>
                    </div>
                    
                    <div class="birthday-formula">
                        ${bd.formulaLabel}<br>
                        ${cakeLabels[bd.cake] || 'Gâteau'}${champomyText}
                    </div>
                    ${bowlingLaserOrderHtml}
                    
                    <div class="timers-container">
                        ${timersHtml}
                    </div>

                    <div class="checklist-container">
                        ${drinksChecklistHtml}
                        ${champomyChecklistHtml}
                        <div class="checklist-item ${isCakeChecked?'checked':''}" style="flex-wrap:wrap; gap:4px 14px;">
                            <label style="display:flex; align-items:center; cursor:pointer;">
                                <input type="checkbox" class="bd-check" data-field="cake" ${isCakeChecked?'checked':''}> 🎂 Gâteau
                            </label>
                            ${hasTwoActivities ? `
                            <label style="display:flex; align-items:center; cursor:pointer; font-size:0.85em; color:#8e44ad;" title="Le moment gâteau se calera sur la fin de la 1ère activité (dès son lancement) au lieu de la dernière.">
                                <input type="checkbox" class="bd-check" data-field="cakeBetweenGames" ${isCakeBetween?'checked':''}> ↔️ Entre les 2 jeux
                            </label>` : ''}
                        </div>
                        <hr style="margin:5px 0; border:0; border-top:1px solid #eee;">
                        <div class="checklist-item ${isTicketPrinted?'checked':''}">
                            <input type="checkbox" class="bd-check" data-field="ticketPrinted" ${isTicketPrinted?'checked':''}> 🧾 Ticket Sorti
                        </div>
                        <div class="checklist-item ${alertClass}" style="flex-wrap: wrap;">
                            <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                                <label style="display:flex; align-items:center; cursor:pointer; font-weight:500;">
                                    <input type="checkbox" class="bd-check" data-field="paid" ${isPaid?'checked':''} style="margin-right:8px;"> Encaissement
                                </label>
                                <button type="button" class="toggle-price-btn" title="Voir le prix">💰</button>
                            </div>
                            <div class="price-details" data-id="${bd.id}" style="display: ${priceDisplayStyle};">
                                <div style="font-size:1.1em; border-bottom:1px solid #a3e4d7; padding-bottom:3px; margin-bottom:3px;">
                                    <strong>Total : ${priceInfo.total}€</strong>
                                </div>
                                
                                <div style="font-weight:bold; color:#d35400; margin-bottom:5px;">
                                    Reste à payer : ${remainingToPay}€
                                    ${acompteText}
                                </div>

                                <div style="font-size:0.85em; color:#16a085;">
                                    ${childCount !== null ? childCount : '?'} enfants x ${priceInfo.unit}€
                                    (${priceInfo.isLow ? 'Tarif Semaine' : 'Tarif WE'})
                                    ${priceInfo.champomyCount > 0 ? `<br>+ ${priceInfo.champomyCount} Champomy (${priceInfo.champomyTotal}€)` : ''}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="notes-toggle" data-id="${bd.id}">Notes${noteIndicator}</div>
                    <textarea class="notes-area" data-id="${bd.id}" style="display:${noteDisplay};" placeholder="Écrire une note...">${noteValue}</textarea>
                    
                    <button class="delete-card-btn">Supprimer la fiche</button>
                `;

                // =========================================================
                // 3. LISTENERS
                // =========================================================

                card.querySelectorAll('.bd-check').forEach(chk => {
                    chk.addEventListener('change', async (e) => {
                        const field = e.target.dataset.field;
                        const currentChecklist = bd.checklist || {};
                        await setDoc(doc(db, "dailyBirthdays", bd.id), { 
                            checklist: { ...currentChecklist, [field]: e.target.checked } 
                        }, { merge: true });
                    });
                });

                const btnPlus = card.querySelector('.btn-plus');
                // NOUVEAU : corriger le nombre à la main retire le badge "à vérifier" (countToCheck) ; un
                // nombre inconnu ("⚠️ ?") repart de 4 (minimum d'une formule) au 1er clic sur +.
                if(btnPlus) btnPlus.addEventListener('click', async () => {
                    const currentCount = getBirthdayCountNumber(bd);
                    const nextCount = currentCount === null ? 4 : currentCount + 1;
                    await updateDoc(doc(db, "dailyBirthdays", bd.id), { count: nextCount, countToCheck: false });
                });

                const btnMinus = card.querySelector('.btn-minus');
                if(btnMinus) btnMinus.addEventListener('click', async () => {
                    const currentCount = getBirthdayCountNumber(bd) || 0;
                    if (currentCount > 1) await updateDoc(doc(db, "dailyBirthdays", bd.id), { count: currentCount - 1, countToCheck: false });
                });

                const arrivedCheck = card.querySelector('.bd-arrived-check');
                if(arrivedCheck) arrivedCheck.addEventListener('change', async (e) => {
                    await updateDoc(doc(db, "dailyBirthdays", bd.id), { arrived: e.target.checked });
                });

                 const presentCheck = card.querySelector('.bd-present-check');
                if(presentCheck) presentCheck.addEventListener('change', async (e) => {
                    await updateDoc(doc(db, "dailyBirthdays", bd.id), { presented: e.target.checked });
                });

                const allHereCheck = card.querySelector('.bd-all-here-check');
                if(allHereCheck) allHereCheck.addEventListener('change', async (e) => {
                    await updateDoc(doc(db, "dailyBirthdays", bd.id), { allHere: e.target.checked });
                });

                const togglePriceBtn = card.querySelector('.toggle-price-btn');
                const priceDetailsDiv = card.querySelector('.price-details');
                if(togglePriceBtn && priceDetailsDiv) {
                    togglePriceBtn.addEventListener('click', () => {
                        priceDetailsDiv.style.display = (priceDetailsDiv.style.display === 'none') ? 'block' : 'none';
                    });
                }

                // GESTION NOTES DEBOUNCED
                const notesToggle = card.querySelector('.notes-toggle');
                const notesArea = card.querySelector('.notes-area');
                if(notesToggle && notesArea) {
                    notesToggle.addEventListener('click', () => {
                        const isHidden = notesArea.style.display === 'none';
                        notesArea.style.display = isHidden ? 'block' : 'none';
                    });
                    
                    notesArea.addEventListener('input', (e) => {
                        currentTypingValue = e.target.value; 
                        saveNoteDebounced(bd.id, e.target.value);
                    });
                }

                const swapOrderBtn = card.querySelector('.swap-bowling-laser-switch');
                if (swapOrderBtn) swapOrderBtn.addEventListener('click', async () => {
                    const laserKey = Object.keys(bd.timers).find(k => bd.timers[k].type === 'laser');
                    const bowlingKey = Object.keys(bd.timers).find(k => bd.timers[k].type === 'bowling');
                    if (!laserKey || !bowlingKey) return;
                    if (bd.timers[laserKey].endTime || bd.timers[bowlingKey].endTime) {
                        showCustomAlert("Impossible d'inverser l'ordre : un des deux jeux est déjà lancé.");
                        return;
                    }
                    const laserIdx = parseInt(laserKey.slice(laserKey.lastIndexOf('_') + 1), 10);
                    const bowlingIdx = parseInt(bowlingKey.slice(bowlingKey.lastIndexOf('_') + 1), 10);
                    const newTimers = { ...bd.timers };
                    delete newTimers[laserKey];
                    delete newTimers[bowlingKey];
                    newTimers[`laser_${bowlingIdx}`] = bd.timers[laserKey];
                    newTimers[`bowling_${laserIdx}`] = bd.timers[bowlingKey];
                    try {
                        await updateDoc(doc(db, "dailyBirthdays", bd.id), { timers: newTimers });
                    } catch (error) {
                        console.error("Erreur inversion ordre bowling/laser", error);
                        showCustomAlert("L'inversion a échoué.");
                    }
                });

                const deleteBtn = card.querySelector('.delete-card-btn');
                if(deleteBtn) deleteBtn.addEventListener('click', () => {
                    showCustomAlert("Supprimer cet anniversaire ?", "confirm", async () => {
                        // Fiche venant du CRM (acompte payé en ligne) : on garde une trace de la
                        // suppression pour que le prochain scan CRM (no-show, doublon...) ne la
                        // recrée pas tout seul juste parce qu'elle n'existe plus.
                        if (bd.crmOrderId) {
                            await setDoc(doc(db, "crmDismissedBirthdays", String(bd.crmOrderId)), {
                                crmOrderId: String(bd.crmOrderId),
                                name: bd.name || null,
                                date: bd.date || null,
                                dismissedAt: serverTimestamp()
                            });
                        }
                        await deleteDoc(doc(db, "dailyBirthdays", bd.id));
                    });
                });

                // LISTENERS TIMERS
                card.querySelectorAll('.bowling-lane-input').forEach(input => {
                    input.addEventListener('change', async (e) => {
                        const key = e.target.dataset.key;
                        await updateDoc(doc(db, "dailyBirthdays", bd.id), { [`timers.${key}.lane`]: e.target.value });
                    });
                });

                card.querySelectorAll('.start-bowling-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        const key = e.target.dataset.key;
                        
                        const customInput = card.querySelector(`.bowling-custom-time-${key}`);
                        let duration = bd.timers[key].duration; 
                        
                        if (customInput && customInput.value) {
                            duration = parseInt(customInput.value);
                        }

                        const endTime = Date.now() + (duration * 60000);

                        // SÉCURITÉ : formule "Bowling + Laser" -- si on lance le bowling en premier
                        // sans avoir basculé le switch au préalable (le laser n'a pas encore démarré
                        // et le bowling est toujours en 2ème position), on inverse automatiquement
                        // l'ordre des clés avant de démarrer, pour que le rappel "lancer le 2ème jeu"
                        // et le repère du gâteau restent corrects malgré l'oubli.
                        if (bd.formulaKey === 'bowling_laser') {
                            const laserKey = Object.keys(bd.timers).find(k => bd.timers[k].type === 'laser');
                            const bowlingKey = Object.keys(bd.timers).find(k => bd.timers[k].type === 'bowling');
                            if (laserKey && bowlingKey === key && !bd.timers[laserKey].endTime) {
                                const laserIdx = parseInt(laserKey.slice(laserKey.lastIndexOf('_') + 1), 10);
                                const bowlingIdx = parseInt(bowlingKey.slice(bowlingKey.lastIndexOf('_') + 1), 10);
                                if (bowlingIdx > laserIdx) {
                                    const newTimers = { ...bd.timers };
                                    delete newTimers[laserKey];
                                    delete newTimers[bowlingKey];
                                    const newBowlingKey = `bowling_${laserIdx}`;
                                    newTimers[`laser_${bowlingIdx}`] = bd.timers[laserKey];
                                    newTimers[newBowlingKey] = { ...bd.timers[bowlingKey], endTime: endTime };
                                    try {
                                        await updateDoc(doc(db, "dailyBirthdays", bd.id), { timers: newTimers });
                                        showCustomAlert("⚠️ Ordre inversé automatiquement : le bowling a été lancé en premier (le switch n'avait pas été basculé).");
                                    } catch (error) {
                                        console.error("Erreur inversion auto ordre bowling/laser", error);
                                        showCustomAlert("Le lancement a échoué.");
                                    }
                                    return;
                                }
                            }
                        }

                        await updateDoc(doc(db, "dailyBirthdays", bd.id), { [`timers.${key}.endTime`]: endTime });
                    });
                });

                card.querySelectorAll('.start-laser-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        const key = e.target.dataset.key;
                        const select = card.querySelector(`.room-select-${key}`);
                        const room = parseInt(select.value);
                        
                        const customInput = card.querySelector(`.laser-custom-time-${key}`);
                        let duration = 18; 
                        if (customInput && customInput.value) {
                            duration = parseInt(customInput.value); 
                        }

                        const endTime = Date.now() + (duration * 60000);
                        const roomName = room === 1 ? "⬇️ Salle Bas ⬇️" : "⬆️ Salle Haut ⬆️";

                        await updateDoc(doc(db, "dailyBirthdays", bd.id), {
                            [`timers.${key}.endTime`]: endTime,
                            [`timers.${key}.room`]: room
                        });

                        try {
                            const timerData = {
                                endTime: endTime,
                                isCountingDown: true,
                                notified: false,
                                title: `${roomName}<br><span style="font-size:0.8em; font-weight:normal;">Anniv : ${bd.name}</span>`
                            };
                            await updateTimerInDb(room, timerData);
                        } catch(e) { console.warn("Timer global non mis à jour"); }

                        // NOUVEAU : synchronise aussi "Monté" sur le créneau laser correspondant
                        // (même crmOrderId), pour que le planning laser reflète le lancement fait ici.
                        syncReservationMonteFromBirthday(bd, room);
                    });
                });

                card.querySelectorAll('.start-quiz-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        const key = e.target.dataset.key;
                        const duration = 60; 
                        const endTime = Date.now() + (duration * 60000);
                        const room = 4; 

                        await updateDoc(doc(db, "dailyBirthdays", bd.id), {
                            [`timers.${key}.endTime`]: endTime,
                            [`timers.${key}.room`]: room
                        });

                        try {
                            const timerData = {
                                endTime: endTime,
                                isCountingDown: true,
                                notified: false,
                                title: `🚨 QuizzBoxing 🚨<br><span style="font-size:0.8em; font-weight:normal;">Anniv : ${bd.name}</span>`
                            };
                            await updateTimerInDb(room, timerData);
                        } catch(e) { console.warn("Timer global non mis à jour"); }
                    });
                });

                // Stepper champomy (le CRM se trompe parfois sur le nombre) — greffé sous la carte
                const champomyStepper = document.createElement('div');
                champomyStepper.className = 'bd-champomy-stepper';
                champomyStepper.innerHTML = `
                    🍾 <button type="button" class="bd-champomy-minus">−</button>
                    <span class="bd-champomy-count">${bd.champomy || 0}</span>
                    <button type="button" class="bd-champomy-plus">+</button>
                `;
                champomyStepper.querySelector('.bd-champomy-minus').addEventListener('click', () => {
                    adjustBdChampomy(bd.id, bd.champomy || 0, bd.checklist, -1);
                });
                champomyStepper.querySelector('.bd-champomy-plus').addEventListener('click', () => {
                    adjustBdChampomy(bd.id, bd.champomy || 0, bd.checklist, 1);
                });
                card.appendChild(champomyStepper);

                birthdaysGrid.appendChild(card);
            });

            // =========================================================
            // 4. GESTION DU BOUTON "TOUT SUPPRIMER"
            // =========================================================
            if (birthdays.length > 0 && finishedCount === birthdays.length) {
                const btnContainer = document.createElement('div');
                btnContainer.id = 'delete-all-bd-container';
                
                const btn = document.createElement('button');
                btn.id = 'delete-all-bd-btn';
                btn.innerHTML = '🗑️ Tout Supprimer (Fin de journée)';
                
                btn.addEventListener('click', () => {
                    const message = `Attention ! Vous êtes sur le point de supprimer TOUS les anniversaires (${birthdays.length}) affichés.\n\nConfirmer la suppression définitive ?`;
                    
                    showCustomAlert(message, 'confirm', async () => {
                        const batch = writeBatch(db);
                        
                        birthdays.forEach(bd => {
                            const ref = doc(db, "dailyBirthdays", bd.id);
                            batch.delete(ref);
                        });

                        try {
                            await batch.commit();
                            showCustomAlert("Tous les anniversaires ont été supprimés !");
                        } catch (e) {
                            console.error("Erreur suppression globale", e);
                            showCustomAlert("Erreur lors de la suppression.");
                        }
                    });
                });

                btnContainer.appendChild(btn);
                birthdaysGrid.parentNode.insertBefore(btnContainer, birthdaysGrid);
            }

            // --- 5. RESTAURATION DU FOCUS APRES LE RENDU ---
            if (focusedElementId) {
                const el = document.querySelector(`.notes-area[data-id="${focusedElementId}"]`);
                if (el) {
                    el.focus();
                    el.setSelectionRange(focusedElementCursorPos, focusedElementCursorPos);
                }
            }

            updateGlobalTimeline(birthdays);
            
           if (!isTablePlanGenerated) {
            // NOUVEAU : on attend le 1er snapshot Firestore du plan de table (tablePlanDocSeen) avant
            // de générer quoi que ce soit -- sinon, si un autre poste a déjà un plan (ou est en train
            // d'en créer un), on risquerait d'en générer un 2e qui écraserait le sien.
            // CORRIGÉ : on ne génère plus directement ici -- maybeAutoGenerateTablePlan() (déclarée
            // plus bas, dans le bloc plan de table) revérifie Firestore EN DIRECT (pas seulement les
            // indicateurs locaux tablePlanDocSeen/isTablePlanGenerated, qui pouvaient être en retard
            // sur un plan déjà créé par un autre poste) avant de générer quoi que ce soit, et respecte
            // aussi "uniquement pour aujourd'hui".
            if (tablePlanDocSeen) {
                maybeAutoGenerateTablePlan();
            }
        } else {
            console.log("Mise à jour auto du plan de table bloquée. Utilisez le bouton 'Actualiser'.");
            // NOUVEAU: Alerte visuelle pour inviter à actualiser le plan
            const refreshBtn = document.getElementById('refresh-plan-btn');
            if (refreshBtn) refreshBtn.style.boxShadow = "0 0 10px #e74c3c";
        }
        }
    );
    
    
    unsubscribes.push(unsubBirthdays);

    // Moteur de mise à jour des affichages de chronos dans les cartes
    setInterval(() => {
        const now = Date.now();
        // 1. Mise à jour des cartes
        document.querySelectorAll('.card-timer-display').forEach(display => {
            const endTime = parseInt(display.dataset.endtime);
            if (!endTime) return;

            const remainingMs = Math.max(0, endTime - Date.now());
            
            if (remainingMs > 0) {
                const minutes = Math.floor(remainingMs / 60000);
                const seconds = Math.floor((remainingMs % 60000) / 1000);
                display.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                display.classList.add('active');
            } else {
                display.textContent = "Terminé";
                display.classList.remove('active');
                display.style.color = "#e74c3c";
            }
        });
        document.querySelectorAll('.timeline-countdown').forEach(display => {
            const endTime = parseInt(display.dataset.endtime);
            if (!endTime) return;
            const remainingMs = Math.max(0, endTime - now);

            if (remainingMs > 0) {
                const minutes = Math.floor(remainingMs / 60000);
                const seconds = Math.floor((remainingMs % 60000) / 1000);
                display.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                
                // Gestion de l'urgence visuelle (classe ajoutée au parent)
                const item = display.closest('.timeline-item');
                if (remainingMs < 5 * 60000) { // Moins de 5 min
                    item.classList.add('urgent');
                } else {
                    item.classList.remove('urgent');
                }
            } else {
                display.textContent = "Terminé";
                // Optionnel : recharger la timeline complète pour enlever l'élément fini
                // Mais pour l'instant, laisser "Terminé" est bien visuellement
            }
        });
    }, 1000);

        window.clearOldReservations = async function() {
        const { collection, query, where, getDocs, writeBatch, doc } = window.firebaseTools;

        // Calcule la date limite (il y a un mois)
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        
        // Formate la date en YYYY-MM-DD pour la comparaison
        const year = oneMonthAgo.getFullYear();
        const month = String(oneMonthAgo.getMonth() + 1).padStart(2, '0');
        const day = String(oneMonthAgo.getDate()).padStart(2, '0');
        const dateLimitStr = `${year}-${month}-${day}`;

        console.log(`Suppression des réservations antérieures au ${dateLimitStr}...`);

        try {
            // Prépare le batch pour les suppressions atomiques
            const batch = writeBatch(db);
            let deletionsCount = 0;

            // 1. Requête pour les réservations Laser Game
            const lgQuery = query(collection(db, "laserGameReservations"), where("date", "<", dateLimitStr));
            const lgSnapshot = await getDocs(lgQuery);
            lgSnapshot.forEach(docSnapshot => {
                batch.delete(doc(db, "laserGameReservations", docSnapshot.id));
                deletionsCount++;
            });

            // 2. Requête pour les réservations Quiz/Karaoké
            const qkQuery = query(collection(db, "qkReservations"), where("date", "<", dateLimitStr));
            const qkSnapshot = await getDocs(qkQuery);
            qkSnapshot.forEach(docSnapshot => {
                batch.delete(doc(db, "qkReservations", docSnapshot.id));
                deletionsCount++;
            });

            if (deletionsCount > 0) {
                // Exécute toutes les suppressions en une seule fois
                await batch.commit();
                showCustomAlert(`${deletionsCount} ancienne(s) réservation(s) ont été supprimée(s) avec succès.`);
                console.log(`${deletionsCount} réservations supprimées.`);
            } else {
                showCustomAlert("Aucune réservation ancienne à supprimer.");
                console.log("Aucune réservation à supprimer.");
            }

        } catch (error) {
            console.error("Erreur lors de la suppression des anciennes réservations :", error);
            showCustomAlert("Une erreur est survenue lors du nettoyage.");
        }
    }
    setInterval(updateAllTimersDisplay, 250);

// =========================================================
    // === GESTION DU PLANNING DE NETTOYAGE (V6 - DYNAMIQUE & SÉCURISÉ) ===
    // =========================================================

    const cleaningModal = document.getElementById('cleaning-modal');
    const openCleaningBtn = document.getElementById('open-cleaning-modal');
    const cleaningTableBody = document.querySelector('#cleaning-table tbody');
    const cleaningWeekDisplay = document.getElementById('cleaning-week-display');
    const cleaningSaveStatus = document.getElementById('cleaning-save-status');
    const cleaningTable = document.getElementById('cleaning-table');
    const lockMessage = document.getElementById('cleaning-lock-message');
    const additionalTasksContainer = document.getElementById('additional-tasks-container');
    const toolsContainer = document.getElementById('cleaning-tools-container');

    // Modals Gestion & PIN
    const manageCleanersBtn = document.getElementById('manage-cleaners-btn');
    const pinModal = document.getElementById('pin-modal');
    const pinInput = document.getElementById('admin-pin-input');
    const validatePinBtn = document.getElementById('validate-pin-btn');
    const pinErrorMsg = document.getElementById('pin-error-msg');
    const cleanersMgmtModal = document.getElementById('cleaners-management-modal');
    const cleanersListContainer = document.getElementById('cleaners-list-container');
    const addCleanerBtn = document.getElementById('add-cleaner-btn');
    const newCleanerNameInput = document.getElementById('new-cleaner-name');
    const newCleanerColorInput = document.getElementById('new-cleaner-color');

    // Leaderboard elements (inchangés)
    const leaderboardModal = document.getElementById('leaderboard-modal');
    const openLeaderboardBtn = document.getElementById('open-leaderboard-btn');
    const closeLeaderboardBtn = document.getElementById('close-leaderboard');
    const leaderboardList = document.getElementById('leaderboard-list'); 
    const globalLeaderboardList = document.getElementById('global-leaderboard-list');
    const championNameDisplay = document.getElementById('champion-name');
    const tabWeekly = document.getElementById('tab-weekly');
    const tabGlobal = document.getElementById('tab-global');
    const contentWeekly = document.getElementById('leaderboard-content-weekly');
    const contentGlobal = document.getElementById('leaderboard-content-global');
    
    let cleaningTasksConfig = [];

    let taskLastDoneCache = {};
    let blockedTasksCache = {};
    let verificationStatusCache = { lastVerifiedDate: null };

    const DEFAULT_TASKS_CONFIG = [
        { cat: 'Lessive', tasks: ['Lancer', 'Etendre', 'Descendre'] },
        { cat: 'Poubelles', tasks: ['Sortir les poubelles', 'Rentrer les poubelles'] },
        { cat: 'Pistes', tasks: ['Poussiere des rigoles / entre-pistes', 'Balai sur pistes / serpillere'] },
        { cat: 'Nettoyage', tasks: ['Comptoir bowling (poussiere)', 'Banquettes (Bowling)', 'Toiles araignees (sas du bowling)', 'Nettoyage des billards', 'Nettoyage des babyfoots', 'Nettoyage des arcades', 'Nettoyage des portes (laser bas)', 'Karaoke (porte + TV + tables)', 'Nettoyage des bornes de commandes (poussieres)', 'Remplissage des produits lave-vitres', 'Nettoyage des machines (chips, olives)'] },
        { cat: 'Anniv', tasks: ['Nettoyage des "supports anniversaires"']}
    ];

    const cleaningInitDate = new Date();
    if (cleaningInitDate.getHours() < 2 || (cleaningInitDate.getHours() === 2 && cleaningInitDate.getMinutes() <= 10)) {
        cleaningInitDate.setDate(cleaningInitDate.getDate() - 1);
    }
    let currentCleaningMonday = getMonday(cleaningInitDate);
    let selectedCleaner = null; 
    let cleaningDataCache = {}; 
    let cleaningSaveTimer = null; 
    let globalStatsCache = {}; 
    let currentGoatName = null; 
    let currentCleaningUnsub = null;

    // --- 1. CHARGEMENT DES NETTOYEURS (INIT) ---
    async function loadCleanersAndInit() {
        // On écoute la collection 'cleaners' en temps réel
        onSnapshot(query(collection(db, "cleaners")), (snapshot) => {
            EMPLOYEES = [];
            CLEANER_COLORS = {};
            
            snapshot.forEach(doc => {
                const data = doc.data();
                EMPLOYEES.push({ id: doc.id, name: data.name, color: data.color });
                CLEANER_COLORS[data.name] = data.color;
            });

            // Une fois chargés, on met à jour l'interface principale
            renderCleaningTools();
            renderAdditionalTasksInterface();
            populateBookedByOptions(); // Remplit la liste "Qui a pris la réservation ?"
            
            if (cleaningModal.style.display === 'flex') {
                applyDataToTable(cleaningDataCache); // Rafraîchir les couleurs du tableau
            }

            // --- CORRECTION ICI ---
            // On met à jour la liste de gestion si le modal est ouvert
            // (Cela permet de voir l'ajout/suppression en direct)
            if (cleanersMgmtModal && cleanersMgmtModal.style.display === 'flex') {
                renderCleanersList();
            }
        });
    }

    // Remplit la liste déroulante des employés pour le champ "Qui a pris la réservation ?"
    // (basée sur les employés de l'espace nettoyage). L'utilisateur peut aussi taper librement.
    function populateBookedByOptions() {
        const datalist = document.getElementById('booked-by-options');
        if (!datalist) return;
        datalist.innerHTML = '';
        const names = [...new Set(EMPLOYEES.map(e => e.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
        names.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            datalist.appendChild(option);
        });
    }

    // Fonction utilitaire pour générer un ID unique
    function generateUUID() {
        return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // --- REMPLACEMENT DE loadTasksConfig ---
    async function loadTasksConfig() {
        const docRef = doc(db, "cleaningSettings", "config");
        
        onSnapshot(docRef, async (docSnap) => {
            if (docSnap.exists() && docSnap.data().tasks) {
                let rawTasks = docSnap.data().tasks;
                let hasChanged = false;

                // MIGRATION AUTOMATIQUE : Si les tâches sont des chaines de caractères (ancien format)
                // On les convertit en objets avec ID (nouveau format)
                const migratedTasks = rawTasks.map(group => {
                    const newGroup = { ...group };
                    newGroup.tasks = group.tasks.map(task => {
                        if (typeof task === 'string') {
                            hasChanged = true;
                            return { id: generateUUID(), name: task };
                        }
                        return task;
                    });
                    return newGroup;
                });

                cleaningTasksConfig = migratedTasks;

                // Si on a fait une migration, on sauvegarde tout de suite le nouveau format
                if (hasChanged) {
                    console.log("Migration des tâches vers le format ID unique...");
                    await setDoc(docRef, { tasks: cleaningTasksConfig });
                }

            } else {
                // Configuration par défaut avec IDs
                const defaultWithIds = DEFAULT_TASKS_CONFIG.map(group => ({
                    ...group,
                    tasks: group.tasks.map(t => ({ id: generateUUID(), name: t }))
                }));
                cleaningTasksConfig = defaultWithIds;
                await setDoc(docRef, { tasks: cleaningTasksConfig });
            }
            
            // Rafraîchissement des affichages
            const tasksContainer = document.getElementById('tasks-config-container');
            if (tasksContainer && tasksContainer.offsetParent !== null) {
                renderTasksManagementUI();
            }

            if (document.getElementById('cleaning-modal').style.display === 'flex') {
                renderCleaningTable(); 
                applyDataToTable(cleaningDataCache);
            }
        });
    }

    function loadLastDoneData() {
        // On écoute le document qui stocke les dates
        onSnapshot(doc(db, "cleaningSettings", "lastDone"), (docSnap) => {
            if (docSnap.exists()) {
                taskLastDoneCache = docSnap.data();
            } else {
                taskLastDoneCache = {};
            }
            // Si le tableau est affiché, on le rafraîchit pour montrer les nouvelles dates
            if (document.getElementById('cleaning-modal').style.display === 'flex') {
                renderCleaningTable(); 
                applyDataToTable(cleaningDataCache);
            }
        });
    }

    // Tâches bloquées suite à un rejet en vérification (voir openVerificationModal plus bas)
    function loadBlockedTasks() {
        onSnapshot(doc(db, "cleaningSettings", "blockedTasks"), (docSnap) => {
            blockedTasksCache = docSnap.exists() ? docSnap.data() : {};
        });
    }

    // Statut de vérification quotidienne (pour le bouton clignotant de minuit)
    function loadVerificationStatus() {
        onSnapshot(doc(db, "cleaningSettings", "verification"), (docSnap) => {
            if (docSnap.exists() && docSnap.data().lastVerifiedDate) {
                verificationStatusCache.lastVerifiedDate = docSnap.data().lastVerifiedDate;
            } else if (!verificationStatusCache.lastVerifiedDate) {
                // Première utilisation : pas de rattrapage rétroactif sur l'historique déjà existant
                verificationStatusCache.lastVerifiedDate = new Date().toLocaleDateString('fr-CA');
            }
            checkMidnightButton();
        });
    }

    // Lancer au démarrage
    loadCleanersAndInit();
    loadTasksConfig();
    loadLastDoneData();
    loadBlockedTasks();
    loadVerificationStatus();
    setInterval(checkMidnightButton, 60 * 1000); // rattrape le passage à minuit si l'app reste ouverte


    // --- 2. GESTION DU CODE PIN & MODAL ADMIN ---
    if(manageCleanersBtn) {
        manageCleanersBtn.addEventListener('click', () => {
            pendingExceptionalTask = null; // On s'assure qu'on n'est pas en train de valider une tâche
            pinInput.value = '';
            pinErrorMsg.style.display = 'none';
            pinModal.style.display = 'flex';
            pinInput.focus();
        });
    }

    // Validation du PIN
    validatePinBtn.addEventListener('click', checkPin);
    pinInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') checkPin(); });

    let pendingExceptionalTask = null; // Variable pour stocker la tâche en attente de validation

    function checkPin() {
        const pinInputEl = document.getElementById('admin-pin-input');
        const pinModalEl = document.getElementById('pin-modal');
        const pinErrorMsgEl = document.getElementById('pin-error-msg');
        const addExceptionalModalEl = document.getElementById('add-exceptional-modal');

        if (pinInputEl && pinInputEl.value === '211005') { 
            if (pinModalEl) pinModalEl.style.display = 'none';
            pinInputEl.value = ''; 
            if (pinErrorMsgEl) pinErrorMsgEl.style.display = 'none';

            // NOUVEAU : On récupère la tâche qu'elle vienne de l'intérieur ou de la fin du fichier
            let taskToValidate = window.pendingExceptionalTask || (typeof pendingExceptionalTask !== 'undefined' ? pendingExceptionalTask : null);

            if (taskToValidate) {
                // On ajoute au planning
                if (typeof addAdditionalTask === 'function') {
                    addAdditionalTask(taskToValidate.cleaner, taskToValidate.desc, taskToValidate.points);
                }
                if (addExceptionalModalEl) addExceptionalModalEl.style.display = 'none'; 
                
                // Logique Prime
                if (taskToValidate.isBounty) {
                    if (typeof completeBounty === 'function') {
                        completeBounty(taskToValidate.bountyId, taskToValidate.cleaner);
                    }
                    const detailModal = document.getElementById('bounty-detail-modal');
                    if (detailModal) detailModal.style.display = 'none';
                }
                
                // On nettoie la tâche en attente
                if (typeof pendingExceptionalTask !== 'undefined') pendingExceptionalTask = null; 
                window.pendingExceptionalTask = null;
            } else {
                if (typeof openCleanersManagement === 'function') openCleanersManagement();
            }
        } else {
            if (pinErrorMsgEl) pinErrorMsgEl.style.display = 'block';
            if (pinInputEl) pinInputEl.value = '';
        }
    }

    function openCleanersManagement() {
        cleanersMgmtModal.style.display = 'flex';
        renderCleanersList();
    }

    // Rendu de la liste dans le modal admin
    function renderCleanersList() {
        cleanersListContainer.innerHTML = '';
        
        // On trie par nom pour que ce soit propre
        const sortedEmployees = [...EMPLOYEES].sort((a, b) => a.name.localeCompare(b.name));

        sortedEmployees.forEach(emp => {
            const row = document.createElement('div');
            row.className = 'cleaner-mgmt-row';
            row.dataset.id = emp.id; // Pour retrouver la ligne facilement

            // Contenu par défaut (Lecture)
            row.innerHTML = `
                <div class="cleaner-info">
                    <div class="color-dot" style="background-color: ${emp.color};"></div>
                    <span class="cleaner-name-display">${emp.name}</span>
                </div>
                <div class="cleaner-actions">
                    <button class="edit-cleaner-btn" title="Modifier">✏️</button>
                    <button class="delete-cleaner-btn" title="Supprimer">🗑️</button>
                </div>
            `;

            // --- GESTION DU CLIC SUR MODIFIER ---
            const editBtn = row.querySelector('.edit-cleaner-btn');
            editBtn.addEventListener('click', () => {
                // On passe la ligne en mode édition
                row.innerHTML = `
                    <div style="display:flex; align-items:center; gap:5px; flex:1;">
                        <input type="color" class="edit-color-input" value="${emp.color}" style="width:30px; height:30px; padding:0; border:none; cursor:pointer;">
                        <input type="text" class="edit-name-input" value="${emp.name}" style="width:100%; padding:5px; font-size:0.9em;">
                    </div>
                    <div class="cleaner-actions">
                        <button class="save-cleaner-btn">💾</button>
                        <button class="cancel-cleaner-btn">❌</button>
                    </div>
                `;

                // Sauvegarder
                row.querySelector('.save-cleaner-btn').addEventListener('click', async () => {
                    const newName = row.querySelector('.edit-name-input').value.trim();
                    const newColor = row.querySelector('.edit-color-input').value;

                    if (!newName) return showCustomAlert("Le nom ne peut pas être vide.");

                    try {
                        const docRef = doc(db, "cleaners", emp.id);
                        await updateDoc(docRef, { 
                            name: newName, 
                            color: newColor 
                        });
                        // Le onSnapshot rechargera la liste automatiquement
                        showCustomAlert("Modification enregistrée !");
                    } catch (e) {
                        console.error(e);
                        showCustomAlert("Erreur lors de la modification.");
                    }
                });

                // Annuler (On recharge juste la liste pour remettre l'état initial)
                row.querySelector('.cancel-cleaner-btn').addEventListener('click', () => {
                    renderCleanersList();
                });
            });

            // --- GESTION DU CLIC SUR SUPPRIMER ---
            const deleteBtn = row.querySelector('.delete-cleaner-btn');
            deleteBtn.addEventListener('click', () => handleDeleteCleaner(emp.id, emp.name));

            cleanersListContainer.appendChild(row);
        });
    }

    // --- GESTION DES BARÈMES EXCEPTIONNELS ---

    let exceptionalScalesCache = []; // Stockage local
    const exceptionalInfoModal = document.getElementById('exceptional-info-modal');
    const infoExceptionalBtn = document.getElementById('info-exceptional-btn');
    const closeExceptionalInfoBtn = document.getElementById('close-exceptional-info');
    
    // Éléments Admin
    const tabAdminScales = document.getElementById('tab-admin-scales');
    const contentAdminScales = document.getElementById('content-admin-scales');
    const adminScalesList = document.getElementById('admin-scales-list');
    const addScaleBtn = document.getElementById('add-scale-btn');

    // 1. CHARGEMENT DES DONNÉES (Temps réel)
    function loadExceptionalScales() {
        onSnapshot(doc(db, "cleaningSettings", "exceptionalScales"), (docSnap) => {
            if (docSnap.exists() && docSnap.data().items) {
                exceptionalScalesCache = docSnap.data().items;
            } else {
                exceptionalScalesCache = [];
            }
            // Si le modal admin est ouvert, on rafraîchit
            if (contentAdminScales && contentAdminScales.style.display === 'block') {
                renderAdminScales();
            }
            // Si le modal user est ouvert, on rafraîchit
            if (exceptionalInfoModal && exceptionalInfoModal.style.display === 'flex') {
                renderUserScalesTable();
            }
        });
    }
    loadExceptionalScales(); // Lancer au démarrage

    // 2. INTERFACE UTILISATEUR (Lecture seule)
    if(infoExceptionalBtn) {
        infoExceptionalBtn.addEventListener('click', () => {
            renderUserScalesTable();
            exceptionalInfoModal.style.display = 'flex';
        });
    }
    
    if(closeExceptionalInfoBtn) {
        closeExceptionalInfoBtn.addEventListener('click', () => {
            exceptionalInfoModal.style.display = 'none';
        });
    }

    // Fermeture au clic dehors
    window.addEventListener('click', (e) => {
        if(e.target === exceptionalInfoModal) exceptionalInfoModal.style.display = 'none';
    });

    function renderUserScalesTable() {
        const tbody = document.getElementById('exceptional-info-body');
        if(!tbody) return;
        tbody.innerHTML = '';

        if (exceptionalScalesCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">Aucun barème défini pour le moment.</td></tr>';
            return;
        }

        exceptionalScalesCache.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:bold;">${item.name}</td>
                <td style="color:#e67e22; font-weight:bold;">${item.points} pts</td>
                <td style="white-space:normal; text-align:left;">${item.desc}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // 3. INTERFACE ADMINISTRATION
    if(tabAdminScales) {
        tabAdminScales.addEventListener('click', () => {
            // Gestion des classes active
            [tabAdminCleaners, tabAdminTasks, tabAdminLogs, tabAdminScales].forEach(t => t.classList.remove('active'));
            tabAdminScales.classList.add('active');

            // Affichage contenu
            contentAdminCleaners.style.display = 'none';
            contentAdminTasks.style.display = 'none';
            contentAdminLogs.style.display = 'none';
            contentAdminScales.style.display = 'block';

            renderAdminScales();
        });
    }

    function renderAdminScales() {
        adminScalesList.innerHTML = '';
        
        exceptionalScalesCache.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'admin-scale-row';
            row.innerHTML = `
                <div style="display:flex; gap:10px; margin-bottom:5px;">
                    <input type="text" class="scale-name-input" value="${item.name}" placeholder="Titre (ex: Vomi)" data-idx="${index}" style="flex:2; font-weight:bold;">
                    <input type="text" class="scale-points-input" value="${item.points}" placeholder="Pts (ex: 3-10)" data-idx="${index}" style="flex:1; text-align:center;">
                </div>
                <div style="display:flex; gap:10px;">
                    <textarea class="scale-desc-input" data-idx="${index}" placeholder="Description..." style="flex:1; height:50px; resize:none; border:1px solid #ddd; border-radius:4px; padding:5px;">${item.desc}</textarea>
                    <button class="delete-scale-btn" data-idx="${index}" style="background:#e74c3c; width:30px; color:white; border:none; border-radius:4px; cursor:pointer;">🗑️</button>
                </div>
            `;
            adminScalesList.appendChild(row);
        });

        // Listeners modification (Sauvegarde automatique au changement)
        adminScalesList.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('change', async (e) => {
                const idx = e.target.dataset.idx;
                const field = e.target.classList.contains('scale-name-input') ? 'name' : 
                              e.target.classList.contains('scale-points-input') ? 'points' : 'desc';
                
                exceptionalScalesCache[idx][field] = e.target.value;
                await saveExceptionalScales();
            });
        });

        // Listener suppression
        adminScalesList.querySelectorAll('.delete-scale-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const idx = e.target.dataset.idx;
                if(confirm("Supprimer ce barème ?")) {
                    exceptionalScalesCache.splice(idx, 1);
                    await saveExceptionalScales();
                }
            });
        });
    }

    if(addScaleBtn) {
        addScaleBtn.addEventListener('click', async () => {
            exceptionalScalesCache.push({
                name: "Nouvelle Tâche",
                points: "1",
                desc: "Description..."
            });
            await saveExceptionalScales();
        });
    }

    async function saveExceptionalScales() {
        try {
            await setDoc(doc(db, "cleaningSettings", "exceptionalScales"), { 
                items: exceptionalScalesCache 
            });
        } catch (e) {
            console.error("Erreur sauvegarde barèmes", e);
            showCustomAlert("Erreur lors de la sauvegarde.");
        }
    }

    // Ajout d'un nettoyeur
    addCleanerBtn.addEventListener('click', async () => {
        const name = newCleanerNameInput.value.trim();
        const color = newCleanerColorInput.value;

        if (!name) return alert("Le nom est obligatoire");
        // Vérif doublon
        if (EMPLOYEES.some(e => e.name.toLowerCase() === name.toLowerCase())) return alert("Ce nom existe déjà");

        try {
            await addDoc(collection(db, "cleaners"), { name, color });
            newCleanerNameInput.value = '';
            showCustomAlert("Nettoyeur ajouté !");
            // Le onSnapshot mettra à jour l'interface automatiquement
        } catch (e) {
            console.error("Erreur ajout", e);
            showCustomAlert("Erreur lors de l'ajout.");
        }
    });

// Suppression d'un nettoyeur (CORRIGÉ)
    function handleDeleteCleaner(id, name) {
        showCustomAlert(
            `Supprimer ${name} ?\n\nCela l'effacera définitivement de la liste.`, 
            'confirm', 
            async () => {
                // --- CE BLOC NE S'EXÉCUTE QUE SI VOUS CLIQUEZ SUR CONFIRMER ---
                try {
                    await deleteDoc(doc(db, "cleaners", id));
                    // Le onSnapshot mettra à jour l'interface tout seul
                    showCustomAlert(`${name} a été supprimé.`);
                } catch(e) {
                    console.error(e);
                    showCustomAlert("Erreur lors de la suppression.");
                }
            }
        );
        // Il n'y a plus rien ici, donc la suppression n'est pas lancée automatiquement !
    }

// --- GESTION DES ONGLETS ADMIN ---
    const tabAdminCleaners = document.getElementById('tab-admin-cleaners');
    const tabAdminTasks = document.getElementById('tab-admin-tasks');
    const contentAdminCleaners = document.getElementById('content-admin-cleaners');
    const contentAdminTasks = document.getElementById('content-admin-tasks');
    const addCategoryBtn = document.getElementById('add-category-btn');
    const tabAdminLogs = document.getElementById('tab-admin-logs');
    const contentAdminLogs = document.getElementById('content-admin-logs');
    const logsListContainer = document.getElementById('logs-list-container');

    if (tabAdminCleaners && tabAdminTasks && tabAdminLogs) {
        tabAdminCleaners.addEventListener('click', () => {
            tabAdminCleaners.classList.add('active');
            tabAdminTasks.classList.remove('active');
            tabAdminLogs.classList.remove('active'); // Ajout
            contentAdminCleaners.style.display = 'block';
            contentAdminTasks.style.display = 'none';
            contentAdminLogs.style.display = 'none'; // Ajout pour sécurité
        });

        tabAdminTasks.addEventListener('click', () => {
            tabAdminTasks.classList.add('active');
            tabAdminCleaners.classList.remove('active');
            tabAdminLogs.classList.remove('active'); // Ajout
            contentAdminCleaners.style.display = 'none';
            contentAdminTasks.style.display = 'block';
            contentAdminLogs.style.display = 'none'; // Ajout pour sécurité
            renderTasksManagementUI();
        });

        tabAdminLogs.addEventListener('click', () => {
            tabAdminLogs.classList.add('active');
            tabAdminCleaners.classList.remove('active');
            tabAdminTasks.classList.remove('active');
            
            contentAdminLogs.style.display = 'block';
            contentAdminCleaners.style.display = 'none';
            contentAdminTasks.style.display = 'none';
            
            loadCleaningLogs();
        });
    }

    async function loadCleaningLogs() {
        const container = document.getElementById('logs-list-container');
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Chargement de l\'historique...</div>';
        
        try {
            // 1. Préparation des dates (Aujourd'hui à J-7, le plus récent en premier)
            const datesToFetch = [];
            for (let i = 0; i <= 7; i++) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                datesToFetch.push({
                    dateObj: d,
                    dateStr: d.toLocaleDateString('fr-CA'), // Format YYYY-MM-DD pour la clé Firestore
                    label: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) // Joli format pour l'affichage
                });
            }

            // 2. Récupération parallèle de tous les documents
            const promises = datesToFetch.map(d => getDoc(doc(db, "cleaningLogs", `logs_${d.dateStr}`)));
            const snapshots = await Promise.all(promises);

            container.innerHTML = '';

            // 3. Traitement de chaque jour
            snapshots.forEach((docSnap, index) => {
                const dayInfo = datesToFetch[index];
                const isToday = index === 0; // Le premier élément est aujourd'hui (ordre du plus récent au plus ancien)
                
                // On prépare le conteneur déroulant (ouvert par défaut si c'est aujourd'hui)
                const detailsEl = document.createElement('details');
                detailsEl.className = 'log-day-details';
                if (isToday) detailsEl.open = true;

                let contentHtml = '';
                const hasEntries = docSnap.exists() && docSnap.data().entries && docSnap.data().entries.length > 0;

                if (!hasEntries) {
                    contentHtml = '<p style="text-align:center; color:#999; font-style:italic; margin:0;">Aucune activité enregistrée.</p>';
                } else {
                    // --- LOGIQUE DE TRAITEMENT (Même logique qu'avant pour filtrer add/remove) ---
                    let logs = [...docSnap.data().entries];
                    logs.sort((a, b) => b.timestamp - a.timestamp); // Plus récent en haut

                    const report = {};
                    logs.forEach(log => {
                        let person = log.targetPerson || "Inconnu";
                        let cleanDetail = log.details;

                        if (!report[person]) report[person] = { added: new Set(), removed: new Set() };

                        if (log.action === 'add') {
                            report[person].added.add(cleanDetail);
                        } else if (log.action === 'remove') {
                            report[person].removed.add(cleanDetail);
                        }
                    });

                    // Nettoyage des doublons (Add vs Remove)
                    Object.keys(report).forEach(person => {
                        const data = report[person];
                        const addedArray = Array.from(data.added);
                        const intersection = addedArray.filter(x => data.removed.has(x));
                        intersection.forEach(item => {
                            data.added.delete(item);
                            data.removed.delete(item);
                        });
                    });

                    // Génération du HTML pour ce jour
                    let hasContent = false;
                    
                    // Fonction helper pour la couleur (incluse localement pour être sûr)
                    const stringToColor = (str) => {
                        let hash = 0;
                        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
                        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
                        return '#' + "00000".substring(0, 6 - c.length) + c;
                    };

                    Object.keys(report).sort().forEach(personName => {
                        const actions = report[personName];
                        if (actions.added.size === 0 && actions.removed.size === 0) return;
                        
                        hasContent = true;
                        
                        contentHtml += `<div style="margin-bottom:15px; padding-bottom:10px; border-bottom:1px dashed #eee;">
                            <div style="font-size:1.05em; font-weight:bold; color:#2c3e50; margin-bottom:5px; display:flex; align-items:center;">
                                <span style="background:${stringToColor(personName)}; width:10px; height:10px; display:inline-block; border-radius:50%; margin-right:8px;"></span>
                                ${escapeHtml(personName)}
                            </div>`;

                        if (actions.added.size > 0) {
                            contentHtml += `<ul style="margin:0 0 5px 0; padding-left:25px; color:#555; font-size:0.9em; list-style-type: '✅ ';">
                                ${Array.from(actions.added).map(t => `<li style="padding-left:5px;">${escapeHtml(t)}</li>`).join('')}
                            </ul>`;
                        }

                        if (actions.removed.size > 0) {
                            contentHtml += `<ul style="margin:0; padding-left:25px; color:#c0392b; font-size:0.9em; list-style-type: '🗑️ ';">
                                ${Array.from(actions.removed).map(t => `<li style="padding-left:5px;">${escapeHtml(t)}</li>`).join('')}
                            </ul>`;
                        }
                        contentHtml += `</div>`;
                    });

                    if (!hasContent) {
                        contentHtml = '<p style="text-align:center; color:#999; font-style:italic;">Aucune action visible (Tout a été annulé).</p>';
                    }
                }

                // Titre du résumé (Date + Label Aujourd'hui si besoin)
                const summaryLabel = isToday ? `📅 ${dayInfo.label} (Aujourd'hui)` : `🗓️ ${dayInfo.label}`;

                // Bouton Vérification : un par jour ayant eu des écritures. Pour aujourd'hui,
                // grisé avant 23h (le jour n'est pas encore terminé).
                let verifBtnHtml = '';
                if (hasEntries) {
                    const lockedToday = isToday && new Date().getHours() < 23;
                    verifBtnHtml = `<div style="text-align:right; margin-bottom:10px;">
                        <button type="button" class="day-verif-btn" data-date-str="${dayInfo.dateStr}" ${lockedToday ? 'disabled title="Disponible à partir de 23h"' : ''} style="padding:5px 12px; border-radius:6px; border:none; font-size:0.85em; font-weight:bold; cursor:${lockedToday ? 'not-allowed' : 'pointer'}; background:${lockedToday ? '#ccc' : '#2980b9'}; color:white;">🔍 Vérification${lockedToday ? ' (dispo à 23h)' : ''}</button>
                    </div>`;
                }

                detailsEl.innerHTML = `
                    <summary>${summaryLabel}</summary>
                    <div class="log-day-content">${verifBtnHtml}${contentHtml}</div>
                `;

                container.appendChild(detailsEl);
            });

            container.querySelectorAll('.day-verif-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (btn.disabled) return;
                    openVerificationModal(btn.dataset.dateStr);
                });
            });

        } catch (e) {
            console.error(e);
            container.innerHTML = '<div style="color:red; padding:20px;">Erreur lors du chargement de l\'historique.</div>';
        }
    }

    if(addCategoryBtn) {
        addCategoryBtn.addEventListener('click', async () => {
            const newCatName = prompt("Nom de la nouvelle catégorie :");
            if (newCatName) {
                cleaningTasksConfig.push({ cat: newCatName, tasks: [] });
                await saveTasksConfigToDb();
            }
        });
    }

    // Sauvegarde la configuration actuelle dans Firestore
    async function saveTasksConfigToDb() {
        try {
            await setDoc(doc(db, "cleaningSettings", "config"), { 
                tasks: cleaningTasksConfig 
            });
            // showCustomAlert("Configuration sauvegardée !"); // Optionnel, peut être trop fréquent
        } catch (e) {
            console.error("Erreur sauvegarde config tâches:", e);
            showCustomAlert("Erreur de sauvegarde.");
        }
    }

    // Génère l'interface d'édition des tâches
    function renderTasksManagementUI() {
        const container = document.getElementById('tasks-config-container');
        if (!container) return;
        container.innerHTML = '';

        cleaningTasksConfig.forEach((group, catIndex) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'admin-task-group';
            groupEl.innerHTML = `
                <div class="admin-task-cat-header">
                    <input type="text" class="edit-cat-name" value="${group.cat}" data-idx="${catIndex}">
                    <button class="delete-cat-btn" data-idx="${catIndex}" title="Supprimer catégorie">🗑️</button>
                </div>
                <div class="admin-task-list">
                    <div style="font-size:0.8em; color:#7f8c8d; margin-bottom:5px; padding-left:5px; display:flex;">
                        <span style="flex:1;">Nom de la tâche</span>
                        <span style="width:70px; text-align:center;">Deadline (Jours)</span>
                        <span style="width:30px;"></span>
                    </div>
                </div>
                <button class="add-task-btn-admin" data-idx="${catIndex}">+ Ajouter une tâche</button>
            `;

            const listEl = groupEl.querySelector('.admin-task-list');
            group.tasks.forEach((taskObj, taskIndex) => {
                const taskRow = document.createElement('div');
                taskRow.className = 'admin-task-row';
                
                // On gère la valeur par défaut de la deadline (0 ou vide = pas de bonus)
                const deadlineVal = taskObj.deadline || "";

                taskRow.innerHTML = `
                    <input type="text" class="edit-task-name" value="${taskObj.name}" data-cat-idx="${catIndex}" data-task-idx="${taskIndex}">
                    <input type="number" class="edit-task-deadline" value="${deadlineVal}" placeholder="∞" min="1" data-cat-idx="${catIndex}" data-task-idx="${taskIndex}" title="Nombre de jours avant bonus +1">
                    <button class="delete-task-btn-admin" data-cat-idx="${catIndex}" data-task-idx="${taskIndex}">×</button>
                `;
                listEl.appendChild(taskRow);
            });

            container.appendChild(groupEl);
        });

        // --- LISTENERS POUR CETTE VUE ---
        
        container.querySelectorAll('.edit-task-deadline').forEach(input => {
            input.addEventListener('change', async (e) => {
                const catIdx = e.target.dataset.catIdx;
                const taskIdx = e.target.dataset.taskIdx;
                // On convertit en entier
                const val = parseInt(e.target.value);
                cleaningTasksConfig[catIdx].tasks[taskIdx].deadline = isNaN(val) ? 0 : val;
                await saveTasksConfigToDb();
            });
        });

        // 1. Modifier nom catégorie
        container.querySelectorAll('.add-task-btn-admin').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const catIdx = e.target.dataset.idx;
                const newTaskName = prompt("Nom de la nouvelle tâche :");
                if (newTaskName) {
                    cleaningTasksConfig[catIdx].tasks.push({ 
                        id: generateUUID(), 
                        name: newTaskName,
                        deadline: 0 // Par défaut
                    });
                    await saveTasksConfigToDb();
                }
            });
        });
        
        // (N'oubliez pas de remettre les listeners pour edit name, delete task, etc. si vous remplacez toute la fonction)
        container.querySelectorAll('.edit-cat-name').forEach(input => {
                input.addEventListener('change', async (e) => {
                    const idx = e.target.dataset.idx;
                    cleaningTasksConfig[idx].cat = e.target.value;
                    await saveTasksConfigToDb();
                });
            });

            container.querySelectorAll('.delete-cat-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = e.target.dataset.idx;
                    showCustomAlert(`Supprimer la catégorie "${cleaningTasksConfig[idx].cat}" et ses tâches ?`, 'confirm', async () => {
                        cleaningTasksConfig.splice(idx, 1);
                        await saveTasksConfigToDb();
                    });
                });
            });

            container.querySelectorAll('.edit-task-name').forEach(input => {
                input.addEventListener('change', async (e) => {
                    const catIdx = e.target.dataset.catIdx;
                    const taskIdx = e.target.dataset.taskIdx;
                    // MAJ: on modifie la propriété .name de l'objet
                    cleaningTasksConfig[catIdx].tasks[taskIdx].name = e.target.value;
                    await saveTasksConfigToDb();
                });
            });

            container.querySelectorAll('.delete-task-btn-admin').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const catIdx = e.target.dataset.catIdx;
                    const taskIdx = e.target.dataset.taskIdx;
                    cleaningTasksConfig[catIdx].tasks.splice(taskIdx, 1);
                    await saveTasksConfigToDb();
                });
            });
    }


    // --- 3. RENDU DYNAMIQUE DE LA TOOLBAR ---
    function renderCleaningTools() {
        toolsContainer.innerHTML = '';
        
        EMPLOYEES.forEach(emp => {
            const btn = document.createElement('button');
            btn.className = 'cleaner-btn';
            btn.dataset.name = emp.name;
            btn.dataset.color = emp.color; // On stocke le code hex directement
            btn.textContent = emp.name;
            
            // On applique la couleur dynamiquement (style inline pour supporter n'importe quelle couleur)
            // On éclaircit légèrement la couleur de fond pour la lisibilité, et bordure foncée
            btn.style.backgroundColor = emp.color;
            // Petit hack pour le texte : si la couleur est très sombre, texte blanc (simple heuristic)
            // Pour l'instant on laisse en noir ou on ajoute une ombre.
            btn.style.border = `2px solid ${adjustColor(emp.color, -40)}`; // Bordure plus sombre
            
            // Event listener du bouton
            btn.addEventListener('click', () => handleToolClick(btn));
            
            toolsContainer.appendChild(btn);
        });

        // Bouton Gomme (Toujours à la fin)
        const eraserBtn = document.createElement('button');
        eraserBtn.className = 'cleaner-btn eraser';
        eraserBtn.dataset.name = 'eraser';
        eraserBtn.innerHTML = '🧽 Effacer';
        eraserBtn.addEventListener('click', () => handleToolClick(eraserBtn));
        toolsContainer.appendChild(eraserBtn);
    }

    // Fonction utilitaire pour assombrir une couleur (pour les bordures)
    function adjustColor(color, amount) {
        return '#' + color.replace(/^#/, '').replace(/../g, color => ('0'+Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
    }

    function handleToolClick(btn) {
        document.querySelectorAll('.cleaner-btn').forEach(b => b.classList.remove('active'));
        
        if (selectedCleaner && (
            (selectedCleaner === 'eraser' && btn.dataset.name === 'eraser') || 
            (selectedCleaner.name === btn.dataset.name)
        )) {
            selectedCleaner = null;
            return; 
        }

        btn.classList.add('active');
        if (btn.dataset.name === 'eraser') {
            selectedCleaner = 'eraser';
        } else {
            selectedCleaner = { name: btn.dataset.name, color: btn.dataset.color };
        }
    }


    // --- 4. LE RESTE DU CODE (LOGIQUE EXISTANTE AVEC MISES À JOUR COULEURS) ---
    
    // Chargement Stats Globales
    if(openCleaningBtn) loadGlobalStats();

    async function loadGlobalStats() {
        try {
            const docRef = doc(db, "cleaningStats", "global");
            onSnapshot(docRef, (docSnap) => {
                if (docSnap.exists()) {
                    // --- CORRECTION ICI ---
                    // C'était cleaningDataCache = ... (ERREUR !)
                    // Il faut mettre :
                    globalStatsCache = docSnap.data(); 
                    
                } else {
                    globalStatsCache = { history: {}, weeklySummaries: {} };
                }
                // On peut laisser ça ici si tu veux charger le Hall of Fame global
                // Mais pour la couronne de la semaine, voir point 2
            });
        } catch (e) {
            console.warn("Erreur chargement stats globales", e);
        }
    }

    function calculateGoat() {
        const counts = {};
        Object.values(globalStatsCache).forEach(winnerName => {
            counts[winnerName] = (counts[winnerName] || 0) + 1;
        });
        let maxWins = 0; let bestCleaner = null;
        Object.entries(counts).forEach(([name, count]) => {
            if (count > maxWins) { maxWins = count; bestCleaner = name; }
        });
        currentGoatName = bestCleaner;
        if(cleaningModal.style.display === 'flex') {
            renderCleaningTable(); 
            applyDataToTable(cleaningDataCache);
        }
    }

    function isWeekLocked(mondayDate) {
    const sundayDate = new Date(mondayDate);
    sundayDate.setDate(mondayDate.getDate() + 6);
    const lockDate = new Date(sundayDate);
    lockDate.setDate(lockDate.getDate() + 2); 
    lockDate.setHours(23, 59, 59, 999);
    
    // === MODIFICATION : DATE DE RÉFÉRENCE LOCK (SHIFT 02h10) ===
    const now = new Date();
    if (now.getHours() < 2 || (now.getHours() === 2 && now.getMinutes() <= 10)) {
        now.setDate(now.getDate() - 1);
    }
    // ===========================================================
    
    return now > lockDate;
}

    function calculateWeeklyStats() {
        const stats = {};
        const schedule = cleaningDataCache.schedule || {};
        
        // 1. Planning (inchangé)
        Object.values(schedule).forEach(entry => {
            const list = Array.isArray(entry) ? entry : [entry];
            list.forEach(p => { 
                if (!stats[p.name]) stats[p.name] = 0;
                const pointsToAdd = p.points ? p.points : 1; 
                stats[p.name] += pointsToAdd;
            });
        });

        // 2. Tâches additionnelles (MODIFIÉ)
        const additional = cleaningDataCache.additionalTasks || [];
        additional.forEach(task => { 
            if (!stats[task.cleaner]) stats[task.cleaner] = 0; 
            // On utilise task.points s'il existe, sinon 1 par défaut
            const pts = task.points ? parseInt(task.points) : 1;
            stats[task.cleaner] += pts; 
        });

        // ... suite de la fonction inchangée (tri, affichage champion) ...
        const sortedStats = Object.entries(stats).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
        if (sortedStats.length > 0) {
            const top = sortedStats[0];
            championNameDisplay.textContent = `${top.name} (${top.count})`;
            if (sortedStats.length > 1 && sortedStats[1].count === top.count) championNameDisplay.textContent += " (Ex-aequo)";
            return top.name; 
        } else {
            championNameDisplay.textContent = "...";
            return null;
        }
    }

    // --- NOUVEAU : Fonction pour retrouver la vraie dernière date si on décoche ---
    async function findLastDoneBefore(taskId, beforeDateStr) {
        const { collection, query, where, getDocs, orderBy } = window.firebaseTools;
        
        try {
            // On cherche tous les plannings antérieurs à la semaine en cours, du plus récent au plus vieux
            const q = query(collection(db, "cleaningSchedules"), where("weekStart", "<", beforeDateStr), orderBy("weekStart", "desc"));
            const snapshot = await getDocs(q);
            
            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                const schedule = data.schedule || {};
                let bestInThisPastWeek = null;
                
                for (const [key, cleaners] of Object.entries(schedule)) {
                    if (!cleaners || cleaners.length === 0) continue;
                    
                    const lastUnderscoreIndex = key.lastIndexOf('_');
                    if (lastUnderscoreIndex === -1) continue;
                    
                    const tId = key.substring(0, lastUnderscoreIndex);
                    const dayIdx = key.substring(lastUnderscoreIndex + 1);
                    
                    if (tId === taskId) {
                        // On recalcule la date exacte de cette action passée
                        const parts = data.weekStart.split('-');
                        const taskDate = new Date(parts[0], parts[1] - 1, parts[2]);
                        taskDate.setDate(taskDate.getDate() + parseInt(dayIdx));
                        
                        const taskDateStr = formatDateForStorage(taskDate);
                        const cleanerNames = cleaners.map(c => c.name).join(' & ');
                        
                        if (!bestInThisPastWeek || taskDateStr > bestInThisPastWeek.date) {
                            bestInThisPastWeek = { date: taskDateStr, who: cleanerNames };
                        }
                    }
                }
                
                // Dès qu'on trouve une semaine où la tâche a été faite, on renvoie le résultat et on arrête la recherche
                if (bestInThisPastWeek) return bestInThisPastWeek;
            }
        } catch (error) {
            console.error("Erreur lors de la recherche de l'historique :", error);
        }
        return null;
    }

    async function saveCleaningDataImmediately(dateRef, dataToSave) {
        const docId = `cleaning_${formatDateForStorage(dateRef)}`;
        const dateKey = formatDateForStorage(dateRef);
        const docRef = doc(db, "cleaningSchedules", docId);
        
        // Calcul des bornes de la semaine
        const weekStartStr = dateKey;
        const weekEnd = new Date(dateRef);
        weekEnd.setDate(dateRef.getDate() + 6);
        const weekEndStr = formatDateForStorage(weekEnd);
        
        if(cleaningSaveStatus) cleaningSaveStatus.textContent = "Sauvegarde...";
        
        try {
            // 1. Sauvegarde du planning (Inchangé)
            await setDoc(docRef, { 
                weekStart: dateKey,
                schedule: dataToSave.schedule || {},
                additionalTasks: dataToSave.additionalTasks || [],
                lastUpdate: Date.now()
            });

            // 2. MISE À JOUR "DERNIÈRE FOIS" (CORRIGÉE & STRICTE SUR LES IDs)
            let updatesToLastDone = {};
            const schedule = dataToSave.schedule || {};
            
            // On prépare la liste plate des tâches pour avoir la correspondance ID <-> Nom
            let flatTaskList = [];
            cleaningTasksConfig.forEach(g => g.tasks.forEach(t => flatTaskList.push(t)));

            // A. On analyse ce qu'il se passe CETTE SEMAINE
            // On stocke le résultat par ID de tâche : { "task_123...": { date: "2026-01-26", who: "Alexandre" } }
            let currentWeekBest = {}; 

            for (const [key, cleaners] of Object.entries(schedule)) {
                if (!cleaners || !Array.isArray(cleaners) || cleaners.length === 0) continue;
                
                // Extraction ID et Index Jour
                const lastUnderscoreIndex = key.lastIndexOf('_');
                if (lastUnderscoreIndex === -1) continue;

                const taskId = key.substring(0, lastUnderscoreIndex);
                const dayIdx = key.substring(lastUnderscoreIndex + 1);

                // On vérifie que c'est une tâche connue
                const taskObj = flatTaskList.find(t => t.id === taskId);
                
                if (taskObj) {
                    const taskDate = new Date(dateRef);
                    taskDate.setDate(dateRef.getDate() + parseInt(dayIdx));
                    const taskDateStr = formatDateForStorage(taskDate);
                    const cleanerNames = cleaners.map(c => c.name).join(' & ');

                    // On garde la date la plus récente trouvée DANS CETTE SEMAINE pour cet ID
                    if (!currentWeekBest[taskId] || taskDateStr > currentWeekBest[taskId].date) {
                        currentWeekBest[taskId] = { date: taskDateStr, who: cleanerNames };
                    }
                }
            }

            // B. On compare avec l'historique global
            for (const taskObj of flatTaskList) {
                const tId = taskObj.id;
                
                // On récupère ce qu'on sait déjà (support ID ou ancien Nom pour transition)
                let currentEntry = taskLastDoneCache[tId] || taskLastDoneCache[taskObj.name];
                
                let knownDateStr = null;
                if (currentEntry) {
                    knownDateStr = (typeof currentEntry === 'object') ? currentEntry.date : currentEntry;
                }

                const bestInWeek = currentWeekBest[tId]; // Ce qu'on a trouvé cette semaine pour cet ID

                // Est-ce que l'historique actuel pointe vers un jour de CETTE semaine ?
                const isHistoryInThisWeek = knownDateStr && knownDateStr >= weekStartStr && knownDateStr <= weekEndStr;

                if (isHistoryInThisWeek) {
                    // CAS 1 : L'historique venait de cette semaine
                    if (bestInWeek) {
                        // Il y a toujours une tâche cette semaine, on met à jour avec les dernières infos
                        const newEntry = { date: bestInWeek.date, who: bestInWeek.who };
                        updatesToLastDone[tId] = newEntry;
                        taskLastDoneCache[tId] = newEntry; 
                    } else {
                        // CAS 2 : La tâche a été décochée (gommée) de la semaine
                        // NOUVEAU : On cherche la vraie dernière date dans le passé avant de supprimer aveuglément !
                        const previousEntry = await findLastDoneBefore(tId, weekStartStr);
                        
                        if (previousEntry) {
                            updatesToLastDone[tId] = previousEntry;
                            taskLastDoneCache[tId] = previousEntry;
                        } else {
                            // S'il n'y a vraiment rien avant, on supprime
                            updatesToLastDone[tId] = window.firebaseTools.deleteField(); 
                            delete taskLastDoneCache[tId];
                            
                            // Nettoyage aussi de l'ancienne clé "Nom" si elle existait
                            if (taskLastDoneCache[taskObj.name]) {
                                 updatesToLastDone[taskObj.name] = window.firebaseTools.deleteField();
                                 delete taskLastDoneCache[taskObj.name];
                            }
                        }
                    }
                } else {
                    // CAS 3 : L'historique est vieux (semaine précédente ou vide)
                    if (bestInWeek) {
                        // On vient de faire la tâche cette semaine, c'est donc plus récent -> Update
                        if (!knownDateStr || bestInWeek.date > knownDateStr) {
                            const newEntry = { date: bestInWeek.date, who: bestInWeek.who };
                            updatesToLastDone[tId] = newEntry;
                            taskLastDoneCache[tId] = newEntry;
                        }
                    }
                }
            }

            // Envoi des modifications à Firestore
            if (Object.keys(updatesToLastDone).length > 0) {
                await setDoc(doc(db, "cleaningSettings", "lastDone"), updatesToLastDone, { merge: true });
            }

            // ... (Reste de la fonction Stats inchangée ci-dessous) ...
            
            // 3. Gestion Stats / GOAT
            const currentWeekStats = {};
            Object.values(dataToSave.schedule || {}).forEach(entry => {
                const list = Array.isArray(entry) ? entry : [entry];
                list.forEach(p => { 
                    currentWeekStats[p.name] = (currentWeekStats[p.name] || 0) + 1; 
                });
            });
            (dataToSave.additionalTasks || []).forEach(task => { 
                currentWeekStats[task.cleaner] = (currentWeekStats[task.cleaner] || 0) + 1; 
            });

            const weeklyWinner = calculateWeeklyStats(); 
            const statsRef = doc(db, "cleaningStats", "global");
            
            const updatePayload = {
                [`history.${dateKey}`]: weeklyWinner ? weeklyWinner : window.firebaseTools.deleteField(),
                [`weeklySummaries.${dateKey}`]: currentWeekStats
            };

            await updateDoc(statsRef, updatePayload).catch(async (err) => {
                if (err.code === 'not-found') {
                    await setDoc(statsRef, {
                        history: { [dateKey]: weeklyWinner },
                        weeklySummaries: { [dateKey]: currentWeekStats }
                    });
                }
            });

            // Update local cache
            if (!globalStatsCache.history) globalStatsCache.history = {};
            if (!globalStatsCache.weeklySummaries) globalStatsCache.weeklySummaries = {};
            
            if (weeklyWinner) globalStatsCache.history[dateKey] = weeklyWinner;
            else delete globalStatsCache.history[dateKey];
            globalStatsCache.weeklySummaries[dateKey] = currentWeekStats;

            calculateGoat();
            
            if(cleaningSaveStatus) { cleaningSaveStatus.textContent = "Synchronisé ✅"; cleaningSaveStatus.style.color = "#27ae60"; }
            
            // On rafraîchit le tableau pour voir le "Fait aujourd'hui" apparaître
            renderCleaningTable();
            applyDataToTable(cleaningDataCache);

        } catch (e) { 
            console.error("Erreur sauvegarde:", e); 
            if(cleaningSaveStatus) cleaningSaveStatus.textContent = "Erreur ❌"; 
        }
    }
    
    function updateHallOfFame() {
    const scores = {};

    // 1. Calcul des scores (Planning + Tâches exceptionnelles)
    if (cleaningDataCache) {
        // A. Planning
        if (cleaningDataCache.schedule) {
            Object.values(cleaningDataCache.schedule).forEach(cleanersList => {
                cleanersList.forEach(p => {
                    const pts = (p.points && typeof p.points === 'number') ? p.points : 1;
                    if (!scores[p.name]) scores[p.name] = 0;
                    scores[p.name] += pts;
                });
            });
        }
        // B. Tâches exceptionnelles (Important pour les points bonus !)
        if (cleaningDataCache.additionalTasks) {
            cleaningDataCache.additionalTasks.forEach(task => {
                if (!scores[task.cleaner]) scores[task.cleaner] = 0;
                scores[task.cleaner] += 1; // 1 point par tâche exceptionnelle
            });
        }
    }

    // 2. Tri
    const sortedCleaners = Object.entries(scores)
        .sort(([, scoreA], [, scoreB]) => scoreB - scoreA);

    // 3. Définition du ROI (Variable globale utilisée par renderCleaningTable)
    if (sortedCleaners.length > 0) {
        currentGoatName = sortedCleaners[0][0];
    } else {
        currentGoatName = "";
    }

    // 4. Affichage (Optionnel : si tu as créé une div "hall-of-fame-list" quelque part)
    // Si tu n'as pas cette div dans ton HTML, cette partie ne fera rien, mais le calcul du Roi fonctionnera quand même.
    const listContainer = document.getElementById('hall-of-fame-list');
    if (listContainer) {
        listContainer.innerHTML = '';
        sortedCleaners.forEach(([name, score], index) => {
            const div = document.createElement('div');
            div.className = 'hof-entry';
            const rankIcon = index === 0 ? '👑' : `${index + 1}.`;
            // ... (reste de ton affichage)
            div.innerHTML = `<span class="hof-rank">${rankIcon}</span> <span>${name}</span> <span>${score} pts</span>`;
            listContainer.appendChild(div);
        });
    }
}

    // Update Leaderboard Modal
    function updateLeaderboardModal() {
        // --- 1. CLASSEMENT SEMAINE (MISE À JOUR : POINTS & BONUS) ---
        const weeklyDetails = {}; // Format: { "Alex": { points: 0, tasks: 0 } }
        
        const schedule = cleaningDataCache.schedule || {};
        
        // A. On parcourt le planning (Cases du tableau)
        Object.values(schedule).forEach(entry => {
            const list = Array.isArray(entry) ? entry : [entry];
            list.forEach(p => {
                if (!weeklyDetails[p.name]) weeklyDetails[p.name] = { points: 0, tasks: 0 };
                
                // Si p.points existe (cas du bonus = 2), on l'utilise, sinon 1 point par défaut
                const pts = p.points ? p.points : 1;
                
                weeklyDetails[p.name].points += pts;
                weeklyDetails[p.name].tasks += 1;
            });
        });

        // B. On parcourt les tâches exceptionnelles (supposées valoir 1 point / 1 tâche)
        const additional = cleaningDataCache.additionalTasks || [];
        additional.forEach(task => {
            if (!weeklyDetails[task.cleaner]) weeklyDetails[task.cleaner] = { points: 0, tasks: 0 };
            
            const pts = task.points ? parseInt(task.points) : 1;
            
            weeklyDetails[task.cleaner].points += pts;
            weeklyDetails[task.cleaner].tasks += 1; // On compte toujours 1 action, mais X points
        });

        // C. Tri par POINTS (et non plus par nombre de tâches)
        const sortedWeekly = Object.entries(weeklyDetails).map(([name, data]) => ({
            name, 
            ...data
        })).sort((a, b) => b.points - a.points);

        // D. Affichage
        leaderboardList.innerHTML = '';
        if (sortedWeekly.length === 0) leaderboardList.innerHTML = '<p>Rien cette semaine.</p>';
        else {
            sortedWeekly.forEach((player, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                const rankIcon = medals[index] || '';
                
                // Calcul du bonus affiché (Points totaux - Nombre de tâches)
                // Ex: 2 points - 1 tâche = 1 bonus
                const bonusCount = player.points - player.tasks;
                
                // Construction du texte : "2 points 1 tâche (+1 bonus)"
                let detailText = `<b>${player.points}</b> pts`;
                detailText += ` <span style="font-size:0.85em; font-weight:normal;">${player.tasks} tâche${player.tasks > 1 ? 's' : ''}`;
                
                if (bonusCount > 0) {
                    detailText += ` <span style="color:#e74c3c; font-weight:bold;">(+${bonusCount} bonus)</span>`;
                }
                detailText += `</span>`;

                leaderboardList.innerHTML += `
                    <div class="leaderboard-row" style="justify-content:space-between;">
                        <span>${rankIcon} ${player.name}</span>
                        <span class="score-badge" style="background:#ecf0f1; color:#2c3e50; border:1px solid #ddd;">
                            ${detailText}
                        </span>
                    </div>`;
            });
        }

        // --- 2. CLASSEMENT GLOBAL (HALL OF FAME) - INCHANGÉ (Compte brut) ---
        
        // A. Calcul des Victoires (Top Semaine)
        const winsCount = {};
        Object.values(globalStatsCache.history || {}).forEach(winnerName => { 
            winsCount[winnerName] = (winsCount[winnerName] || 0) + 1; 
        });

        // B. Calcul du Total de Tâches "All Time"
        const totalTasksCount = {};
        const summaries = globalStatsCache.weeklySummaries || {};
        
        Object.values(summaries).forEach(weekStats => {
            Object.entries(weekStats).forEach(([name, count]) => {
                // Ici 'count' est le nombre d'occurrences (tâches), pas les points. C'est parfait.
                totalTasksCount[name] = (totalTasksCount[name] || 0) + count;
            });
        });

        // C. Création de la liste combinée pour le tri
        const allNames = new Set([...Object.keys(winsCount), ...Object.keys(totalTasksCount)]);
        const rankingList = [];

        allNames.forEach(name => {
            rankingList.push({
                name: name,
                wins: winsCount[name] || 0,
                totalTasks: totalTasksCount[name] || 0
            });
        });

        // D. Tri : D'abord par Victoires, ensuite par Total Tâches
        rankingList.sort((a, b) => {
            if (b.wins !== a.wins) {
                return b.wins - a.wins; // Priorité aux victoires
            }
            return b.totalTasks - a.totalTasks; // Départage aux tâches totales
        });

        // E. Affichage
        globalLeaderboardList.innerHTML = '';
        if (rankingList.length === 0) globalLeaderboardList.innerHTML = '<p>Pas encore assez de données.</p>';
        else {
            rankingList.forEach((player, index) => {
                const rankClass = index < 3 ? `rank-${index+1}` : '';
                const icon = ['👑', '🥈', '🥉'][index] || '🏅';
                
                let detailText = `<b>${player.wins}</b> Titre(s)`;
                if (player.totalTasks > 0) {
                    detailText += ` <span style="font-size:0.8em; font-weight:normal; color:#555;">(${player.totalTasks} tâches au total)</span>`;
                }

                globalLeaderboardList.innerHTML += `
                    <div class="global-row ${rankClass}">
                        <span>${icon} ${player.name}</span>
                        <div style="text-align:right;">${detailText}</div>
                    </div>`;
            });
        }
    }
    
function updateCellVisual(cell, cleanersList) {
    // 1. On vérifie si c'était une case bonus
    const isBonus = cell.classList.contains('bonus-active');
    
    // 2. Calcul de la date de la cellule
    const dayIdx = parseInt(cell.dataset.dayIdx);
    const cellDate = new Date(currentCleaningMonday); 
    cellDate.setDate(currentCleaningMonday.getDate() + dayIdx);
    cellDate.setHours(0,0,0,0);
    
    // === MODIFICATION : DATE DE RÉFÉRENCE VISUEL (SHIFT 02h10) ===
    const now = new Date();
    if (now.getHours() < 2 || (now.getHours() === 2 && now.getMinutes() <= 10)) {
        now.setDate(now.getDate() - 1);
    }
    const today = new Date(now);
    today.setHours(0,0,0,0);
    // ==============================================================
    
    const isToday = cellDate.getTime() === today.getTime();

    // 3. Réinitialisation complète
    cell.innerHTML = ''; 
    // On réinitialise la classe à "cleaning-cell" uniquement.
    // Cela supprime "bonus-active" qui aurait pu être ajouté par la boucle de rendu.
    cell.className = 'cleaning-cell'; 
    cell.style.background = ''; 
    cell.style.backgroundColor = ''; 

    // --- MODIFICATION ICI ---
    // On ne remet la classe 'bonus-active' (qui fait clignoter) QUE si c'est Aujourd'hui.
    // Les jours passés ou futurs resteront statiques, même s'ils étaient éligibles au bonus.
    if (isBonus && isToday) {
        cell.classList.add('bonus-active');
    }

    // 4. CAS 1 : Case VIDE (Personne n'a encore nettoyé)
    if (isBonus && (!cleanersList || cleanersList.length === 0)) {
        if (isToday) {
            // Affichage complet pour aujourd'hui
            cell.innerHTML = `
                <div class="bonus-message-container">
                    <div class="bonus-big-text">+1</div>
                    <div class="bonus-sub-text">À faire !</div>
                </div>
            `;
        } else {
            // On laisse vide pour les autres jours pour éviter la pollution visuelle
            cell.innerHTML = ''; 
        }
        return; 
    }

    // 5. CAS 2 : Case REMPLIE (Le reste du code ne change pas)
    if (!cleanersList || cleanersList.length === 0) return;

    const hasBonus = cleanersList.some(p => p.points && p.points > 1);

    if (hasBonus) {
        const indicator = document.createElement('div');
        indicator.className = 'bonus-done-indicator';
        indicator.textContent = '+1'; 
        indicator.title = 'Tâche Bonus validée !';
        cell.appendChild(indicator);
    }

    const getBadge = (name) => (name === currentGoatName) ? '<span class="goat-badge">👑</span>' : '';

    const getColor = (cleanerObj) => {
        if (CLEANER_COLORS[cleanerObj.name]) return CLEANER_COLORS[cleanerObj.name];
        if (cleanerObj.color && cleanerObj.color.startsWith('#')) return cleanerObj.color;
        return '#ccc';
    };

    if (cleanersList.length === 1) {
        const p = cleanersList[0];
        const color = getColor(p);
        const nameSpan = document.createElement('span');
        nameSpan.className = 'name-single';
        nameSpan.innerHTML = `${p.name} ${getBadge(p.name)}`;
        cell.appendChild(nameSpan);
        cell.style.backgroundColor = color;

    } else if (cleanersList.length >= 2) {
        const p1 = cleanersList[0];
        const p2 = cleanersList[1];
        
        const span1 = document.createElement('span');
        span1.className = 'name-top-left';
        span1.innerHTML = `${p1.name} ${getBadge(p1.name)}`;
        
        const span2 = document.createElement('span');
        span2.className = 'name-bottom-right';
        span2.innerHTML = `${getBadge(p2.name)} ${p2.name}`;

        cell.appendChild(span1);
        cell.appendChild(span2);

        const c1 = getColor(p1);
        const c2 = getColor(p2);
        cell.style.background = `linear-gradient(to bottom right, ${c1} 0%, ${c1} 49%, #333 49%, #333 51%, ${c2} 51%, ${c2} 100%)`;
    }
}

    // Navigation & Modals
    if(openCleaningBtn) {
        openCleaningBtn.addEventListener('click', () => {
            cleaningModal.style.display = 'flex';
            loadCleaningWeek(currentCleaningMonday);
        });
    }
    
    // Fermeture des modals
    [pinModal, cleanersMgmtModal].forEach(modal => {
        modal.querySelector('.close-button').addEventListener('click', () => modal.style.display = 'none');
        window.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });
    });

    // Onglets
    tabWeekly.addEventListener('click', () => { tabWeekly.classList.add('active'); tabGlobal.classList.remove('active'); contentWeekly.style.display = 'block'; contentGlobal.style.display = 'none'; });
    tabGlobal.addEventListener('click', () => { tabGlobal.classList.add('active'); tabWeekly.classList.remove('active'); contentGlobal.style.display = 'block'; contentWeekly.style.display = 'none'; });
    
    if(openLeaderboardBtn) openLeaderboardBtn.addEventListener('click', () => { updateLeaderboardModal(); leaderboardModal.style.display = 'flex'; });
    if(closeLeaderboardBtn) closeLeaderboardBtn.addEventListener('click', () => leaderboardModal.style.display = 'none');
    window.addEventListener('click', async (e) => {
        if(e.target === leaderboardModal) leaderboardModal.style.display = 'none';
        if(e.target === cleaningModal) await closeCleaningModal();
    });

    const closeCleaningModal = async () => { 
        await forcePendingSave(); 
        
        // AJOUT : On coupe l'écouteur quand on ferme le modal
        if (currentCleaningUnsub) {
            currentCleaningUnsub();
            currentCleaningUnsub = null;
        }
        
        cleaningModal.style.display = 'none'; 
    };
    if(cleaningModal) cleaningModal.querySelector('.close-button').addEventListener('click', closeCleaningModal);

    // Navigation Semaine
    document.getElementById('cleaning-prev-week').addEventListener('click', async () => { await forcePendingSave(); currentCleaningMonday.setDate(currentCleaningMonday.getDate() - 7); loadCleaningWeek(currentCleaningMonday); });
    document.getElementById('cleaning-next-week').addEventListener('click', async () => { await forcePendingSave(); currentCleaningMonday.setDate(currentCleaningMonday.getDate() + 7); loadCleaningWeek(currentCleaningMonday); });

    async function forcePendingSave() {
        if (cleaningSaveTimer) { clearTimeout(cleaningSaveTimer); cleaningSaveTimer = null; await saveCleaningDataImmediately(currentCleaningMonday, {...cleaningDataCache}); }
    }

    // --- RENDU DU TABLEAU (CORRIGÉ : STRUCTURE STRICTE) ---
function renderCleaningTable() {
        cleaningTableBody.innerHTML = '';
        
        const now = new Date();
        if (now.getHours() < 2 || (now.getHours() === 2 && now.getMinutes() <= 10)) {
            now.setDate(now.getDate() - 1);
        }
        const today = new Date(now);
        today.setHours(0,0,0,0);

        cleaningTasksConfig.forEach(group => {
            group.tasks.forEach((taskObj, index) => {
                const tr = document.createElement('tr');
                
                // 1. Colonne Catégorie (inchangée)
                if (index === 0) {
                    const tdCat = document.createElement('td');
                    tdCat.textContent = group.cat; 
                    tdCat.rowSpan = group.tasks.length; 
                    tdCat.className = 'cleaning-category'; 
                    tr.appendChild(tdCat);
                }
                
                // 2. Colonne Tâche + "Dernière fois" (inchangée)
                const tdTask = document.createElement('td'); 
                tdTask.className = 'cleaning-task'; 
                let lastDoneText = "Jamais fait"; 
                let whoDidIt = ""; 
                let lastDoneDateObj = null; 

                const entry = taskLastDoneCache[taskObj.id] || taskLastDoneCache[taskObj.name];
                if (entry) {
                    const dateStr = (typeof entry === 'object') ? entry.date : entry;
                    if (typeof entry === 'object' && entry.who) whoDidIt = ` par ${entry.who}`;

                    if(dateStr) {
                        const parts = dateStr.split('-');
                        lastDoneDateObj = new Date(parts[0], parts[1] - 1, parts[2]); 
                        
                        const diffTime = today.getTime() - lastDoneDateObj.getTime();
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                        
                        if (diffDays === 0) lastDoneText = `<span style="color:#27ae60; font-weight:bold;">Fait aujourd'hui</span>`;
                        else if (diffDays === 1) lastDoneText = "Fait hier";
                        else if (diffDays > 0) lastDoneText = `Fait il y a ${diffDays}j`;
                        else if (diffDays < 0) lastDoneText = `<span style="color:#27ae60; font-weight:bold;">Fait aujourd'hui</span>`;
                    }
                }
                
                // --- MODIFICATION ICI : DATE PAR DÉFAUT (RESET) ---
                // Si la tâche n'a jamais été faite (lastDoneDateObj est null),
                // on force la date du 25 Janvier 2026 pour le calcul des bonus.
                // Note : Les mois commencent à 0 en JS (0 = Janvier)
                if (!lastDoneDateObj) {
                    lastDoneDateObj = new Date(2026, 0, 25); 
                }
                // --------------------------------------------------

                tdTask.innerHTML = `<div class="cleaning-task-name-row"><span>${taskObj.name}</span><button type="button" class="task-history-btn" title="Historique de cette tâche">📋</button></div><span class="task-last-done">${lastDoneText}<b>${whoDidIt}</b></span>`;
                tdTask.querySelector('.task-history-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    openTaskHistoryModal(taskObj.id, taskObj.name);
                });
                tr.appendChild(tdTask);
                
                // 3. Colonnes Jours (Lundi -> Dimanche)
                const deadline = taskObj.deadline || 0; 

                for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
                    const tdDay = document.createElement('td'); 
                    tdDay.className = 'cleaning-cell'; 
                    
                    // Données essentielles
                    tdDay.dataset.taskId = taskObj.id; 
                    tdDay.dataset.taskName = taskObj.name; 
                    tdDay.dataset.dayIdx = dayIdx; 
                    
                    // --- CALCUL DU BONUS ---
                    const cellDate = new Date(currentCleaningMonday);
                    cellDate.setDate(currentCleaningMonday.getDate() + dayIdx);
                    cellDate.setHours(0,0,0,0);

                    let isBonus = false;

                    // Logique Bonus
                    if (deadline > 0 && cellDate <= today) {
                        if (lastDoneDateObj) {
                            const diffTime = cellDate.getTime() - lastDoneDateObj.getTime();
                            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                            
                            // Si le délai est dépassé par rapport à la dernière fois (ou au 25/01/26)
                            if (diffDays > deadline) {
                                isBonus = true;
                            }
                        } else {
                            // Ce cas "else" ne devrait plus arriver grâce au correctif ci-dessus,
                            // mais on le laisse par sécurité.
                            isBonus = true;
                        }
                    }

                    if (isBonus) {
                        tdDay.classList.add('bonus-active');
                    }

                    tdDay.addEventListener('click', () => handleCleaningCellClick(tdDay)); 
                    tr.appendChild(tdDay);
                }
                cleaningTableBody.appendChild(tr); 
            });
        });
    }

    async function loadCleaningWeek(mondayDate) {
        const sundayDate = new Date(mondayDate); sundayDate.setDate(mondayDate.getDate() + 6);
        cleaningWeekDisplay.textContent = `Semaine du ${formatDateFr(mondayDate)} au ${formatDateFr(sundayDate)}`;
        
        const isLocked = isWeekLocked(mondayDate);
        if (isLocked) { cleaningTable.classList.add('locked-week'); lockMessage.style.display = 'block'; cleaningSaveStatus.style.display = 'none'; }
        else { cleaningTable.classList.remove('locked-week'); lockMessage.style.display = 'none'; cleaningSaveStatus.style.display = 'block'; }

        const docId = `cleaning_${formatDateForStorage(mondayDate)}`;
        renderCleaningTable(); 
        if(cleaningSaveStatus) cleaningSaveStatus.textContent = "Chargement...";

        // MODIFICATION : Arrêt de l'ancien écouteur s'il existe pour ne pas en accumuler
        if (currentCleaningUnsub) {
            currentCleaningUnsub();
            currentCleaningUnsub = null;
        }

        try {
            const docRef = doc(db, "cleaningSchedules", docId);
            
            currentCleaningUnsub = onSnapshot(docRef, (docSnap) => {
                cleaningDataCache = { schedule: {}, additionalTasks: [] }; 
                
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    cleaningDataCache.schedule = data.schedule || {};
                    cleaningDataCache.additionalTasks = data.additionalTasks || [];
                }
                
                // --- CORRECTION DE L'ORDRE D'AFFICHAGE ---

                // 1. D'abord les Calculs (Stats & Définition du Roi)
                calculateWeeklyStats(); 
                updateHallOfFame();

                // 2. Ensuite la Structure (Tableau vide & Liste tâches supp)
                // renderCleaningTable a besoin du Roi (calculé juste avant)
                renderCleaningTable(); 
                renderAdditionalTasksInterface(); 

                // 3. ENFIN le Remplissage (On met les noms et couleurs dans les cases)
                // applyDataToTable a besoin que le tableau (renderCleaningTable) soit déjà dessiné
                applyDataToTable(cleaningDataCache); 
                
                // ------------------------------------------

                if(cleaningSaveStatus) cleaningSaveStatus.textContent = "Synchronisé";
            });

        } catch (e) { console.error("Erreur:", e); if(cleaningSaveStatus) cleaningSaveStatus.textContent = "Erreur chargement"; }
    }

    function applyDataToTable(data) {
        const schedule = data.schedule || {};
        document.querySelectorAll('.cleaning-cell').forEach(cell => updateCellVisual(cell, []));
        
        for (const [key, rawInfo] of Object.entries(schedule)) {
            // CORRECTION : On découpe en partant du DERNIER underscore pour séparer l'ID du Jour
            // Ex: "task_123_abc_0" devient "task_123_abc" et "0"
            const lastUnderscoreIndex = key.lastIndexOf('_');
            if (lastUnderscoreIndex === -1) continue;

            const taskId = key.substring(0, lastUnderscoreIndex);
            const dayIdx = key.substring(lastUnderscoreIndex + 1);

            const cell = document.querySelector(`.cleaning-cell[data-task-id="${taskId}"][data-day-idx="${dayIdx}"]`);
            if (cell && rawInfo) {
                const list = Array.isArray(rawInfo) ? rawInfo : [rawInfo];
                updateCellVisual(cell, list);
            }
        }
    }

    async function addCleaningLog(action, details, targetPerson, extra = {}) {
    // 1. Génère un ID unique pour le document du jour (ex: logs_2026-01-26)
    // L'utilisation de 'fr-CA' assure le format YYYY-MM-DD
    const todayStr = new Date().toLocaleDateString('fr-CA');
    const docId = `logs_${todayStr}`;
    const docRef = doc(db, "cleaningLogs", docId);

    // 2. L'objet log individuel
    // `extra` porte les champs machine (taskId/dayIdx/weekStart pour une case du planning,
    // exceptionalTaskId/weekStart pour une tâche exceptionnelle) utilisés par la Vérification
    // pour retrouver puis retirer précisément l'entrée du calendrier.
    const newEntry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        action: action,       // 'add' ou 'remove'
        details: details,
        targetPerson: targetPerson,
        timestamp: Date.now(),
        ...extra
    };

    try {
        // 3. arrayUnion ajoute l'élément au tableau 'entries' sans écraser le reste
        // setDoc avec { merge: true } crée le document s'il n'existe pas encore aujourd'hui
        await setDoc(docRef, {
            dateString: todayStr,
            entries: window.firebaseTools.arrayUnion(newEntry)
        }, { merge: true });
        
    } catch (e) {
        console.error("Erreur log", e);
    }
}

function handleCleaningCellClick(cell) {
        if (isWeekLocked(currentCleaningMonday)) return;
        if (!selectedCleaner) return; 

        const dayIdx = parseInt(cell.dataset.dayIdx);
        // ... (Vérification prophète inchangée) ...
        const cellDate = new Date(currentCleaningMonday);
        cellDate.setDate(currentCleaningMonday.getDate() + dayIdx);
        cellDate.setHours(0,0,0,0);
        const now = new Date();
        if (now.getHours() < 2 || (now.getHours() === 2 && now.getMinutes() <= 10)) {
            now.setDate(now.getDate() - 1);
        }
        const today = new Date(now);
        today.setHours(0,0,0,0);
        if (cellDate > today) { document.getElementById('prophet-modal').style.display = 'flex'; return; }

        const taskId = cell.dataset.taskId;
        const taskName = cell.dataset.taskName;
        const key = `${taskId}_${dayIdx}`;
        const weekStartKey = formatDateForStorage(currentCleaningMonday);

        // Tâche retirée suite à un contrôle de Vérification : bloquée pour tout le monde
        // tant qu'un admin n'a pas rentré le code (voir openAdminGate plus bas).
        if (selectedCleaner !== 'eraser' && blockedTasksCache[taskId]) {
            openAdminGate(`⛔ "${taskName}" a été supprimée par les responsables suite à un contrôle.\nEntrez le code admin pour la réattribuer.`, async () => {
                delete blockedTasksCache[taskId];
                await setDoc(doc(db, "cleaningSettings", "blockedTasks"), { [taskId]: window.firebaseTools.deleteField() }, { merge: true });
                handleCleaningCellClick(cell);
            });
            return;
        }

        let currentList = [];
        if (!cleaningDataCache.schedule) cleaningDataCache.schedule = {};
        const rawData = cleaningDataCache.schedule[key];
        if (rawData) currentList = Array.isArray(rawData) ? [...rawData] : [rawData];

        const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
        const dayName = days[dayIdx];
        
        // DÉTECTION DU BONUS
        // 1. Calcul pour l'AJOUT (On se base sur l'état VISUEL de la case avant clic)
        const isBonusCell = cell.classList.contains('bonus-active');
        const pointsToAward = isBonusCell ? 2 : 1;
        const addLogDetail = isBonusCell ? `"${taskName}" (${dayName}) [BONUS +1]` : `"${taskName}" (${dayName})`;

        if (selectedCleaner === 'eraser') {
            if (currentList.length > 0) {
                // Pour la gomme, on regarde chaque personne supprimée
                currentList.forEach(person => { 
                    // Si la personne avait > 1 point, c'était un bonus pour elle
                    const wasBonus = person.points && person.points > 1;
                    const removeDetail = wasBonus ? `"${taskName}" (${dayName}) [BONUS +1]` : `"${taskName}" (${dayName})`;
                    addCleaningLog('remove', removeDetail, person.name, { type: 'grid', taskId, taskName, dayIdx, weekStart: weekStartKey });
                });
            }
            currentList = []; 
            delete cleaningDataCache.schedule[key]; 
        } else {
            const existingIndex = currentList.findIndex(p => p.name === selectedCleaner.name);
            
            if (existingIndex !== -1) {
                // --- CAS SUPPRESSION ---
                const personToRemove = currentList[existingIndex];
                
                // ICI LA CORRECTION : On vérifie si CETTE personne avait le bonus
                const wasBonus = personToRemove.points && personToRemove.points > 1;
                
                // On génère le texte EXACTEMENT comme il a été créé lors de l'ajout
                const removeDetail = wasBonus ? `"${taskName}" (${dayName}) [BONUS +1]` : `"${taskName}" (${dayName})`;

                addCleaningLog('remove', removeDetail, selectedCleaner.name, { type: 'grid', taskId, taskName, dayIdx, weekStart: weekStartKey });
                currentList.splice(existingIndex, 1);
            } else {
                // --- CAS AJOUT ---
                if (currentList.length >= 2) currentList.pop();

                // On utilise le texte calculé plus haut basé sur la classe CSS
                addCleaningLog('add', addLogDetail, selectedCleaner.name, { type: 'grid', taskId, taskName, dayIdx, weekStart: weekStartKey });

                currentList.push({ 
                    name: selectedCleaner.name, 
                    color: selectedCleaner.color,
                    points: pointsToAward 
                });
            }
            if (currentList.length > 0) cleaningDataCache.schedule[key] = currentList; else delete cleaningDataCache.schedule[key];
        }
        
        updateCellVisual(cell, currentList);
        calculateWeeklyStats(); 
        triggerCleaningSave();
    }

    function renderAdditionalTasksInterface() {
        if (!additionalTasksContainer) return;
        additionalTasksContainer.innerHTML = ''; 

        const sortedEmployees = [...EMPLOYEES].sort((a, b) => a.name.localeCompare(b.name));

        sortedEmployees.forEach(emp => {
            const col = document.createElement('div');
            col.className = 'additional-col';
            
            const header = document.createElement('div');
            header.className = `additional-header`;
            header.textContent = emp.name;
            header.style.backgroundColor = emp.color;
            header.style.border = `1px solid ${adjustColor(emp.color, -40)}`;
            col.appendChild(header);

            // --- MODIFICATION ICI : BOUTON AU LIEU D'INPUT ---
            if (!isWeekLocked(currentCleaningMonday)) {
                const addBtnContainer = document.createElement('div');
                addBtnContainer.style.textAlign = 'center';
                addBtnContainer.style.marginBottom = '10px';
                
                const openModalBtn = document.createElement('button');
                openModalBtn.className = 'add-task-btn-modal'; 
                openModalBtn.innerHTML = '➕ Ajouter une tâche';
                openModalBtn.style.width = "100%";
                
                openModalBtn.onclick = () => openAddExceptionalTaskModal(emp.name);
                
                addBtnContainer.appendChild(openModalBtn);
                col.appendChild(addBtnContainer);
            }
            // -------------------------------------------------

            const list = document.createElement('ul');
            list.className = 'additional-list';
            const tasks = (cleaningDataCache.additionalTasks || []).filter(t => t.cleaner === emp.name);
            
            tasks.forEach(task => {
                const li = document.createElement('li'); 
                li.className = 'additional-item'; 
                
                // AFFICHER LES POINTS DANS LA LISTE
                // On gère la compatibilité si 'points' n'existe pas encore (vieux format)
                const pts = task.points || 1; 
                li.innerHTML = `<span>${task.desc} <b style="color:#e67e22; font-size:0.9em;">(+${pts})</b></span>`;
                
                if (!isWeekLocked(currentCleaningMonday)) {
                    const delBtn = document.createElement('button'); 
                    delBtn.className = 'delete-task-btn'; 
                    delBtn.innerHTML = '&times;';
                    delBtn.onclick = () => removeAdditionalTask(task.id);
                    li.appendChild(delBtn);
                }
                list.appendChild(li);
            });
            col.appendChild(list);
            additionalTasksContainer.appendChild(col);
        });
    }
    
    function removeAdditionalTask(taskId) {
        if (!cleaningDataCache.additionalTasks) return;
        
        // AJOUT : On récupère la tâche avant de la supprimer pour le log
        const taskToRemove = cleaningDataCache.additionalTasks.find(t => t.id === taskId);
        if (taskToRemove) {
            addCleaningLog('remove', `"${taskToRemove.desc}" (Tâche Exceptionnelle)`, taskToRemove.cleaner, { type: 'exceptional', exceptionalTaskId: taskToRemove.id, weekStart: formatDateForStorage(currentCleaningMonday) });
        }

        cleaningDataCache.additionalTasks = cleaningDataCache.additionalTasks.filter(t => t.id !== taskId);
        renderAdditionalTasksInterface(); calculateWeeklyStats(); triggerCleaningSave();
    }

    function triggerCleaningSave() {
        if(cleaningSaveStatus) { cleaningSaveStatus.textContent = "Modifications en cours..."; cleaningSaveStatus.style.color = "#e67e22"; }
        if (cleaningSaveTimer) clearTimeout(cleaningSaveTimer);
        cleaningSaveTimer = setTimeout(() => {
            saveCleaningDataImmediately(currentCleaningMonday, cleaningDataCache);
            cleaningSaveTimer = null; 
        }, 3000);
    }

    function getMonday(d) {
        d = new Date(d);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
        return new Date(d.setDate(diff));
    }
    function formatDateFr(date) { return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); }


    // =========================================================
    // === HISTORIQUE PAR TÂCHE (bouton 📋 sur chaque ligne) ===
    // =========================================================

    // Format long ("23 Avril") réservé à l'historique par tâche — formatDateFr (23/04) reste
    // utilisé partout ailleurs (semaine, titres de modales...).
    function formatDateLong(date) {
        const parts = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }).split(' '); // ["23", "avril"]
        parts[1] = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
        return parts.join(' '); // "23 Avril"
    }

    // entry.details / targetPerson viennent de texte libre (nom de tâche exceptionnelle tapé
    // par un employé, prénom...) : un "<" ou un guillemet dedans casse le HTML injecté via
    // innerHTML et peut fusionner plusieurs lignes en une seule (colonnes qui explosent).
    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    const taskHistoryModal = document.getElementById('task-history-modal');
    const closeTaskHistoryBtn = document.getElementById('close-task-history-modal');
    if (closeTaskHistoryBtn) closeTaskHistoryBtn.addEventListener('click', () => taskHistoryModal.style.display = 'none');
    if (taskHistoryModal) taskHistoryModal.addEventListener('click', (e) => { if (e.target === taskHistoryModal) taskHistoryModal.style.display = 'none'; });

    // Scanne les anciens plannings hebdomadaires (source de vérité) pour retrouver les 10
    // dernières fois où cette tâche a été cochée. Pas de cache dédié : ça reste toujours
    // juste même si une occurrence a été décochée ou retirée par la Vérification.
    async function getTaskHistory(taskId) {
        const { collection: col, query: qy, orderBy: ob, limit: lm, getDocs: gd } = window.firebaseTools;
        const snap = await gd(qy(col(db, "cleaningSchedules"), ob("weekStart", "desc"), lm(60)));
        const results = [];

        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            const schedule = data.schedule || {};
            const weekMatches = [];

            for (const [key, cleaners] of Object.entries(schedule)) {
                if (!cleaners || cleaners.length === 0) continue;
                const lastUnderscoreIndex = key.lastIndexOf('_');
                if (lastUnderscoreIndex === -1) continue;

                const tId = key.substring(0, lastUnderscoreIndex);
                if (tId !== taskId) continue;

                const dayIdx = parseInt(key.substring(lastUnderscoreIndex + 1));
                const parts = data.weekStart.split('-');
                const taskDate = new Date(parts[0], parts[1] - 1, parts[2]);
                taskDate.setDate(taskDate.getDate() + dayIdx);

                weekMatches.push({
                    dateStr: formatDateForStorage(taskDate),
                    dateLabel: formatDateLong(taskDate),
                    who: (Array.isArray(cleaners) ? cleaners : [cleaners]).map(c => c.name).join(' & ')
                });
            }

            results.push(...weekMatches);
            if (results.length >= 10) break;
        }

        results.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
        return results.slice(0, 10);
    }

    async function openTaskHistoryModal(taskId, taskName) {
        document.getElementById('task-history-title').textContent = `📋 ${taskName}`;
        const listEl = document.getElementById('task-history-list');
        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">Chargement...</div>';
        taskHistoryModal.style.display = 'flex';

        try {
            const history = await getTaskHistory(taskId);
            if (history.length === 0) {
                listEl.innerHTML = '<p style="text-align:center; color:#999; font-style:italic;">Jamais effectuée pour l\'instant.</p>';
                return;
            }
            listEl.innerHTML = history.map(h => `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; background:#f9f9f9; border-left:4px solid #27ae60; border-radius:4px; padding:8px 12px;">
                    <span style="font-weight:bold; color:#2c3e50;">${h.dateLabel}</span>
                    <span style="color:#555; font-size:0.9em; text-align:right;">Effectué par <b>${escapeHtml(h.who)}</b></span>
                </div>
            `).join('');
        } catch (e) {
            console.error("Erreur historique tâche:", e);
            listEl.innerHTML = '<p style="text-align:center; color:#e74c3c;">Erreur de chargement de l\'historique.</p>';
        }
    }

    // =========================================================
    // === PORTAIL CODE ADMIN GÉNÉRIQUE (déblocage tâche, bouton minuit) ===
    // =========================================================

    let adminGateCallback = null;
    const adminGateModal = document.getElementById('admin-gate-modal');
    const adminGateInput = document.getElementById('admin-gate-input');
    const adminGateError = document.getElementById('admin-gate-error');

    function openAdminGate(message, onSuccess) {
        document.getElementById('admin-gate-message').textContent = message;
        adminGateInput.value = '';
        adminGateError.style.display = 'none';
        adminGateCallback = onSuccess;
        adminGateModal.style.display = 'flex';
        adminGateInput.focus();
    }

    function validateAdminGate() {
        if (adminGateInput.value === '211005') {
            adminGateModal.style.display = 'none';
            const cb = adminGateCallback;
            adminGateCallback = null;
            adminGateInput.value = '';
            if (cb) cb();
        } else {
            adminGateError.style.display = 'block';
            adminGateInput.value = '';
        }
    }

    const adminGateValidateBtn = document.getElementById('admin-gate-validate-btn');
    if (adminGateValidateBtn) adminGateValidateBtn.addEventListener('click', validateAdminGate);
    if (adminGateInput) adminGateInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') validateAdminGate(); });
    const closeAdminGateBtn = document.getElementById('close-admin-gate-modal');
    if (closeAdminGateBtn) closeAdminGateBtn.addEventListener('click', () => { adminGateModal.style.display = 'none'; adminGateCallback = null; });

    // =========================================================
    // === VÉRIFICATION QUOTIDIENNE (onglet Histo admin + bouton de minuit) ===
    // =========================================================

    let currentVerificationEntries = [];
    let currentVerificationDateStr = null;
    let pendingMidnightDateStr = null;

    const verificationModal = document.getElementById('verification-modal');
    const closeVerificationBtn = document.getElementById('close-verification-modal');
    if (closeVerificationBtn) closeVerificationBtn.addEventListener('click', () => verificationModal.style.display = 'none');
    if (verificationModal) verificationModal.addEventListener('click', (e) => { if (e.target === verificationModal) verificationModal.style.display = 'none'; });

    // Identifie une entrée par ce qu'elle modifie réellement (case du planning ou tâche
    // exceptionnelle) pour pouvoir annuler un aller-retour add/remove du même jour. Fallback sur
    // le texte pour les vieilles entrées sans tracking (pas d'annulation fiable possible pour elles).
    function verificationEntryKey(e) {
        if (e.type === 'grid' && e.taskId) return `grid|${e.taskId}|${e.dayIdx}|${e.weekStart}|${e.targetPerson}`;
        if (e.type === 'exceptional' && e.exceptionalTaskId) return `exc|${e.exceptionalTaskId}|${e.targetPerson}`;
        return `legacy|${e.details}|${e.targetPerson}`;
    }

    async function openVerificationModal(dateStr) {
        currentVerificationDateStr = dateStr;
        const listEl = document.getElementById('verification-list');
        const dateObj = new Date(dateStr + 'T00:00:00');
        document.getElementById('verification-title').textContent = `🔍 Vérification du ${formatDateFr(dateObj)}`;
        listEl.innerHTML = '<div style="text-align:center; padding:30px; color:#999;">Chargement...</div>';
        verificationModal.style.display = 'flex';

        try {
            const snap = await getDoc(doc(db, "cleaningLogs", `logs_${dateStr}`));
            const rawEntries = snap.exists() ? (snap.data().entries || []) : [];

            // Simule la pile add/remove par clé : un aller-retour (add puis remove le même jour)
            // s'annule et ne remonte plus jamais dans la vérification (misclick corrigé direct).
            const outstanding = {};
            [...rawEntries]
                .filter(e => e.action === 'add' || e.action === 'remove')
                .sort((a, b) => a.timestamp - b.timestamp)
                .forEach(e => {
                    const k = verificationEntryKey(e);
                    if (!outstanding[k]) outstanding[k] = [];
                    if (e.action === 'add') outstanding[k].push(e);
                    else outstanding[k].pop(); // annule l'ajout en attente le plus récent pour cette case
                });

            const entries = Object.values(outstanding).flat();
            entries.sort((a, b) => b.timestamp - a.timestamp);
            entries.forEach(e => { e.pendingReject = false; }); // état local du switch, pas encore validé
            currentVerificationEntries = entries;
            renderVerificationList();
        } catch (e) {
            console.error("Erreur chargement vérification:", e);
            listEl.innerHTML = '<p style="text-align:center; color:#e74c3c; padding:30px;">Erreur de chargement.</p>';
        }
    }

    function renderVerificationList() {
        const listEl = document.getElementById('verification-list');
        if (currentVerificationEntries.length === 0) {
            listEl.innerHTML = '<p style="text-align:center; color:#999; font-style:italic; padding:30px;">Aucune tâche écrite ce jour-là.</p>';
            return;
        }

        const VERIF_DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

        listEl.innerHTML = currentVerificationEntries.map(entry => {
            const timeStr = new Date(entry.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const isRejected = !!entry.rejected; // déjà validé lors d'une Vérification précédente : figé
            const isPending = !isRejected && !!entry.pendingReject; // switché sur ❌ mais pas encore "Marqué"
            // Entrées loggées avant l'ajout de la Vérification n'ont pas taskId/dayIdx/weekStart :
            // on ne sait pas quoi retirer du calendrier, donc le switch reste verrouillé pour elles.
            const canToggle = !isRejected && entry.id && entry.type && (entry.type === 'grid' ? entry.taskId : entry.exceptionalTaskId);
            const showRed = isRejected || isPending;

            // Signale en rouge + ⚠️ quand la tâche cochée aujourd'hui est datée d'un AUTRE jour
            // que celui de cette Vérification (ex: on est vendredi et l'entrée dit "(Jeudi)") —
            // pas forcément anormal, mais mérite d'être mis en avant.
            let detailsHtml = escapeHtml(entry.details);
            if (entry.type === 'grid' && entry.weekStart && entry.dayIdx != null) {
                const parts = entry.weekStart.split('-');
                const taskDate = new Date(parts[0], parts[1] - 1, parts[2]);
                taskDate.setDate(taskDate.getDate() + entry.dayIdx);
                const taskDateStr = formatDateForStorage(taskDate);
                if (taskDateStr !== currentVerificationDateStr) {
                    const dayName = VERIF_DAY_NAMES[entry.dayIdx];
                    detailsHtml = detailsHtml.replace(`(${dayName})`, `<span style="color:#e74c3c; font-weight:bold;">⚠️ (${dayName})</span>`);
                }
            }

            return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px; border-bottom:1px solid #eee; width:100%; box-sizing:border-box;">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:bold; color:#2c3e50;">${detailsHtml}</div>
                    <div style="font-size:0.8em; color:#7f8c8d; margin-top:2px;">👤 ${escapeHtml(entry.targetPerson || 'Inconnu')} &nbsp;·&nbsp; 🕐 ${timeStr}${isPending ? ' &nbsp;·&nbsp; <b style="color:#c0392b;">À retirer (en attente)</b>' : ''}</div>
                </div>
                ${canToggle
                    ? `<button type="button" class="verif-toggle-btn" data-entry-id="${entry.id}" style="width:auto; display:flex; align-items:center; gap:2px; border:1px solid #ddd; border-radius:20px; padding:3px; background:#f5f5f5; flex-shrink:0; cursor:pointer;" title="Cliquer pour basculer">
                        <span style="border-radius:16px; padding:4px 9px; font-size:1em; line-height:1; ${showRed ? 'background:transparent; color:#bbb;' : 'background:#27ae60; color:white;'}">✅</span>
                        <span style="border-radius:16px; padding:4px 9px; font-size:1em; line-height:1; ${showRed ? 'background:#c0392b; color:white;' : 'background:transparent; color:#c0392b;'}">❌</span>
                    </button>`
                    : `<div style="display:flex; align-items:center; gap:2px; border:1px solid #ddd; border-radius:20px; padding:3px; background:#f5f5f5; flex-shrink:0;">
                        <span style="border-radius:16px; padding:4px 9px; font-size:1em; line-height:1; ${showRed ? 'background:transparent; color:#bbb;' : 'background:#27ae60; color:white;'}">✅</span>
                        <span style="border-radius:16px; padding:4px 9px; font-size:1em; line-height:1; ${showRed ? 'background:#c0392b; color:white;' : 'background:transparent; color:#ddd;'}" ${!isRejected ? 'title="Ancienne entrée, non modifiable"' : ''}>❌</span>
                    </div>`
                }
            </div>`;
        }).join('');

        // Le switch est 100% local (pas d'écriture Firestore ici) : on bascule pendingReject et on
        // ré-affiche. Rien n'est définitif tant que "Marquer cette journée comme vérifiée" n'a pas
        // été cliqué — c'est ce bouton qui applique réellement les retraits du calendrier.
        listEl.querySelectorAll('.verif-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const entry = currentVerificationEntries.find(e => e.id === btn.dataset.entryId);
                if (!entry || entry.rejected) return;
                entry.pendingReject = !entry.pendingReject;
                renderVerificationList();
            });
        });
    }

    // Retire précisément l'entrée du calendrier (case du planning ou tâche exceptionnelle),
    // bloque la tâche du planning (personne ne peut la recocher sans code admin), et journalise.
    async function rejectVerificationEntry(entry) {
        try {
            const weekDocRef = doc(db, "cleaningSchedules", `cleaning_${entry.weekStart}`);
            const weekSnap = await getDoc(weekDocRef);

            if (weekSnap.exists()) {
                const data = weekSnap.data();

                if (entry.type === 'grid') {
                    const schedule = data.schedule || {};
                    const key = `${entry.taskId}_${entry.dayIdx}`;
                    let list = schedule[key];
                    if (list) {
                        list = (Array.isArray(list) ? list : [list]).filter(p => p.name !== entry.targetPerson);
                        // IMPORTANT : setDoc({schedule}, {merge:true}) fusionne l'objet clé par clé et
                        // ne supprime JAMAIS une clé absente de l'objet envoyé — un simple "delete
                        // schedule[key]" en local n'efface donc rien côté serveur. updateDoc sur le
                        // chemin pointé "schedule.<key>" cible cette clé précisément, deleteField()
                        // la retire vraiment.
                        if (list.length > 0) {
                            schedule[key] = list;
                            await updateDoc(weekDocRef, { [`schedule.${key}`]: list });
                        } else {
                            delete schedule[key];
                            await updateDoc(weekDocRef, { [`schedule.${key}`]: window.firebaseTools.deleteField() });
                        }
                    }

                    blockedTasksCache[entry.taskId] = { name: entry.taskName, blockedAt: Date.now() };
                    await setDoc(doc(db, "cleaningSettings", "blockedTasks"), { [entry.taskId]: blockedTasksCache[entry.taskId] }, { merge: true });

                    if (entry.weekStart === formatDateForStorage(currentCleaningMonday)) {
                        cleaningDataCache.schedule = schedule;
                        renderCleaningTable();
                        applyDataToTable(cleaningDataCache);
                    }
                } else if (entry.type === 'exceptional') {
                    const filtered = (data.additionalTasks || []).filter(t => t.id !== entry.exceptionalTaskId);
                    await setDoc(weekDocRef, { additionalTasks: filtered }, { merge: true });

                    if (entry.weekStart === formatDateForStorage(currentCleaningMonday)) {
                        cleaningDataCache.additionalTasks = filtered;
                        renderAdditionalTasksInterface();
                        calculateWeeklyStats();
                    }
                }
            }

            await addCleaningLog('remove', `${entry.details} [REJETÉ VÉRIFICATION]`, entry.targetPerson);
        } catch (e) {
            console.error("Erreur rejet vérification:", e);
            showCustomAlert("Erreur lors du retrait de la tâche.");
            throw e;
        }
    }

    // Marque les entrées d'origine comme "rejected" dans le log du jour concerné, pour que la
    // ré-ouverture de cette Vérification montre correctement ce qui a déjà été traité.
    async function markLogEntriesRejected(dateStr, entryIds) {
        if (entryIds.length === 0) return;
        const logRef = doc(db, "cleaningLogs", `logs_${dateStr}`);
        const snap = await getDoc(logRef);
        if (!snap.exists()) return;
        const idSet = new Set(entryIds);
        const entries = (snap.data().entries || []).map(e => idSet.has(e.id) ? { ...e, rejected: true } : e);
        await setDoc(logRef, { entries }, { merge: true });
    }

    const markDayVerifiedBtn = document.getElementById('mark-day-verified-btn');
    if (markDayVerifiedBtn) {
        markDayVerifiedBtn.addEventListener('click', async () => {
            if (!currentVerificationDateStr) return;

            // C'est ICI que tout devient définitif : chaque switch resté sur ❌ est appliqué
            // maintenant (retrait du calendrier + blocage). Avant ce clic, rien n'est écrit.
            const toReject = currentVerificationEntries.filter(e => e.pendingReject && !e.rejected);

            const originalLabel = markDayVerifiedBtn.textContent;
            markDayVerifiedBtn.disabled = true;
            markDayVerifiedBtn.textContent = toReject.length > 0 ? `Retrait de ${toReject.length} tâche(s)...` : 'Validation...';

            try {
                for (const entry of toReject) {
                    await rejectVerificationEntry(entry);
                    entry.rejected = true;
                }
                if (toReject.length > 0) {
                    await markLogEntriesRejected(currentVerificationDateStr, toReject.map(e => e.id));
                }

                // >= et pas > : sans ça, vérifier "aujourd'hui" alors que le cache local vaut déjà
                // "aujourd'hui" (valeur par défaut avant toute écriture Firestore) ne déclenchait
                // jamais setDoc — le doc "verification" n'était donc jamais créé.
                if (!verificationStatusCache.lastVerifiedDate || currentVerificationDateStr >= verificationStatusCache.lastVerifiedDate) {
                    verificationStatusCache.lastVerifiedDate = currentVerificationDateStr;
                    await setDoc(doc(db, "cleaningSettings", "verification"), { lastVerifiedDate: currentVerificationDateStr }, { merge: true });
                }

                verificationModal.style.display = 'none';
                checkMidnightButton();
                showCustomAlert(toReject.length > 0 ? `Journée vérifiée ✅ (${toReject.length} tâche(s) retirée(s))` : "Journée marquée comme vérifiée ✅");
            } catch (e) {
                // rejectVerificationEntry a déjà affiché l'erreur précise si c'est elle qui a échoué
            } finally {
                markDayVerifiedBtn.disabled = false;
                markDayVerifiedBtn.textContent = originalLabel;
            }
        });
    }

    // Bouton clignotant "🌙 Vérifier la journée" : apparaît à minuit, reste tant que la
    // journée écoulée n'a pas été marquée vérifiée (voir loadVerificationStatus plus haut).
    function checkMidnightButton() {
        const btn = document.getElementById('midnight-verification-btn');
        if (!btn) return;

        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('fr-CA');
        const lastVerified = verificationStatusCache.lastVerifiedDate;

        if (!lastVerified || lastVerified < yesterdayStr) {
            let target = yesterdayStr;
            if (lastVerified) {
                const next = new Date(lastVerified + 'T00:00:00');
                next.setDate(next.getDate() + 1);
                target = next.toLocaleDateString('fr-CA');
            }
            pendingMidnightDateStr = target;
            btn.style.display = 'flex';
        } else {
            pendingMidnightDateStr = null;
            btn.style.display = 'none';
        }
    }

    const midnightVerificationBtn = document.getElementById('midnight-verification-btn');
    if (midnightVerificationBtn) {
        midnightVerificationBtn.addEventListener('click', () => {
            if (!pendingMidnightDateStr) return;
            const label = formatDateFr(new Date(pendingMidnightDateStr + 'T00:00:00'));
            openAdminGate(`Code admin requis pour vérifier la journée du ${label}.`, () => openVerificationModal(pendingMidnightDateStr));
        });
    }


// --- GESTION DU MODAL D'AJOUT TÂCHE EXCEPTIONNELLE ---
    
    let targetCleanerForAdd = null;
    const addExceptionalModal = document.getElementById('add-exceptional-modal');
    const closeAddExceptionalBtn = document.getElementById('close-add-exceptional');
    const exceptionalOptionsList = document.getElementById('exceptional-options-list');
    const confirmAddExceptionalBtn = document.getElementById('confirm-add-exceptional-btn');
    
    // Inputs "Autre"
    const choiceOtherRadio = document.getElementById('choice-other');
    const otherTaskDesc = document.getElementById('other-task-desc');
    const otherTaskPoints = document.getElementById('other-task-points');

    function openAddExceptionalTaskModal(cleanerName) {
        targetCleanerForAdd = cleanerName;
        document.getElementById('target-cleaner-name').textContent = cleanerName;
        renderExceptionalOptionsInModal();
        addExceptionalModal.style.display = 'flex';
        
        // Reset "Autre"
        choiceOtherRadio.checked = false;
        otherTaskDesc.value = '';
        otherTaskPoints.value = 1;
        toggleOtherInputs(false);
    }

    if(closeAddExceptionalBtn) {
        closeAddExceptionalBtn.addEventListener('click', () => {
            addExceptionalModal.style.display = 'none';
        });
    }

    // Gestion de l'activation des champs "Autre"
    choiceOtherRadio.addEventListener('change', () => toggleOtherInputs(true));
    function toggleOtherInputs(enable) {
        otherTaskDesc.disabled = !enable;
        otherTaskPoints.disabled = !enable;
        if(enable) otherTaskDesc.focus();
        
        // Si on active "Autre", on décoche les radios de la liste
        if (enable) {
            const radios = exceptionalOptionsList.querySelectorAll('input[type="radio"]');
            radios.forEach(r => r.checked = false);
        }
    }

    function renderExceptionalOptionsInModal() {
        exceptionalOptionsList.innerHTML = '';
        
        if (exceptionalScalesCache.length === 0) {
            exceptionalOptionsList.innerHTML = '<div style="padding:10px; color:#999; text-align:center;">Aucun modèle défini. Utilisez "Autre".</div>';
        }

        exceptionalScalesCache.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'exceptional-option-row';
            
            // Création des éléments
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'exceptional-choice';
            radio.id = `choice-${index}`;
            radio.value = index;

            const label = document.createElement('label');
            label.htmlFor = `choice-${index}`;
            label.className = 'exceptional-label';
            label.innerHTML = `<strong>${item.name}</strong> <span style="font-size:0.85em; color:#7f8c8d;">- ${item.desc}</span>`;

            const pointsInput = document.createElement('input');
            pointsInput.type = 'number';
            pointsInput.className = 'exceptional-points-input';
            pointsInput.value = item.points; // Valeur par défaut venant du barème
            pointsInput.min = 1;
            
            // Logique de sélection
            radio.addEventListener('change', () => {
                toggleOtherInputs(false); // Désactive "Autre"
            });
            
            // Si on clique sur l'input points, on sélectionne le radio correspondant
            pointsInput.addEventListener('focus', () => {
                radio.checked = true;
                toggleOtherInputs(false);
            });

            row.appendChild(radio);
            row.appendChild(label);
            row.appendChild(pointsInput);
            const ptsLabel = document.createElement('span');
            ptsLabel.innerText = "pts";
            ptsLabel.style.fontSize = "0.8em";
            row.appendChild(ptsLabel);

            exceptionalOptionsList.appendChild(row);
        });
    }

    confirmAddExceptionalBtn.addEventListener('click', () => {
        if (!targetCleanerForAdd) return;

        let finalDesc = "";
        let finalPoints = 1;

        if (choiceOtherRadio.checked) {
            // Cas "Autre"
            finalDesc = otherTaskDesc.value.trim();
            finalPoints = parseInt(otherTaskPoints.value);
            if (!finalDesc) return alert("Veuillez entrer un nom pour la tâche.");
        } else {
            // Cas Sélection Liste
            const selectedRadio = exceptionalOptionsList.querySelector('input[type="radio"]:checked');
            if (!selectedRadio) return alert("Veuillez sélectionner une tâche ou choisir 'Autre'.");
            
            const row = selectedRadio.closest('.exceptional-option-row');
            const name = row.querySelector('label strong').textContent;
            const ptsInput = row.querySelector('.exceptional-points-input');
            
            finalDesc = name;
            finalPoints = parseInt(ptsInput.value);
        }

        if (isNaN(finalPoints) || finalPoints < 1) finalPoints = 1;

        // Appel de la fonction d'ajout avec les points
        // MODIFICATION : Demande de PIN au lieu d'ajout direct
        pendingExceptionalTask = {
            cleaner: targetCleanerForAdd,
            desc: finalDesc,
            points: finalPoints
        };

        // Ouverture du modal PIN
        pinInput.value = '';
        pinErrorMsg.style.display = 'none';
        pinModal.style.display = 'flex';
        pinInput.focus();
    });


    function addAdditionalTask(cleanerName, desc, points) {
        if (!desc || desc.trim() === "") return;
        if (!cleaningDataCache.additionalTasks) cleaningDataCache.additionalTasks = [];
        
        // ON STOCKE LES POINTS DANS L'OBJET
        const newTaskId = Date.now();
        cleaningDataCache.additionalTasks.push({
            id: newTaskId,
            cleaner: cleanerName,
            desc: desc.trim(),
            points: points
        });

        // Log avec mention des points
        addCleaningLog('add', `"${desc.trim()}" (+${points} pts)`, cleanerName, { type: 'exceptional', exceptionalTaskId: newTaskId, weekStart: formatDateForStorage(currentCleaningMonday) });

        renderAdditionalTasksInterface(); 
        calculateWeeklyStats(); 
        triggerCleaningSave();
    }



    
}

// --- FONCTION DE GESTION DE LA FRISE CHRONOLOGIQUE (MISE À JOUR) ---
    // Clé du timer de la DERNIÈRE activité de la formule (le plus grand index "type_N").
    // Par défaut, c'est cette activité qui, une fois lancée, déclenche le "moment gâteau"
    // dans la frise (tant que la case "gâteau" de la fiche n'est pas cochée).
    function findLastActivityKey(timersObj) {
        let lastKey = null, lastIdx = -1;
        Object.keys(timersObj).forEach(k => {
            const idx = parseInt(k.slice(k.lastIndexOf('_') + 1), 10);
            if (!isNaN(idx) && idx >= lastIdx) { lastIdx = idx; lastKey = k; }
        });
        return lastKey;
    }
    // Clé du timer de la PREMIÈRE activité (le plus petit index). Utilisée quand la case
    // "Entre les 2 jeux" est cochée : le gâteau se cale alors sur la fin de la 1ère activité,
    // dès son lancement, au lieu d'attendre la dernière.
    function findFirstActivityKey(timersObj) {
        let firstKey = null, firstIdx = Infinity;
        Object.keys(timersObj).forEach(k => {
            const idx = parseInt(k.slice(k.lastIndexOf('_') + 1), 10);
            if (!isNaN(idx) && idx <= firstIdx) { firstIdx = idx; firstKey = k; }
        });
        return firstKey;
    }

    function updateGlobalTimeline(birthdaysList) {
        const timelineWrapper = document.getElementById('global-timeline-wrapper');
        const timelineContainer = document.getElementById('timeline-items-container');
        
        if (!timelineWrapper || !timelineContainer) return;

        const now = Date.now();
        let allEntries = [];

        birthdaysList.forEach(bd => {
            if (!bd.timers) return;
            const keys = Object.keys(bd.timers);
            if (!keys.length) return;

            const cakeDone = !!(bd.checklist && bd.checklist.cake);
            const cakeBetween = !!(bd.checklist && bd.checklist.cakeBetweenGames);
            const anchorKey = cakeBetween ? findFirstActivityKey(bd.timers) : findLastActivityKey(bd.timers);

            keys.forEach(key => {
                const timer = bd.timers[key];

                // MODIFICATION : On affiche si le timer a commencé ET qu'il n'a pas été "dismissed" (supprimé manuellement)
                // On ne vérifie plus 'timer.endTime > now' ici pour garder les éléments finis
                if (!timer.endTime) return;

                const remainingMs = timer.endTime - now;
                const isLastPendingCake = (key === anchorKey) && !cakeDone;

                if (isLastPendingCake) {
                    // Dernière activité de la formule, gâteau pas encore coché : le "moment gâteau"
                    // prend le relais dans la frise dès que cette activité est terminée (cas 1/2/3).
                    if (remainingMs > 0 && !timer.dismissed) {
                        allEntries.push({
                            kind: 'activity', id: bd.id, key: key, endTime: timer.endTime,
                            name: bd.name, activityLabel: timer.label, type: timer.type
                        });
                    }
                    allEntries.push({
                        kind: 'gateau', id: bd.id, endTime: timer.endTime, name: bd.name
                    });
                } else if (!timer.dismissed) {
                    allEntries.push({
                        kind: 'activity', id: bd.id, key: key, endTime: timer.endTime,
                        name: bd.name, activityLabel: timer.label, type: timer.type
                    });
                }
            });
        });

        if (allEntries.length === 0) {
            timelineWrapper.style.display = 'none';
            return;
        }

        // Tri par heure de fin ; le gâteau est réglé +0.5ms pour rester juste après l'activité
        // qui le déclenche quand les deux partagent le même endTime.
        allEntries.sort((a, b) => (a.endTime + (a.kind === 'gateau' ? 0.5 : 0)) - (b.endTime + (b.kind === 'gateau' ? 0.5 : 0)));

        timelineWrapper.style.display = 'block';
        timelineContainer.innerHTML = '';

        allEntries.forEach(act => {
            const item = document.createElement('div');

            if (act.kind === 'gateau') {
                const remainingMs = act.endTime - now;
                const isReady = remainingMs <= 0;
                item.className = `timeline-item gateau ${isReady ? 'urgent' : ''}`;
                item.innerHTML = `
                    <div class="timeline-time">🎂</div>
                    <div class="timeline-marker"></div>
                    <div class="timeline-content">
                        <div class="timeline-title">${act.name}</div>
                        <div class="timeline-desc">${isReady ? 'Gâteau prêt !' : 'Gâteau à venir'}</div>
                        <button class="timeline-ok-btn gateau-ok-btn" data-id="${act.id}" style="background:#ff4fa3; color:white; border:none; border-radius:4px; padding:2px 10px; cursor:pointer; font-weight:bold; margin-top:5px;">🎂 Valider</button>
                    </div>
                `;
                timelineContainer.appendChild(item);
                return;
            }

            const dateFin = new Date(act.endTime);
            const heureFin = `${String(dateFin.getHours()).padStart(2,'0')}:${String(dateFin.getMinutes()).padStart(2,'0')}`;
            
            const remainingMs = act.endTime - now;
            const isFinished = remainingMs <= 0;
            const isUrgent = remainingMs < 5 * 60000 && !isFinished;
            
            // Si fini, on ajoute une classe spécifique pour le style (optionnel)
            item.className = `timeline-item ${act.type} ${isUrgent ? 'urgent' : ''} ${isFinished ? 'finished-item' : ''}`;
            
            // Logique d'affichage : Compte à rebours OU Bouton OK
            let contentHtml = '';
            
            if (isFinished) {
                // Si terminé : Bouton OK
                contentHtml = `
                    <div class="timeline-title">${act.name}</div>
                    <div class="timeline-desc">${act.activityLabel}</div>
                    <button class="timeline-ok-btn" data-id="${act.id}" data-key="${act.key}" style="background:#2ecc71; color:white; border:none; border-radius:4px; padding:2px 10px; cursor:pointer; font-weight:bold; margin-top:5px;">OK</button>
                `;
            } else {
                // Si en cours : Compteur habituel
                contentHtml = `
                    <div class="timeline-title">${act.name}</div>
                    <div class="timeline-desc">${act.activityLabel}</div>
                    <div class="timeline-countdown" data-endtime="${act.endTime}">Calcul...</div>
                `;
            }

            item.innerHTML = `
                <div class="timeline-time">${heureFin}</div>
                <div class="timeline-marker"></div>
                <div class="timeline-content">
                    ${contentHtml}
                </div>
            `;
            
            timelineContainer.appendChild(item);
        });

        // AJOUT : Listener sur les boutons "OK" fraîchement créés (validation d'activité)
        document.querySelectorAll('.timeline-ok-btn:not(.gateau-ok-btn)').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const docId = e.target.dataset.id;
                const timerKey = e.target.dataset.key;
                
                // On met à jour Firestore pour dire que ce timer est "dismissed"
                // Cela va déclencher onSnapshot et rafraîchir la liste sans cet élément
                try {
                    await updateDoc(doc(db, "dailyBirthdays", docId), { 
                        [`timers.${timerKey}.dismissed`]: true 
                    });
                } catch (err) {
                    console.error("Erreur validation timeline", err);
                }
            });
        });

        // Listener sur le bouton "Valider" du moment gâteau
        document.querySelectorAll('.gateau-ok-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const docId = e.target.dataset.id;
                e.target.disabled = true;
                try {
                    await updateDoc(doc(db, "dailyBirthdays", docId), {
                        "checklist.cake": true
                    });
                } catch (err) {
                    console.error("Erreur validation gâteau", err);
                    e.target.disabled = false;
                }
            });
        });
    }


// --- NOUVEAU : ALGORITHME DU PLAN DE TABLE V2 ---
    let currentTablePlan = null; // NOUVEAU : Stockage de l'état du plan de table

    // NOUVEAU : jour actuellement consulté dans l'onglet Plan de Table (par défaut aujourd'hui) --
    // permet, via le sélecteur de date, de voir/préparer la disposition d'un autre jour (ex: vérifier
    // à l'avance le plan de demain) sans être bloqué sur le jour du jour comme avant.
    let currentTablePlanDate = getBusinessDate();

    // NOUVEAU : synchro Firestore du plan de table -- avant, currentTablePlan ne vivait qu'en mémoire
    // locale : un déplacement manuel (drag&drop, fusion/séparation de table double) ne se voyait donc
    // que sur le poste qui l'avait fait, jamais sur les autres postes allumés en même temps. Un seul
    // document partagé par journée commerciale (tablePlanState/{date}), écouté en direct par tous les
    // postes : dès qu'un poste écrit, tous les autres reçoivent la mise à jour et se re-rendent.
    let tablePlanUnsub = null;
    let tablePlanDocSeen = false; // true dès le 1er snapshot Firestore reçu (existant ou non)

    async function saveTablePlanToFirestore() {
        if (!currentTablePlan) return;
        // NOUVEAU : sauvegarde sous le jour actuellement SÉLECTIONNÉ (currentTablePlanDate), pas
        // forcément aujourd'hui -- permet de préparer/modifier le plan d'un autre jour à l'avance.
        const dateStr = formatDateForStorage(currentTablePlanDate);
        try {
            // NOUVEAU : Firestore refuse tout champ valant undefined ("Unsupported field value:
            // undefined"). Un objet table peut porter des champs undefined (ex: propriété copiée
            // depuis une fiche anniversaire/CRM incomplète). Un aller-retour JSON supprime
            // silencieusement ces champs undefined (comportement JSON.stringify standard),
            // exactement ce qu'il faut pour rester compatible Firestore, quelle que soit l'origine
            // exacte du champ manquant.
            const sanitizedTables = JSON.parse(JSON.stringify(currentTablePlan));
            await setDoc(doc(db, "tablePlanState", dateStr), {
                tables: sanitizedTables,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Erreur sauvegarde plan de table :", err);
        }
    }

    function subscribeToTablePlan() {
        // NOUVEAU : on écoute le jour actuellement SÉLECTIONNÉ (currentTablePlanDate), pas toujours
        // aujourd'hui -- rappelé à chaque changement de date via changeTablePlanDate().
        const dateStr = formatDateForStorage(currentTablePlanDate);
        if (tablePlanUnsub) tablePlanUnsub();
        tablePlanDocSeen = false;
        tablePlanUnsub = onSnapshot(doc(db, "tablePlanState", dateStr), (docSnap) => {
            if (docSnap.exists() && docSnap.data().tables) {
                // Un plan existe déjà pour ce jour (généré par ce poste ou un autre) -- on l'adopte
                // tel quel plutôt que d'en générer un nouveau, pour ne jamais écraser un arrangement
                // manuel déjà en place ailleurs.
                currentTablePlan = docSnap.data().tables;
                isTablePlanGenerated = true;
                renderTablePlan();
            } else if (!docSnap.exists()) {
                // Aucun plan enregistré pour ce jour -- on vide l'affichage précédent (sinon le plan
                // du jour consulté juste avant resterait affiché par erreur après un changement de
                // date).
                currentTablePlan = null;
                const planContainer = document.getElementById('table-plan-container');
                if (planContainer) planContainer.innerHTML = '<p style="text-align:center;">Aucun plan de table enregistré pour cette date.</p>';
                // Personne n'a peut-être encore de plan aujourd'hui -- tente une génération auto (voir
                // maybeAutoGenerateTablePlan : ne le fait que pour aujourd'hui, et revérifie Firestore
                // en direct avant d'écrire, pour ne jamais écraser un plan qu'un autre poste vient tout
                // juste de créer).
                maybeAutoGenerateTablePlan();
            }
            tablePlanDocSeen = true;
        }, (err) => {
            console.error("Erreur écoute plan de table :", err);
            tablePlanDocSeen = true;
        });
    }

    // NOUVEAU : point d'entrée PARTAGÉ pour la génération automatique du plan de table -- appelé à la
    // fois par subscribeToTablePlan() ci-dessus (quand son propre snapshot dit "pas encore de plan")
    // ET par l'écouteur des anniversaires plus bas dans initializeApp() (quand les anniversaires du
    // jour arrivent après coup, une fois le 1er snapshot du plan déjà vu).
    // BUG CORRIGÉ ("j'ouvre la page sur un autre ordi, il m'affiche le plan de table d'origine et pas
    // celui modifié ailleurs") : l'ancien appelant (l'écouteur des anniversaires) se fiait uniquement
    // aux indicateurs locaux tablePlanDocSeen/isTablePlanGenerated pour décider de générer -- ces
    // indicateurs peuvent être en retard sur l'état RÉEL de Firestore si un AUTRE poste a déjà créé/
    // sauvegardé un plan sans que CE poste-ci en ait encore reçu la confirmation (ordre d'arrivée des
    // écouteurs Firestore non garanti au chargement de la page). Résultat : ce poste régénérait un plan
    // "à vide" (l'algorithme automatique) et écrasait celui déjà modifié ailleurs. Corrigé en
    // revérifiant Firestore EN DIRECT (getDoc, une lecture fraîche, pas un indicateur local) juste
    // avant de générer quoi que ce soit -- et en respectant aussi "seulement pour aujourd'hui" (l'ancien
    // appelant ne vérifiait pas du tout la date sélectionnée).
    async function maybeAutoGenerateTablePlan() {
        if (isTablePlanGenerated) return;
        const dateStr = formatDateForStorage(currentTablePlanDate);
        if (dateStr !== formatDateForStorage(getBusinessDate())) return; // uniquement pour aujourd'hui
        if (!currentBirthdaysList || !currentBirthdaysList.some(bd => bd.date === dateStr)) return;

        try {
            const snap = await getDoc(doc(db, "tablePlanState", dateStr));
            if (isTablePlanGenerated) return; // un snapshot live a pu entre-temps déjà tout régler
            if (snap.exists() && snap.data().tables) {
                // Un autre poste a déjà créé/sauvegardé un plan entre-temps : on l'adopte, on ne le
                // régénère surtout pas.
                currentTablePlan = snap.data().tables;
                isTablePlanGenerated = true;
                renderTablePlan();
                return;
            }
        } catch (err) {
            console.error("Erreur vérification plan de table existant avant génération auto :", err);
            return; // en cas d'erreur réseau, mieux vaut ne rien générer que risquer d'écraser un plan existant
        }

        if (isTablePlanGenerated) return;
        forceGenerateTablePlan();
        isTablePlanGenerated = true;
    }
    // NOUVEAU : l'appel réel de subscribeToTablePlan() est déclenché dans le callback
    // onAuthStateChanged, juste après initializeApp() (voir plus haut) -- l'appeler ici,
    // immédiatement au chargement du script, cassait la page (ReferenceError sur
    // formatDateForStorage, pas encore exposée sur window à ce stade) et empêchait tout le code
    // suivant de s'exécuter, dont le menu hamburger.

    // NOUVEAU : sélecteur de date du Plan de Table -- permet de consulter/préparer la disposition
    // d'un autre jour que aujourd'hui (ex: vérifier à l'avance le plan de demain).
    const tablePlanDateInput = document.getElementById('table-plan-date-input');
    const tablePlanPrevDayBtn = document.getElementById('table-plan-prev-day');
    const tablePlanNextDayBtn = document.getElementById('table-plan-next-day');
    const tablePlanTodayBtn = document.getElementById('table-plan-today-btn');
    const tablePlanCurrentDateSpan = document.getElementById('table-plan-current-date');

    function updateTablePlanDateDisplay() {
        if (tablePlanCurrentDateSpan) tablePlanCurrentDateSpan.textContent = formatDateForDisplay(currentTablePlanDate);
        if (tablePlanDateInput) tablePlanDateInput.value = formatDateForStorage(currentTablePlanDate);
    }
    // NOUVEAU : PAS d'appel immédiat ici -- comme pour subscribeToTablePlan(), formatDateForDisplay/
    // formatDateForStorage ne sont exposées sur window qu'une fois initializeApp() passé (voir plus
    // haut) ; l'appeler ici, au chargement du script, lèverait la même ReferenceError qui cassait le
    // menu hamburger. Le premier appel se fait juste après initializeApp(), avec subscribeToTablePlan().

    function changeTablePlanDate(newDate) {
        currentTablePlanDate = newDate;
        isTablePlanGenerated = false; // NOUVEAU : réinitialisé à chaque changement de jour, sinon le
        // garde-fou de subscribeToTablePlan() empêcherait toute (re)génération sur le nouveau jour.
        updateTablePlanDateDisplay();
        subscribeToTablePlan();
    }

    if (tablePlanDateInput) {
        tablePlanDateInput.addEventListener('change', () => {
            if (!tablePlanDateInput.value) return;
            const [y, m, d] = tablePlanDateInput.value.split('-').map(Number);
            changeTablePlanDate(new Date(y, m - 1, d));
        });
    }
    if (tablePlanPrevDayBtn) {
        tablePlanPrevDayBtn.addEventListener('click', () => {
            const d = new Date(currentTablePlanDate);
            d.setDate(d.getDate() - 1);
            changeTablePlanDate(d);
        });
    }
    if (tablePlanNextDayBtn) {
        tablePlanNextDayBtn.addEventListener('click', () => {
            const d = new Date(currentTablePlanDate);
            d.setDate(d.getDate() + 1);
            changeTablePlanDate(d);
        });
    }
    if (tablePlanTodayBtn) {
        tablePlanTodayBtn.addEventListener('click', () => changeTablePlanDate(getBusinessDate()));
    }

    // NOUVEAU : Écouteurs pour les 3 boutons du plan de table
    document.getElementById('refresh-plan-btn')?.addEventListener('click', () => {
        forceGenerateTablePlan();
        document.getElementById('refresh-plan-btn').style.boxShadow = "none"; // Enlève l'alerte
        showCustomAlert("Plan de table recalculé de zéro !");
    });

    document.getElementById('update-counts-btn')?.addEventListener('click', () => {
        updateTablePlanNumbersOnly();
        document.getElementById('refresh-plan-btn').style.boxShadow = "none"; 
        showCustomAlert("Nombres d'enfants mis à jour sur les tables actuelles !");
    });

    document.getElementById('toggle-edit-mode-btn')?.addEventListener('click', (e) => {
        isEditMode = !isEditMode;
        const btn = e.target;
        if (isEditMode) {
            btn.textContent = "✏️ Mode Modifier : ON";
            btn.style.backgroundColor = "#2ecc71"; // Vert
        } else {
            btn.textContent = "✏️ Mode Modifier : OFF";
            btn.style.backgroundColor = "#9b59b6"; // Violet
        }
        renderTablePlan(); // Re-génère le HTML pour activer/désactiver le drag & drop
    });

    function forceGenerateTablePlan() {
        const planContainer = document.getElementById('table-plan-container');
        if (!planContainer) return;
        // NOUVEAU : la salle générée correspond au jour SÉLECTIONNÉ (currentTablePlanDate, via le
        // sélecteur de date de l'onglet), plus forcément "aujourd'hui" -- permet de préparer/
        // consulter la disposition d'un autre jour. currentBirthdaysList couvre plusieurs dates
        // (frise CRM des 14 prochains jours) donc on filtre toujours sur le jour affiché, sinon les
        // enfants d'un autre jour seraient assis sur les tables du jour consulté.
        const targetDateStr = formatDateForStorage(currentTablePlanDate);
        const targetDayBirthdays = (currentBirthdaysList || []).filter(bd => bd.date === targetDateStr);
        if (targetDayBirthdays.length === 0) {
            planContainer.innerHTML = '<p style="text-align:center;">Aucun anniversaire ce jour-là.</p>';
            return;
        }

        // 1. Définition de la salle (État initial vide)
        let tables = {
            hautes: Array(6).fill().map((_, i) => ({ id: `H${i+1}`, type: 'haute', cap: 8, occupied: null, mergeSide: null })),
            banquettes: Array(6).fill().map((_, i) => ({ id: `B${i+1}`, type: 'banquette', cap: 6, occupied: null })),
            t1: { id: `T1`, type: 'triple', cap: 8, occupied: null },
            t2: { id: `T2`, type: 'triple', cap: 8, occupied: null },
            rab: { tables: 7, chaises: 22 }
        };

        // Tri des grands groupes en premier
        let pendingBd = [...targetDayBirthdays].sort((a, b) => parseInt(b.count) - parseInt(a.count));

        // 2. Assignation logique
        pendingBd.forEach(bd => {
            let count = parseInt(bd.count);
            let age = parseInt(bd.age);
            let placed = false;

            // Règle 1: Groupe > 10
            if (count > 10) {
                for (let i = 0; i < tables.hautes.length - 1; i++) {
                    if (!tables.hautes[i].occupied && !tables.hautes[i+1].occupied && !tables.hautes[i].mergeSide && !tables.hautes[i+1].mergeSide) {
                        tables.hautes[i].occupied = bd;
                        tables.hautes[i].mergeSide = 'right';
                        tables.hautes[i+1].occupied = { ...bd, isExtension: true }; 
                        tables.hautes[i+1].mergeSide = 'left';
                        placed = true;
                        break;
                    }
                }
            }

            // Règle 2: Banquettes
            if (!placed && count <= 6) {
                let banquetteCap = (age < 9) ? 6 : 4;
                if (count <= banquetteCap) {
                    let freeB = tables.banquettes.find(b => !b.occupied);
                    if (freeB) { freeB.occupied = bd; placed = true; }
                }
            }

            // Règle 3: Tables Hautes standard
            if (!placed && count <= 8) {
                let freeH = tables.hautes.find(h => !h.occupied && h.mergeSide !== 'left');
                if (freeH) { freeH.occupied = bd; placed = true; }
            }

            // Règle 4: Tables Triples
            if (!placed && count <= 10) {
                let targetT = !tables.t1.occupied ? tables.t1 : (!tables.t2.occupied ? tables.t2 : null);
                if (targetT) {
                    let chairsNeeded = Math.max(0, count - 8);
                    if (tables.rab.chaises >= chairsNeeded) {
                        tables.rab.chaises -= chairsNeeded;
                        targetT.occupied = bd;
                        targetT.extraChairs = chairsNeeded;
                        placed = true;
                    }
                }
            }
            
            // Règle 5: Banquette + Rab
            if (!placed) {
                let banquetteCap = (age < 9) ? 6 : 4;
                let freeB = tables.banquettes.find(b => !b.occupied);
                if (freeB && tables.rab.tables >= 1) {
                    let remainingKids = count - banquetteCap;
                    if (remainingKids > 0 && remainingKids <= 5 && tables.rab.chaises >= remainingKids) {
                        tables.rab.tables -= 1;
                        tables.rab.chaises -= remainingKids;
                        freeB.occupied = bd;
                        freeB.hasRabTable = true;
                        freeB.extraChairs = remainingKids;
                        placed = true;
                    }
                }
            }
        });

        // 3. Sauvegarde dans l'état et Rendu
        currentTablePlan = tables;
        renderTablePlan();
        saveTablePlanToFirestore(); // NOUVEAU : partage le plan généré avec les autres postes
    }

    // NOUVEAU: Fonction pour mettre à jour les nombres sans déplacer les tables
    function updateTablePlanNumbersOnly() {
        if (!currentTablePlan || !currentBirthdaysList) return;

        // NOUVEAU : filtre sur le jour SÉLECTIONNÉ, pas toujours aujourd'hui (voir forceGenerateTablePlan).
        const targetDateStr = formatDateForStorage(currentTablePlanDate);
        const targetDayBirthdays = currentBirthdaysList.filter(bd => bd.date === targetDateStr);

        const updateOccupied = (table) => {
            if (table.occupied && !table.occupied.isExtension) {
                const updatedBd = targetDayBirthdays.find(b => b.id === table.occupied.id);
                if (updatedBd) {
                    table.occupied.count = updatedBd.count;
                    table.occupied.age = updatedBd.age;
                    table.occupied.name = updatedBd.name;
                }
            }
        };

        currentTablePlan.hautes.forEach(updateOccupied);
        currentTablePlan.banquettes.forEach(updateOccupied);
        updateOccupied(currentTablePlan.t1);
        updateOccupied(currentTablePlan.t2);

        renderTablePlan();
        saveTablePlanToFirestore(); // NOUVEAU : partage la mise à jour avec les autres postes
    }

    // NOUVEAU: Rendu séparé du calcul
    function renderTablePlan() {
        const planContainer = document.getElementById('table-plan-container');
        if (!planContainer || !currentTablePlan) return;

        let tables = currentTablePlan;
        let html = '';

        html += '<div class="plan-row-hautes">';
        tables.hautes.forEach(t => html += generateTableHtml(t));
        html += '</div>';

        html += '<div class="plan-container-milieu">';
            html += '<div class="plan-curve-banquettes">';
            tables.banquettes.forEach(t => html += generateTableHtml(t));
            html += '</div>';
            html += generateTableHtml(tables.t2);
        html += '</div>';

        html += '<div class="plan-row-bas">';
            html += generateTableHtml(tables.t1);
            html += `<div class="rab-status"><b>📦 Stock Rab Restant</b><br>Tables : ${tables.rab.tables}<br>Chaises : ${tables.rab.chaises}</div>`;
        html += '</div>';
        
        planContainer.innerHTML = html;
        setupTablePlanDragAndDrop(); // On initialise le D&D après le rendu HTML
    }

    function generateTableHtml(table) {
        let mergeClass = '';
        if (table.mergeSide === 'right') mergeClass = 'merge-right';
        if (table.mergeSide === 'left') mergeClass = 'merge-left';

        if (!table.occupied) {
            return `<div class="table-shape ${table.type} ${mergeClass}" data-table-id="${table.id}">
                        <div style="margin-bottom:5px; font-weight:bold; color:#bdc3c7;">${table.id}</div>
                        <small style="color:#95a5a6;">Libre</small>
                    </div>`;
        }
        
        let bd = table.occupied;

        if (bd.isExtension) {
            // NOUVEAU : la case "doublée" n'affiche plus qu'une seule croix ❌ en mode Modifier --
            // elle supprime UNIQUEMENT cette table doublée en trop, sans toucher à la table
            // principale (le groupe reste assis dessus). L'ancien 🔓 a été retiré : il n'avait pas de
            // sens ici puisqu'il supprimait les 2 tables à la fois (ce cas-là est désormais géré par
            // deleteTableAssignment(), déclenché depuis le 🗑️ de la case principale).
            // NOUVEAU : draggable="false" + ondragstart bloqué -- sans ça, ce bouton est un enfant
            // d'une case ".table-shape" elle-même draggable="true" (voir setupTablePlanDragAndDrop) ;
            // Chrome peut alors interpréter un clic dessus comme un début de glisser-déposer plutôt
            // que comme un clic, ce qui rendait le bouton fiable "un coup sur deux" seulement.
            const unmergeBtnHtml = isEditMode
                ? `<button type="button" class="table-edit-btn table-edit-btn-unmerge" title="Supprimer uniquement cette table doublée (la table principale n'est pas touchée)" draggable="false" ondragstart="event.preventDefault(); event.stopPropagation();" onclick="event.stopPropagation(); unmergeTable('${table.id}')">❌</button>`
                : '';
            return `<div class="table-shape ${table.type} occupied ${mergeClass}" data-table-id="${table.id}" style="opacity: 0.7;">
                        ${unmergeBtnHtml}
                        <small>Ajouter à</small><br><b>${bd.name}</b>
                        <div class="table-id-row"><span class="table-id-badge">${table.id}</span></div>
                    </div>`;
        }

        let extraInfoStr = '';
        if (table.extraChairs) extraInfoStr += ` +${table.extraChairs}🪑`;

        // NOUVEAU : en mode Modifier, jusqu'à 3 petits boutons sur chaque case de prénom :
        // 🗑️ (haut-gauche) supprime complètement cette table (et sa doublée associée, s'il y en a une) ;
        // ➕ (haut-droite, seulement si pas déjà doublée) l'accole à une table libre à droite (ou à
        // gauche si la droite est prise) ; 📦 (bas) ajoute/retire manuellement une Table Rab.
        // draggable="false" + ondragstart bloqué sur chacun : ces boutons sont des enfants d'une case
        // ".table-shape" elle-même draggable="true" (drag & drop du plan, voir
        // setupTablePlanDragAndDrop) -- sans ça, Chrome interprète parfois un clic dessus comme un
        // début de glisser-déposer plutôt qu'un clic, ce qui les rendait fiables "un coup sur deux"
        // seulement (voire jamais tant qu'un autre clic n'avait pas "débloqué" l'état de drag en cours).
        const noDragAttrs = `draggable="false" ondragstart="event.preventDefault(); event.stopPropagation();"`;
        let editButtonsHtml = '';
        if (isEditMode) {
            editButtonsHtml = `<button type="button" class="table-edit-btn table-edit-btn-delete" title="Supprimer la table" ${noDragAttrs} onclick="event.stopPropagation(); deleteTableAssignment('${table.id}')">🗑️</button>`;
            if (!table.mergeSide) {
                editButtonsHtml += `<button type="button" class="table-edit-btn table-edit-btn-merge" title="Doubler avec une table à droite" ${noDragAttrs} onclick="event.stopPropagation(); mergeAdjacentTable('${table.id}')">➕</button>`;
            }
            editButtonsHtml += `<button type="button" class="table-edit-btn table-edit-btn-rab" title="${table.hasRabTable ? 'Retirer la Table Rab' : 'Ajouter une Table Rab'}" ${noDragAttrs} onclick="event.stopPropagation(); toggleRabTable('${table.id}')">📦</button>`;
        }
        
        let mainHtml = `
        <div class="table-shape ${table.type} occupied ${mergeClass}" data-table-id="${table.id}">
            ${editButtonsHtml}
            <div class="table-name">${bd.name}</div>
            <div class="table-details">${getBirthdayCountNumber(bd) ?? '?'} enf. | ${bd.age} ans</div>
            
            <div class="table-id-row">
                <span class="table-id-badge">${table.id}</span>
                ${extraInfoStr ? `<span class="table-id-badge" style="background:rgba(255,255,255,0.2);">${extraInfoStr}</span>` : ''}
            </div>
        </div>`;

        if (table.hasRabTable) {
            let rabHtml = `
            <div class="table-shape occupied" style="position: absolute; top: 100%; left: 50%; transform: translateX(-50%); margin-top: 10px; opacity: 0.7; min-height: 65px; min-width: 55px; padding: 5px; font-size: 0.85em; z-index: 0;">
                <small>Table Rab</small>
                <div class="table-name" style="margin-top:3px;">${bd.name}</div>
            </div>`;
            return `<div style="position: relative; display: flex;">${mainHtml}${rabHtml}</div>`;
        }

        return mainHtml;
    }

    // NOUVEAU: Logique de Drag & Drop pour le Plan de Table
    function setupTablePlanDragAndDrop() {
        const planContainer = document.getElementById('table-plan-container');
        if (!isEditMode) {
            planContainer.classList.remove('table-plan-editing');
            return;
        }
        
        planContainer.classList.add('table-plan-editing');
        const draggables = planContainer.querySelectorAll('.table-shape');

        draggables.forEach(draggable => {
            if (draggable.style.position === 'absolute') return; // Ignore la table rab ajoutée visuellement
            
            draggable.setAttribute('draggable', true);
            
            draggable.addEventListener('dragstart', (e) => {
                // NOUVEAU : garde-fou supplémentaire -- si le glisser-déposer démarre depuis un des
                // boutons d'édition (🗑️/➕/📦/❌), on l'annule : ces boutons ont déjà draggable="false"
                // sur eux-mêmes, mais certains navigateurs peuvent quand même laisser un mousedown
                // dessus déclencher le dragstart de la case parente. Sans ce garde-fou, cliquer sur un
                // bouton pouvait démarrer un drag "fantôme" à la place du clic (bouton fiable "un coup
                // sur deux" seulement, ou bloqué tant qu'un autre clic ne "libérait" pas l'état de drag).
                if (e.target.closest && e.target.closest('.table-edit-btn')) {
                    e.preventDefault();
                    return;
                }
                const tableIdStr = draggable.dataset.tableId;
                if (tableIdStr) {
                    e.dataTransfer.setData('text/plain', tableIdStr);
                    draggable.classList.add('dragging');
                }
            });

            draggable.addEventListener('dragend', () => {
                draggable.classList.remove('dragging');
            });

            draggable.addEventListener('dragover', e => {
                e.preventDefault();
                draggable.classList.add('drag-over');
            });

            draggable.addEventListener('dragleave', () => {
                draggable.classList.remove('drag-over');
            });

            draggable.addEventListener('drop', e => {
                e.preventDefault();
                draggable.classList.remove('drag-over');
                
                const sourceIdStr = e.dataTransfer.getData('text/plain');
                const targetIdStr = draggable.dataset.tableId;
                
                if (sourceIdStr && targetIdStr && sourceIdStr !== targetIdStr) {
                    swapTables(sourceIdStr, targetIdStr);
                }
            });
        });
    }

    function findTableRef(idStr) {
        if (!currentTablePlan) return null;
        let found = currentTablePlan.hautes.find(t => t.id === idStr);
        if (found) return found;
        found = currentTablePlan.banquettes.find(t => t.id === idStr);
        if (found) return found;
        if (currentTablePlan.t1.id === idStr) return currentTablePlan.t1;
        if (currentTablePlan.t2.id === idStr) return currentTablePlan.t2;
        return null;
    }

    function swapTables(id1, id2) {
        let t1 = findTableRef(id1);
        let t2 = findTableRef(id2);
        
        if (t1 && t2) {
            // Échange les données d'occupation sans toucher à la structure (mergeSide, id, type)
            const tempOcc = t1.occupied;
            const tempExtra = t1.extraChairs;
            const tempRab = t1.hasRabTable;

            t1.occupied = t2.occupied;
            t1.extraChairs = t2.extraChairs;
            t1.hasRabTable = t2.hasRabTable;

            t2.occupied = tempOcc;
            t2.extraChairs = tempExtra;
            t2.hasRabTable = tempRab;

            renderTablePlan();
            saveTablePlanToFirestore(); // NOUVEAU : partage l'échange avec les autres postes
            showCustomAlert(`Échange effectué entre la table ${id1} et ${id2}`);
        }
    }

    // NOUVEAU : remet en stock la Table Rab / les chaises supplémentaires qu'une table occupée avait
    // éventuellement consommées (Règle 4, Règle 5, ou ajout manuel via toggleRabTable), avant de la
    // vider -- évite que le stock partagé (tables.rab) ne "fuie" au fil des ajouts/suppressions.
    function releaseTableStock(table) {
        if (!currentTablePlan || !table) return;
        if (table.hasRabTable) currentTablePlan.rab.tables += 1;
        if (table.extraChairs) currentTablePlan.rab.chaises += table.extraChairs;
    }

    // NOUVEAU (redesign) : ce bouton (❌) n'apparaît plus QUE sur la case "doublée" (l'extension
    // d'une table double) -- il libère UNIQUEMENT cette table doublée-là, et remet la table
    // principale associée en table simple (mergeSide effacé), SANS toucher à son occupation : le
    // groupe reste assis sur sa table principale comme avant, seule la table doublée en trop
    // redevient libre. (Avant : supprimait les 2 tables à la fois, ce qui n'avait pas de sens pour
    // simplement corriger/retirer un doublon -- ce cas "supprimer les 2" est désormais géré par
    // deleteTableAssignment(), déclenché depuis le 🗑️ de la case principale.)
    function unmergeTable(tableId) {
        if (!currentTablePlan) return;
        const groups = [currentTablePlan.hautes, currentTablePlan.banquettes];
        for (const group of groups) {
            const idx = group.findIndex(t => t.id === tableId);
            if (idx === -1) continue;
            const table = group[idx];
            if (!table.mergeSide) return;
            const partnerIdx = table.mergeSide === 'right' ? idx + 1 : idx - 1;
            const partner = group[partnerIdx];
            releaseTableStock(table);
            table.mergeSide = null;
            table.occupied = null;
            table.extraChairs = null;
            table.hasRabTable = null;
            if (partner) {
                partner.mergeSide = null; // la table principale redevient une table simple (non doublée)
            }
            renderTablePlan();
            saveTablePlanToFirestore();
            showCustomAlert(`Table doublée ${tableId} supprimée : la table principale reste inchangée.`);
            return;
        }
        // Cas des tables triples (t1/t2), accolées entre elles
        if (currentTablePlan.t1.id === tableId || currentTablePlan.t2.id === tableId) {
            const table = currentTablePlan.t1.id === tableId ? currentTablePlan.t1 : currentTablePlan.t2;
            const partner = currentTablePlan.t1.id === tableId ? currentTablePlan.t2 : currentTablePlan.t1;
            if (!table.mergeSide) return;
            releaseTableStock(table);
            table.mergeSide = null;
            table.occupied = null;
            table.extraChairs = null;
            table.hasRabTable = null;
            partner.mergeSide = null;
            renderTablePlan();
            saveTablePlanToFirestore();
            showCustomAlert(`Table doublée ${tableId} supprimée : la table principale reste inchangée.`);
        }
    }
    window.unmergeTable = unmergeTable; // NOUVEAU : accessible depuis le onclick inline généré en HTML

    // NOUVEAU : bouton 🗑️ en haut à gauche de chaque case occupée -- supprime complètement
    // l'occupation de cette table. Si la table est actuellement doublée (fusionnée avec une table
    // voisine), les 2 tables (principale + doublée) sont libérées ensemble : le groupe entier est
    // retiré du plan (contrairement au ❌ de la case doublée, qui ne libère QUE la table doublée).
    function deleteTableAssignment(tableId) {
        if (!currentTablePlan) return;
        const groups = [currentTablePlan.hautes, currentTablePlan.banquettes];
        for (const group of groups) {
            const idx = group.findIndex(t => t.id === tableId);
            if (idx === -1) continue;
            const table = group[idx];
            if (!table.occupied || table.occupied.isExtension) return;
            if (table.mergeSide) {
                const partnerIdx = table.mergeSide === 'right' ? idx + 1 : idx - 1;
                const partner = group[partnerIdx];
                releaseTableStock(table);
                table.mergeSide = null;
                table.occupied = null;
                table.extraChairs = null;
                table.hasRabTable = null;
                if (partner) {
                    releaseTableStock(partner);
                    partner.mergeSide = null;
                    partner.occupied = null;
                    partner.extraChairs = null;
                    partner.hasRabTable = null;
                }
                showCustomAlert(`Table ${tableId} supprimée : les 2 tables (doublées) sont de nouveau libres.`);
            } else {
                releaseTableStock(table);
                table.occupied = null;
                table.extraChairs = null;
                table.hasRabTable = null;
                showCustomAlert(`Table ${tableId} libérée.`);
            }
            renderTablePlan();
            saveTablePlanToFirestore();
            return;
        }
        // Cas des tables triples (t1/t2)
        if (currentTablePlan.t1.id === tableId || currentTablePlan.t2.id === tableId) {
            const table = currentTablePlan.t1.id === tableId ? currentTablePlan.t1 : currentTablePlan.t2;
            const partner = currentTablePlan.t1.id === tableId ? currentTablePlan.t2 : currentTablePlan.t1;
            if (!table.occupied || table.occupied.isExtension) return;
            if (table.mergeSide) {
                releaseTableStock(table);
                table.mergeSide = null;
                table.occupied = null;
                table.extraChairs = null;
                table.hasRabTable = null;
                releaseTableStock(partner);
                partner.mergeSide = null;
                partner.occupied = null;
                partner.extraChairs = null;
                partner.hasRabTable = null;
                showCustomAlert(`Table ${tableId} supprimée : les 2 tables (doublées) sont de nouveau libres.`);
            } else {
                releaseTableStock(table);
                table.occupied = null;
                table.extraChairs = null;
                table.hasRabTable = null;
                showCustomAlert(`Table ${tableId} libérée.`);
            }
            renderTablePlan();
            saveTablePlanToFirestore();
        }
    }
    window.deleteTableAssignment = deleteTableAssignment; // NOUVEAU : accessible depuis le onclick inline

    // NOUVEAU : bouton 📦 en bas de chaque case occupée -- ajoute ou retire manuellement une Table
    // Rab (petite table de réserve affichée sous la case), en consommant/remettant en stock le pool
    // partagé pour toute la salle (tables.rab.tables). Contrairement à la Règle 5 automatique, ne
    // touche pas aux chaises (pas de saisie du nombre d'enfants ici -- juste une table en plus).
    function toggleRabTable(tableId) {
        if (!currentTablePlan) return;
        const groups = [currentTablePlan.hautes, currentTablePlan.banquettes];
        let table = null;
        for (const group of groups) {
            table = group.find(t => t.id === tableId);
            if (table) break;
        }
        if (!table) {
            if (currentTablePlan.t1.id === tableId) table = currentTablePlan.t1;
            else if (currentTablePlan.t2.id === tableId) table = currentTablePlan.t2;
        }
        if (!table || !table.occupied || table.occupied.isExtension) return;

        if (table.hasRabTable) {
            table.hasRabTable = false;
            currentTablePlan.rab.tables += 1;
            showCustomAlert(`Table Rab retirée pour ${table.occupied.name} (remise en stock).`);
        } else {
            if (currentTablePlan.rab.tables <= 0) {
                showCustomAlert("Plus aucune Table Rab disponible en stock.");
                return;
            }
            table.hasRabTable = true;
            currentTablePlan.rab.tables -= 1;
            showCustomAlert(`Table Rab ajoutée pour ${table.occupied.name}.`);
        }
        renderTablePlan();
        saveTablePlanToFirestore();
    }
    window.toggleRabTable = toggleRabTable; // NOUVEAU : accessible depuis le onclick inline

    // NOUVEAU : Accole une table libre juste à côté (➕ dans la case de prénom) pour agrandir une
    // table déjà occupée -- pas seulement pour les groupes de >10 placés automatiquement, mais pour
    // n'importe quelle table, à la demande du staff. Cherche d'abord à droite, sinon à gauche.
    function mergeAdjacentTable(tableId) {
        if (!currentTablePlan) return;
        const groups = [currentTablePlan.hautes, currentTablePlan.banquettes];
        for (const group of groups) {
            const idx = group.findIndex(t => t.id === tableId);
            if (idx === -1) continue;
            const table = group[idx];
            if (!table.occupied || table.occupied.isExtension || table.mergeSide) return;
            const rightFree = idx + 1 < group.length && !group[idx + 1].occupied && !group[idx + 1].mergeSide;
            const leftFree = idx - 1 >= 0 && !group[idx - 1].occupied && !group[idx - 1].mergeSide;
            const partnerIdx = rightFree ? idx + 1 : (leftFree ? idx - 1 : null);
            if (partnerIdx === null) {
                showCustomAlert("Aucune table libre juste à côté pour agrandir celle-ci.");
                return;
            }
            const partner = group[partnerIdx];
            const side = partnerIdx > idx ? 'right' : 'left';
            table.mergeSide = side;
            partner.mergeSide = side === 'right' ? 'left' : 'right';
            partner.occupied = { ...table.occupied, isExtension: true };
            renderTablePlan();
            saveTablePlanToFirestore();
            showCustomAlert(`Table ${partner.id} accolée à ${table.id}.`);
            return;
        }
        // Cas des tables triples (t1/t2), accolées entre elles
        if (currentTablePlan.t1.id === tableId || currentTablePlan.t2.id === tableId) {
            const table = currentTablePlan.t1.id === tableId ? currentTablePlan.t1 : currentTablePlan.t2;
            const partner = currentTablePlan.t1.id === tableId ? currentTablePlan.t2 : currentTablePlan.t1;
            if (!table.occupied || table.occupied.isExtension || table.mergeSide) return;
            if (partner.occupied || partner.mergeSide) {
                showCustomAlert("Aucune table libre juste à côté pour agrandir celle-ci.");
                return;
            }
            table.mergeSide = 'right';
            partner.mergeSide = 'left';
            partner.occupied = { ...table.occupied, isExtension: true };
            renderTablePlan();
            saveTablePlanToFirestore();
            showCustomAlert(`Table ${partner.id} accolée à ${table.id}.`);
        }
    }
    window.mergeAdjacentTable = mergeAdjacentTable; // NOUVEAU : accessible depuis le onclick inline

    // ==========================================
    // === SYSTÈME DE PRIMES (BOUNTY BOARD) ===
    // ==========================================

    let activeBountiesCache = [];
    let bountyHuntersCache = {};

    function loadBountiesData() {
        onSnapshot(doc(db, "cleaningSettings", "bounties"), (docSnap) => {
            if (docSnap.exists() && docSnap.data().items) {
                activeBountiesCache = docSnap.data().items;
            } else {
                activeBountiesCache = [];
            }
            
            // NOUVEAU : Mise à jour du badge sur le bouton Primes
            const openBountyBtn = document.getElementById('open-bounty-board-btn');
            if (openBountyBtn) {
                if (activeBountiesCache.length > 0) {
                    openBountyBtn.innerHTML = `📜 Primes <span style="background: #e74c3c; color: white; border-radius: 50%; padding: 2px 6px; font-size: 0.8em; margin-left: 5px; box-shadow: 0 0 5px rgba(0,0,0,0.5);">${activeBountiesCache.length}</span>`;
                } else {
                    openBountyBtn.innerHTML = `📜 Primes`;
                }
            }

            if(document.getElementById('bounty-board-modal') && document.getElementById('bounty-board-modal').style.display === 'flex') {
                renderBountyBoard();
            }
            if(document.getElementById('content-admin-bounties') && document.getElementById('content-admin-bounties').style.display === 'block') {
                renderAdminBounties();
            }
        });

        onSnapshot(doc(db, "cleaningStats", "bountyHunters"), (docSnap) => {
            if (docSnap.exists()) {
                bountyHuntersCache = docSnap.data();
            } else {
                bountyHuntersCache = {};
            }
            renderBountyHunters();
        });
    }
    loadBountiesData();

    // --- GESTION UNIFIÉE ET DÉFINITIVE DES ONGLETS ADMIN ---
    function setupAllAdminTabs() {
        const adminTabsList = [
            { id: 'tab-admin-cleaners', contentId: 'content-admin-cleaners', onLoad: () => { if(typeof renderCleanersList === 'function') renderCleanersList(); } },
            { id: 'tab-admin-tasks', contentId: 'content-admin-tasks', onLoad: () => { if(typeof renderTasksManagementUI === 'function') renderTasksManagementUI(); } },
            { id: 'tab-admin-logs', contentId: 'content-admin-logs', onLoad: () => { if(typeof loadCleaningLogs === 'function') loadCleaningLogs(); } },
            { id: 'tab-admin-scales', contentId: 'content-admin-scales', onLoad: () => { if(typeof renderAdminScales === 'function') renderAdminScales(); } },
            { id: 'tab-admin-bounties', contentId: 'content-admin-bounties', onLoad: () => { renderAdminBounties(); } }
        ];

        adminTabsList.forEach(tab => {
            const btn = document.getElementById(tab.id);
            if (!btn) return;
            
            // On clone le bouton pour écraser TOUS les vieux écouteurs conflictuels du code
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', () => {
                // 1. On cache tout
                adminTabsList.forEach(t => {
                    const b = document.getElementById(t.id);
                    const c = document.getElementById(t.contentId);
                    if(b) b.classList.remove('active');
                    if(c) c.style.display = 'none';
                });
                
                // 2. On affiche le bon onglet
                newBtn.classList.add('active');
                const content = document.getElementById(tab.contentId);
                if (content) content.style.display = 'block';
                
                // 3. On charge les données correspondantes
                if (tab.onLoad) tab.onLoad();
            });
        });
    }
    setupAllAdminTabs();

    // --- GESTION UNIFIÉE DU LEADERBOARD ---
    function setupLeaderboardTabs() {
        const lbTabs = [
            { id: 'tab-weekly', contentId: 'leaderboard-content-weekly' },
            { id: 'tab-global', contentId: 'leaderboard-content-global' },
            { id: 'tab-bounty-hunter', contentId: 'leaderboard-content-bounty' }
        ];

        lbTabs.forEach(tab => {
            const btn = document.getElementById(tab.id);
            if (!btn) return;
            
            // Clone pour empêcher les superpositions
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', () => {
                lbTabs.forEach(t => {
                    const b = document.getElementById(t.id);
                    const c = document.getElementById(t.contentId);
                    if(b) b.classList.remove('active');
                    if(c) c.style.display = 'none';
                });
                
                newBtn.classList.add('active');
                const content = document.getElementById(tab.contentId);
                if(content) content.style.display = 'block';
            });
        });
    }
    setupLeaderboardTabs();

    // --- BOUTONS D'OUVERTURE / FERMETURE PRIMES ---
    const openBountyBtn = document.getElementById('open-bounty-board-btn');
    if(openBountyBtn) {
        const newOpenBtn = openBountyBtn.cloneNode(true);
        openBountyBtn.parentNode.replaceChild(newOpenBtn, openBountyBtn);
        newOpenBtn.addEventListener('click', () => {
            renderBountyBoard();
            document.getElementById('bounty-board-modal').style.display = 'flex';
        });
    }

    const closeBountyBtn = document.getElementById('close-bounty-board');
    if(closeBountyBtn) {
        const newCloseBtn = closeBountyBtn.cloneNode(true);
        closeBountyBtn.parentNode.replaceChild(newCloseBtn, closeBountyBtn);
        newCloseBtn.addEventListener('click', () => {
            document.getElementById('bounty-board-modal').style.display = 'none';
        });
    }

    // 3. Logique d'administration des Primes
    const addBountyBtn = document.getElementById('add-bounty-btn');
    if(addBountyBtn) {
        const newAddBountyBtn = addBountyBtn.cloneNode(true);
        addBountyBtn.parentNode.replaceChild(newAddBountyBtn, addBountyBtn);
        newAddBountyBtn.addEventListener('click', async () => {
            // NOUVEAU : Génération d'un ID unique simple sans librairie externe
            const newId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
            
            activeBountiesCache.push({
                id: newId,
                title: "Nouvelle Cible",
                desc: "Objectif...",
                tier: "C",
                points: 1
            });
            await saveActiveBounties();
        });
    }

    function renderAdminBounties() {
        const list = document.getElementById('admin-bounties-list');
        if(!list) return;
        list.innerHTML = '';
        
        activeBountiesCache.forEach((bounty, idx) => {
            const row = document.createElement('div');
            row.className = 'admin-scale-row';
            row.style.borderLeftColor = '#8e44ad';
            row.innerHTML = `
                <div style="display:flex; gap:10px; margin-bottom:5px;">
                    <input type="text" class="bounty-title-input" value="${bounty.title}" placeholder="Titre de la quête" data-idx="${idx}" style="flex:2; font-weight:bold;">
                    <select class="bounty-tier-select" data-idx="${idx}" style="flex:1;">
                        <option value="S" ${bounty.tier==='S'?'selected':''}>Rang S (Légendaire)</option>
                        <option value="A" ${bounty.tier==='A'?'selected':''}>Rang A (Épique)</option>
                        <option value="B" ${bounty.tier==='B'?'selected':''}>Rang B (Rare)</option>
                        <option value="C" ${bounty.tier==='C'?'selected':''}>Rang C (Commun)</option>
                    </select>
                    <input type="number" class="bounty-points-input" value="${bounty.points}" placeholder="Pts" data-idx="${idx}" style="width:60px; text-align:center;">
                </div>
                <div style="display:flex; gap:10px;">
                    <textarea class="bounty-desc-input" data-idx="${idx}" placeholder="Description..." style="flex:1; height:50px; resize:none; padding:5px;">${bounty.desc}</textarea>
                    <button class="delete-bounty-btn" data-idx="${idx}" style="background:#e74c3c; width:30px; color:white; border:none; border-radius:4px; cursor:pointer;">🗑️</button>
                </div>
            `;
            list.appendChild(row);
        });
        
        list.querySelectorAll('input, textarea, select').forEach(el => {
            el.addEventListener('change', async (e) => {
                const idx = e.target.dataset.idx;
                if(e.target.classList.contains('bounty-title-input')) activeBountiesCache[idx].title = e.target.value;
                if(e.target.classList.contains('bounty-tier-select')) activeBountiesCache[idx].tier = e.target.value;
                if(e.target.classList.contains('bounty-points-input')) activeBountiesCache[idx].points = parseInt(e.target.value) || 1;
                if(e.target.classList.contains('bounty-desc-input')) activeBountiesCache[idx].desc = e.target.value;
                await saveActiveBounties();
            });
        });
        
        list.querySelectorAll('.delete-bounty-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const idx = e.target.dataset.idx;
                if(confirm("Annuler ce contrat ?")) {
                    activeBountiesCache.splice(idx, 1);
                    await saveActiveBounties();
                }
            });
        });
    }

    async function saveActiveBounties() {
        try {
            await setDoc(doc(db, "cleaningSettings", "bounties"), { items: activeBountiesCache });
        } catch(e) { console.error("Erreur save bounties", e); }
    }

    // 4. Rendu du Tableau (RPG View)
    function renderBountyBoard() {
        const board = document.getElementById('bounty-board-container');
        if(!board) return;
        board.innerHTML = '';
        
        if(activeBountiesCache.length === 0) {
            board.innerHTML = '<h3 style="color:#fdf6e3; text-align:center; width:100%; text-shadow: 2px 2px 4px #000; font-size:1.5em; margin-top:150px;">Aucune cible recherchée. Revenez plus tard.</h3>';
            return;
        }
        
        activeBountiesCache.forEach((bounty) => {
            const paper = document.createElement('div');
            paper.className = `bounty-paper tier-${bounty.tier}`;
            
            const rot = Math.floor(Math.random() * 9) - 4;
            paper.style.transform = `rotate(${rot}deg)`;
            
            paper.innerHTML = `
                <div class="bounty-pin"></div>
                <div class="bounty-tier-badge">${bounty.tier}</div>
                <div class="bounty-title">${bounty.title}</div>
                <div style="font-size:0.8em; color:#555; flex:2; overflow:hidden; text-overflow:ellipsis; margin-top:5px;">${bounty.desc}</div>
                <div class="bounty-reward">🪙 ${bounty.points} pts</div>
            `;
            
            paper.addEventListener('click', () => openBountyDetail(bounty));
            board.appendChild(paper);
        });
    }

    function openBountyDetail(bounty) {
        document.getElementById('detail-bounty-title').textContent = bounty.title;
        document.getElementById('detail-bounty-desc').textContent = bounty.desc;
        document.getElementById('detail-bounty-reward').textContent = `Récompense : ${bounty.points} pts`;
        document.getElementById('detail-bounty-tier').textContent = `Prime de Rang ${bounty.tier}`;
        
        const select = document.getElementById('bounty-hero-select');
        select.innerHTML = '<option value="">-- Choisir le Héros --</option>';
        
        const listeEquipe = typeof EMPLOYEES !== 'undefined' ? EMPLOYEES : []; 
        
        listeEquipe.forEach(emp => {
            const empName = emp.name ? emp.name : emp;
            select.innerHTML += `<option value="${empName}">${empName}</option>`;
        });
        
        const validateBtn = document.getElementById('validate-bounty-btn');
        const newBtn = validateBtn.cloneNode(true);
        validateBtn.parentNode.replaceChild(newBtn, validateBtn);
        
        newBtn.addEventListener('click', () => {
            const hero = document.getElementById('bounty-hero-select').value;
            if(!hero) return alert("Veuillez sélectionner un Héros avant de réclamer la prime !");
            
            // NOUVEAU : On utilise "window." pour que la fonction PIN puisse voir la tâche depuis n'importe où !
            window.pendingExceptionalTask = {
                cleaner: hero,
                desc: `[Quête Rang ${bounty.tier}] ${bounty.title}`,
                points: bounty.points,
                isBounty: true,
                bountyId: bounty.id
            };
            
            const pinInputEl = document.getElementById('admin-pin-input');
            const pinErrorMsgEl = document.getElementById('pin-error-msg');
            const pinModalEl = document.getElementById('pin-modal');
            
            if (pinInputEl) pinInputEl.value = '';
            if (pinErrorMsgEl) pinErrorMsgEl.style.display = 'none';
            if (pinModalEl) pinModalEl.style.display = 'flex';
            if (pinInputEl) pinInputEl.focus();
        });
        
        document.getElementById('bounty-detail-modal').style.display = 'flex';
    }

    async function completeBounty(bountyId, cleanerName) {
        const idx = activeBountiesCache.findIndex(b => b.id === bountyId);
        if(idx !== -1) {
            activeBountiesCache.splice(idx, 1);
            await saveActiveBounties();
        }
        
        const statsRef = doc(db, "cleaningStats", "bountyHunters");
        try {
            const snap = await getDoc(statsRef);
            let stats = snap.exists() ? snap.data() : {};
            stats[cleanerName] = (stats[cleanerName] || 0) + 1;
            await setDoc(statsRef, stats);
        } catch(e) { console.error("Erreur stat bounty hunter", e); }
    }

    function renderBountyHunters() {
        const list = document.getElementById('leaderboard-list-bounty');
        if(!list) return;
        
        const sorted = Object.entries(bountyHuntersCache).sort((a, b) => b[1] - a[1]);
            
        list.innerHTML = '';
        if(sorted.length === 0) {
            list.innerHTML = "<p style='text-align:center;'>Aucune prime n\\'a encore été réclamée.</p>";
            return;
        }
        
        sorted.forEach(([name, count], index) => {
            const rankIcon = index === 0 ? '🤠' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : '⚔️'));
            list.innerHTML += `
                <div class="leaderboard-row">
                    <span>${rankIcon} ${name}</span>
                    <span class="score-badge" style="background:#8e44ad;">${count} Prime(s)</span>
                </div>
            `;
        });
    }

// ===============================================
// === LOGIQUE POUR LA NAVIGATION MOBILE ===
// ===============================================
function setupMobileNavigation() {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (!isMobile) return;

    // Références aux éléments
    const mobileContainer = document.getElementById('mobile-container');
    const mainDesktopContainer = document.getElementById('main-container');
    const mobileNavButtons = document.querySelectorAll('.mobile-nav-btn');
    const mobileViews = document.querySelectorAll('.mobile-view');

    const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
    if (mobileLogoutBtn) {
        // On récupère la fonction signOut depuis les outils firebase globaux
        const { signOut, auth } = window.firebaseTools;
        mobileLogoutBtn.addEventListener('click', () => {
            signOut(auth);
        });
    }
    
    // Cacher la vue desktop et afficher la vue mobile
    if (mainDesktopContainer) mainDesktopContainer.style.display = 'none';
    if (mobileContainer) mobileContainer.style.display = 'block';

    // Cloner les éléments importants de la vue desktop vers la vue mobile
    // pour ne pas avoir à dupliquer le HTML
    const desktopCounters = document.querySelector('#laser-game-view .counters-containerDisplay');
    const desktopLaserCalendar = document.querySelector('#laser-game-view .calendar-container');
    const desktopQkCalendar = document.getElementById('quiz-karaoke-calendar-container');

    if (desktopCounters) document.getElementById('mobile-chronos-view').appendChild(desktopCounters);
    if (desktopLaserCalendar) document.querySelector('#mobile-laser-view .mobile-calendar-container').appendChild(desktopLaserCalendar);
    if (desktopQkCalendar) document.querySelector('#mobile-qk-view .mobile-calendar-container').appendChild(desktopQkCalendar);

    // Fonction pour changer de vue principale
    const switchMainView = (targetViewId) => {
        mobileViews.forEach(view => {
            view.classList.remove('active');
        });
        document.getElementById(targetViewId).classList.add('active');
        
        mobileNavButtons.forEach(btn => {
            btn.classList.remove('active');
            if(btn.dataset.view === targetViewId) {
                btn.classList.add('active');
            }
        });
    };

    // Logique des boutons de navigation principale
    mobileNavButtons.forEach(button => {
        button.addEventListener('click', () => {
            switchMainView(button.dataset.view);
        });
    });

    // Logique pour les sous-navigations (Laser et QK)
    document.querySelectorAll('.mobile-sub-nav').forEach(subNav => {
        const subNavButtons = subNav.querySelectorAll('.sub-nav-btn');
        const parentView = subNav.closest('.mobile-view');
        
        // Cacher toutes les salles sauf la première par défaut
        const rooms = parentView.querySelectorAll('.room');
        rooms.forEach((room, index) => {
            if (index > 0) room.style.display = 'none';
        });

        subNavButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Gérer l'état actif du bouton
                subNavButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Afficher la salle correspondante
                const targetRoomId = button.dataset.target;
                rooms.forEach(room => {
                    if (room.id === targetRoomId) {
                        room.style.display = 'block';
                    } else {
                        room.style.display = 'none';
                    }
                });
            });
        });
    });

    // Afficher la première vue par défaut
    switchMainView('mobile-laser-view');
}

// NOUVEAU : Logique du menu hamburger flottant et modale anniversaire mobile
    const floatingMenuToggle = document.getElementById('floating-menu-toggle');
    const floatingMenuItems = document.getElementById('floating-menu-items');
    const mobileBirthdaysModal = document.getElementById('mobile-birthdays-modal');
    const openMobileBirthdaysBtn = document.getElementById('open-mobile-birthdays-modal');
    const closeMobileBirthdaysBtn = document.getElementById('close-mobile-birthdays-modal');

    if(floatingMenuToggle && floatingMenuItems) {
        floatingMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation(); 
            floatingMenuItems.classList.toggle('show');
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.floating-menu-container')) {
                floatingMenuItems.classList.remove('show');
            }
        });
    }

    // NOUVEAU : sous-menu déroulant "Paramètres" (groupes, utilisateurs, périodes, tarifs, feuille
    // de caisse) -- replié par défaut, un clic l'ouvre/le ferme SANS refermer tout le menu flottant
    // (contrairement aux autres boutons, cf. le filtre plus bas sur le fermeur générique).
    const floatingSubmenuToggleParametres = document.getElementById('floating-submenu-toggle-parametres');
    const floatingSubmenuParametres = document.getElementById('floating-submenu-parametres');
    if (floatingSubmenuToggleParametres && floatingSubmenuParametres) {
        floatingSubmenuToggleParametres.addEventListener('click', (e) => {
            e.stopPropagation();
            floatingSubmenuParametres.classList.toggle('show');
        });
    }

    // Thèmes (sombre normal + easter eggs cachés sur des lettres du titre) — un seul actif à la
    // fois, préférence gardée par navigateur (pas par compte).
    const THEME_CLASSES = ['dark-theme', 'electric-theme', 'electric-blue-theme', 'green-theme'];
    function applyTheme(themeClass) {
        document.body.classList.remove(...THEME_CLASSES);
        if (themeClass) document.body.classList.add(themeClass);
        localStorage.setItem('siteTheme', themeClass || '');
    }
    function toggleTheme(themeClass) {
        applyTheme(document.body.classList.contains(themeClass) ? '' : themeClass);
    }
    applyTheme(localStorage.getItem('siteTheme') || '');

    const toggleDarkThemeBtn = document.getElementById('toggle-dark-theme');
    if (toggleDarkThemeBtn) {
        toggleDarkThemeBtn.addEventListener('click', () => toggleTheme('dark-theme'));
    }

    // Logs du scan CRM (résas trouvées automatiquement, créneaux fermés en doublon) — écrits par
    // sync.js dans syncLogs, un doc par run avec quelque chose à raconter. Rien à voir avec les
    // résas prises à la main sur le site (pas dans ce flux, pas loggées ici).
    const openSyncLogsBtn = document.getElementById('open-sync-logs-modal');
    const syncLogsModal = document.getElementById('sync-logs-modal');
    const syncLogsList = document.getElementById('sync-logs-list');
    const closeSyncLogsBtn = document.getElementById('close-sync-logs-modal');

    function formatLogTimestamp(ts) {
        if (!ts || !ts.toDate) return '';
        return ts.toDate().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    async function loadSyncLogs() {
        syncLogsList.innerHTML = '<p style="text-align:center; color:#7f8c8d;">Chargement...</p>';
        try {
            const { collection: col, query: qy, orderBy: ob, limit: lm, getDocs: gd } = window.firebaseTools;
            const snap = await gd(qy(col(db, "syncLogs"), ob("at", "desc"), lm(50)));
            if (snap.empty) {
                syncLogsList.innerHTML = '<p style="text-align:center; color:#7f8c8d;">Rien à signaler pour l\'instant.</p>';
                return;
            }
            syncLogsList.innerHTML = snap.docs.map(docSnap => {
                const data = docSnap.data();
                const lines = Array.isArray(data.lines) ? data.lines : [];
                return `
                    <div style="border-bottom: 1px solid #eee; padding: 10px 0;">
                        <div style="font-size: 0.8em; font-weight: bold; color: #7f8c8d; margin-bottom: 4px;">${formatLogTimestamp(data.at)}</div>
                        ${lines.map(line => `<div style="font-size: 0.9em; padding: 2px 0;">${line}</div>`).join('')}
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error("Erreur chargement syncLogs", error);
            syncLogsList.innerHTML = '<p style="text-align:center; color:#e74c3c;">Erreur de chargement des logs.</p>';
        }
    }

    if (openSyncLogsBtn) {
        openSyncLogsBtn.addEventListener('click', () => {
            syncLogsModal.style.display = 'flex';
            floatingMenuItems.classList.remove('show');
            loadSyncLogs();
        });
    }
    if (closeSyncLogsBtn) {
        closeSyncLogsBtn.addEventListener('click', () => syncLogsModal.style.display = 'none');
    }

    // NOUVEAU : même règle de "journée commerciale" que currentDate plus haut dans l'app (avant 2h10
    // du matin, on est encore "hier") -- sans ça, consulter la Liste acompte ou imprimer la feuille
    // de caisse juste après minuit tombait sur la date calendaire du lendemain au lieu du jour
    // d'exploitation en cours, et un acompte du soir même semblait manquant.
    function getBusinessDate() {
        const d = new Date();
        if (d.getHours() < 2 || (d.getHours() === 2 && d.getMinutes() <= 10)) {
            d.setDate(d.getDate() - 1);
        }
        return d;
    }

    // ====================================================================
    // NOUVEAU : acompte et nombre d'enfants des anniversaires CRM -- outils partagés par la fiche
    // anniversaire, la génération des fiches depuis le CRM, la liste des bonbons et la Liste acompte.
    // Bug réel signalé : un client a pu verser 14€ d'acompte sur le site du CRM au lieu de 50€, mais
    // notre front affichait quand même "Acompte -50€" (montant écrit en dur) -- l'écart était
    // invisible. Le vrai montant encaissé ("Montant payé" de la fiche commande CRM) est pourtant déjà
    // relevé par le sync (crmSyncPreview.amountPaid) : on s'en sert maintenant partout, et on signale
    // tout acompte différent des 50€ habituels.
    // Déclarées ici (portée du DOMContentLoaded, comme getBusinessDate) pour être visibles à la fois
    // depuis initializeApp() (fiches) et depuis la Liste acompte plus bas.
    // ====================================================================
    function getStandardBirthdayDeposit() {
        return 50; // acompte anniversaire habituel (borne et site du CRM)
    }

    // Montant réellement encaissé pour une résa anniversaire CRM (doc crmSyncPreview), ou null si
    // inconnu (fiche commande pas encore lue par le sync, ou "Montant payé" introuvable).
    function getCrmBirthdayAmountPaid(event) {
        if (!event || event.amountPaid === null || event.amountPaid === undefined || event.amountPaid === '') return null;
        const paid = parseFloat(event.amountPaid);
        return Number.isFinite(paid) && paid >= 0 ? paid : null;
    }

    // Acompte à retenir pour une résa anniversaire CRM : le vrai montant encaissé s'il est connu,
    // sinon l'ancien comportement (50€ si le statut CRM parle d'acompte, 0 sinon).
    function resolveCrmBirthdayDeposit(event) {
        const paid = getCrmBirthdayAmountPaid(event);
        if (paid !== null) return { amount: paid, known: true };
        return { amount: event && event.depositPaid ? getStandardBirthdayDeposit() : 0, known: false };
    }

    // Nombre d'enfants d'une résa anniversaire CRM : nbr_participants si c'est un vrai nombre, sinon
    // le "(13pers)" du titre CRM (ex: "LJ - xiong veronique (13pers) (Acc)"), sinon null (inconnu).
    function getCrmBirthdayChildCount(event) {
        if (!event) return null;
        const n = parseInt(event.nbr_participants, 10);
        if (Number.isFinite(n) && n > 0) return n;
        const m = String(event.title || '').match(/\((\d+)\s*pers/i);
        if (m) {
            const fromTitle = parseInt(m[1], 10);
            if (Number.isFinite(fromTitle) && fromTitle > 0) return fromTitle;
        }
        return null;
    }

    // Nombre d'enfants d'une résa CRM tel qu'il est mis sur une fiche : minimum 4 (comme le
    // formulaire manuel), plus de plafond à 16 -- un groupe plus grand doit apparaître tel quel.
    function getCrmBirthdayFicheCount(event) {
        const n = getCrmBirthdayChildCount(event);
        return n === null ? null : Math.max(4, n);
    }

    // Nombre d'enfants d'une fiche, ou null s'il est absent/invalide (évite d'afficher "undefined").
    function getBirthdayCountNumber(bd) {
        const n = parseInt(bd && bd.count, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    // Acompte à déduire sur une fiche : le vrai montant CRM s'il a été relevé (depositAmount),
    // sinon l'ancien comportement (case "sans acompte" -> 0, sinon 50€).
    function getBirthdayDepositAmount(bd) {
        if (bd && bd.depositAmount !== undefined && bd.depositAmount !== null && bd.depositAmount !== '') {
            const n = parseFloat(bd.depositAmount);
            if (Number.isFinite(n) && n >= 0) return n;
        }
        return bd && bd.noDeposit ? 0 : getStandardBirthdayDeposit();
    }

    // Un acompte versé mais différent des 50€ habituels (ex: 14€) -> à signaler au staff.
    function isUnusualBirthdayDeposit(amount) {
        return Number.isFinite(amount) && amount > 0 && amount !== getStandardBirthdayDeposit();
    }

    // Remet à jour les fiches CRM depuis crmSyncPreview (1 lecture par fiche concernée, une seule fois
    // par fiche et par chargement de page) : acompte réellement encaissé, et nombre d'enfants
    // seulement s'il est absent/invalide sur la fiche (un nombre corrigé à la main avec +/- n'est
    // jamais écrasé). Concerne les fiches encore sans montant relevé, celles au nombre d'enfants
    // invalide, et celles des 3 prochains jours (le sync relit la fiche commande CRM juste avant
    // l'événement, un paiement complémentaire y apparaît donc à ce moment-là).
    // Fiches déjà vérifiées pendant ce chargement de page (stocké sur la fonction elle-même : pas de
    // "const" ici, qui serait encore inaccessible si un appel arrivait avant cette ligne).
    function getCrmBirthdayPreviewCheckedIds() {
        if (!getCrmBirthdayPreviewCheckedIds.ids) getCrmBirthdayPreviewCheckedIds.ids = new Set();
        return getCrmBirthdayPreviewCheckedIds.ids;
    }
    async function refreshCrmBirthdayFichesFromPreview(birthdays) {
        const crmBirthdayPreviewChecked = getCrmBirthdayPreviewCheckedIds();
        const today = getBusinessDate();
        const todayStr = formatDateForStorage(today);
        const soon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);
        const soonStr = formatDateForStorage(soon);

        const toCheck = (birthdays || []).filter(bd => {
            if (!bd.crmOrderId || crmBirthdayPreviewChecked.has(bd.id)) return false;
            const missingDeposit = bd.depositAmount === undefined || bd.depositAmount === null;
            const invalidCount = getBirthdayCountNumber(bd) === null;
            const isSoon = bd.date >= todayStr && bd.date <= soonStr;
            return missingDeposit || invalidCount || isSoon;
        });
        toCheck.forEach(bd => crmBirthdayPreviewChecked.add(bd.id));

        await Promise.all(toCheck.map(async (bd) => {
            try {
                const previewSnap = await getDoc(doc(db, "crmSyncPreview", `anniversaire_${bd.crmOrderId}`));
                if (!previewSnap.exists()) return;
                const event = previewSnap.data();
                const patch = {};

                const paid = getCrmBirthdayAmountPaid(event);
                if (paid !== null && parseFloat(bd.depositAmount) !== paid) {
                    patch.depositAmount = paid;
                    patch.noDeposit = paid === 0;
                }

                if (getBirthdayCountNumber(bd) === null) {
                    const crmCount = getCrmBirthdayFicheCount(event);
                    if (crmCount !== null) {
                        patch.count = String(crmCount);
                        patch.countToCheck = false;
                    }
                }

                if (Object.keys(patch).length > 0) {
                    await updateDoc(doc(db, "dailyBirthdays", bd.id), patch);
                }
            } catch (err) {
                console.warn('Mise à jour fiche anniversaire depuis le CRM impossible :', bd.id, err);
            }
        }));
    }

    // NOUVEAU : "Liste acompte" -- popup qui additionne les acomptes déjà encaissés via le CRM pour
    // une journée (quiz/karaoké, anniversaires), groupés par activité et montant exact, pour que la
    // caisse sache d'un coup d'oeil combien le CRM a déjà pris sans ouvrir chaque résa une par une.
    // Acompte = argent réellement encaissé, pas juste prévu.
    // IMPORTANT : le laser game n'est PAS compté séparément -- un créneau laser réservé dans le
    // cadre d'une formule anniversaire fait partie de cette formule et son acompte est déjà compris
    // dans l'entrée "Anniversaire" ci-dessous ; le recompter côté laser ferait un doublon.
    // IMPORTANT : comme la liste des bonbons, les anniversaires sont lus directement depuis
    // crmSyncPreview (la source CRM), PAS depuis les fiches dailyBirthdays -- ça marche donc sans
    // avoir à générer la fiche au préalable, ET ça reste juste même si la fiche a été supprimée
    // ensuite (ex: nettoyage en fin de journée) puisqu'on ne dépend plus de son existence.
    const openDepositListBtn = document.getElementById('open-deposit-list-modal');
    const depositListModal = document.getElementById('deposit-list-modal');
    const closeDepositListBtn = document.getElementById('close-deposit-list-modal');
    const depositListDateInput = document.getElementById('deposit-list-date');
    const depositListContent = document.getElementById('deposit-list-content');

    async function computeDepositSummaryForDate(dateStr) {
        const groups = {}; // { "Karaoké": { 12: 2, 8: 1 }, "Anniversaire": { 50: 3 }, ... }
        let grandTotal = 0;
        let grandCount = 0;

        function addEntry(label, amount) {
            const n = parseFloat(amount);
            if (!Number.isFinite(n) || n <= 0) return;
            if (!groups[label]) groups[label] = {};
            groups[label][n] = (groups[label][n] || 0) + 1;
            grandTotal += n;
            grandCount++;
        }

        const qkSnap = await getDocs(query(collection(db, "qkReservations"), where("date", "==", dateStr)));
        qkSnap.forEach(d => {
            const r = d.data();
            // NOUVEAU : ne pas se fier uniquement à r.depositPaid -- ce booléen est déduit côté CRM
            // par une simple détection du mot "acompte"/"accompte" dans le statut de la commande, et
            // rate donc les commandes dont le statut CRM dit autre chose (ex: "Payé") alors qu'un
            // vrai montant a bien été encaissé (r.amountPaid > 0). On compte dès qu'un argent réel
            // est enregistré, peu importe le mot utilisé côté CRM -- cohérent avec la case "Payé —
            // X€ encaissé" déjà affichée sur la résa elle-même, qui elle ne dépend pas de ce booléen.
            const hasRealDeposit = r.depositPaid || (r.amountPaid != null && r.amountPaid > 0);
            if (hasRealDeposit) {
                const label = r.activity === 'karaoke' ? 'Karaoké' : (r.activity === 'quiz' ? 'Quizz' : 'Quiz/Karaoké');
                addEntry(label, r.amountPaid != null ? r.amountPaid : r.amountTotal);
            }
        });

        // Anniversaires : un acompte par commande CRM (order_id). NOUVEAU : le VRAI montant encaissé
        // (amountPaid, relevé sur la fiche commande CRM par le sync) quand il est connu -- avant, 50€
        // étaient comptés en dur, ce qui masquait un acompte anormal (ex: 14€ versé sur le site du CRM).
        // Repli sur 50€ seulement si le montant n'a pas encore été relevé et que le statut CRM parle
        // d'acompte. Lecture directe de crmSyncPreview (comme runPrintCandyList) -- indépendant de
        // dailyBirthdays.
        const unusualDeposits = []; // acomptes anniversaire différents des 50€ habituels, à signaler
        const previewSnap = await getDocs(query(collection(db, "crmSyncPreview"), where("activity", "==", "anniversaire")));
        const seenOrderIds = new Set();
        previewSnap.docs
            .map(d => d.data())
            .filter(e => `${e.y}-${String(e.m).padStart(2, '0')}-${String(e.d).padStart(2, '0')}` === dateStr)
            .forEach(e => {
                const orderId = String(e.order_id);
                if (seenOrderIds.has(orderId)) return;
                seenOrderIds.add(orderId);
                const deposit = resolveCrmBirthdayDeposit(e);
                if (deposit.amount > 0) {
                    addEntry('Anniversaire', deposit.amount);
                }
                if (deposit.known && isUnusualBirthdayDeposit(deposit.amount)) {
                    unusualDeposits.push({
                        name: e.childFirstName || e.user || 'Client',
                        orderId,
                        amount: deposit.amount
                    });
                }
            });

        return { groups, grandTotal, grandCount, unusualDeposits };
    }

    function renderDepositSummary(summary) {
        if (!depositListContent) return;
        const { groups, grandTotal, grandCount, unusualDeposits = [] } = summary;
        const labels = Object.keys(groups).sort();
        if (labels.length === 0) {
            depositListContent.innerHTML = '<p style="color:#7f8c8d; text-align:center;">Aucun acompte CRM ce jour-là.</p>';
            return;
        }
        let html = '';
        // NOUVEAU : acompte anniversaire inhabituel (≠ 50€) mis en évidence en haut de la liste.
        if (unusualDeposits.length > 0) {
            const escapeText = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            const lines = unusualDeposits.map(u =>
                `<div>🎂 ${escapeText(u.name)} (commande #${escapeText(u.orderId)}) : <b>${u.amount}€</b> au lieu de ${getStandardBirthdayDeposit()}€</div>`
            ).join('');
            html += `
                <div style="background:#fdecea; border:1px solid #e74c3c; color:#c0392b; border-radius:6px; padding:8px 10px; margin-bottom:8px; font-size:0.9em;">
                    <b>⚠️ Acompte anniversaire inhabituel — à vérifier sur le CRM</b>
                    ${lines}
                </div>
            `;
        }
        labels.forEach(label => {
            const amounts = groups[label];
            const amountKeys = Object.keys(amounts).map(a => parseFloat(a)).sort((a, b) => b - a);
            const parts = amountKeys.map(a => `${amounts[a]} acc ${a}€`).join(', ');
            const subtotal = amountKeys.reduce((sum, a) => sum + a * amounts[a], 0);
            html += `
                <div style="display:flex; justify-content:space-between; align-items:baseline; padding:8px 0; border-bottom:1px solid #eee; gap:10px;">
                    <span><b>${label}</b> : ${parts}</span>
                    <span style="color:#27ae60; font-weight:bold; white-space:nowrap;">${subtotal}€</span>
                </div>
            `;
        });
        html += `
            <div style="display:flex; justify-content:space-between; padding:14px 0 0; font-size:1.1em;">
                <b>Total (${grandCount} acompte${grandCount > 1 ? 's' : ''})</b>
                <b style="color:#27ae60;">${grandTotal}€</b>
            </div>
        `;
        depositListContent.innerHTML = html;
    }

    async function refreshDepositList() {
        const dateStr = (depositListDateInput && depositListDateInput.value) || formatDateForStorage(getBusinessDate());
        if (depositListContent) depositListContent.innerHTML = '<p style="color:#7f8c8d; text-align:center;">Chargement...</p>';
        try {
            const summary = await computeDepositSummaryForDate(dateStr);
            renderDepositSummary(summary);
        } catch (err) {
            console.error('Erreur calcul liste acompte :', err);
            if (depositListContent) depositListContent.innerHTML = '<p style="color:#e74c3c; text-align:center;">Erreur lors du chargement.</p>';
        }
    }

    if (openDepositListBtn && depositListModal) {
        openDepositListBtn.addEventListener('click', () => {
            if (depositListDateInput && !depositListDateInput.value) {
                depositListDateInput.value = formatDateForStorage(getBusinessDate());
            }
            depositListModal.style.display = 'flex';
            floatingMenuItems.classList.remove('show');
            refreshDepositList();
        });
    }
    if (closeDepositListBtn && depositListModal) {
        closeDepositListBtn.addEventListener('click', () => depositListModal.style.display = 'none');
    }
    if (depositListDateInput) {
        depositListDateInput.addEventListener('change', refreshDepositList);
    }

    // NOUVEAU : "Imprimer feuille de caisse" -- une fiche VIERGE à remplir à la main après
    // impression (pas de données Firestore ici, juste la mise en page), avec la liste exacte
    // demandée. Même principe que printCandyList/printBirthdaySheets (fenêtre popup + print()),
    // répétée 3 fois en 3 colonnes x 1 seule ligne (3 exemplaires alignés HORIZONTALEMENT, côte à
    // côte, format paysage) sur une page A4 -- chaque exemplaire garde sa liste de 11 champs en UNE
    // SEULE colonne verticale (pas de répartition sur 2 colonnes).
    function printCashSheet() {
        // NOUVEAU : "Télécollectes" retiré -- doublon de "CB" (même flux de paiement), demande de
        // l'exploitant pour ne pas compter deux fois la même chose sur la feuille de caisse.
        const fields = [
            'CB', 'Chèque vacance', 'Anniversaire (___)', 'Quizz (___)',
            'Karaoke (___)', 'Facture', 'Dû', 'Extra', 'Cashdro (___)', 'Espèce'
        ];

        const printWindow = window.open('', '_blank');

        // NOUVEAU : plus de date pré-remplie (une même feuille imprimée sert sur plusieurs jours de
        // la semaine, pas juste le jour de l'impression) -- à la place, une case vide "Date :" comme
        // les autres champs, à remplir à la main selon le jour où l'exemplaire est réellement utilisé.
        const slipHtml = `
            <div class="slip">
                <div class="slip-header">
                    <span class="slip-title">Feuille de caisse</span>
                    <span class="slip-date-line">
                        <span class="slip-date-label">Date :</span>
                        <span class="slip-date-fill"></span>
                    </span>
                </div>
                <div class="slip-fields">
                    ${fields.map(f => `
                        <div class="slip-line">
                            <span class="slip-label">${f} :</span>
                            <span class="slip-fill"></span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Feuille de caisse</title>
                <style>
                    @page { size: A4 landscape; margin: 5mm; }
                    @media print {
                        body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    }
                    * { box-sizing: border-box; }
                    html, body { height: 100%; }
                    body { font-family: Arial, sans-serif; margin: 0; }
                    .sheet-grid {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        grid-template-rows: repeat(1, 1fr);
                        width: 100%;
                        height: 100%;
                    }
                    .slip {
                        border: 1px dashed #999;
                        padding: 8px 16px;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        gap: 5px;
                        overflow: hidden;
                    }
                    .slip-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: baseline;
                        border-bottom: 1px solid #333;
                        padding-bottom: 3px;
                        margin-bottom: 4px;
                    }
                    .slip-title { font-weight: bold; font-size: 1.05em; }
                    .slip-date-line { display: flex; align-items: baseline; gap: 5px; font-size: 0.85em; }
                    .slip-date-label { color: #555; white-space: nowrap; }
                    .slip-date-fill { border-bottom: 1px solid #999; width: 65px; height: 1.05em; }
                    .slip-fields {
                        display: flex;
                        flex-direction: column;
                        gap: 5px;
                    }
                    .slip-line {
                        display: flex;
                        align-items: baseline;
                        font-size: 0.9em;
                        gap: 6px;
                    }
                    .slip-label { white-space: nowrap; }
                    .slip-fill {
                        flex: 1;
                        border-bottom: 1px solid #999;
                        height: 1.05em;
                    }
                </style>
            </head>
            <body>
                <div class="sheet-grid">
                    ${Array(3).fill(slipHtml).join('')}
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    }

    const printCashSheetBtn = document.getElementById('print-cash-sheet-btn');
    if (printCashSheetBtn) {
        printCashSheetBtn.addEventListener('click', () => printCashSheet());
    }

    // Monitoring Bar — vérifie toutes les 30s les nouvelles commandes du bar (utile quand les
    // barmans ne sont pas devant l'écran de commande). Ne signale que ce qui apparaît APRÈS le
    // démarrage (le premier appel sert juste de référence, rien n'est signalé dessus). Détachable en
    // fenêtre flottante always-on-top (Document Picture-in-Picture), même principe que "Détacher les
    // chronos" — ne bloque pas la vue du calendrier. Repli en popup classique si le navigateur ne
    // supporte pas la PiP (Firefox/Safari). Le monitoring continue en tâche de fond même si on ferme
    // la fenêtre/le popup — seul le bouton "Stop monitoring" l'arrête.
    const GET_BAR_ORDERS_URL = 'https://us-central1-bowlingbackend.cloudfunctions.net/getBarOrders';
    const barMonitoringPipSupported = 'documentPictureInPicture' in window;
    const barMonitoringModal = document.getElementById('bar-monitoring-modal');
    const barMonitoringStatus = document.getElementById('bar-monitoring-status');
    const barMonitoringToggleBtn = document.getElementById('bar-monitoring-toggle-btn');
    const barMonitoringList = document.getElementById('bar-monitoring-list');
    const openBarMonitoringBtn = document.getElementById('open-bar-monitoring-modal');
    const closeBarMonitoringBtn = document.getElementById('close-bar-monitoring-modal');

    let barMonitoringInterval = null;
    let barMonitoringKnownIds = new Set();
    let barMonitoringBaselineDone = false;
    let barMonitoringAlerts = [];
    let barMonitoringPipWindow = null;

    const BAR_PIP_CSS = `
        * { box-sizing:border-box; margin:0; padding:0; }
        html, body { height:100%; }
        body { font-family:-apple-system,system-ui,Segoe UI,sans-serif; background:#1a1d24; color:#fff; padding:10px; overflow-y:auto; }
        h1 { font-size:14px; margin:0 0 8px; display:flex; align-items:center; justify-content:space-between; font-weight:600; }
        #bar-pip-status { font-size:12px; opacity:.85; font-weight:400; }
        #bar-pip-stop { width:100%; background:#e74c3c; color:#fff; border:none; border-radius:6px; padding:7px 10px; font-weight:600; cursor:pointer; font-size:12px; margin-bottom:8px; }
        #bar-pip-list { display:flex; flex-direction:column; gap:6px; }
        .bar-pip-item { display:flex; align-items:center; gap:6px; background:#2c313c; border-radius:8px; padding:8px 10px; font-size:13px; border:2px solid #555; }
        .bar-pip-item.pending { border-color:#f4d91a; animation:barPipBlink 1s infinite; }
        .bar-pip-main { display:flex; justify-content:space-between; align-items:center; flex:1; min-width:0; }
        .bar-pip-item .bar-pip-name { font-weight:600; }
        .bar-pip-item .bar-pip-time { font-size:11px; opacity:.7; }
        .bar-pip-item .amt { font-weight:700; }
        .bar-pip-badge { display:inline-block; font-size:10px; font-weight:600; color:#1a1d24; padding:2px 7px; border-radius:10px; margin-top:2px; white-space:nowrap; }
        .bar-pip-dismiss-btn { flex-shrink:0; background:transparent; border:none; color:#8a8f99; font-size:14px; line-height:1; cursor:pointer; padding:4px 6px; border-radius:4px; }
        .bar-pip-dismiss-btn:hover { background:rgba(231,76,60,0.25); color:#fff; }
        @keyframes barPipBlink { 50% { opacity:.5; } }
        #bar-pip-empty { opacity:.6; font-size:12px; text-align:center; padding:16px 0; }
    `;

    function updateBarMonitoringStatusUI(active) {
        if (barMonitoringStatus) {
            barMonitoringStatus.textContent = active ? '🟢 Actif' : '⏸ Arrêté';
            barMonitoringStatus.style.color = active ? '#27ae60' : '#7f8c8d';
        }
        if (barMonitoringToggleBtn) {
            barMonitoringToggleBtn.textContent = active ? '⏹ Stop monitoring' : '▶ Démarrer';
        }
        if (barMonitoringPipWindow && !barMonitoringPipWindow.closed) {
            const statusEl = barMonitoringPipWindow.document.getElementById('bar-pip-status');
            if (statusEl) statusEl.textContent = active ? '🟢 Actif' : '⏸ Arrêté';
        }
    }

    // Zone de livraison = piste/table d'où vient la commande (ex "Piste 20", "Table 2", "Bar 1") —
    // dit au staff où livrer. "reference" = code de commande interne, affiché en plus, plus petit.
    function orderToAlert(o) {
        return {
            id: o.id,
            time: (o.created_at || '').split(' ')[1] || o.created_at || '?',
            amount: o.amount_total || 0,
            zone: (o.piste && o.piste.full_name) || null,
            reference: o.reference || '',
            statusTitre: o.status ? o.status.titre : '',
            statusColor: o.status ? o.status.color : '#999',
            pending: !!(o.status && o.status.id === 6), // 6 = "En attente de paiement" (confirmé CRM)
        };
    }

    // NOUVEAU : efface une commande de la liste affichée (déjà traitée par le staff, inutile de la
    // garder sous les yeux) -- ne la fait JAMAIS réapparaître ensuite : son id reste dans
    // barMonitoringKnownIds (jamais retiré par ailleurs), donc le prochain poll (30s) ne la
    // retraitera plus comme "nouvelle commande". Un "Stop" puis "Démarrer" repart lui volontairement
    // d'une base neutre (toutes les commandes alors ouvertes redeviennent la référence, sans alerte) --
    // comportement déjà existant, cohérent avec cet effacement (pas de résurrection non plus dans ce cas).
    function dismissBarOrder(orderId) {
        barMonitoringAlerts = barMonitoringAlerts.filter(o => String(o.id) !== String(orderId));
        renderBarMonitoring();
    }

    function renderBarMonitoringList() {
        if (!barMonitoringList) return;
        if (barMonitoringAlerts.length === 0) {
            barMonitoringList.innerHTML = '<p style="text-align:center; color:#7f8c8d;">Aucune nouvelle commande détectée pour l\'instant.</p>';
            return;
        }
        barMonitoringList.innerHTML = barMonitoringAlerts.map(o => `
            <div class="bar-order-item${o.pending ? ' bar-order-pending' : ''}">
                <div class="bar-order-main">
                    <div>
                        <div style="font-weight:bold;">📍 ${o.zone || 'Zone inconnue'}</div>
                        <div style="font-size:0.8em; color:#7f8c8d;">${o.time} · ${o.reference}</div>
                    </div>
                    <div style="text-align:right;">
                        <div class="bar-order-amount">${o.amount.toFixed(2)} €</div>
                        <span style="display:inline-block; font-size:0.75em; font-weight:600; padding:2px 8px; border-radius:10px; color:#1a1d24; background:${o.statusColor};">${o.statusTitre}</span>
                    </div>
                </div>
                <button type="button" class="bar-order-dismiss-btn" data-order-id="${o.id}" title="Effacer cette commande (déjà traitée)">✕</button>
            </div>
        `).join('');
    }
    // Délégation (les items sont reconstruits à chaque render) -- un seul listener suffit.
    if (barMonitoringList) {
        barMonitoringList.addEventListener('click', (e) => {
            const btn = e.target.closest('.bar-order-dismiss-btn');
            if (btn) dismissBarOrder(btn.dataset.orderId);
        });
    }

    function renderBarMonitoringPip() {
        if (!barMonitoringPipWindow || barMonitoringPipWindow.closed) return;
        const doc = barMonitoringPipWindow.document;
        const list = doc.getElementById('bar-pip-list');
        const empty = doc.getElementById('bar-pip-empty');
        if (!list || !empty) return;
        empty.style.display = barMonitoringAlerts.length ? 'none' : 'block';
        list.innerHTML = barMonitoringAlerts.map(o => `
            <div class="bar-pip-item${o.pending ? ' pending' : ''}">
                <div class="bar-pip-main">
                    <div>
                        <div class="bar-pip-name">📍 ${o.zone || 'Zone inconnue'}</div>
                        <div class="bar-pip-time">${o.time} · ${o.reference}</div>
                    </div>
                    <div style="text-align:right;">
                        <div class="amt">${o.amount.toFixed(2)} €</div>
                        <span class="bar-pip-badge" style="background:${o.statusColor}">${o.statusTitre}</span>
                    </div>
                </div>
                <button type="button" class="bar-pip-dismiss-btn" data-order-id="${o.id}" title="Effacer cette commande">✕</button>
            </div>
        `).join('');
    }

    function renderBarMonitoring() {
        renderBarMonitoringList();
        renderBarMonitoringPip();
    }

    async function pollBarOrders() {
        try {
            const res = await fetch(GET_BAR_ORDERS_URL);
            const data = await res.json();
            if (!data.success || !Array.isArray(data.orders)) return;

            if (!barMonitoringBaselineDone) {
                data.orders.forEach(o => barMonitoringKnownIds.add(o.id));
                barMonitoringBaselineDone = true;
                return;
            }

            const byId = new Map(data.orders.map(o => [o.id, o]));

            // Nouvelles commandes jamais vues
            const newOnes = data.orders.filter(o => !barMonitoringKnownIds.has(o.id));
            newOnes.forEach(o => {
                barMonitoringKnownIds.add(o.id);
                barMonitoringAlerts.unshift(orderToAlert(o));
            });

            // Rafraîchit le statut de tout ce qu'on suit déjà — c'est ça qui détecte un "en attente
            // de paiement" devenu "payé" entre deux vérifications (30s), pas juste les nouvelles.
            barMonitoringAlerts.forEach(alert => {
                const fresh = byId.get(alert.id);
                if (fresh) Object.assign(alert, orderToAlert(fresh));
            });

            renderBarMonitoring();
            if (newOnes.length > 0) {
                showToast(`🍹 ${newOnes.length} nouvelle(s) commande(s) bar !`);
            }
        } catch (error) {
            console.error('Erreur monitoring bar', error);
        }
    }

    function startBarMonitoring() {
        barMonitoringKnownIds = new Set();
        barMonitoringBaselineDone = false;
        barMonitoringAlerts = [];
        renderBarMonitoring();
        updateBarMonitoringStatusUI(true);
        pollBarOrders();
        barMonitoringInterval = setInterval(pollBarOrders, 30000);
    }

    function stopBarMonitoring() {
        const wasRunning = !!barMonitoringInterval;
        if (barMonitoringInterval) clearInterval(barMonitoringInterval);
        barMonitoringInterval = null;
        updateBarMonitoringStatusUI(false);
        // Confirmation explicite demandée — pour ne jamais se demander si ça tourne encore en fond
        // et continue d'interroger le CRM toutes les 30s pour rien.
        if (wasRunning) showToast('⏸ Monitoring bar arrêté.', 'info');
    }

    async function openBarMonitoringPip() {
        if (barMonitoringPipWindow && !barMonitoringPipWindow.closed) { barMonitoringPipWindow.focus(); return; }
        try {
            barMonitoringPipWindow = await window.documentPictureInPicture.requestWindow({ width: 300, height: 260 });
        } catch (error) {
            console.error('Ouverture Picture-in-Picture (monitoring bar) impossible :', error);
            return;
        }
        const doc = barMonitoringPipWindow.document;
        const style = doc.createElement('style');
        style.textContent = BAR_PIP_CSS;
        doc.head.appendChild(style);
        doc.title = 'Monitoring Bar';
        doc.body.innerHTML = `
            <h1>🍹 Monitoring Bar <span id="bar-pip-status">${barMonitoringInterval ? '🟢 Actif' : '⏸ Arrêté'}</span></h1>
            <button type="button" id="bar-pip-stop">⏹ Stop monitoring</button>
            <div id="bar-pip-empty">Aucune nouvelle commande pour l'instant.</div>
            <div id="bar-pip-list"></div>
        `;
        doc.getElementById('bar-pip-stop').addEventListener('click', () => {
            stopBarMonitoring();
            barMonitoringPipWindow.close();
        });
        // NOUVEAU : même bouton "✕" que dans la modale principale -- délégation nécessaire ici aussi
        // (le contenu de #bar-pip-list est régénéré à chaque renderBarMonitoringPip()).
        doc.getElementById('bar-pip-list').addEventListener('click', (e) => {
            const btn = e.target.closest('.bar-pip-dismiss-btn');
            if (btn) dismissBarOrder(btn.dataset.orderId);
        });
        barMonitoringPipWindow.addEventListener('pagehide', () => { barMonitoringPipWindow = null; });

        renderBarMonitoringPip();
        if (!barMonitoringInterval) startBarMonitoring();
    }

    if (openBarMonitoringBtn) {
        openBarMonitoringBtn.addEventListener('click', () => {
            floatingMenuItems.classList.remove('show');
            if (barMonitoringPipSupported) {
                openBarMonitoringPip();
            } else {
                barMonitoringModal.style.display = 'flex';
                if (!barMonitoringInterval) startBarMonitoring();
            }
        });
    }
    if (barMonitoringToggleBtn) {
        barMonitoringToggleBtn.addEventListener('click', () => {
            if (barMonitoringInterval) stopBarMonitoring();
            else startBarMonitoring();
        });
    }
    if (closeBarMonitoringBtn) {
        closeBarMonitoringBtn.addEventListener('click', () => barMonitoringModal.style.display = 'none');
    }

    // Easter eggs — clics cachés sur des lettres du titre (aucun style visuel ajouté)
    const secretThemeTrigger = document.getElementById('secret-theme-trigger'); // "s" -> rouge électrique
    if (secretThemeTrigger) {
        secretThemeTrigger.addEventListener('click', () => toggleTheme('electric-theme'));
    }
    const secretThemeTriggerBlue = document.getElementById('secret-theme-trigger-blue'); // "G" -> bleu électrique
    if (secretThemeTriggerBlue) {
        secretThemeTriggerBlue.addEventListener('click', () => toggleTheme('electric-blue-theme'));
    }
    const secretThemeTriggerGreen = document.getElementById('secret-theme-trigger-green'); // "R" -> vert
    if (secretThemeTriggerGreen) {
        secretThemeTriggerGreen.addEventListener('click', () => toggleTheme('green-theme'));
    }

    if(openMobileBirthdaysBtn) {
        openMobileBirthdaysBtn.addEventListener('click', () => {
            renderMobileBirthdaysList();
            mobileBirthdaysModal.style.display = 'flex';
            floatingMenuItems.classList.remove('show');
        });
    }

    if(closeMobileBirthdaysBtn) {
        closeMobileBirthdaysBtn.addEventListener('click', () => {
            mobileBirthdaysModal.style.display = 'none';
        });
    }

    window.addEventListener('click', (event) => {
        if (event.target === mobileBirthdaysModal) {
            mobileBirthdaysModal.style.display = 'none';
        }
    });

    function renderMobileBirthdaysList() {
        const listContainer = document.getElementById('mobile-birthdays-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        if (!currentBirthdaysList || currentBirthdaysList.length === 0) {
            listContainer.innerHTML = '<p style="text-align:center; color:#7f8c8d; font-style: italic;">Aucun anniversaire prévu aujourd\'hui.</p>';
            return;
        }

        // Tri par date puis heure (même logique que la grille desktop), avec un en-tête de
        // date à chaque changement de jour pour que plusieurs jours de fiches restent lisibles.
        const sorted = [...currentBirthdaysList].sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.time.localeCompare(b.time));

        let lastDate = null;
        sorted.forEach(bd => {
            if (bd.date !== lastDate) {
                lastDate = bd.date;
                const [dy, dm, dd] = (bd.date || '').split('-').map(Number);
                const dateLabel = (dy && dm && dd) ? window.formatDateForDisplay(new Date(dy, dm - 1, dd)) : (bd.date || 'Date inconnue');
                const header = document.createElement('div');
                header.style.cssText = 'font-weight:bold; color:#8e44ad; background:#f4ecf7; padding:6px 10px; border-radius:6px; margin-top:8px;';
                header.textContent = `📅 ${dateLabel}`;
                listContainer.appendChild(header);
            }

            const card = document.createElement('div');
            card.className = 'mobile-bd-card';
            card.innerHTML = `
                <strong>${bd.name} (${bd.age} ans)</strong>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
                    <span>👥 Enfants : <b>${getBirthdayCountNumber(bd) ?? '?'}</b></span>
                    <span>⏰ Arrivée : <b>${bd.time}</b></span>
                </div>
            `;
            listContainer.appendChild(card);
        });
    }
// NOUVEAU : Fermer le menu flottant lors du clic sur un de ses boutons -- sauf le bouton qui
// déroule/replie le sous-menu "Paramètres", qui gère lui-même son propre toggle (voir plus haut)
// et ne doit pas refermer tout le menu flottant à chaque ouverture/fermeture du sous-menu.
document.querySelectorAll('.floating-menu-item').forEach(button => {
    if (button.id === 'floating-submenu-toggle-parametres') return;
    button.addEventListener('click', () => {
        const floatingMenu = document.querySelector('.floating-menu-items');
        if (floatingMenu) {
            floatingMenu.classList.remove('show');
        }
    });
});

// =========================================================
// === CHRONOS DÉTACHABLES (Document Picture-in-Picture) ===
// === Fenêtre flottante always-on-top, redimensionnable ===
// === Affiche uniquement les chronos actifs (sync Firestore) ===
// =========================================================
(function initDetachableTimers() {
    const pipSupported = 'documentPictureInPicture' in window;

    // Titres courts par défaut (sans le "Max: x joueurs")
    const shortTitles = {
        1: "⬇️ Salle Bas ⬇️",
        2: "⬆️ Salle Haut ⬆️",
        3: "🎙️ Karaoké 🎙️",
        4: "🚨 QuizzBoxing 🚨"
    };

    // Injection du bouton dans le header principal
    const header = document.querySelector('.main-header');
    let pipBtn = null;
    if (header) {
        pipBtn = document.createElement('button');
        pipBtn.id = 'detach-timers-btn';
        pipBtn.type = 'button';
        pipBtn.textContent = '🪟 Détacher les chronos';
        pipBtn.style.cssText = 'padding:8px 14px;border:none;border-radius:6px;background:#19b0e5;color:#fff;font-weight:600;cursor:pointer;';
        pipBtn.style.display = pipSupported ? '' : 'none';
        header.appendChild(pipBtn);
    }
    // Navigateur non compatible (Firefox / Safari) : bouton masqué, on s'arrête là
    if (!pipSupported) return;

    let pipWindow = null;
    let pipInterval = null;

    const PIP_CSS = `
        * { box-sizing:border-box; margin:0; padding:0; }
        html, body { height:100%; }
        body { font-family:-apple-system,system-ui,Segoe UI,sans-serif; background:#1a1d24; color:#fff; padding:8px; overflow:hidden; display:flex; flex-direction:column; }
        #pip-grid { display:grid; gap:8px; flex:1 1 auto; min-height:0; grid-auto-rows:1fr; }
        .pip-tile { display:flex; flex-direction:column; align-items:center; justify-content:center; background:#2c313c; border-radius:10px; padding:6px; border:3px solid transparent; min-height:0; overflow:hidden; }
        .pip-title { font-size:clamp(11px,4.5vw,22px); font-weight:600; text-align:center; line-height:1.15; margin-bottom:4px; opacity:.9; }
        .pip-title span { display:block; font-size:.78em; font-weight:400; opacity:.85; margin-top:1px; }
        .pip-time { font-family:monospace; font-weight:700; font-size:clamp(26px,11vh,110px); line-height:1; }
        .pip-tile.warn { border-color:#f39c12; }
        .pip-tile.warn .pip-time { color:#f39c12; }
        .pip-tile.ended { border-color:#e74c3c; animation:pipBlink 1s infinite; }
        .pip-tile.ended .pip-time { color:#e74c3c; }
        @keyframes pipBlink { 50% { opacity:.45; } }
        #pip-empty { flex:1 1 auto; display:flex; align-items:center; justify-content:center; text-align:center; opacity:.6; font-size:clamp(12px,4vw,18px); padding:20px; line-height:1.4; }
        #pip-billard { display:none; flex:0 0 auto; margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,.15); }
        #pip-billard.show { display:block; }
        #pip-billard-title { font-size:11px; text-transform:uppercase; letter-spacing:.04em; opacity:.7; margin-bottom:4px; }
        .pip-billard-item { display:flex; justify-content:space-between; align-items:center; background:#2c313c; border-radius:6px; padding:4px 8px; margin-bottom:4px; font-size:clamp(11px,3vw,14px); }
    `;

    const PIP_VERSION = 'v1.4';

    // Lit l'état des chronos de façon défensive (ne casse jamais si counters absent)
    function getCountersState() {
        try {
            if (typeof counters !== 'undefined' && counters) return counters;
        } catch (e) { /* counters hors scope */ }
        if (window.counters) return window.counters;
        return null;
    }

    function showPipError(msg) {
        if (!pipWindow || pipWindow.closed) return;
        const empty = pipWindow.document.getElementById('pip-empty');
        const grid = pipWindow.document.getElementById('pip-grid');
        if (grid) grid.style.display = 'none';
        if (empty) {
            empty.style.display = 'flex';
            empty.style.whiteSpace = 'pre-wrap';
            empty.style.color = '#ff6b6b';
            empty.style.fontSize = '11px';
            empty.textContent = 'ERREUR PiP ' + PIP_VERSION + ':\n' + msg;
        }
    }

    function renderPip() {
        if (!pipWindow || pipWindow.closed) return;
        try {
            const doc = pipWindow.document;
            const grid = doc.getElementById('pip-grid');
            const empty = doc.getElementById('pip-empty');
            if (!grid || !empty) return;

            const state = getCountersState();
            if (!state) { showPipError('Objet "counters" introuvable (scope).'); return; }

            const running = [1, 2, 3, 4].filter(r => state[r] && state[r].isCountingDown && state[r].endTime);

            empty.style.display = running.length ? 'none' : 'flex';
            grid.style.display = running.length ? 'grid' : 'none';
            grid.style.gridTemplateColumns = running.length <= 1 ? '1fr' : '1fr 1fr';

            if (!running.length) {
                empty.style.color = '';
                empty.textContent = 'Aucun chrono en cours. Lance un chrono (ici ou depuis un autre poste) pour l\'afficher.';
            }

            const present = new Set(running.map(String));
            Array.from(grid.children).forEach(tile => {
                if (!present.has(tile.dataset.room)) tile.remove();
            });

            running.forEach(room => {
                let tile = grid.querySelector('.pip-tile[data-room="' + room + '"]');
                if (!tile) {
                    tile = doc.createElement('div');
                    tile.className = 'pip-tile';
                    tile.dataset.room = String(room);
                    tile.style.cursor = 'pointer';
                    tile.title = 'Cliquer pour revenir à la fenêtre principale';
                    // Clic sur la tuile → ramène la fenêtre principale au premier plan
                    tile.addEventListener('click', () => { try { window.focus(); } catch (e) {} });
                    const t = doc.createElement('div'); t.className = 'pip-title';
                    const v = doc.createElement('div'); v.className = 'pip-time'; v.textContent = '00:00';
                    tile.appendChild(t); tile.appendChild(v);
                    grid.appendChild(tile);
                }
                const titleEl = tile.querySelector('.pip-title');
                const wantTitle = state[room].customTitle || shortTitles[room];
                if (titleEl.dataset.html !== wantTitle) {
                    titleEl.innerHTML = wantTitle;
                    titleEl.dataset.html = wantTitle;
                }
                const c = state[room];
                const diffMs = c.endTime - Date.now();
                const isNeg = diffMs < 0;
                const absMs = Math.abs(diffMs);
                const mm = Math.floor(absMs / 60000);
                const ss = Math.floor((absMs % 60000) / 1000);
                const txt = (isNeg ? '-' : '') + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
                let st = '';
                if (isNeg) st = 'ended';
                else if (absMs <= 60000 && absMs > 0) st = 'warn';
                const timeEl = tile.querySelector('.pip-time');
                if (timeEl.textContent !== txt) timeEl.textContent = txt;
                tile.classList.toggle('warn', st === 'warn');
                tile.classList.toggle('ended', st === 'ended');
            });
            renderPipBillard(doc);
        } catch (e) {
            showPipError((e && e.stack) ? e.stack : String(e));
        }
    }

    // Liste d'attente billard — affichée seulement quand quelqu'un y est noté.
    function renderPipBillard(doc) {
        const container = doc.getElementById('pip-billard');
        if (!container) return;
        const queue = Array.isArray(window.billardQueue) ? window.billardQueue : [];
        if (!queue.length) {
            container.classList.remove('show');
            container.innerHTML = '';
            return;
        }
        container.classList.add('show');
        container.innerHTML = '<div id="pip-billard-title">🎱 Attente billard (' + queue.length + ')</div>' +
            queue.map(item => '<div class="pip-billard-item"><span>' + item.name + '</span></div>').join('');
    }

    async function openPip() {
        if (pipWindow && !pipWindow.closed) { pipWindow.focus(); return; }
        try {
            pipWindow = await window.documentPictureInPicture.requestWindow({ width: 360, height: 320 });
        } catch (e) {
            console.error('Ouverture Picture-in-Picture impossible :', e);
            alert('Impossible d\'ouvrir la fenêtre flottante : ' + (e && e.message ? e.message : e));
            return;
        }
        try {
            const doc = pipWindow.document;
            const style = doc.createElement('style');
            style.textContent = PIP_CSS;
            doc.head.appendChild(style);
            doc.title = 'Chronos — Questoria';

            const grid = doc.createElement('div'); grid.id = 'pip-grid';
            const empty = doc.createElement('div'); empty.id = 'pip-empty';
            empty.textContent = 'Chargement…';
            const billard = doc.createElement('div'); billard.id = 'pip-billard';
            doc.body.appendChild(grid);
            doc.body.appendChild(empty);
            doc.body.appendChild(billard);

            if (pipBtn) pipBtn.textContent = '🪟 Chronos détachés ✓';

            renderPip();
            pipInterval = setInterval(renderPip, 250);

            pipWindow.addEventListener('pagehide', () => {
                if (pipInterval) { clearInterval(pipInterval); pipInterval = null; }
                pipWindow = null;
                if (pipBtn) pipBtn.textContent = '🪟 Détacher les chronos';
            });
        } catch (e) {
            showPipError((e && e.stack) ? e.stack : String(e));
        }
    }

    if (pipBtn) pipBtn.addEventListener('click', openPip);
})();

// =========================================================
// === PAGE CHRONO PLEIN ÉCRAN SUR 2E ÉCRAN ===
// === Ouvre /laser/chrono positionnée sur le moniteur secondaire ===
// =========================================================
(function initChronoScreenButton() {
    const header = document.querySelector('.main-header');
    if (!header) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '🖥️ Chrono 2e écran';
    btn.style.cssText = 'padding:8px 14px;border:none;border-radius:6px;background:#19b0e5;color:#fff;font-weight:600;cursor:pointer;';
    header.appendChild(btn);

    btn.addEventListener('click', async () => {
        // Repli par défaut : suppose le 2e écran juste à droite du principal.
        let left = window.screen.availWidth, top = 0;
        let width = window.screen.availWidth, height = window.screen.availHeight;

        // Si dispo (Chrome/Edge, HTTPS, permission accordée), on cible précisément l'écran secondaire.
        try {
            if ('getScreenDetails' in window) {
                const details = await window.getScreenDetails();
                const second = details.screens.find(s => s !== details.currentScreen);
                if (second) {
                    left = second.availLeft; top = second.availTop;
                    width = second.availWidth; height = second.availHeight;
                }
            }
        } catch (e) { /* API refusée/indisponible : on garde le repli à droite */ }

        const features = `noopener,menubar=no,toolbar=no,location=no,status=no,left=${left},top=${top},width=${width},height=${height}`;
        const win = window.open('/laser/chrono', 'chronoDisplay', features);
        // ponytail: pas de vrai plein écran auto (le navigateur exige un clic dans la fenêtre elle-même) —
        // la fenêtre couvre déjà tout l'écran secondaire ; on tente quand même, sans casser si refusé.
        if (win) setTimeout(() => { try { win.document.documentElement.requestFullscreen(); } catch (e) {} }, 600);
    });
})();

// =========================================================
// === APP BADGE : nb de chronos actifs sur l'icône PWA ===
// =========================================================
(function initAppBadge() {
    if (!('setAppBadge' in navigator)) return; // non supporté (Firefox, etc.)
    let last = -1;
    setInterval(() => {
        const c = window.counters;
        if (!c) return;
        const count = [1, 2, 3, 4].filter(r => c[r] && c[r].isCountingDown && c[r].endTime).length;
        if (count === last) return;
        last = count;
        try {
            if (count > 0) navigator.setAppBadge(count);
            else navigator.clearAppBadge();
        } catch (e) { /* ignore */ }
    }, 1000);
})();
});


