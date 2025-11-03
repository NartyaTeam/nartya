# 🚀 Checklist Pré-Release - Nartya Beta 1.0.0

## ✅ Code et Fonctionnalités

### Fonctionnalités principales

- [x] Recherche d'animes fonctionnelle
- [x] Lecture vidéo avec Plyr
- [x] Support HLS (m3u8)
- [x] Sélection de langue (VF/VOSTFR/VO/VOSTA)
- [x] Sélection de source vidéo
- [x] Navigation entre épisodes
- [x] **Reprise automatique de lecture**
- [x] Sauvegarde de la progression
- [x] Historique de visionnage

### Interface utilisateur

- [x] Page d'accueil minimaliste
- [x] Page anime avec liste d'épisodes
- [x] **Page premium redesignée**
- [x] Player vidéo avec contrôles
- [x] Animations chibis
- [x] Design responsive

### Corrections récentes

- [x] Images d'épisodes remplissent correctement leur container
- [x] Suppression du double sélecteur de saison
- [x] Suppression de l'affichage du nom de source
- [x] CSS nettoyé et optimisé

## 📦 Build et Configuration

### Package.json

- [x] Version beta correctement définie (`1.0.0-beta.1`)
- [x] Description complète
- [x] Auteur et homepage configurés
- [x] Scripts de build optimisés
- [x] Exclusion des fichiers inutiles
- [x] Configuration NSIS complète
- [x] Dépendances à jour

### Build Windows

- [ ] **TODO : Tester le build** (`pnpm run build:win:beta`)
- [ ] **TODO : Vérifier que l'installateur se génère correctement**
- [ ] **TODO : Tester l'installation sur une machine Windows propre**
- [ ] **TODO : Vérifier les raccourcis (bureau + menu démarrer)**
- [ ] **TODO : Tester la désinstallation**

## 🧪 Tests fonctionnels

### Tests à effectuer avant release

#### 🔍 Recherche

- [ ] Rechercher un anime existant
- [ ] Rechercher un anime inexistant
- [ ] Vider la recherche avec le bouton X
- [ ] Tester avec des caractères spéciaux

#### 📺 Lecture vidéo

- [ ] Lancer un épisode en VF
- [ ] Lancer un épisode en VOSTFR
- [ ] Changer de source vidéo
- [ ] Mettre en pause et reprendre
- [ ] Passer en plein écran
- [ ] Changer le volume
- [ ] Utiliser la barre de progression
- [ ] **Tester la reprise de lecture** (fermer et rouvrir)
- [ ] **Vérifier la notification de reprise**

#### 🎯 Navigation

- [ ] Naviguer entre les épisodes (boutons flèches)
- [ ] Changer de saison
- [ ] Retour à l'accueil depuis la page anime
- [ ] Accéder à la page Premium

#### 💾 Données

- [ ] Vérifier que `watch-history.json` se crée
- [ ] Vérifier que la progression se sauvegarde
- [ ] Vérifier que l'historique persiste après redémarrage

#### 🎨 Interface

- [ ] Tester sur différentes résolutions d'écran
- [ ] Vérifier les animations (chibis, transitions)
- [ ] Tester le mode responsive (réduire la fenêtre)
- [ ] Vérifier l'affichage des images d'épisodes

## 📄 Documentation

### Fichiers de documentation

- [x] README.md à jour
- [x] BUILD-BETA.md créé
- [x] CHANGELOG-BETA-1.md créé
- [x] PRE-RELEASE-CHECKLIST.md créé

### Informations dans les fichiers

- [x] Instructions de build claires
- [x] Liste des fonctionnalités
- [x] Notes pour les testeurs
- [x] Informations de contact

## 🔒 Sécurité et Performance

### Sécurité

- [x] Validation des IDs d'anime (regex)
- [x] Limitation de longueur des IDs
- [x] Pas de code malveillant dans les dépendances
- [ ] **TODO : Scanner avec un antivirus** (vérifier faux positifs)

### Performance

- [x] CSS optimisé
- [x] Pas de fuites mémoire connues
- [x] Préchargement intelligent des épisodes
- [x] Gestion correcte du cache vidéo

## 🎁 Assets et Ressources

### Icônes et Images

- [x] Icône de l'application (`src/build/icon.png`)
- [x] Images chibis présentes
- [ ] **TODO : Vérifier que l'icône s'affiche dans l'installateur**
- [ ] **TODO : Vérifier l'icône dans la barre des tâches Windows**

## 📢 Communication

### Avant la release

- [ ] **TODO : Préparer l'annonce de beta**
- [ ] **TODO : Créer un canal de feedback pour les testeurs**
- [ ] **TODO : Préparer un formulaire de rapport de bugs**

### Informations à communiquer

- [ ] Comment installer (guide visuel si possible)
- [ ] Que l'avertissement SmartScreen est normal
- [ ] Comment reporter des bugs
- [ ] Quelles fonctionnalités tester en priorité

## ⚠️ Points d'attention

### Limitations connues de la beta

1. **Pas de signature numérique** : Avertissement Windows SmartScreen
2. **x64 uniquement** : Pas de support 32-bit
3. **Windows uniquement** : Pas de version Mac/Linux pour cette beta
4. **Premium non fonctionnel** : Affiche juste un message "en développement"

### Risques identifiés

- Certaines sources vidéo peuvent être lentes (Sibnet)
- Possibles problèmes de CORS avec certains hébergeurs
- HLS peut nécessiter un décodeur sur certaines machines

## 🚦 Décision de Release

### ✅ Critères de validation (MUST HAVE)

- [x] L'application démarre sans erreur
- [x] La recherche fonctionne
- [x] La lecture vidéo fonctionne
- [x] La navigation entre épisodes fonctionne
- [x] La reprise de lecture fonctionne
- [ ] **Le build Windows se génère correctement**
- [ ] **L'installation/désinstallation fonctionne**

### 🎯 Critères bonus (NICE TO HAVE)

- [x] Interface fluide et responsive
- [x] Animations agréables
- [x] Design cohérent
- [ ] Pas de bugs majeurs identifiés

---

## 📋 Action Items avant Release

1. ⚠️ **CRITIQUE** : Builder et tester l'installateur Windows
2. ⚠️ **CRITIQUE** : Tester sur au moins 2 machines Windows différentes
3. 🔍 **IMPORTANT** : Effectuer tous les tests fonctionnels
4. 📄 **IMPORTANT** : Vérifier que toutes les erreurs console sont normales
5. 🎨 **MINEUR** : Screenshots pour la communication
6. 📢 **MINEUR** : Préparer l'annonce

---

## ✨ Prêt pour la Release ?

Une fois tous les éléments **CRITIQUES** et **IMPORTANTS** cochés, la beta peut être distribuée aux testeurs !

**Date de release prévue** : À définir après validation des tests

**Testeurs cibles** : 5-10 personnes pour commencer

**Durée de la beta** : 1-2 semaines

---

_Dernière mise à jour : 30 Octobre 2024_
