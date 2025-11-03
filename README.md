# Nartya

Application Electron moderne pour regarder des animes gratuitement avec une interface élégante et sans publicité.

## 🏗️ Structure du projet

```
src/
├── electron/          # Code Electron (main, preload)
│   ├── main.js       # Processus principal Electron
│   └── preload.js    # Script de préchargement sécurisé
├── frontend/          # Interface utilisateur
│   └── index.html    # Page principale avec CSS intégré
├── scraper/          # Logique de scraping
│   ├── index.js      # Classe principale du scraper
│   └── indexer.js    # Script d'indexation des animes
├── assets/           # Images et ressources
│   ├── chibi.png     # Icône de l'application
│   └── ...           # Autres images
├── data/             # Données JSON
│   └── animes.json   # Base de données des animes
└── utils/            # Utilitaires partagés
    ├── config.js     # Configuration de l'application
    ├── paths.js      # Gestion des chemins
    ├── test-extraction.js      # Tests d'extraction
    └── test-video-extraction.js # Tests vidéo
```

## 🚀 Installation et utilisation

### Prérequis

- Node.js (version 16 ou supérieure)
- pnpm (recommandé) ou npm

### Installation

```bash
# Installer les dépendances
pnpm install

# Ou avec npm
npm install
```

### Scripts disponibles

```bash
# Lancer l'application
pnpm start

# Lancer en mode développement (avec DevTools)
pnpm dev

# Indexer les animes (scraping)
pnpm scrape

# Tester l'extraction de vidéos
pnpm test-extraction
pnpm test-video
```

## 🎯 Fonctionnalités

- **Interface moderne** : Design épuré avec animations fluides
- **Recherche en temps réel** : Recherche locale dans la base d'animes
- **Scraping intelligent** : Extraction automatique des données d'animes
- **Extraction vidéo** : Récupération des URLs de vidéos depuis les embeds
- **Base de données locale** : Stockage JSON des animes indexés

## 🔧 Configuration

La configuration est centralisée dans `src/utils/config.js` :

- Paramètres Electron (taille de fenêtre, DevTools)
- Configuration du scraper (URLs, délais)
- Paramètres AniList API
- Configuration UI (délais, animations)

## 📁 Organisation

- **electron/** : Code côté processus principal Electron
- **frontend/** : Interface utilisateur (HTML/CSS/JS)
- **scraper/** : Logique de scraping et indexation
- **assets/** : Ressources statiques (images, icônes)
- **data/** : Données persistantes (JSON)
- **utils/** : Utilitaires partagés et configuration

## 🛠️ Développement

L'application utilise :

- **Electron** pour l'interface desktop
- **Cheerio** pour le parsing HTML
- **Fetch API** pour les requêtes HTTP
- **AniList GraphQL** pour les métadonnées d'animes

## 📝 Notes

- Les données sont stockées localement dans `src/data/animes.json`
- Le scraping respecte les délais pour éviter la surcharge des serveurs
- L'extraction vidéo fonctionne avec plusieurs plateformes d'embed
- L'interface est responsive et optimisée pour différentes tailles d'écran
