# Les guides PDF du CRM

Ce dossier contient les guides utilisateur en PDF et, dans `source/`, de quoi les refaire.
Les PDF ne sont **pas écrits à la main** : un script ouvre le vrai CRM (et la borne, le site) dans un Chrome invisible, joue les étapes du guide, prend les captures, entoure et numérote ce qu'il faut regarder, puis assemble le PDF. Quand le CRM change, on relance le script et les captures suivent.

Le dossier `docs/` ne s'envoie pas sur Hostinger.

---

## La collection

| PDF | Fichier du guide | Pour qui |
|---|---|---|
| `Guide général du CRM.pdf` | `guides/guide-general.mjs` | Tout le monde : créer et vendre une activité de A à Z, avec des renvois « Pour aller plus loin » vers les guides détaillés |
| `Guide - Prix et horaires.pdf` | `guides/prix-et-horaires.mjs` | Le gérant |
| `Guide - Les types d'activité.pdf` | `guides/types-d-activite.mjs` | Le gérant |
| `Guide - Les bornes.pdf` | `guides/bornes.mjs` | Le gérant, le technicien |
| `Guide - Le bar.pdf` | `guides/bar.mjs` | Le gérant, le bar |
| `Guide - Les anniversaires.pdf` | `guides/anniversaires.mjs` | Le gérant |
| `Guide - Le site et les clients.pdf` | `guides/site-et-clients.mjs` | Le gérant, l'accueil |
| `Guide - Le quotidien à l'accueil.pdf` | `guides/quotidien.mjs` | L'accueil |
| `Guide - Tickets CE et QR codes.pdf` | `guides/tickets-ce.mjs` | Le gérant |
| `Guide - Comptes et accès.pdf` | `guides/comptes-et-acces.mjs` | L'administrateur |

Chaque PDF se termine par la page « La collection des guides » (la liste ci-dessus, dans l'ordre fixé par la clé `ordre` de chaque guide). Le sommaire de chaque PDF est cliquable, et le PDF a des signets.

---

## Refaire les guides

Depuis le dossier `LaserGameTest` :

```
node docs/source/generer.mjs tous
node docs/source/generer.mjs prix-et-horaires
```

`tous` refait toute la collection (environ 5 minutes) ; avec un nom, un seul guide (10 à 80 secondes). Il faut Node 22 ou plus récent et Chrome (ou Edge). Aucune installation, aucune bibliothèque. Un guide ajouté dans `guides/` entre tout seul dans la collection.

Pour relire le résultat page par page sans lecteur PDF (planches de 8 pages en images, dans `source/apercu/pages/`) :

```
node docs/source/apercu.mjs "Guide - Le bar.pdf"
```

**Quand les refaire ?** Dès qu'un écran montré dans un guide change dans le CRM, la borne ou le site (un bouton renommé ou déplacé, un champ ajouté, un nouveau réglage). Le tableau « Ce que touche chaque guide », en bas, dit quel guide regénérer.

---

## Les fichiers

| Fichier | Rôle |
|---|---|
| `source/guides/<nom>.mjs` | **Un guide** : son texte et, pour chaque capture, ce que le CRM doit faire avant la photo. C'est le seul fichier à toucher pour changer un guide. |
| `source/generer.mjs` | Le générateur : captures, entourages numérotés, page du guide, page « collection », impression en PDF. Commun à tous les guides. |
| `source/chrome.mjs` | Petit serveur local + Chrome sans fenêtre (profil temporaire : sandbox neuve, données de démonstration du CRM). |
| `source/guide.css` | La mise en page commune (A4, couverture, sommaire, chapitres, repères orange, tableaux d'options, encadrés). |
| `source/apercu.mjs`, `source/apercu/` | L'aperçu page par page d'un PDF (pdf.js). |
| `source/captures/<nom>/`, `source/<nom>.html` | Les captures et la page du guide avant impression (refaites à chaque génération). |

---

## Le style des guides (demandé par Steve)

- **Un guide utilisateur pas à pas** : simple, visuel, clair, mais complet.
- Ton **humain**, sobre, comme un vrai manuel : phrases courtes, « vous », pas d'emoji, pas de tournures de robot.
- On n'explique **que les éléments utiles** d'un écran, pas chaque bouton.
- Quand un réglage a plusieurs **options** (pointage, attribution, paiement…), un tableau dit ce que fait chaque option et quand la choisir.
- Un **exemple suivi** du début à la fin quand c'est possible (*Réalité virtuelle*, Salle Bleue 4 pers. et Salle Rouge 6 pers., Session 30 min et Session 1 h, dans le Guide général et Prix et horaires).
- Le **Guide général** fait le tour de tout sans entrer dans le détail ; chaque guide détaillé y a un renvoi « Pour aller plus loin » (encadré orange). Un nouveau guide détaillé : ajouter son renvoi dans le Guide général.
- Chaque guide finit par « Si quelque chose ne va pas » : ce qu'on voit, et où regarder.

---

## Écrire ou modifier un guide

Un guide est un objet : `titre`, `surtitre`, `ordre` (place dans la collection), `sousTitre`, `edition`, `fichier` (nom du PDF), `intro` (texte de la page sommaire), puis `sections` (les chapitres, numérotés tout seuls). Chaque section a un `titre`, un `chapeau` facultatif et une liste de `blocs` :

| Bloc | Ce qu'il affiche |
|---|---|
| `{ texte: '…' }` | Un paragraphe. `**gras**` autorisé. |
| `{ etapes: ['…', '…'] }` | Des étapes numérotées « faites ceci ». |
| `{ liste: [...] }` | Une liste à puces. |
| `{ tableau: [[entêtes], [ligne], …] }` | Un tableau. |
| `{ options: 'Titre', lignes: [[option, ce qui se passe, à choisir quand], …], deux: true }` | Le tableau des options d'un réglage (`deux: true` : sans la colonne « à choisir quand »). |
| `{ encadre: ['…'], titre: '…', genre: 'attention' \| 'exemple' \| 'renvoi' }` | Un encadré (bleu par défaut ; `renvoi` = « Pour aller plus loin », orange clair). |
| `{ capture: {…}, reperes: [[n, 'Titre', 'explication'], …], legende: '…' }` | Une capture et ses explications numérotées (jamais coupées entre deux pages). |
| `{ duo: [bloc capture, bloc capture] }` | Deux captures côte à côte (deux écrans de borne, deux gros plans). |

**Une capture** (`capture: {…}`) :

| Clé | Rôle |
|---|---|
| `nom` | Nom du fichier image (unique dans le guide). |
| `page` | La page à ouvrir (`/maquettes/e-v2.html`, `/borne/index.html?borne=K-01&apercu=bar&page=recap`, `/resa/index.html#/laser/rs-formule`, `/bar/index.html?piste=7`). Sans `page` : on reste sur la page de la capture précédente. Le CRM est toujours ouvert une fois au départ (il crée les données de démonstration). |
| `taille` | `[largeur, hauteur]` de l'écran simulé (défaut 1440 × 1000 ; borne `[540, 960]` ; téléphone `[390, 844]`). **Astuce lisibilité** : un écran plus étroit (`[1000, 1000]`, voire `[780, 1000]` pour les règles de prix) replie le CRM, et le texte sort plus gros dans le PDF. |
| `faire` | Ce que la page fait avant la photo, en JavaScript. Outils : `D.clic(cible)`, `D.saisir(cible, valeur)`, `D.choisir(cible, valeur)` (listes), `D.rendre()` (redessiner le CRM). On peut aussi utiliser l'état du CRM (`S.ecran = …`), ses actions (`ACTIONS.…`) et le moteur (`SB.api.…`, par exemple pour créer des commandes d'exemple). |
| `attente` | Pause après `faire`, en ms (défaut 450). |
| `zone` | Ce qu'on photographie : une cible, ou une liste de cibles (le rectangle qui les englobe). Sans `zone` : tout l'écran. `marge` autour (défaut 18 px), `hmax` hauteur maximale, `lmax` largeur maximale. La photo s'élargit toute seule pour ne pas couper les numéros. |
| `marques` | Les entourages : `{ cible, n, cote: 'gauche' \| 'droite' \| 'bas', marge }`. Sans `n` : un cadre sans numéro. Le numéro se pose sur le coin, à l'extérieur du cadre. |
| `petite` | Image affichée plus petite (écrans de borne). |

**Les cibles** (pour `D.clic`, `zone`, `marques`) :
- un sélecteur CSS : `'[data-a="creer"]'`, `'[data-f="nouv.nom"]'` (les boutons du CRM ont presque tous un `data-a`, les champs un `data-f`) ;
- `{ css: 'button', txt: 'Ajouter une activité' }` : le plus petit élément qui contient ce texte (`i` pour le 2e, le 3e…) ;
- `{ dans: cible, css, txt }` : la même chose, mais seulement à l'intérieur d'un élément (une carte, un bloc) ;
- `{ sel: '[data-f="px.nouv.0.nom"]', parent: '.bloc' }` : l'ancêtre d'un champ (le bloc entier, le `label` avec son intitulé…) ;
- une liste de cibles : le rectangle qui les englobe.

Attention : à l'intérieur de guillemets simples `'…'`, `${ID}` n'est pas remplacé. Écrire l'identifiant en clair (`'[data-f="anf.act8.0.emoji"]'`) ou utiliser des accents graves `` `…${ID}…` ``.

---

## Quand ça ne marche pas

Le générateur affiche un journal horodaté : chaque page ouverte, chaque capture, puis les étapes du PDF (page écrite, chargement, polices et images, impression).

| Message | Cause probable |
|---|---|
| `RATÉE <nom> · Introuvable : …` | Une cible n'existe plus (bouton renommé, `data-a` changé). Corriger la cible dans le guide. Le PDF est quand même produit, avec « Capture à venir » à la place. |
| `identifiant inattendu` | Les guides Général et Prix et horaires créent l'exemple *Réalité virtuelle*, qui doit recevoir l'identifiant `act8` (la démo du CRM a 7 activités). Si la démo change, changer `ID` en tête de ces guides (et les `act8` écrits en clair). |
| `délai dépassé : …` | Une étape a mis plus de 30 secondes. Relancer ; si ça se répète, regarder l'étape indiquée. |
| `PDF prêt : … (nouvelle version).pdf` | Le PDF était ouvert dans un lecteur : le nouveau est écrit à côté. Fermer le lecteur, relancer, supprimer la copie. |
| `Guide inconnu` | Le nom ne correspond à aucun fichier de `guides/` (la liste est affichée). |

Une capture mal cadrée ou trop petite : ajuster `zone`, `taille`, `marge` ou `hmax`, relancer, vérifier avec `apercu.mjs`.

---

## Ce que touche chaque guide

Si un de ces écrans change, regénérez le guide indiqué.

| Guide | Écrans montrés |
|---|---|
| **Guide général** | Menu de gauche ; Sandbox › Nouvelle activité (nom, fonctionnement, salles, règles de capacité, battement, formules et prix, pointage et vente) ; Sandbox › Activités du centre (liste, Module borne, règles Bornes et Site web) ; Générateur de créneaux (Templates, Générer, Lots) ; fiche d'une activité (Créneaux, Tarifs › Sur la borne, Réglages › Vente) ; Gestion des bornes › Catalogue ; Paramétrage › Paramètres de diffusion › Boutons de l'accueil ; borne (accueil, page Formule) ; site (accueil) |
| **Prix et horaires** | Fiche d'une activité › Tarifs (règles de prix, vente à certaines heures, salles par formule) ; Paramétrage › Calendrier ; Générateur › Templates (règle « vacances ») et Lots ; fiche › Créneaux (grille par salle, détail des créneaux, alerte « À régler ») |
| **Les types d'activité** | Aperçus de borne des modules Bowling, Laser Game, Karaoké, Billard, Anniversaire, Bar ; Sandbox › bloc Fonctionnement (changer de fonctionnement) |
| **Les bornes** | Gestion des bornes › Parc (carte d'une borne, Toute la flotte), Catalogue, Disposition de l'accueil ; Paramètres de diffusion (écran de veille et par borne, logo du centre) ; Sandbox › Module borne (pages, styles, Ambiance) ; Paramètres de diffusion ; écrans de borne « Espèces au comptoir » et « Finaliser » ; bar sur téléphone |
| **Le bar** | Bar › Produits (catégories, fiche d'un article, options) ; Bar › Sur les bornes (catégories, ventes additionnelles, Où servir) ; Bar › Commandes (liste, commande à traiter) ; borne (carte, panier) |
| **Les anniversaires** | Anniversaire › Tarifs ; Sandbox › Anniversaire › pages Âge, Options, Informations, règles Bornes ; Générateur › template Anniversaires ; site (roue des formules) ; Anniversaire › Planning |
| **Le site et les clients** | Site (accueil, parcours laser, compte, récapitulatif, confirmation, Mon espace) ; Sandbox › Module › Site web ; Paramétrage › Établissement ; Centre › Clients (liste, fiche) |
| **Le quotidien à l'accueil** | Tableau de bord ; Planning (semaine, créneaux du jour) ; fiche « Commande # » (et Changer le jour ou l'heure) ; Transactions |
| **Tickets CE et QR codes** | Tickets CE / QR codes : Lots, Créer un lot, Liste des codes, Suivi |
| **Comptes et accès** | Comptes et accès (comptes, droits par rôle) ; sélecteur « Voir en tant que » et menu d'un rôle |
