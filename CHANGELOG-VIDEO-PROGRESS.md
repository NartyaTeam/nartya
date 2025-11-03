# 📊 Changelog - Système de Progression Vidéo

## 📅 Date : 2 novembre 2025

### ✨ Nouveau système de progression vidéo

Un système complet de suivi de progression a été implémenté, permettant de reprendre les épisodes là où vous les avez laissés.

---

## 🎯 Fonctionnalités

### 1. Sauvegarde automatique de la progression
- ✅ **Sauvegarde toutes les 5 secondes** pendant la lecture
- ✅ **Sauvegarde à la pause** pour ne rien perdre
- ✅ **Détection intelligente** : ne sauvegarde que si progression > 5% et < 95%
- ✅ **Suppression automatique** si épisode terminé (> 95%)

### 2. Données sauvegardées
Pour chaque épisode en cours :
```javascript
{
  animeId: "one-piece",
  seasonId: "saison2/vostfr",
  episodeIndex: 5,          // Index 0-based
  episodeNumber: 6,         // Numéro affiché
  currentTime: 847.5,       // Temps en secondes
  duration: 1420,           // Durée totale
  progressPercent: 60,      // Pourcentage
  lastWatched: 1730563200,  // Timestamp
  animeTitle: "One Piece",
  animeCover: "https://...",
  seasonName: "Saison 2"
}
```

### 3. APIs disponibles (Frontend)

#### Sauvegarder la progression
```javascript
await window.electronAPI.saveVideoProgress({
  animeId: 'one-piece',
  seasonId: 'saison2/vostfr',
  episodeIndex: 5,
  currentTime: 847.5,
  duration: 1420,
  animeInfo: {
    title: 'One Piece',
    cover: 'https://...',
    seasonName: 'Saison 2'
  }
});
```

#### Récupérer la progression d'un épisode
```javascript
const result = await window.electronAPI.getVideoProgress({
  animeId: 'one-piece',
  seasonId: 'saison2/vostfr',
  episodeIndex: 5
});

if (result.success && result.progress) {
  console.log(`Progression: ${result.progress.progressPercent}%`);
  console.log(`Temps: ${result.progress.currentTime}s`);
}
```

#### Récupérer toutes les progressions d'un anime
```javascript
const result = await window.electronAPI.getAnimeProgress('one-piece');

if (result.success) {
  Object.values(result.progress).forEach(ep => {
    console.log(`Épisode ${ep.episodeNumber}: ${ep.progressPercent}%`);
  });
}
```

#### Récupérer tous les épisodes en cours (récents)
```javascript
const result = await window.electronAPI.getAllVideoProgress();

if (result.success) {
  result.progress.forEach(ep => {
    console.log(`${ep.animeTitle} - Épisode ${ep.episodeNumber}: ${ep.progressPercent}%`);
  });
}
```

#### Supprimer la progression
```javascript
await window.electronAPI.deleteVideoProgress({
  animeId: 'one-piece',
  seasonId: 'saison2/vostfr',
  episodeIndex: 5
});
```

#### Nettoyer les anciennes progressions
```javascript
// Supprimer les progressions > 30 jours
const result = await window.electronAPI.cleanOldProgress(30);
console.log(`${result.cleaned} progressions nettoyées`);
```

---

## 🎨 Prochaine étape : Affichage visuel

### Barre de progression sur les épisodes

L'idée est d'afficher une barre de progression sous chaque épisode en cours, comme sur YouTube :

```
┌─────────────────────────────────┐
│  [Image épisode]                │
│                                 │
│  Épisode 6                      │
│  Description...                 │
│  ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░ 60%      │ ← Barre de progression
└─────────────────────────────────┘
```

### Implémentation suggérée

1. **Dans `anime-app.js` - `displayEpisodes()`** :
   - Charger les progressions de l'anime actuel
   - Passer les données aux cartes d'épisodes

2. **Dans `episode-manager.js` - `getEpisodeHtml()`** :
   - Ajouter une barre de progression si l'épisode a une progression
   - Afficher le pourcentage et le temps restant

3. **CSS pour la barre** :
```css
.episode-progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.episode-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  transition: width 0.3s ease;
}

.episode-progress-info {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.8);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  color: white;
}
```

4. **HTML suggéré** :
```html
<div class="episode-card">
  <!-- Contenu existant -->
  
  <!-- Barre de progression (si en cours) -->
  <div class="episode-progress-bar">
    <div class="episode-progress-fill" style="width: 60%"></div>
  </div>
  
  <!-- Info progression -->
  <div class="episode-progress-info">
    60% • 10 min restantes
  </div>
</div>
```

---

## 📁 Fichiers modifiés

### Backend
- ✅ `src/utils/video-progress.js` - **NOUVEAU** - Gestionnaire de progression
- ✅ `src/electron/ipc-handlers.js` - Handlers IPC ajoutés
- ✅ `src/electron/preload.js` - APIs exposées au frontend

### Frontend
- ✅ `src/frontend/js/video-player.js` - Sauvegarde automatique
- ✅ `src/frontend/js/anime-app.js` - Passage des infos au player

### Données
- 📄 `video-progress.json` - Fichier de sauvegarde (créé automatiquement)

---

## 🔄 Flux de sauvegarde

```
Utilisateur lance un épisode
         ↓
Video Player initialisé
         ↓
setEpisodeInfo() appelé avec :
  - animeId
  - seasonId
  - episodeIndex
  - animeInfo (titre, cover, saison)
         ↓
Lecture démarre
         ↓
Sauvegarde toutes les 5s
         ↓
saveCurrentProgress()
         ↓
saveVideoProgress() (IPC)
         ↓
VideoProgressManager.saveEpisodeProgress()
         ↓
Écrit dans video-progress.json
```

---

## 🎯 Cas d'usage

### Scénario 1 : Reprise d'épisode
```
1. Utilisateur regarde One Piece S2 Ep6 jusqu'à 60%
2. Ferme l'application
3. Rouvre l'application
4. Navigue vers One Piece S2
5. Voit la barre de progression sur Ep6
6. Clique sur Ep6
7. Reprend automatiquement à 60%
```

### Scénario 2 : Nettoyage automatique
```
1. Utilisateur regarde un épisode jusqu'à 96%
2. Système détecte > 95%
3. Supprime automatiquement la progression
4. Épisode considéré comme terminé
```

### Scénario 3 : Page "Récents"
```
1. Utilisateur clique sur "Récents" (à implémenter)
2. Affiche tous les épisodes en cours
3. Triés par date (plus récent en premier)
4. Avec barres de progression
5. Clic sur un épisode → reprend la lecture
```

---

## 🚀 Prochaines étapes

1. **Afficher les barres de progression** sur les cartes d'épisodes
2. **Créer une page "Récents"** pour voir tous les épisodes en cours
3. **Ajouter un badge "En cours"** sur les animes avec progression
4. **Notification de reprise** améliorée avec preview
5. **Statistiques** : temps total regardé, épisodes terminés, etc.

---

## 📊 Format du fichier `video-progress.json`

```json
{
  "one-piece:saison2/vostfr:5": {
    "animeId": "one-piece",
    "seasonId": "saison2/vostfr",
    "episodeIndex": 5,
    "episodeNumber": 6,
    "currentTime": 847.5,
    "duration": 1420,
    "progressPercent": 60,
    "lastWatched": 1730563200000,
    "animeTitle": "One Piece",
    "animeCover": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-YCN05AkWAZfh.png",
    "seasonName": "Saison 2"
  }
}
```

---

**Développé avec ❤️ pour Nartya**

