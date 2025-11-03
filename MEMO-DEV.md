# 📋 Mémo Développement Rapide

## 🎯 Commandes essentielles

```bash
# ⚡ Développement (le plus utilisé) - utilise vos données
npm run dev

# 🧪 Test mode production - utilise les données vides
npm start

# 📦 Build pour distribution - inclut les données vides
npm run build
```

## ✨ Comment ça marche ?

**C'est automatique !**

- `npm run dev` → Lance avec `--dev` → Utilise `*.dev.json` (vos données)
- `npm start` → Lance sans flag → Utilise `*.json` (vides)
- `npm run build` → Build sans flag → Inclut `*.json` (vides)

**Aucune manipulation manuelle nécessaire** ✅

## 🔍 Vérification rapide

```powershell
# Voir la taille des fichiers
dir src\data\*.json

# Résultat attendu :
# video-progress.json       → 2 octets  (juste "{}")
# watch-history.json        → 2 octets  (juste "{}")
# video-progress.dev.json   → plusieurs Ko (vos données)
# watch-history.dev.json    → plusieurs Ko (vos données)
```

## 🚨 Règles importantes

1. **Développer** → Toujours utiliser `npm run dev`
2. **Tester** → Utiliser `npm start` pour tester en mode production
3. **Build** → Juste faire `npm run build` (c'est automatique)
4. **Git** → Les `*.dev.json` ne seront jamais commitées

## 🎯 En cas de doute

> Quel fichier utilise l'app ?

Regardez la console au démarrage :

- Si vous voyez `🔧 Mode développement` → C'est les `.dev.json`
- Sinon → C'est les `.json` (production)

## 📚 Documentation complète

Voir `DEVELOPPEMENT.md` pour tous les détails.
