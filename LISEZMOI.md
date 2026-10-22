# SpaceBowling Engine — tout savoir sur le projet

> Le seul fichier d'infos du projet. Il remplace les anciens `PASSATION-SpaceBowling-Engine.md`,
> `PASSATION-Site-Reservation-Web.md`, `MEMOIRE-SpaceBowling-Engine.md` et `maquettes/sandbox/LISEZMOI.md`.
> Le donner tel quel à une nouvelle conversation ou à un collaborateur. À tenir à jour.
> Dernière mise à jour : **21 octobre 2026**.

Sommaire : 1. Le projet · 2. Règles de travail · 3. Plan du dossier · 4. Où on en est · 5. Décisions prises · 6. En attente · 7. Mode d'emploi · 8. Tests automatiques · 9. Stack cible et références

---

## 1. Le projet

**SpaceBowling Engine** : une plateforme de gestion pour un centre de loisirs multi-activités (bowling, laser game, karaoké, quiz « QuizzBoxing », billard, anniversaires, bar). À terme, un **produit SaaS multi-établissements** : un seul code, chaque centre avec son sous-domaine, sa base et sa configuration. Marque / domaine : **borneprojet.fr**.

- Porté par **Steve** et un collègue, agents d'accueil d'un bowling (Space Bowling), avec un bagage de développeurs. Point de départ : remplacer le système actuel de leur employeur, puis le proposer à son réseau de centres.
- **Avant de coder sérieusement** : reconnaissance écrite de la propriété intellectuelle par l'employeur (art. L113-9, car ils sont salariés « accueil » et non « développeurs ») et création d'une **SAS à deux** (plutôt qu'une auto-entreprise).
- Conditions préparées pour la réunion avec le patron : forfait de développement 55 000 € en 6 jalons ; licence pilote + maintenance 6 000 €/an (corrections, hébergement, sauvegardes, supervision, 12 h d'assistance ; 450 €/jour au-delà) ; commission d'apporteur 30 % la 1re année puis 20 % les années 2 à 5 ; parrainage 15 % puis 8 % pendant 3 ans ; exclusivité 3 ans limitée à son réseau ; tarif public 9 000 € de mise en place + 10 000 €/an. Cible : ~10 centres pour en faire une activité principale.

**L'idée directrice technique : trois surfaces, un seul cerveau.** Le site public, le CRM et les bornes passent par la **même API**. Le point dur est la **cohérence** : une piste ou une salle se vend une seule fois, en temps réel, par le web, une borne ou le comptoir, même quand le wifi d'une borne coupe. Deuxième point dur, la **généricité** : bowling, karaoké, laser, anniversaire sont 4 réglages d'un même modèle (activité = ressources + créneaux + formules + règles).

---

## 2. Règles de travail (à appliquer sans qu'on le redise)

- Répondre en **français**, simplement. Steve n'est pas développeur de métier : expliquer **où cliquer** plutôt que le code.
- Le code est modifié sur le PC puis **renvoyé à la main sur Hostinger**. À la fin de chaque modification : **lister les fichiers à renvoyer** (chemins depuis la racine du site). Ne jamais envoyer le dossier `tests/` ni les fichiers `.md`.
- Quand un JS ou un CSS partagé change, **augmenter son `?v=`** dans toutes les pages qui le chargent, sinon le navigateur garde l'ancienne version. Aujourd'hui :
  - `centre-partage.js?v=49` : `maquettes/e-v2.html`, `maquettes/index.html`, `maquettes/laser/chrono.html`, `borne/index.html`, `bar/index.html`, `resa/index.html` ;
  - `borne.js?v=41` et `borne.css?v=29` : `borne/index.html`, `bar/index.html` ;
  - `resa.js?v=9` et `resa.css?v=7` : `resa/index.html`.
- **Tests** : après chaque ajout, mettre à jour `tests/tests.js`, lancer `python tests/lancer.py` et donner le résultat (voir §8). Quand un test échoue, se demander d'abord si c'est le code ou le test qui a tort.
- Code simple : HTML/CSS/JS sans framework ni compilation, comme le reste. Noms en français, commentaires courts. Pas de nouvelle bibliothèque sans raison forte.
- **Ne jamais supprimer les données de paramétrage** de l'utilisateur (templates, tarifs, carte du bar…) sans qu'il le demande.
- Serveur local : `.claude/launch.json` → « sandbox-locale » (python, port 8765). **Ne pas ouvrir la racine `/`** : c'est le vrai front laser, branché sur le Firebase de production (voir §3).
- Pour regarder la sandbox de Steve quand un souci n'arrive que chez lui : `http://localhost:8765/tests/export.html` › « Télécharger la copie » (fichier `sandbox-export.json` dans Téléchargements).

---

## 3. Plan du dossier

Deux mondes cohabitent dans `LaserGameTest` : **le front laser en production** (à la racine) et **le chantier SpaceBowling Engine** (le reste).

| Où | Quoi | Remarque |
|---|---|---|
| Racine : `index.html`, `script_v2.js`, `style_v2.css`, `mobile-style.css`, `manifest.json`, `service-worker.js`, `favicon.ico`, `logo.png`, `images/`, `laser/chrono.html` | **Le gestionnaire laser game utilisé par l'équipe** (réservations, chronos, anniversaires, plan de table), branché sur le vrai Firebase (`bowlingbackend`) | Production. Ne pas modifier sans le vouloir |
| `functions/`, `firebase.json`, `.firebase/`, `.htaccess` | Cloud Functions et déploiement Firebase du front laser ; règles Apache (Hostinger) | Production |
| `waiterio/` | Page séparée, avec son propre projet Firebase | Non concernée par le chantier |
| `maquettes/e-v2.html` | **Le CRM** (un seul fichier) | Chantier |
| `maquettes/sandbox/centre-partage.js` | **Le moteur partagé** (objet `SB`) : données, règles de créneaux, de prix et de placement, API. Toutes les pages passent par lui | Chantier |
| `maquettes/sandbox/carte-trivec.js` | Import de la carte du bar depuis les exports Trivec (CSV) | Chantier |
| `maquettes/sandbox/qr.js` | **Générateur de QR codes** (norme ISO 18004, niveau M, sans bibliothèque) : le QR code de chaque ticket CE. Chargé par le CRM (`qr.js?v=1`) | Chantier |
| `maquettes/index.html` + `script_v2.js`, `style_v2.css`… + `sandbox/firebase-local.js`, `sandbox/front-activites.js/.css` | **Copie de test du front laser**, reliée au CRM (Firebase remplacé par une version locale) | Chantier |
| `maquettes/laser/chrono.html` | Écran chrono de la copie de test | Chantier |
| `borne/` | **L'application des bornes** (portrait 9:16, tactile) | Chantier |
| `bar/` | **Le bar sur téléphone** (QR code des pistes) : l'application des bornes en mode téléphone | Chantier |
| `resa/` | **Le site de réservation** des clients (PC et mobile) | Chantier |
| `tests/` | Batterie de tests et outil d'export de la sandbox | Jamais envoyé sur Hostinger |
| `docs/` | **Guides utilisateur en PDF** (10 : un Guide général et 9 guides détaillés), refaits automatiquement à partir du vrai CRM : `node docs/source/generer.mjs tous`. Mode d'emploi et « ce que touche chaque guide » : `docs/LISEZMOI.md` | Jamais envoyé sur Hostinger |
| `borne/videos/` | **Vidéos de l'écran de veille** (MP4 portrait 1080 × 1920 : `anniversaires.mp4`, `karaoke.mp4`), à envoyer sur Hostinger avec la borne | Chantier |
| `CONNEXIONS.md` | **Ce qui est branché sur les vraies données et ce qui reste simulé** (écran par écran, avec la route du futur serveur) | Jamais envoyé sur Hostinger |
| `motion/` | **Outil de motion design** (scènes HTML filmées en MP4) : `node motion/generer.mjs <scène>`, voir §7 « Vidéos des bornes » | Jamais envoyé sur Hostinger |

Rangement du 11 octobre 2026 : les doublons inutilisés (`maquettes/functions/`, `maquettes/waiterio/`, `maquettes/firebase.json`, `.firebase`, `.htaccess`, `default.php`), l'ancienne copie du CRM `TestSecret.html` et les anciens fichiers de passation sont rangés, au cas où, dans `Documents\LaserGameTest-archives` (même arborescence).

Ailleurs sur le PC : `Documents\BowlingEngine\projet_initial` = le **préquel** (backend Node/Express + PostgreSQL/Prisma 5.22.0 + Socket.io, `app-borne` React/Vite, `app-admin`, `bot/conqueror_bot.py` qui pilote Conqueror avec pywinauto). Il sert de modèle de structure. Un second chantier de maquettes CRM (« Fil / Comptoir / Registre ») est introuvable sur le PC et n'est plus utile.

---

## 4. Où on en est (21 octobre 2026)

**Fait, dans ce dossier (maquette complète qui tourne dans le navigateur, sans serveur) :**
- **Moteur partagé** : un seul état (localStorage, synchronisé entre onglets) et un seul moteur de disponibilité et de prix pour le CRM, le front, les bornes, le téléphone et le site. Chaque fonction `SB.api.*` porte le nom de sa future route HTTP : passer au vrai serveur = remplacer leur contenu par des `fetch()`.
- **CRM** : planning, activités (capacité, tarifs, créneaux, réglages), générateur de créneaux, calendrier (vacances, fériés), bar (produits, commandes, import Trivec), tickets CE, bornes (parc, catalogue, disposition), clients, comptes et droits, établissement, statistiques, transactions, sandbox des modules de borne.
- **Front employé de test** : planning par salle, chronos, réservations au comptoir, relié au CRM.
- **Bornes** : bar, bowling (sortie vers le bot), toute activité réservable (laser, karaoké, quiz, billard, anniversaire, nouvelles activités), « Finaliser ma commande », mode hors ligne, espèces au comptoir pour les bornes sans monnayeur.
- **Bar sur téléphone** (`bar/?piste=N`).
- **Site de réservation** : toutes les activités, comptes clients, Mon espace, pages légales, paiement simulé.
- **Écran de veille** : l'animation du centre (logo, messages, strike sur une piste en perspective) puis les vidéos et images choisies dans le CRM, borne par borne ; **logo du centre** réglable ; première vidéo de présentation (anniversaires, 12 s).
- **Tickets CE** : chaque code a son vrai QR code (scannable), une fiche dans le CRM ; sur les bornes, le ticket CE est un **moyen de paiement** (toutes les activités et le bar), contrôlé par activité.
- **Tout le CRM lit les vraies données** (21 octobre 2026) : chiffre d'affaires, statistiques, tableau de bord, transactions (dont les encaissements au comptoir), état des bornes (signe de vie de l'application), intégrations, journal des événements, tentatives de tickets CE refusées, exports CSV. Ce qui est branché et ce qui reste simulé : `CONNEXIONS.md`.
- **149 tests automatiques**, tous verts.

**Pas encore fait (le vrai produit) :** serveur et base de données (les données vivent dans le navigateur), vrai paiement (TPE, CashDro, paiement en ligne : tout est simulé), e-mails, connexion sécurisée, multi-établissements, application Android des bornes (Capacitor), flotte de bornes, conformité caisse NF525.

**État du préquel** (roadmap en 16 lots, L0 → L15) : surtout « un seul établissement, sans paiement réel ». En partie faits : L1 socle (API Express + Prisma + Socket.io, il manque le moteur de réservation, les verrous et le multi-tenant), L3 CRM (embryon `app-admin`), L5 bornes (parcours Bar + Bowling en page web), L8 bar (catalogue, panier, Trivec simulé), L9 exploitation, L11 infra (`git push` → Hostinger). Absents : L0 cadrage, L2 design system, L4 site, L6 encaissement, L7 tickets CE, L10 stats, L12 pilote, L13 multi-tenant, L14 flotte, L15 NF525. Un système de login a été ajouté depuis.

---

## 5. Décisions prises (ne pas revenir dessus sans raison)

**Fonctionnement du centre**
- **Bowling** : la borne envoie la commande au bot et les infos au CRM, le bot **tape en caisse**, l'accueil place le groupe sur Conqueror. Le CRM n'a ni plan de pistes ni affectation de piste ; le suivi s'arrête à « tapé en caisse ».
- **Laser, karaoké, quiz** : le CRM gère créneaux et capacité ; le placement fin reste dans le front employé.
- **Pas de pointage à l'accueil** chez Space Bowling : le client valide sur une borne, sinon la réservation est considérée annulée. Le pointage reste une option par activité pour d'autres centres.
- **Pas de publication ni de versions** dans le CRM : tout changement est en direct.
- Une **commande bar** porte : date, heure, nom (saisi par le client), contenu, lieu (piste, table…), facturation facultative.
- **Une ressource par groupe** : un groupe occupe sa salle, piste ou table pendant sa formule (+ battement de l'activité). Plus de séance partagée. Le groupe reçoit la plus petite ressource libre où il tient, sauf « Au choix du client » (escape game). Les activités sans ressource (anniversaire) gardent un stock de places par créneau.
- Le **fonctionnement d'une activité** se change après sa création sans rien supprimer.
- **Bowling** : aucune durée n'est vendue ; une piste réservée reste occupée environ 11 min par partie et par joueur (réglable). Les joueurs venus sans réservation ne sont pas comptés en ligne.
- **Annulations** : par e-mail seulement (bouton « Annuler » de Mon espace).
- **Tarif étudiant** : au comptoir seulement, sur présentation de la carte.
- **Horaires** : période scolaire lun, mar, jeu, ven 17 h – 1 h ; mer, dim 13 h – 1 h ; sam 13 h – 2 h. Vacances, veilles et fériés : 13 h – 1 h tous les jours, sam 13 h – 2 h.
- **Anniversaires** : laser = 2 × 20 min ; acompte 50 € (borne et site) ; pas d'anniversaire en semaine pendant les vacances (template mer, sam, dim) ; seules les formules du CRM comptent.

**Bornes**
- Bornes tactiles seulement : les écrans de choix tiennent sans défiler, les listes horizontales se glissent au doigt (la souris imite le doigt pour les tests sur PC).
- **Ordre des pages fixe** pour chaque fonctionnement d'activité : une bibliothèque d'étapes réordonnables a été faite puis retirée à la demande de Steve (« la maintenance de ça va être horrible »). Ne pas la remettre. Une page vide est sautée.
- Chaque page de module a un **Style de la page** (1 = d'origine, 2 et 3 = variantes CSS `st-2`, `st-3`).
- La page **Formule** s'affiche toujours, même avec une seule formule. Le **badge** d'une formule n'apparaît que sur sa carte de formule (pas sur les tuiles ni les salles).
- **« Payer une partie »** : une option par module (onglet Paiement), cochée par défaut.
- **Espèces sans monnayeur** (tablettes des pistes, téléphone) : la commande bar est mise de côté et payée sur une grande borne avec son numéro ; annulée après 10 minutes.
- Une borne avec **un seul module** et sans « Finaliser » ouvre directement le module.
- **Tickets CE au paiement seulement** (choix de Steve, 14 octobre 2026) : plus d'encadré au récapitulatif (une ligne prévient), une tuile « Ticket CE ou code promo » à côté de la carte et des espèces, aussi après « Payer une partie ». Un code ne sert que pour l'activité de son lot. Le site garde son bloc au récapitulatif.

**Site de réservation**
- Les mêmes pages que la borne pour chaque activité ; seul le paiement change. Bowling en ligne : formule et joueurs, jour et heure, prénoms et barrières **obligatoires**, récapitulatif. Le jour d'abord est un réglage par module (par défaut pour le bowling).
- Règles du site **séparées** de celles des bornes (onglet « Site web » du module ; vide = règle des bornes). Paiement en ligne par activité : rien (par défaut), acompte ou total.
- **Compte client obligatoire**. Version simple voulue par Steve : **mot de passe en clair, visible et modifiable dans le CRM**. Le vrai login sécurisé et les e-mails viendront avec le serveur : ne pas « corriger » sans qu'il le demande.
- Formules anniversaire : roue 3D ou cartes (réglage) ; sur PC, le détail est à côté de la roue, à **taille fixe** ; sur mobile, une fiche s'ouvre avant de choisir.
- Le site doit avoir « de la vie » : thème spatial, animations, confettis.

**Design**
- Thème clair, autour du logo Space Bowling ; nav marine, fond crème uni (pas de quadrillage), titres Barlow Semi Condensed. S'éloigner le plus possible du look « généré par IA ».
- Le CRM est surtout utilisé par l'accueil, sur un PC au comptoir. Il doit être une **sandbox** où le gérant règle tout lui-même, et se copier d'un centre à l'autre ; à terme, un centre ajoute un jeu sans l'équipe.

---

## 6. En attente (ne pas construire avant que Steve le demande)

- **Paiement en ligne** : prestataire pas encore choisi (Stripe, PayPlug, SumUp, banque…). Tout reste simulé.
- **E-mails de confirmation** : plus tard, prestataire bon marché ; SMS probablement pas (payants).
- **Disposition des tuiles d'accueil** : seulement l'ordre pour l'instant ; des « styles de disposition » (tailles, tuile en vedette…) viendront par borne et pour le site.
- **Serveur et adresse publique** : on reste en local pour l'instant (`resa.spacebowling.fr` à rebrancher plus tard).
- **Anniversaires qui bloquent** les créneaux karaoké et laser : à régler plus tard.
- **QR codes des pistes** à imprimer : pas de page dédiée (n'importe quel générateur, adresse du site + `/bar/?piste=N`).
- Côté produit (roadmap) : trancher le L0 (matériel TPE, scoring des pistes, nombre de sites visés), faire les essais matériels (TPE, Android en mode kiosque), figer le contrat d'API, lancer L1 et L13 ensemble, sécuriser la PI et la SAS.

---

## 7. Mode d'emploi

### Ouvrir la sandbox
- Lancer le serveur local, puis ouvrir dans **le même navigateur** : `http://localhost:8765/maquettes/e-v2.html` (CRM), `maquettes/index.html` (front employé), `borne/index.html?borne=K-01`, `resa/index.html`, `bar/?piste=7`. Les données vivent dans ce navigateur : un autre PC ou navigateur a sa propre sandbox.
- Ouvrir le CRM une première fois : il crée les données partagées. Pas de connexion Google : un compte « Sandbox » administrateur est ouvert automatiquement sur le front.

### Front employé (copie de test)
- **Deux lignes d'onglets** : *Activités* et *Anniversaires* en haut ; dessous, une activité par onglet (construits depuis le CRM) ; sous *Anniversaires* : *Fiches anniversaire* et *Plan de table* (ceux de la v1).
- **La journée entière** : une ligne par créneau, une colonne par salle ; la ligne des chronos reste collée en haut. Beaucoup de salles : le tableau défile de côté.
- **Clic sur une case libre** : réservation sur ce créneau et cette salle. **« Fermer »** dans une case : la salle est fermée sur ce créneau (le site suit aussitôt ; *Rouvrir* sur la case). **Clic sur une heure** : ce que voient le site, les bornes et le comptoir ; retirer du site seulement, ou fermer partout.
- Sur chaque réservation : *Monté* (propose de lancer le chrono), *Payé*, modifier, supprimer ; glisser-déposer vers une autre case.
- **Chronos rapides automatiques** : les deux premières formules de l'activité, moins 2 minutes (karaoké 30 min et 1 h → 28′ et 58′ ; laser 20 et 30 min → 18′ et 28′ ; une seule formule d'1 h → 58′). *Monté* lance la durée de la formule moins 2 minutes.
- `maquettes/laser/chrono.html` : les chronos en cours de toutes les salles, en grille.
- Bouton **Réserver comme sur le site** (bandeau du haut) : outil de test qui réserve comme un client en ligne.

**Ce qui est relié**

| Dans le CRM | Sur le front |
|---|---|
| Nouvelle activité | Un onglet de plus, une colonne et un chrono par salle. Réservable au comptoir tout de suite (heures comptoir par défaut) |
| Durée, ajout ou suppression d'une formule | Les boutons de chrono rapides changent |
| Générateur de créneaux | Les lignes suivent les créneaux générés |
| Fermer / rouvrir un créneau | « Fermé partout » |
| Salle hors service (Capacité) | Cases « Hors service », chrono grisé |
| Activité › Réglages › « Front employé » | Afficher ou retirer l'activité du front |
| Encaisser une réservation | « Payé » sur le front |

| Sur le front | Dans le CRM et sur le site |
|---|---|
| Réserver au comptoir | La réservation apparaît partout ; les créneaux qu'elle bloque quittent le site (annoncé avant de valider) |
| Glisser une réservation | Placement et places en ligne recalculés |
| « Fermer » une case / clic sur une heure | Le site retire ou réduit le créneau |
| Lancer un chrono | Widget « Salles en direct » du CRM et écran chrono ; la réservation passe « arrivée » |

Pour vérifier la règle « réservé sur place, indisponible en ligne » : front, onglet Karaoké, réserver une case dans environ une heure ; le message dit quels créneaux quittent le site ; « Réserver comme sur le site » sur le même créneau est refusé ; le CRM affiche les mêmes créneaux indisponibles.

### Activités, tarifs et créneaux (CRM)
- **Prix** : activité › Tarifs. Règles par jours (dont veilles et fériés), heures (une plage peut passer minuit : 17:00 → 02:00), taille du groupe, « vacances scolaires » et/ou « veilles et fériés », « hors vacances », « hors veilles et fériés ». La règle la plus précise l'emporte. Une formule peut être « vendue seulement aux jours et heures de ses règles » (ex. 2 + 1).
- **Templates de créneaux** : Générateur de créneaux › Templates (une semaine type faite de règles qui se cumulent), puis Générer (template + période). Un dernier créneau plus tôt que le premier passe minuit (« 24:00 », « 25:00 » sur la même journée d'exploitation). Avec 2 salles ou plus, chaque règle vise « Toutes les salles » ou certaines.
- **Salles par formule** (Tarifs, à côté de la durée) : une formule ne se vend que dans ses salles ; c'est ainsi qu'on donne à chaque salle sa durée et son prix (escape game). Une nouvelle activité se met d'elle-même en **Automatique** (Capacité › Règles de capacité) ; « Au choix du client » ajoute une page Salle sur la borne et le site.
- **Grille par salle** : activité › Créneaux (et la frise du Planning). Une ligne par salle, une colonne par créneau ; clic sur une case libre = fermer cette salle à cette heure (blocage vu aussitôt partout), clic sur « fermée » = rouvrir. Alerte « À régler » quand l'activité ne peut pas se réserver à l'avance (aucun créneau à venir, formule disparue, formule proposée nulle part), avec « Ouvrir le template ». Renommer une formule renomme aussi ses templates et ses créneaux.
- **Calendrier** : Paramétrage › Calendrier. Vacances de la zone du centre (zone C par défaut) reçues de l'API de l'Éducation nationale, revérifiées chaque semaine ; fériés calculés avec leurs veilles.
- **Bowling** : Capacité › « Minutes par partie et par joueur » (11 par défaut).
- **Décaler une réservation** : fiche « Commande #… » d'une réservation à venir › **Changer le jour ou l'heure** › jour › une des heures proposées › Déplacer. Toutes les activités ; le prix convenu et ce qui est payé ne changent pas. Droit : « Voir le planning et pointer les arrivées ».
- **Établissement** (Paramétrage › Établissement) : nom, raison sociale, adresse, téléphone, e-mail, SIRET, médiateur, hébergeur, horaires. Ils remplissent les pages légales du site, l'horaire du jour et l'e-mail du bouton « Annuler ».

### Bar (CRM)
- **Produits** : catégories et sous-catégories (renommer suit partout), « Nouvel article » (créé hors stock), fiche (photo, allergènes, alcool, options, code caisse), « Retirer de la carte » (deux clics). Une catégorie sans article n'apparaît pas sur les bornes.
- **Carte réelle** : Bar › Produits › « Importer depuis Trivec (CSV) » (exports produits et catégories). Rangement et options déduites : en tête du code d'import (`RANGEMENT_TRIVEC`).
- **Sur les bornes** : visuels des catégories, ventes additionnelles, zones de service (bar, pistes, tables…).
- **Commandes** : les vraies commandes des bornes et téléphones. Le badge compte celles **à traiter** (payée en partie, paiement jamais terminé depuis 15 min, payée sans être validée) : « … encaissés au comptoir » ou « Classer abandonnée ». « Attente espèces » = espèces choisies sur une borne sans monnayeur.

### Bornes (`borne/index.html?borne=K-01`, ou « Ouvrir l'appli » dans Gestion des bornes)
- Portrait 9:16. Dans Chrome : F12, barre d'appareil (Ctrl+Maj+M), 1080 × 1920.
- **Gestion des bornes › Catalogue des bornes** : une case cochée = un module sur cette borne, plus la colonne **Finaliser la commande**. Une borne avec un seul module et sans « Finaliser » ouvre directement le module. **Disposition de l'accueil** : ordre des tuiles par borne et pour le site.
- **Gestion des bornes › Parc** : interrupteur **Espèces (CashDro)** par borne (par défaut : oui, sauf les tablettes des pistes).
- **Personnaliser un module** : CRM › Sandbox › l'activité. Onglets rangés en « Pages affichées, dans l'ordre », « Règles de réservation » (Bornes, Site web) et « Apparence » (ambiance). Textes, options, **Style de la page**, couleur, fond, décors. À droite, la vraie borne en aperçu, mise à jour à chaque frappe. Le schéma (champs et valeurs par défaut) est dans `centre-partage.js` (`SB.api.modules`).
- **Bar** : carte, panier, prénom obligatoire, âge si alcool, « Où êtes-vous ? », paiement. Pages réglables : Accueil, Carte, Panier, Paiement, Fin, Espèces au comptoir.
- **Bowling** : joueurs et formule → nom du groupe, prénoms, barrières → récapitulatif → paiement (carte, espèces ou ticket CE) → sortie bot et réservation « tapé en caisse ». Codes de test : CRM › Tickets CE / QR codes › Liste des codes.
- **Activités réservables** (laser, karaoké, quiz, billard, anniversaire, toute nouvelle activité) : pages dans l'ordre du fonctionnement (ex. laser : Formule, Participants, Jour et heure, Informations, Récapitulatif ; anniversaire : Âge, Formule, Jour et heure, Options, Informations, Récapitulatif). Règles (onglet Bornes) : délai minimum (anniversaire 72 h, quiz 2 h), horizon, tout payer ou acompte. La place est gardée dès le paiement et rendue si le client abandonne.
- **Paiement** : « Tout payer / Payer une partie » (option par module, onglet Paiement ; décochée = carte ou espèces tout de suite). Simulé avec les boutons « Mode test » (Accepté / Refusé, pièces et billets).
- **Espèces sans monnayeur** : la commande passe « Attente espèces », la borne montre le numéro en gros (10 à 15 s). Le client paie sur une grande borne : « Finaliser ma commande » › numéro › Espèces. Pas payée dans les 10 minutes : annulée (le CRM ouvert s'en charge ; « Finaliser » refuse un numéro expiré). Réglages : Sandbox › Bar › Fin et Espèces au comptoir.
- **Finaliser ma commande** : numéro d'une commande de borne (hors ligne, espèces) ou d'une **réservation bowling du jour** pas soldée (site, comptoir) : la borne reprend le groupe, les prénoms et barrières, déduit l'acompte, encaisse le reste.
- **Sans réseau** (test : Ctrl+Alt+H sur la borne) : commande enregistrée avec un numéro de secours (9BBNNN), payée plus tard avec « Finaliser ».
- **Écran de veille** : CRM › Paramétrage › Paramètres de diffusion › Écran de veille. L'**animation du centre** passe toujours en premier (durée réglable, 20 s par défaut), puis chaque vidéo ou image de la liste, puis l'animation revient. Ajouter : « Vidéo » / « Image » (fichier du PC, rangé dans ce navigateur : IndexedDB `sbx:medias`, `SB.api.medias`) ou « Par adresse » (fichier du site, depuis la racine, ex. `borne/videos/anniversaires.mp4`). Durée 0 = la vidéo passe jusqu'au bout ; une image reste 8 s. **Écran de veille par borne** : une ligne par borne, une colonne par diapositive (case décochée = la borne ne la montre pas ; l'écran de préparation n'a pas de veille). L'ancien champ « Vidéo de veille (MP4) » est remplacé par cette liste (repris automatiquement s'il était rempli).
- **Logo du centre** : Paramètres de diffusion › Logo du centre (PNG/WebP transparent, réduit à 800 px) ; bornes, site et CRM le prennent aussitôt. « Remettre le logo d'origine » annule.

### Tickets CE et QR codes
- **CRM › Tickets CE / QR codes › Liste des codes** : un clic sur une ligne ouvre la **fiche du code** (volet à droite) : son QR code, copier le code, télécharger le QR code (PNG 600 px), imprimer le ticket, organisme, contenu, « Valable pour », valeur, validité, lot, utilisation, Annuler / Réactiver.
- **Chaque code a son propre QR code**, calculé à partir de son texte par `maquettes/sandbox/qr.js` (rien à stocker) ; il contient le code tel quel : un téléphone ou la scannette (mode clavier) le lit. Vérifié avec un vrai lecteur (OpenCV) sur les versions 1 à 6.
- **Créer un lot** : le contenu se choisit parmi toutes les formules de toutes les activités du CRM, plus « −5 € sur une activité » (partout) et « Boisson offerte » (bar). Le lot retient son activité (`lot.act`, `'*'` = partout) : un code n'est accepté que là, même si l'activité est renommée (les anciens lots sans `act` se comparent au nom).
- **Sur la borne** : au paiement, tuile « Ticket CE ou code promo » → écran « Scannez votre ticket » (lecteur ou saisie, plusieurs tickets) → « Valider » : `SB.api.bar.payerCodes(num, codes)` vérifie et consomme tout d'un coup ; la valeur couvre au plus ce qui reste dû (surplus non rendu, signalé) ; le reste se paie par carte ou espèces. Commande abandonnée sans autre paiement : ses tickets redeviennent libres. Réglage : Sandbox › module › Récapitulatif › « Tickets CE et codes promo acceptés » (au bar : toujours).
- **Sur le site** : bloc « Code promo / Ticket CE » au récapitulatif (inchangé).

### Vidéos des bornes (`motion/`, outil interne)
- Une vidéo = une scène HTML 1080 × 1920 animée en CSS (`motion/scenes/<nom>.html`, avec `motion/kit.css` et `motion/kit.js` : couleurs, ciel, confettis, ballons, lettres animées, volets). Ouverte dans le navigateur, la scène tourne en boucle avec une barre pour choisir l'instant.
- `node motion/generer.mjs anniversaires` : Chrome sans fenêtre fige chaque image (30 par seconde), l'encodeur H.264 de Chrome (WebCodecs) la compresse (7 Mbit/s), le script range le tout dans `borne/videos/<nom>.mp4`. `--apercu` : quelques images clés dans `motion/apercu/`, sans encoder. Rien à installer (pas de ffmpeg sur le PC ; l'encodeur Windows via OpenCV a été écarté : débit non réglable, 62 Mo pour 9 s).
- Règles (voulues par Steve) : **15 s par vidéo** ; le plan qui porte le plus d'informations (formules, salle, etc.) reste à l'écran **au moins 4 s une fois tout affiché**, le temps de lire ; les autres plans vont vite (2 à 3 s). Le bas de l'écran (sous y = 1640) est couvert par « Touchez l'écran pour commencer » ; pas de prix dans les vidéos (elles ne vieillissent pas quand les tarifs changent).
- Faites : **anniversaires** (15 s : « Fête ton anniv' », « Choisis ta formule » avec Bowling + Laser, le goûter compris et les invitations téléchargeables gratuitement, « Réserve ta fête ici »). **karaoke** (15 s, ambiance néon : le micro et l'enseigne « Karaoké », des paroles qui se colorent comme à l'écran, la salle privée jusqu'à 10 personnes en 30 min ou 1 h, « Réserve ta salle ici »). Elles ne sont pas encore dans la veille : Steve les ajoute lui-même.

### Bar sur téléphone (`bar/?piste=7`)
- Pour les clients des pistes qui ne veulent pas utiliser la tablette : le QR code (ou la puce NFC) de la piste ouvre cette adresse.
- C'est le module Bar des bornes (mêmes réglages), sans veille : la carte s'ouvre tout de suite, la piste est déjà choisie.
- Carte bancaire : paiement en ligne (simulé, noté « En ligne »). Espèces : le numéro reste affiché, à payer sur une grande borne. Dans le CRM, ces commandes viennent de « Téléphone ».

### Site de réservation (`resa/index.html`)
- **Accueil** : les activités cochées « Site web » (activité › Réglages › Vente) et pas masquées, avec leur prochaine place libre. Ordre : Disposition de l'accueil (écran « Site web »), sinon Paramètres de diffusion › Boutons de l'accueil (libellé, sous-titre, image).
- **Parcours** : les pages de la borne, dans le même ordre. Bowling : Joueurs et formule → Jour et heure → Prénoms → Récapitulatif.
- **Règles du site** : Sandbox › activité › onglet **Site web** : ordre (formule ou jour d'abord), paiement en ligne (rien / acompte / total), acompte, délai, horizon. Vide = règle des bornes.
- **Compte client** obligatoire (créé à la page Informations) ; **Mon espace** : réservations, coordonnées, « Annuler » (prépare un e-mail). CRM › Centre › **Clients** : fiches, réservations, mot de passe visible et modifiable. Droits : « Voir les comptes clients », « Modifier les comptes clients ».
- **Formules anniversaire** : onglet Formule › « Affichage des formules sur le site » (Roue 3D ou Cartes). Photos : celle de la formule (Tarifs), sinon celle de `resa/img/anniv/` qui correspond à son nom.
- **Paiement** simulé ; la place est gardée pendant le paiement. La réservation arrive dans le CRM avec le canal « Site web ».
- Un jour sans créneau généré ne se vend ni sur les bornes ni sur le site (heures comptoir seulement).
- Pages Infos pratiques, CGV, Mentions légales, Confidentialité : modèles remplis avec l'Établissement, à faire relire (« [à compléter] » là où il manque une info).

### Moteur (`centre-partage.js`), pour qui code
- Données : `localStorage` (clés `sbx:*`), synchro entre onglets (BroadcastChannel). Chaque `SB.api.*` porte en commentaire sa future route (`GET /api/...`).
- À connaître : `api.resa.config(act, canal)` (pages, règles, formules), `api.resa.creneaux(...)`, `api.bar.commander(d)` puis `api.bar.payer(num, d)` (c'est ainsi que bornes et site réservent ; `d.reservation` = `{ formule, salle, j, h, nb, tranche, options, prenoms, groupe, enfant, contact }`), `api.bar.abandonner`, `api.bar.retrouver` (Finaliser), `api.bar.attendreEspeces` / `expirer`, `api.bornes.config(id)` (la borne virtuelle `MOBILE` = téléphone), `api.web.config()`, `api.clients.*`, `api.reservations.*`, `api.modules.schema/val`, `api.tarifs`, `api.reservations.encaisser(id, { montant, moyen })` (encaissement au comptoir → une transaction), `api.bornes.signaler(id, d)` / `api.bornes.vues()` (signe de vie des bornes), `api.journal()` (les 300 derniers événements), `tickets.refus` (codes CE refusés).
- Une réservation : `id`, `num`, `act`, `jour`, `debut` (minutes), `duree`, `formule`, `pers`, `client`, `titre`, `tel`, `email`, `compte`, `blocs` (salle ou piste), `total`, `paye`, `caisse`, `canal`, `src`, `etatV`, `options`, `anniv`, `joueurs`.

### Repartir de zéro
- **Paramétrage › Remise à zéro** : efface créneaux générés, réservations, commandes, paiements, fermetures, chronos ; garde activités, tarifs, templates, calendrier, modules, bornes, carte du bar, lots de tickets CE. Ensuite : regénérer les créneaux.
- **Tout effacer**, paramétrage compris : bouton « Repartir de zéro » du front, ou `e-v2.html?reset-sandbox` (les données de démonstration sont recréées).

### Limites connues
- Les données vivent dans le navigateur : le partage entre postes viendra avec le serveur.
- Tout ce que le CRM affiche vient de la sandbox (voir `CONNEXIONS.md`) ; ce qui reste simulé, c'est le matériel et les services qu'on n'a pas : TPE, monnayeur, paiement en ligne, caisse Trivec, bot Conqueror, e-mails, connexion par compte, actions à distance sur les bornes. Une borne est « en ligne » quand son application est ouverte dans ce navigateur (signe de vie toutes les 20 s).
- Avec beaucoup de salles, la ligne des chronos du front n'est plus collée en haut pendant le défilement.
- Le bouton « chrono sur 2e écran » de la copie de test ouvre `/laser/chrono` (celui de la production).

---

## 8. Tests automatiques

- Lancer : `python tests/lancer.py` (Chrome ou Edge sans fenêtre, résultat dans le terminal, code de sortie 0 si tout est bon). Options : `--suite Borne`, `--test laser`, `--voir`. Ou ouvrir `tests/index.html` sur le serveur local.
- Suites : Moteur, CRM, Borne (dont tablette sans monnayeur et téléphone), Synchronisation, Site web, puis Remise à zéro (en dernier). **149 tests, tous verts** au 21 octobre 2026.
- Sandbox à part : les pages ouvertes par le lanceur travaillent sur les clés `sbx-test:*` ; la vraie sandbox et les onglets ouverts à côté ne voient rien.
- Les pages notent leurs erreurs de chargement dans `window.__erreurs` (petit script en tête de page) : le lanceur les lit.
- À chaque nouvelle fonction : ajouter son test dans `tests/tests.js`, dans la bonne suite.

---

## 9. Stack cible et références

- **Cible SaaS** : monorepo pnpm + Turborepo, TypeScript, NestJS (REST + OpenAPI), PostgreSQL (contrainte `EXCLUDE USING gist` sur `tstzrange` contre les chevauchements), Redis (verrous, pub/sub), BullMQ, WebSocket. Site en Next.js, CRM en React/Vite, bornes Android en Capacitor avec une coque Kotlin pour le TPE (SQLite pour les transactions). UI Tailwind + shadcn.
- **Multi-tenant** : une base par centre sur un cluster partagé, résolution par sous-domaine (`spacebowling.borneprojet.fr`), console éditeur `admin.borneprojet.fr`.
- **Flotte de bornes** : Headwind MDM + Tailscale + scrcpy/RustDesk ; miser sur l'auto-réparation et les actions à distance. Infra visée : 3 VPS Hostinger (prod KVM 4, recette KVM 2, flotte KVM 2).
- **Intégrations** : Conqueror (pistes) piloté par pywinauto, sans API (mode simulation par défaut) ; Trivec (caisse du bar) derrière un adaptateur, en simulation faute d'API ; TPE sur bornes et pistes ; lecteur de codes-barres (mode clavier) pour les tickets CE.
- **Documents du Projet Claude « SpaceBowling-Engine »** : `Roadmap_Projet_Bowling.md` (la roadmap, 16 lots), `Contrat_API_v0.md` (contrat d'API), `CRM_Maquettes_3_directions.md`, `Front_Employe_Sandbox.md`, `Roadmap_Projet_Bornes.md` (archive). Une copie texte de la roadmap est dans `Documents\Roadmap_Projet_Bowling.txt`. Un kit d'audit sécurité (8 oct. 2026) est à relancer avant toute mise en production avec paiement et données clients.
