/* Guide « Les bornes » : le parc, ce que vend chaque borne, l'ordre des tuiles, personnaliser un module (textes, styles, ambiance),
   l'écran de veille, le paiement (CashDro, espèces au comptoir), « Finaliser ma commande », le mode hors ligne, le bar sur téléphone. */
const CRM = '/maquettes/e-v2.html';
const B = s => ({ css: 'button', txt: s });
const BLOC = s => ({ css: 'section.bloc', txt: s });
const CARTE = s => ({ css: 'article.borne', txt: s });
const vers = (ecran, sous) => `S.ecran = '${ecran}'; ${sous || ''} D.rendre(); window.scrollTo(0, 0);`;
const BORNE = (act, page) => `/borne/index.html?borne=K-01&apercu=${act}&page=${page}`;
const ECRAN = (nom, page, legende, reperes, taille) => ({ capture: { nom, page, taille: taille || [540, 960], attente: 900, petite: true }, legende, reperes });

export default {
  titre: 'Les bornes',
  surtitre: 'Guide détaillé',
  ordre: 3,
  sousTitre: 'Le **parc**, ce que vend chaque borne, l’**ordre des tuiles**, la **personnalisation** des pages, l’écran de veille, le **paiement** et les cas particuliers (espèces, hors ligne, téléphone).',
  collection: 'Guides du CRM',
  edition: 'Octobre 2026',
  fichier: 'Guide - Les bornes.pdf',
  intro: [
    'Les bornes du hall, les tablettes des pistes et le poste du comptoir utilisent la même application. Tout ce qu’elles affichent se règle dans le CRM, et chaque changement part aussitôt sur les bornes, sans les redémarrer.',
    'Ce qu’il faut regarder est **entouré en orange et numéroté**.'
  ],
  sections: [

    /* ------------------------------------------------------------------ */
    { titre: 'Le parc des bornes', chapeau: 'Gestion des bornes › onglet Parc. Une carte par appareil, rangée par espace (Hall, Pistes, Bar).',
      blocs: [
        { capture: { nom: 'carte', page: CRM, faire: vers('bornes', `S.sousO.bornes = 'parc'; S.parcEdit = false;`), zone: CARTE('Kiosque Hall 1'), marge: 30,
            marques: [{ cible: { sel: '[data-a="cashdro"][data-id="K-01"]', parent: '.l' }, n: 1, marge: 1 }, { cible: { dans: CARTE('Kiosque Hall 1'), css: '.l', txt: 'Vend' }, n: 2, marge: 1 },
              { cible: '[data-a="activerBorne"][data-id="K-01"]', n: 3 }, { cible: { dans: CARTE('Kiosque Hall 1'), css: 'a', txt: 'Ouvrir l’appli' }, n: 4 }, { cible: '[data-a="distance"][data-id="K-01"]', n: 5, cote: 'droite' }] },
          reperes: [[1, 'Espèces (CashDro).', '« Monnayeur » : la borne encaisse les espèces. « Au comptoir » : pas de monnayeur (chapitre 6).'],
            [2, 'Vend :', 'les activités de cette borne (chapitre 2).'],
            [3, 'En service.', 'Désactivée, la borne reste sur l’écran de veille et ne vend plus rien.'],
            [4, 'Ouvrir l’appli :', 'l’application de cette borne dans un onglet, pour vérifier.'],
            [5, 'Redémarrer', 'la borne à distance.']] },
        { texte: 'Le haut de chaque carte indique l’**état** (fonctionnelle, hors ligne depuis combien de temps), le **terminal de paiement**, le **papier** restant dans l’imprimante (en orange sous 15 %). Un point rouge signale un appareil hors ligne.' },
        { capture: { nom: 'flotte', faire: ``, zone: BLOC('Toute la flotte'), marge: 12,
            marques: [{ cible: '[data-f="flotteZone"]', n: 1 }, { cible: [B('Tout allumer'), B('Tout redémarrer'), B('Tout éteindre')], n: 2, cote: 'droite' }] },
          reperes: [[1, 'Appliquer à :', 'tout le parc ou un seul espace (Hall, Pistes, Bar).'], [2, 'Tout allumer, redémarrer, éteindre.', 'Éteindre met les appareils en veille profonde ; on peut les rallumer d’ici. Un appareil hors ligne n’est pas touché.']] },
        { encadre: ['Le bouton **Modifier le parc**, en haut de l’écran, permet de renommer les bornes et les espaces, de déplacer une borne d’un espace à l’autre et de créer un espace (ex. Terrasse).'], titre: 'Renommer, déplacer' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Ce que vend chaque borne', chapeau: 'Gestion des bornes › Catalogue des bornes. Une ligne par borne, une colonne par activité : une case cochée, la borne la vend.',
      blocs: [
        { capture: { nom: 'catalogue', faire: vers('bornes', `S.sousO.bornes = 'catalogue'; S.borne = null;`), zone: BLOC('Qui vend quoi'), marge: 12, hmax: 760,
            marques: [{ cible: { css: '.si', txt: 'Profils' }, n: 1, marge: 1 }, { cible: '[data-a="cocher"][data-b="K-01"][data-id="laser"]', n: 2 },
              { cible: { css: 'th button', txt: 'Finaliser la commande' }, n: 3, cote: 'droite' }] },
          reperes: [[1, 'Profils :', 'cochent toute une ligne d’un coup (cliquez d’abord sur le nom de la borne, à gauche).'],
            [2, 'Une case :', 'un clic coche ou décoche. Le titre d’une colonne coche ou décoche toute la colonne.'],
            [3, 'Finaliser la commande :', 'affiche ou cache cette tuile sur chaque borne (chapitre 7).']] },
        { options: 'Une borne, un seul module ?', deux: true, lignes: [
          ['Plusieurs modules, ou « Finaliser » coché', 'Toucher l’écran de veille ouvre l’accueil, avec une tuile par activité.'],
          ['Un seul module, sans « Finaliser »', 'Toucher l’écran de veille ouvre directement ce module. Exemple : une tablette de piste qui ne vend que le Bar arrive tout de suite sur la carte.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'L’ordre des tuiles', chapeau: 'Gestion des bornes › Catalogue des bornes, bloc Disposition de l’accueil. Chaque borne, et le site, peut avoir son propre ordre.',
      blocs: [
        { capture: { nom: 'disposition', faire: `D.clic('[data-a="dispoEcran"][data-k="K-01"]');`, zone: BLOC('Disposition de l’accueil'), marge: 12,
            marques: [{ cible: ['[data-a="dispoEcran"][data-k="K-01"]', '[data-a="dispoEcran"][data-k="web"]'], n: 1, marge: 3 }, { cible: { css: '[data-a="dispo"][data-d="1"]', i: 0 }, n: 2, cote: 'droite' }] },
          reperes: [[1, 'L’écran :', 'une borne, ou « Site web ».'], [2, 'Les flèches', 'montent ou descendent une activité. « Finaliser ma commande » reste toujours en dernier.']] },
        { encadre: ['Tant qu’un écran n’a pas son ordre, il suit l’ordre commun (Paramétrage › Paramètres de diffusion › Boutons de l’accueil). « Revenir à l’ordre commun » efface l’ordre propre d’un écran.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Personnaliser les pages d’un module', chapeau: 'Sandbox › Activités du centre › l’activité › bloc Module borne. Chaque page du parcours a ses textes, ses options et son style, avec la vraie borne en aperçu à droite.',
      blocs: [
        { capture: { nom: 'module', faire: `${vers('sandbox', `S.sousO.sandbox = 'activites'; S.act = 'bowling';`)} D.clic('[data-a="modSec"][data-act="bowling"][data-s="bw-formule"]');`, attente: 1500,
            zone: [BLOC('Module borne'), '.mod-ap'], marge: 12, hmax: 1300,
            marques: [{ cible: { css: '.mod-g', txt: 'Pages affichées' }, n: 1, marge: 1 }, { cible: '.mod-styles', n: 2, marge: 2 }, { cible: { css: '.mod-c', txt: 'Joueurs proposés au départ', i: 0 }, n: 3, marge: 1 },
              { cible: '[data-a="modRazSec"]', n: 4 }, { cible: '.mod-tel', n: 5, cote: 'droite' }] },
          reperes: [[1, 'Les pages,', 'dans l’ordre du parcours. Un clic ouvre les réglages de la page et la montre dans l’aperçu.'],
            [2, 'Style de la page :', 'Style 1 (d’origine), 2 ou 3 : une autre disposition, d’autres tailles.'],
            [3, 'Les textes et options', 'de la page. Un champ vide garde le texte proposé, écrit en gris.'],
            [4, 'Tout rétablir', 'remet la page comme à l’origine.'],
            [5, 'L’aperçu', 'est la vraie borne : on y fait défiler les pages, sans pouvoir commander.']] },
        { encadre: ['L’ordre des pages est fixe : il dépend du type d’activité. Une page vide (pas de tranche d’âge, pas d’option) est sautée toute seule.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'L’ambiance d’un module', chapeau: 'Même bloc, groupe Apparence › Ambiance : les couleurs et le décor des pages de l’activité, jusqu’au paiement.',
      blocs: [
        { capture: { nom: 'ambiance', faire: `D.clic('[data-a="modSec"][data-act="bowling"][data-s="theme"]');`, attente: 1200,
            zone: [BLOC('Module borne'), '.mod-ap'], marge: 12, hmax: 1100,
            marques: [{ cible: { css: '.mod-c', txt: 'Couleur du module' }, n: 1, marge: 1 }, { cible: { css: '.mod-c', txt: 'Fond des pages' }, n: 2, marge: 1 },
              { cible: { css: '.mod-c', txt: 'Décors animés' }, n: 3, marge: 1 }, { cible: { css: '.mod-c', txt: 'Animations' }, n: 4, marge: 1 }] },
          reperes: [[1, 'Couleur du module :', 'liseré de l’en-tête, choix sélectionnés, récapitulatif.'], [2, 'Fond des pages :', 'crème, dégradé de la couleur, ou une photo (éclaircie pour rester lisible).'],
            [3, 'Décors animés :', 'les petits éléments qui bougent en fond.'], [4, 'Animations réduites,', 'pour les bornes peu puissantes.']] },
        { encadre: ['Les modules de réservation ont aussi un style **Festif** (ballons, couleurs vives) : c’est celui des anniversaires.'], titre: 'Bon à savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'L’accueil et l’écran de veille', chapeau: 'Paramétrage › Paramètres de diffusion. Ce que toutes les bornes affichent en commun.',
      blocs: [
        { capture: { nom: 'diffusion', faire: vers('parametrage', `S.param = 'diffusion';`), zone: [BLOC('Boutons de l’accueil'), BLOC('Logo du centre')], marge: 12, hmax: 1400,
            marques: [{ cible: { css: 'tr', txt: 'Bowling', i: 0 }, n: 1, marge: 1 }, { cible: BLOC('Écran de veille'), n: 2 }, { cible: '[data-f="diff.bandeau"]', n: 3 }, { cible: { sel: '[data-f="diff.retourAccueil"]', parent: 'label' }, n: 4 }, { cible: BLOC('Logo du centre'), n: 5, cote: 'droite' }] },
          reperes: [[1, 'Les boutons de l’accueil :', 'photo, libellé, sous-titre, ordre et visibilité de chaque tuile.'],
            [2, 'L’écran de veille :', 'ce qui passe quand personne ne touche la borne (détails juste après).'],
            [3, 'Bandeau d’information,', 'en haut de l’accueil (une promotion, une information du jour).'],
            [4, 'Veille après…', 'secondes sans toucher : la borne revient à l’accueil, puis à la veille.'],
            [5, 'Logo du centre :', '« Changer le logo » le remplace sur les bornes, le site de réservation et le CRM. « Remettre le logo d’origine » annule.']] },
        { texte: 'L’écran de veille commence toujours par **l’animation du centre** : le logo, les messages des activités, et une boule qui fait un strike. Les vidéos et images ajoutées passent ensuite, une par une, puis l’animation revient.' },
        { capture: { nom: 'veille', faire: vers('parametrage', `S.param = 'diffusion'; DIFFUSION.veille = [{ id: 'guide', type: 'video', nom: 'Présentation des anniversaires', src: 'borne/videos/anniversaires.mp4', duree: 0, sauf: ['K-02'] }];`), zone: BLOC('Défilement quand personne'), marge: 12, taille: [1000, 1000],
            marques: [{ cible: { css: '.veille-l', txt: 'Animation du centre' }, n: 1, marge: 2 }, { cible: { sel: '[data-f="veille.0.src"]', parent: '.veille-l' }, n: 2, marge: 2 }, { cible: { css: '.si', txt: 'Par adresse' }, n: 3, marge: 2 }] },
          reperes: [[1, 'L’animation du centre :', 'toujours en premier, sur toutes les bornes. Sa durée se règle à droite (20 s par défaut).'],
            [2, 'Une vidéo ajoutée :', 'son nom, son fichier, sa durée (0 = jusqu’au bout de la vidéo ; une image reste 8 s), les flèches pour la monter ou la descendre, la croix pour la retirer.'],
            [3, 'Ajouter :', '« Vidéo » ou « Image » prend un fichier sur le PC. « Par adresse » sert pour un fichier déjà sur le site, par exemple borne/videos/anniversaires.mp4.']] },
        { capture: { nom: 'veille-bornes', faire: vers('parametrage', `S.param = 'diffusion'; DIFFUSION.veille = [{ id: 'guide', type: 'video', nom: 'Présentation des anniversaires', src: 'borne/videos/anniversaires.mp4', duree: 0, sauf: ['K-02'] }];`), zone: BLOC('Quelle diapositive passe'), marge: 12, hmax: 420, taille: [760, 1000],
            marques: [{ cible: { css: 'th button', txt: 'Présentation' }, n: 1, cote: 'droite' }, { cible: '[data-a="veilleCase"][data-b="K-02"]', n: 2, cote: 'droite' }] },
          legende: 'Écran de veille par borne : une ligne par borne, une colonne par vidéo ou image.',
          reperes: [[1, 'Le titre d’une colonne', 'coche ou décoche cette vidéo sur toutes les bornes d’un coup.'],
            [2, 'Une case décochée :', 'cette borne ne la montre pas (ici le Kiosque Hall 2). Une borne ajoutée plus tard reçoit toutes les vidéos.']] },
        { encadre: ['Les vidéos se préparent en **portrait 1080 × 1920** (MP4). Le bas de l’écran est couvert par le bouton « Touchez l’écran pour commencer » : rien d’important à cet endroit.', 'Une vidéo prise sur le PC reste dans le navigateur où elle a été ajoutée. Pour toutes les bornes du centre, déposez-la sur le site (dossier borne/videos) et ajoutez-la « Par adresse ».'], titre: 'Bon à savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Le paiement sur la borne', chapeau: 'Carte bancaire sur le terminal, espèces sur le monnayeur (CashDro) quand la borne en a un, ticket CE ou code promo scanné. Le paiement est simulé tant que le matériel n’est pas branché.',
      blocs: [
        { options: 'Payer une partie (module › onglet Paiement)', deux: true, lignes: [
          ['Cochée (par défaut)', 'Le client choisit « Tout payer » ou « Payer une partie » (chacun ses articles, chacun ses joueurs).'],
          ['Décochée', 'La page de paiement propose tout de suite carte ou espèces, pour tout le montant.']] },
        { options: 'Espèces (CashDro), sur la carte de la borne', deux: true, lignes: [
          ['Monnayeur', 'Les espèces se paient sur la borne : billets et pièces, monnaie rendue.'],
          ['Au comptoir', 'Pas de monnayeur (les tablettes des pistes). Pour le bar, « Espèces » reste proposé : la commande est mise de côté et la borne affiche son numéro. Le client la paie ensuite sur une grande borne, sinon elle est annulée au bout de 10 minutes.']] },
        { duo: [ECRAN('comptoir', BORNE('bar', 'comptoir'), 'Tablette de piste : espèces au comptoir.'), ECRAN('finaliser', BORNE('bar', 'finaliser'), 'Grande borne : « Finaliser ma commande ».')] },
        { texte: '**Ticket CE ou code promo** : une troisième tuile au moment de payer. Le client scanne un ou plusieurs tickets ; le reste se paie par carte ou en espèces. Chaque ticket n’est accepté que pour l’activité de son lot. Détails : **Guide - Tickets CE et QR codes**.' },
        { encadre: ['Les textes de l’écran « Espèces au comptoir » et le délai (10 minutes par défaut) se règlent dans Sandbox › Bar › onglets **Fin** et **Espèces au comptoir**. Dans le CRM, ces commandes apparaissent « Attente espèces » (Bar › Commandes).'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: '« Finaliser ma commande »', chapeau: 'La tuile qui permet de payer plus tard, sur n’importe quelle borne, avec un numéro.',
      blocs: [
        { options: 'Les numéros acceptés', deux: true, lignes: [
          ['Une commande « espèces au comptoir »', 'Le numéro affiché par une tablette sans monnayeur. Refusé après le délai (« Délai dépassé »).'],
          ['Une commande passée sans réseau', 'Numéro de secours de la borne (commence par 9). Voir chapitre 8.'],
          ['Une réservation bowling du jour', 'Faite sur le site ou au comptoir, pas encore soldée : la borne reprend le groupe, les prénoms et les barrières, déduit ce qui est déjà payé, encaisse le reste et envoie la partie au bot.']] },
        { encadre: ['Les autres réservations (laser, karaoké, anniversaire…) se règlent à l’accueil : la borne le dit au client.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Sans réseau', chapeau: 'Si une borne perd le réseau, elle continue : la carte et les photos sont déjà en mémoire.',
      blocs: [
        { etapes: ['Un bandeau prévient le client : « Pas de réseau · commandez quand même ».', 'La commande reçoit un **numéro de secours** de la borne. Le client le note.', 'Au retour du réseau, la commande arrive dans le CRM, état **« À finaliser »**.', 'Le client la paie sur n’importe quelle borne, avec « Finaliser ma commande ».'] },
        { encadre: ['Rien n’est perdu : l’envoi au CRM se fait dans l’ordre, et une commande déjà reçue n’est jamais enregistrée deux fois. Les codes promo et tickets CE, eux, ne peuvent pas être vérifiés sans réseau.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Le bar sur téléphone', chapeau: 'Pour les clients des pistes qui préfèrent leur téléphone : un QR code (ou une puce NFC) sur chaque piste ouvre la carte du bar.',
      blocs: [
        { duo: [ECRAN('tel-carte', '/bar/index.html?piste=7', 'La carte, piste 7 déjà indiquée.', null, [390, 844]), ECRAN('tel-comptoir', BORNE('bar', 'merci'), 'La fin d’une commande.')] },
        { liste: ['**L’adresse :** l’adresse du site, suivie de `/bar/?piste=7` (le numéro de la piste). Un QR code par piste, fait avec n’importe quel générateur de QR codes.',
          '**Le parcours :** le même que le module Bar des bornes, mêmes réglages. La piste est déjà choisie à l’étape « Où êtes-vous ? ».',
          '**Le paiement :** carte bancaire en ligne (simulée pour l’instant), ou espèces à payer sur une grande borne.',
          '**Dans le CRM :** ces commandes viennent de « Téléphone ».'] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Si quelque chose ne va pas', chapeau: 'Les cas les plus courants, et où regarder.',
      blocs: [
        { tableau: [['Ce que vous voyez', 'À vérifier'],
          ['Une activité n’apparaît pas sur une borne', 'Sa case dans le Catalogue ; l’activité est visible et vendue sur « Bornes » ; sa tuile est visible (Paramètres de diffusion).'],
          ['La borne reste sur l’écran de veille', 'Elle est « En service » (carte du Parc).'],
          ['Pas de bouton Espèces sur une tablette', 'Normal hors bar : sans monnayeur, seul le bar propose les espèces (à payer au comptoir).'],
          ['Un client ne retrouve pas sa commande', 'Le numéro (6 chiffres), le délai de 10 minutes pour les espèces, ou une réservation qui n’est pas du bowling (à régler à l’accueil).'],
          ['Une borne affiche « hors ligne » dans le Parc', 'Son réseau. Elle continue de vendre ; ses commandes arriveront au retour du réseau.'],
          ['Un texte ne change pas sur la borne', 'Le bon module et la bonne page dans la Sandbox ; un champ vide garde le texte d’origine.']] }
      ] }
  ]
};
