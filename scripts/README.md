# 📁 Scripts

Ce dossier contient les scripts utilitaires pour le développement et la release de Nartya.

## 📂 Fichiers

### `release.js`

Script interactif pour créer une nouvelle release.

**Usage :**

```bash
pnpm run release
```

**Fonctionnalités :**

- Sélection du type de version (patch/minor/major)
- Bump automatique de la version dans `package.json`
- Création d'un tag Git
- Push automatique vers GitHub
- Déclenchement du workflow de release

### `check-release.js`

Script de vérification des fichiers de release.

**Usage :**

```bash
pnpm run check-release
```

**Vérifications :**

- Présence de `latest.yml` dans `dist/`
- Présence des fichiers `.exe` et `.blockmap`
- Validation du format de `latest.yml`

## 🔄 Workflow de Release

1. **Développement**

   ```bash
   pnpm dev
   ```

2. **Build local**

   ```bash
   pnpm build
   ```

3. **Vérification**

   ```bash
   pnpm run check-release
   ```

4. **Release**

   ```bash
   # Pour une correction de bug (1.0.x)
   pnpm run release:patch

   # Pour une nouvelle fonctionnalité (1.x.0)
   pnpm run release:minor

   # Pour un changement majeur (x.0.0)
   pnpm run release:major
   ```

5. **GitHub Actions** se charge automatiquement de :
   - Builder l'application
   - Créer la release GitHub
   - Uploader les artifacts

## 📝 Notes

- Les scripts utilisent Node.js natif (pas de dépendances externes)
- Les releases sont automatiquement créées via GitHub Actions
- Le système d'auto-update utilise `latest.yml` pour détecter les nouvelles versions
