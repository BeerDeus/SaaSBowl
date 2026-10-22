/* Guide « Le bar » : la carte (catégories, articles, options, allergènes), l'import Trivec, ce que voit le client sur les bornes
   (visuels, ventes additionnelles, zones de service), le suivi des commandes et les cas à traiter.
   Des commandes d'exemple sont créées par le moteur juste avant le chapitre Commandes (payée, payée en partie, attente espèces). */
const CRM = '/maquettes/e-v2.html';
const B = s => ({ css: 'button', txt: s });
const BLOC = s => ({ css: 'section.bloc', txt: s });
const vers = (ecran, sous) => `S.ecran = '${ecran}'; S.prod = null; S.cmdBar = null; ${sous || ''} D.rendre(); window.scrollTo(0, 0);`;
const BORNE = page => `/borne/index.html?borne=K-01&apercu=bar&page=${page}`;
const ECRAN = (nom, page, legende) => ({ capture: { nom, page: BORNE(page), taille: [540, 960], attente: 900, petite: true }, legende });
const COMMANDES = `
  const P = PRODUITS.filter(p => p.stock !== false && !(p.options || []).some(g => g.obligatoire)).slice(0, 4), L = k => P.slice(0, k).map(p => ({ id: p.id, nom: p.nom, q: 1, pu: p.prix, tva: p.tva || 10 }));
  const cmd = (nom, lieu, borne, k) => SB.api.bar.commander({ borne, nom, lieu, ts: Date.now(), lignes: L(k) }, 'doc').commande;
  const paie = (c, m) => SB.api.bar.payer(c.num, { moyen: 'Carte', montant: m, lignes: [], ok: true, op: 'doc' + c.num + m, ts: Date.now() }, 'doc');
  const a = cmd('Léa', 'Piste 7', 'T-01', 2); paie(a, a.total);
  const b = cmd('Les Strikers', 'Piste 3', 'T-02', 3); paie(b, P[0].prix); SB.api.bar.abandonner(b.num, 'doc');
  const c = cmd('Karim', 'Piste 5', 'T-03', 2); SB.api.bar.attendreEspeces(c.num, 'doc');
  const d = cmd('Sophie', 'Bar', 'K-04', 1); paie(d, d.total);
  window.__docCmd = { partielle: b.num, especes: c.num };
  window.__sbxCRM.charger(['ventes']);`;

export default {
  titre: 'Le bar',
  surtitre: 'Guide détaillé',
  ordre: 4,
  sousTitre: 'La **carte** (catégories, articles, options, allergènes), l’import depuis la caisse **Trivec**, ce que voit le client sur les bornes et le téléphone, et le **suivi des commandes**.',
  collection: 'Guides du CRM',
  edition: 'Octobre 2026',
  fichier: 'Guide - Le bar.pdf',
  intro: [
    'Le bar se vend sur les bornes, les tablettes des pistes et le téléphone des clients. Les commandes payées partent directement sur la caisse Trivec du bar ; le CRM les garde en liste, avec le nom donné par le client et l’endroit où servir.',
    'Ce qu’il faut regarder est **entouré en orange et numéroté**.'
  ],
  sections: [

    /* ------------------------------------------------------------------ */
    { titre: 'La carte : catégories et articles', chapeau: 'Menu Centre › Bar › onglet Produits. Les catégories à gauche, leurs articles à droite.',
      blocs: [
        { capture: { nom: 'produits', page: CRM, faire: vers('bar', `S.sousO.bar = 'produits'; S.prodCat = 'GLACES'; S.prodSous = '';`), attente: 700,
            zone: ['.snav', { css: 'section.bloc', txt: 'GLACES', i: 1 }], marge: 12, hmax: 860,
            marques: [{ cible: '.snav', n: 1, marge: 2 }, { cible: '[data-a="catNouv"]', n: 2 }, { cible: { css: 'tr.clic', i: 0 }, n: 3, marge: 1 },
              { cible: '[data-a="prodNouv"]', n: 4 }, { cible: { css: 'label.btn', txt: 'Importer depuis Trivec' }, n: 5, cote: 'droite' }] },
          reperes: [[1, 'Les catégories', 'et leurs sous-catégories. Un clic affiche leurs articles.'],
            [2, 'Nouvelle catégorie.', 'Une catégorie sans article n’apparaît pas sur les bornes.'],
            [3, 'Un article :', 'un clic ouvre sa fiche (chapitre 2). La poignée ⠿ à gauche change l’ordre sur la borne.'],
            [4, 'Nouvel article,', 'créé hors stock pour le compléter tranquillement.'],
            [5, 'Importer depuis Trivec,', 'pour reprendre la carte de la caisse (chapitre 4).']] },
        { encadre: ['Renommer une catégorie ou une sous-catégorie (dans le cadre au-dessus de la liste) met à jour ses articles, ses visuels et ses ventes additionnelles. Une catégorie qui contient encore des articles ne peut pas être supprimée.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'La fiche d’un article', chapeau: 'Un clic sur un article ouvre sa fiche à droite. Tout ce qui est modifié part aussitôt sur les bornes.',
      blocs: [
        { capture: { nom: 'fiche', faire: `S.prodCat = 'tous'; S.prod = (PRODUITS.find(p => (p.options || []).length) || PRODUITS[0]).id; D.rendre(); window.scrollTo(0, 0);`, attente: 700,
            zone: '.tiroir', marge: 0, hmax: 820,
            marques: [{ cible: { css: '.tiroir label', txt: 'Nom sur la borne' }, n: 1, marge: 2 }, { cible: { css: '.tiroir label', txt: 'Prix TTC' }, n: 2, marge: 2 },
              { cible: { css: '.tiroir label', txt: 'Disponible à partir de' }, n: 3, marge: 2 }, { cible: { css: '.tiroir label', txt: 'Code caisse' }, n: 4, marge: 2, cote: 'droite' },
              { cible: { css: '.tiroir .chips, .tiroir .row', txt: 'Stock' }, n: 5, marge: 2 }, { cible: { css: '.tiroir .chips, .tiroir .row', txt: 'Bornes' }, n: 6, marge: 2 }] },
          reperes: [[1, 'Nom, photo, emoji.', 'Le nom est celui de la borne et de la caisse. Sans photo, la borne affiche l’emoji.'],
            [2, 'Prix et TVA.', ''],
            [3, 'Disponible à partir de :', 'une heure (ex. 18:00 pour l’alcool fort). Avant, la borne ne le propose pas.'],
            [4, 'Code caisse :', 'le code de l’article dans Trivec. Indispensable pour que la commande arrive bien en caisse.'],
            [5, 'Stock.', 'Hors stock, l’article disparaît aussitôt des bornes (et des paniers en cours).'],
            [6, 'Bornes :', 'les espaces où il est vendu (hall, pistes, bar).']] },
        { texte: 'Plus bas dans la fiche : une **description** pour la borne (facultative), les **options** (chapitre 3), les **allergènes** (affichés sur la borne) et la case **alcool** (le client confirme alors qu’il a plus de 18 ans).' },
        { encadre: ['« Retirer de la carte », en bas de la fiche, supprime l’article (deux clics pour confirmer). Pour une rupture passagère, préférez « hors stock ».'], titre: 'Retirer ou mettre hors stock ?' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les options d’un article', chapeau: 'Un parfum, une cuisson, un supplément : le client les choisit sur la borne avant d’ajouter l’article au panier.',
      blocs: [
        { capture: { nom: 'options', faire: `window.scrollTo(0, 0);`, zone: { css: '.tiroir .form', txt: 'Options sur la borne' }, marge: 12,
            marques: [{ cible: { css: '.tiroir [data-a="optOblig"]', i: 0 }, n: 1 }, { cible: { css: '.tiroir [data-f^="opt."][data-f$=".0.nom"]', i: 0 }, n: 2 }, { cible: { css: '.tiroir [data-f$=".0.prix"]', i: 0 }, n: 3 },
              { cible: B('Ajouter un choix'), n: 4 }, { cible: B('Ajouter une option'), n: 5 }] },
          reperes: [[1, 'Obligatoire ou facultative.', 'Facultative : la borne propose aussi « Aucune ».'], [2, 'Un choix', '(Chantilly, Fraise, Saignant…).'],
            [3, 'Supplément :', 'ajouté au prix de l’article (0 si gratuit).'], [4, 'Ajouter un choix', 'à cette option.'], [5, 'Ajouter une option', 'à l’article (une option = une question posée au client).']] },
        { options: 'Obligatoire ou facultative', deux: true, lignes: [
          ['Obligatoire', 'Le client doit choisir avant d’ajouter l’article. Exemple : le parfum d’un sirop.'],
          ['Facultative', 'La borne propose « Aucune » en plus des choix. Exemple : un supplément chantilly.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Reprendre la carte de la caisse Trivec', chapeau: 'Pour ne pas tout ressaisir : la carte se reprend depuis les exports de la caisse.',
      blocs: [
        { etapes: ['Dans Trivec, exportez la liste des **produits** et celle des **catégories** (fichiers CSV).', 'Dans Bar › Produits, cliquez sur **Importer depuis Trivec (CSV)** et choisissez les **deux** fichiers.', 'Le CRM range les articles par catégorie, reprend les prix, la TVA et les codes caisse, et déduit les options des suppléments.', 'Complétez ensuite photos, allergènes et ordre d’affichage.'] },
        { encadre: ['Réimporter met à jour les articles existants (même code caisse) sans effacer vos photos ni vos réglages de borne.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Ce que voit le client : catégories', chapeau: 'Bar › onglet Sur les bornes. Les catégories sont la première chose que le client voit en entrant dans le bar.',
      blocs: [
        { capture: { nom: 'categories', faire: vers('bar', `S.sousO.bar = 'borne';`), attente: 700, zone: BLOC('Catégories'), marge: 12, hmax: 820,
            marques: [{ cible: { css: '.grip', i: 0 }, n: 1 }, { cible: { css: 'section.bloc input', i: 0 }, n: 2 }, { cible: { css: 'section.bloc input[type="color"]', i: 0 }, n: 3 }, { cible: { css: 'section.bloc label.btn', i: 0 }, n: 4, cote: 'droite' }] },
          reperes: [[1, 'L’ordre', 'sur la borne : glissez la poignée.'], [2, 'L’emoji', 'affiché sans photo.'], [3, 'La couleur', 'de la tuile.'], [4, 'Ajouter une photo,', 'carrée ou 4:3, réduite automatiquement.']] },
        { duo: [ECRAN('borne-carte', 'bar', 'La carte sur la borne.'), ECRAN('borne-panier', 'recap', 'Le panier et le prénom.')] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les ventes additionnelles', chapeau: 'Quand le client appuie sur « Continuer », la borne peut proposer un article en plus, ou une version plus grande. Même onglet, bloc Ventes additionnelles.',
      blocs: [
        { capture: { nom: 'ventes-add', page: CRM, faire: vers('bar', `S.sousO.bar = 'borne';`), zone: { css: 'section.bloc', txt: 'Ventes additionnelles' }, marge: 12, hmax: 640,
            marques: [{ cible: { css: '[data-a="upActif"]', i: 0 }, n: 1 }, { cible: { css: 'select[data-f$=".si"]', i: 0 }, n: 2 }, { cible: { css: 'select[data-f$=".mode"]', i: 0 }, n: 3 },
              { cible: { css: 'select[data-f$=".ajout"]', i: 0 }, n: 4 }, { cible: { css: 'input[data-f$=".titre"]', i: 0 }, n: 5 }, { cible: B('Nouvelle règle'), n: 6, cote: 'droite' }] },
          reperes: [[1, 'Active', 'ou en pause.'], [2, 'Quand le panier contient…', 'un article, une catégorie ou une sous-catégorie.'], [3, 'Le type', '(tableau ci-dessous).'],
            [4, 'Les articles proposés :', 'ajoutez-les avec la liste, retirez-les avec leur croix.'], [5, 'Le titre', 'affiché sur la borne : « Un petit extra avec ça ? ».'], [6, 'Nouvelle règle.', '']] },
        { options: 'Les deux types', deux: true, lignes: [
          ['Suggérer d’ajouter', 'La borne propose un article en plus : des chips avec une bière, un cookie avec un café.'],
          ['Proposer de le remplacer par', 'La borne propose une version plus grande ou meilleure : « Et si on passait en 50 cl ? ». Si le client accepte, l’article est remplacé dans le panier.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Où servir', chapeau: 'Après le panier, la borne demande « Où êtes-vous ? ». Les zones se règlent dans le bloc Où servir, du même onglet.',
      blocs: [
        { capture: { nom: 'zones', faire: ``, zone: BLOC('Où servir'), marge: 12,
            marques: [{ cible: '[data-f="zs.1.nom"]', n: 1 }, { cible: '[data-f="zs.1.n"]', n: 2 }, { cible: '[data-a="zsRetrait"][data-i="0"]', n: 3 }] },
          reperes: [[1, 'La zone', '(nom, sous-titre, emoji).'], [2, 'Numéros :', '20 pour les pistes = le client choisit sa piste de 1 à 20. 0 = pas de numéro.'],
            [3, 'Comptoir :', 'la commande se récupère au bar ; le client est appelé par son prénom.']] },
        { encadre: ['Sur une tablette de piste, la zone « Piste » et son numéro sont déjà choisis. Sur le téléphone (QR code d’une piste), aussi.'], titre: 'Bon à savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Suivre les commandes', chapeau: 'Bar › onglet Commandes. Les commandes des bornes, des tablettes et des téléphones, en direct.',
      blocs: [
        { capture: { nom: 'commandes', taille: [1000, 1000], faire: `${COMMANDES} ${vers('bar', `S.sousO.bar = 'commandes'; S.filtreBar = 'tous';`)}`, attente: 800,
            zone: [{ css: '.chips', txt: 'État' }, { css: 'section.bloc', txt: 'Commandes' }], marge: 12, hmax: 700,
            marques: [{ cible: '[data-f="rechBar"]', n: 1 }, { cible: '[data-a="filtreBar"][data-k="soucis"]', n: 2 }, { cible: { css: 'tr.clic', i: 0 }, n: 3, marge: 1 }] },
          reperes: [[1, 'Rechercher :', 'un nom, une piste, un numéro, un article.'], [2, 'À traiter :', 'les commandes qui demandent une action (chapitre 9). Le nombre s’affiche en rouge.'], [3, 'Une commande :', 'un clic ouvre son détail.']] },
        { options: 'Les états d’une commande', deux: true, lignes: [
          ['Validée', 'Payée et envoyée en caisse : le bar la prépare.'],
          ['Paiement en cours', 'Le client est en train de payer, ou est parti en ayant payé une partie.'],
          ['Attente espèces', 'Espèces choisies sur une tablette sans monnayeur : le client doit la payer sur une grande borne dans les 10 minutes.'],
          ['À finaliser', 'Passée sans réseau : le client la paiera avec son numéro.'],
          ['Annulée', 'Abandonnée avant le paiement, ou pas payée à temps.']] }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Les commandes à traiter', chapeau: 'Une commande payée en partie dont le client est parti, un paiement jamais terminé : l’accueil décide quoi en faire.',
      blocs: [
        { capture: { nom: 'a-traiter', faire: `S.filtreBar = 'soucis'; S.cmdBar = window.__docCmd.partielle; D.rendre(); window.scrollTo(0, 0);`, attente: 700,
            zone: '.tiroir', marge: 0, hmax: 540,
            marques: [{ cible: { css: '.tiroir div', txt: 'Payée en partie' }, n: 1, marge: 2 }, { cible: '[data-a="barEncaisser"]', n: 2 }, { cible: '[data-a="barAbandon"]', n: 3, cote: 'droite' }] },
          reperes: [[1, 'Ce qui s’est passé :', 'ce qui a été payé, ce qui reste.'], [2, '… encaissés au comptoir :', 'le client règle le reste à l’accueil ; la commande est validée et part en caisse.'],
            [3, 'Classer abandonnée :', 'le reste ne sera pas payé ; la commande sort de la liste « À traiter ».']] },
        { encadre: ['Une commande « Attente espèces » se règle d’elle-même : soit le client la paie sur une grande borne, soit elle est annulée au bout de 10 minutes. Rien à faire.'], titre: 'À savoir' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Le module Bar sur la borne', chapeau: 'Les textes et l’apparence des pages du bar se règlent comme pour toute activité : Sandbox › Activités du centre › Bar › bloc Module borne.',
      blocs: [
        { tableau: [['Page', 'Ce qu’on y règle'],
          ['Accueil', 'Le nom, le sous-titre et la photo de la tuile.'],
          ['Carte, Panier', 'Le style de la page (disposition des articles).'],
          ['Paiement', '« Payer une partie » proposé ou non (sinon carte ou espèces tout de suite).'],
          ['Fin', 'Le grand mot (« Strike ! »), le bouton, le temps avant le retour à l’accueil.'],
          ['Espèces au comptoir', 'Le message de l’écran affiché par une tablette sans monnayeur, et le délai avant annulation (10 minutes).']] },
        { encadre: ['Le détail des bornes (monnayeur, téléphone, hors ligne) est dans le guide **Les bornes**.'], titre: 'Pour aller plus loin', genre: 'renvoi' }
      ] },

    /* ------------------------------------------------------------------ */
    { titre: 'Si quelque chose ne va pas', chapeau: 'Les cas les plus courants, et où regarder.',
      blocs: [
        { tableau: [['Ce que vous voyez', 'À vérifier'],
          ['Un article n’apparaît pas sur une borne', 'Il est en stock ; l’espace de la borne est coché (hall, pistes, bar) ; son heure « disponible à partir de » est passée ; sa catégorie a au moins un article.'],
          ['Une commande payée n’arrive pas en caisse', 'Le code caisse de chaque article (fiche de l’article). L’onglet Caisse Trivec montre les derniers échanges.'],
          ['Le client ne peut pas valider son panier', 'Une option obligatoire n’est pas choisie, ou l’article contient de l’alcool (case « plus de 18 ans »).'],
          ['Une vente additionnelle ne s’affiche pas', 'La règle est active ; l’article proposé est en stock et vendu dans cet espace.'],
          ['Une commande reste « Paiement en cours »', 'Le client est parti : voir les commandes à traiter (chapitre 9).']] }
      ] }
  ]
};
