# 🤖 Release Automatique avec GitHub Actions

Guide pour automatiser complètement vos releases : plus besoin d'uploader manuellement les fichiers !

---

## 🎯 Qu'est-ce que ça Change ?

### ❌ Avant (Manuel)

```bash
pnpm run release:minor
# → Puis aller sur GitHub
# → Créer la release manuellement
# → Uploader les fichiers .exe et latest.yml
# → Publier
```

### ✅ Maintenant (Automatique)

```bash
pnpm run release:minor
# → C'EST TOUT ! 🎉
# GitHub Actions fait le reste automatiquement
```

---

## 🚀 Comment ça Marche ?

### 1. Vous lancez une release

```bash
pnpm run release:minor
```

### 2. Ce qui se passe automatiquement :

```
1. npm version minor
   ↓ (met à jour package.json : 1.0.0 → 1.1.0)

2. git commit + git tag v1.1.0
   ↓

3. git push + git push --tags
   ↓ (envoie le tag sur GitHub)

4. GitHub détecte le nouveau tag "v1.1.0"
   ↓

5. GitHub Actions démarre automatiquement :
   - Installe les dépendances
   - Build l'application
   - Crée la release GitHub
   - Upload les fichiers (.exe, latest.yml, .blockmap)
   - Publie la release
   ↓

6. ✅ Release publiée !
   Les utilisateurs reçoivent la notification de mise à jour
```

---

## 📋 Configuration (Déjà Faite !)

Le fichier `.github/workflows/release.yml` est déjà configuré. Voici ce qu'il fait :

```yaml
name: Release

on:
  push:
    tags:
      - "v*.*.*" # Se déclenche sur v1.0.0, v1.2.3, etc.

jobs:
  release:
    runs-on: windows-latest # Build sur Windows

    steps:
      - Checkout du code
      - Installation de Node.js et pnpm
      - Installation des dépendances
      - Build de l'application
      - Création de la release et upload des fichiers
```

---

## 🎯 Workflow Complet

### Pour une correction de bug (patch)

```bash
pnpm run release:patch
```

**Résultat :** 1.0.0 → 1.0.1 + release automatique

### Pour une nouvelle fonctionnalité (minor)

```bash
pnpm run release:minor
```

**Résultat :** 1.0.0 → 1.1.0 + release automatique

### Pour un breaking change (major)

```bash
pnpm run release:major
```

**Résultat :** 1.0.0 → 2.0.0 + release automatique

---

## 📊 Suivre la Progression

### 1. Après avoir lancé `pnpm run release:*`

Allez sur GitHub : `https://github.com/votre-username/nartya/actions`

### 2. Vous verrez le workflow "Release" en cours

```
🟡 Release (en cours)
   ├─ 📥 Checkout code
   ├─ 📦 Setup Node.js
   ├─ 📦 Setup pnpm
   ├─ 📥 Install dependencies
   ├─ 🔨 Build application (en cours...)
   └─ 🚀 Create Release and Upload Assets
```

### 3. Après 5-10 minutes

```
✅ Release (terminé)
```

### 4. La release est publiée !

Allez sur : `https://github.com/votre-username/nartya/releases`

Vous verrez votre nouvelle release avec tous les fichiers uploadés automatiquement ! 🎉

---

## 🔍 Vérifier que ça Fonctionne

### Première fois : Test

1. **Faites un commit de test** :

   ```bash
   git add .
   git commit -m "test: configuration GitHub Actions"
   git push
   ```

2. **Lancez une release de test** :

   ```bash
   pnpm run release:patch
   ```

3. **Allez sur GitHub Actions** :
   `https://github.com/votre-username/nartya/actions`

4. **Vérifiez le workflow** :

   - Il doit être en cours (🟡) ou terminé (✅)
   - S'il y a une erreur (❌), cliquez dessus pour voir les logs

5. **Vérifiez la release** :
   `https://github.com/votre-username/nartya/releases`
   - La release doit être créée
   - Les fichiers doivent être uploadés (.exe, latest.yml)

---

## ⚙️ Personnalisation

### Modifier le Message de Release

Éditez `.github/workflows/release.yml` :

```yaml
- name: 🚀 Create Release and Upload Assets
  uses: softprops/action-gh-release@v1
  with:
    files: |
      dist/*.exe
      dist/latest.yml
      dist/*.blockmap
    draft: false
    prerelease: false
    generate_release_notes: true # ← Génère automatiquement les notes
    body: | # ← Ou ajoutez un message personnalisé
      ## 🎉 Nouvelle version !

      Téléchargez l'installateur ci-dessous.
```

### Créer une Release en Draft

Si vous voulez vérifier avant de publier :

```yaml
draft: true # ← La release sera en brouillon
```

Vous devrez ensuite la publier manuellement sur GitHub.

---

## 🚨 Résolution de Problèmes

### ❌ "Build failed"

**Cause :** Erreur lors du build

**Solution :**

1. Testez le build localement : `pnpm run build`
2. Si ça marche localement, vérifiez les logs GitHub Actions
3. Assurez-vous que toutes les dépendances sont dans `package.json`

### ❌ "Permission denied"

**Cause :** GitHub Actions n'a pas les permissions

**Solution :**

1. Allez dans Settings → Actions → General
2. Sous "Workflow permissions", sélectionnez "Read and write permissions"
3. Sauvegardez

### ❌ "No such file or directory: dist/\*.exe"

**Cause :** Le build n'a pas créé les fichiers

**Solution :**

1. Vérifiez que `electron-builder` est bien configuré dans `package.json`
2. Vérifiez que le script `build` fonctionne localement

### ❌ Le workflow ne se déclenche pas

**Cause :** Le tag n'est pas au bon format

**Solution :**

- Les tags doivent être au format `v1.0.0` (avec le "v")
- Utilisez `pnpm run release:*` qui crée automatiquement le bon format

---

## 💡 Astuces Pro

### 1. Ajouter un Changelog Automatique

Le workflow génère déjà les notes de release automatiquement avec :

```yaml
generate_release_notes: true
```

Cela liste tous les commits depuis la dernière release !

### 2. Notifier sur Discord/Slack

Ajoutez à la fin du workflow :

```yaml
- name: 📢 Notify Discord
  if: success()
  run: |
    curl -X POST "VOTRE_WEBHOOK_DISCORD" \
      -H "Content-Type: application/json" \
      -d '{"content":"🎉 Nouvelle version publiée : ${{ github.ref_name }}"}'
```

### 3. Build Multi-Plateformes

Pour builder aussi pour macOS et Linux :

```yaml
strategy:
  matrix:
    os: [windows-latest, macos-latest, ubuntu-latest]
runs-on: ${{ matrix.os }}
```

---

## 📝 Checklist Première Release

- [ ] Le fichier `.github/workflows/release.yml` existe
- [ ] Vous avez commit et push tous vos changements
- [ ] Vous avez configuré les permissions GitHub Actions (Settings → Actions)
- [ ] Vous lancez `pnpm run release:patch` (ou minor/major)
- [ ] Vous vérifiez sur GitHub Actions que le workflow fonctionne
- [ ] Vous vérifiez sur GitHub Releases que la release est créée
- [ ] Les fichiers .exe et latest.yml sont bien uploadés

---

## 🎯 Résumé

| Avant                    | Maintenant                  |
| ------------------------ | --------------------------- |
| 1. `pnpm run build`      | 1. `pnpm run release:minor` |
| 2. Aller sur GitHub      | 2. ✅ **C'EST TOUT !**      |
| 3. Créer la release      |                             |
| 4. Uploader les fichiers |                             |
| 5. Publier               |                             |

**Temps gagné :** ~5-10 minutes par release ! ⏱️

---

## 🔗 Ressources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [softprops/action-gh-release](https://github.com/softprops/action-gh-release)
- [electron-builder CI](https://www.electron.build/configuration/publish#github-repository)

---

**En résumé :** Une seule commande, et GitHub fait tout le reste automatiquement ! 🚀
