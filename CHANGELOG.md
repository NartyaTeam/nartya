# 📝 Changelog

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### À venir

- Support multi-langues de l'interface
- Mode clair/sombre
- Favoris et listes personnalisées
- Notifications pour les nouveaux épisodes

---

## [1.1.1] - 2025-11-09

### 🔧 Corrections

- Correction des erreurs 404 lors de la récupération d'épisodes dans une langue non disponible
- Amélioration de la gestion des erreurs Cloudflare 403
- Optimisation du système de retry avec délais progressifs

### 📚 Documentation

- Ajout de README.md complet
- Ajout de CONTRIBUTING.md
- Ajout de SECURITY.md
- Ajout de CODE_OF_CONDUCT.md
- Ajout de LICENSE (ISC)

### 🎨 Améliorations

- Ajout de variables CSS globales
- Nettoyage et organisation du code
- Amélioration de la structure du projet

---

## [1.1.0] - 2025-11-08

### ✨ Nouvelles fonctionnalités

- **Système de mises à jour automatiques** : L'application se met à jour automatiquement
- **Bouton "Rafraîchir les données"** : Récupération manuelle des derniers animes
- **Workflow GitHub Actions** : Releases automatiques sur push de tags

### 🔧 Corrections

- Correction du problème "Aucune saison disponible"
- Amélioration de la gestion des IDs d'animes (slug vs AniList ID)
- Correction des erreurs 403 Forbidden intermittentes

### 🎨 Améliorations

- Interface de progression pour le rafraîchissement des données
- Notifications de mise à jour élégantes
- Barre de progression pour le téléchargement des mises à jour

---

## [1.0.0] - 2025-11-01

### 🎉 Version initiale

#### ✨ Fonctionnalités

- Streaming d'animes en VF et VOSTFR
- Recherche intelligente d'animes
- Lecteur vidéo avec Plyr et HLS.js
- Support des vidéos HD et multi-qualités
- Suivi de progression automatique
- Historique de visionnage
- Interface moderne et responsive
- Animations fluides avec les chibis
- Raccourcis clavier pour le lecteur

#### 🛠️ Technique

- Architecture Electron
- Scraping avec Cheerio
- Intégration AniList API
- Stockage local des données
- IPC sécurisé entre processus

---

## Types de changements

- `✨ Ajouté` pour les nouvelles fonctionnalités
- `🔧 Corrigé` pour les corrections de bugs
- `🎨 Modifié` pour les changements dans les fonctionnalités existantes
- `🗑️ Supprimé` pour les fonctionnalités retirées
- `🔒 Sécurité` pour les correctifs de vulnérabilités
- `📚 Documentation` pour les changements de documentation
- `⚡ Performance` pour les améliorations de performance
- `♻️ Refactoring` pour les changements de code sans impact fonctionnel

---

[Non publié]: https://github.com/RandomZeleff/nartya-app/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/RandomZeleff/nartya-app/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/RandomZeleff/nartya-app/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/RandomZeleff/nartya-app/releases/tag/v1.0.0
