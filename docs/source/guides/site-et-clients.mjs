/* Guide « Le site de réservation et les clients » : ce que le site propose, le parcours d'une réservation (laser, de bout en bout),
   le compte et « Mon espace », les règles du site dans le CRM, l'établissement (pages légales, horaires), l'écran Clients du CRM.
   Le parcours est joué sur le vrai site : formule, participants, jour et heure, création du compte, récapitulatif, réservation. */
const CRM = '/maquettes/e-v2.html';
const SITE = '/resa/index.html';
const B = s => ({ css: 'button', txt: s });
const BLOC = s => ({ css: 'section.bloc', txt: s });
const T = [1440, 900];
const pause = ms => `await new Promise(r => setTimeout(r, ${ms}));`;

export default {
  titre: 'Le site de réservation et les clients',
  surtitre: 'Guide détaillé',
  ordre: 6,
  sousTitre: 'Ce que le **site** propose, le **parcours** d’une réservation, le **compte client** et « Mon espace », les **règles** du site, les **pages légales**, et la gestion des **clients** dans le CRM.',
  collection: 'Guides du CRM',
  edition: 'Octobre 2026',
  fichier: 'Guide - Le site et les clients.pdf',
  intro: [
    'Le site de réservation est branché sur le même moteur que les bornes et le CRM : mêmes activités, mêmes prix, mêmes créneaux. Une place prise en ligne disparaît aussitôt des bornes et du comptoir, et inversement.',
    'Ce guide suit une réservation de Laser Game faite sur le site, puis la retrouve dans le CRM. Ce qu’il faut regarder est **entouré en orange et numéroté**.'
  ],
  sections: [

    /* ------------------------------------------------------------------ */
    { titre: 'Ce que le site propose', chapeau: 'L’accueil du site montre les activités réservables en ligne, avec leur prochaine place libre.',
      blocs: [
        { capture: { nom: 'accueil', page: SITE, taille: T, faire: pause(900), attente: 600,
            marques: [{ cible: { css: '.act', i: 0 }, n: 1 }, { cible: { css: 'button, a', txt: 'Mon espace' }, n: 2, cote: 'droite' }] },
          reperes: [[1, 'Une activité', 'avec son prix « à partir de » et sa prochaine place libre. Un clic lance la réservation.'], [2, 'Mon espace :', 'le compte du client (chapitre 4).']] },
        { options: 'Ce qui décide qu’une activité est sur le site', deux: true, lignes: [
          ['« Site web » actif', 'Dans la fiche de l’activité › Réglages › Vente (ou dans la Sandbox).'],
          ['Visible', 'Le même interrupteur que pour les bornes : masquée, elle disparaît partout.'],
          ['Des créneaux à venir', 'Sans créneau généré, la tuile s’affiche mais aucune heure n’est proposée.'],
          ['L’ordre des tuiles', 'Gestion des bornes › Catalogue › Disposition de l’accueil › écran « Site web ».']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Le parcours d’une réservation', chapeau: 'Les mêmes pages que sur la borne, dans le même ordre. Le récapitulatif reste affiché à droite, et se met à jour à chaque choix.',
      blocs: [
        { capture: { nom: 'date', page: SITE + '#/laser/rs-formule', taille: T, faire: `${pause(900)} D.clic('[data-a="formule"]'); ${pause(700)} D.clic('[data-a="suivant"][data-e="rs-nombre"]'); ${pause(900)}
              D.clic('.an-j.dispo'); ${pause(400)} D.clic('.an-h'); ${pause(400)}`, attente: 600,
            marques: [{ cible: '.piste', n: 1 }, { cible: '.an-j.on', n: 2 }, { cible: '.an-h.on', n: 3 }, { cible: '.panneau', n: 4, cote: 'droite' }] },
          reperes: [[1, 'Les étapes', 'du parcours : on voit où on en est.'], [2, 'Le jour :', 'les jours en couleur ont encore de la place.'],
            [3, 'L’heure,', 'avec son prix. « Dernière place » quand il n’en reste qu’une.'], [4, 'Le récapitulatif', 'de la réservation, mis à jour à chaque choix.']] },
        { encadre: ['Les règles du centre s’appliquent : pas d’heure trop proche (délai minimum), pas de date trop lointaine (horizon), pas plus de joueurs que la plus grande salle. Elles se règlent dans la Sandbox (chapitre 6).'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Le compte client', chapeau: 'Pour réserver, le client crée un compte (ou s’y connecte) à la page Informations. Une fois connecté, il n’a plus rien à retaper.',
      blocs: [
        { capture: { nom: 'compte', faire: `D.clic('[data-a="suivant"][data-e="rs-date"]'); ${pause(900)}`, attente: 600,
            marques: [{ cible: { css: '.onglets' }, n: 1 }, { cible: '[data-form="creer"]', n: 2 }] },
          reperes: [[1, 'Créer mon compte / J’ai déjà un compte.', ''], [2, 'Nom, téléphone, e-mail, mot de passe.', 'Le téléphone et l’e-mail servent à prévenir le client et à retrouver sa réservation.']] },
        { encadre: ['Le compte est **obligatoire** pour réserver en ligne : historique des réservations, coordonnées toujours à jour, et un moyen de joindre le client.', 'Mot de passe oublié : le client appelle l’accueil, qui lui en donne un nouveau depuis le CRM (chapitre 8). L’envoi d’e-mails viendra avec le serveur.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Récapitulatif, paiement, confirmation', chapeau: 'Le client relit, accepte les conditions de vente, et réserve.',
      blocs: [
        { capture: { nom: 'recap', faire: `const f = document.querySelector('[data-form="creer"]'); f.nom.value = 'Julie Martin'; f.tel.value = '06 12 34 56 78'; f.email.value = 'julie.martin@exemple.fr'; f.mdp.value = 'laser2026'; f.requestSubmit(); ${pause(900)}
              const g = document.querySelector('[data-f="groupe"]'); if (g) { g.value = 'Les Invincibles'; g.dispatchEvent(new Event('input', { bubbles: true })); }
              D.clic('[data-a="suivant"][data-e="rs-infos"]'); ${pause(900)} const c = document.querySelector('[data-f="cgv"]'); if (c && !c.checked) c.click(); ${pause(300)}`, attente: 600,
            marques: [{ cible: { css: '.carte-blanche', i: 0 }, n: 1 }, { cible: { sel: '[data-f="cgv"]', parent: 'label' }, n: 2 }, { cible: '[data-a="suivant"][data-e="rs-recap"]', n: 3 }] },
          reperes: [[1, 'Le récapitulatif :', 'activité, jour, heure, formule, participants, prix.'], [2, 'Les conditions de vente', 'à accepter (lien vers la page CGV).'],
            [3, 'Réserver.', 'Selon les règles de l’activité : sans paiement, avec un acompte ou le total en ligne.']] },
        { options: 'Le paiement en ligne (par activité)', deux: true, lignes: [
          ['Rien en ligne', 'La réservation est confirmée tout de suite ; tout se règle sur place. Le choix par défaut.'],
          ['Un acompte', 'Le client paie l’acompte en ligne ; la place est gardée pendant le paiement. Le reste se règle sur place.'],
          ['Tout payer', 'Le client paie la totalité en ligne.']] },
        { capture: { nom: 'merci', faire: `D.clic('[data-a="suivant"][data-e="rs-recap"]'); ${pause(1200)}`, attente: 900 },
          legende: 'La confirmation : numéro de réservation et ce qu’il faut faire en arrivant.' },
        { encadre: ['Le paiement en ligne est **simulé** tant que le prestataire n’est pas choisi : un écran « Mode test » permet d’accepter ou de refuser le paiement.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: '« Mon espace » côté client', chapeau: 'En haut à droite du site. Le client y retrouve ses réservations et ses coordonnées.',
      blocs: [
        { capture: { nom: 'espace', page: SITE + '#/espace', taille: T, faire: pause(1000), attente: 600,
            marques: [{ cible: { css: 'article, .resa, li', txt: 'Laser' }, n: 1 }, { cible: { css: 'button, a', txt: 'Annuler' }, n: 2 }, { cible: { css: 'form', txt: 'Enregistrer' }, n: 3 }] },
          reperes: [[1, 'Ses réservations,', 'à venir et passées, avec leur numéro.'], [2, 'Annuler :', 'prépare un e-mail au centre (les annulations se traitent par e-mail).'], [3, 'Ses coordonnées', 'et son mot de passe, modifiables.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les règles du site', chapeau: 'Sandbox › Activités du centre › l’activité › Module borne › onglet Site web. Chaque activité a ses règles en ligne ; un champ vide reprend la règle des bornes.',
      blocs: [
        { capture: { nom: 'regles', page: CRM, faire: `S.ecran = 'sandbox'; S.sousO.sandbox = 'activites'; S.act = 'laser'; D.rendre(); D.clic('[data-a="modSec"][data-act="laser"][data-s="web"]');`, attente: 1200,
            zone: '.mod-champs', marge: 12,
            marques: [{ cible: { css: '.mod-c', txt: 'Ordre des pages sur le site' }, n: 1, marge: 2 }, { cible: { css: '.mod-c', txt: 'Paiement sur le site' }, n: 2, marge: 2 },
              { cible: { css: '.mod-c', txt: 'Impossible de réserver en ligne' }, n: 3, marge: 2 }, { cible: { css: '.mod-c', txt: 'Réservable en ligne jusqu’à' }, n: 4, marge: 2 }] },
          reperes: [[1, 'Ordre des pages :', 'la formule d’abord, ou le jour d’abord (le client ne voit alors que les formules libres à l’heure choisie).'], [2, 'Paiement en ligne :', 'rien, un acompte (avec son montant) ou le total.'],
            [3, 'Délai minimum', 'avant le créneau.'], [4, 'Horizon :', 'jusqu’à combien de jours à l’avance.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les informations du centre et les pages légales', chapeau: 'Paramétrage › Établissement. Ces informations remplissent les pages du site : Infos pratiques, CGV, Mentions légales, Confidentialité, et l’horaire du jour en bas de page.',
      blocs: [
        { capture: { nom: 'etablissement', faire: `S.ecran = 'parametrage'; S.param = 'etablissement'; D.rendre(); window.scrollTo(0, 0);`, attente: 600,
            zone: BLOC('Établissement'), marge: 12, hmax: 1200,
            marques: [{ cible: { sel: '[data-f="etab.email"]', parent: 'label' }, n: 1 }, { cible: { sel: '[data-f="etab.siret"]', parent: 'label' }, n: 2 }, { cible: { css: 'table', i: 0 }, n: 3 }] },
          reperes: [[1, 'E-mail du centre :', 'celui du bouton « Annuler » de Mon espace.'], [2, 'Les mentions obligatoires', '(raison sociale, SIRET, médiateur, hébergeur…) des pages légales.'],
            [3, 'Les horaires d’ouverture,', 'en période scolaire et en vacances (format 17:00-01:00). Le site affiche l’horaire du jour.']] },
        { encadre: ['Les pages légales sont des **modèles** : faites-les relire avant la mise en ligne. Là où une information manque, le site affiche « [à compléter] ».'], titre: 'Attention', genre: 'attention' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les clients dans le CRM', chapeau: 'Menu Centre › Clients. Tous les comptes créés sur le site, avec leurs réservations.',
      blocs: [
        { capture: { nom: 'clients', faire: `S.ecran = 'clients'; S.client = null; window.__sbxCRM.charger(['clients']); D.rendre(); window.scrollTo(0, 0);`, attente: 600,
            zone: '.page', marge: 0, hmax: 520,
            marques: [{ cible: { css: '.rech', i: 0 }, n: 1 }, { cible: { css: 'tr.clic', i: 0 }, n: 2, marge: 1 }] },
          reperes: [[1, 'Rechercher', 'par nom, e-mail ou téléphone.'], [2, 'Un client :', 'un clic ouvre sa fiche.']] },
        { capture: { nom: 'fiche-client', faire: `D.clic({ css: 'tr.clic', i: 0 });`, attente: 600, zone: '.tiroir', marge: 0, hmax: 1000,
            marques: [{ cible: { sel: '[data-f="cli.mdp"]', parent: 'label' }, n: 1 }, { cible: '[data-a="cliActif"]', n: 2, cote: 'droite' }, { cible: { css: '.tiroir .lig', i: 0 }, n: 3 }] },
          reperes: [[1, 'Le mot de passe,', 'visible et modifiable : pour dépanner un client qui l’a oublié. Puis « Enregistrer ».'],
            [2, 'Compte actif / désactivé :', 'un compte désactivé ne peut plus se connecter (ses réservations restent).'], [3, 'Ses réservations :', 'un clic ouvre la fiche de la réservation.']] },
        { options: 'Qui peut faire quoi (Comptes et accès)', deux: true, lignes: [
          ['Voir les comptes clients', 'Ouvrir la liste et les fiches, sans rien modifier.'],
          ['Modifier les comptes clients', 'Changer coordonnées et mot de passe, désactiver, supprimer un compte.']] },
        { encadre: ['Version de démonstration : le mot de passe est enregistré en clair pour pouvoir dépanner les clients. La vraie connexion sécurisée (mot de passe protégé, e-mail « mot de passe oublié ») viendra avec le serveur.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Si quelque chose ne va pas', chapeau: 'Les cas les plus courants, et où regarder.',
      blocs: [
        { tableau: [['Ce que vous voyez', 'À vérifier'],
          ['Une activité n’est pas sur le site', '« Site web » actif et activité visible (Réglages › Vente).'],
          ['Aucune heure proposée en ligne', 'Des créneaux générés ; le délai et l’horizon de l’onglet Site web ; le créneau n’est pas fermé pour le site seulement.'],
          ['Un client ne peut pas se connecter', 'Son compte est actif (Clients › sa fiche) ; donnez-lui un nouveau mot de passe.'],
          ['« Un compte existe déjà avec cette adresse »', 'Le client a déjà un compte : onglet « J’ai déjà un compte ».'],
          ['Une page légale affiche « [à compléter] »', 'Paramétrage › Établissement.']] }
      ] }
  ]
};
