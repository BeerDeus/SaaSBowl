document.addEventListener("DOMContentLoaded", () => {
    const {
        auth, db, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut,
        doc, setDoc, getDoc, onSnapshot, collection, addDoc, serverTimestamp,
        deleteDoc, query, orderBy, getDocs, updateDoc, increment, writeBatch
    } = window.firebaseTools;

    // ====================================================================
    // === CONFIGURATION DES BOISSONS ===
    // Pour ajouter/modifier une boisson ou une catégorie, c'est ici !
    // ====================================================================
    const DRINKS_CONFIG = {
        "Sodas": ["Coca-Cola","Coca-Zero", "Fuze Tea","Sprite", "Tropico", "Fanta"],
        "Diabolo":["Diabolo Grenadine", "Diabolo Menthe", "Diabolo Pêche", "Diabolo Fraise", "Diabolo Citron","Diabolo PAC","Diabolo Orgeat"],
        "Sirops": ["Sirop Grenadine", "Sirop Menthe", "Sirop Fraise", "Sirop Pêche", "Sirop Citron","Sirop PAC","Sirop Orgeat"],
        "Jus de fruits": ["Jus de Pomme", "Jus d'Orange","Jus d'Ananas"],
        "Granita":["Granita Framboise","Granita Coca","Granita Tropical", "Framboise/Coca", "Framboise/Tropical", "Coca/Tropical"],
        "Eaux":["Eau", "Perrier"],
    };

    // Catalogue de recherche pour le réassort (repris de cave), indépendant des boissons
    // de commande ci-dessus. + possibilité d'ajouter un article libre non présent ici.
    const REASSORT_CAVE_CATALOG = {
        "Sodas": ["Coca-Cola", "Coca-Zero", "Coca-Cherry", "Fuze-Tea", "Sprite", "Fanta", "Fanta Citron", "Tropico", "Perrier", "Monster"],
        "Eaux": ["Cristaline 0.5L", "Cristaline 1.5L"],
        "Jus 25cl": ["Ananas 25cl", "ACE 25cl", "Mangue 25cl", "Fraise 25cl", "Orange 25cl", "Tomate 25cl"],
        "Jus Litre": ["Orange 1L", "Ananas 1L", "Pomme 1L", "Energy Drink 1L", "Schweppes Tonic 1L"],
        "Sirops": ["Sirop Grenadine", "Sirop Fraise", "Sirop Pêche", "Sirop Menthe", "Sirop Citron", "Sirop PAC", "Sirop Orgeat"],
        "Bière Bouteille": ["Desperados Bouteille", "Corona Bouteille", "Cubanisto Bouteille", "Leffe Bouteille", "Bud Bouteille", "Mort Subite Bouteille", "Heineken Bouteille", "Heineken 0% Bouteille"],
        "Bière Fût": ["Heineken Fût", "Desperados Fût", "Affligem Fût", "Blanche Fût", "Occitana Fût", "CO2 Fût"],
        "Alcools": ["Whisky", "Jack Daniels", "Rhum", "Vodka", "Get 27", "Baileys", "Spritz", "Ricard", "Pastis", "Gin", "Tequila", "Martini Blanc", "Martini Rouge"],
        "Vin": ["Chardonnay", "Moelleux", "Rosé", "Rouge"],
        "Bibs": ["Bibs Coca-Cola", "Bibs Coca-Zero", "Bibs Fuze-Tea", "Bibs Sprite", "Bibs Fanta", "Bibs Tropico"],
        "Divers": ["Chips Nature", "Chips Vinaigre", "Pop Corn", "Nutella", "Sucre", "Sucre Glace", "Bonbon", "Sucette", "Champomy", "Granita Coca", "Granita Framboise", "Granita Tropical", "Cocktails", "Paille", "Gobelet Granita", "Touillette", "Serviettes", "Pochette Donuts", "Sopalin", "Sacs poubelle 130L", "Lave Vitre 5L", "Lessive", "Javel", "Produit Vaisselle", "Eau Déminéralisée", "Sel Adoucisseur", "Feuille Blanches a4"],
    };
    const REASSORT_CATALOG = Object.entries(REASSORT_CAVE_CATALOG).flatMap(
        ([category, names]) => names.map(name => ({ name, category }))
    );

    // Références DOM
    const loginSection = document.getElementById('login-section');
    const appSection = document.getElementById('app-section');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userPic = document.getElementById('user-pic');
    const userName = document.getElementById('user-name');
    const ordersGrid = document.getElementById('orders-grid');
    const addOrderBtn = document.getElementById('add-order-btn');
    const kioskModeBtn = document.getElementById('kiosk-mode-btn');
    const totalDrinksDisplay = document.getElementById('total-drinks-display');
    const editOrderBtn = document.getElementById('edit-order-btn');
    
    // Modals
    const addOrderModal = document.getElementById('add-order-modal');
    const addOrderForm = document.getElementById('add-order-form');
    const viewOrderModal = document.getElementById('view-order-modal');
    const viewModalTitle = document.getElementById('view-modal-title');
    const viewModalBody = document.getElementById('view-modal-body');
    const deleteOrderBtn = document.getElementById('delete-order-btn');
    
    // Références pour les nouveaux modals et boutons
    const confirmDeleteModal = document.getElementById('confirm-delete-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const adminUsersBtn = document.getElementById('admin-users-btn');
    const adminUsersModal = document.getElementById('admin-users-modal');
    const usersListContainer = document.getElementById('users-list-container');
    const allCancelButtons = document.querySelectorAll('.btn-cancel');
    const stockManagementBtn = document.getElementById('stock-management-btn');
    const stockManagementModal = document.getElementById('stock-management-modal');
    const stockListContainer = document.getElementById('stock-list-container');

    // Références pour le réassort du soir
    const reassortBtn = document.getElementById('add-reassort-btn');
    const reassortBadge = document.getElementById('reassort-badge');
    const reassortModal = document.getElementById('reassort-modal');
    const reassortSearchInput = document.getElementById('reassort-search-input');
    const reassortSuggestions = document.getElementById('reassort-suggestions');
    const reassortList = document.getElementById('reassort-list');
    const reassortClearDoneBtn = document.getElementById('reassort-clear-done-btn');
    const reassortFinishBtn = document.getElementById('reassort-finish-btn');
    const reassortHistoryBtn = document.getElementById('reassort-history-btn');
    const reassortActiveView = document.getElementById('reassort-active-view');
    const reassortHistoryView = document.getElementById('reassort-history-view');
    const reassortHistoryList = document.getElementById('reassort-history-list');

    let currentUser = null;
    let currentUserRole = null;
    let unsubscribeOrders = null;
    let unsubscribeDrinks = null; // Pour l'écouteur des boissons
    let unsubscribeReassort = null;
    let unsubscribeReassortCatalog = null;
    let allDrinks = [];
    let allReassortItems = [];
    let customCatalogItems = []; // Articles ajoutés à la volée, mémorisés en base pour les prochaines recherches
    let reassortHistoryOpen = false;
    let suggestionItems = []; // Options de recherche actuellement affichées (tap pour ajouter)
    let pendingScrollToNewItem = false; // Fait défiler la liste vers le bas après un ajout
    let lastFocusedBeforeModal = null;

    const REASSORT_HISTORY_TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 jours
    const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    // --- AUTHENTIFICATION ---
    onAuthStateChanged(auth, user => {
        if (user) {
            currentUser = user;
            setupUser(user);
            loginSection.classList.add('hidden');
            appSection.classList.remove('hidden');
        } else {
            currentUser = null;
            currentUserRole = null;
            loginSection.classList.remove('hidden');
            appSection.classList.add('hidden');
            if (unsubscribeOrders) unsubscribeOrders();
            if (unsubscribeDrinks) unsubscribeDrinks();
            if (unsubscribeReassort) unsubscribeReassort();
            if (unsubscribeReassortCatalog) unsubscribeReassortCatalog();
        }
    });

    loginBtn.addEventListener('click', () => {
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth, provider).catch(error => {
            console.error("Erreur de connexion : ", error);
        });
    });

    logoutBtn.addEventListener('click', () => {
        signOut(auth);
    });

async function setupUser(user) {
    const userRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
        await setDoc(userRef, {
            displayName: user.displayName, email: user.email, photoURL: user.photoURL, role: 'viewer'
        });
        currentUserRole = 'viewer';
    } else {
        currentUserRole = userDoc.data().role;
    }

    userPic.src = user.photoURL;
    userName.textContent = user.displayName;

    if (['moderator', 'admin'].includes(currentUserRole)) {
        addOrderBtn.classList.remove('hidden');
        stockManagementBtn.classList.remove('hidden');
        listenToOrders();
        listenToDrinksStock(); // Ajoute cette ligne
    } else {
        addOrderBtn.classList.add('hidden');
        stockManagementBtn.classList.add('hidden');
        ordersGrid.innerHTML = "<p>Vous n'avez pas les droits pour voir les commandes.</p>";
    }

    if (currentUserRole === 'admin') {
        adminUsersBtn.classList.remove('hidden');
    } else {
        adminUsersBtn.classList.add('hidden');
    }

    // Le réassort du soir est ouvert à tous les employés connectés
    reassortBtn.classList.remove('hidden');
    listenToReassort();
    listenToReassortCatalog();
    purgeOldReassortHistory();
}

function listenToDrinksStock() {
    const drinksRef = collection(db, 'drinks');
    const q = query(drinksRef, orderBy('category'), orderBy('name'));
    
    unsubscribeDrinks = onSnapshot(q, (snapshot) => {
        allDrinks = []; // On vide notre liste locale
        snapshot.forEach(doc => {
            // On remplit la liste locale avec les données à jour
            allDrinks.push({ id: doc.id, ...doc.data() });
        });

        // Si le modal de commande est ouvert, on le met à jour
        if (!addOrderModal.classList.contains('hidden')) {
            updateDrinksInOpenModal();
        }
    });
}

// Nouvelle fonction pour mettre à jour l'affichage des stocks dans le modal
function updateDrinksInOpenModal() {
    allDrinks.forEach(drink => {
        const counterElement = addOrderModal.querySelector(`.counter[data-drink="${drink.id}"]`);
        if (counterElement) {
            const drinkItemElement = counterElement.closest('.drink-item');
            if (drink.inStock) {
                drinkItemElement.classList.remove('out-of-stock');
            } else {
                drinkItemElement.classList.add('out-of-stock');
            }
        }
    });
}

    // --- SONS (nouvelle commande + rappel si non traitée) ---
    // AudioContext créé au premier tap (contrainte autoplay des navigateurs), réutilisé ensuite.
    let audioCtx = null;
    function ensureAudioCtx() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        return audioCtx;
    }
    document.addEventListener('click', () => { try { ensureAudioCtx(); } catch (e) {} }, { once: true, capture: true });

    function beep(frequency, duration) {
        try {
            const ctx = ensureAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = frequency;
            gain.gain.value = 0.3;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration / 1000);
        } catch (e) {}
    }
    function playNewOrderSound() {
        if (!document.body.classList.contains('kiosk-mode')) return;
        beep(880, 150);
        setTimeout(() => beep(880, 150), 220);
    }
    function playReminderSound() {
        if (!document.body.classList.contains('kiosk-mode')) return;
        beep(660, 400);
    }

    // --- GESTION DES COMMANDES ---
    let knownOrderIds = null; // null = pas encore de 1er snapshot (évite de sonner pour l'existant au chargement)
    let latestOrders = [];
    let kioskSelectedOrderId = null; // commande ouverte en plein écran en mode kiosque, ou null = vue grille
    const newOrderIds = new Set(); // commandes pas encore ouvertes une 1re fois -- font clignoter leur case

    // Rappel sonore par commande, 60s après sa création si toujours pas validée, puis de plus
    // en plus fréquent (intervalle qui se réduit jusqu'à un plancher de 15s).
    const reminderTimers = new Map(); // orderId -> timeoutId

    function clearReminder(orderId) {
        clearTimeout(reminderTimers.get(orderId));
        reminderTimers.delete(orderId);
    }

    function scheduleReminder(order) {
        if (reminderTimers.has(order.id)) return;
        const FIRST_DELAY_MS = 60000;
        const MIN_INTERVAL_MS = 15000;
        const DECAY = 0.75;
        const createdAtMs = order.createdAt?.toMillis() ?? Date.now();
        let interval = FIRST_DELAY_MS;

        function fire() {
            playReminderSound();
            interval = Math.max(MIN_INTERVAL_MS, interval * DECAY);
            reminderTimers.set(order.id, setTimeout(fire, interval));
        }
        const delay = Math.max(0, FIRST_DELAY_MS - (Date.now() - createdAtMs));
        reminderTimers.set(order.id, setTimeout(fire, delay));
    }

    function firstName(fullName) {
        return (fullName || '').trim().split(/\s+/)[0] || fullName;
    }

    // Urgence d'une case par âge de la commande : verte (nouvelle, pas encore ouverte) tant
    // que c'est récent, puis orange à partir de 3 min sans validation, rouge à partir de 5 min.
    const KIOSK_URGENT_MS = 3 * 60 * 1000;
    const KIOSK_CRITICAL_MS = 5 * 60 * 1000;

    function kioskTileLevel(order) {
        const age = Date.now() - (order.createdAt?.toMillis() ?? Date.now());
        if (age >= KIOSK_CRITICAL_MS) return 'critical';
        if (age >= KIOSK_URGENT_MS) return 'urgent';
        if (newOrderIds.has(order.id)) return 'new';
        return 'normal';
    }

    // Ré-évalue périodiquement le niveau d'urgence des cases déjà affichées (l'âge d'une
    // commande avance même sans nouveau snapshot Firestore).
    function refreshKioskTileLevels() {
        if (!document.body.classList.contains('kiosk-mode') || kioskSelectedOrderId) return;
        document.querySelectorAll('.kiosk-tile').forEach(tile => {
            const order = latestOrders.find(o => o.id === tile.dataset.id);
            if (order) tile.className = `kiosk-tile kiosk-tile--${kioskTileLevel(order)}`;
        });
    }
    setInterval(refreshKioskTileLevels, 5000);

    function renderOrdersGrid(orders) {
        ordersGrid.innerHTML = orders.length === 0 ? "<p>Aucune commande en cours.</p>" : '';
        orders.forEach(order => {
            const orderCard = document.createElement('div');
            orderCard.className = 'order-card' + (order.completed ? ' completed' : '');
            orderCard.dataset.id = order.id;

            const drinksSummary = Object.entries(order.drinks)
                .map(([drink, quantity]) => `${drink.replace(/([A-Z])/g, ' $1').trim()}: ${quantity}`)
                .join('<br>');

            orderCard.innerHTML = `<h3>${order.childName}</h3><p>${drinksSummary}</p>`;
            ordersGrid.appendChild(orderCard);
        });
    }

    // Mode kiosque, vue grille : une case par commande en attente (les commandes validées
    // disparaissent de la file kiosque, mais restent visibles en vert dans la vue normale).
    function renderKioskGrid(orders) {
        if (orders.length === 0) {
            ordersGrid.innerHTML = '<p>Aucune commande en cours.</p>';
            return;
        }
        ordersGrid.innerHTML = `<div class="kiosk-grid">${orders.map(order => `
            <button type="button" class="kiosk-tile kiosk-tile--${kioskTileLevel(order)}" data-id="${order.id}">
                ${firstName(order.childName)}
            </button>
        `).join('')}</div>`;
    }

    // Taille du texte des boissons selon le nombre d'articles, pour que ça reste lisible
    // qu'il y ait 1 ou 15 boissons différentes dans la commande.
    function kioskDrinksSizeTier(count) {
        if (count <= 3) return 'xl';
        if (count <= 6) return 'lg';
        if (count <= 10) return 'md';
        return 'sm';
    }

    function drinkItemsHtml(entries) {
        return entries
            .map(([drink, quantity]) => `<div class="kiosk-drink-item">${drink.replace(/([A-Z])/g, ' $1').trim()}: ${quantity}</div>`)
            .join('');
    }

    // Mode kiosque, vue détail : la commande ouverte en plein écran avec la liste des
    // boissons (taille adaptée au nombre d'articles, 2 colonnes au-delà de 6) et le gros
    // bouton vert pour la valider.
    function renderKioskDetail(order) {
        const drinkEntries = Object.entries(order.drinks);
        const sizeClass = `kiosk-drinks--${kioskDrinksSizeTier(drinkEntries.length)}`;

        let drinksHtml;
        let columnsClass = '';
        if (drinkEntries.length > 6) {
            const mid = Math.ceil(drinkEntries.length / 2);
            drinksHtml = `
                <div class="kiosk-drinks-col">${drinkItemsHtml(drinkEntries.slice(0, mid))}</div>
                <div class="kiosk-drinks-col">${drinkItemsHtml(drinkEntries.slice(mid))}</div>
            `;
            columnsClass = ' kiosk-drinks--two-col';
        } else {
            drinksHtml = drinkItemsHtml(drinkEntries);
        }

        ordersGrid.innerHTML = `
            <div class="order-card kiosk-detail" data-id="${order.id}">
                <button type="button" class="kiosk-back-btn" aria-label="Retour à la liste">
                    <span class="material-icons" aria-hidden="true">arrow_back</span>
                </button>
                <h3>${order.childName}</h3>
                <div class="kiosk-drinks ${sizeClass}${columnsClass}">${drinksHtml}</div>
            </div>
            <button type="button" class="kiosk-validate-btn" data-id="${order.id}" aria-label="Commande terminée">
                <span class="material-icons" aria-hidden="true">check</span>
            </button>
        `;
    }

    function renderOrders() {
        if (document.body.classList.contains('kiosk-mode')) {
            // Plus ancienne en 1er (haut-gauche), plus récente en dernier (vers le bas) --
            // inverse de latestOrders, qui est trié desc (le plus récent en tête) pour la vue normale.
            const pending = latestOrders
                .filter(o => !o.completed)
                .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
            const selected = kioskSelectedOrderId && pending.find(o => o.id === kioskSelectedOrderId);
            if (selected) {
                renderKioskDetail(selected);
            } else {
                kioskSelectedOrderId = null;
                renderKioskGrid(pending);
            }
        } else {
            renderOrdersGrid(latestOrders);
        }
    }

    function listenToOrders() {
        const ordersRef = collection(db, 'orders');
        const q = query(ordersRef, orderBy('createdAt', 'desc'));

        unsubscribeOrders = onSnapshot(q, (snapshot) => {
            latestOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const pendingOrders = latestOrders.filter(o => !o.completed);
            const pendingIds = new Set(pendingOrders.map(o => o.id));

            if (knownOrderIds !== null) {
                const newOnes = pendingOrders.filter(o => !knownOrderIds.has(o.id));
                if (newOnes.length > 0) {
                    playNewOrderSound();
                    newOnes.forEach(o => newOrderIds.add(o.id));
                }
            }
            knownOrderIds = pendingIds;

            newOrderIds.forEach(id => { if (!pendingIds.has(id)) newOrderIds.delete(id); });
            reminderTimers.forEach((_, id) => { if (!pendingIds.has(id)) clearReminder(id); });
            pendingOrders.forEach(scheduleReminder);

            renderOrders();
        });
    }

    async function populateDrinksInFirestore() {
        // On importe 'writeBatch' qui n'était pas utilisé jusqu'ici
        const { writeBatch } = window.firebaseTools;
        console.log("Début de l'initialisation des boissons dans Firestore...");

        const batch = writeBatch(db);

        for (const category in DRINKS_CONFIG) {
            const drinksArray = DRINKS_CONFIG[category];
            for (const drinkName of drinksArray) {
                // On crée un ID simple et unique à partir du nom
                const drinkId = drinkName.replace(/\s+/g, '').replace('/', '-');
                
                // On définit la référence du document avec notre ID personnalisé
                const drinkDocRef = doc(db, 'drinks', drinkId);
                
                const drinkData = {
                    name: drinkName,
                    category: category,
                    inStock: true // Par défaut, tout est en stock
                };
                
                // On ajoute l'opération au batch
                batch.set(drinkDocRef, drinkData);
            }
        }

        try {
            // On exécute toutes les opérations d'un coup
            await batch.commit();
            console.log("Collection 'drinks' initialisée avec succès !");
            alert("La base de données des boissons a été remplie !");
        } catch (error) {
            console.error("Erreur lors de l'écriture du batch : ", error);
            alert("Une erreur est survenue lors de l'initialisation des boissons.");
        }
    }
    window.populateDrinksInFirestore = populateDrinksInFirestore;

    function updateTotalDrinksDisplay() {
        let total = 0;
        document.querySelectorAll('#add-order-modal .counter .quantity').forEach(q => {
            total += parseInt(q.textContent);
        });
        totalDrinksDisplay.textContent = `Total : ${total}`;
    }

addOrderBtn.addEventListener('click', () => {
    addOrderForm.reset();
    populateDrinkSelector(); 

    addOrderModal.querySelector('h3').textContent = 'Nouvelle Commande';
    addOrderModal.querySelector('button[type="submit"]').textContent = 'Envoyer';
    addOrderModal.dataset.mode = 'add';
    delete addOrderModal.dataset.editingId;
    
    const firstTabButton = document.querySelector('.tab-button');
    if (firstTabButton) {
        document.querySelectorAll('.tab-button, .tab-panel').forEach(el => el.classList.remove('active'));
        firstTabButton.classList.add('active');
        document.querySelector('.tab-panel').classList.add('active');
    }

    updateTotalDrinksDisplay();
    openModal(addOrderModal); // On utilise la nouvelle fonction
});

    addOrderModal.addEventListener('click', (e) => {
        const target = e.target;
        const counter = target.closest('.counter');
        
        if (!counter) return;

        const quantitySpan = counter.querySelector('.quantity');
        let quantity = parseInt(quantitySpan.textContent);
        let quantityChanged = false;

        if (target.matches('.btn-plus')) {
            quantitySpan.textContent = quantity + 1;
            quantityChanged = true;
        } else if (target.matches('.btn-minus')) {
            if (quantity > 0) {
                quantitySpan.textContent = quantity - 1;
                quantityChanged = true;
            }
        }

        if (quantityChanged) {
            updateTotalDrinksDisplay();
        }
    });

addOrderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const childName = document.getElementById('child-name-input').value;
    const drinks = {};
    document.querySelectorAll('.counter').forEach(counter => {
        const drinkName = counter.dataset.drink;
        const quantity = parseInt(counter.querySelector('.quantity').textContent);
        if (quantity > 0) {
            drinks[drinkName] = quantity;
        }
    });
    
    if (Object.keys(drinks).length === 0) {
        alert("Veuillez sélectionner au moins une boisson.");
        return;
    }

    const mode = addOrderModal.dataset.mode;
    
    if (mode === 'edit') {
        const orderId = addOrderModal.dataset.editingId;
        const orderRef = doc(db, 'orders', orderId);
        await updateDoc(orderRef, { childName, drinks });
    } else {
        await addDoc(collection(db, 'orders'), {
            childName,
            drinks,
            createdAt: serverTimestamp(),
            createdBy: currentUser.uid
        });
    }

    // Un simple 'history.back()' suffit.
    // Il déclenchera l'écouteur 'popstate' qui appellera closeModal pour nous.
    history.back();
});

    ordersGrid.addEventListener('click', async (e) => {
        // Mode kiosque : un seul tap sur le gros bouton vert marque la commande comme
        // terminée (sans la supprimer) -- elle sort de la file kiosque et la suivante prend
        // directement sa place, mais elle reste visible en vert dans la vue normale.
        const kioskValidateBtn = e.target.closest('.kiosk-validate-btn');
        if (kioskValidateBtn) {
            clearReminder(kioskValidateBtn.dataset.id);
            kioskSelectedOrderId = null;
            await updateDoc(doc(db, 'orders', kioskValidateBtn.dataset.id), {
                completed: true,
                completedAt: serverTimestamp()
            });
            return;
        }
        const kioskBackBtn = e.target.closest('.kiosk-back-btn');
        if (kioskBackBtn) {
            kioskSelectedOrderId = null;
            renderOrders();
            return;
        }
        const kioskTile = e.target.closest('.kiosk-tile');
        if (kioskTile) {
            kioskSelectedOrderId = kioskTile.dataset.id;
            newOrderIds.delete(kioskSelectedOrderId);
            renderOrders();
            return;
        }

        if (document.body.classList.contains('kiosk-mode')) return;

        const card = e.target.closest('.order-card');
        if (!card) return;

        const orderId = card.dataset.id;
        const orderRef = doc(db, 'orders', orderId);
        const orderDoc = await getDoc(orderRef);

        if (orderDoc.exists()) {
            const order = orderDoc.data();
            viewModalTitle.textContent = `Commande de ${order.childName}`;

            let detailsHtml = Object.entries(order.drinks)
                .map(([drink, quantity]) => `<p><strong>${drink.replace(/([A-Z])/g, ' $1').trim()}:</strong> ${quantity}</p>`)
                .join('');
            viewModalBody.innerHTML = detailsHtml;

            deleteOrderBtn.dataset.id = orderId;
            editOrderBtn.dataset.id = orderId;
            openModal(viewOrderModal);
        }
    });

    // ====================================================================
    // === MONITORING BAR (mode kiosque) ===
    // Vue plein écran alternative, basculée par le bouton 🍹 du header (reste visible en mode
    // kiosque, voir styles.css) -- remplace la grille du kiosque par la liste des commandes bar
    // récentes (même flux CRM que le "Monitoring Bar" du site principal), pour garder l'écran utile
    // même quand il n'y a aucune commande anniversaire en attente. Autonome : simple fetch() vers la
    // Cloud Function, sans dépendre de Firestore du site principal (ce waiterio tourne sur un projet
    // Firebase différent -- "questoria-2459c" ci-dessus, pas "bowlingbackend"). Même logique
    // d'effacement (✕) définitif par commande qu'en face (dismissBarOrder côté site principal).
    // ====================================================================
    const GET_BAR_ORDERS_URL = 'https://us-central1-bowlingbackend.cloudfunctions.net/getBarOrders';
    const kioskBarMonitorBtn = document.getElementById('kiosk-bar-monitor-btn');
    const kioskBarMonitorView = document.getElementById('kiosk-bar-monitor-view');
    const kioskBarMonitorList = document.getElementById('kiosk-bar-monitor-list');
    const kioskBarMonitorBackBtn = document.getElementById('kiosk-bar-monitor-back-btn');

    let kioskBarMonitorInterval = null;
    let kioskBarMonitorKnownIds = new Set();
    let kioskBarMonitorBaselineDone = false;
    let kioskBarMonitorAlerts = [];

    function kioskOrderToAlert(o) {
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

    function renderKioskBarMonitor() {
        if (!kioskBarMonitorList) return;
        if (kioskBarMonitorAlerts.length === 0) {
            kioskBarMonitorList.innerHTML = '<p class="kiosk-bar-monitor-empty">Aucune nouvelle commande détectée pour l\'instant.</p>';
            return;
        }
        kioskBarMonitorList.innerHTML = kioskBarMonitorAlerts.map(o => `
            <div class="kiosk-bar-order-item${o.pending ? ' pending' : ''}">
                <div class="kiosk-bar-order-main">
                    <div>
                        <div class="kiosk-bar-order-zone">📍 ${o.zone || 'Zone inconnue'}</div>
                        <div class="kiosk-bar-order-time">${o.time} · ${o.reference}</div>
                    </div>
                    <div style="text-align:right;">
                        <div class="kiosk-bar-order-amount">${o.amount.toFixed(2)} €</div>
                        <span class="kiosk-bar-order-status" style="background:${o.statusColor}">${o.statusTitre}</span>
                    </div>
                </div>
                <button type="button" class="kiosk-bar-order-dismiss-btn" data-order-id="${o.id}" aria-label="Effacer cette commande">✕</button>
            </div>
        `).join('');
    }
    // Délégation (la liste est reconstruite à chaque render) -- ne fait jamais réapparaître une
    // commande effacée : son id reste dans kioskBarMonitorKnownIds, jamais retiré.
    if (kioskBarMonitorList) {
        kioskBarMonitorList.addEventListener('click', (e) => {
            const btn = e.target.closest('.kiosk-bar-order-dismiss-btn');
            if (!btn) return;
            kioskBarMonitorAlerts = kioskBarMonitorAlerts.filter(o => String(o.id) !== String(btn.dataset.orderId));
            renderKioskBarMonitor();
        });
    }

    async function pollKioskBarOrders() {
        try {
            const res = await fetch(GET_BAR_ORDERS_URL);
            const data = await res.json();
            if (!data.success || !Array.isArray(data.orders)) return;

            if (!kioskBarMonitorBaselineDone) {
                data.orders.forEach(o => kioskBarMonitorKnownIds.add(o.id));
                kioskBarMonitorBaselineDone = true;
                renderKioskBarMonitor();
                return;
            }

            const byId = new Map(data.orders.map(o => [o.id, o]));
            data.orders.filter(o => !kioskBarMonitorKnownIds.has(o.id)).forEach(o => {
                kioskBarMonitorKnownIds.add(o.id);
                kioskBarMonitorAlerts.unshift(kioskOrderToAlert(o));
            });
            // Rafraîchit aussi le statut de ce qui est déjà affiché (ex: passé de "en attente de
            // paiement" à "payé" entre deux vérifications), pas seulement les nouvelles commandes.
            kioskBarMonitorAlerts.forEach(alert => {
                const fresh = byId.get(alert.id);
                if (fresh) Object.assign(alert, kioskOrderToAlert(fresh));
            });
            renderKioskBarMonitor();
        } catch (error) {
            console.error('Erreur monitoring bar (kiosque)', error);
        }
    }

    function openKioskBarMonitor() {
        if (!kioskBarMonitorView) return;
        kioskBarMonitorKnownIds = new Set();
        kioskBarMonitorBaselineDone = false;
        kioskBarMonitorAlerts = [];
        renderKioskBarMonitor();
        kioskBarMonitorView.classList.remove('hidden');
        pollKioskBarOrders();
        kioskBarMonitorInterval = setInterval(pollKioskBarOrders, 30000);
    }

    function closeKioskBarMonitor() {
        if (kioskBarMonitorInterval) clearInterval(kioskBarMonitorInterval);
        kioskBarMonitorInterval = null;
        if (kioskBarMonitorView) kioskBarMonitorView.classList.add('hidden');
    }

    if (kioskBarMonitorBtn) {
        kioskBarMonitorBtn.addEventListener('click', () => {
            const isOpen = kioskBarMonitorView && !kioskBarMonitorView.classList.contains('hidden');
            if (isOpen) closeKioskBarMonitor();
            else openKioskBarMonitor();
        });
    }
    if (kioskBarMonitorBackBtn) {
        kioskBarMonitorBackBtn.addEventListener('click', closeKioskBarMonitor);
    }

    // --- MODE KIOSQUE ---
    // Écran tactile fixe dédié à l'affichage des commandes : plein écran, une seule commande
    // (la plus ancienne) affichée en très grand, gros bouton vert pour la valider.
    const KIOSK_MODE_KEY = 'waiterio_kiosk_mode';

    function setKioskMode(enabled) {
        document.body.classList.toggle('kiosk-mode', enabled);
        kioskModeBtn.classList.toggle('active', enabled);
        kioskModeBtn.setAttribute('aria-pressed', String(enabled));
        localStorage.setItem(KIOSK_MODE_KEY, enabled ? '1' : '0');
        if (!enabled) {
            kioskSelectedOrderId = null;
            // NOUVEAU : ne laisse pas le Monitoring Bar ouvert (et son polling tourner) en sortant du
            // mode kiosque -- on revient proprement à la vue normale.
            closeKioskBarMonitor();
        }

        if (enabled && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else if (!enabled && document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }

        renderOrders();
    }

    kioskModeBtn.addEventListener('click', () => {
        setKioskMode(!document.body.classList.contains('kiosk-mode'));
    });

    // Si le plein écran est quitté autrement (touche Échap, geste système...), on désactive
    // proprement le mode kiosque pour ne pas rester bloqué en vue restreinte.
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && document.body.classList.contains('kiosk-mode')) {
            setKioskMode(false);
        }
    });

    // Restaure l'affichage kiosque au chargement (pratique pour une tablette dédiée qui
    // redémarre) -- le plein écran, lui, ne peut être redemandé qu'après un geste utilisateur
    // (contrainte des navigateurs), donc on ne réactive que la mise en page, pas le fullscreen.
    const wantsKiosk = localStorage.getItem(KIOSK_MODE_KEY) === '1'
        || new URLSearchParams(window.location.search).get('kiosk') === '1';
    if (wantsKiosk) {
        document.body.classList.add('kiosk-mode');
        kioskModeBtn.classList.add('active');
        kioskModeBtn.setAttribute('aria-pressed', 'true');
        localStorage.setItem(KIOSK_MODE_KEY, '1');
    }

    // --- GESTION DES MODALS (Général) ---
function openModal(modal) {
    lastFocusedBeforeModal = document.activeElement;
    modal.classList.remove('hidden');
    // On ajoute une entrée à l'historique du navigateur
    history.pushState({ modalOpen: true }, null, '#modal');

    // Focus sur le premier élément interactif de la modale (accessibilité clavier)
    const focusable = modal.querySelectorAll(FOCUSABLE_SELECTOR);
    if (focusable.length) focusable[0].focus();
}

// Nouvelle fonction pour fermer un modal
function closeModal(modal) {
    modal.classList.add('hidden');
    // On redonne le focus à ce qui l'avait avant l'ouverture (ex: le bouton qui a ouvert la modale)
    if (lastFocusedBeforeModal && document.body.contains(lastFocusedBeforeModal)) {
        lastFocusedBeforeModal.focus();
    }
}

// On écoute l'événement 'popstate' qui se déclenche avec le bouton retour du navigateur
window.addEventListener('popstate', () => {
    // On cherche tous les modals qui pourraient être ouverts
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(closeModal);
});

allCancelButtons.forEach(btn => {
        btn.addEventListener('click', () => {
           history.back();
        });
    });

    // --- MODAL D'AJOUT DE COMMANDE & ONGLETS ---
function populateDrinkSelector() {
    const tabButtonsContainer = document.getElementById('drink-tab-buttons');
    const tabPanelsContainer = document.getElementById('drink-tab-panels');
    tabButtonsContainer.innerHTML = '';
    tabPanelsContainer.innerHTML = '';

    // L'ordre de tri souhaité pour les catégories
    const categoryOrder = ["Sodas", "Diabolo", "Sirops", "Granita", "Jus de fruits", "Eaux"];

    if (allDrinks.length === 0) {
        tabPanelsContainer.innerHTML = "<p>Chargement de la liste des boissons...</p>";
        return;
    }

    const drinksByCategory = {};
    allDrinks.forEach(drink => {
        if (!drinksByCategory[drink.category]) {
            drinksByCategory[drink.category] = [];
        }
        drinksByCategory[drink.category].push(drink);
    });

    let firstCategory = true;
    
    // On trie les catégories selon notre ordre personnalisé
    Object.keys(drinksByCategory).sort((a, b) => {
        return categoryOrder.indexOf(a) - categoryOrder.indexOf(b);
    }).forEach(category => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tab-button';
        button.textContent = category;
        button.dataset.target = `panel-${category.replace(/\s+/g, '-')}`;
        tabButtonsContainer.appendChild(button);

        const panel = document.createElement('div');
        panel.id = `panel-${category.replace(/\s+/g, '-')}`;
        panel.className = 'tab-panel';

        drinksByCategory[category].forEach(drink => {
            const drinkId = drink.id;
            const outOfStockClass = drink.inStock ? '' : 'out-of-stock';
            panel.innerHTML += `
                <div class="drink-item ${outOfStockClass}">
                    <span>${drink.name}</span>
                    <div class="counter" data-drink="${drinkId}">
                        <button type="button" class="btn-minus">-</button>
                        <span class="quantity">0</span>
                        <button type="button" class="btn-plus">+</button>
                    </div>
                </div>`;
        });
        tabPanelsContainer.appendChild(panel);

        if (firstCategory) {
            button.classList.add('active');
            panel.classList.add('active');
            firstCategory = false;
        }
    });
}
    
    document.getElementById('drink-tab-buttons').addEventListener('click', e => {
        if (e.target.matches('.tab-button')) {
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
            
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.target).classList.add('active');
        }
    });

    // --- MODAL DE VISUALISATION & SUPPRESSION ---
    deleteOrderBtn.addEventListener('click', () => {
        const orderId = deleteOrderBtn.dataset.id;
        confirmDeleteBtn.dataset.id = orderId;
        openModal(confirmDeleteModal);
    });

    confirmDeleteBtn.addEventListener('click', async (e) => {
        const orderId = e.target.dataset.id;
        await deleteDoc(doc(db, "orders", orderId));
        history.back(); // Ferme le modal de confirmation
        history.back();
    });

    // --- MODAL ADMIN ---
    adminUsersBtn.addEventListener('click', async () => {
        const usersRef = collection(db, 'users');
        const querySnapshot = await getDocs(usersRef);
        
        usersListContainer.innerHTML = 'Chargement...';
        openModal(adminUsersModal);
        
        let usersHtml = '';
        querySnapshot.forEach(doc => {
            const user = doc.data();
            usersHtml += `
                <div class="user-row">
                    <div class="user-row-info">
                        <span class="name">${user.displayName}</span>
                        <span class="email">${user.email}</span>
                    </div>
                    <select class="user-role-select" data-userid="${doc.id}">
                        <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Visiteur</option>
                        <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>Modérateur</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                </div>
            `;
        });
        usersListContainer.innerHTML = usersHtml;
    });
    
async function openStockManagementModal() {
        const drinksRef = collection(db, 'drinks');
        const q = query(drinksRef, orderBy('category'), orderBy('name'));
        const querySnapshot = await getDocs(q);

        stockListContainer.innerHTML = 'Chargement...';
        openModal(stockManagementModal);

        const drinksByCategory = {};
        querySnapshot.forEach(doc => {
            const drink = doc.data();
            if (!drinksByCategory[drink.category]) {
                drinksByCategory[drink.category] = [];
            }
            drinksByCategory[drink.category].push({ id: doc.id, ...drink });
        });
        
        let html = '';
        for (const category in drinksByCategory) {
            html += `<div class="stock-category"><h4>${category}</h4>`;
            drinksByCategory[category].forEach(drink => {
                html += `
                    <div class="stock-item">
                        <span>${drink.name}</span>
                        <label class="switch">
                            <input type="checkbox" class="stock-toggle" data-id="${drink.id}" ${drink.inStock ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                `;
            });
            html += `</div>`;
        }
        stockListContainer.innerHTML = html;
    }

    // Écouteur pour le bouton "Gérer les stocks"
    stockManagementBtn.addEventListener('click', openStockManagementModal);

    // Écouteur pour les changements sur les interrupteurs de stock
    stockListContainer.addEventListener('change', async (e) => {
        if (e.target.matches('.stock-toggle')) {
            const drinkId = e.target.dataset.id;
            const newStockStatus = e.target.checked;
            
            const drinkRef = doc(db, 'drinks', drinkId);
            try {
                await updateDoc(drinkRef, { inStock: newStockStatus });
            } catch (error) {
                console.error("Erreur de mise à jour du stock : ", error);
                alert("La mise à jour du stock a échoué.");
                // On remet l'interrupteur à son état initial en cas d'erreur
                e.target.checked = !newStockStatus;
            }
        }
    });

    usersListContainer.addEventListener('change', async (e) => {
        if (e.target.matches('.user-role-select')) {
            const userId = e.target.dataset.userid;
            const newRole = e.target.value;

            if (userId === currentUser.uid && newRole !== 'admin') {
                alert("Vous ne pouvez pas retirer votre propre statut d'administrateur.");
                e.target.value = 'admin';
                return;
            }

            const userRef = doc(db, 'users', userId);
            await updateDoc(userRef, { role: newRole });
            alert(`Le rôle de l'utilisateur a été mis à jour.`);
        }
    });

async function openEditModal(orderId) {
    populateDrinkSelector();
    const orderRef = doc(db, 'orders', orderId);
    const orderDoc = await getDoc(orderRef);

    if (!orderDoc.exists()) {
        console.error("Impossible de trouver la commande pour l'édition.");
        return;
    }
    const orderData = orderDoc.data();

    document.getElementById('child-name-input').value = orderData.childName;
    document.querySelectorAll('#add-order-modal .counter').forEach(counter => {
        const drinkName = counter.dataset.drink;
        const quantitySpan = counter.querySelector('.quantity');
        quantitySpan.textContent = orderData.drinks[drinkName] || 0;
    });

    addOrderModal.querySelector('h3').textContent = 'Modifier la Commande';
    addOrderModal.querySelector('button[type="submit"]').textContent = 'Enregistrer';
    addOrderModal.dataset.mode = 'edit';
    addOrderModal.dataset.editingId = orderId;

    updateTotalDrinksDisplay();
    // On utilise notre nouvelle fonction pour ouvrir le modal et gérer l'historique
    openModal(addOrderModal);
}

editOrderBtn.addEventListener('click', (e) => {
    const orderId = e.target.dataset.id;
    // On simule un "retour" pour fermer le modal de vue via notre écouteur 'popstate'
    history.back();
    // On ouvre ensuite le modal d'édition, qui va créer sa propre entrée dans l'historique
    openEditModal(orderId);
});

    // --- RÉASSORT DU SOIR (liste partagée temps réel, cave -> bar) ---

    function listenToReassort() {
        const reassortRef = collection(db, 'reassort');
        const q = query(reassortRef, orderBy('createdAt', 'asc'));
        unsubscribeReassort = onSnapshot(q, (snapshot) => {
            allReassortItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            renderReassortList();
        });
    }

    // Catalogue persistant des articles ajoutés manuellement (ex: "Champomy"),
    // pour qu'ils réapparaissent dans la recherche les fois suivantes.
    function listenToReassortCatalog() {
        const catalogRef = collection(db, 'reassortCatalog');
        unsubscribeReassortCatalog = onSnapshot(catalogRef, (snapshot) => {
            customCatalogItems = snapshot.docs.map(d => d.data());
        });
    }

    function slugify(name) {
        return name.trim().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accents
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }

    async function saveCustomCatalogItem(name) {
        const slug = slugify(name);
        if (!slug) return;
        await setDoc(doc(db, 'reassortCatalog', slug), { name: name.trim(), category: 'Autre' }, { merge: true });
    }

    function renderReassortItemRow(item, interactive) {
        if (!interactive) {
            return `
                <div class="reassort-item read-only ${item.done ? 'done' : ''}">
                    <span class="reassort-name">${item.name}</span>
                    <span class="quantity">x${item.quantity}</span>
                </div>
            `;
        }
        const statusLabel = item.done ? ', récupéré' : '';
        return `
            <div class="reassort-item ${item.done ? 'done' : ''}" data-id="${item.id}"
                 aria-label="${item.name}, quantité ${item.quantity}${statusLabel}">
                <span class="reassort-name">${item.name}</span>
                <div class="counter">
                    <button type="button" class="btn-minus" data-action="dec" aria-label="Diminuer la quantité de ${item.name}">-</button>
                    <span class="quantity">${item.quantity}</span>
                    <button type="button" class="btn-plus" data-action="inc" aria-label="Augmenter la quantité de ${item.name}">+</button>
                </div>
                <button type="button" class="reassort-icon-btn" data-action="toggle" aria-label="${item.done ? 'Marquer non récupéré' : 'Marquer récupéré'} : ${item.name}">
                    <span class="material-icons" aria-hidden="true">${item.done ? 'check_circle' : 'radio_button_unchecked'}</span>
                </button>
                <button type="button" class="reassort-icon-btn" data-action="delete" aria-label="Supprimer ${item.name}">
                    <span class="material-icons" aria-hidden="true">delete</span>
                </button>
            </div>
        `;
    }

    function groupByCategory(items) {
        const grouped = {};
        items.forEach(item => {
            const cat = item.category || 'Autre';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
        });
        return grouped;
    }

    function renderReassortList() {
        const pending = allReassortItems.filter(i => !i.done);
        const done = allReassortItems.filter(i => i.done);

        reassortBadge.textContent = pending.length;
        reassortBadge.classList.toggle('hidden', pending.length === 0);
        reassortClearDoneBtn.classList.toggle('hidden', done.length === 0);

        const items = [...pending, ...done];
        if (items.length === 0) {
            reassortList.innerHTML = "<p class=\"reassort-empty\">Aucun article pour l'instant.</p>";
            return;
        }

        const grouped = groupByCategory(items);
        reassortList.innerHTML = Object.entries(grouped).map(([category, catItems]) => `
            <div class="reassort-category">
                <h4 class="reassort-category-title">${category}</h4>
                ${catItems.map(item => renderReassortItemRow(item, true)).join('')}
            </div>
        `).join('');

        // Clavier ouvert = zone de liste réduite ; on garde l'article qu'on vient
        // d'ajouter visible au lieu de le laisser hors-champ tout en haut.
        if (pendingScrollToNewItem) {
            pendingScrollToNewItem = false;
            requestAnimationFrame(() => {
                reassortActiveView.scrollTop = reassortActiveView.scrollHeight;
            });
        }
    }

    async function addReassortItem(name, category) {
        const cleanName = name.trim();
        if (!cleanName) return;

        pendingScrollToNewItem = true;

        // Si l'article est déjà dans la liste (non récupéré), on incrémente sa quantité
        // plutôt que de créer une entrée en double.
        const existing = allReassortItems.find(
            i => !i.done && i.name.toLowerCase() === cleanName.toLowerCase()
        );

        if (existing) {
            await updateDoc(doc(db, 'reassort', existing.id), { quantity: increment(1) });
        } else {
            await addDoc(collection(db, 'reassort'), {
                name: cleanName,
                category: category || 'Autre',
                quantity: 1,
                done: false,
                addedBy: currentUser.uid,
                addedByName: currentUser.displayName,
                createdAt: serverTimestamp()
            });
        }
    }

    function renderReassortSuggestions(rawQuery) {
        const q = rawQuery.trim().toLowerCase();

        if (!q) {
            suggestionItems = [];
            reassortSuggestions.classList.add('hidden');
            reassortSuggestions.innerHTML = '';
            return;
        }

        const fullCatalog = [...REASSORT_CATALOG, ...customCatalogItems];
        const matches = fullCatalog.filter(a => a.name.toLowerCase().includes(q)).slice(0, 6);
        const exactMatch = matches.some(a => a.name.toLowerCase() === q);

        suggestionItems = matches.map(a => ({ name: a.name, category: a.category, custom: false }));
        if (!exactMatch) {
            suggestionItems.push({ name: rawQuery.trim(), category: 'Autre', custom: true });
        }

        // La meilleure correspondance (1er match) s'affiche tout en bas, au plus près
        // du pouce/clavier ; les résultats moins pertinents restent accessibles en scrollant vers le haut.
        const displayOrder = suggestionItems.map((item, i) => ({ ...item, originalIndex: i })).reverse();
        reassortSuggestions.innerHTML = displayOrder.map(item => `
            <div role="option" data-index="${item.originalIndex}" class="suggestion-item ${item.custom ? 'suggestion-custom' : ''}">
                ${item.custom
                    ? `<span>+ Ajouter « ${item.name} »</span>`
                    : `<span>${item.name}</span><span class="suggestion-cat">${item.category}</span>`}
            </div>
        `).join('');
        reassortSuggestions.classList.remove('hidden');
        reassortSuggestions.scrollTop = reassortSuggestions.scrollHeight;
    }

    function selectSuggestion(index) {
        const item = suggestionItems[index];
        if (!item) return;
        addReassortItem(item.name, item.category);
        if (item.custom) {
            saveCustomCatalogItem(item.name);
        }
        reassortSearchInput.value = '';
        renderReassortSuggestions('');
        reassortSearchInput.focus(); // reste sur le clavier pour enchaîner l'article suivant
    }

    reassortBtn.addEventListener('click', () => {
        reassortSearchInput.value = '';
        renderReassortSuggestions('');
        showReassortHistory(false);
        openModal(reassortModal);
        // Focus direct sur la recherche : le clavier mobile s'ouvre tout de suite.
        setTimeout(() => reassortSearchInput.focus(), 100);
    });

    reassortSearchInput.addEventListener('input', () => {
        renderReassortSuggestions(reassortSearchInput.value);
    });

    reassortSuggestions.addEventListener('click', (e) => {
        const el = e.target.closest('.suggestion-item');
        if (!el) return;
        selectSuggestion(Number(el.dataset.index));
    });

    reassortList.addEventListener('click', async (e) => {
        const actionBtn = e.target.closest('[data-action]');
        const row = e.target.closest('.reassort-item');
        if (!actionBtn || !row) return;

        const itemId = row.dataset.id;
        const item = allReassortItems.find(i => i.id === itemId);
        if (!item) return;
        const itemRef = doc(db, 'reassort', itemId);

        switch (actionBtn.dataset.action) {
            case 'inc':
                await updateDoc(itemRef, { quantity: increment(1) });
                break;
            case 'dec':
                if (item.quantity > 1) {
                    await updateDoc(itemRef, { quantity: increment(-1) });
                } else {
                    await deleteDoc(itemRef);
                }
                break;
            case 'toggle':
                await updateDoc(itemRef, { done: !item.done });
                break;
            case 'delete':
                await deleteDoc(itemRef);
                break;
        }
    });

    reassortClearDoneBtn.addEventListener('click', async () => {
        const doneItems = allReassortItems.filter(i => i.done);
        if (doneItems.length === 0) return;
        if (!confirm(`Supprimer les ${doneItems.length} article(s) récupéré(s) ?`)) return;

        const batch = writeBatch(db);
        doneItems.forEach(i => batch.delete(doc(db, 'reassort', i.id)));
        await batch.commit();
    });

    // --- FINIR : clôture la liste active, l'archive dans l'historique ---
    reassortFinishBtn.addEventListener('click', async () => {
        if (allReassortItems.length === 0) {
            alert('La liste est vide.');
            return;
        }
        if (!confirm('Clôturer le réassort de ce soir ? La liste sera archivée dans l\'historique et vidée pour la suite.')) {
            return;
        }

        const snapshot = allReassortItems.map(i => ({
            name: i.name,
            category: i.category,
            quantity: i.quantity,
            done: i.done
        }));

        await addDoc(collection(db, 'reassortHistory'), {
            items: snapshot,
            finishedAt: serverTimestamp(),
            finishedBy: currentUser.uid,
            finishedByName: currentUser.displayName
        });

        const batch = writeBatch(db);
        allReassortItems.forEach(i => batch.delete(doc(db, 'reassort', i.id)));
        await batch.commit();

        history.back(); // Ferme le modal
    });

    // --- HISTORIQUE (lecture seule, purge auto après 2 jours) ---
    function showReassortHistory(show) {
        reassortHistoryOpen = show;
        reassortActiveView.classList.toggle('hidden', show);
        reassortHistoryView.classList.toggle('hidden', !show);
        reassortHistoryBtn.textContent = show ? 'Retour' : 'Historique';
        if (show) {
            loadReassortHistory();
        }
    }

    reassortHistoryBtn.addEventListener('click', () => {
        showReassortHistory(!reassortHistoryOpen);
    });

    async function loadReassortHistory() {
        reassortHistoryList.innerHTML = '<p class="reassort-empty">Chargement...</p>';

        const historyRef = collection(db, 'reassortHistory');
        const q = query(historyRef, orderBy('finishedAt', 'desc'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            reassortHistoryList.innerHTML = '<p class="reassort-empty">Aucun historique récent.</p>';
            return;
        }

        reassortHistoryList.innerHTML = snapshot.docs.map(d => {
            const entry = d.data();
            const dateLabel = entry.finishedAt ? entry.finishedAt.toDate().toLocaleString('fr-FR') : '...';
            const grouped = groupByCategory(entry.items || []);
            const itemsHtml = Object.entries(grouped).map(([category, catItems]) => `
                <div class="reassort-category">
                    <h4 class="reassort-category-title">${category}</h4>
                    ${catItems.map(item => renderReassortItemRow(item, false)).join('')}
                </div>
            `).join('');

            return `
                <details class="reassort-history-entry">
                    <summary>${dateLabel} — ${entry.finishedByName || ''}</summary>
                    ${itemsHtml}
                </details>
            `;
        }).join('');
    }

    async function purgeOldReassortHistory() {
        const cutoff = Date.now() - REASSORT_HISTORY_TTL_MS;
        const snapshot = await getDocs(collection(db, 'reassortHistory'));
        const stale = snapshot.docs.filter(d => {
            const finishedAt = d.data().finishedAt;
            return finishedAt && finishedAt.toMillis() < cutoff;
        });
        if (stale.length === 0) return;

        const batch = writeBatch(db);
        stale.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }

});
