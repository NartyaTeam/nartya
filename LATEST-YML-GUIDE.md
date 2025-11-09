# 📄 Guide du fichier latest.yml

## 🎯 C'est Quoi ?

Le fichier `latest.yml` est le **cerveau de l'auto-update**. Il indique à votre application :

- Quelle est la dernière version disponible
- Où télécharger la mise à jour
- Comment vérifier que le téléchargement est sûr

## 🤖 Généré Automatiquement

**Bonne nouvelle :** Vous n'avez RIEN à faire !

Quand vous lancez :

```bash
pnpm run build
```

Electron-builder crée automatiquement `latest.yml` dans `dist/`.

## 📦 Exemple de Contenu

```yaml
version: 1.0.1
files:
  - url: Nartya Setup 1.0.1.exe
    sha512: 7B3F8A9C2D1E4F5A6B7C8D9E0F1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A6B7C8D9E0F1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0
    size: 89456123
path: Nartya Setup 1.0.1.exe
sha512: 7B3F8A9C2D1E4F5A6B7C8D9E0F1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A6B7C8D9E0F1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0
releaseDate: "2024-01-15T10:30:00.000Z"
```

### Explication des champs :

| Champ          | Description                                |
| -------------- | ------------------------------------------ |
| `version`      | La version de la mise à jour (ex: 1.0.1)   |
| `files.url`    | Le nom du fichier à télécharger            |
| `files.sha512` | Hash de sécurité pour vérifier l'intégrité |
| `files.size`   | Taille du fichier en octets                |
| `path`         | Chemin du fichier (même que url)           |
| `releaseDate`  | Date de publication                        |

## 🚀 Workflow Complet

### 1️⃣ Build l'Application

```bash
pnpm run build
```

**Résultat dans `dist/` :**

```
dist/
├── Nartya Setup 1.0.1.exe        ← L'installateur
├── latest.yml                     ← Généré automatiquement ✨
└── Nartya Setup 1.0.1.exe.blockmap  ← Optionnel
```

### 2️⃣ Vérifier les Fichiers

```bash
pnpm run check-release
```

Cela vérifie que `latest.yml` existe.

### 3️⃣ Uploader sur GitHub

1. Allez sur : `https://github.com/votre-username/nartya/releases`
2. Cliquez sur "Draft a new release"
3. Créez un tag : `v1.0.1`
4. **Uploadez ces fichiers** :

   - ✅ `Nartya Setup 1.0.1.exe`
   - ✅ `latest.yml`
   - ⚠️ `Nartya Setup 1.0.1.exe.blockmap` (optionnel mais recommandé)

5. Publiez la release

## 🔍 Comment ça Marche ?

### Côté Utilisateur

```
1. L'utilisateur lance Nartya v1.0.0
   ↓
2. Après 3 secondes, l'app fait une requête vers :
   https://github.com/votre-username/nartya/releases/latest/download/latest.yml
   ↓
3. L'app lit latest.yml et voit : "Version 1.0.1 disponible !"
   ↓
4. Une notification apparaît : "🎉 Nouvelle version disponible"
   ↓
5. L'utilisateur clique "Télécharger"
   ↓
6. L'app télécharge depuis :
   https://github.com/votre-username/nartya/releases/latest/download/Nartya Setup 1.0.1.exe
   ↓
7. L'app vérifie le hash SHA512 pour la sécurité
   ↓
8. L'app installe la mise à jour
```

### Côté GitHub

GitHub expose automatiquement les fichiers uploadés via :

```
https://github.com/owner/repo/releases/latest/download/FILENAME
```

## ⚠️ Erreurs Courantes

### ❌ "Update check failed"

**Cause :** `latest.yml` n'est pas uploadé sur GitHub

**Solution :**

1. Vérifiez que `latest.yml` est bien dans votre release GitHub
2. Vérifiez qu'il s'appelle exactement `latest.yml` (pas `latest (1).yml`)

### ❌ "Download failed" ou "Checksum mismatch"

**Cause :** Le fichier `.exe` uploadé ne correspond pas à celui référencé dans `latest.yml`

**Solution :**

1. Ouvrez `latest.yml` dans un éditeur de texte
2. Regardez le champ `path:` → ex: `Nartya Setup 1.0.1.exe`
3. Assurez-vous que le fichier `.exe` uploadé a **exactement** ce nom
4. **Ne modifiez JAMAIS `latest.yml` manuellement** - regenerez avec `pnpm run build`

### ❌ "No updates available" alors qu'une nouvelle version existe

**Cause :** La version dans `package.json` n'a pas été mise à jour

**Solution :**

```bash
# Utilisez npm version pour mettre à jour automatiquement
pnpm run release:minor
```

## 🔒 Sécurité

Le hash SHA512 dans `latest.yml` garantit que :

- ✅ Le fichier téléchargé n'a pas été modifié
- ✅ Le fichier téléchargé est authentique
- ✅ Pas de risque de télécharger un fichier corrompu ou malveillant

**Ne modifiez JAMAIS le hash manuellement !** Il est calculé automatiquement par electron-builder.

## 📝 Checklist Avant Publication

- [ ] `pnpm run build` exécuté avec succès
- [ ] `latest.yml` existe dans `dist/`
- [ ] `Nartya Setup X.X.X.exe` existe dans `dist/`
- [ ] La version dans `package.json` a été mise à jour
- [ ] Un tag git a été créé (ex: `v1.0.1`)
- [ ] Les fichiers sont uploadés sur GitHub
- [ ] La release GitHub est publiée (pas en draft)

## 💡 Astuce Pro

Ajoutez cette commande après chaque build :

```bash
pnpm run build && pnpm run check-release
```

Cela vérifie automatiquement que tout est prêt !

## 🎯 Résumé

| ✅ À Faire                          | ❌ À NE PAS Faire                    |
| ----------------------------------- | ------------------------------------ |
| Lancer `pnpm run build`             | Modifier `latest.yml` manuellement   |
| Uploader `latest.yml` ET le `.exe`  | Renommer les fichiers après le build |
| Vérifier que les noms correspondent | Oublier d'uploader `latest.yml`      |
| Publier la release sur GitHub       | Garder la release en draft           |

---

**En résumé :** `latest.yml` est généré automatiquement, uploadez-le tel quel sur GitHub avec le fichier `.exe`, et tout fonctionnera ! 🚀
