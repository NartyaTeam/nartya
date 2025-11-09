# 📁 Dossier .github

Ce dossier contient les configurations et workflows GitHub pour le projet Nartya.

## 📂 Structure

```
.github/
├── workflows/          # GitHub Actions workflows
│   └── release.yml    # Workflow de release automatique
└── README.md          # Ce fichier
```

## 🔄 Workflows

### `release.yml` - Release Automatique

Ce workflow se déclenche automatiquement lors de la création d'un nouveau tag de version (format `v*.*.*`).

**Déclenchement :**

```bash
# Créer une release patch (1.0.x)
pnpm run release:patch

# Créer une release minor (1.x.0)
pnpm run release:minor

# Créer une release major (x.0.0)
pnpm run release:major
```

**Actions effectuées :**

1. Checkout du code
2. Installation de Node.js 20
3. Installation de pnpm 8
4. Installation des dépendances
5. Build de l'application Windows
6. Création d'une GitHub Release
7. Upload des artifacts (`.exe`, `latest.yml`, `.blockmap`)

**Artifacts générés :**

- `Nartya-Setup-x.x.x.exe` - Installateur Windows
- `latest.yml` - Fichier de métadonnées pour l'auto-update
- `Nartya-Setup-x.x.x.exe.blockmap` - Fichier de delta update

## 🔐 Permissions

Le workflow nécessite les permissions suivantes :

- **Contents: write** - Pour créer des releases et uploader des assets
- **Actions: read** - Pour lire les workflows

Ces permissions sont configurées dans `Settings` → `Actions` → `General` → `Workflow permissions`.

## 📝 Notes

- Le workflow s'exécute sur `windows-latest` pour garantir la compatibilité
- Les releases sont créées automatiquement avec les notes de version générées
- Le système d'auto-update de l'application utilise `latest.yml` pour vérifier les nouvelles versions
