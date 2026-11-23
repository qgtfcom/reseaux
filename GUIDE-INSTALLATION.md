# Pilote Réseaux — guide d'installation (séance 1)

Durée : environ 45 minutes, une seule fois. Compte utilisé : **gq.tfcom@gmail.com** (propriétaire) · GitHub : **qgtfcom**.

Ce que tu vas mettre en place :
1. une **feuille Google Sheets** (tes données) + un **script** (la passerelle qui vérifie qui a le droit) ;
2. un **identifiant Google** (pour la connexion avec ton compte) ;
3. le **site** sur GitHub Pages (le logiciel, installable sur PC et téléphone).

---

## Étape 1 — La feuille et le script (Google)

1. Connecté à gq.tfcom@gmail.com, va sur **sheets.google.com** → **Feuille de calcul vierge**. Nomme-la **Pilote Réseaux – données**.
2. Dans la feuille : menu **Extensions → Apps Script**. Une page « Projet sans titre » s'ouvre.
3. Dans l'éditeur : efface tout le contenu de `Code.gs`, puis colle **tout** le contenu du fichier `apps-script/Code.gs`.
4. À gauche, clique sur la roue **Paramètres du projet**, coche **Afficher le fichier manifeste « appsscript.json » dans l'éditeur**. Reviens sur **Éditeur**, ouvre `appsscript.json`, remplace son contenu par celui du fichier `apps-script/appsscript.json`.
5. Clique sur **Enregistrer** (icône disquette).
6. En haut, choisis la fonction **`setup`** dans la liste déroulante → **Exécuter**. Google demande des autorisations : **Examiner les autorisations** → ton compte → **Paramètres avancés** → **Accéder à … (non sécurisé)** → **Autoriser**. (C'est ton propre script, l'avertissement est normal.)
   Résultat : la feuille contient maintenant les onglets *Sociétés, Posts, Vidéos, Événements, Inspirations, Paramètres, Accès*.
7. Choisis la fonction **`installTriggers`** → **Exécuter** (programme le nettoyage quotidien des posts publiés).

*Le script n'est pas encore utilisable : il lui manque l'identifiant Google (étape 2).*

## Étape 2 — L'identifiant Google (connexion avec ton compte)

1. Va sur **console.cloud.google.com** (même compte). En haut, **Sélectionner un projet → Nouveau projet** → nom : `Pilote Réseaux` → **Créer**.
2. Menu **API et services → Écran de consentement OAuth** (ou « Google Auth Platform »). Type d'utilisateur : **Externe** → renseigne le nom de l'application `Pilote Réseaux`, ton e-mail comme contact → **Enregistrer**. Aucune « portée » à ajouter.
3. Toujours dans cet écran, **Publier l'application** (statut « En production »). Cela évite que la connexion soit limitée à 100 testeurs et qu'elle expire. Aucune vérification Google n'est demandée pour une simple connexion.
4. Menu **Identifiants → Créer des identifiants → ID client OAuth** :
   - Type : **Application Web** · Nom : `Pilote Réseaux Web`
   - **Origines JavaScript autorisées** → Ajouter : `https://qgtfcom.github.io`
   - Laisse « URI de redirection » vide → **Créer**.
5. Copie l'**ID client** (il se termine par `.apps.googleusercontent.com`). Garde-le : c'est la valeur n°1.
6. Retourne dans Apps Script, dans `Code.gs`, repère la fonction `setClientId` et remplace `COLLE_ICI_TON_ID_CLIENT.apps.googleusercontent.com` par ton ID client. **Enregistre**, choisis la fonction **`setClientId`** → **Exécuter**.

## Étape 3 — Publier la passerelle

1. Dans Apps Script : **Déployer → Nouveau déploiement** → roue ⚙ → **Application Web**.
2. Description : `Pilote Réseaux v1` · **Exécuter en tant que : Moi** · **Qui a accès : Tout le monde** → **Déployer**.
3. Copie l'**URL de l'application Web** (elle se termine par `/exec`). C'est la valeur n°2.

> « Tout le monde » signifie seulement que l'adresse est joignable : sans jeton Google d'une adresse listée dans l'onglet **Accès**, le script refuse tout.
> Si tu modifies un jour `Code.gs` : **Déployer → Gérer les déploiements → ✏ → Version : Nouvelle version → Déployer**.

## Étape 4 — Le site sur GitHub Pages

1. Sur **github.com** (compte qgtfcom) : **New repository** → nom : `pilote-reseaux` → **Public** → **Create repository**.
2. Sur la page du dépôt : **uploading an existing file** (ou *Add file → Upload files*). Décompresse `pilote-reseaux-github.zip` sur ton PC, puis **glisse tout le CONTENU du dossier** (index.html, sw.js, manifest.webmanifest, config.js, css, js, icons, apps-script, .nojekyll, README, ce guide) dans la page → **Commit changes**.
   **N'envoie surtout pas le dossier `donnees-a-importer`** (il contient tes consignes internes : il reste sur ton PC).
3. **Settings → Pages** → *Build and deployment* : Source **Deploy from a branch** → Branch **main** / dossier **/(root)** → **Save**.
4. Attends 1 à 2 minutes : le site est à **https://qgtfcom.github.io/pilote-reseaux/**.

## Étape 5 — Premier lancement

1. Ouvre l'adresse du site dans **Chrome ou Edge**. Colle les 2 valeurs (adresse du script `/exec` + ID client) → **Enregistrer**.
2. Clique **Se connecter avec Google** (gq.tfcom@gmail.com). Le bandeau doit passer à **En ligne** et ton e-mail apparaît avec le droit *admin*.
3. Accueil → **Importer mes sociétés et posts** → choisis les 3 fichiers du dossier `donnees-a-importer` (`entreprises.json`, `posts.json`, `videos.json`). Résultat attendu : *2 sociétés, 12 posts, 1 vidéo*.
4. Ouvre la feuille Google : les onglets *Sociétés* et *Posts* se remplissent après la synchronisation.
5. **Sociétés → Modifier → étape 6 « Dossiers »** : pour chaque dossier proposé, clique **Choisir le dossier** et sélectionne-le (pCloud `P:`, Google Drive `G:`…). Clique **Tester** sur un dossier d'enregistrement : un petit fichier test doit apparaître dedans.
6. **Pour que le téléphone et les autres PC se configurent tout seuls** : sur GitHub, ouvre `config.js` → ✏ → colle l'adresse du script et l'ID client entre les guillemets → **Commit**. (Ces deux valeurs ne sont pas des secrets.)
7. **Installer** : dans Chrome/Edge, icône « Installer » dans la barre d'adresse (ou menu ⋮ → *Installer Pilote Réseaux*). Sur iPhone : Partager → *Sur l'écran d'accueil*.

## Ajouter une personne (écran « Accès »)
Accès → **Ajouter une adresse** → e-mail Google, droit (**Administrateur / Modification / Lecture seule**), sociétés autorisées (« Toutes » ou certaines) → **Enregistrer les accès**. Elle ouvre le site, se connecte avec son compte Google et voit uniquement ce qui lui est permis.

## Conservation des posts
Les posts **publiés** sont supprimés automatiquement **30 jours après leur publication** (chaque nuit, 3 h). Réglable dans **Réglages**. Les posts non publiés ne sont jamais supprimés automatiquement.

## IA optionnelle
- **Copier-coller** (par défaut) : le logiciel prépare le texte complet (société + règles + retours) à coller dans ton chat Claude.
- **Clé API** : à saisir dans Réglages → IA ; elle reste sur cet ordinateur.
- **Ollama** (local, gratuit) : installe Ollama (ollama.com) et télécharge un modèle (`ollama pull llama3.1`). Pour autoriser le site, crée la variable d'environnement `OLLAMA_ORIGINS` = `https://qgtfcom.github.io` puis relance Ollama.

## En cas de problème
| Message | Cause probable |
|---|---|
| « Jeton émis pour une autre application » | L'ID client du script (`setClientId`) ≠ celui saisi dans le site |
| « CLIENT_ID non configuré » | `setClientId` n'a pas été exécuté |
| « n'est pas autorisée » | L'e-mail n'est pas dans l'onglet Accès (le propriétaire est automatique) |
| Pas de bouton Google | L'origine `https://qgtfcom.github.io` manque dans l'ID client (étape 2.4), ou page ouverte hors connexion |
| « Passerelle injoignable » | Déploiement non publié en « Tout le monde », ou mauvaise URL (doit finir par `/exec`) |
| Dossier à « choisir » à chaque fois | Normal sur un nouvel ordinateur ; sur le même PC, clique le bouton pour réautoriser |
