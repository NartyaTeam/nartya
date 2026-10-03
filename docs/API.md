# API Nartya

L'API sert le catalogue d'anime et de manga, les fiches, les saisons, les épisodes et leurs
métadonnées, en JSON, à l'adresse `https://anime.nartya.app/v1`.

- **Documentation** : <https://nartya.app/api/>
- **Spécification OpenAPI** : [`openapi.yaml`](openapi.yaml), la référence de la doc ci-dessus.
  Elle s'importe telle quelle dans Postman, Insomnia ou un générateur de client.

## En bref

Créez une clé dans l'application (**Paramètres → Clés d'API**, compte avec Discord lié), puis :

```bash
curl -H "Authorization: Bearer nk_votre_cle" \
  "https://anime.nartya.app/v1/anime/search?q=naruto"
```

Une clé est en lecture seule, limitée à 60 requêtes par minute, et n'ouvre pas la lecture
vidéo. Les réponses suivent `{ "data": …, "meta": { … } }`, les erreurs
`{ "error": { "code": "…", "message": "…" } }`.

Pour travailler sur l'application elle-même, rien à configurer : connectez-vous avec votre
compte Nartya, l'app envoie sa session à chaque appel.

## Modifier la spécification

Toute route ajoutée, retirée ou changée dans l'API se reporte dans `openapi.yaml`, puis :

```bash
npx @redocly/cli lint docs/openapi.yaml
```

Le fichier est ensuite copié dans `nartya-web/api/openapi.yaml` et envoyé sur le serveur avec
la page.
