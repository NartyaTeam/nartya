# Direction Artistique - Nartya

## 📋 Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Palette de couleurs](#palette-de-couleurs)
3. [Typographie](#typographie)
4. [Espacements et dimensions](#espacements-et-dimensions)
5. [Composants UI](#composants-ui)
6. [Animations et transitions](#animations-et-transitions)
7. [Effets visuels](#effets-visuels)
8. [Responsive Design](#responsive-design)
9. [Code CSS réutilisable](#code-css-réutilisable)

---

## 🎨 Vue d'ensemble

Nartya adopte un design **moderne, minimaliste et élégant** inspiré des interfaces premium comme Netflix, Spotify et Apple TV+. L'interface privilégie la **lisibilité**, le **confort visuel** et une **expérience utilisateur fluide**.

### Principes de design

- **Dark Mode natif** : Fond noir profond pour réduire la fatigue oculaire
- **Glassmorphism subtil** : Effets de flou et transparence pour la profondeur
- **Micro-interactions** : Animations délicates au hover et au clic
- **Hiérarchie visuelle claire** : Utilisation intelligente des contrastes et tailles
- **Accessibilité** : Contrastes WCAG AA/AAA respectés

---

## 🎨 Palette de couleurs

### Couleurs principales

```css
/* Arrière-plans */
--bg-primary: #0a0a0a; /* Fond principal - Noir profond */
--bg-secondary: #18181b; /* Fond secondaire - Gris très foncé */
--bg-tertiary: #27272a; /* Fond tertiaire - Gris foncé */

/* Surfaces et cartes */
--surface-base: rgba(255, 255, 255, 0.02); /* Surface de base */
--surface-hover: rgba(255, 255, 255, 0.04); /* Surface au hover */
--surface-active: rgba(255, 255, 255, 0.06); /* Surface active */
--surface-elevated: rgba(255, 255, 255, 0.08); /* Surface élevée */

/* Bordures */
--border-subtle: rgba(255, 255, 255, 0.06); /* Bordure subtile */
--border-default: rgba(255, 255, 255, 0.08); /* Bordure par défaut */
--border-strong: rgba(255, 255, 255, 0.15); /* Bordure forte */

/* Textes */
--text-primary: #fafafa; /* Texte principal - Blanc cassé */
--text-secondary: #e4e4e7; /* Texte secondaire - Gris très clair */
--text-tertiary: #d4d4d8; /* Texte tertiaire - Gris clair */
--text-muted: #a1a1aa; /* Texte atténué - Gris moyen */
--text-disabled: #71717a; /* Texte désactivé - Gris */
--text-subtle: #52525b; /* Texte subtil - Gris foncé */
```

### Couleurs d'accent

```css
/* Accent principal - Indigo/Violet */
--accent-primary: #6366f1; /* Indigo 500 */
--accent-primary-hover: #818cf8; /* Indigo 400 */
--accent-primary-active: #4f46e5; /* Indigo 600 */
--accent-primary-subtle: rgba(99, 102, 241, 0.08);
--accent-primary-border: rgba(99, 102, 241, 0.3);

/* Accent secondaire - Violet */
--accent-secondary: #8b5cf6; /* Violet 500 */
--accent-secondary-hover: #a78bfa; /* Violet 400 */
--accent-secondary-subtle: rgba(139, 92, 246, 0.15);

/* Dégradés d'accent */
--gradient-primary: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
--gradient-primary-hover: linear-gradient(135deg, #818cf8 0%, #a78bfa 100%);
```

### Couleurs sémantiques

```css
/* Succès - Vert */
--success: #22c55e; /* Green 500 */
--success-bg: rgba(34, 197, 94, 0.1);
--success-border: rgba(34, 197, 94, 0.3);

/* Erreur - Rouge */
--error: #ef4444; /* Red 500 */
--error-light: #fca5a5; /* Red 300 */
--error-bg: rgba(239, 68, 68, 0.08);
--error-border: rgba(239, 68, 68, 0.3);

/* Avertissement - Jaune/Orange */
--warning: #fbbf24; /* Amber 400 */
--warning-bg: rgba(251, 191, 36, 0.1);
--warning-border: rgba(251, 191, 36, 0.3);

/* Info - Bleu */
--info: #3b82f6; /* Blue 500 */
--info-bg: rgba(59, 130, 246, 0.1);
--info-border: rgba(59, 130, 246, 0.3);
```

---

## 📝 Typographie

### Famille de polices

```css
/* Stack de polices système pour performances optimales */
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI",
  sans-serif;
```

**Pourquoi ce choix ?**

- Utilise les polices natives de chaque système
- Performances optimales (pas de chargement externe)
- Apparence familière et professionnelle
- Excellent rendu sur tous les écrans

### Échelle typographique

```css
/* Titres */
--font-size-h1: 2.5rem; /* 40px - Titre principal */
--font-size-h2: 2rem; /* 32px - Sous-titre majeur */
--font-size-h3: 1.5rem; /* 24px - Sous-titre */
--font-size-h4: 1.25rem; /* 20px - Titre de section */
--font-size-h5: 1.125rem; /* 18px - Titre de card */

/* Corps de texte */
--font-size-base: 1rem; /* 16px - Texte standard */
--font-size-sm: 0.9375rem; /* 15px - Texte petit */
--font-size-xs: 0.875rem; /* 14px - Texte très petit */
--font-size-xxs: 0.8125rem; /* 13px - Texte minimal */
--font-size-tiny: 0.75rem; /* 12px - Légendes */

/* Poids de police */
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;

/* Hauteur de ligne */
--line-height-tight: 1.2;
--line-height-normal: 1.4;
--line-height-relaxed: 1.6;

/* Espacement des lettres */
--letter-spacing-tight: -0.03em; /* Titres serrés */
--letter-spacing-normal: -0.01em; /* Standard */
--letter-spacing-wide: 0.05em; /* Badges, labels */
```

### Exemples d'utilisation

```css
/* Titre principal */
.main-title {
  font-size: var(--font-size-h1);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-tight);
  line-height: var(--line-height-tight);
  color: var(--text-primary);
}

/* Sous-titre */
.subtitle {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-normal);
  letter-spacing: var(--letter-spacing-normal);
  color: var(--text-disabled);
}

/* Titre de card */
.card-title {
  font-size: 0.95rem;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  line-height: var(--line-height-normal);
}
```

---

## 📏 Espacements et dimensions

### Système d'espacement (8px base)

```css
--spacing-1: 0.25rem; /* 4px */
--spacing-2: 0.5rem; /* 8px */
--spacing-3: 0.75rem; /* 12px */
--spacing-4: 1rem; /* 16px */
--spacing-5: 1.25rem; /* 20px */
--spacing-6: 1.5rem; /* 24px */
--spacing-8: 2rem; /* 32px */
--spacing-10: 2.5rem; /* 40px */
--spacing-12: 3rem; /* 48px */
--spacing-16: 4rem; /* 64px */
--spacing-20: 5rem; /* 80px */
```

### Bordures arrondies

```css
--radius-sm: 4px; /* Petits éléments (badges) */
--radius-md: 6px; /* Éléments moyens */
--radius-lg: 8px; /* Boutons, inputs */
--radius-xl: 10px; /* Cards, modals */
--radius-2xl: 12px; /* Grandes cards */
--radius-3xl: 16px; /* Conteneurs principaux */
--radius-full: 50%; /* Éléments circulaires */
```

### Ombres (Shadows)

```css
/* Ombres subtiles */
--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.15);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);
--shadow-xl: 0 12px 32px rgba(0, 0, 0, 0.5);
--shadow-2xl: 0 20px 60px rgba(0, 0, 0, 0.6);

/* Ombres colorées (accent) */
--shadow-accent: 0 4px 20px rgba(99, 102, 241, 0.3);
--shadow-accent-lg: 0 10px 40px rgba(99, 102, 241, 0.4);
```

### Dimensions des composants

```css
/* Hauteurs de boutons/inputs */
--height-sm: 32px;
--height-md: 40px;
--height-lg: 48px;

/* Largeurs maximales */
--max-width-xs: 320px;
--max-width-sm: 400px;
--max-width-md: 600px;
--max-width-lg: 800px;
--max-width-xl: 1200px;
--max-width-2xl: 1400px;
--max-width-3xl: 1600px;
```

---

## 🧩 Composants UI

### 1. Boutons

#### Bouton principal (Primary)

```css
.btn-primary {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 10px;
  border: none;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.btn-primary:hover {
  background: linear-gradient(135deg, #818cf8 0%, #a78bfa 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
}

.btn-primary:active {
  transform: translateY(0);
}
```

#### Bouton secondaire (Ghost)

```css
.btn-secondary {
  background: rgba(255, 255, 255, 0.05);
  color: #a1a1aa;
  padding: 0.75rem 1.5rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e5e5e5;
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}
```

#### Bouton iconique (Icon Button)

```css
.btn-icon {
  padding: 0.625rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: #a1a1aa;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(99, 102, 241, 0.3);
  color: #e5e5e5;
}
```

### 2. Cards (Cartes)

#### Card anime

```css
.anime-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.anime-card:hover {
  transform: translateY(-8px);
  border-color: rgba(99, 102, 241, 0.3);
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(99, 102, 241, 0.2);
}

/* Effet de brillance au hover */
.anime-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.1),
    transparent
  );
  transition: left 0.5s ease;
  z-index: 1;
  pointer-events: none;
}

.anime-card:hover::before {
  left: 100%;
}

.anime-card-image {
  width: 100%;
  height: 320px;
  object-fit: cover;
  display: block;
  image-rendering: -webkit-optimize-contrast;
  transition: filter 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.anime-card:hover .anime-card-image {
  filter: brightness(1.1);
}

.anime-card-content {
  padding: 1rem;
}

.anime-card-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #fafafa;
  margin-bottom: 0.4rem;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.6rem;
}
```

### 3. Inputs et formulaires

#### Input de recherche

```css
.search-input {
  width: 100%;
  padding: 1rem 1rem 1rem 2.8rem;
  font-size: 0.95rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  color: #fafafa;
  outline: none;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: inherit;
}

.search-input::placeholder {
  color: #52525b;
}

.search-input:focus {
  border-color: rgba(99, 102, 241, 0.4);
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.08), 0 8px 24px rgba(99, 102, 241, 0.15);
  transform: translateY(-2px);
}
```

#### Select / Dropdown

```css
.select {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 0.75rem 2.5rem 0.75rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #e4e4e7;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  appearance: none;
}

.select:hover {
  background-color: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-1px);
}

.select:focus {
  background-color: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
}
```

### 4. Header / Navigation

```css
.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  padding: 1.5rem 2.5rem;
  z-index: 100;
  background: transparent;
  backdrop-filter: none;
  border-bottom: 1px solid transparent;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.header.scrolled {
  background: rgba(10, 10, 10, 0.8);
  backdrop-filter: blur(20px) saturate(180%);
  border-bottom-color: rgba(255, 255, 255, 0.06);
}
```

### 5. Modals

```css
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.modal-overlay.show {
  opacity: 1;
}

.modal {
  background: rgba(18, 18, 18, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 2rem;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
  transform: scale(0.95);
  transition: transform 0.2s ease;
}

.modal-overlay.show .modal {
  transform: scale(1);
}
```

### 6. Badges et Labels

```css
.badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge-primary {
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.badge-success {
  background: rgba(34, 197, 94, 0.1);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.badge-error {
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
}
```

---

## ✨ Animations et transitions

### Courbes de timing (Easing)

```css
/* Courbes personnalisées */
--ease-in-out-smooth: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-in-out-circ: cubic-bezier(0.85, 0, 0.15, 1);

/* Durées standard */
--duration-fast: 0.15s;
--duration-normal: 0.25s;
--duration-slow: 0.4s;
```

### Animations clés

#### Fade In Up

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-in-up {
  animation: fadeInUp 0.8s ease-out;
}
```

#### Slide In

```css
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

#### Spin (Loading)

```css
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  border-top-color: #6366f1;
  animation: spin 1s ease-in-out infinite;
}
```

#### Bounce (Indicateur de scroll)

```css
@keyframes bounce {
  0%,
  20%,
  50%,
  80%,
  100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-10px);
  }
  60% {
    transform: translateY(-5px);
  }
}
```

#### Shimmer (Effet de brillance)

```css
@keyframes shimmer {
  0%,
  100% {
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
}

.shimmer-effect::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 30px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3));
  animation: shimmer 2s infinite;
}
```

---

## 🌟 Effets visuels

### Glassmorphism (Effet de verre)

```css
.glass-effect {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
```

### Grille de fond subtile

```css
body::before {
  content: "";
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: linear-gradient(
      rgba(255, 255, 255, 0.015) 1px,
      transparent 1px
    ), linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
  background-size: 80px 80px;
  pointer-events: none;
  z-index: 0;
}
```

### Accent lumineux (Glow)

```css
body::after {
  content: "";
  position: fixed;
  top: -50%;
  left: 50%;
  transform: translateX(-50%);
  width: 800px;
  height: 800px;
  background: radial-gradient(
    circle,
    rgba(99, 102, 241, 0.08) 0%,
    transparent 70%
  );
  pointer-events: none;
  z-index: 0;
}
```

### Barre de progression

```css
.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  transition: width 0.3s ease;
  position: relative;
}

.progress-fill::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 30px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3));
  animation: shimmer 2s infinite;
}
```

### Optimisation des images

```css
img {
  image-rendering: -webkit-optimize-contrast;
  -webkit-backface-visibility: hidden;
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
}
```

---

## 📱 Responsive Design

### Breakpoints

```css
/* Mobile first approach */
--breakpoint-xs: 480px; /* Petits téléphones */
--breakpoint-sm: 640px; /* Téléphones */
--breakpoint-md: 768px; /* Tablettes */
--breakpoint-lg: 1024px; /* Petits écrans */
--breakpoint-xl: 1280px; /* Écrans moyens */
--breakpoint-2xl: 1536px; /* Grands écrans */
```

### Media queries

```css
/* Tablettes et moins */
@media (max-width: 768px) {
  .main-title {
    font-size: 2rem;
  }

  .animes-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
    padding: 2rem 1.5rem;
  }
}

/* Mobiles */
@media (max-width: 480px) {
  .animes-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .anime-card-image {
    height: 200px;
  }
}

/* Grands écrans */
@media (min-width: 1400px) {
  .animes-grid {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }
}
```

---

## 💻 Code CSS réutilisable

### Reset et base

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI",
    sans-serif;
  background: #0a0a0a;
  min-height: 100vh;
  color: #e4e4e7;
  overflow-x: hidden;
  position: relative;
}
```

### Classes utilitaires

```css
/* Flexbox */
.flex {
  display: flex;
}
.flex-col {
  flex-direction: column;
}
.items-center {
  align-items: center;
}
.justify-center {
  justify-content: center;
}
.justify-between {
  justify-content: space-between;
}
.gap-1 {
  gap: 0.25rem;
}
.gap-2 {
  gap: 0.5rem;
}
.gap-4 {
  gap: 1rem;
}

/* Texte */
.text-center {
  text-align: center;
}
.font-semibold {
  font-weight: 600;
}
.font-bold {
  font-weight: 700;
}
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Espacement */
.p-4 {
  padding: 1rem;
}
.px-4 {
  padding-left: 1rem;
  padding-right: 1rem;
}
.py-4 {
  padding-top: 1rem;
  padding-bottom: 1rem;
}
.m-4 {
  margin: 1rem;
}
.mt-4 {
  margin-top: 1rem;
}
.mb-4 {
  margin-bottom: 1rem;
}

/* Positionnement */
.relative {
  position: relative;
}
.absolute {
  position: absolute;
}
.fixed {
  position: fixed;
}

/* Affichage */
.hidden {
  display: none;
}
.block {
  display: block;
}
.inline-block {
  display: inline-block;
}

/* Transitions */
.transition {
  transition: all 0.2s ease;
}
.transition-slow {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Grid Layout (Masonry-like)

```css
.animes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1.5rem;
  padding: 2rem 2.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

/* Effet de décalage en vague */
.anime-card:nth-child(even) {
  margin-top: 3rem;
}
```

---

## 🎯 Exemples de mise en page

### Page d'accueil (Hero + Grid)

```html
<div class="hero-section">
  <h1 class="main-title">Trouvez votre prochain anime</h1>
  <p class="subtitle">Des milliers d'œuvres à découvrir</p>

  <div class="search-container">
    <input type="text" class="search-input" placeholder="Rechercher..." />
  </div>
</div>

<div class="animes-grid">
  <!-- Cards d'animes -->
</div>
```

### Card anime complète

```html
<div class="anime-card">
  <img src="..." alt="..." class="anime-card-image" />
  <div class="anime-card-content">
    <h3 class="anime-card-title">Titre de l'anime</h3>
    <span class="badge badge-primary">TV</span>
  </div>
</div>
```

### Modal

```html
<div class="modal-overlay show">
  <div class="modal">
    <h2>Titre du modal</h2>
    <p>Contenu du modal...</p>
    <div class="flex gap-4">
      <button class="btn-primary">Confirmer</button>
      <button class="btn-secondary">Annuler</button>
    </div>
  </div>
</div>
```

---

## 📦 Export des variables CSS

```css
:root {
  /* Couleurs */
  --bg-primary: #0a0a0a;
  --text-primary: #fafafa;
  --accent-primary: #6366f1;

  /* Espacements */
  --spacing-4: 1rem;
  --spacing-6: 1.5rem;

  /* Bordures */
  --radius-lg: 8px;
  --radius-xl: 10px;

  /* Transitions */
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --duration-normal: 0.25s;

  /* Ombres */
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);
  --shadow-accent: 0 4px 20px rgba(99, 102, 241, 0.3);
}
```

---

## 🚀 Conseils d'implémentation

### Performance

- Utilisez `will-change` avec parcimonie sur les éléments animés
- Privilégiez les transformations CSS (`transform`, `opacity`) pour les animations
- Lazy load des images avec `loading="lazy"`
- Utilisez `backdrop-filter` avec modération (coûteux en performance)

### Accessibilité

- Maintenez un ratio de contraste minimum de 4.5:1 pour le texte
- Ajoutez des états `:focus-visible` pour la navigation au clavier
- Utilisez des transitions pour les changements d'état
- Testez avec des lecteurs d'écran

### Cohérence

- Utilisez les variables CSS pour tous les tokens de design
- Maintenez une échelle d'espacement cohérente (multiples de 4 ou 8)
- Respectez la hiérarchie typographique
- Limitez le nombre de couleurs d'accent

---

## 📝 Notes finales

Cette direction artistique est conçue pour être :

- **Modulaire** : Composants réutilisables
- **Évolutive** : Facile à étendre
- **Performante** : Optimisée pour le web
- **Accessible** : Respecte les standards WCAG
- **Moderne** : Utilise les dernières techniques CSS

Pour toute question ou suggestion d'amélioration, n'hésitez pas à consulter le code source de Nartya.

---

**Version** : 1.0  
**Dernière mise à jour** : Novembre 2024  
**Auteur** : Équipe Nartya
