# 🎌 Nartya

> Application de streaming d'animes élégante et performante pour Windows

[![Version](https://img.shields.io/github/v/release/RandomZeleff/nartya-app)](https://github.com/RandomZeleff/nartya-app/releases)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-33.2.0-47848F?logo=electron)](https://www.electronjs.org/)

## ✨ Fonctionnalités

- 🎬 **Streaming HD** - Lecture fluide de vos animes préférés
- 🔍 **Recherche intelligente** - Trouvez rapidement ce que vous cherchez
- 📚 **Catalogue complet** - Accès à une vaste bibliothèque d'animes
- 🌐 **Multi-langues** - Support VF et VOSTFR
- 📊 **Suivi de progression** - Reprenez là où vous vous êtes arrêté
- 🔄 **Mises à jour automatiques** - Restez toujours à jour
- 🎨 **Interface moderne** - Design épuré et intuitif
- ⚡ **Performances optimales** - Chargement rapide et navigation fluide

## 📥 Installation

### Téléchargement

Téléchargez la dernière version depuis la [page des releases](https://github.com/RandomZeleff/nartya-app/releases/latest).

### Installation

1. Exécutez le fichier `Nartya-Setup-x.x.x.exe`
2. Suivez les instructions de l'installateur
3. Lancez Nartya depuis le raccourci bureau ou le menu démarrer

## 🚀 Utilisation

### Recherche d'animes

- Utilisez la barre de recherche en haut de l'écran
- Les résultats s'affichent en temps réel
- Cliquez sur un anime pour voir les détails

### Lecture de vidéos

- Sélectionnez une saison et un épisode
- Choisissez la langue (VF/VOSTFR)
- La lecture démarre automatiquement
- Votre progression est sauvegardée automatiquement

### Raccourcis clavier

- `Espace` - Lecture/Pause
- `F` - Plein écran
- `M` - Muet/Son
- `←/→` - Reculer/Avancer de 10 secondes
- `↑/↓` - Augmenter/Diminuer le volume

## 🛠️ Développement

### Prérequis

- [Node.js](https://nodejs.org/) (v18 ou supérieur)
- [pnpm](https://pnpm.io/) (v8 ou supérieur)

### Installation des dépendances

```bash
pnpm install
```

### Lancement en mode développement

```bash
pnpm dev
```

### Build de production

```bash
pnpm build
```

### Scripts disponibles

- `pnpm start` - Lancer l'application
- `pnpm dev` - Lancer en mode développement
- `pnpm build` - Créer un build de production
- `pnpm scrape` - Mettre à jour la base de données d'animes
- `pnpm release:patch` - Créer une release patch (1.0.x)
- `pnpm release:minor` - Créer une release minor (1.x.0)
- `pnpm release:major` - Créer une release major (x.0.0)

## 📁 Structure du projet

```
nartya/
├── src/
│   ├── electron/          # Processus principal Electron
│   │   ├── main.js        # Point d'entrée
│   │   ├── preload.js     # Bridge sécurisé
│   │   └── ipc-handlers.js # Gestionnaire IPC
│   ├── frontend/          # Interface utilisateur
│   │   ├── js/            # Logique frontend
│   │   └── styles/        # Feuilles de style
│   ├── scraper/           # Scraping des données
│   ├── utils/             # Utilitaires
│   └── data/              # Données locales
├── scripts/               # Scripts de build et release
├── .github/               # GitHub Actions
└── package.json
```

## 🔒 Sécurité

- Aucune donnée personnelle n'est collectée
- Pas de tracking ni d'analytics
- Communication sécurisée via IPC
- Mises à jour signées et vérifiées

## 🤝 Contribution

Les contributions sont les bienvenues ! Consultez [CONTRIBUTING.md](CONTRIBUTING.md) pour plus d'informations.

### Processus de contribution

1. Fork le projet
2. Créez votre branche (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Poussez vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📝 License

Ce projet est sous licence ISC. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

## 🙏 Remerciements

- [Anime-Sama](https://anime-sama.org) pour le contenu
- [Electron](https://www.electronjs.org/) pour le framework
- [Cheerio](https://cheerio.js.org/) pour le scraping
- Tous les contributeurs qui ont participé au projet

## 📧 Contact

Zeleff - [@RandomZeleff](https://github.com/RandomZeleff)

Lien du projet : [https://github.com/RandomZeleff/nartya-app](https://github.com/RandomZeleff/nartya-app)

---

<p align="center">Fait avec ❤️ par Zeleff</p>
