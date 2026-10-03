<div align="center">
  <img src="public/icon.png" alt="Nartya" width="120" />
  <h1>Nartya</h1>
  <p>Application de streaming d'anime pour le bureau, Android et iOS.</p>
</div>

---

Nartya réunit un catalogue d'anime, un lecteur vidéo et le suivi de ce que l'on regarde :
reprise de lecture, favoris, listes, profil, succès, watch party, téléchargement hors ligne
et lecture de scans.

Ce dépôt contient l'application cliente. Elle s'appuie sur deux services :

- une **API** qui fournit le catalogue, les épisodes et les métadonnées, documentée sur
  [nartya.app/api](https://nartya.app/api/) ([spécification OpenAPI](docs/openapi.yaml)) ;
- un projet **Supabase** pour les comptes et les données utilisateur.

> Le code de l'API n'est pas public, seul son contrat l'est. En développement, l'app se
> branche sur l'API publique et sur le Supabase de Nartya : il suffit d'un compte Nartya.

## Stack

- **Interface** : Vite, React 18, React Router (HashRouter), Zustand, Tailwind
- **Lecteur** : ArtPlayer, hls.js, avec un proxy de lecture local
- **Bureau** : Electron (Windows, macOS, Linux)
- **Mobile** : Capacitor (Android, iOS)
- **Données et comptes** : Supabase (Postgres, RLS, OAuth Discord)

## Démarrer

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
cp .env.example .env
npm run electron:dev   # fenêtre Electron
```

Connectez-vous ensuite avec votre compte Nartya : l'app appelle l'API publique avec votre
session, comme la version installée. `.env.example` contient déjà les valeurs publiques du
projet. Le détail est dans [SETUP.md](SETUP.md).

```bash
npm run dev:web        # interface seule, dans le navigateur
npm run lint
npm run test:unit
npm run build
```

La lecture vidéo (résolution des sources et proxy local) ne fonctionne que dans Electron et
dans les apps mobiles. Dans le navigateur, le reste de l'interface est utilisable.

### Android et iOS

Le code de `src/` est le même, empaqueté par [Capacitor](https://capacitorjs.com/).

```bash
npm run android:sync    # build web + synchronisation du projet Android
npm run android:debug   # APK de debug
npm run ios:sync
npm run ios:test        # tests du paquet Swift
```

Détails dans [docs/MOBILE.md](docs/MOBILE.md).

## Structure

```
electron/        Processus principal : fenêtre, deep-link nartya://, proxy de lecture,
                 téléchargements, cast
src/
  api/           Appels à l'API et à Supabase
  components/    Composants d'interface
  config/        Adresses de l'instance, réglages de l'API
  pages/         Écrans
  platform/      Adaptateurs Electron, Capacitor et navigateur
  shared/        Code commun au renderer et au processus principal
  stores/        État global (Zustand)
  utils/, lib/   Logique sans interface
android/, ios/   Projets natifs Capacitor
supabase/        Schéma SQL (tables, RLS, fonctions)
test/            Tests unitaires
```

Les adresses du service (site, API, Discord) sont regroupées dans
[`src/config/instance.js`](src/config/instance.js).

## Licence

ISC © NartyaTeam
