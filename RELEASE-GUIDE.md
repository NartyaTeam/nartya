# 📦 Guide de Release - Nartya

Guide complet pour publier une nouvelle version de Nartya de manière professionnelle et cohérente.

---

## 🎯 Workflow Recommandé

### Étape 1 : Préparer les Changements

1. **Assurez-vous que tout est commité** :

   ```bash
   git status
   # Si des fichiers sont modifiés :
   git add .
   git commit -m "feat: description des changements"
   ```

2. **Testez l'application** :
   ```bash
   pnpm run dev
   # Testez toutes les fonctionnalités
   ```

---

### Étape 2 : Choisir le Type de Version

Suivez le **Semantic Versioning (semver)** :

| Type      | Commande                 | Exemple       | Quand l'utiliser                                                               |
| --------- | ------------------------ | ------------- | ------------------------------------------------------------------------------ |
| **Patch** | `pnpm run release:patch` | 1.0.0 → 1.0.1 | 🐛 Corrections de bugs<br>📝 Typos<br>🔧 Petites améliorations                 |
| **Minor** | `pnpm run release:minor` | 1.0.0 → 1.1.0 | ✨ Nouvelles fonctionnalités<br>🎨 Améliorations UI<br>⚡ Optimisations        |
| **Major** | `pnpm run release:major` | 1.0.0 → 2.0.0 | 💥 Breaking changes<br>🔄 Refonte majeure<br>🗑️ Suppression de fonctionnalités |

---

### Étape 3 : Lancer la Release

**Pour un bug fix :**

```bash
pnpm run release:patch
```

**Pour une nouvelle fonctionnalité :**

```bash
pnpm run release:minor
```

**Pour un breaking change :**

```bash
pnpm run release:major
```

**Ce qui se passe automatiquement :**

1. ✅ Version mise à jour dans `package.json`
2. ✅ Commit créé : `v1.0.1`
3. ✅ Tag git créé : `v1.0.1`
4. ✅ Application buildée dans `dist/`
5. ✅ Commit et tags poussés sur GitHub

---

### Étape 4 : Publier sur GitHub

1. **Allez sur GitHub** : `https://github.com/votre-username/nartya/releases`

2. **Cliquez sur "Draft a new release"**

3. **Sélectionnez le tag** qui vient d'être créé (ex: `v1.0.1`)

4. **Remplissez les informations** :

   **Titre :** `Version 1.0.1 - Nom de la release`

   **Description :** Utilisez ce template :

   ```markdown
   ## 🎉 Nouveautés

   - ✨ Ajout du système de rafraîchissement de la base de données
   - 🔄 Système d'auto-update intégré

   ## 🐛 Corrections

   - 🔧 Correction du bug 403 Forbidden
   - 📝 Amélioration des messages d'erreur

   ## 🚀 Améliorations

   - ⚡ Performance du scraper améliorée
   - 🎨 Interface plus fluide

   ## 📦 Installation

   Téléchargez `Nartya-Setup-1.0.1.exe` ci-dessous et lancez l'installateur.

   ## 🔄 Mise à jour

   Si vous avez déjà Nartya installé, l'application vous proposera automatiquement de mettre à jour !
   ```

5. **Uploadez les fichiers** depuis `dist/` :

   - ✅ `Nartya Setup 1.0.1.exe` (l'installateur)
   - ✅ `latest.yml` (fichier de configuration pour l'auto-update)
   - ✅ `Nartya Setup 1.0.1.exe.blockmap` (optionnel, pour les updates différentielles)

6. **Publiez la release** 🎉

---

## 🤖 Workflow Automatisé Complet

### 🚀 Avec GitHub Actions (Recommandé - 100% Automatique)

**Une seule commande, tout est automatique !**

```bash
# Pour un bug fix
pnpm run release:patch

# Pour une nouvelle fonctionnalité
pnpm run release:minor

# Pour un breaking change
pnpm run release:major
```

**C'EST TOUT !** GitHub Actions va :
- ✅ Builder l'application
- ✅ Créer la release
- ✅ Uploader les fichiers automatiquement
- ✅ Publier la release

**Voir le guide complet :** `GITHUB-ACTIONS-RELEASE.md`

### 📦 Sans GitHub Actions (Manuel)

Si vous préférez faire manuellement :

```bash
# 1. Lancer la release
pnpm run release:patch

# 2. Puis aller sur GitHub pour publier la release manuellement
```

---

## 📝 Conventions de Commit (Recommandé)

Utilisez des commits clairs pour générer automatiquement des changelogs :

| Type        | Emoji | Exemple                              | Description                 |
| ----------- | ----- | ------------------------------------ | --------------------------- |
| `feat:`     | ✨    | `feat: ajout du bouton refresh`      | Nouvelle fonctionnalité     |
| `fix:`      | 🐛    | `fix: correction du bug 403`         | Correction de bug           |
| `perf:`     | ⚡    | `perf: optimisation du scraper`      | Amélioration de performance |
| `style:`    | 🎨    | `style: amélioration de l'UI`        | Changements visuels         |
| `refactor:` | ♻️    | `refactor: restructuration du code`  | Refactoring                 |
| `docs:`     | 📝    | `docs: mise à jour du README`        | Documentation               |
| `chore:`    | 🔧    | `chore: mise à jour des dépendances` | Tâches de maintenance       |

**Exemple de workflow :**

```bash
# 1. Faire vos modifications
git add .
git commit -m "feat: ajout du système d'auto-update"

# 2. Faire d'autres modifications
git add .
git commit -m "fix: correction du bug de rafraîchissement"

# 3. Quand vous êtes prêt, lancer la release
pnpm run release:minor  # Car vous avez ajouté une fonctionnalité
```

---

## 🔍 Vérifications Avant Release

**Checklist :**

- [ ] Tous les tests passent
- [ ] L'application fonctionne en mode `dev`
- [ ] Aucune erreur dans la console
- [ ] Les nouvelles fonctionnalités sont testées
- [ ] Le README est à jour
- [ ] Les dépendances sont à jour (`pnpm update`)
- [ ] Pas de fichiers sensibles (tokens, .env) dans le commit

---

## 🚨 En Cas d'Erreur

### Si vous avez oublié quelque chose après avoir lancé `npm version`

**Annuler la version (avant le push) :**

```bash
git reset --hard HEAD~1
git tag -d v1.0.1  # Remplacez par votre version
```

**Puis refaire :**

```bash
# Faites vos corrections
git add .
git commit -m "fix: correction oubliée"

# Relancez la release
pnpm run release:patch
```

### Si vous avez déjà push

**Supprimer le tag distant :**

```bash
git push --delete origin v1.0.1
git tag -d v1.0.1

# Puis refaire la release avec la bonne version
```

---

## 📊 Exemple de Timeline de Release

**Semaine 1-2 : Développement**

```bash
git commit -m "feat: ajout fonctionnalité X"
git commit -m "feat: ajout fonctionnalité Y"
git commit -m "fix: correction bug Z"
```

**Vendredi : Release**

```bash
# 1. Vérifier que tout est OK
pnpm run dev

# 2. Lancer la release
pnpm run release:minor  # v1.0.0 → v1.1.0

# 3. Aller sur GitHub et publier la release avec les fichiers de dist/
```

**Résultat :**

- ✅ Les utilisateurs reçoivent une notification de mise à jour
- ✅ Ils peuvent télécharger et installer la nouvelle version
- ✅ L'historique des versions est propre et cohérent

---

## 🎯 Bonnes Pratiques

1. **Releases régulières** : Publiez souvent (1-2 semaines) plutôt que d'accumuler des changements
2. **Testez avant** : Toujours tester en mode `dev` avant de publier
3. **Changelog clair** : Expliquez clairement ce qui change pour les utilisateurs
4. **Versioning cohérent** : Respectez semver (patch/minor/major)
5. **Backup** : Gardez toujours une copie des anciennes versions au cas où

---

## 🔗 Ressources

- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [electron-builder](https://www.electron.build/)

---

## 💡 Astuce Pro

**Créez un fichier CHANGELOG.md** pour garder une trace de toutes vos versions :

```markdown
# Changelog

## [1.1.0] - 2024-01-15

### Ajouté

- Système de rafraîchissement de la base de données
- Auto-update automatique

### Corrigé

- Bug 403 Forbidden sur certains animes

## [1.0.0] - 2024-01-01

### Ajouté

- Version initiale
- Scraper Anime-Sama
- Lecteur vidéo intégré
```

Mettez-le à jour à chaque release ! 📝
