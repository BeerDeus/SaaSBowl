/* Guide « Les anniversaires » : formules (prix, âges, carte), tranches d'âge, options, informations demandées, acompte et délais,
   template et places par créneau, la roue du site, le suivi des fêtes. Activité de démonstration : Anniversaire (anniv). */
const CRM = '/maquettes/e-v2.html';
const B = s => ({ css: 'button', txt: s });
const BLOC = s => ({ css: 'section.bloc', txt: s });
const MODULE = page => `S.ecran = 'sandbox'; S.sousO.sandbox = 'activites'; S.act = 'anniv'; (S.modSec = S.modSec || {}).anniv = '${page}'; S.modPage = Object.assign(S.modPage || {}, { anniv: '${page}' }); D.rendre(); window.scrollTo(0, 0);`;
const ZONE_MODULE = [BLOC('Module borne'), '.mod-ap'];

export default {
  titre: 'Les anniversaires',
  surtitre: 'Guide détaillé',
  ordre: 5,
  sousTitre: 'Les **formules** et leurs prix, les **tranches d’âge**, les **options** du goûter, ce que le client remplit, l’**acompte**, les **places** par créneau, la roue du site et le suivi des fêtes.',
  collection: 'Guides du CRM',
  edition: 'Octobre 2026',
  fichier: 'Guide - Les anniversaires.pdf',
  intro: [
    'L’anniversaire est une **formule combinée** : un forfait qui enchaîne d’autres activités (bowling, laser…), avec un goûter et des options. Il se réserve sur le site, les bornes et au comptoir, avec un acompte.',
    'Ce qu’il faut regarder est **entouré en orange et numéroté**.'
  ],
  sections: [

    /* ------------------------------------------------------------------ */
    { titre: 'Comment fonctionne un anniversaire', chapeau: 'Quelques règles propres aux anniversaires, à garder en tête avant de les régler.',
      blocs: [
        { tableau: [['Sujet', 'Comment ça marche'],
          ['**Places**', 'Pas de salle à réserver : chaque créneau propose un nombre de fêtes par formule (ex. 2 « Bowling Enfants » à 14:00), fixé dans le template (chapitre 7).'],
          ['**Formules**', 'Chacune a son prix par enfant, ses âges, son nombre d’enfants, son contenu et sa photo. Le client ne voit que les formules prévues pour l’âge de l’enfant.'],
          ['**Délai**', 'Réservation au plus tard 72 heures avant, jusqu’à 8 semaines à l’avance (réglable).'],
          ['**Paiement**', 'Un acompte (50 €) à la réservation ; le reste se règle sur place le jour de la fête.'],
          ['**Jours**', 'Mercredi, samedi et dimanche, dans le template du centre.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les formules et leurs prix', chapeau: 'Anniversaire › onglet Tarifs. Une formule par cadre, comme pour toute activité, avec en plus la ligne « Sur la borne » et les tranches d’âge.',
      blocs: [
        { capture: { nom: 'formule', taille: [780, 1000], page: CRM, faire: `ACTIONS.ouvrir({ id: 'anniv', o: 'tarifs' }); D.rendre(); window.scrollTo(0, 0);`, attente: 700,
            zone: { sel: '[data-f="px.anniv.0.nom"]', parent: '.bloc' }, marge: 12,
            marques: [{ cible: ['[data-f="anf.anniv.0.ages.0"]', '[data-f="anf.anniv.0.ages.1"]'], n: 1 }, { cible: ['[data-f="anf.anniv.0.participants.0"]', '[data-f="anf.anniv.0.participants.1"]'], n: 2 },
              { cible: '[data-f="anf.anniv.0.badge"]', n: 3 }, { cible: '[data-f="anf.anniv.0.contenu"]', n: 4 }, { cible: { css: '[data-a="pxTranche"][data-pre="anniv"][data-fi="0"]', i: 0 }, n: 5 },
              { cible: ['[data-cible="px:anniv|0|0"]', '[data-cible="px:anniv|0|1"]'], n: 6, marge: 1 }] },
          reperes: [[1, 'Âges', 'affichés sur la carte (« 4 à 6 ans »).'], [2, 'Participants :', 'le nombre d’enfants minimum et maximum. La borne et le site ne proposent pas plus.'],
            [3, 'Badge,', 'icône et photo de la carte (« Populaire »).'], [4, 'Contenu :', 'une ligne par élément du forfait (jeux, goûter, invitations).'],
            [5, 'Pour les :', 'les tranches d’âge pour lesquelles la formule est proposée (chapitre 3).'],
            [6, 'Les prix :', 'ici, 12 € par enfant le mercredi, 15 € le samedi et le dimanche (jours personnalisés).']] },
        { encadre: ['Le détail des règles de prix (jours, vacances, fériés) est dans le guide **Prix et horaires**.'], titre: 'Pour aller plus loin', genre: 'renvoi' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les tranches d’âge', chapeau: 'Sandbox › Activités du centre › Anniversaire › page Âge. C’est la première question posée au client.',
      blocs: [
        { capture: { nom: 'ages', faire: MODULE('rs-age'), attente: 1500, zone: ZONE_MODULE, marge: 12, hmax: 1000,
            marques: [{ cible: { css: '.mod-c', txt: 'Tranches d’âge' }, n: 1, marge: 2 }, { cible: { css: '.mod-c', txt: 'Bougies' }, n: 2, marge: 2 }, { cible: '.mod-tel', n: 3, cote: 'droite' }] },
          reperes: [[1, 'Les tranches d’âge :', 'un nom (« 4 à 6 ans ») et des âges minimum et maximum. Ajoutez, renommez ou supprimez.'],
            [2, 'Bougies sur les cartes,', 'pour le côté festif.'], [3, 'L’aperçu', 'de la page sur la borne.']] },
        { encadre: ['Une tranche sans formule n’a pas d’intérêt : vérifiez, dans les Tarifs, que chaque tranche a au moins une formule (« Pour les »).'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les options du goûter', chapeau: 'Même bloc, page Options : ce que le client ajoute à la fête (parfum des donuts, bouteilles de champomy…).',
      blocs: [
        { capture: { nom: 'options', faire: MODULE('rs-options'), attente: 1500, zone: ZONE_MODULE, marge: 12, hmax: 1000,
            marques: [{ cible: { css: '.mod-c', txt: 'Options' }, n: 1, marge: 2 }, { cible: '.mod-tel', n: 2, cote: 'droite' }] },
          reperes: [[1, 'Les options :', '« au choix » (Donuts : Chocolat ou Sucre, obligatoire) ou « en quantité » (Champomy : 10 € la bouteille, jusqu’à 5).'], [2, 'Sur la borne,', 'l’écran « Pour le goûter ».']] },
        { options: 'Les deux sortes d’option', deux: true, lignes: [
          ['Option au choix', 'Le client choisit une réponse dans une liste (les choix se séparent par des virgules). « Obligatoire » : il doit répondre pour continuer.'],
          ['Option en quantité', 'Le client choisit un nombre, avec un prix à l’unité (« par bouteille ») et un maximum. Le prix s’ajoute au total.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Ce que le client remplit', chapeau: 'Même bloc, page Informations : la fiche de l’enfant, le nombre d’invités et les coordonnées du parent.',
      blocs: [
        { capture: { nom: 'infos', faire: MODULE('rs-infos'), attente: 1500, zone: ZONE_MODULE, marge: 12, hmax: 1000,
            marques: [{ cible: { css: '.mod-c', txt: 'Fiche de l’enfant' }, n: 1, marge: 2 }, { cible: { css: '.mod-c', txt: 'Nombre de participants sur cette page' }, n: 2, marge: 2 },
              { cible: { css: '.mod-c', txt: 'Coordonnées (nom et téléphone)' }, n: 3, marge: 2 }, { cible: '.mod-tel', n: 4, cote: 'droite' }] },
          reperes: [[1, 'Fiche de l’enfant :', 'prénom et date de naissance. L’âge fêté se calcule tout seul pour le jour de la fête.'],
            [2, 'Nombre d’enfants', 'demandé sur cette page (« à peu près : l’équipe ajuste le jour J »).'],
            [3, 'Coordonnées du parent', '(nom, téléphone), obligatoires ou non.'], [4, 'L’aperçu', 'de la page « La star du jour ».']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Acompte et délais', chapeau: 'Même bloc, groupe Règles de réservation : l’onglet Bornes, puis l’onglet Site web pour le site.',
      blocs: [
        { capture: { nom: 'regles', faire: MODULE('reservation'), attente: 1200, zone: '.mod-champs', marge: 12,
            marques: [{ cible: { sel: '[data-f="mod.anniv.reservation.delai"]', parent: 'label' }, n: 1 }, { cible: { sel: '[data-f="mod.anniv.reservation.horizon"]', parent: 'label' }, n: 2 },
              { cible: { css: '.mod-c', txt: 'Paiement sur la borne' }, n: 3 }, { cible: { sel: '[data-f="mod.anniv.reservation.acompte"]', parent: 'label' }, n: 4 }] },
          reperes: [[1, 'Délai :', '72 heures. Un anniversaire ne se réserve pas au dernier moment sur la borne ou le site.'],
            [2, 'Horizon :', 'jusqu’à 56 jours (8 semaines) à l’avance.'], [3, 'Paiement :', 'un acompte.'], [4, 'Montant de l’acompte :', '50 €.']] },
        { encadre: ['L’onglet **Site web** a son propre acompte en ligne (50 € pour les anniversaires). Le reste se règle sur place le jour de la fête ; la fiche de la réservation affiche « reste à payer ».'], titre: 'Pour le site' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les horaires et les places', chapeau: 'Générateur de créneaux › Anniversaire › Templates. Comme toute activité, avec en plus le nombre de fêtes par créneau.',
      blocs: [
        { capture: { nom: 'template', faire: `S.ecran = 'generateur'; S.gen.act = 'anniv'; S.gen.formules = null; S.gen.tpl = undefined; S.sousO.generateur = 'templates'; D.rendre(); window.scrollTo(0, 0);`, attente: 700,
            zone: BLOC('Anniversaires'), marge: 12, hmax: 1100,
            marques: [{ cible: '[data-cible="regle:0"]', n: 1, marge: 1 }, { cible: '[data-cible="regle:1"]', n: 2, marge: 1 }, { cible: { css: '.si', txt: 'Places par créneau' }, n: 3, marge: 1 }] },
          reperes: [[1, 'Règle 1 :', 'mercredi, samedi, dimanche, une fête par heure pile, de 13:00 à 17:00, pour quatre formules.'],
            [2, 'Règle 2 :', 'le Laser Jeune, à la demi-heure (13:30 à 17:30).'],
            [3, 'Places par créneau :', 'combien de fêtes de chaque formule peuvent commencer en même temps. Ici, 2 « Bowling Enfants » à la fois.']] },
        { encadre: ['Les places d’un anniversaire se comptent par formule et par créneau. Quand elles sont prises, la formule disparaît de ce créneau sur la borne et le site. Regénérez la période après avoir changé ces nombres.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Sur le site : la roue des formules', chapeau: 'Sur le site, les formules anniversaire tournent dans une roue 3D, avec leur photo. On peut préférer des cartes.',
      blocs: [
        { capture: { nom: 'roue', page: '/resa/index.html#/anniv/rs-age', taille: [1440, 900], faire: `await new Promise(r => setTimeout(r, 900)); document.querySelectorAll('[data-a="age"]')[1].click(); await new Promise(r => setTimeout(r, 400));
              const s = document.querySelector('[data-a="suivant"]'); if (s && !s.disabled) s.click(); await new Promise(r => setTimeout(r, 1200));`, attente: 900 },
          legende: 'Le site : la roue des formules et le détail de la formule choisie.' },
        { options: 'Module › page Formule › « Affichage des formules sur le site »', deux: true, lignes: [
          ['Roue 3D', 'Les formules tournent ; la formule au centre s’affiche en détail à côté (sur téléphone : une fiche s’ouvre avant de choisir). Le choix par défaut des anniversaires.'],
          ['Cartes', 'Les formules en cartes, comme sur la borne.']] },
        { encadre: ['Les photos de la roue sont celles des formules (Tarifs › Ajouter une photo).'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Suivre les fêtes', chapeau: 'Anniversaire › onglet Planning : les fêtes de la semaine, jour par jour.',
      blocs: [
        { capture: { nom: 'planning', page: CRM, faire: `ACTIONS.ouvrir({ id: 'anniv', o: 'planning' }); D.rendre(); window.scrollTo(0, 0);`, attente: 700,
            zone: BLOC('Anniversaires de la semaine'), marge: 12, hmax: 760,
            marques: [{ cible: { css: '.sem .rc', i: 0 }, n: 1 }] },
          reperes: [[1, 'Une fête :', 'heure, nom, formule, nombre d’enfants, prénom et âge de l’enfant, reste à payer. Un clic ouvre la fiche (changer le jour ou l’heure, encaisser le reste).']] },
        { liste: ['**Décaler une fête :** fiche de la réservation › « Changer le jour ou l’heure ». Le prix convenu et l’acompte ne changent pas.', '**Le jour J :** encaissez le reste dans la fiche ; le nombre d’enfants réel s’ajuste sur place.', '**Le front employé** garde ses onglets Fiches anniversaire et Plan de table.'] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Si quelque chose ne va pas', chapeau: 'Les cas les plus courants, et où regarder.',
      blocs: [
        { tableau: [['Ce que vous voyez', 'À vérifier'],
          ['Aucune formule pour un âge', 'Les formules ont bien cette tranche cochée (« Pour les », onglet Tarifs).'],
          ['« Plus de créneau libre » pour une formule', 'Les places par créneau du template, les jours générés, le délai de 72 heures et l’horizon de 8 semaines.'],
          ['Le client ne peut pas mettre plus d’enfants', 'Les participants maximum de la formule (ligne « Sur la borne »).'],
          ['L’acompte n’est pas le bon', 'Module › Bornes (borne) et Module › Site web (site).'],
          ['Une option ne s’affiche pas', 'Module › page Options ; une option « au choix » a au moins un choix.']] }
      ] }
  ]
};
