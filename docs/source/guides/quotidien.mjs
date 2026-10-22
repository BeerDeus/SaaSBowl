/* Guide « Le quotidien à l'accueil » : le tableau de bord, le planning, la fiche d'une réservation (décaler, annuler, encaisser),
   les transactions, et les situations courantes au comptoir (renvois vers les guides détaillés).
   Des commandes payées sont créées par le moteur avant le chapitre Transactions, pour que la liste ne soit pas vide. */
const CRM = '/maquettes/e-v2.html';
const B = s => ({ css: 'button', txt: s });
const BLOC = s => ({ css: 'section.bloc', txt: s });
const vers = (ecran, sous) => `S.ecran = '${ecran}'; S.detail = null; S.decal = null; ${sous || ''} D.rendre(); window.scrollTo(0, 0);`;
const RESA = `CENTRE.reservations.filter(x => x.jour === AUJ && x.act !== 'anniv').sort((a, b) => a.debut - b.debut).find(x => x.debut > NOW) || CENTRE.reservations.find(x => x.jour > AUJ && x.act !== 'anniv')`;
const PAIEMENTS = `
  const P = PRODUITS.filter(p => p.stock !== false && !(p.options || []).some(g => g.obligatoire)).slice(0, 3);
  [['Léa', 'Piste 7', 'T-01', 'Carte'], ['Sophie', 'Bar', 'K-04', 'Espèces'], ['Les Strikers', 'Piste 3', 'T-02', 'Carte']].forEach(([nom, lieu, borne, moyen], i) => {
    const c = SB.api.bar.commander({ borne, nom, lieu, ts: Date.now(), lignes: P.slice(0, i + 1).map(p => ({ id: p.id, nom: p.nom, q: 1, pu: p.prix, tva: p.tva || 10 })) }, 'doc').commande;
    SB.api.bar.payer(c.num, { moyen, montant: c.total, lignes: [], ok: true, op: 'doc' + c.num, ts: Date.now() }, 'doc'); });
  window.__sbxCRM.charger(['ventes']);`;

export default {
  titre: 'Le quotidien à l’accueil',
  surtitre: 'Guide détaillé',
  ordre: 7,
  sousTitre: 'Le **tableau de bord**, le **planning**, la **fiche** d’une réservation (décaler, annuler, encaisser), les **transactions**, et que faire dans les situations courantes au comptoir.',
  collection: 'Guides du CRM',
  edition: 'Octobre 2026',
  fichier: 'Guide - Le quotidien à l’accueil.pdf',
  intro: [
    'Ce guide est pour l’équipe d’accueil : ce qu’on regarde en arrivant, comment retrouver une réservation et la modifier, et que faire quand un client a un souci.',
    'Ce qu’il faut regarder est **entouré en orange et numéroté**. Tout ce que montre le CRM est en direct : une réservation faite sur le site ou une borne apparaît aussitôt.'
  ],
  sections: [

    /* ------------------------------------------------------------------ */
    { titre: 'Le tableau de bord', chapeau: 'La première page du CRM. D’un coup d’œil : qui arrive, ce qui est à traiter, l’état des bornes et les places du jour.',
      blocs: [
        { capture: { nom: 'tdb', page: CRM, faire: vers('tdb'), attente: 700, zone: '.page', marge: 0, hmax: 1000,
            marques: [{ cible: BLOC('Prochaines arrivées'), n: 1 }, { cible: BLOC('À traiter'), n: 2 }, { cible: BLOC('Réservations du jour'), n: 3 }, { cible: { css: 'section.bloc', txt: 'en ligne', i: 0 }, n: 4, cote: 'droite' },
              { cible: { css: 'button', txt: 'Modules du tableau de bord' }, n: 5, cote: 'droite' }] },
          reperes: [[1, 'Prochaines arrivées :', 'les réservations des heures qui viennent, avec ce qui reste à payer.'],
            [2, 'À traiter :', 'ce qui demande une action (paiement sans commande, borne hors ligne, papier bientôt épuisé, commande à reprendre en caisse…), avec le bouton qui va avec.'],
            [3, 'Réservations du jour :', 'combien sont attendues, validées, absentes.'],
            [4, 'Bornes :', 'un point orange ou rouge signale un souci ; un clic ouvre la borne.'],
            [5, 'Modules du tableau de bord :', 'choisir et ranger les blocs affichés.']] },
        { texte: 'Plus bas : les **salles en direct** (chronos lancés au comptoir) et les **créneaux et places du jour**, activité par activité et heure par heure (places restantes sur places totales).' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Le planning', chapeau: 'Menu Exploiter › Planning. La semaine du bowling et des anniversaires, puis les créneaux du jour de chaque activité.',
      blocs: [
        { capture: { nom: 'planning', faire: vers('planning'), attente: 700, zone: '.page', marge: 0, hmax: 820,
            marques: [{ cible: { css: '.chips, .row', txt: 'Semaine du', i: 0 }, n: 1, marge: 2 }, { cible: { css: '.rc', i: 0 }, n: 2 }] },
          reperes: [[1, 'La semaine :', 'flèches, date, ou un mois à choisir.'], [2, 'Une réservation :', 'l’heure, le nom, la formule, le nombre de personnes. La coche verte : le client a validé sur une borne. Un clic ouvre sa fiche.']] },
        { capture: { nom: 'creneaux-jour', taille: [1000, 1000], faire: ``, zone: { css: 'section.bloc', txt: 'Une ligne par activité' }, marge: 12, hmax: 760,
            marques: [{ cible: { css: 'section.bloc .chips, section.bloc .row', txt: 'Mois', i: 0 }, n: 1, marge: 2 }, { cible: { css: '.cr, button.cren, [data-a="slot"]', i: 0 }, n: 2 }] },
          reperes: [[1, 'Le jour', 'affiché (flèches, date).'], [2, 'Un créneau :', 'les places restantes sur le total. En couleur foncée : complet. Un clic détaille le créneau (formules, canaux, fermeture).']] },
        { encadre: ['Les deux petits boutons à gauche de chaque activité changent l’affichage : en créneaux, ou en frise par salle (une ligne par salle, les réservations à leur vraie durée). Le choix est retenu pour cette activité.'], titre: 'Deux affichages' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'La fiche d’une réservation', chapeau: 'Un clic sur une réservation, n’importe où dans le CRM, ouvre sa fiche « Commande # » à droite.',
      blocs: [
        { capture: { nom: 'fiche', faire: `S.detail = (${RESA}).id; D.rendre(); window.scrollTo(0, 0);`, attente: 700, zone: '.tiroir', marge: 0, hmax: 760,
            marques: [{ cible: { css: '.tiroir .mot', i: 0 }, n: 1 }, { cible: { css: '.tiroir dl', i: 0 }, n: 2, marge: 2 }, { cible: '[data-a="decal"]', n: 3 },
              { cible: B('Renvoyer la confirmation'), n: 4 }, { cible: B('Annuler la commande'), n: 5, cote: 'droite' }] },
          reperes: [[1, 'Les états :', 'attendue / validée sur borne / absente, tapée en caisse, payée ou reste à payer.'],
            [2, 'Le détail :', 'client et coordonnées, jour et heure, formule, canal (site, borne, comptoir), paiements, validation, caisse.'],
            [3, 'Changer le jour ou l’heure', '(chapitre 4).'], [4, 'Renvoyer la confirmation', 'au client.'], [5, 'Annuler la commande', '(deux clics) : les places sont libérées.']] },
        { options: 'Les autres boutons, selon le cas', deux: true, lignes: [
          ['Encaisser', 'Quand il reste un montant à payer : le reste est encaissé au comptoir.'],
          ['Pointer', 'Pour une activité où l’accueil pointe les arrivées (réglage « Pointage »). Pas chez Space Bowling, où le client valide sur une borne.'],
          ['Relancer le bot', 'Quand le bot n’a pas pu taper une partie de bowling en caisse.'],
          ['Voir le compte client', 'Pour une réservation faite sur le site : ouvre la fiche du client.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Décaler une réservation', chapeau: 'Un client veut venir un autre jour, ou plus tard : on déplace sa réservation sans rien refaire.',
      blocs: [
        { capture: { nom: 'decaler', faire: `D.clic('[data-a="decal"]'); const j = document.querySelector('[data-f="decalJour"]'); if (j) { j.value = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10); j.dispatchEvent(new Event('input', { bubbles: true })); }
              await new Promise(r => setTimeout(r, 300)); const h = document.querySelectorAll('[data-a="decalH"]'); if (h[2]) h[2].click();`, attente: 700,
            zone: '.decal', marge: 14,
            marques: [{ cible: '[data-f="decalJour"]', n: 1 }, { cible: { css: '[data-a="decalH"]', i: 0 }, n: 2 }, { cible: '[data-a="decalOk"]', n: 3 }] },
          reperes: [[1, 'Le jour.', ''], [2, 'Les heures proposées :', 'seulement celles où la réservation tient (même formule, même nombre ; la salle est gardée si elle est libre).'],
            [3, 'Déplacer', 'au jour et à l’heure choisis.']] },
        { encadre: ['Le prix convenu et ce qui est déjà payé ne changent pas, même si le tarif du nouveau jour est différent (la fiche l’indique). Le site, les bornes et le comptoir suivent aussitôt. Pensez à prévenir le client : son téléphone et son e-mail sont dans la fiche.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les transactions', chapeau: 'Menu Exploiter › Transactions. Chaque paiement passé sur une borne, une tablette, un téléphone ou au comptoir.',
      blocs: [
        { capture: { nom: 'transactions', taille: [1000, 1000], faire: `${PAIEMENTS} ${vers('transactions')}`, attente: 800, zone: ['.page > .chips, .page > div', BLOC('Aujourd’hui')], marge: 12, hmax: 560,
            marques: [{ cible: { css: 'input[type="search"]', i: 0 }, n: 1 }, { cible: { css: 'select', i: 0 }, n: 2 }, { cible: { css: 'tr.clic', i: 0 }, n: 3, marge: 1 }, { cible: B('Exporter'), n: 4, cote: 'droite' }] },
          reperes: [[1, 'Rechercher', 'un numéro de commande, un ticket de caisse.'], [2, 'Filtrer', 'par borne ou par moyen de paiement.'], [3, 'Un paiement :', 'heure, borne, commande, moyen, terminal, ticket de caisse, montant. Un clic ouvre la commande.'], [4, 'Exporter', 'la liste.']] },
        { encadre: ['Un paiement **à vérifier** (encaissé sans commande, ticket de caisse manquant) remonte en haut, et dans « À traiter » du tableau de bord.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Situations courantes au comptoir', chapeau: 'Où aller, en un coup d’œil. Le détail est dans le guide indiqué.',
      blocs: [
        { tableau: [['Le client…', 'Ce qu’on fait', 'Guide'],
          ['veut changer de jour ou d’heure', 'Fiche de la réservation › Changer le jour ou l’heure.', 'Ce guide, chapitre 4'],
          ['veut annuler', 'Fiche de la réservation › Annuler la commande. (Sur le site, le bouton « Annuler » envoie un e-mail au centre.)', 'Ce guide, chapitre 3'],
          ['a payé une partie au bar et est parti', 'Bar › Commandes › À traiter : encaisser le reste ou classer abandonnée.', 'Le bar'],
          ['a choisi « espèces » sur une tablette de piste', 'Il paie sur une grande borne avec son numéro (« Finaliser ma commande »), dans les 10 minutes.', 'Les bornes'],
          ['a réservé un bowling en ligne', 'Il finalise sur une borne avec son numéro : prénoms, barrières et acompte sont repris.', 'Les bornes'],
          ['a oublié son mot de passe du site', 'Centre › Clients › sa fiche : donnez-lui un nouveau mot de passe.', 'Le site et les clients'],
          ['ne trouve plus d’heure en ligne', 'Vérifier les créneaux de l’activité (alerte « À régler »), ou réserver au comptoir.', 'Prix et horaires'],
          ['signale une salle en panne', 'Fiche de l’activité › Créneaux : un clic sur la case ferme la salle à cette heure.', 'Prix et horaires']] },
        { encadre: ['En bas à droite du CRM, des notifications annoncent en direct ce qui se passe : réservation sur le site, commande bar, paiement refusé, créneau fermé… Elles disparaissent seules.'], titre: 'Les notifications' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Si quelque chose ne va pas', chapeau: 'Les cas les plus courants, et où regarder.',
      blocs: [
        { tableau: [['Ce que vous voyez', 'À vérifier'],
          ['Une réservation n’apparaît pas', 'Le bon jour dans le planning (flèches, date). Une réservation annulée (non présentée) a ses places libérées.'],
          ['« Absente » sur une réservation', 'Le client n’a pas validé à l’heure sur une borne : la réservation est annulée et les places libérées.'],
          ['« Commande à reprendre en caisse »', 'Le bot n’a pas pu taper la partie : « Relancer » dans À traiter.'],
          ['Une borne en rouge sur le tableau de bord', 'Gestion des bornes › sa carte (hors ligne, papier).'],
          ['Pas le droit d’ouvrir un écran', 'Votre rôle (Administratif › Comptes et accès) : demandez à un responsable.']] }
      ] }
  ]
};
