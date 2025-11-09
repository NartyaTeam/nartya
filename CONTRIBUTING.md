# 🤝 Guide de Contribution

Merci de votre intérêt pour contribuer à Nartya ! Ce document vous guidera à travers le processus de contribution.

## 📋 Table des matières

- [Code de conduite](#code-de-conduite)
- [Comment contribuer](#comment-contribuer)
- [Standards de code](#standards-de-code)
- [Process de Pull Request](#process-de-pull-request)
- [Signaler des bugs](#signaler-des-bugs)
- [Proposer des fonctionnalités](#proposer-des-fonctionnalités)

## 📜 Code de conduite

En participant à ce projet, vous acceptez de respecter notre code de conduite :

- Soyez respectueux et inclusif
- Acceptez les critiques constructives
- Concentrez-vous sur ce qui est meilleur pour la communauté
- Faites preuve d'empathie envers les autres membres

## 🚀 Comment contribuer

### 1. Fork et Clone

```bash
# Fork le repo sur GitHub, puis :
git clone https://github.com/VOTRE-USERNAME/nartya-app.git
cd nartya-app
```

### 2. Installer les dépendances

```bash
pnpm install
```

### 3. Créer une branche

```bash
git checkout -b feature/ma-nouvelle-fonctionnalite
# ou
git checkout -b fix/correction-bug
```

### 4. Faire vos modifications

- Écrivez du code propre et lisible
- Commentez les parties complexes
- Testez vos modifications localement

### 5. Tester

```bash
# Lancer l'application en mode dev
pnpm dev

# Tester le build
pnpm build
```

### 6. Commit

Utilisez des messages de commit clairs et descriptifs :

```bash
git commit -m "feat: ajouter la fonctionnalité X"
git commit -m "fix: corriger le bug Y"
git commit -m "docs: mettre à jour le README"
git commit -m "style: améliorer le CSS de Z"
git commit -m "refactor: restructurer le module W"
```

**Convention de commit :**

- `feat:` - Nouvelle fonctionnalité
- `fix:` - Correction de bug
- `docs:` - Documentation
- `style:` - Formatage, CSS
- `refactor:` - Refactoring de code
- `perf:` - Amélioration de performance
- `test:` - Ajout de tests
- `chore:` - Maintenance

### 7. Push

```bash
git push origin feature/ma-nouvelle-fonctionnalite
```

### 8. Pull Request

Ouvrez une Pull Request sur GitHub avec :

- Un titre clair
- Une description détaillée des changements
- Des captures d'écran si pertinent
- La référence à l'issue liée (si applicable)

## 📐 Standards de code

### JavaScript

```javascript
// ✅ BON
async function fetchAnimeData(animeId) {
  try {
    const response = await fetch(`/api/anime/${animeId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Erreur lors du fetch:", error);
    throw error;
  }
}

// ❌ MAUVAIS
function fetchAnimeData(animeId) {
  fetch("/api/anime/" + animeId)
    .then((r) => r.json())
    .then((d) => console.log(d));
}
```

### Bonnes pratiques

- **Nommage** : Utilisez des noms descriptifs (`getUserData` plutôt que `getData`)
- **Fonctions** : Une fonction = une responsabilité
- **Commentaires** : Expliquez le "pourquoi", pas le "quoi"
- **Gestion d'erreurs** : Toujours gérer les erreurs avec try/catch
- **Async/Await** : Préférer async/await aux Promises chaînées
- **Console logs** : Retirer les console.log de debug avant commit

### CSS

```css
/* ✅ BON - Classes descriptives et organisation claire */
.anime-card {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  transition: transform 0.3s ease;
}

.anime-card:hover {
  transform: translateY(-5px);
}

/* ❌ MAUVAIS - Classes vagues et styles inline */
.card1 {
  ...;
}
```

### Structure des fichiers

- Gardez les fichiers sous 500 lignes si possible
- Séparez les responsabilités (UI, logique, data)
- Utilisez des modules ES6 (`import`/`export`)

## 🔍 Process de Pull Request

1. **Vérification automatique** : Les GitHub Actions vont vérifier votre code
2. **Review** : Un mainteneur reviewera votre PR
3. **Modifications** : Apportez les changements demandés si nécessaire
4. **Merge** : Une fois approuvée, votre PR sera mergée !

### Checklist avant PR

- [ ] Le code fonctionne localement
- [ ] Pas d'erreurs dans la console
- [ ] Le build passe (`pnpm build`)
- [ ] Les messages de commit sont clairs
- [ ] La documentation est à jour si nécessaire
- [ ] Pas de fichiers inutiles (logs, node_modules, etc.)

## 🐛 Signaler des bugs

### Avant de signaler

1. Vérifiez que le bug n'a pas déjà été signalé
2. Testez avec la dernière version
3. Rassemblez les informations nécessaires

### Template de bug report

```markdown
**Description du bug**
Description claire et concise du bug.

**Étapes pour reproduire**

1. Aller sur '...'
2. Cliquer sur '...'
3. Voir l'erreur

**Comportement attendu**
Ce qui devrait se passer.

**Comportement actuel**
Ce qui se passe réellement.

**Captures d'écran**
Si applicable.

**Environnement**

- OS: [e.g. Windows 11]
- Version de Nartya: [e.g. 1.1.0]
- Version d'Electron: [e.g. 33.2.0]

**Logs**
```

Coller les logs d'erreur ici

```

```

## 💡 Proposer des fonctionnalités

### Template de feature request

```markdown
**La fonctionnalité**
Description claire de la fonctionnalité proposée.

**Problème résolu**
Quel problème cette fonctionnalité résout-elle ?

**Solution proposée**
Comment devrait-elle fonctionner ?

**Alternatives considérées**
Y a-t-il d'autres façons de résoudre ce problème ?

**Contexte additionnel**
Captures d'écran, mockups, etc.
```

## 🎯 Domaines de contribution

Vous pouvez contribuer dans plusieurs domaines :

- **Code** : Nouvelles fonctionnalités, corrections de bugs
- **Design** : Amélioration de l'UI/UX
- **Documentation** : Améliorer le README, guides, commentaires
- **Tests** : Ajouter des tests automatisés
- **Traduction** : Ajouter le support de nouvelles langues
- **Performance** : Optimiser le code existant

## 📞 Besoin d'aide ?

- Ouvrez une [issue](https://github.com/RandomZeleff/nartya-app/issues) avec le label `question`
- Consultez les [issues existantes](https://github.com/RandomZeleff/nartya-app/issues)
- Contactez [@RandomZeleff](https://github.com/RandomZeleff)

## 🙏 Merci !

Chaque contribution, petite ou grande, est précieuse. Merci de prendre le temps d'améliorer Nartya !

---

<p align="center">Fait avec ❤️ par la communauté Nartya</p>
