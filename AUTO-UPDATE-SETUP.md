# 🔄 Configuration des Mises à Jour Automatiques

Ce guide explique comment configurer le système de mises à jour automatiques pour Nartya.

## 📋 Prérequis

1. Un compte GitHub
2. Un repository GitHub pour votre application
3. Un token d'accès GitHub (Personal Access Token)

## 🚀 Configuration

### 1. Créer un Token GitHub

1. Allez sur GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Cliquez sur "Generate new token (classic)"
3. Donnez un nom au token (ex: "Nartya Auto-Update")
4. Sélectionnez les permissions suivantes :
   - `repo` (accès complet au repository)
5. Générez le token et **copiez-le** (vous ne pourrez plus le voir après)

### 2. Configurer le Repository

Dans `package.json`, modifiez la section `publish` :

```json
"publish": {
  "provider": "github",
  "owner": "votre-username-github",
  "repo": "nartya",
  "releaseType": "release"
}
```

Remplacez `votre-username-github` par votre nom d'utilisateur GitHub.

### 3. Configurer le Token

#### Méthode 1 : Variable d'environnement (Recommandé)

Créez un fichier `.env` à la racine du projet :

```bash
GH_TOKEN=votre_token_github_ici
```

**⚠️ N'ajoutez JAMAIS ce fichier au Git !** Ajoutez `.env` dans `.gitignore`.

#### Méthode 2 : Configuration système

Sur Windows :
```powershell
setx GH_TOKEN "votre_token_github_ici"
```

Sur Linux/Mac :
```bash
export GH_TOKEN="votre_token_github_ici"
```

### 4. Build et Publication

#### Build local

```bash
pnpm run build
```

Cela créera les fichiers dans le dossier `dist/`.

#### Publier une release

1. **Créer une release sur GitHub** :
   - Allez sur votre repository GitHub
   - Cliquez sur "Releases" → "Create a new release"
   - Créez un tag (ex: `v1.0.1`)
   - Ajoutez un titre et une description
   - **Uploadez les fichiers** depuis `dist/` :
     - `Nartya Setup X.X.X.exe` (l'installateur)
     - `latest.yml` (fichier de configuration pour l'auto-update)

2. **Publiez la release**

### 5. Tester les Mises à Jour

1. Installez une version antérieure de l'application
2. Lancez l'application
3. Après 3 secondes, elle vérifiera automatiquement les mises à jour
4. Si une mise à jour est disponible, une notification apparaîtra

## 🎯 Workflow de Release

### Étapes recommandées :

1. **Mettre à jour la version** dans `package.json` :
   ```json
   "version": "1.0.1"
   ```

2. **Build l'application** :
   ```bash
   pnpm run build
   ```

3. **Créer une release sur GitHub** avec le tag correspondant (ex: `v1.0.1`)

4. **Uploader les fichiers** :
   - `Nartya Setup 1.0.1.exe`
   - `latest.yml`
   - (Optionnel) `Nartya Setup 1.0.1.exe.blockmap`

5. **Publier la release**

6. Les utilisateurs recevront automatiquement la notification de mise à jour !

## 📝 Notes Importantes

### Versioning

Utilisez le **Semantic Versioning** (semver) :
- `1.0.0` → Version majeure (breaking changes)
- `1.1.0` → Version mineure (nouvelles fonctionnalités)
- `1.0.1` → Patch (corrections de bugs)

### Fichiers Importants

- `latest.yml` : Contient les informations de la dernière version
- `.exe` : L'installateur pour les utilisateurs
- `.exe.blockmap` : Permet les mises à jour différentielles (plus rapides)

### Comportement de l'Auto-Update

1. **Au démarrage** : Vérification automatique après 3 secondes
2. **Notification** : L'utilisateur est informé qu'une mise à jour est disponible
3. **Téléchargement** : L'utilisateur peut télécharger la mise à jour
4. **Installation** : Deux options :
   - Installer immédiatement (redémarre l'app)
   - Installer au prochain démarrage

### Désactiver l'Auto-Update en Dev

L'auto-update est automatiquement désactivé en mode développement :
```bash
pnpm run dev  # Pas de vérification de mise à jour
```

## 🔒 Sécurité

- **Ne commitez JAMAIS** votre token GitHub
- Utilisez des variables d'environnement
- Ajoutez `.env` dans `.gitignore`
- Le token doit avoir uniquement les permissions nécessaires

## 🐛 Dépannage

### "Cannot find latest.yml"

Assurez-vous que `latest.yml` est bien uploadé dans la release GitHub.

### "Update check failed"

Vérifiez :
1. Que le repository est public OU que le token a les bonnes permissions
2. Que la configuration `publish` dans `package.json` est correcte
3. Que la release est bien publiée (pas en draft)

### "Update downloaded but not installing"

L'installation se fait automatiquement à la fermeture de l'application si l'utilisateur a choisi "Installer au prochain démarrage".

## 📚 Ressources

- [Documentation electron-updater](https://www.electron.build/auto-update)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [Semantic Versioning](https://semver.org/)

