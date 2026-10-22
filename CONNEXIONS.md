# Ce qui est branché sur les vraies données, et ce qui ne l'est pas encore

> Doc simplifié, fait le **21 octobre 2026**. À lire avec `LISEZMOI.md` (le doc principal). Jamais envoyé sur Hostinger.

**En une phrase :** tous les écrans du CRM lisent maintenant ce qui s'est **vraiment passé dans la sandbox** (ce que les bornes, le téléphone, le site, le front employé et le CRM ont enregistré). Avant, le chiffre d'affaires, les statistiques, l'état des bornes, les intégrations et le journal montraient des chiffres inventés au chargement. Ce qui reste simulé, c'est le **matériel et les services extérieurs qu'on n'a pas encore** (TPE, monnayeur, paiement en ligne, caisse Trivec, bot Conqueror, e-mails, serveur).

---

## 1. Ce qui a été branché, et sur quoi

| Écran du CRM | Avant | Maintenant (d'où viennent les chiffres) | Route du futur serveur |
|---|---|---|---|
| **Tableau de bord › Chiffre d'affaires** | 365 jours tirés au sort | Somme de l'argent encaissé : paiements des bornes, du téléphone, du site et du comptoir (`ventes.paiements`), par jour | `GET /api/stats/ensemble` |
| **Tableau de bord › Clients** | inventé | Personnes des réservations (semaine, mois, année) + nombre de comptes clients du site | `GET /api/stats/ensemble` |
| **Tableau de bord › Canaux (30 jours)** | parts fixes | Argent encaissé par canal : Site web, Bornes, Téléphone, Comptoir | `GET /api/stats/canaux` |
| **Tableau de bord › Top bar (7 jours)** | ventes tirées au sort sur chaque produit | Quantités des commandes bar validées des 7 derniers jours | `GET /api/stats/bar` |
| **Tableau de bord › Affluence attendue** | « moyenne des mercredis sur un an » inventée | Personnes attendues par heure d'après les réservations du jour | `GET /api/planning?date` |
| **Tableau de bord › Tickets CE aujourd'hui** | nombre fixe | Codes validés aujourd'hui, valeur, lots actifs et codes restants | `GET /api/tickets/lots` |
| **Tableau de bord › Bornes** | « T-04 hors ligne depuis 12 min » inventé | Chaque borne ouverte (appli `borne/`) se signale toutes les 20 s : **en ligne** (vue il y a moins de 90 s), **hors ligne depuis N min**, ou **jamais connectée** | `POST /api/bornes/{id}/heartbeat`, `GET /api/bornes` |
| **Tableau de bord › À traiter** | « paiement sans commande 18 € » inventé | Vrais cas : paiement enregistré sans commande ni réservation, borne qui ne se signale plus, commande bowling à reprendre, retards | `GET /api/anomalies` |
| **Tableau de bord › Note du jour** | texte fixe | Une vraie note, enregistrée dans la sandbox (tous les postes du CRM la voient) | `PUT /api/reglages` |
| **Statistiques › Vue d'ensemble** | tout inventé | CA, transactions, panier moyen, participants, courbe par jour ou par mois, répartition et 12 mois par activité | `GET /api/stats/ensemble` |
| **Statistiques › Affluence et occupation** | inventé (« samedi 94 % ») | Heures d'affluence = argent encaissé par jour de semaine × heure ; **taux d'occupation** = temps réservé / (heures d'ouverture de l'Établissement × ressources en service) ; **durée moyenne** = durée des réservations | `GET /api/stats/affluence` |
| **Statistiques › Ventes bar** | inventé | CA bar, commandes validées, panier moyen, part servie à la piste, produits les plus vendus, par catégorie, produits dormants (moins de 5 ventes) | `GET /api/stats/bar` |
| **Statistiques › Canaux et délais** | inventé | CA et transactions par canal ; délai entre la réservation en ligne et la venue (vraies réservations du site) | `GET /api/stats/canaux` |
| **Statistiques › Paiements et clôtures** | inventé | Moyens de paiement (argent par moyen, tickets CE en valeur) ; réconciliation du jour (ce que la sandbox a enregistré) ; une **clôture par jour** calculée (CA TTC, TVA d'après les lignes payées, transactions, annulations) | `GET /api/stats/paiements`, `GET /api/paiements/reconciliation` |
| **Statistiques › Tickets CE** | inventé | Codes validés sur la période, valeur, taux d'utilisation des lots actifs, **tentatives refusées** (vraies) | `GET /api/tickets/lots` |
| **Transactions** | déjà réel pour les bornes | En plus : les **encaissements au comptoir** (bouton « Encaisser » du CRM, « payé » au front employé) et l'acompte de l'outil « Réserver comme sur le site » deviennent des transactions ; filtres Téléphone / Site web / Comptoir ; **export CSV** ; anomalie réelle quand un paiement n'a plus ni commande ni réservation | `POST /api/reservations/{id}/paiements`, `GET /api/bornes/{id}/transactions` |
| **Fiche « Commande # » › Encaisser** | changeait juste un chiffre à l'écran | Passe par le moteur : paiement « Comptoir » enregistré, réservation soldée, événement dans le journal, refus d'un second encaissement | `POST /api/reservations/{id}/paiements` |
| **Gestion des bornes › Parc** | tout inventé (papier 9 %, v2.4.1, TPE ok) | État réel (signe de vie), écran affiché par la borne, commandes en attente sans réseau, **version du moteur chargée par la borne** (un `?v=` oublié se voit ici) ; paiements du jour par borne | `POST /api/bornes/{id}/heartbeat` |
| **Paramétrage › Intégrations** et **Bar › Trivec** | « dernier heartbeat il y a 3 s » inventé | États calculés : Trivec = nombre de commandes journalisées avec leur sortie Trivec ; Conqueror = envois au bot simulés ; Site web = dernière réservation reçue ; Front employé = dernière action (réservation, chrono) ; CashDro = bornes réellement cochées « Monnayeur » | `GET /api/bar/trivec/sante`, etc. |
| **Paramétrage › Journal et sauvegardes** | tableau inventé | **Journal réel** : les 300 derniers événements de la sandbox (réservations, paiements, fermetures, chronos, encaissements…), qui, quand, depuis où ; bouton **« Télécharger une copie de la sandbox »** (le même fichier que `tests/export.html`) | `GET /api/journal` |
| **Tickets CE › Validations du jour › Tentatives refusées** | tableau inventé | Les vrais refus : code inconnu, déjà utilisé, lot clos, mauvaise activité ; venant du site et des bornes | `POST /api/tickets/valider` |
| **Bar › Produits › fiche d'un article** | « 412 vendus sur 30 jours » inventé | Vraies ventes sur 30 jours | `GET /api/stats/bar` |
| **Comptes et accès › Dernière connexion** | « aujourd'hui 14:31 » inventé | Vide (« — ») tant qu'il n'y a pas de vraie connexion par compte | `POST /api/auth/login` |
| **Boutons « Exporter »** (Transactions, Statistiques, Clôture) | affichaient juste un message | Téléchargent un vrai fichier CSV (ouvrable dans Excel) | — |

### Comment le chiffre d'affaires est compté (à savoir)
- **CA = argent réellement encaissé** : chaque paiement accepté (carte, espèces, en ligne, comptoir), rangé au jour et à l'heure du paiement. Les **tickets CE ne sont pas de l'argent** : ils sont comptés à part (nombre, valeur).
- Les anciennes réservations déjà payées avant ce changement (sans ligne de paiement) comptent pour ce qu'elles portent (« payé »), au jour de la réservation. Les nouvelles passent toutes par une transaction.
- Le CA par activité suit la commande (bar, bowling, laser…) ; le CA par canal suit d'où vient le paiement (borne, téléphone, site, comptoir).
- La **TVA** vient des lignes payées (10 % ou 5,5 % au bar, 20 % pour les activités).
- Le **taux d'occupation** utilise les horaires d'ouverture de Paramétrage › Établissement : s'ils sont vides, la case le dit.
- Une borne est « en ligne » quand son application est ouverte dans ce navigateur et s'est signalée il y a moins de 90 s. Les bornes jamais ouvertes sont « jamais connectées » et ne remontent pas en anomalie.

---

## 2. Ce qui reste simulé (pas encore de vraie route ni de matériel)

| Quoi | Aujourd'hui | Ce qu'il faut pour le brancher |
|---|---|---|
| **TPE (carte sur les bornes et tablettes)** | Boutons « Mode test » Accepté / Refusé ; la liste de Paramétrage › Terminaux de paiement est un exemple | Les terminaux (Ingenico / PAX), le SDK ou le protocole Concert, Capacitor sur Android ; route `POST /api/paiements/tpe/callback` |
| **Monnayeur CashDro (espèces)** | Pièces et billets simulés ; « niveau de monnaie » inconnu | L'appareil et son API ; aujourd'hui seul le réglage « Monnayeur / Au comptoir » par borne est réel |
| **Paiement en ligne (site web, téléphone)** | Boutons « simuler accepté / refusé » | Choisir le prestataire (Up2Pay e-Transactions comme le site actuel, Stripe, PayPlug…) ; `POST /api/paiements/en-ligne/webhook` |
| **Caisse Trivec (bar)** | Chaque commande payée garde sa **sortie Trivec** (visible dans la fiche de la commande) mais rien n'est transmis ; le ticket « B-xxxx » est inventé | L'accès à l'API Trivec (`TRIVEC_MODE=reel`), `POST /api/bar/trivec/sync` |
| **Bot Conqueror (bowling)** | La **sortie bot** est construite au vrai format mais reste simulée ; ticket « T-xxxx » inventé ; « Relancer le bot », « à reprendre » : messages seulement | Le bot `conqueror_bot.py` relié au serveur (socket), heartbeat du bot |
| **Actions à distance sur les bornes** (éteindre, redémarrer, tout allumer, appairer, révoquer le secret) | Messages à l'écran seulement ; « éteinte » est un état posé dans le CRM, pas sur la borne | La flotte Android (MDM), `POST /api/bornes/{id}/actions`, `POST /api/bornes/appairage` |
| **Imprimante des bornes (papier)** | « non reliée » | La vraie borne qui remonte son niveau de papier dans le heartbeat |
| **Comptes, rôles, connexion** | Le sélecteur « Voir le CRM en tant que » change le rôle sans mot de passe ; « Nouveau compte », « Mot de passe » : messages ; dernière connexion vide | Le serveur : `POST /api/auth/login`, MFA, `GET /api/utilisateurs` |
| **E-mails** (confirmation, annulation, nouveau compte, envoi des lots CE, reçus) | Aucun envoi ; « Envoyer le reçu » et « Lien de réinitialisation » : messages | Un prestataire (SMTP, Brevo…) ; les modèles |
| **Clôtures signées, archives (NF525), sauvegardes** | Clôture calculée par jour, **sans signature** ; sauvegarde = copie de la sandbox téléchargée | Le serveur : journal inaltérable, signature, sauvegardes automatiques |
| **Réconciliation TPE / monnayeur / prestataire** | Le tableau montre ce que la sandbox a enregistré ; l'écart ne peut pas être calculé | Les relevés des terminaux, du monnayeur et du prestataire |
| **« Rattacher » un paiement sans commande, « Relancer le bot » d'une transaction** | Changent l'écran, rien d'enregistré | `PATCH /api/anomalies` |
| **Export OpenAPI, PDF / CSV d'un lot de tickets CE, « Renvoyer à la caisse », « Tester » une intégration** | Messages seulement | Le serveur |
| **Front employé en production** (racine du dossier) | Branché sur Firebase ; seule la copie de test (`maquettes/index.html`) est reliée à la sandbox | Les routes `/api/front/*` du serveur |
| **Multi-établissements, partage entre postes** | Les données vivent dans le navigateur de chaque PC | Le serveur et la base |

---

## 3. Fichiers touchés

- `maquettes/sandbox/centre-partage.js` (v49) : `api.reservations.encaisser`, `api.bornes.signaler` / `vues`, `api.journal`, journal des événements, refus de tickets CE, paiement « Comptoir » / « En ligne » des réservations.
- `borne/borne.js` (v41) : signe de vie toutes les 20 s.
- `maquettes/e-v2.html` : tous les écrans ci-dessus.
- `maquettes/index.html`, `maquettes/laser/chrono.html`, `borne/index.html`, `bar/index.html`, `resa/index.html` : numéro de version des scripts.
- `tests/tests.js` : 4 tests de plus (149).
