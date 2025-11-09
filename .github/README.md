# 🤖 GitHub Actions Workflows

Ce dossier contient les workflows automatisés pour Nartya.

## 📋 Workflows Disponibles

### 🚀 Release (`release.yml`)

**Déclenché par :** Push d'un tag `v*.*.*` (ex: `v1.0.1`)

**Ce qu'il fait :**
1. Installe les dépendances
2. Build l'application Windows
3. Crée une release GitHub
4. Upload automatiquement :
   - `Nartya Setup X.X.X.exe`
   - `latest.yml`
   - `Nartya Setup X.X.X.exe.blockmap`

**Comment l'utiliser :**
```bash
pnpm run release:minor
```

**Voir :** `../GITHUB-ACTIONS-RELEASE.md` pour le guide complet

---

## ⚙️ Configuration Requise

### Permissions GitHub Actions

1. Allez dans **Settings** → **Actions** → **General**
2. Sous "Workflow permissions", sélectionnez **"Read and write permissions"**
3. Cochez **"Allow GitHub Actions to create and approve pull requests"**
4. Sauvegardez

Sans ces permissions, le workflow ne pourra pas créer de releases.

---

## 📊 Voir les Workflows

Allez sur : `https://github.com/votre-username/nartya/actions`

Vous verrez tous les workflows en cours et leur historique.

---

## 🔧 Personnalisation

Pour modifier le workflow de release, éditez `release.yml` :

```yaml
# Changer la plateforme de build
runs-on: windows-latest  # ou macos-latest, ubuntu-latest

# Modifier les fichiers uploadés
files: |
  dist/*.exe
  dist/latest.yml
  
# Créer une release en draft
draft: true
```

---

## 💡 Ajouter d'Autres Workflows

Vous pouvez ajouter d'autres workflows dans ce dossier :

- `test.yml` - Tests automatiques sur chaque push
- `lint.yml` - Vérification du code
- `deploy.yml` - Déploiement automatique

Exemple de structure :
```
.github/
├── workflows/
│   ├── release.yml     ← Release automatique
│   ├── test.yml        ← Tests (à créer)
│   └── lint.yml        ← Linting (à créer)
└── README.md           ← Ce fichier
```

---

## 🚨 Dépannage

### Le workflow ne se déclenche pas

- Vérifiez que le tag est au format `v1.0.0` (avec le "v")
- Vérifiez que le tag a bien été poussé : `git push --tags`

### "Permission denied"

- Vérifiez les permissions dans Settings → Actions
- Le token `GITHUB_TOKEN` doit avoir les droits d'écriture

### Le build échoue

- Testez localement : `pnpm run build`
- Vérifiez les logs dans Actions pour voir l'erreur exacte

---

## 📚 Ressources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [electron-builder CI](https://www.electron.build/configuration/publish)

