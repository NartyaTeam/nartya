# Guide de Build - Nartya Beta 1.0.0

## 📋 Pré-requis

- Node.js 18+ installé
- pnpm installé (`npm install -g pnpm`)
- Windows 10/11 (pour le build Windows)

## 🚀 Instructions de Build

### 1. Installation des dépendances

```bash
pnpm install
```

### 2. Build de l'application pour Windows

```bash
pnpm run build:win:beta
```

L'installateur sera généré dans le dossier `dist/` avec le nom :
`Nartya-Setup-1.0.0-beta.1.exe`

## 📦 Configuration du Build

Le build est configuré dans `package.json` avec les paramètres suivants :

### Build Windows (NSIS)

- **Architecture** : x64 uniquement
- **Type d'installateur** : NSIS (avec interface de configuration)
- **Options installateur** :
  - ✅ Choix du répertoire d'installation
  - ✅ Raccourci bureau
  - ✅ Raccourci menu démarrer
  - ❌ Installation machine (utilisateur uniquement)
  - ❌ One-click install (installateur avec options)

### Fichiers exclus du build

- Scraper (`src/scraper/**/*`)
- Fichiers de test (`src/utils/test-*.js`)
- Documentation markdown (`**/*.md`)
- Fichiers git (`.git/**/*`, `.gitignore`)

## 🔍 Test en développement

Pour tester l'application avant le build :

```bash
pnpm run dev
```

ou

```bash
pnpm start
```

## 📊 Informations de version

- **Version** : 1.0.0-beta.1
- **Nom** : Nartya
- **Description** : Application de streaming d'animes VF/VOSTFR
- **Licence** : ISC

## ✨ Fonctionnalités de la Beta 1

### ✅ Implémenté

- Recherche d'animes en temps réel
- Lecture vidéo avec lecteur Plyr
- Support HLS (m3u8)
- Sélection de langue (VF/VOSTFR/VO/VOSTA)
- Sélection de source vidéo
- Navigation entre épisodes
- **Reprise automatique de lecture** avec notification
- Sauvegarde de la progression
- Interface moderne et minimaliste
- Animations fluides
- Page Premium redesignée

### 🚧 À venir

- Téléchargement hors ligne
- Synchronisation multi-appareils
- Thèmes personnalisés
- Statistiques de visionnage

## 📝 Notes importantes

1. **Première exécution** : L'application va créer un fichier `animes.json` et `watch-history.json` dans `src/data/`

2. **Sécurité Windows** : L'installateur n'étant pas signé numériquement, Windows Defender SmartScreen peut afficher un avertissement. C'est normal pour une beta.

3. **Compression** : La compression est définie sur "normal" pour équilibrer taille et vitesse de build.

## 🐛 Rapport de bugs

Pour la beta, les testeurs peuvent reporter les bugs via :

- Issues GitHub
- Email : contact@nartya.app

## 📄 Licence

ISC License - Copyright © 2024 Zeleff
