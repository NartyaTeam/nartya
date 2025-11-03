# Changelog - Nartya Beta 1.0.0

## 🎉 Version 1.0.0-beta.1 (30 Octobre 2024)

### ✨ Nouvelles fonctionnalités

#### 📺 Système de reprise de lecture

- **Reprise automatique** : L'application reprend automatiquement la lecture là où vous l'avez arrêtée
- **Notification visuelle** : Une notification élégante s'affiche pour indiquer la reprise (temps et pourcentage)
- **Sauvegarde intelligente** : La progression est sauvegardée toutes les 5 secondes pendant la lecture
- **Gestion des épisodes terminés** : Les épisodes à plus de 90% sont considérés comme terminés

#### 🎨 Interface Premium redesignée

- **Design minimaliste** : Correspondance parfaite avec la direction artistique de la page d'accueil
- **Grille subtile** : Fond avec motif de grille légère
- **Cartes épurées** : Plans Premium et Ultimate avec design moderne
- **Animations fluides** : Transitions et effets au survol cohérents
- **FAQ redesignée** : Section questions fréquentes avec style unifié

### 🔧 Améliorations techniques

#### 📦 Package.json optimisé pour Windows

- **Version beta** : `1.0.0-beta.1` correctement marquée
- **Build optimisé** : Exclusion des fichiers inutiles (scraper, tests, markdown)
- **Architecture** : Build x64 uniquement pour Windows
- **Installateur NSIS** : Configuration complète avec options utilisateur
  - Choix du répertoire d'installation
  - Raccourcis bureau et menu démarrer
  - Installation par utilisateur (pas de droits admin requis)
- **Métadonnées** : Informations complètes (auteur, homepage, description)
- **Dépendances** : Versions mises à jour (Electron 33.2.0, Axios 1.7.7)

### 🎯 Améliorations UI/UX

#### 🖼️ Images d'épisodes

- **Remplissage correct** : Les images remplissent maintenant complètement leur container
- **Ratio préservé** : Utilisation de `object-fit: cover` pour un affichage optimal

#### 🎛️ Sélecteurs

- **Sélecteur unique** : Suppression du double sélecteur de saison
- **Source cachée** : Badge de source retiré de l'affichage des épisodes pour plus de clarté

#### 🎨 CSS nettoyé

- **Code organisé** : CSS structuré par sections avec commentaires
- **Styles inutilisés supprimés** : Réduction de ~1728 à ~1460 lignes
- **Performances** : Code plus léger et plus maintenable

### 📝 Documentation

#### 📖 Nouveaux fichiers

- **BUILD-BETA.md** : Guide complet de build pour la beta Windows
- **CHANGELOG-BETA-1.md** : Ce fichier de changelog détaillé

### 🐛 Corrections de bugs

- ✅ Fix : Les épisodes ne s'affichaient plus après suppression du sélecteur de saison
- ✅ Fix : Images d'épisodes ne remplissant pas leur container
- ✅ Fix : Affichage du nom de la source devant les numéros d'épisode

### 🔮 Fonctionnalités existantes (depuis la version précédente)

- ✅ Recherche d'animes en temps réel
- ✅ Lecture vidéo avec Plyr (lecteur moderne)
- ✅ Support HLS (m3u8) et vidéos MP4
- ✅ Sélection de langue (VF/VOSTFR/VO/VOSTA)
- ✅ Sélection de source vidéo avec analyse intelligente
- ✅ Navigation entre épisodes dans le player
- ✅ Animations chibis flottantes
- ✅ Interface minimaliste et moderne
- ✅ Design responsive
- ✅ Sauvegarde de l'historique de visionnage

### 🚀 Pour la prochaine version

#### Planifié

- 💾 Téléchargement d'épisodes pour visionnage hors ligne
- 🔄 Synchronisation entre appareils
- 🎨 Thèmes personnalisés
- 📊 Statistiques de visionnage avancées
- 🔔 Notifications de nouveaux épisodes
- 📝 Liste personnalisée et favoris

#### En réflexion

- 🌐 Support de sources additionnelles
- 🎬 Mode picture-in-picture amélioré
- 🔍 Filtres de recherche avancés
- 👥 Profils utilisateurs multiples

---

## 📦 Build Instructions

Pour builder cette version :

```bash
pnpm install
pnpm run build:win:beta
```

L'installateur sera disponible dans `dist/Nartya-Setup-1.0.0-beta.1.exe`

## ⚠️ Notes pour les testeurs

1. **SmartScreen Windows** : Un avertissement peut s'afficher car l'installateur n'est pas signé numériquement
2. **Première installation** : L'application créera automatiquement les fichiers de données nécessaires
3. **Feedback** : Vos retours sont précieux ! Contactez-nous sur contact@nartya.app

---

**Merci aux testeurs de la beta !** 🙏

Votre aide est essentielle pour améliorer Nartya avant la sortie officielle.
