/* Guide « Tickets CE et QR codes » : les lots (créer, suivre, suspendre), la liste des codes (retrouver, annuler, réactiver),
   le suivi des validations, et l'utilisation par le client (borne, site, comptoir). */
const CRM = '/maquettes/e-v2.html';
const B = s => ({ css: 'button', txt: s });
const BLOC = s => ({ css: 'section.bloc', txt: s });
const vers = sous => `S.ecran = 'ce'; S.sousO.ce = '${sous}'; S.code = null; D.rendre(); window.scrollTo(0, 0);`;
const ECRAN = (nom, act, page, legende) => ({ capture: { nom, page: `/borne/index.html?borne=K-01&apercu=${act}&page=${page}`, taille: [540, 960], attente: 900, petite: true }, legende });

export default {
  titre: 'Tickets CE et QR codes',
  surtitre: 'Guide détaillé',
  ordre: 8,
  sousTitre: 'Créer un **lot** de codes pour un comité d’entreprise ou un partenaire, **retrouver** un code, l’**annuler**, et **suivre** leur utilisation sur les bornes, le site et au comptoir.',
  collection: 'Guides du CRM',
  edition: 'Octobre 2026',
  fichier: 'Guide - Tickets CE et QR codes.pdf',
  intro: [
    'Un organisme (comité d’entreprise, mairie, partenaire) achète un lot de tickets, par exemple 1 000 parties de bowling. Le CRM génère les codes, on les lui envoie, et chaque code est suivi jusqu’à son utilisation.',
    'Ce qu’il faut regarder est **entouré en orange et numéroté**. Menu Centre › Tickets CE / QR codes.'
  ],
  sections: [

    /* ------------------------------------------------------------------ */
    { titre: 'Les lots', chapeau: 'Onglet Lots. Un lot = un organisme, un contenu, un nombre de codes et une date de fin.',
      blocs: [
        { capture: { nom: 'lots', taille: [1000, 1000], page: CRM, faire: vers('lots'), attente: 600, zone: ['.page .cols'], marge: 0, hmax: 700,
            marques: [{ cible: { css: 'tr.clic', i: 0 }, n: 1, marge: 1 }, { cible: { css: 'section.bloc', txt: 'Valeur restante' }, n: 2 }, { cible: [B('Voir les codes'), B('Exporter'), B('Suspendre')], n: 3, cote: 'droite' }, { cible: B('Nouveau lot'), n: 4, cote: 'droite' }] },
          reperes: [[1, 'Un lot :', 'organisme, contenu, codes émis, utilisés, restants, date de fin, état. Un clic l’affiche en dessous.'],
            [2, 'Le détail du lot :', 'émis, utilisés, annulés, valeur restante, prix de vente à l’organisme, validité.'],
            [3, 'Voir les codes, Exporter', '(PDF avec un QR code par page, et CSV), Suspendre (plus aucun code accepté).'],
            [4, 'Nouveau lot', '(chapitre 2).']] },
        { options: 'Les états d’un lot', deux: true, lignes: [
          ['Actif', 'Ses codes sont acceptés partout.'], ['Expiré', 'La date de fin est passée : ses codes sont refusés.'], ['Clos', 'Tous ses codes sont utilisés, ou il a été fermé.'], ['Suspendu', 'Arrêté à la main : ses codes sont refusés jusqu’à nouvel ordre.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Créer un lot', chapeau: 'Onglet Créer un lot (ou « Nouveau lot »). Le CRM génère les codes, signés et à usage unique.',
      blocs: [
        { capture: { nom: 'creer', faire: `${vers('creer')} D.saisir('[data-f="lotForm.org"]', 'CE Transports Vidal'); D.saisir('[data-f="lotForm.nb"]', '500');`, attente: 600,
            zone: '.page .cols', marge: 0, hmax: 700,
            marques: [{ cible: { sel: '[data-f="lotForm.org"]', parent: 'label' }, n: 1 }, { cible: { sel: '[data-f="lotForm.type"]', parent: 'label' }, n: 2 },
              { cible: [{ sel: '[data-f="lotForm.contenu"]', parent: 'label' }, { sel: '[data-f="lotForm.nb"]', parent: 'label' }], n: 3 },
              { cible: [{ sel: '[data-f="lotForm.valeur"]', parent: 'label' }, { sel: '[data-f="lotForm.fin"]', parent: 'label' }], n: 4 }, { cible: '[data-a="creerLot"]', n: 5 },
              { cible: BLOC('Ce qui se passe ensuite'), n: 6, cote: 'droite' }] },
          reperes: [[1, 'Organisme :', 'le CE, la mairie, le partenaire.'], [2, 'Type :', 'Ticket CE (code imprimé) ou QR code.'],
            [3, 'Contenu et nombre :', 'ce que vaut un code : une formule de n’importe quelle activité du CRM (Bowling · 1 partie, Laser Game · …), −5 € sur une activité, ou une boisson offerte. Le code ne sert que là. Puis combien en générer.'],
            [4, 'Valeur, prix facturé, fin de validité :', 'la valeur d’un code pour le client, le prix payé par l’organisme, la date limite.'],
            [5, 'Générer le lot.', ''], [6, 'Ce qui se passe ensuite :', 'l’envoi à l’organisme et la facture.']] },
        { encadre: ['Chaque code a son **propre QR code**, créé tout seul : rien à faire.', 'Chaque code est **signé** et à **usage unique** : une fois utilisé, il est refusé partout. Il est aussi refusé sur une borne sans réseau (il ne peut pas être vérifié).'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Retrouver un code, sa fiche et son QR code', chapeau: 'Onglet Liste des codes : tous les codes, tous lots confondus. Un clic sur une ligne ouvre la fiche du code.',
      blocs: [
        { capture: { nom: 'liste', taille: [1000, 1000], faire: vers('liste'), attente: 600, zone: ['.page > .chips', { css: 'section.bloc', txt: 'Tickets CE et QR codes, tous lots confondus' }], marge: 12, hmax: 640,
            marques: [{ cible: '[data-f="codeQ"]', n: 1 }, { cible: ['[data-a="codeEtat"][data-k="tous"]', '[data-a="codeEtat"][data-k="annulé"]'], n: 2 },
              { cible: { css: '[data-a="codeAnnuler"]', i: 0 }, n: 3, cote: 'droite' }] },
          reperes: [[1, 'Tapez ou scannez', 'un code (la scannette marche directement dans ce champ), ou un nom d’organisme.'],
            [2, 'Filtrer', 'par état : disponibles, utilisés, annulés.'],
            [3, 'Annuler', 'un code perdu ou volé : il sera refusé partout. « Réactiver » remet en circulation un code utilisé par erreur.']] },
        { texte: 'Pour un code utilisé, la liste indique **quand** et **où** (quelle borne, le site, le comptoir). Un clic sur la ligne ouvre sa **fiche**, à droite :' },
        { capture: { nom: 'fiche', taille: [1000, 1000], faire: `${vers('liste')} D.clic('tr.clic[data-a="code"]');`, attente: 500, zone: '.tiroir', marge: 0, hmax: 1000,
            marques: [{ cible: '.tiroir .qr-grand', n: 1 }, { cible: ['[data-a="codeCopier"]', '[data-a="codeImprimer"]'], n: 2 }, { cible: '.tiroir .dl', n: 3 }, { cible: { css: '.tiroir .row', txt: 'ce code' }, n: 4 }] },
          reperes: [[1, 'Le QR code du ticket.', 'Chaque code a le sien, créé tout seul. Il contient le code : un téléphone ou la scannette des bornes le lit.'],
            [2, 'Copier le code, télécharger le QR code', '(image PNG, pour un courrier ou un e-mail à l’organisme), imprimer le ticket (format ticket de caisse, avec le logo).'],
            [3, 'Ses informations :', 'organisme, contenu, pour quelle activité il est valable, valeur, validité, lot (un clic l’ouvre), utilisation.'],
            [4, 'Annuler ou réactiver', 'ce code. Un code annulé est refusé partout ; réactivé, il resert une fois.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Suivre l’utilisation', chapeau: 'Onglet Suivi : ce qui a été validé aujourd’hui, les tentatives refusées, et la consommation de chaque organisme.',
      blocs: [
        { duo: [
          { capture: { nom: 'suivi-ok', faire: vers('suivi'), attente: 600, zone: BLOC('Validations d’aujourd’hui'), marge: 10,
              marques: [{ cible: { css: 'section.bloc', txt: 'Validations d’aujourd’hui' }, n: 1, marge: 0 }] },
            reperes: [[1, 'Validations d’aujourd’hui :', 'l’heure, le lot, le contenu et le lieu de chaque code utilisé.']] },
          { capture: { nom: 'suivi-refus', faire: ``, zone: BLOC('Tentatives refusées'), marge: 10,
              marques: [{ cible: { css: 'section.bloc', txt: 'Tentatives refusées' }, n: 2, marge: 0 }] },
            reperes: [[2, 'Tentatives refusées :', 'code déjà utilisé, expiré ou inconnu, avec le lieu. Utile en cas de litige.']] }] },
        { capture: { nom: 'suivi-conso', faire: ``, zone: BLOC('Consommation par organisme'), marge: 10,
            marques: [{ cible: { css: 'section.bloc th', txt: 'Taux' }, n: 3 }, { cible: { css: 'section.bloc th', txt: 'Valeur consommée' }, n: 4, cote: 'droite' }] },
          reperes: [[3, 'Consommation par organisme :', 'codes émis, utilisés et taux d’utilisation de chaque lot.'], [4, 'Valeur consommée :', 'la base de la facturation à l’organisme.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Côté client', chapeau: 'Sur les bornes, le ticket CE est un moyen de paiement, comme la carte et les espèces.',
      blocs: [
        { duo: [ECRAN('borne-moyen', 'bowling', 'moyen', 'Au paiement : la tuile « Ticket CE ou code promo ».'), ECRAN('borne-ticket', 'bowling', 'ticket', 'Le client scanne ses tickets, un par un.')] },
        { tableau: [['Où', 'Comment'],
          ['**Borne, toutes les activités et le bar**', 'Au moment de payer, tuile « Ticket CE ou code promo » : le client scanne le QR code (ou tape le code), un ou plusieurs tickets, puis « Valider ». Ce qui reste se paie ensuite par carte ou en espèces. Avec « Payer une partie », il paie par exemple 2 joueurs sur 4 avec 2 tickets, le reste par carte. Au récapitulatif, une ligne le prévient.'],
          ['**Site**', 'Au récapitulatif, bloc « Code promo / Ticket CE ».'],
          ['**Comptoir**', 'L’équipe scanne ou tape le code.']] },
        { options: 'Le réglage (Sandbox › module › page Récapitulatif)', deux: true, lignes: [
          ['« Tickets CE et codes promo acceptés » coché', 'La tuile Ticket CE est proposée au paiement sur la borne, et le bloc sur le site (par défaut).'],
          ['Décoché', 'Pas de ticket CE pour cette activité. Au bar, les tickets sont toujours acceptés.']] },
        { encadre: ['Un code ne sert que pour **l’activité de son lot** : un ticket « Bowling · 1 partie » est refusé au laser. « −5 € sur une activité » vaut partout, « Boisson offerte » au bar.',
          'Sur la borne, les tickets sont **consommés** quand le client touche « Valider ». S’il part sans payer le reste, la commande est abandonnée et ses tickets redeviennent disponibles.',
          'Un ticket couvre au plus ce qui reste à payer : **la différence n’est pas rendue** (la borne le signale avant de valider).'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Si quelque chose ne va pas', chapeau: 'Les cas les plus courants, et où regarder.',
      blocs: [
        { tableau: [['Le client voit…', 'À vérifier'],
          ['« Code déjà utilisé »', 'Liste des codes : quand et où il a servi. Réactivez-le s’il a été utilisé par erreur.'],
          ['« Code expiré » ou « lot clos »', 'La date de fin et l’état du lot.'],
          ['« Code inconnu »', 'Une faute de frappe (lettres et chiffres), ou un code d’un autre centre.'],
          ['« Pas de réseau »', 'La borne ne peut pas vérifier le code : réessayer au retour du réseau, ou au comptoir.'],
          ['« Ce code est valable seulement pour … »', 'Le code est réservé à l’activité de son lot (sa fiche, ligne « Valable pour ») : un ticket bowling ne paie pas le laser.']] }
      ] }
  ]
};
