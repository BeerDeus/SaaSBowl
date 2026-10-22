/* Guide « Les types d'activité » : les six fonctionnements, leurs différences, ce que le client voit, comment en changer.
   Les écrans de borne viennent de l'aperçu du CRM (borne/index.html?apercu=<activité>&page=<page>) : un exemple rempli, sans rien commander. */
const CRM = '/maquettes/e-v2.html';
const BORNE = (act, page) => `/borne/index.html?borne=K-01&apercu=${act}&page=${page}`;
const ECRAN = (nom, act, page, legende, reperes) => ({ capture: { nom, page: BORNE(act, page), taille: [540, 960], attente: 900, petite: true }, legende, reperes });

export default {
  titre: 'Les types d’activité',
  surtitre: 'Guide détaillé',
  ordre: 2,
  sousTitre: 'Les **six fonctionnements** d’une activité, ce qui les distingue, ce que le client voit sur la borne et le site, et comment **choisir** ou **changer**.',
  collection: 'Guides du CRM',
  edition: 'Octobre 2026',
  fichier: 'Guide - Les types d’activité.pdf',
  intro: [
    'À la création d’une activité, le CRM demande son **fonctionnement** (voir le Guide général, chapitre 3). Ce choix décide de tout le reste : ce qu’on réserve, comment les places se comptent, ce que la borne et le site demandent au client.',
    'Ce guide prend les activités du centre comme exemples : Bowling, Laser Game, Karaoké, Billard, Anniversaire et Bar.'
  ],
  sections: [

    /* ------------------------------------------------------------------ */
    { titre: 'Les six fonctionnements en un coup d’œil', chapeau: 'Une ligne par fonctionnement. Les chapitres suivants les détaillent un par un.',
      blocs: [
        { tableau: [['Fonctionnement', 'On réserve', 'Le prix', 'Au centre'],
          ['**À la partie**', 'Des parties, sur une ou plusieurs pistes selon le groupe', 'Par joueur et par partie', 'Bowling'],
          ['**À la séance**', 'Une séance à heure fixe, dans une salle par groupe', 'Par joueur', 'Laser Game, Quiz Boxing'],
          ['**À la durée, ressource entière**', 'Une salle entière, pour une durée', 'Pour la salle', 'Karaoké'],
          ['**Accès libre**', 'Une table, à la demande ou à l’avance', 'Par table, à la durée', 'Billard'],
          ['**Formule combinée**', 'Un forfait qui enchaîne d’autres activités', 'Par enfant ou par personne', 'Anniversaire'],
          ['**Vente simple**', 'Rien : on achète des produits', 'Par article', 'Bar']] },
        { encadre: ['Les quatre premiers se ressemblent : ils ont des **ressources** (pistes, salles, tables) et des **créneaux**. Un groupe occupe une ressource pendant toute sa formule. Ce qui change, c’est la façon de compter les places et ce qu’on vend.', 'Les deux derniers ont une structure à part : la formule combinée utilise les ressources d’autres activités, la vente simple n’a ni ressource ni créneau.'], titre: 'Deux familles' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'À la partie : le bowling', chapeau: 'On vend des parties par joueur. Le nombre de pistes se calcule tout seul selon la taille du groupe.',
      blocs: [
        { liste: ['**Ressource :** la piste. Chaque piste accueille un nombre maximum de joueurs (onglet Capacité) ; au-delà, le groupe prend plusieurs pistes **voisines**.',
          '**Durée :** on ne vend pas une durée. Une piste réservée reste occupée environ 11 minutes par partie et par joueur (réglable : Capacité › « Minutes par partie et par joueur »).',
          '**Sur la borne :** joueurs et formule, puis le nom du groupe, les prénoms et les **barrières**, puis le récapitulatif et le paiement (carte, espèces, ou ticket CE scanné). La commande part au bot, qui la tape en caisse ; l’accueil place ensuite le groupe sur Conqueror.',
          '**Sur le site :** le jour et l’heure d’abord, puis les joueurs et la formule ; les prénoms et barrières sont obligatoires. Le client finalise sur une borne en arrivant avec son numéro.'] },
        { duo: [ECRAN('bowling-1', 'bowling', 'bw-formule', 'Borne : joueurs et formule.'), ECRAN('bowling-2', 'bowling', 'bw-joueurs', 'Borne : prénoms et barrières.')] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'À la séance : laser, quiz, réalité virtuelle', chapeau: 'Des séances à heure fixe. Chaque groupe a sa salle pendant toute sa formule ; les autres salles restent réservables.',
      blocs: [
        { liste: ['**Ressource :** la salle. Le groupe reçoit la plus petite salle libre où il tient (Automatique), ou le client la choisit (Au choix du client).',
          '**Places :** elles se comptent en **personnes**. Le planning indique combien de joueurs peuvent encore venir à chaque heure.',
          '**Prix :** par joueur, en général.',
          '**Sur la borne et le site :** formule, nombre de participants, jour et heure, informations (nom du groupe), récapitulatif, paiement.'] },
        { duo: [ECRAN('seance-1', 'laser', 'rs-formule', 'Borne : les formules du Laser Game.'), ECRAN('seance-2', 'laser', 'rs-date', 'Borne : le jour et l’heure.')] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'À la durée, ressource entière : le karaoké', chapeau: 'Le groupe loue la salle entière pour une durée. Une réservation ferme la salle pour tout le monde pendant ce temps.',
      blocs: [
        { liste: ['**Ressource :** la salle, réservée en entier, même si le groupe ne la remplit pas.',
          '**Places :** elles se comptent en **salles libres**, pas en personnes.',
          '**Prix :** pour la salle (« la salle »), quel que soit le nombre de chanteurs.',
          '**Sur la borne et le site :** le même parcours que la séance ; le nombre de personnes sert à vérifier que le groupe tient dans la salle.'] },
        { options: 'Séance ou durée ?', deux: true, lignes: [
          ['À la séance', 'Le client achète des **places** : 4 joueurs × 9 €. On pense « combien de joueurs ? ».'],
          ['À la durée, ressource entière', 'Le client loue une **salle** : 40 € l’heure, à 2 comme à 10. On pense « combien de temps ? ».']] },
        { duo: [ECRAN('duree-1', 'karaoke', 'rs-formule', 'Borne : les durées du Karaoké.'), ECRAN('duree-2', 'karaoke', 'rs-nombre', 'Borne : le nombre de personnes.')] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Accès libre : le billard', chapeau: 'Pas de créneau obligatoire : l’accueil ouvre une table libre à la demande. On peut aussi réserver à l’avance.',
      blocs: [
        { liste: ['**Ressource :** la table. Un grand groupe prend plusieurs tables voisines.',
          '**Prix :** par table, à la durée (1 heure, 2 heures…).',
          '**Sur la borne :** formule, nombre de joueurs, jour et heure, récapitulatif. Pas de page « Informations ».',
          '**Au comptoir :** le front employé ouvre une table libre tout de suite, sans créneau.'] },
        { duo: [ECRAN('libre-1', 'billard', 'rs-formule', 'Borne : les formules du Billard.'), ECRAN('libre-2', 'billard', 'rs-nombre', 'Borne : le nombre de joueurs.')] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Formule combinée : l’anniversaire', chapeau: 'Un forfait qui enchaîne d’autres activités (bowling puis laser, par exemple), avec des options. Il n’a pas de salle à lui.',
      blocs: [
        { liste: ['**Ressources :** celles des activités qu’il enchaîne (pistes, salles du laser). L’anniversaire apparaît dans leurs colonnes du planning.',
          '**Places :** un nombre de fêtes par créneau, fixé dans le générateur de créneaux.',
          '**Prix :** par enfant, avec un **acompte** à la réservation.',
          '**Sur la borne et le site :** l’âge de l’enfant, la formule (cartes ou roue sur le site), le jour et l’heure, les options (gâteau, boissons), l’enfant et les coordonnées du parent, le récapitulatif, l’acompte.'] },
        { duo: [ECRAN('combo-1', 'anniv', 'rs-age', 'Borne : l’âge de l’enfant.'), ECRAN('combo-2', 'anniv', 'rs-formule', 'Borne : les formules anniversaire.')] },
        { encadre: ['Un fonctionnement à part : on ne peut pas transformer une formule combinée en autre chose, ni l’inverse. Le détail des anniversaires a son propre guide.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Vente simple : le bar', chapeau: 'Des produits, sans créneau ni ressource. Les commandes partent vers la caisse du bar.',
      blocs: [
        { liste: ['**Pas de réservation :** le client compose un panier, choisit où être servi, et paie.',
          '**La carte :** catégories, articles, options, photos, ventes additionnelles (Bar › Produits et Bar › Sur les bornes).',
          '**Sur la borne et le téléphone :** la carte, le panier, « Où êtes-vous ? », le paiement. Sur une tablette de piste sans monnayeur, les espèces se paient ensuite au comptoir.'] },
        { duo: [ECRAN('vente-1', 'bar', 'bar', 'Borne : la carte du bar.'), ECRAN('vente-2', 'bar', 'recap', 'Borne : le panier.')] },
        { encadre: ['Le bar a son propre guide : la carte, les options, l’import depuis la caisse Trivec, les ventes additionnelles et le suivi des commandes.'], titre: 'Pour aller plus loin', genre: 'renvoi' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Changer de fonctionnement', chapeau: 'Entre les quatre fonctionnements à ressources (partie, séance, durée, accès libre), on peut changer à tout moment, sans rien supprimer. Sandbox › Activités du centre › l’activité › bloc Fonctionnement.',
      blocs: [
        { capture: { nom: 'changer', page: CRM, faire: `S.ecran = 'sandbox'; S.sousO.sandbox = 'activites'; S.act = 'laser'; S.chgFonct = 'privatif'; D.rendre();
              document.querySelector('[data-a="fonctDemande"]').scrollIntoView(); window.scrollTo(0, 0);`, attente: 900,
            zone: [{ sel: '[data-a="fonctDemande"][data-id="piste"]', parent: '.bloc, section' }, { css: '.si', txt: 'Passer « Laser Game »' }], marge: 14, hmax: 1200,
            marques: [{ cible: '[data-a="fonctDemande"][data-id="seance"]', n: 1 }, { cible: '[data-a="fonctDemande"][data-id="privatif"]', n: 2 },
              { cible: { css: '.si', txt: 'Passer « Laser Game »' }, n: 3, marge: 1 }, { cible: '[data-a="fonctOk"]', n: 4 }] },
          reperes: [[1, 'Le fonctionnement actuel', '(mention « actuel »).'], [2, 'Le nouveau,', 'choisi d’un clic.'],
            [3, 'Ce qui change, ce qui reste :', 'le CRM le dit avant de valider. Les salles, les réservations, les formules et les créneaux restent.'],
            [4, 'Passer en « … »', 'valide. « Annuler » ne change rien.']] },
        { encadre: ['Après un changement, regardez l’**unité** des formules (onglet Tarifs) : en passant de « séance » à « durée », un prix « par joueur » devient souvent un prix « la salle ». Le CRM le signale, mais ne modifie rien tout seul.'], titre: 'À vérifier ensuite', genre: 'attention' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Choisir le bon fonctionnement', chapeau: 'Quatre questions suffisent presque toujours.',
      blocs: [
        { tableau: [['Si vous vous demandez…', 'Alors'],
          ['« Le client achète-t-il des produits, sans horaire ? »', '**Vente simple**'],
          ['« Est-ce un forfait qui enchaîne plusieurs activités existantes ? »', '**Formule combinée**'],
          ['« Vend-on des parties par joueur, sur des pistes qu’on additionne pour les grands groupes ? »', '**À la partie**'],
          ['« Le groupe loue-t-il une salle entière, avec un prix pour la salle ? »', '**À la durée, ressource entière**'],
          ['« Des séances à heure fixe, un prix par joueur, une salle par groupe ? »', '**À la séance**'],
          ['« Pas besoin de réserver : on ouvre une table libre quand le client arrive ? »', '**Accès libre**']] },
        { encadre: ['Hésitation entre séance et durée ? Regardez le prix : « par joueur » → séance, « pour la salle » → durée.'], titre: 'Le réflexe' }
      ] }
  ]
};
