# 🔒 Politique de Sécurité

## 🛡️ Versions Supportées

Nous fournissons des mises à jour de sécurité pour les versions suivantes de Nartya :

| Version | Supportée |
| ------- | --------- |
| 1.1.x   | ✅ Oui    |
| 1.0.x   | ✅ Oui    |
| < 1.0   | ❌ Non    |

## 🚨 Signaler une Vulnérabilité

Si vous découvrez une vulnérabilité de sécurité dans Nartya, merci de **ne pas** créer d'issue publique.

### Processus de signalement

1. **Contactez-nous en privé** via :

   - Email : [Créer une issue privée sur GitHub]
   - GitHub Security Advisory : [Créer un advisory](https://github.com/RandomZeleff/nartya-app/security/advisories/new)

2. **Informations à fournir** :

   - Description détaillée de la vulnérabilité
   - Étapes pour reproduire le problème
   - Impact potentiel
   - Version(s) affectée(s)
   - Suggestions de correction (si possible)

3. **Délai de réponse** :
   - Accusé de réception : **48 heures**
   - Première évaluation : **7 jours**
   - Correction et publication : **30 jours** (selon la gravité)

### Ce que nous attendons de vous

- Ne pas exploiter la vulnérabilité au-delà de ce qui est nécessaire pour la démontrer
- Ne pas divulguer publiquement la vulnérabilité avant qu'un correctif soit disponible
- Faire preuve de bonne foi dans vos recherches

### Ce que vous pouvez attendre de nous

- Confirmation de réception de votre rapport dans les 48 heures
- Évaluation et communication régulière sur l'avancement
- Crédit public pour votre découverte (si vous le souhaitez)
- Notification lorsqu'un correctif est publié

## 🔐 Bonnes Pratiques de Sécurité

### Pour les utilisateurs

- ✅ Toujours télécharger Nartya depuis les [releases officielles](https://github.com/RandomZeleff/nartya-app/releases)
- ✅ Vérifier la signature des fichiers téléchargés
- ✅ Maintenir l'application à jour (l'auto-update est activé par défaut)
- ✅ Ne pas modifier les fichiers de l'application

### Pour les développeurs

- ✅ Ne jamais committer de secrets (API keys, tokens, mots de passe)
- ✅ Valider et sanitiser toutes les entrées utilisateur
- ✅ Utiliser des dépendances à jour et vérifiées
- ✅ Suivre les principes de sécurité Electron :
  - Context isolation activé
  - Node integration désactivé dans le renderer
  - Communication via IPC sécurisé

## 🛠️ Mesures de Sécurité Implémentées

### Architecture

- **Context Isolation** : Séparation stricte entre le processus principal et le renderer
- **Preload Script** : Bridge sécurisé pour l'exposition des APIs
- **IPC Handlers** : Validation des messages inter-processus
- **Content Security Policy** : Protection contre les injections XSS

### Données

- **Stockage local** : Aucune donnée sensible n'est stockée
- **Pas de tracking** : Aucune collecte de données personnelles
- **Pas d'analytics** : Respect total de la vie privée

### Réseau

- **HTTPS uniquement** : Toutes les requêtes externes utilisent HTTPS
- **Validation des URLs** : Vérification des sources de vidéos
- **Pas de télémétrie** : Aucune donnée envoyée à des serveurs tiers

### Mises à jour

- **Auto-update sécurisé** : Vérification des signatures via electron-updater
- **GitHub Releases** : Source unique et vérifiable
- **Checksum validation** : Vérification de l'intégrité des fichiers

## 📚 Ressources

- [Electron Security Guidelines](https://www.electronjs.org/docs/latest/tutorial/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

## 🙏 Remerciements

Nous remercions tous les chercheurs en sécurité qui contribuent à rendre Nartya plus sûr.

---

**Dernière mise à jour** : Novembre 2025
