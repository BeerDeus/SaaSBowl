/* « Guide général du CRM » (créer et vendre une activité, de A à Z ; renvoie vers les guides détaillés) : le texte, et pour chaque capture ce que fait le CRM avant la photo
   (faire : du JS dans la page, avec D = outils : D.clic, D.saisir, D.choisir, D.rendre), la zone photographiée et les repères numérotés.
   Exemple suivi tout du long : « Réalité virtuelle », 2 salles (Bleue 4 pers., Rouge 6 pers.), 2 formules. Elle reçoit l'identifiant act8. */
const CRM = '/maquettes/e-v2.html';
const B = s => ({ css: 'button', txt: s });                 // un bouton d'après son texte
const BLOC = s => ({ css: 'section.bloc', txt: s });        // un bloc du CRM d'après son titre
const ID = 'act8';
const vers = (ecran, sous) => `S.ecran = '${ecran}'; ${sous || ''} D.rendre(); window.scrollTo(0, 0);`;
const DATE = n => `new Date(Date.now() + ${n} * 864e5).toISOString().slice(0, 10)`;

export default {
  titre: 'Guide général',
  surtitre: 'Créer et vendre une activité',
  ordre: 0,
  sousTitre: 'Le parcours complet, pas à pas : de la fiche vide à l’activité vendue sur les **bornes**, le **site** et au **comptoir**. Les guides détaillés prennent le relais pour aller plus loin.',
  collection: 'Guides du CRM',
  edition: 'Octobre 2026',
  fichier: 'Guide général du CRM.pdf',
  intro: [
    'Le guide suit un exemple du début à la fin : une activité **Réalité virtuelle**, avec 2 salles et 2 formules. Remplacez les noms, les nombres et les prix par les vôtres.',
    'Sur les captures, ce qu’il faut regarder est **entouré en orange et numéroté**. Les numéros renvoient aux explications juste en dessous.',
    'Ce guide fait le tour de tout, sans entrer dans chaque détail. Les encadrés orange **« Pour aller plus loin »** renvoient vers le guide détaillé du sujet ; la liste complète des guides est à la dernière page.'
  ],
  sections: [

    /* ------------------------------------------------------------------ */
    { titre: 'Avant de commencer', chapeau: 'Notez ces informations avant d’ouvrir le CRM : la création ne prend ensuite que quelques minutes.',
      blocs: [
        { tableau: [['À préparer', 'Dans l’exemple'],
          ['Le **nom** de l’activité, tel que les clients le liront', 'Réalité virtuelle'],
          ['Ce qu’on **réserve** et combien il y en a', '2 salles'],
          ['Combien de **personnes** dans chacune', 'Salle Bleue : 4. Salle Rouge : 6'],
          ['Les **formules**, leur **durée** et leurs **prix**', 'Session 30 min : 15 € en semaine l’après-midi, 18 € sinon. Session 1 h : 28 €'],
          ['Les **jours et heures** de réservation', 'Mercredi, samedi et dimanche dès 14 h ; les autres jours dès 17 h ; dernière séance à 22 h 30'],
          ['**Où** on la vend', 'Site web, bornes et comptoir']] },
        { texte: 'Il faut aussi choisir son **fonctionnement**. C’est le choix le plus important : il décide de ce que la borne et le site demandent au client.' },
        { tableau: [['Fonctionnement', 'Pour quoi', 'Exemples'],
          ['**À la partie**', 'Des parties par joueur. Le nombre de pistes se calcule selon le groupe.', 'Bowling, fléchettes'],
          ['**À la séance**', 'Des séances à heure fixe. Chaque groupe a sa salle.', 'Laser game, quiz, réalité virtuelle'],
          ['**À la durée, ressource entière**', 'Le groupe loue la salle entière pour une durée.', 'Karaoké, salle privative'],
          ['**Accès libre**', 'Pas de créneau : on ouvre une table libre à la demande.', 'Billard, arcade'],
          ['**Formule combinée**', 'Enchaîne plusieurs activités, avec des options.', 'Anniversaire'],
          ['**Vente simple**', 'Des produits, sans créneau.', 'Bar, boutique']] },
        { encadre: ['Tout se modifie après la création : nom, salles, formules, prix, et même le fonctionnement.'], titre: 'Rien n’est définitif' },
        { encadre: ['Les six fonctionnements en détail, avec ce que le client voit sur la borne et comment en changer : **Guide - Les types d’activité**. Pour un anniversaire : **Guide - Les anniversaires** ; pour le bar : **Guide - Le bar**.'], titre: 'Pour aller plus loin', genre: 'renvoi' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Ouvrir la page de création',
      blocs: [
        { duo: [
          { capture: { nom: 'menu-act', page: CRM, faire: `S.adminOuvert = true; ${vers('tdb')}`, zone: { sel: '.arbre .plus', parent: '.grp' }, marge: 14,
              marques: [{ cible: B('Ajouter une activité'), n: 1, cote: 'droite' }] },
            reperes: [[1, 'Ajouter une activité,', 'en bas de la liste des activités du menu de gauche.']] },
          { capture: { nom: 'menu-admin', faire: ``, zone: { sel: '[data-a="admin"]', parent: '.grp' }, marge: 14,
              marques: [{ cible: { css: '.arbre button', txt: 'Sandbox' }, n: 2 }] },
            reperes: [[2, 'Sandbox,', 'dans la rubrique Administratif, puis l’onglet « Nouvelle activité ». C’est le même écran.']] }] },
        { encadre: ['Votre compte n’a pas le droit « Sandbox ». Demandez-le à un responsable (Administratif › Comptes et accès).'], titre: 'Vous ne voyez pas ces boutons ?', genre: 'attention' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Le nom et le fonctionnement', chapeau: 'Le formulaire se remplit de haut en bas, en trois blocs numérotés.',
      blocs: [
        { capture: { nom: 'nom-fonctionnement', faire: `${vers('sandbox', `S.sousO.sandbox = 'nouvelle';
              S.nouv = { nom: '', fonct: 'seance', ressNom: 'Salle', nb: 1, cap: 10, duree: 30, battement: 0, pointage: 'borne', canaux: ['web', 'borne', 'comptoir'], ressources: [], formules: [{ nom: '1 session', unite: 'par joueur', duree: 30, couleur: '#6fe0c9', regles: [{ jours: 'tous', prix: 10 }] }] };`)}
              D.saisir('[data-f="nouv.nom"]', 'Réalité virtuelle'); D.clic('[data-a="nouvFonct"][data-id="seance"]');`,
            zone: [{ sel: '[data-f="nouv.nom"]', parent: 'label' }, '[data-a="nouvFonct"][data-id="vente"]', BLOC('Ce que ça donne')], marge: 20,
            marques: [{ cible: '[data-f="nouv.nom"]', n: 1 }, { cible: '[data-a="nouvFonct"][data-id="seance"]', n: 2 }, { cible: BLOC('Ce que ça donne'), n: 3, cote: 'droite' }] },
          reperes: [[1, 'Nom de l’activité.', 'Affiché partout : menu, bornes, site, tickets.'],
            [2, 'Le fonctionnement.', 'Cliquez sur la bonne carte, elle devient bleue. Ici : « À la séance ».'],
            [3, 'Ce que ça donne.', 'Le résumé se met à jour pendant la saisie. Relisez-le avant de créer.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les salles', chapeau: 'Toujours dans le bloc 1 : ce que le client réserve, combien il y en a, et combien de personnes chacune accueille.',
      blocs: [
        { capture: { nom: 'salles', faire: `D.saisir('[data-f="nouv.ressNom"]', 'Salle'); D.saisir('[data-f="nouv.nb"]', '2'); D.saisir('[data-f="nouv.cap"]', '4');
              D.saisir('[data-f="nouvRes.0.nom"]', 'Salle Bleue'); D.saisir('[data-f="nouvRes.1.nom"]', 'Salle Rouge'); D.saisir('[data-f="nouvRes.1.cap"]', '6');`,
            zone: [{ sel: '[data-f="nouv.ressNom"]', parent: 'label' }, { sel: '[data-f="nouv.cap"]', parent: 'label' }, '[data-nouv="ress"]'], marge: 22,
            marques: [{ cible: { sel: '[data-f="nouv.ressNom"]', parent: 'label' }, n: 1 }, { cible: { sel: '[data-f="nouv.nb"]', parent: 'label' }, n: 2 },
              { cible: { sel: '[data-f="nouv.cap"]', parent: 'label' }, n: 3 }, { cible: '[data-nouv="ress"] .chips', n: 4 }] },
          reperes: [[1, 'Une ressource s’appelle :', 'salle, piste, table, casque… au singulier.'],
            [2, 'Combien.', 'Le nombre de salles. Une case par salle apparaît en dessous.'],
            [3, 'Personnes par défaut.', 'La capacité de départ de chaque salle.'],
            [4, 'Chaque salle', 'peut avoir son nom et sa capacité. Ici : Salle Bleue (4) et Salle Rouge (6).']] },
        { encadre: ['La borne et le site ne proposent jamais plus de personnes que la plus grande salle. Un groupe de 5 ira tout seul dans la Salle Rouge.'], titre: 'La capacité compte' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Attribution des salles et battement', chapeau: 'Deux réglages en bas du bloc 1. Dans la plupart des cas, gardez « Automatique ».',
      blocs: [
        { capture: { nom: 'attribution', faire: `D.choisir('[data-f="lies.nouv.battement"]', '5');`,
            zone: ['[data-nouv="capa"]', '[data-nouv="lies"]'], marge: 16,
            marques: [{ cible: '[data-a="choixRess"][data-v="0"]', n: 1 }, { cible: '[data-a="choixRess"][data-v="1"]', n: 2, cote: 'droite' }, { cible: '[data-f="lies.nouv.battement"]', n: 3 }] },
          reperes: [[1, 'Automatique.', 'Chaque groupe reçoit la plus petite salle où il tient. Le client ne choisit pas sa salle.'],
            [2, 'Au choix du client.', 'Le client choisit d’abord sa salle (utile quand chaque salle est une expérience différente, comme un escape game).'],
            [3, 'Battement.', 'Le temps de préparation entre deux groupes. Ici 5 minutes.']] },
        { options: 'Attribution des salles', lignes: [
          ['Automatique', 'Le groupe reçoit la plus petite salle libre où il tient : 3 joueurs vont dans la Salle Bleue (4), 5 joueurs dans la Salle Rouge (6). Le client ne voit pas les salles : il choisit seulement sa formule et son heure.', 'Les salles se valent (laser, karaoké, réalité virtuelle). C’est le cas le plus courant.'],
          ['Au choix du client', 'Une page « Salle » s’ajoute au début du parcours, sur la borne et sur le site : chaque salle avec son nom, sa description et sa capacité. Le client voit ensuite les heures libres de cette salle seulement.', 'Chaque salle est une expérience différente (escape game, salles à thème). Pensez à écrire une description pour chaque salle.']] },
        { options: 'Battement entre deux groupes', lignes: [
          ['Aucun', 'Un groupe peut entrer dès que le précédent sort.', 'Rien à préparer entre deux groupes.'],
          ['5 à 30 min', 'La salle n’est reproposée qu’après ce délai. Exemple : créneaux toutes les 30 min, une Session 30 min à 14:00, 5 min de battement : la salle est libre à 14:35, elle n’est donc plus proposée à 14:30, mais de nouveau à 15:00.', 'Ménage, rangement, consignes de sécurité, matériel à recharger.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les formules et leurs prix', chapeau: 'Bloc 2. Une formule, c’est ce que le client achète : un nom, une durée et un prix. Le prix peut changer selon le jour et l’heure.',
      blocs: [
        { capture: { nom: 'formule', taille: [780, 1000], faire: `
              D.saisir('[data-f="px.nouv.0.nom"]', 'Session 30 min'); D.choisir('[data-f="px.nouv.0.duree"]', '30');
              D.choisir('[data-f="px.nouv.0.0.jours"]', 'lv'); D.saisir('[data-f="px.nouv.0.0.de"]', '14:00'); D.saisir('[data-f="px.nouv.0.0.a"]', '17:30'); D.saisir('[data-f="px.nouv.0.0.prix"]', '15');
              D.clic('[data-a="pxAddR"][data-pre="nouv"][data-fi="0"]');
              D.choisir('[data-f="px.nouv.0.1.jours"]', 'tous'); D.saisir('[data-f="px.nouv.0.1.prix"]', '18');`,
            zone: { sel: '[data-f="px.nouv.0.nom"]', parent: '.bloc' }, marge: 14,
            marques: [{ cible: '[data-f="px.nouv.0.nom"]', n: 1 }, { cible: '[data-f="px.nouv.0.unite"]', n: 2 }, { cible: '[data-f="px.nouv.0.duree"]', n: 3 },
              { cible: ['[data-f="px.nouv.0.0.jours"]', '[data-f="px.nouv.0.0.a"]'], n: 4 }, { cible: '[data-f="px.nouv.0.0.prix"]', n: 5 },
              { cible: '[data-a="pxAddR"][data-pre="nouv"][data-fi="0"]', n: 6 }] },
          reperes: [[1, 'Nom de la formule,', 'tel que le client le voit.'],
            [2, 'Unité.', 'Ce que compte le prix : par joueur, la salle, par groupe…'],
            [3, 'Durée.', 'Le temps pendant lequel la salle est occupée.'],
            [4, 'Quand.', 'Les jours et les heures de ce prix. Heures vides : toute la journée.'],
            [5, 'Prix', 'quand la règle s’applique.'],
            [6, 'Règle de prix.', 'Ajoute une ligne « SINON SI » pour un autre prix.']] },
        { options: 'Unité du prix', lignes: [
          ['par joueur, par enfant', 'Le prix est multiplié par le nombre de personnes : 4 joueurs × 15 € = 60 €.', 'Le cas général : laser, réalité virtuelle, anniversaire.'],
          ['la salle, par groupe, par table', 'Un seul prix pour tout le groupe, quel que soit le nombre de personnes.', 'Location d’une salle entière (karaoké), d’une table (billard).']] },
        { encadre: ['**SI** du lundi au vendredi de 14:00 à 17:30, **ALORS** 15 € ; **SINON SI** tous les jours, **ALORS** 18 €.', 'Un mardi à 15 h : 15 €. Un mardi à 19 h ou un samedi : 18 €.'], titre: 'Lire la formule de l’exemple', genre: 'exemple' },
        { encadre: ['Quand plusieurs règles correspondent, la **plus précise** gagne. Une règle peut aussi viser une taille de groupe, les vacances scolaires ou les jours fériés (les cases sous les jours).'], titre: 'Quelle règle donne le prix ?' },
        { encadre: ['Tous les réglages des prix (jours, vacances, fériés, heures après minuit, tarifs de groupe, formule vendue seulement à certaines heures), avec des exemples prêts à recopier : **Guide - Prix et horaires**.'], titre: 'Pour aller plus loin', genre: 'renvoi' },
        { capture: { nom: 'formule-2', taille: [780, 1000], faire: `
              D.clic('[data-a="pxAddF"][data-pre="nouv"]');
              D.saisir('[data-f="px.nouv.1.nom"]', 'Session 1 h'); D.choisir('[data-f="px.nouv.1.duree"]', '60'); D.saisir('[data-f="px.nouv.1.0.prix"]', '28');`,
            zone: [{ sel: '[data-f="px.nouv.1.nom"]', parent: '.bloc' }, '[data-a="pxAddF"][data-pre="nouv"]'], marge: 14,
            marques: [{ cible: { sel: '[data-f="px.nouv.1.nom"]', parent: '.bloc' }, n: 1, marge: 2 }, { cible: '[data-a="pxAddF"][data-pre="nouv"]', n: 2 }] },
          reperes: [[1, 'Deuxième formule :', '« Session 1 h », 60 min, 28 € tous les jours. Une seule règle suffit.'],
            [2, 'Ajouter une formule.', 'La croix en haut à droite d’une formule la supprime.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Pointage, vente et création',
      blocs: [
        { capture: { nom: 'pointage-vente', faire: ``,
            zone: [BLOC('3 · Pointage et vente'), '[data-a="creer"]'], marge: 16,
            marques: [{ cible: { css: '.chips', txt: 'Pointage' }, n: 1 }, { cible: { css: '.chips', txt: 'Vendue' }, n: 2 }, { cible: '[data-a="creer"]', n: 3 }] },
          reperes: [[1, 'Pointage.', 'Comment l’arrivée du client est confirmée (détail ci-dessous).'],
            [2, 'Vendue.', 'Où l’activité se vend. Bleu = actif, un clic pour retirer.'],
            [3, 'Créer l’activité.', 'Elle est créée **masquée** : les clients ne la voient pas encore.']] },
        { options: 'Pointage', lignes: [
          ['Le client valide lui-même sur une borne (recommandé)', 'En arrivant, le client confirme sa réservation sur une borne. Sans confirmation à l’heure, la réservation est considérée comme annulée et la place est libérée pour d’autres clients. L’accueil n’a rien à faire.', 'Le fonctionnement de Space Bowling, pour toutes les activités à créneau.'],
          ['L’accueil pointe l’arrivée dans le CRM', 'Un bouton « Pointer » apparaît sur chaque réservation du jour (planning, fiche de la réservation). C’est l’équipe qui confirme l’arrivée, d’un clic par groupe.', 'Quand l’équipe accueille chaque groupe en personne, ou s’il n’y a pas de borne à l’entrée.'],
          ['Pas de pointage', 'Aucun suivi d’arrivée : la réservation reste valable, que le client vienne ou non.', 'Activités sans enjeu de place, ou payées d’avance en totalité.']] },
        { options: 'Vendue', lignes: [
          ['Site web', 'L’activité se réserve en ligne, sur le site.', 'Dès qu’elle doit pouvoir être réservée à l’avance par les clients.'],
          ['Bornes', 'Elle est proposée sur les bornes cochées dans le Catalogue des bornes (chapitre 12).', 'Pour la vendre sur place sans passer par l’accueil.'],
          ['Comptoir', 'L’équipe peut la réserver depuis le front employé et le CRM.', 'Presque toujours : c’est le recours quand le client appelle ou se présente à l’accueil.']] },
        { duo: [
          { capture: { nom: 'creee', faire: `D.clic('[data-a="creer"]'); if (S.act !== '${ID}') throw new Error('identifiant inattendu : ' + S.act); document.querySelectorAll('.toast').forEach(x => x.remove());`, attente: 700,
              zone: { sel: '.arbre .plus', parent: '.grp' }, marge: 14, marques: [{ cible: { css: '.arbre button', txt: 'Réalité virtuelle' }, n: 1, cote: 'droite' }] },
            reperes: [[1, 'Dans le menu,', 'l’activité apparaît avec la mention MASQUÉE.']] },
          { capture: { nom: 'creee-sandbox', faire: ``, zone: '.snav', marge: 14, marques: [{ cible: { css: '.snav button', txt: 'Réalité virtuelle' }, n: 2 }] },
            reperes: [[2, 'Dans la Sandbox,', 'elle est ouverte et sélectionnée. Un message rappelle la suite : préparer ses créneaux, puis la rendre visible.']] }] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Préparer les horaires : le template', chapeau: 'Un template décrit une semaine type : quelles formules, quels jours, de quelle heure à quelle heure. Il se prépare une fois, puis sert à générer les créneaux.',
      blocs: [
        { etapes: ['Ouvrez **Générateur de créneaux** (menu Administratif).', 'Cliquez sur l’activité, puis sur **+ Nouveau template**.'] },
        { capture: { nom: 'template-vide', faire: `${vers('generateur', `S.gen.act = '${ID}'; S.gen.formules = null; S.gen.tpl = undefined; S.sousO.generateur = 'templates';`)}`,
            zone: [{ css: '.chips', txt: 'Activité' }, BLOC('Templates')], marge: 16,
            marques: [{ cible: '[data-a="genAct"][data-id="' + ID + '"]', n: 1 }, { cible: '[data-a="tplNouv"]', n: 2 }] },
          reperes: [[1, 'L’activité.', 'Le générateur travaille sur une activité à la fois.'], [2, 'Nouveau template.', 'Crée une semaine type à remplir.']] },
        { capture: { nom: 'template', faire: `D.clic('[data-a="tplNouv"]');
              D.saisir('[data-f="tpl.nom"]', 'Semaine type'); D.clic('[data-a="tplPas"][data-p="30"]');
              D.clic('[data-a="tplForm"][data-ri="0"][data-n="Session 1 h"]');
              for (const d of [0, 1, 3, 4]) D.clic('[data-a="tplJour"][data-ri="0"][data-d="' + d + '"]');
              D.saisir('[data-f="tpl.r.0.a"]', '22:30');
              D.clic('[data-a="tplRegle"]');
              for (const d of [0, 1, 2, 3, 4, 5, 6]) D.clic('[data-a="tplJour"][data-ri="1"][data-d="' + d + '"]');
              D.saisir('[data-f="tpl.r.1.de"]', '17:00');`,
            zone: [BLOC('Semaine type'), BLOC('Une semaine type')], marge: 14, hmax: 1400,
            marques: [{ cible: '[data-f="tpl.nom"]', n: 1 }, { cible: { css: '.si', txt: 'Un créneau toutes les' }, n: 2, marge: 0, cote: 'droite' },
              { cible: '[data-a="tplForm"][data-ri="0"]', n: 3 }, { cible: { css: '.tpl-r .chips', i: 1 }, n: 4 },
              { cible: ['[data-f="tpl.r.0.de"]', '[data-f="tpl.r.0.a"]'], n: 5 }, { cible: '[data-a="tplRegle"]', n: 6 },
              { cible: BLOC('Une semaine type'), n: 7, cote: 'droite' }, { cible: '[data-a="tplVersGen"]', n: 8 }] },
          reperes: [[1, 'Nom du template.', 'Ici « Semaine type ».'],
            [2, 'Un créneau toutes les…', 'L’écart entre deux départs (30 min ici) et les canaux qui vendent ces créneaux.'],
            [3, 'Formules', 'proposées par cette règle (bleu = proposée).'],
            [4, 'Jours', 'de la règle : ici mercredi, samedi et dimanche.'],
            [5, 'Premier et dernier créneau.', 'Ici de 14:00 à 22:30.'],
            [6, '+ Règle.', 'Ajoute une ligne. La 2e règle de l’exemple : lundi, mardi, jeudi, vendredi, de 17:00 à 22:30.'],
            [7, 'Aperçu.', 'La semaine obtenue, heure par heure. Vérifiez-la ici.'],
            [8, 'Générer avec ce template', 'passe à l’étape suivante.']] },
        { options: 'Les réglages du template', deux: true, lignes: [
          ['Un créneau toutes les 15 min, 30 min, 1 h, 1 h 30', 'L’écart entre deux heures de départ. Plus il est court, plus le client a d’heures au choix. Une salle reste occupée pendant toute la formule, même si les départs sont rapprochés.'],
          ['Canaux du template', 'Qui peut vendre ces créneaux : site, bornes, comptoir. Exemple : un template « Matinées groupes » en Comptoir seulement, pour ne pas les montrer en ligne.'],
          ['Règles', 'Elles s’additionnent : à chaque heure, le créneau propose les formules de toutes les règles qui la couvrent. Pour fermer un jour, il suffit qu’aucune règle ne le contienne.']] },
        { encadre: ['Horaires de vacances, jours fériés, créneaux après minuit, une formule dans certaines salles seulement, fermer une journée ou une heure, prolonger les créneaux : **Guide - Prix et horaires**.'], titre: 'Pour aller plus loin', genre: 'renvoi' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Générer les créneaux', chapeau: 'Le template donne la semaine type ; la génération la répète sur une période. Sans créneaux générés, l’activité ne se réserve ni sur les bornes ni sur le site.',
      blocs: [
        { capture: { nom: 'generer', faire: `D.clic('[data-a="tplVersGen"]'); D.saisir('[data-f="gen.du"]', ${DATE(0)}); D.saisir('[data-f="gen.au"]', ${DATE(27)}); D.rendre();`,
            zone: [{ css: '.chips', txt: 'Modèle' }, BLOC('Générer depuis un template')], marge: 16,
            marques: [{ cible: '[data-a="genTpl"]', n: 1 }, { cible: [{ sel: '[data-f="gen.du"]', parent: 'label' }, { sel: '[data-f="gen.au"]', parent: 'label' }], n: 2 }, { cible: '[data-a="genererSlots"]', n: 3 }] },
          reperes: [[1, 'Modèle :', 'le template à utiliser.'], [2, 'Du… au…', 'La période à remplir. Ici les 4 prochaines semaines.'],
            [3, 'Générer.', 'Le bouton indique combien de créneaux seront créés. Ils sont en vente aussitôt (si l’activité est visible).']] },
        { capture: { nom: 'lots', taille: [1000, 1000], faire: `D.clic('[data-a="genererSlots"]');`, attente: 700, zone: BLOC('Lots générés'), marge: 16,
            marques: [{ cible: { css: 'section.bloc', txt: 'Lots générés' }, n: 1, marge: 0 }] },
          reperes: [[1, 'Lots générés.', 'Chaque génération forme un lot, qu’on peut supprimer d’un coup en cas d’erreur. Pour prolonger le mois suivant, générez une nouvelle période avec le même template.']] },
        { encadre: ['Regénérer une période déjà générée remplace ses créneaux. Les réservations déjà prises sont gardées.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Vérifier la fiche de l’activité', chapeau: 'Cliquez sur l’activité dans le menu de gauche. Sa fiche réunit tout ce qui sert au quotidien, en onglets.',
      blocs: [
        { capture: { nom: 'fiche-creneaux', taille: [1000, 1000], faire: `ACTIONS.ouvrir({ id: '${ID}', o: 'creneaux' }); D.rendre(); window.scrollTo(0, 0);`, zone: ['.page h1', BLOC('Créneaux et réservations')], marge: 14, hmax: 720,
            marques: [{ cible: '.sous', n: 1 }, { cible: { css: 'section.bloc .chips, section.bloc .jours, section.bloc nav', i: 0 }, n: 2 }, { cible: [B('Templates'), B('Générer d’autres créneaux')], n: 3, cote: 'droite' }] },
          reperes: [[1, 'Les onglets.', 'Créneaux, Tarifs, Capacité, Réglages.'],
            [2, 'Les jours.', 'Choisissez un jour pour voir ses créneaux et ses réservations.'],
            [3, 'Raccourcis', 'vers le template et le générateur.']] },
        { encadre: ['Dans la grille d’un jour, un clic sur une case libre **ferme cette salle à cette heure** (panne, ménage…). Un clic sur « fermée » la rouvre. Les bornes et le site suivent aussitôt.'], titre: 'Fermer une salle ponctuellement' },
        { texte: 'Dans l’onglet **Tarifs**, chaque formule a une ligne **Sur la borne** : c’est ce qui rend la carte de la formule attrayante pour le client.' },
        { capture: { nom: 'fiche-tarifs', taille: [780, 1000], faire: `S.sousO['act-${ID}'] = 'tarifs'; D.rendre(); window.scrollTo(0, 0);
              D.saisir('[data-f="anf.${ID}.0.emoji"]', '🥽'); D.saisir('[data-f="anf.${ID}.0.badge"]', 'Nouveau');
              D.saisir('[data-f="anf.${ID}.0.contenu"]', 'Casque et manettes fournis\\nDès 10 ans\\nJusqu’à 6 joueurs par salle');`,
            zone: [{ sel: '[data-f="anf.act8.0.emoji"]', parent: '.si' }, { sel: '[data-f="anf.act8.0.contenu"]', parent: '.si' }], marge: 14,
            marques: [{ cible: '[data-f="anf.act8.0.emoji"]', n: 1 }, { cible: '[data-f="anf.act8.0.badge"]', n: 2 }, { cible: { sel: '[data-img="anf.act8.0"]', parent: 'label' }, n: 3 },
              { cible: '[data-f="anf.act8.0.contenu"]', n: 4 }] },
          reperes: [[1, 'Icône.', 'Un pictogramme affiché si la formule n’a pas de photo.'],
            [2, 'Badge.', 'Un petit mot animé sur la carte : « Nouveau », « Populaire »…'],
            [3, 'Ajouter une photo', '(à droite de la ligne) : la photo de la carte.'],
            [4, 'Contenu.', 'Une ligne par point fort. Elles s’affichent sur la carte de la formule.']] },
        { texte: 'Dans l’onglet **Capacité**, vous retrouvez les salles : renommer, changer une capacité, ajouter une salle, ou en mettre une **hors service** (la capacité baisse d’autant, sans rien supprimer).' },
        { encadre: ['Le planning, la fiche d’une réservation, décaler ou annuler : **Guide - Le quotidien à l’accueil**.'], titre: 'Pour aller plus loin', genre: 'renvoi' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Ce que voit le client', chapeau: 'Sandbox › Activités du centre › Réalité virtuelle. Le bloc « Module borne » règle les textes de chaque page, avec la borne en aperçu à droite.',
      blocs: [
        { capture: { nom: 'module', faire: `${vers('sandbox', `S.sousO.sandbox = 'activites'; S.act = '${ID}';`)}`, attente: 1500,
            zone: [BLOC('Module borne'), '.mod-ap'], marge: 14, hmax: 1150,
            marques: [{ cible: { css: '.mod-g', txt: 'Pages affichées' }, n: 1 }, { cible: { css: '.mod-g', txt: 'Règles de réservation' }, n: 2 },
              { cible: { css: '.mod-g', txt: 'Apparence' }, n: 3 }, { cible: '.mod-champs', n: 4 }, { cible: '.mod-tel', n: 5, cote: 'droite' }] },
          reperes: [[1, 'Pages affichées.', 'Les pages du parcours, dans l’ordre. Cliquez sur une page pour régler ses textes.'],
            [2, 'Règles de réservation.', 'Délais et paiement, pour les bornes et pour le site.'],
            [3, 'Ambiance.', 'Couleurs, fond, décors de l’activité.'],
            [4, 'Les champs', 'de la page choisie. Un champ vide garde le texte proposé, écrit en gris.'],
            [5, 'L’aperçu', 'montre la vraie borne, mise à jour à chaque frappe.']] },
        { capture: { nom: 'regles', faire: `D.clic('[data-a="modSec"][data-s="reservation"]');`, attente: 800,
            zone: '.mod-champs', marge: 14,
            marques: [{ cible: { sel: '[data-f="mod.act8.reservation.delai"]', parent: 'label' }, n: 1 }, { cible: { sel: '[data-f="mod.act8.reservation.horizon"]', parent: 'label' }, n: 2 },
              { cible: { css: '.mod-c', txt: 'Paiement sur la borne' }, n: 3 }] },
          reperes: [[1, 'Délai minimum.', 'Ex. 2 : impossible de réserver moins de 2 heures avant.'],
            [2, 'Horizon.', 'Jusqu’à combien de jours à l’avance on peut réserver.'],
            [3, 'Paiement.', 'Tout payer, ou un acompte (avec son montant).']] },
        { options: 'Paiement sur la borne', lignes: [
          ['Tout payer', 'Le client paie la réservation entière sur la borne. Dans l’onglet Paiement, « Payer une partie » permet en plus de partager l’addition.', 'Activités courtes, prix connu d’avance.'],
          ['Un acompte', 'Le client paie seulement le montant indiqué (ex. 50 €) ; le reste se règle sur place. La place est gardée dès l’acompte payé.', 'Réservations importantes ou longtemps à l’avance (anniversaires, groupes).']] },
        { options: 'Onglet Site web (juste à côté)', lignes: [
          ['Ordre des pages', '« La formule, puis le jour » : le client choisit d’abord ce qu’il veut. « Le jour, puis la formule » : il choisit d’abord quand il vient, puis ne voit que les formules libres à cette heure.', 'Le jour d’abord quand les clients raisonnent « on vient samedi à 15 h » (bowling).'],
          ['Paiement en ligne : Rien', 'La réservation est enregistrée sans payer ; tout se règle sur place.', 'Le choix par défaut.'],
          ['Paiement en ligne : Un acompte, ou Tout payer', 'Le client paie en ligne une partie ou la totalité. Le montant de l’acompte en ligne se règle juste en dessous.', 'Limiter les absences sur les créneaux très demandés.'],
          ['Délai et horizon du site', 'Comme pour les bornes. Un champ vide reprend la règle des bornes.', 'Pour être plus strict en ligne (ex. pas moins de 2 h avant).']] },
        { encadre: ['Les styles de page, l’ambiance, l’écran de veille et le paiement sur la borne : **Guide - Les bornes**. Le parcours en ligne et les comptes clients : **Guide - Le site et les clients**.'], titre: 'Pour aller plus loin', genre: 'renvoi' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les bornes qui la vendent', chapeau: 'Gestion des bornes › Catalogue des bornes. Une ligne par borne, une colonne par activité.',
      blocs: [
        { capture: { nom: 'catalogue', faire: `${vers('bornes', `S.sousO.bornes = 'catalogue';`)}`,
            zone: BLOC('Qui vend quoi'), marge: 12, hmax: 1000,
            marques: [{ cible: { css: 'th button', txt: 'Réalité virtuelle' }, n: 1 }, { cible: '[data-a="cocher"][data-b="K-01"][data-id="' + ID + '"]', n: 2 },
              { cible: '[data-a="cocher"][data-b="T-01"][data-id="' + ID + '"]', n: 3 }] },
          reperes: [[1, 'La colonne de l’activité.', 'Un clic sur son titre coche ou décoche toute la colonne.'],
            [2, 'Une case cochée :', 'cette borne vend l’activité. À la création, les kiosques du hall et le poste comptoir sont déjà cochés.'],
            [3, 'Une case vide :', 'la borne ne la propose pas (ici les tablettes des pistes).']] },
        { texte: 'Les boutons **Profils** (Tout le centre, Bowling uniquement, Accueil : tous les jeux, Bar uniquement) cochent toute une ligne d’un coup : cliquez d’abord sur le nom de la borne dans la colonne de gauche.' },
        { texte: 'Juste en dessous, **Disposition de l’accueil** règle l’ordre des tuiles, borne par borne et pour le site : choisissez l’écran, puis montez ou descendez l’activité avec les flèches.' },
        { encadre: ['Le parc, le monnayeur, « Finaliser ma commande », le mode hors ligne : **Guide - Les bornes**.'], titre: 'Pour aller plus loin', genre: 'renvoi' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'La tuile d’accueil', chapeau: 'Paramétrage › Paramètres de diffusion › Boutons de l’accueil. C’est la tuile que le client touche sur la borne et le site.',
      blocs: [
        { capture: { nom: 'tuile', faire: `${vers('parametrage', `S.param = 'diffusion';`)}`,
            zone: BLOC('Boutons de l’accueil'), marge: 12,
            marques: [{ cible: { sel: '[data-f="btn.7.lib"]', parent: 'tr' }, marge: 1 }, { cible: { sel: '[data-f="btn.7.lib"]', parent: 'tr' }, n: 1, marge: 1, cote: 'gauche' }] },
          reperes: [[1, 'La ligne de l’activité :', 'photo de la tuile (« Ajouter une photo »), libellé, sous-titre (« À partir de 15 € », calculé seul si vide) et ordre (flèches). « Visible » passe à Oui à l’étape suivante.']] },
        { encadre: ['Une photo au format paysage, nette, sans texte dessus. Sans photo, la tuile affiche l’icône de l’activité.'], titre: 'Conseil photo' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Rendre l’activité visible', chapeau: 'Dernière étape côté CRM : la fiche de l’activité, onglet Réglages, bloc Vente.',
      blocs: [
        { capture: { nom: 'visible', faire: `ACTIONS.ouvrir({ id: '${ID}', o: 'reglages' }); D.rendre(); window.scrollTo(0, 0); D.clic('[data-a="visible"][data-id="${ID}"]');`, attente: 600,
            zone: BLOC('Vente'), marge: 14,
            marques: [{ cible: { css: '.chips', txt: 'Site web' }, n: 1 }, { cible: '[data-a="visible"][data-id="' + ID + '"]', n: 2 }] },
          reperes: [[1, 'Canaux de vente,', 'modifiables à tout moment.'],
            [2, 'Visible sur le site et les bornes.', 'Un clic : l’activité apparaît aussitôt sur les bornes cochées et sur le site, et la mention MASQUÉE disparaît du menu.']] },
        { options: 'Visible ou canaux : quelle différence ?', deux: true, lignes: [
          ['Visible / Masquée', 'L’interrupteur général. Masquée, l’activité disparaît des bornes et du site d’un coup, sans rien supprimer. Pour une fermeture temporaire (travaux, fin de saison) : un clic, puis un clic pour la remettre.'],
          ['Canaux (Site web, Bornes, Comptoir)', 'Où elle se vend quand elle est visible. Retirer « Site web » la garde sur les bornes et au comptoir.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Vérifier sur la borne et le site', chapeau: 'Ouvrez une borne et le site, et faites le parcours comme un client. Allez jusqu’au choix de l’heure, sans payer.',
      blocs: [
        { duo: [
        { capture: { nom: 'borne', page: '/borne/index.html?borne=K-01', taille: [540, 960], faire: `D.clic('.veille'); await new Promise(r => setTimeout(r, 900));`, attente: 900, petite: true,
            marques: [{ cible: { css: '.module', txt: 'Réalité virtuelle' }, n: 1 }] },
          legende: 'L’accueil d’une borne du hall.',
          reperes: [[1, 'La nouvelle tuile', 'avec son libellé et son prix « à partir de ».']] },
          { capture: { nom: 'borne-formules', taille: [540, 960], faire: `D.clic({ css: '.module', txt: 'Réalité virtuelle' }); await new Promise(r => setTimeout(r, 900));`, attente: 900, petite: true,
            marques: [{ cible: { css: '.an-f', txt: 'Session 30 min' }, n: 1 }] },
          legende: 'La page Formule sur la borne.',
          reperes: [[1, 'La carte de la formule', 'avec son icône, son badge et son contenu (chapitre 9).']] }
        ] },
        { capture: { nom: 'site', page: '/resa/index.html', taille: [1440, 900], faire: `await new Promise(r => setTimeout(r, 900));`, attente: 600,
            zone: '.acts', marge: 16, hmax: 760,
            marques: [{ cible: '.act[data-act="act8"]', n: 1 }] },
          legende: 'L’accueil du site de réservation.',
          reperes: [[1, 'La tuile sur le site,', 'avec sa prochaine place libre.']] },
        { encadre: ['Le parcours complet d’une réservation en ligne : **Guide - Le site et les clients**.'], titre: 'Pour aller plus loin', genre: 'renvoi' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Si quelque chose ne va pas', chapeau: 'Les cas les plus courants, et où regarder.',
      blocs: [
        { tableau: [['Ce que vous voyez', 'À vérifier'],
          ['L’activité n’apparaît pas sur une borne', 'Elle est **visible** (Réglages › Vente) ; « Bornes » est actif ; la case de cette borne est cochée (Catalogue des bornes) ; sa tuile est visible (Paramètres de diffusion).'],
          ['Elle n’apparaît pas sur le site', '« Site web » est actif dans Réglages › Vente, et elle est visible.'],
          ['« Plus de créneau libre » ou aucune heure', 'Des créneaux sont **générés** pour cette période (fiche › Créneaux). La formule est bien dans le template. Le **délai minimum** et l’**horizon** (Module borne › Bornes) n’excluent pas ces dates.'],
          ['Une alerte orange « À régler » dans l’onglet Créneaux', 'Elle dit exactement quoi faire : par exemple une formule renommée qui n’est dans aucun créneau. Bouton « Ouvrir le template ».'],
          ['Le prix n’est pas le bon', 'Les règles de la formule (Tarifs) : la plus précise gagne. Pensez aux heures, comprises jusqu’à l’heure de fin.'],
          ['Impossible de réserver pour un grand groupe', 'La capacité de la plus grande salle (Capacité). Un groupe ne se partage pas entre deux salles.'],
          ['La page Salle s’affiche alors qu’on ne veut pas', 'Règles de capacité : repassez en **Automatique** (Sandbox › l’activité).']] },
        { encadre: ['Toutes les modifications sont en direct : pas besoin de « publier ». Après un changement, la borne et le site se mettent à jour d’eux-mêmes.'], titre: 'Pour finir' }
      ] }
  ]
};
