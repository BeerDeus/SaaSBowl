/* Guide « Prix et horaires » : les règles de prix, le calendrier, les templates de créneaux, générer, fermer ponctuellement.
   Même exemple que le Guide général : Réalité virtuelle (act8), Salle Bleue 4 pers., Salle Rouge 6 pers., Session 30 min et Session 1 h.
   La première capture crée l'activité et son template sans les montrer (c'est l'objet de l'autre guide). */
const CRM = '/maquettes/e-v2.html';
const B = s => ({ css: 'button', txt: s });
const BLOC = s => ({ css: 'section.bloc', txt: s });
const ID = 'act8';
const vers = (ecran, sous) => `S.ecran = '${ecran}'; ${sous || ''} D.rendre(); window.scrollTo(0, 0);`;
const JOUR = n => `new Date(Date.now() + ${n} * 864e5).toISOString().slice(0, 10)`;
const REGLE = (fi, ri) => `[data-cible="px:${ID}|${fi}|${ri}"]`;
const PREPARER = `
  S.nouv = { nom: 'Réalité virtuelle', fonct: 'seance', ressNom: 'Salle', nb: 2, cap: 4, duree: 30, battement: 5, pointage: 'borne', canaux: ['web', 'borne', 'comptoir'],
    ressources: [{ nom: 'Salle Bleue', cap: 4 }, { nom: 'Salle Rouge', cap: 6 }],
    formules: [{ nom: 'Session 30 min', unite: 'par joueur', duree: 30, couleur: '#6fe0c9', regles: [{ jours: 'lv', de: '14:00', a: '17:30', prix: 15 }, { jours: 'tous', prix: 18 }] },
      { nom: 'Session 1 h', unite: 'par joueur', duree: 60, couleur: '#ffb35c', regles: [{ jours: 'tous', prix: 28 }] }] };
  ACTIONS.creer(); if (S.act !== '${ID}') throw new Error('identifiant inattendu : ' + S.act);
  S.gen.act = '${ID}'; S.gen.formules = null; S.gen.tpl = undefined; ACTIONS.tplNouv();
  const t = tplsDe('${ID}')[0]; t.nom = 'Semaine type'; t.pas = 30;
  t.regles = [{ formules: ['Session 30 min', 'Session 1 h'], jours: [2, 5, 6], de: '14:00', a: '22:30' }, { formules: ['Session 30 min', 'Session 1 h'], jours: [0, 1, 3, 4], de: '17:00', a: '22:30' }];
  S.gen.tpl = t.id; S.gen.du = ${JOUR(0)}; S.gen.au = ${JOUR(27)}; ACTIONS.genererSlots();`;

export default {
  titre: 'Prix et horaires',
  surtitre: 'Guide détaillé',
  ordre: 1,
  sousTitre: 'Les **règles de prix**, le **calendrier** des vacances et des jours fériés, les **templates** de créneaux, et comment **fermer** une heure ou une journée.',
  collection: 'Guides du CRM',
  edition: 'Octobre 2026',
  fichier: 'Guide - Prix et horaires.pdf',
  intro: [
    'Ce guide complète le **Guide général**. Il reprend le même exemple, la **Réalité virtuelle** (Salle Bleue, Salle Rouge, Session 30 min et Session 1 h), et va plus loin sur les prix et les horaires.',
    'Ce qu’il faut regarder est **entouré en orange et numéroté**. Les tableaux « Option » disent ce que fait chaque choix et quand le prendre.'
  ],
  sections: [

    /* ------------------------------------------------------------------ */
    { titre: 'Comment le prix est calculé', chapeau: 'Le même calcul sert partout : site, bornes et comptoir. Un client ne voit jamais deux prix différents pour le même créneau.',
      blocs: [
        { etapes: ['Le client choisit une **formule** (Session 30 min).', 'Le CRM regarde les **règles** de cette formule et garde celles qui correspondent au jour, à l’heure et à la taille du groupe.', 'Parmi elles, la **plus précise** donne le prix.', 'Selon l’**unité**, ce prix est multiplié par le nombre de personnes (par joueur) ou compté une fois pour le groupe (la salle).'] },
        { encadre: ['Session 30 min, 4 joueurs, un mardi à 15 h. La règle « du lundi au vendredi de 14:00 à 17:30 » correspond et elle est plus précise que « tous les jours » : 15 € par joueur, soit **60 €**.'], titre: 'Exemple', genre: 'exemple' },
        { encadre: ['Si aucune règle ne correspond, la formule prend le prix de sa **première** règle. Sauf si elle est « vendue seulement aux jours et heures de ses règles » : elle n’est alors pas proposée du tout (chapitre 5).'], titre: 'Et si aucune règle ne correspond ?' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Où se règlent les prix', chapeau: 'Menu de gauche › l’activité › onglet **Tarifs**. Chaque formule a son cadre.',
      blocs: [
        { capture: { nom: 'tarifs', taille: [780, 1000], page: CRM, faire: `${PREPARER} ACTIONS.ouvrir({ id: '${ID}', o: 'tarifs' }); D.rendre(); window.scrollTo(0, 0);`, attente: 800,
            zone: { sel: '[data-f="px.act8.0.nom"]', parent: '.bloc' }, marge: 14,
            marques: [{ cible: ['[data-f="px.act8.0.nom"]', '[data-f="px.act8.0.duree"]'], n: 1 }, { cible: '[data-a="pxSalle"][data-pre="act8"][data-fi="0"]', n: 2, cote: 'droite' },
              { cible: { sel: '[data-f="anf.act8.0.emoji"]', parent: '.si' }, n: 3, marge: 2 }, { cible: ['[data-cible="px:act8|0|0"]', '[data-cible="px:act8|0|1"]'], n: 4, marge: 2 },
              { cible: ['[data-a="pxAddR"][data-pre="act8"][data-fi="0"]', '[data-a="pxStrict"][data-pre="act8"][data-fi="0"]'], n: 5 }] },
          reperes: [[1, 'La formule :', 'nom, unité, durée.'],
            [2, 'Ses salles.', '« Toutes », ou seulement certaines (chapitre 6).'],
            [3, 'Sur la borne :', 'âges, participants, icône, badge, photo et contenu de la carte (voir le Guide général).'],
            [4, 'Ses règles de prix,', 'une par ligne. La première commence par SI, les suivantes par SINON SI.'],
            [5, 'Ajouter une règle', 'et choisir si la formule se vend à toute heure (chapitre 5).']] },
        { encadre: ['Un prix modifié ici s’applique aussitôt aux nouvelles réservations, partout. Les réservations déjà prises gardent le prix convenu.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Écrire une règle de prix', chapeau: 'Une règle dit : « SI c’est tel jour, à telle heure, pour un groupe de telle taille, ALORS le prix est… ». Tout ce qu’on laisse vide veut dire « peu importe ».',
      blocs: [
        { capture: { nom: 'regle', taille: [780, 1000], faire: `window.scrollTo(0, 0);`,
            zone: '[data-cible="px:act8|0|0"]', marge: 18,
            marques: [{ cible: '[data-cible="px:act8|0|0"] .grip', n: 1 }, { cible: '[data-f="px.act8.0.0.jours"]', n: 2 }, { cible: ['[data-f="px.act8.0.0.de"]', '[data-f="px.act8.0.0.a"]'], n: 3 },
              { cible: ['[data-f="px.act8.0.0.min"]', '[data-f="px.act8.0.0.max"]'], n: 4 },
              { cible: ['[data-a="pxHors"][data-pre="act8"][data-fi="0"][data-ri="0"][data-k="seulVac"]', '[data-a="pxHors"][data-pre="act8"][data-fi="0"][data-ri="0"][data-k="horsFerie"]'], n: 5, cote: 'bas' },
              { cible: '[data-f="px.act8.0.0.prix"]', n: 6, cote: 'bas' }, { cible: '[data-a="pxSupR"][data-pre="act8"][data-fi="0"][data-ri="0"]', n: 7, cote: 'droite' }] },
          reperes: [[1, 'Poignée.', 'Glissez-la pour changer l’ordre des règles (utile à précision égale, chapitre 4).'],
            [2, 'Les jours.', 'Voir le tableau ci-dessous.'],
            [3, 'Les heures,', 'de… à…, l’heure de fin comprise. Vides : toute la journée.'],
            [4, 'Le groupe :', 'minimum et maximum de personnes. Vides : quelle que soit la taille.'],
            [5, 'Vacances, fériés :', 'pour affiner les jours (tableau ci-dessous).'],
            [6, 'Le prix', 'dans l’unité de la formule.'],
            [7, 'Supprimer', 'la règle (il en reste toujours une).']] },
        { options: 'Les jours', deux: true, lignes: [
          ['Tous les jours', 'Aucune condition de jour.'],
          ['Lun. → ven.', 'Du lundi au vendredi.'],
          ['Sam. et dim.', 'Le week-end.'],
          ['Vacances scolaires', 'Seulement pendant les vacances de la zone du centre (chapitre 7).'],
          ['Veilles et jours fériés', 'La veille d’un jour férié et le jour férié lui-même. Ce choix compte double pour la précision : il passe devant presque tout.'],
          ['Personnalisé', 'Les jours de votre choix : des cases lun., mar., mer.… apparaissent à côté.']] },
        { options: 'Les cases sous les jours', deux: true, lignes: [
          ['vacances scolaires', 'La règle ne vaut que pendant les vacances. Avec « Lun. → ven. » : les jours de semaine pendant les vacances.'],
          ['hors vacances', 'La règle ne vaut qu’en dehors des vacances. Avec « Lun. → ven. » : les jours d’école.'],
          ['veilles et fériés', 'La règle ne vaut que les veilles et jours fériés.'],
          ['hors veilles et fériés', 'La règle ne vaut pas les veilles et jours fériés.'],
          ['« vacances » + « veilles et fériés »', 'Cochées ensemble : l’un ou l’autre suffit.']] },
        { options: 'Les heures', deux: true, lignes: [
          ['De 14:00 à 17:30', 'Les créneaux qui commencent entre 14:00 et 17:30, 17:30 compris.'],
          ['De 19:00 à 00:00', 'Comprend le créneau de minuit.'],
          ['De 22:00 à 02:00', 'Une fin plus tôt que le début passe minuit : les créneaux de 22 h à 2 h du matin, sur la même soirée.'],
          ['Deux plages qui se touchent', '13:00 → 17:00 et 17:00 → 02:00 : à 17:00, c’est la plage qui commence qui l’emporte.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Quelle règle gagne ?', chapeau: 'Quand plusieurs règles correspondent, le CRM prend la plus précise. À précision égale, la première de la liste.',
      blocs: [
        { texte: 'La précision se compte simplement : **un point** pour chaque condition remplie. Des jours (autres que « Tous les jours »), des heures, un minimum de groupe, un maximum de groupe, une case vacances ou fériés. Les **veilles et jours fériés** comptent deux points.' },
        { capture: { nom: 'gagnante', taille: [780, 1000], faire: `
              D.choisir('[data-f="px.act8.0.0.jours"]', 'ferie'); D.saisir('[data-f="px.act8.0.0.de"]', ''); D.saisir('[data-f="px.act8.0.0.a"]', ''); D.saisir('[data-f="px.act8.0.0.prix"]', '20');
              D.choisir('[data-f="px.act8.0.1.jours"]', 'lv'); D.saisir('[data-f="px.act8.0.1.de"]', '14:00'); D.saisir('[data-f="px.act8.0.1.a"]', '17:30'); D.saisir('[data-f="px.act8.0.1.prix"]', '15');
              D.clic('[data-a="pxAddR"][data-pre="act8"][data-fi="0"]'); D.choisir('[data-f="px.act8.0.2.jours"]', 'tous'); D.saisir('[data-f="px.act8.0.2.de"]', ''); D.saisir('[data-f="px.act8.0.2.a"]', ''); D.saisir('[data-f="px.act8.0.2.min"]', '8'); D.saisir('[data-f="px.act8.0.2.prix"]', '16');
              D.clic('[data-a="pxAddR"][data-pre="act8"][data-fi="0"]'); D.choisir('[data-f="px.act8.0.3.jours"]', 'tous'); D.saisir('[data-f="px.act8.0.3.de"]', ''); D.saisir('[data-f="px.act8.0.3.a"]', ''); D.saisir('[data-f="px.act8.0.3.min"]', ''); D.saisir('[data-f="px.act8.0.3.prix"]', '18');
              window.scrollTo(0, 0);`,
            zone: ['[data-cible="px:act8|0|0"]', '[data-cible="px:act8|0|3"]'], marge: 18,
            marques: [{ cible: '[data-cible="px:act8|0|0"]', n: 1, marge: 1 }, { cible: '[data-cible="px:act8|0|1"]', n: 2, marge: 1 }, { cible: '[data-cible="px:act8|0|2"]', n: 3, marge: 1 }, { cible: '[data-cible="px:act8|0|3"]', n: 4, marge: 1 }] },
          reperes: [[1, 'Veilles et jours fériés → 20 €.', '2 points.'], [2, 'Lun. → ven., de 14:00 à 17:30 → 15 €.', '2 points (jours + heures).'],
            [3, 'Tous les jours, groupe à partir de 8 → 16 €.', '1 point.'], [4, 'Tous les jours → 18 €.', '0 point : le prix « par défaut ».']] },
        { tableau: [['Réservation', 'Règles qui correspondent', 'Prix par joueur'],
          ['Mardi 15 h, 4 joueurs', '2 et 4', '**15 €** (règle 2)'],
          ['Mardi 15 h, 10 joueurs', '2, 3 et 4', '**15 €** (règle 2, plus précise que la 3)'],
          ['Samedi 15 h, 10 joueurs', '3 et 4', '**16 €** (règle 3)'],
          ['Samedi 15 h, 4 joueurs', '4', '**18 €**'],
          ['Lundi de Pâques 15 h, 4 joueurs', '1, 2 et 4', '**20 €** : les règles 1 et 2 ont 2 points, la 1 est en premier']] },
        { encadre: ['À égalité, l’ordre compte. Mettez en haut de la liste les règles « exceptionnelles » (fériés, vacances, offres) et en bas la règle « tous les jours », qui sert de prix par défaut.'], titre: 'Le bon réflexe' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Une offre vendue seulement à certaines heures', chapeau: 'Par défaut, une formule se vend à toutes les heures des créneaux. On peut la limiter aux jours et heures de ses règles : pratique pour une offre ponctuelle.',
      blocs: [
        { capture: { nom: 'offre', taille: [780, 1000], faire: `
              D.clic('[data-a="pxAddF"][data-pre="act8"]');
              D.saisir('[data-f="px.act8.2.nom"]', 'Offre midi'); D.choisir('[data-f="px.act8.2.duree"]', '30');
              D.choisir('[data-f="px.act8.2.0.jours"]', 'lv'); D.saisir('[data-f="px.act8.2.0.de"]', '12:00'); D.saisir('[data-f="px.act8.2.0.a"]', '13:30'); D.saisir('[data-f="px.act8.2.0.prix"]', '12');
              D.clic('[data-a="pxStrict"][data-pre="act8"][data-fi="2"]'); window.scrollTo(0, 0);`,
            zone: { sel: '[data-f="px.act8.2.nom"]', parent: '.bloc' }, marge: 14,
            marques: [{ cible: '[data-cible="px:act8|2|0"]', n: 1, marge: 1 }, { cible: '[data-a="pxStrict"][data-pre="act8"][data-fi="2"]', n: 2 }] },
          reperes: [[1, 'La règle de l’offre :', 'du lundi au vendredi, de 12:00 à 13:30, 12 € par joueur.'],
            [2, 'Vendue seulement aux jours et heures de ses règles.', 'Un clic sur l’interrupteur. En dehors de ces heures, la borne et le site ne la proposent pas.']] },
        { options: 'Sous les règles de chaque formule', deux: true, lignes: [
          ['Vendue à toute heure', 'Le choix par défaut. La formule est proposée à toutes les heures où un créneau la contient. En dehors de ses règles, elle garde le prix de sa première règle.'],
          ['Vendue seulement aux jours et heures de ses règles', 'En dehors de ses règles, elle n’est pas proposée du tout. Exemples : « Offre midi », « 2 + 1 le mardi soir ».']] },
        { encadre: ['La formule doit aussi être dans les créneaux : ajoutez-la au template (chapitre 8), sinon une alerte « À régler » le rappelle (chapitre 11).'], titre: 'Attention', genre: 'attention' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Une formule dans certaines salles seulement', chapeau: 'Avec plusieurs salles, une formule peut n’exister que dans certaines. C’est ainsi qu’on donne à chaque salle sa durée et son prix.',
      blocs: [
        { capture: { nom: 'salles', taille: [780, 1000], faire: `D.clic('[data-a="pxSalle"][data-pre="act8"][data-fi="1"][data-id="act8-2"]'); window.scrollTo(0, 0);`,
            zone: { sel: '[data-f="px.act8.1.nom"]', parent: '.si' }, marge: 16,
            marques: [{ cible: '[data-a="pxSalle"][data-pre="act8"][data-fi="1"][data-id=""]', n: 1, cote: 'bas' }, { cible: '[data-a="pxSalle"][data-pre="act8"][data-fi="1"][data-id="act8-2"]', n: 2, cote: 'droite' }] },
          reperes: [[1, 'Toutes :', 'la formule se vend dans n’importe quelle salle.'], [2, 'Une salle cochée :', 'ici, la Session 1 h n’existe qu’en Salle Rouge. Un groupe qui la choisit va donc forcément en Salle Rouge.']] },
        { encadre: ['Si chaque formule n’existe que dans une seule salle (une durée et un prix par salle), gardez l’attribution **Automatique** : le client choisit sa formule, la salle suit. « Au choix du client » sert quand le client doit choisir une salle avant tout.'], titre: 'Escape game et salles à thème' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Vacances scolaires et jours fériés', chapeau: 'Paramétrage › Calendrier. Rien à saisir : les dates viennent toutes seules. Elles servent aux règles de prix et aux templates.',
      blocs: [
        { capture: { nom: 'calendrier', faire: `${vers('parametrage', `S.param = 'calendrier';`)}`, attente: 900,
            zone: BLOC('Vacances scolaires'), marge: 12, hmax: 640,
            marques: [{ cible: { css: '.si, .chips', txt: 'Zone' }, n: 1, marge: 2 }, { cible: B('Mettre à jour maintenant'), n: 2, cote: 'droite' }, { cible: { css: 'tr', txt: 'à venir' }, n: 3, marge: 1 }] },
          reperes: [[1, 'La zone', 'du centre (A, B ou C). La liste des vacances suit.'],
            [2, 'Mettre à jour maintenant.', 'Inutile en temps normal : le CRM revérifie la liste chaque semaine, auprès du ministère de l’Éducation nationale.'],
            [3, 'Chaque période', 'du premier jour de vacances à la reprise des cours.']] },
        { texte: 'Juste en dessous, les **jours fériés** et leurs **veilles** sont calculés pour plusieurs années (dates fixes, lundi de Pâques, Ascension, lundi de Pentecôte).' },
        { encadre: ['Le pont de l’Ascension ne compte pas comme des vacances. Pour un tarif spécial ce jour-là, utilisez « Veilles et jours fériés » ou des jours personnalisés.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les horaires : bien construire un template', chapeau: 'Générateur de créneaux › Templates. Rappel : un template est une semaine type faite de règles qui s’additionnent. Ici, on ajoute un horaire de vacances.',
      blocs: [
        { capture: { nom: 'template', faire: `${vers('generateur', `S.gen.act = '${ID}'; S.gen.formules = null; S.sousO.generateur = 'templates';`)}
              D.clic('[data-a="tplRegle"]');
              for (const d of [0, 1, 3, 4]) { if (!document.querySelector('[data-a="tplJour"][data-ri="2"][data-d="' + d + '"]').classList.contains('on')) D.clic('[data-a="tplJour"][data-ri="2"][data-d="' + d + '"]'); }
              D.saisir('[data-f="tpl.r.2.de"]', '14:00'); D.saisir('[data-f="tpl.r.2.a"]', '16:30'); D.clic('[data-a="tplHors"][data-ri="2"][data-k="seulVac"]');`,
            zone: [BLOC('Semaine type'), BLOC('Une semaine de vacances')], marge: 14, hmax: 1700,
            marques: [{ cible: '[data-cible="regle:2"]', n: 1, marge: 1 }, { cible: '[data-a="tplHors"][data-ri="2"][data-k="seulVac"]', n: 2, cote: 'bas' },
              { cible: BLOC('Une semaine type'), n: 3, cote: 'droite' }, { cible: BLOC('Une semaine de vacances'), n: 4, cote: 'droite' }, { cible: B('Dupliquer'), n: 5, cote: 'droite' }] },
          reperes: [[1, 'Une 3e règle :', 'les deux formules, lundi, mardi, jeudi, vendredi, de 14:00 à 16:30.'],
            [2, 'Vacances scolaires', 'cochée : cette règle ne vaut que pendant les vacances. Les après-midi de semaine s’ouvrent donc seulement en vacances.'],
            [3, 'Aperçu d’une semaine normale :', 'rien ne change les jours d’école.'],
            [4, 'Aperçu d’une semaine de vacances :', 'les après-midi de semaine apparaissent.'],
            [5, 'Dupliquer', 'copie le template (pour un horaire d’été, par exemple). « Supprimer » le retire, sans toucher aux créneaux déjà générés.']] },
        { options: 'Les réglages d’un template', deux: true, lignes: [
          ['Un créneau toutes les…', '15 min, 30 min, 1 h ou 1 h 30 : l’écart entre deux heures de départ. La salle reste occupée pendant toute la formule.'],
          ['Canaux', 'Qui peut vendre ces créneaux. Un template « Comptoir » seul sert pour des horaires qu’on ne veut pas montrer en ligne.'],
          ['Formules d’une règle', 'Toutes les formules ou certaines. Exemple : la Session 1 h seulement le week-end.'],
          ['Jours', 'Les jours de la règle. Un jour présent dans aucune règle est fermé.'],
          ['Premier et dernier créneau', 'Les heures du premier et du dernier départ. Un dernier créneau plus tôt que le premier passe minuit : 17:00 → 00:30 donne des créneaux jusqu’à 0 h 30 (affichés 24:30, sur la même soirée).'],
          ['Toutes les salles, ou une salle', 'Une règle peut ne valoir que dans certaines salles.'],
          ['Vacances, fériés', 'Cochées, elles limitent la règle à ces jours-là ; « hors… » l’en exclut.']] },
        { encadre: ['Les règles s’additionnent : à chaque heure, le créneau propose les formules de **toutes** les règles qui la couvrent. Pour fermer un horaire, on ne l’« enlève » pas : on fait en sorte qu’aucune règle ne le contienne.'], titre: 'Le principe à retenir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Générer, prolonger, corriger', chapeau: 'Un template ne vend rien tant qu’il n’est pas généré sur une période. Générer crée les créneaux ; c’est eux que le site et les bornes proposent.',
      blocs: [
        { etapes: ['Dans le template, cliquez sur **Générer avec ce template**.', 'Choisissez la période (**Du… au…**), puis **Générer**.', 'Chaque génération forme un **lot**, visible dans l’onglet **Créneaux générés**.'] },
        { capture: { nom: 'lots', taille: [1000, 1000], faire: `D.clic('[data-a="tplVersGen"]'); D.saisir('[data-f="gen.du"]', ${JOUR(28)}); D.saisir('[data-f="gen.au"]', ${JOUR(55)}); D.clic('[data-a="genererSlots"]');`, attente: 800,
            zone: BLOC('Lots générés'), marge: 14,
            marques: [{ cible: { css: 'tr', txt: 'Semaine type', i: 0 }, n: 1, marge: 1 }, { cible: { css: 'tr', txt: 'Semaine type', i: 1 }, n: 2, marge: 1 }, { cible: B('Supprimer le lot'), n: 3, cote: 'droite' }] },
          reperes: [[1, 'Le premier lot :', 'les 4 premières semaines.'], [2, 'Le deuxième lot :', 'les 4 suivantes, pour prolonger.'],
            [3, 'Supprimer le lot', 'retire tous ses créneaux d’un coup (erreur de période, mauvais template).']] },
        { options: 'Cas courants', deux: true, lignes: [
          ['Prolonger le mois suivant', 'Générez la période suivante avec le même template. Pensez-y avant que les créneaux à venir ne s’épuisent : sans créneau, plus rien ne se vend en ligne.'],
          ['Changer les horaires', 'Modifiez le template, puis regénérez la période concernée : ses créneaux sont remplacés. Les réservations déjà prises sont gardées.'],
          ['Une erreur de génération', 'Supprimez le lot, corrigez le template, regénérez.'],
          ['Changer un prix', 'Rien à regénérer : les prix viennent de l’onglet Tarifs, au moment de la réservation.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Fermer ponctuellement', chapeau: 'Panne, ménage, privatisation, jour férié : on ferme sans toucher au template. Fiche de l’activité › onglet Créneaux, choisissez le jour.',
      blocs: [
        { capture: { nom: 'fermer', taille: [1000, 1000], faire: `ACTIONS.ouvrir({ id: '${ID}', o: 'creneaux' }); S.slotJ = AUJ + [2, 1, 0, 6, 5, 4, 3][(new Date().getDay() + 6) % 7] + 1; D.rendre();        // le prochain mercredi (créneaux dès 14:00)
              const c = document.querySelectorAll('[data-a="salleFermer"]'); if (c[3]) c[3].click(); window.scrollTo(0, 0);`, attente: 700,
            zone: ['[data-a="slotJour"]', { css: 'th', txt: 'Heure' }, { css: '[data-a="slotSup"]', i: 2 }], marge: 16, hmax: 1150,
            marques: [{ cible: [{ css: 'button', txt: 'Fermer la journée' }, { css: 'button', txt: 'Tout rouvrir' }], n: 1, cote: 'droite' }, { cible: '[data-a="salleRouvrir"]', n: 2 },
              { cible: { css: '[data-a="salleFermer"]', i: 0 }, n: 3 }, { cible: { css: '[data-a="slotFormule"]', i: 0 }, n: 4 }, { cible: { css: '[data-a="slotOuvert"]', i: 0 }, n: 5 }, { cible: { css: '[data-a="slotSup"]', i: 0 }, n: 6, cote: 'droite' }] },
          reperes: [[1, 'Fermer la journée / Tout rouvrir', 'pour l’activité entière, ce jour-là.'],
            [2, 'Une salle fermée', 'à une heure : un clic dessus la rouvre.'],
            [3, 'Une case libre :', 'un clic ferme cette salle à cette heure. Les autres salles restent en vente.'],
            [4, 'Une formule à une heure :', 'un clic la retire de ce créneau seulement (elle reste ailleurs).'],
            [5, 'Ouvert / Fermé :', 'le créneau entier, toutes salles et formules.'],
            [6, 'Supprimer', 'le créneau (à réserver aux erreurs : fermer suffit d’habitude).']] },
        { options: 'Que fermer ?', deux: true, lignes: [
          ['Une salle, à une heure', 'Une case de la grille. Ex. la Salle Rouge en panne de 18 h à 19 h.'],
          ['Une formule, à une heure', 'La pastille de la formule dans le détail. Ex. pas de Session 1 h à 22 h.'],
          ['Un créneau entier', 'L’interrupteur Ouvert / Fermé de la ligne.'],
          ['Toute une journée', 'Fermer la journée. Ex. privatisation, fermeture exceptionnelle.'],
          ['Le site seulement', 'Depuis le front employé : clic sur une heure, « retirer du site ». Le créneau reste vendable sur les bornes et au comptoir.']] },
        { encadre: ['Fermer ne supprime aucune réservation déjà prise : elle reste, et l’équipe la voit dans la liste du jour. Les bornes et le site suivent la fermeture aussitôt.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Vérifier : l’alerte « À régler »', chapeau: 'En haut de l’onglet Créneaux, une alerte orange apparaît quand quelque chose empêche de vendre. Elle dit quoi faire.',
      blocs: [
        { capture: { nom: 'alerte', taille: [780, 1000], faire: `window.scrollTo(0, 0);`, zone: '.alerte-c', marge: 14,
            marques: [{ cible: { css: '.alerte-c .grow' }, n: 1, marge: 2 }, { cible: { css: '.alerte-c button' }, n: 2, cote: 'droite' }] },
          reperes: [[1, 'Le message.', 'Ici, l’« Offre midi » créée au chapitre 5 n’est dans aucun créneau : elle ne se vendra pas.'], [2, 'Ouvrir le template,', 'pour l’ajouter à une règle, puis regénérer.']] },
        { options: 'Les trois alertes', deux: true, lignes: [
          ['Aucun créneau à venir', 'L’activité ne se réserve plus à l’avance (les créneaux sont épuisés ou jamais générés). Générez une nouvelle période.'],
          ['Une formule n’existe plus', 'Les créneaux proposent une formule supprimée des Tarifs. Mettez les bonnes formules dans le template, puis regénérez.'],
          ['Une formule dans aucun créneau', 'Elle existe dans les Tarifs mais aucun créneau ne la propose. Ajoutez-la au template, puis regénérez.']] },
        { encadre: ['Renommer une formule dans les Tarifs renomme aussi ses templates et ses créneaux déjà générés : pas d’alerte, rien à refaire.'], titre: 'Bon à savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Si quelque chose ne va pas', chapeau: 'Les cas les plus courants, et où regarder.',
      blocs: [
        { tableau: [['Ce que vous voyez', 'À vérifier'],
          ['Le prix affiché n’est pas le bon', 'Quelle règle gagne (chapitre 4) : comptez les points, puis l’ordre. Les heures « à » sont comprises.'],
          ['Le tarif de vacances ne s’applique pas', 'La zone du calendrier (chapitre 7). La règle a bien « Vacances scolaires » (jours ou case).'],
          ['Une formule n’est jamais proposée', 'Elle est dans le template et les créneaux sont regénérés. Si elle est « vendue seulement… », l’heure demandée est dans ses règles.'],
          ['Plus aucune heure en ligne', 'Il reste des créneaux à venir (alerte « Aucun créneau à venir »). Prolongez avec une nouvelle génération.'],
          ['Un horaire de soirée s’arrête à minuit', 'Dernier créneau plus tôt que le premier pour passer minuit (00:30, 01:00…).'],
          ['Un jour reste ouvert alors qu’on est fermé', 'Retirez ce jour de toutes les règles du template et regénérez, ou fermez la journée ponctuellement (chapitre 10).']] },
        { encadre: ['Après un changement de prix, rien à regénérer. Après un changement d’horaires (template), regénérez la période concernée.'], titre: 'Pour retenir' }
      ] }
  ]
};
