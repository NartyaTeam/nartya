# Guide de Développement - Nartya

## 🎯 Gestion des données (Dev vs Prod)

### Problème résolu

Les fichiers JSON de progression de visionnage (`video-progress.json`, `watch-history.json`) sont inclus dans le build Electron. Ce système empêche vos données personnelles de développement d'être distribuées dans l'exécutable final.

### Solution mise en place

#### Structure des fichiers

```
src/data/
├── video-progress.json        # Production (vide, inclus dans le build)
├── video-progress.dev.json    # Développement (vos données, ignoré par Git)
├── watch-history.json         # Production (vide, inclus dans le build)
└── watch-history.dev.json     # Développement (vos données, ignoré par Git)
```

#### Comment ça marche ?

L'application détecte automatiquement le mode :

- **Mode développement** (`--dev`) → Utilise les fichiers `*.dev.json`
- **Mode production** (défaut) → Utilise les fichiers `*.json` (vides)

Le choix du fichier se fait au démarrage dans les classes `VideoProgressManager` et `WatchHistoryManager`.

### 🔄 Utilisation

#### Développement

```bash
# Lancer en mode développement (utilise automatiquement les .dev.json)
npm run dev
```

#### Production / Test du build

```bash
# Lancer en mode production (utilise les .json vides)
npm start

# Créer le build
npm run build
```

### 🔒 Sécurité et Git

- ✅ Les fichiers `*.dev.json` sont dans `.gitignore`
- ✅ Vos données personnelles ne seront jamais commitées
- ✅ Les builds de production incluent uniquement les `*.json` vides
- ✅ Chaque utilisateur démarre avec un historique vierge

### 📦 Ce qui est inclus dans le build

Le build Electron inclut automatiquement :

- ✅ `video-progress.json` (vide)
- ✅ `watch-history.json` (vide)
- ❌ `video-progress.dev.json` (ignoré par Git, non inclus)
- ❌ `watch-history.dev.json` (ignoré par Git, non inclus)

Aucun hook ni script n'est nécessaire ! Le flag `--dev` n'est pas utilisé dans les builds de production.

## 🚀 Commandes principales

```bash
# Développement
npm run dev              # Mode dev avec vos données (flag --dev)
npm start                # Mode production avec données vides

# Build et distribution
npm run build            # Build Windows (données vides automatiquement)

# Autres
npm run scrape          # Scraper les animes
```

## 📝 Notes importantes

1. **Toujours utiliser `npm run dev`** pour le développement avec vos données
2. Les fichiers `*.dev.json` ne sont **jamais commitées** (dans `.gitignore`)
3. Le build de production n'utilise **jamais** le flag `--dev`, donc utilise toujours les fichiers vides
4. Si vous perdez vos données de dev, elles ne sont pas versionnées (faites des backups si nécessaire)

## 🧪 Tester les deux modes

```bash
# Tester avec vos données de dev
npm run dev

# Tester comme en production (données vides)
npm start
```

### Vérifier quel fichier est utilisé

Au démarrage, l'application affiche dans la console :

- `🔧 Mode développement: utilisation de video-progress.dev.json` (mode dev)
- Aucun message = mode production (fichiers standards)
