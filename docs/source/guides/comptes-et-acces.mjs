/* Guide « Comptes et accès » : les comptes de l'équipe, les rôles, les droits par rôle, « voir le CRM en tant que », les bonnes pratiques. */
const CRM = '/maquettes/e-v2.html';
const B = s => ({ css: 'button', txt: s });
const BLOC = s => ({ css: 'section.bloc', txt: s });

export default {
  titre: 'Comptes et accès',
  surtitre: 'Guide détaillé',
  ordre: 9,
  sousTitre: 'Les **comptes** de l’équipe, leurs **rôles**, les **droits** de chaque rôle, et comment vérifier ce que voit un poste.',
  collection: 'Guides du CRM',
  edition: 'Octobre 2026',
  fichier: 'Guide - Comptes et accès.pdf',
  intro: [
    'Chaque personne ou chaque poste a un compte. Un compte a un **rôle**, et un rôle est une liste de **droits**. Exemple : le poste de l’accueil voit le planning et encaisse, mais pas le chiffre d’affaires.',
    'Ce qu’il faut regarder est **entouré en orange et numéroté**. Menu Administratif › Comptes et accès (réservé à l’administrateur).'
  ],
  sections: [

    /* ------------------------------------------------------------------ */
    { titre: 'Les comptes', chapeau: 'Une ligne par compte : une personne, ou un poste partagé (accueil, bar).',
      blocs: [
        { capture: { nom: 'comptes', taille: [1000, 1000], page: CRM, faire: `S.ecran = 'comptes'; D.rendre(); window.scrollTo(0, 0);`, attente: 600, zone: [BLOC('Comptes'), BLOC('Bonnes pratiques')], marge: 12, hmax: 560,
            marques: [{ cible: { css: 'tr', txt: 'Ordi accueil' }, n: 1, marge: 1 }, { cible: '[data-f="compte.2"]', n: 2 }, { cible: '[data-a="compteActif"][data-i="2"]', n: 3 },
              { cible: { css: 'tr', txt: 'Ordi accueil' }, marge: 1 }, { cible: B('Nouveau compte'), n: 4, cote: 'droite' }] },
          reperes: [[1, 'Un compte :', 'nom, identifiant de connexion, rôle, dernière connexion.'], [2, 'Le rôle', 'décide de ce que le compte peut voir et faire (chapitre 2).'],
            [3, 'Actif :', 'désactivé, le compte ne peut plus se connecter (un prestataire dont la mission est finie).'], [4, 'Nouveau compte.', 'Au bout de chaque ligne, « Mot de passe » envoie au collègue un lien pour en choisir un nouveau.']] },
        { encadre: ['Un poste partagé (accueil, bar) a son propre compte, sans droit sur l’argent ni les tarifs. Un prestataire reçoit un accès temporaire, qui expire tout seul. Chaque action sensible est notée : qui, quand, depuis quel poste.'], titre: 'Bonnes pratiques' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les rôles et leurs droits', chapeau: 'Le tableau Droits par rôle : une ligne par droit, une colonne par rôle. Un clic sur une case donne ou retire le droit.',
      blocs: [
        { capture: { nom: 'droits', taille: [1000, 1000], faire: `window.scrollTo(0, 0);`, zone: BLOC('Droits par rôle'), marge: 12, hmax: 900,
            marques: [{ cible: { css: 'th', txt: 'Accueil' }, n: 1 }, { cible: '[data-a="droit"][data-r="Accueil"][data-id="planning"]', n: 2 }, { cible: '[data-a="droit"][data-r="Accueil"][data-id="voir_ca"]', n: 3 }] },
          reperes: [[1, 'Un rôle', '(colonne).'], [2, 'Une case cochée :', 'le rôle a ce droit. Ici, l’accueil voit le planning.'], [3, 'Une case vide :', 'il ne l’a pas. Ici, l’accueil ne voit pas le chiffre d’affaires.']] },
        { tableau: [['Rôle', 'Pour qui', 'En résumé'],
          ['**Admin**', 'Le gérant', 'Tout, y compris les comptes et le paramétrage technique.'],
          ['**Manager**', 'Les responsables', 'Tout le quotidien et les réglages (tarifs, créneaux, bar, tickets CE, clients), sauf créer des activités et gérer les comptes.'],
          ['**Accueil**', 'Le poste du comptoir', 'Planning, encaissement, bornes, voir les clients. Pas de chiffre d’affaires ni de tarifs.'],
          ['**Bar**', 'Le poste du bar', 'Le bar seulement (produits, commandes).'],
          ['**Technicien**', 'Un prestataire', 'Les bornes et le paramétrage technique.'],
          ['**Lecture seule**', 'Le cabinet comptable', 'Voir le chiffre d’affaires et le planning, sans rien modifier.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les droits, un par un', chapeau: 'Ce que débloque chaque ligne du tableau.',
      blocs: [
        { options: 'Les droits', deux: true, lignes: [
          ['Voir le chiffre d’affaires et les statistiques', 'Les montants du tableau de bord, l’écran Statistiques, les totaux des bornes.'],
          ['Voir le planning et pointer les arrivées', 'Le planning, les fiches de réservation, décaler une réservation.'],
          ['Encaisser et rembourser', 'Encaisser un reste dû, un acompte, au comptoir.'],
          ['Gérer le bar', 'Produits, catégories, commandes du bar.'],
          ['Gérer les bornes', 'Redémarrer, mettre en pause, le catalogue des bornes.'],
          ['Modifier formules, tarifs et créneaux', 'Le générateur de créneaux et les prix.'],
          ['Activités : onglets Tarifs, Capacité, Réglages', 'Les onglets correspondants de la fiche d’une activité.'],
          ['Créer ou modifier des activités (sandbox)', 'La Sandbox : nouvelle activité, fonctionnement, modules des bornes.'],
          ['Créer des lots de tickets CE / QR', 'L’onglet Créer un lot.'],
          ['Voir / modifier les comptes clients du site', 'L’écran Clients ; modifier coordonnées et mot de passe, supprimer.'],
          ['Gérer les comptes et les droits', 'Cet écran.'],
          ['Paramétrage technique', 'API, terminaux de paiement, intégrations (Trivec, Conqueror).']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Voir le CRM en tant que…', chapeau: 'En haut à droite du CRM, le sélecteur de rôle montre le CRM tel qu’un rôle le voit : pratique pour vérifier un réglage de droits.',
      blocs: [
        { duo: [
          { capture: { nom: 'role', faire: `S.role = 'Accueil'; S.ecran = 'tdb'; D.rendre(); window.scrollTo(0, 0);`, attente: 700, zone: '[data-f="role"]', marge: 40,
              marques: [{ cible: '[data-f="role"]', n: 1 }] },
            reperes: [[1, 'Le rôle affiché :', 'ici Accueil. Choisissez un rôle dans la liste.']] },
          { capture: { nom: 'menu-accueil', faire: ``, zone: '.arbre', marge: 0, hmax: 900, petite: true,
              marques: [{ cible: '.arbre', n: 2, marge: -4 }] },
            reperes: [[2, 'Le menu', 'n’a plus que les écrans permis à ce rôle : ni Statistiques, ni Sandbox, ni chiffre d’affaires.']] }] },
        { encadre: ['Revenez sur « Admin » après la vérification.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Si quelque chose ne va pas', chapeau: 'Les cas les plus courants, et où regarder.',
      blocs: [
        { tableau: [['Ce que vous voyez', 'À vérifier'],
          ['Un écran manque dans le menu', 'Le rôle du compte et ses droits (tableau Droits par rôle).'],
          ['Un collègue ne peut pas se connecter', 'Son compte est actif ; envoyez-lui un nouveau mot de passe.'],
          ['Le poste de l’accueil voit le chiffre d’affaires', 'Décochez « Voir le chiffre d’affaires » pour le rôle Accueil.'],
          ['Un prestataire a toujours accès', 'Désactivez son compte.']] }
      ] }
  ]
};
