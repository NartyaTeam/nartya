# Contribuer

Merci de l'intérêt porté au projet. Pour installer et lancer l'application, voir
[README.md](README.md) et [SETUP.md](SETUP.md).

## Avant d'ouvrir une pull request

```bash
npm run lint
npm run test:unit
npm run build
```

Les trois doivent passer. Un changement dans `electron/` se vérifie aussi en lançant
l'application, le navigateur ne suffit pas.

## Conventions

- **Commits** : [conventional commits](https://www.conventionalcommits.org/) en français,
  avec un scope. Exemple : `fix(lecteur): reprise à la bonne position après un changement de langue`.
- **Commentaires** : seulement quand le « pourquoi » n'est pas évident, en une ou deux
  lignes. L'historique d'un bug va dans le message de commit, pas dans le code.
- **Style** : suivre celui du fichier modifié.
- **Texte d'interface** : en français.
- Une fonctionnalité ajoutée, retirée ou masquée sur mobile se reporte dans
  [docs/MOBILE-FEATURES.md](docs/MOBILE-FEATURES.md) dans le même commit.

## Signaler un problème

Un bug : une issue avec la version, la plateforme et les étapes pour le reproduire.
Une faille de sécurité : voir [SECURITY.md](SECURITY.md).
