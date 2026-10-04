# Android et iOS

Les apps mobiles reprennent le code React de `src/`, empaqueté par Capacitor. Ce qui change
d'une plateforme à l'autre passe par `src/platform/`. La liste de ce qui est disponible ou
non sur mobile, page par page, est dans [MOBILE-FEATURES.md](MOBILE-FEATURES.md).

## Commandes

```bash
npm run android:sync    # build web + synchronisation du projet Android
npm run android:debug   # APK de debug
npm run android:open    # Android Studio

npm run ios:sync        # build web + synchronisation du projet iOS (sur Mac)
npm run ios:open        # Xcode : simulateur ou iPhone avec un Apple ID gratuit
npm run ios:test        # tests du paquet Swift, sans simulateur
```

Sur iOS, le Web Inspector de Safari (Développement → appareil → Nartya) inspecte les builds
de debug.

## Architecture

```
src/platform/     electron.js, capacitor.js, web.js : même interface, choisie au démarrage
src/mobile/       les trois écrans propres au mobile (coque à onglets, recherche, nouveautés)
android/app/src/main/java/com/nartya/app/
  proxy/          proxy local et téléchargements
  player/ screen/ share/ update/   plugins Capacitor
ios/NartyaNative/ moteur du proxy et des téléchargements (paquet Swift sans dépendance)
ios/App/App/Plugins/               plugins Capacitor au-dessus de ce paquet
```

Les pages sont partagées : une fonctionnalité ajoutée à une page arrive aussi sur mobile,
sauf si elle est masquée avec `platform.isMobile` / `platform.isDesktop`. Une entrée à `null`
ou `noop` dans `capacitor.js` signifie que la fonction n'existe pas sur mobile.

### Proxy local

La lecture passe, comme sur desktop, par un serveur HTTP local sur `127.0.0.1` : il relaie
les flux avec les bons en-têtes, réécrit les playlists HLS, gère `Range` et sert les fichiers
téléchargés (route `/local`). Sur Android c'est `ProxyServer.java` (NanoHTTPD + OkHttp), sur
iOS `NartyaProxyCore` (`Network.framework`).

Le Java fait référence : le Swift en reprend les routes, le jeton et les protections
(anti-SSRF, anti-traversée de chemin, `Range` strict), avec les mêmes tests. Les règles des
hébergeurs ne sont pas dans l'app : elles viennent de l'API à la connexion et restent en
mémoire (`src/shared/sourceRecipe.js`), puis sont transmises au proxy natif.

## Versions

Chaque plateforme a sa propre version et son propre journal des nouveautés :

| Plateforme | Version | Journal |
| --- | --- | --- |
| Desktop | `package.json` | `src/data/changelog.js` |
| Android | `android/version.json` | `src/data/changelog.mobile.js` |
| iOS | `ios/version.json` | `src/data/changelog.ios.js` |

`@capacitor/ios` et `@capacitor/android` restent à la même version que `@capacitor/core`.

## Pièges connus

**Android**

- `screen.orientation.lock()` ne fonctionne pas dans la WebView : l'orientation passe par le
  plugin `ScreenPlugin`.
- La CSP du build interdit les scripts inline. Sur une WebView trop ancienne, Capacitor injecte
  son bridge en script inline : il serait bloqué et l'app se croirait dans un navigateur.

**iOS**

- iOS récupère le port d'écoute d'une app suspendue, parfois sans que `NWListener` change
  d'état : au retour au premier plan, le proxy est éprouvé par une vraie requête et relancé sur
  le même port si possible, sinon l'événement `proxyRestarted` vide le cache de flux. Côté JS,
  une requête au proxy qui échoue en réseau le fait vérifier et relancer avant un second essai.
- `URLSession` n'a pas de point d'entrée DNS : le filtrage d'adresse se fait avant chaque
  requête et à chaque redirection.
- `URLSession` décompresse les réponses : le `Content-Length` amont n'est relayé que sans
  `Content-Encoding`.
- Turnstile refuse l'origine `capacitor://localhost` : le captcha s'ouvre dans le navigateur
  et revient par `nartya://captcha-callback`, comme sur Android.
- Sans service de premier plan, iOS suspend les téléchargements : ils passent en
  « interrompu » à la fin du délai de grâce et reprennent au retour dans l'app.
- Pendant une lecture WKWebView, les boutons de volume se suivent avec la notification
  `SystemVolumeDidChange` (le KVO `outputVolume` ne se déclenche pas).
- `identifierForVendor` change à chaque réinstallation ou nouvelle signature.

## Distribution

Android : APK hors Play Store, mise à jour proposée depuis l'app. iOS : IPA non signée,
installée par SideStore ou AltStore, qui la signent avec l'Apple ID de l'utilisateur (sept
jours de validité, trois apps au plus avec un compte gratuit).
