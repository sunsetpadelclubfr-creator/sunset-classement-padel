# Sunset Padel Club — V8 GitHub + Netlify

## Fichiers principaux

- `classement-padel-sunset.html` : page publique à intégrer dans ton app.
- `admin-classement-sunset-v8.html` : page privée pour uploader les PDF et publier les JSON.
- `netlify/functions/update-classements.js` : fonction privée qui écrit les JSON dans GitHub.
- `netlify.toml` : indique le dossier des fonctions Netlify.
- `assets/data/classements/` : dossier des JSON lus par la page publique.

## Fichiers mis à jour automatiquement

La fonction met à jour :

- `assets/data/classements/classement_hommes_latest.json`
- `assets/data/classements/classement_femmes_latest.json`
- `assets/data/classements/historique_hommes.json`
- `assets/data/classements/historique_femmes.json`

## Variables Netlify nécessaires

Dans Netlify > ton site > Environment variables, ajoute :

- `ADMIN_SECRET` : mot de passe privé que tu taperas dans la page admin.
- `GITHUB_TOKEN` : token GitHub avec accès au dépôt.
- `GITHUB_OWNER` : ton nom d’utilisateur ou organisation GitHub.
- `GITHUB_REPO` : nom du dépôt.
- `GITHUB_BRANCH` : souvent `main`.
- `DATA_DIR` : optionnel, par défaut `assets/data/classements`.
- `HISTORY_MODE` : optionnel, `top` par défaut.
- `HISTORY_TOP_N` : optionnel, `500` par défaut.

## Historique

Par défaut, `HISTORY_MODE=top` garde l'historique des meilleurs joueurs et des joueurs déjà présents dans l'historique.

Modes possibles :

- `top` : recommandé, historique des top N + anciens suivis.
- `all` : historique de tous les joueurs, mais peut créer un très gros fichier.
- `none` : ne met pas à jour l'historique.

## Utilisation chaque mois

1. Ouvre `admin-classement-sunset-v8.html`.
2. Mets le mois.
3. Ajoute PDF Hommes et/ou PDF Femmes.
4. Clique sur `Envoyer / Générer`.
5. Vérifie les nombres et l’aperçu.
6. Mets ton `ADMIN_SECRET`.
7. Clique sur `Publier vers GitHub`.
8. Netlify redéploie automatiquement si ton site est relié au dépôt GitHub.
