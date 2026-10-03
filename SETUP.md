# Configuration

## Développer sur l'application

```bash
npm install
cp .env.example .env
npm run electron:dev
```

`.env.example` contient les valeurs publiques du projet Nartya : rien à renseigner. Une fois
l'app lancée, connectez-vous avec votre compte Nartya (e-mail ou Discord). L'app appelle alors
l'API publique `https://anime.nartya.app` avec votre session, exactement comme la version
installée : catalogue, fiches, épisodes et lecture vidéo fonctionnent. Vos actions (favoris,
progression…) sont enregistrées sur votre vrai compte.

`npm run dev:web` lance la même chose dans le navigateur, sans Electron. Ouvrez l'app via
`localhost` ou `127.0.0.1` : ce sont les seules adresses locales où le captcha de connexion
(Cloudflare Turnstile) s'affiche.

`npm run electron:dev` et `npm run dev:web` choisissent l'API toute seuls : l'API publique, ou
l'API locale si un dossier `api/` est présent à la racine (équipe Nartya). La variable
`NARTYA_DEV_API` force une adresse :

```bash
NARTYA_DEV_API=https://anime.nartya.app npm run electron:dev
```

La documentation de l'API est sur <https://nartya.app/api/>. Pour appeler à la main une route
réservée à l'application, utilisez le jeton de votre session (voir « Session de
l'application » dans la documentation).

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clé publique (anon) du projet |
| `VITE_DISCORD_RPC_CLIENT_ID` | Application ID Discord pour la Rich Presence (facultatif) |
| `VITE_API_URL` | URL de l'API en build de production (facultatif, défaut dans `src/config/instance.js`) |

La clé anon est publique par nature : elle est embarquée dans l'application. La sécurité
repose sur la RLS et sur les fonctions SQL du schéma.

## Héberger son propre Supabase

Inutile pour contribuer : l'API publique n'accepte que les sessions du Supabase de Nartya.
Cette partie sert à monter une instance indépendante.

Le schéma complet est dans `supabase/schema.sql` : tables, fonctions, policies, droits,
buckets de stockage et tâches planifiées, sans données. Sur un projet Supabase neuf, activer
l'extension `pg_cron`, puis le charger dans l'éditeur SQL ou avec `psql` :

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/schema.sql
```

La RLS est activée sur toutes les tables : chaque utilisateur ne lit et n'écrit que ses
lignes, et les opérations sensibles passent par des fonctions SQL.

### Connexion Discord

1. Dans le [portail développeur Discord](https://discord.com/developers/applications), créer
   une application. Onglet **OAuth2 → Redirects**, ajouter :
   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```
   Noter le **Client ID** et le **Client Secret**.
2. Dans Supabase, **Authentication → Providers → Discord** : activer le fournisseur et
   coller ces deux valeurs.
3. Dans Supabase, **Authentication → URL Configuration → Redirect URLs**, ajouter :
   ```
   nartya://auth-callback
   https://<site>/callback
   http://127.0.0.1:8351/auth-callback
   http://127.0.0.1:8352/auth-callback
   http://127.0.0.1:8353/auth-callback
   ```
   Le deep-link ramène vers l'application. `<site>` est le `SITE_URL` de
   `src/config/instance.js` : sa page `/callback` rebondit vers le deep-link. Les adresses
   locales servent sur Linux et ChromeOS, où le deep-link est peu fiable.

Le mode visiteur utilise les connexions anonymes de Supabase (**Authentication → Providers →
Anonymous**).

### Adresses de l'instance

Les adresses du service (site, API, Discord, contact, clé Turnstile) sont toutes dans
`src/config/instance.js`, et celles de Supabase dans `.env`. Quelques fichiers ne peuvent pas
l'importer et sont à modifier à la main :

- `package.json` : `homepage`, `author.email`, `build.publish.url` (mises à jour desktop) ;
- `android/app/src/main/AndroidManifest.xml` : domaine du lien `/callback` (`android:host`) ;
- `.github/ISSUE_TEMPLATE/config.yml` : adresse de contact.

### Rich Presence Discord

L'application Discord doit avoir, dans **Rich Presence → Art Assets**, une image nommée
`nartya_logo`.

### Premier administrateur

Après une première connexion, dans l'éditeur SQL de Supabase :

```sql
update public.profiles set role = 'admin' where username = '<pseudo>';
```
