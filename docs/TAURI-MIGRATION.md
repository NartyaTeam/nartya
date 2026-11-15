# Migration de la coque desktop : Electron → Tauri

Statut : plan (2026-11-13). Rien n'est implémenté.

## Périmètre

- Remplace uniquement `electron/` (~4 900 lignes de Node, 29 fichiers) par une coque Rust dans `src-tauri/`.
- Le front (React, `src/`) reste en JavaScript : Tauri l'affiche dans WebView2.
- L'API (`api/`, Node sur le VPS) n'est pas touchée.
- Android et iOS ne sont pas touchés : `src/platform/` isole déjà Electron, Capacitor et le web, il suffit d'ajouter `tauri.js` à côté.
- **Windows d'abord.** Linux et macOS restent sur Electron tant qu'ils ne sont pas validés.

## Motivation

Matériel modeste (ex. GTX 1060 + CPU faible) : Electron embarque Chromium + Node par app (~130 Mo, 100-200 Mo de RAM au repos), Tauri réutilise le WebView2 système.

Ne résout pas le calcul GPU (Anime4K, décodage vidéo) : même moteur Chromium dans WebView2.

## Windows d'abord n'est pas du code spécifique Windows

Le code Rust est écrit pour toutes les plateformes. « Windows d'abord » limite ce qu'on valide, ce qu'on package et ce qu'on publie.

Les rares points propres à une plateforme passent par `#[cfg(target_os = "...")]` et ne se perdent pas :
- flag `DirectCompositionVideoOverlays` (Windows, via les arguments WebView2) ;
- contournements Crostini / Vulkan (Linux, non repris pour l'instant) ;
- pare-feu (`firewall-check`) et résolution de l'exécutable du Hub : une implémentation Windows, le reste en `cfg` ou en stub ;
- enregistrement du protocole `nartya://`.

Règle : pas de chemins, séparateurs ou API Windows en dur hors de ces modules.

## Ce qui existe côté front

Contrat actuel : `window.electronAPI` (45 méthodes, voir `electron/preload.js`). Il n'est utilisé que dans :
`src/platform/electron.js`, `src/platform/index.js`, `src/lib/captcha.js`, `src/utils/anime4k.js`, `src/components/AnimePage/ExternalWatch.jsx`, `src/components/UpdateRequiredScreen.jsx`.

Stratégie : garder ce contrat tel quel et l'implémenter en commandes Tauri (`invoke` + événements). Renommer plus tard, pas pendant la migration.

## Risques et décisions

| Risque | Décision |
|---|---|
| Origine `file://` → `tauri.localhost` : le `localStorage` ne suit pas | Migration unique à prévoir (phase 0) |
| Téléchargements hors ligne et session partagée avec le Hub | Même dossier, même format de fichiers, jamais de nouveau schéma |
| Captcha : `executeJavaScript` → résultat impossible tel quel | Token renvoyé par navigation interceptée ou événement |
| Hub : mises à jour et installation passent par lui | Garder un manifeste compatible ; gérer la désinstallation de l'ancien Electron |
| Logique partagée JS/Rust (extraction vidéo, recettes) | Tests communs (golden tests sur les cas de `test/`) |
| Antivirus (app non signée) | Surveiller VirusTotal dès le premier build |
| WebView2 absent (vieux Windows 10) | Bootstrapper dans l'installeur |
| Permissions IPC | Capabilities Tauri à la place de `secureIpc` / `isTrustedSender` |

## Correspondance des modules

| Electron | Rust |
|---|---|
| `local-proxy-server`, `segment-cache`, `read-ahead`, `byte-range`, `hls-playlist` | axum / hyper |
| `provider-fetch`, `doh-resolver` | reqwest + hickory-dns (DoH) |
| `stream-resolver`, `video-extract`, `source-recipe`, `stream-handles` | module `resolver` |
| `shared-session` | fichier partagé + crate `notify` |
| `auth-callback-server` | listener loopback |
| `captcha-window` | fenêtre secondaire |
| `download-*` + `ffmpeg-static` | module `downloads` + ffmpeg en sidecar |
| `cast-manager`, `lan-address` | `rust-cast` + `mdns-sd` |
| `discord-rpc` | `discord-rich-presence` |
| `hub-launcher` | `std::process` + `cfg` |
| `updater` | inutile : les mises à jour passent par le Hub |

## Phases

### Phase 0 : spikes (quelques jours)

Valider dans WebView2 sur Windows :
- WebGPU et Anime4K ;
- lecture HLS via un proxy local ;
- plein écran avec `DirectCompositionVideoOverlays` désactivé ;
- captcha Cloudflare Turnstile ;
- migration du `localStorage`.

Sortie : go / no-go et liste des surprises. Si un point échoue, on le sait avant d'avoir écrit la coque.

#### Résultats (2026-11-13, spike jetable, Tauri 2.12 / WebView2 157, RTX 4060, écran 2560×1440 à 150 %)

**Verdict : go pour Windows.** Aucun point bloquant.

| Point | Résultat |
|---|---|
| Compilation | Tauri + axum + reqwest : 2 min la 1re fois, 10 s en incrémental |
| WebGPU | OK : adaptateur NVIDIA, `shader-f16`, textures 16 384 px. Anime4K devrait tourner comme sous Electron |
| Codecs / MSE | H.264, HEVC, VP9, AV1, AAC : tous supportés |
| HLS via proxy axum local | OK : manifeste réécrit, 5 niveaux, 720p, 0 image perdue sur 123 |
| MP4 via proxy (Range, seek) | OK : `206` + `Content-Range` corrects, seek à 100 s sur un fichier local |
| Captcha Turnstile | OK : vrai token obtenu en ~6 s, sans interaction, depuis `https://nartya.app/captcha.html` |
| Flag `DirectCompositionVideoOverlays` | Bien transmis à WebView2 (vérifié sur la ligne de commande du process) |
| Plein écran HTML | La fenêtre passe seule en plein écran natif (2560×1440, DPR 1,5), retour propre. Le décalage d'image à mise à l'échelle ≠ 100 % est **à vérifier à l'œil** |
| `localStorage` | Persiste entre deux lancements, mais l'origine est `http://tauri.localhost` (pas `file://`) |

**Surprises et décisions :**

1. **Tous les webviews du process doivent avoir exactement les mêmes `additional_browser_args`.** Une 2e fenêtre (captcha) avec d'autres arguments échoue en `0x8007139F`. → une seule constante partagée, y compris pour les fenêtres secondaires.
2. **Captcha :** pas de `page-title-updated` ni de retour de `executeJavaScript`. Le contrat de la page (`document.title` + `window.__nartyaCaptcha`) reste inchangé grâce à un script d'initialisation qui surveille le titre et navigue vers `nartya-captcha://…`, intercepté par `on_navigation`. La page hébergée n'a pas à changer, Electron et Tauri cohabitent.
3. **L'origine de l'app Tauri est un hôte local, pas `nartya.app`** : le captcha doit rester une fenêtre sur le site (comme aujourd'hui).
4. **Migration du `localStorage` :** le `localStorage` Electron (`file://`) est illisible depuis WebView2. Plan : une dernière version Electron exporte le `localStorage` vers un fichier JSON dans le dossier de données, la coque Tauri l'importe au premier lancement. Non testé dans le spike (à faire en phase 4).
5. **Mesure de RAM non concluante** : les processus `msedgewebview2` de la machine sont partagés avec d'autres applications. À refaire proprement sur le PC modeste en phase 4.

Non couvert par la phase 0 : décalage vidéo en plein écran à l'œil, Anime4K de bout en bout dans l'app réelle, comportement sous Windows 10 sans WebView2.

### Phase 1 : squelette

- `src-tauri/` dans ce dépôt, à côté de `electron/` (deux builds en parallèle, `src/` partagé).
- `src/platform/tauri.js` + détection dans `src/platform/index.js`.
- Fenêtre, plein écran, instance unique, deep-link `nartya://`, `open-external`, infos système.
- Capabilities. CI Windows (build + lint + `cargo test`).

#### État de la phase 1 (2026-11-13, branche `feat/tauri-shell`)

Fait : `src-tauri/` (fenêtre, instance unique, deep-link `nartya://`, `open_external`, version, `app_quit` / `app_focus`, `hub_is_managed`, identifiant machine, capacités Anime4K), `src/platform/tauri.js`, job CI Windows (clippy, `cargo test`, build), scripts `npm run tauri:dev` / `tauri:build`.

Vérifié sur cette machine :
- l'app complète s'affiche dans la coque, fenêtre 1400×880 visible et focalisée après le chargement de la page ;
- les 8 commandes répondent depuis la page ; `open_external` refuse `file://` ;
- une 2e instance lancée avec `nartya://anime/…`, `nartya://party/…` ou `nartya://auth-callback#…` n'ouvre pas de fenêtre et la 1re reçoit `navigate-to` / `auth-callback` ;
- **l'identifiant machine est identique à celui qu'Electron calcule** (même empreinte sur cette machine) : les bans machine restent valables ;
- clippy sans avertissement, 11 tests Rust.

À savoir :
- un build debug lancé avec `cargo run` charge `http://localhost:5173` : passer par `npm run tauri:dev`, ou lancer Vite à côté ;
- sans pont de session, l'app affiche l'écran « connexion depuis le Hub » : la session partagée est donc le **premier chantier de la phase 2** ;
- `hub`, `session`, `downloads`, `cast`, `discord` valent `null` côté Tauri (le front les traite comme sur le web), `resolveStream` renvoie « indisponible » ;
- les arguments WebView2 incluent maintenant l'équivalent de `backgroundThrottling: false` ;
- le port de debug (CDP) n'est ouvert que si `NARTYA_CDP_PORT` est défini, en build debug.

Non vérifié : deep-link au démarrage à froid, plein écran sur un écran de moins de 1400 px logiques (Electron remettait la taille minimale à 0), build release et installeur, exécution de la CI.

### Phase 2 : cœur lecture

Proxy local, client HTTP DoH, résolveur de flux, session partagée, callback OAuth, captcha. Critère : lire un épisode de bout en bout.

#### État de la phase 2 (2026-11-13) : fait

Porté en Rust : session partagée (fichier + surveillance), retour OAuth en loopback (ports 8351-8353), captcha, lancement du Hub (et fenêtre qui attend la connexion sans session), client HTTP avec DoH et refus des adresses privées, recette des hébergeurs, extraction vidéo (6 stratégies), poignées opaques, proxy local (HLS, Range, cache de segments, lecture anticipée, URL signées, playlist préchargée) et résolveur de flux. 50 tests Rust.

Vérifié sur cette machine, avec la vraie session :
- la session du Hub est lue : l'app s'ouvre sur le compte, sans passer par l'écran de connexion ;
- **un épisode se lit de bout en bout dans l'interface réelle** (HLS 720p via le proxy Rust, seek, 0 image perdue) ; 2 sources sur 4 résolues, les 2 autres renvoient `HTTP 404` côté hébergeur (même résultat attendu avec Electron) ;
- le proxy refuse sans jeton (403), avec un mauvais jeton (403), poignée inconnue (410) ;
- le captcha rend un vrai jeton en 6-9 s, la fenêtre captcha n'a accès à aucune commande ;
- les commandes sont déclarées dans `build.rs` et autorisées par capability pour la seule fenêtre principale : un appel `plugin:opener|open_url` ou `plugin:window|close` depuis la page est refusé.

Parité avec le JavaScript : les 17 cas d'extraction testés donnent les mêmes résultats que `src/shared/videoExtract.js`. Les motifs de la recette sont de simples regex : le crate `regex` suffit, sans lookaround.

Écarts connus avec Electron :
- DoH : appliqué aux requêtes de la coque (comme avant), pas au rendu de la page (Electron le configurait via `configureHostResolver`) ;
- le serveur LAN du Cast et `/local` (fichiers téléchargés) arrivent en phase 3 ;
- `getAnime4kCapabilities` ne renvoie plus le détail du GPU (la page le déduit déjà de WebGPU).

Non vérifié : MP4 direct avec `Range` sur un vrai hébergeur (couvert par des tests unitaires seulement), temps de démarrage comparé à Electron.

### Phase 3 : le reste

Téléchargements + fusion ffmpeg (mp4 et HLS), Cast, Discord, lancement du Hub.

Découpage : 3a téléchargements, 3b Discord, 3c Cast (serveur LAN, mDNS, pare-feu).

#### Revue des phases 1-2 (2026-11-14)

Avant la phase 3, relecture complète du Rust : base saine. Corrigé : commandes avec accès disque, réseau ou lancement de processus passées en `async` (synchrones, elles tournaient sur le thread de la fenêtre) ; résolveur DNS du client qui refuse aussi les adresses privées (sauf l'hôte de l'API) ; dépaquetage sans regex compilée par jeton ; captcha « busy » en cas de double demande.

Lag de scroll sous Tauri : `-webkit-app-region` sur la barre du haut sticky. wry active les régions non client de WebView2, et chaque pixel de scroll renvoyait toute la liste des zones (~9 ms par envoi sur le thread du navigateur). Désactivé sous Tauri (classe `tauri-runtime`).

#### État de la phase 3a : téléchargements (2026-11-14) : fait

Module `src-tauri/src/downloads/` : file d'attente et concurrence réglable, MP4 (plages parallèles si l'hôte accepte `Range`, sinon un flux), HLS (choix de la qualité, clé AES, init fMP4, segments, fusion ffmpeg, repli playlist + segments), scans (reprise des pages déjà présentes), images de couverture, choix et déplacement du dossier, lecture hors ligne par la route `/local` du proxy.

**Compatibilité totale avec Electron** : même index (`%APPDATA%\nartya\downloads.json`, clés `items` et `root`), mêmes dossiers (`<racine>\<id en base64url>\`), mêmes champs. Les deux coques voient la même bibliothèque, sans migration.

Vérifié sur cette machine : les 3 épisodes téléchargés sous Electron apparaissent et se lisent depuis le disque ; un épisode HLS 1080p téléchargé et fusionné (677 Mo, segments nettoyés) ; une annulation en cours retire dossier et entrée ; un chapitre de scan (55 pages). 64 tests Rust.

ffmpeg : en dev, celui de `node_modules/ffmpeg-static` ; une fois packagé, cherché à côté de l'exécutable (à livrer en phase 4).

Non vérifié : téléchargement MP4 direct sur un vrai hébergeur (couvert par la logique Electron reprise à l'identique), déplacement du dossier vers un autre disque.

#### État de la phase 3b : Discord (2026-11-14) : code écrit, non testé avec un vrai Discord

Module `src-tauri/src/discord.rs` : Rich Presence par l'IPC local (tube nommé `discord-ipc-N` sous Windows, socket Unix ailleurs), reconnexion toutes les 30 s si Discord est fermé, bouton qui passe par une page du site (Discord n'accepte que http/https), chrono stable tant que l'épisode ne change pas. Commandes `discord_connect`, `discord_set_presence`, `discord_clear_presence` déclarées dans `build.rs` et autorisées pour la fenêtre principale. 69 tests Rust, clippy propre.

Non vérifié : affichage réel dans un client Discord, reconnexion après fermeture de Discord.

#### État de la phase 3c : Cast (2026-11-14) : code écrit, lecture sur la TV non testée

Module `src-tauri/src/cast/` : découverte mDNS (`mdns-sd`, coupée après 3 min d'inactivité), client CASTV2 écrit à la main (TLS sans vérification du certificat auto-signé, trames protobuf, heartbeat, `rustls` + `ring`), session (LAUNCH du Default Media Receiver, LOAD, sondage du statut chaque seconde, play / pause / seek / volume / muet, fin propre avec STOP), ajout manuel par IP, diagnostics et pare-feu Windows (PowerShell, cache 60 s). Même contrat qu'Electron : commandes `cast_*`, événements `cast:devices` et `cast:status`.

Serveur LAN : le proxy ouvre un second listener `0.0.0.0` le temps d'un cast, avec **son propre jeton** ; le jeton loopback n'y marche pas et inversement. `to_cast_url` n'accepte que des URL issues du proxy loopback avec leur jeton, et choisit la carte du sous-réseau de la TV (WSL, VPN écartés). Les playlists réécrites portent l'adresse par laquelle la TV nous a joints.

Vérifié : 92 tests Rust, dont un faux récepteur TLS auto-signé (LAUNCH, PING/PONG), l'isolation des jetons LAN / loopback et l'arrêt du listener. Contre la vraie TV de cette machine (Philips, `192.168.1.88`) : découverte mDNS, TLS et `GET_STATUS` OK (tests `#[ignore]` `decouverte_reelle` et `appareil_reel`).

Différence avec Electron : « Arrêter » envoie un STOP au récepteur (Electron fermait seulement la connexion, la TV gardait la dernière image).

Non vérifié : LOAD et lecture réelle sur la TV (lancerait une vidéo chez l'utilisateur), pare-feu Windows côté PowerShell, reprise après coupure du Wi-Fi.

### Phase 4 : packaging et bascule Windows

- Installeur NSIS, manifeste compatible Hub, bootstrapper WebView2.
- Canal bêta via le Hub, migration des utilisateurs, réécriture des tests (`test:providers:electron`).
- Retrait d'Electron sur Windows quand la bêta est stable.

#### État de la phase 4 (2026-11-14) : installeur prêt, bascule pas faite

`npm run tauri:bundle` (`scripts/tauri-bundle.mjs`) : copie ffmpeg à côté de l'exe, lance `tauri build` avec la surcharge `src-tauri/tauri.bundle.conf.json` (le bundle reste désactivé dans `tauri.conf.json` pour que `cargo build` ne demande pas ffmpeg), puis écrit `release/tauri/Nartya-<version>-win.exe` + `.sha256`, le nom que le Hub attend. **38 Mo contre 149 Mo pour Electron** ; contenu : `Nartya.exe` (23 Mo) et `ffmpeg.exe`. La version de `package.json` et celle de `tauri.conf.json` doivent concorder, sinon le script refuse. La CI Windows construit l'installeur et le publie en artefact.

Installeur NSIS en mode utilisateur courant (sans droits admin), bootstrapper WebView2 téléchargé en silencieux, français. Le hook `src-tauri/installer-hooks.nsh` :
- installe dans `%LOCALAPPDATA%\Programs\Nartya`, comme electron-builder (le Hub le cherche là), sauf dossier choisi à la main ;
- désinstalle d'abord une installation Electron au même endroit (`Uninstall Nartya.exe /S`), sans toucher à `%APPDATA%\nartya` ;
- nomme l'entrée « Nartya <version> » dans les applications installées, comme avant.

Migration du `localStorage` : Electron écrit `localstorage-export.json` dans son dossier de données (`electron/utils/storage-export.js`, 5 s après le chargement puis chaque minute et à la fermeture) ; la coque Tauri la verse dans la page au premier lancement (`src-tauri/src/migrate.rs`, script d'initialisation). Les clés déjà présentes ne sont jamais écrasées, les clés de session passent par le pont du Hub et sont exclues, un drapeau empêche de recommencer. **Il faut publier une version Electron avec cet export avant la bascule**, sinon les réglages et la progression locale ne suivent pas.

Hub (dépôt `NartyaTeam/nartya-hub`, cloné dans `Desktop/nartya-hub`) : sa détection lit le registre (`DisplayName` « Nartya » ou « Nartya <version> », `DisplayVersion`, `DisplayIcon` = l'exe) puis lance l'installeur en `/S` ; l'installeur Tauri y répond tel quel, sans changement. Ajouté côté Hub : un **canal bêta** (réglage « Recevoir les versions bêta », `manifest.beta.json`, repli sur la stable, cache par canal, 7 tests). Côté app, `node scripts/gen-release-manifest.mjs release/tauri --channel beta --version <x.y.z-beta.n>` produit ce manifest. Procédure de bêta : `npm run tauri:bundle`, envoyer `Nartya-<v>-win.exe` dans `dl/anime/` sur le VPS, puis publier `manifest.beta.json` à côté de `manifest.json`.

Vérifié : l'installeur se construit (NSIS compile les hooks), son contenu est correct, 93 tests Rust dont l'import (valeur hostile incluse), lint propre.

Non vérifié :
- **installation réelle** de l'installeur (elle remplacerait l'Electron de cette machine : raccourcis et clé de registre) ;
- **lancement du binaire release** : un `tauri dev` tournait, l'instance unique l'a laissé sortir ;
- **détection par le Hub en conditions réelles** : relue dans son code, jamais exécutée contre cet installeur (clé `Uninstall\Nartya` au lieu d'un GUID, `UninstallString` sans `/currentuser` : sans conséquence d'après `winInstall.js` et `nsis.js`) ;
- migration depuis une vraie installation Electron, WebView2 absent, Windows 10.

Reste de la phase : canal bêta via le Hub, retrait d'Electron.

### Un seul cœur, des coques minces (2026-11-14)

Objectif : ne maintenir la logique de Nartya qu'une fois. Aujourd'hui le proxy, la résolution des flux, les téléchargements et le Cast existent en JavaScript (Electron, ~4 900 lignes), en Rust (Tauri) et en Java (Android : `ProxyServer` 594 lignes, `Downloads` 907 lignes). Chaque correction se fait trois fois.

**Étape 1, faite : le crate `crates/nartya-core`.** Workspace Cargo à la racine (`Cargo.toml`, un seul `target/` et un seul `Cargo.lock`), deux membres :
- `crates/nartya-core` (~7 900 lignes) : proxy local et serveur LAN, client HTTP avec DoH, recette et extraction vidéo, poignées opaques, résolveur de flux, téléchargements, Cast (mDNS, CASTV2, pare-feu), Discord, session partagée, identifiant machine. Aucune dépendance à Tauri ni à une fenêtre.
- `src-tauri` (~1 400 lignes) : uniquement ce qui est propre à Tauri : fenêtre, deep-link, instance unique, captcha (webview), retour OAuth, lancement du Hub, import du localStorage d'Electron, et les commandes `invoke` qui appellent le cœur.

Le cœur n'a besoin que d'un runtime Tokio et de l'interface `Host` (`crates/nartya-core/src/host.rs`) : événements vers la page, ouverture d'un dossier, sélecteur de dossier, question « déplacer les épisodes ? ». Chaque coque l'implémente (`src-tauri/src/host.rs` pour Tauri) ; le texte de la question est écrit une fois dans le cœur. Même résultat qu'avant : 93 tests, clippy propre, installeur construit.

Règle pour la suite : **toute nouvelle logique va dans le cœur**, la coque ne garde que l'interface. Les modules `oauth` et `hub` de la coque sont de bons candidats au déplacement (ils ne tiennent à Tauri que par l'envoi d'événements).

**Étapes suivantes, par ordre de gain :**

1. **Supprimer Electron sur Windows** après la bêta : ~4 900 lignes de JS et les dépendances `castv2-client`, `multicast-dns`, `dns-packet`, `discord-rpc`, `electron-store`, `node-fetch`.
2. **Android : remplacer `ProxyServer.java` et `Downloads.java` par le cœur** (~1 500 lignes). Deux voies : (a) garder Capacitor et appeler le cœur compilé en bibliothèque native (`cargo-ndk` + JNI) ; (b) passer à Tauri mobile, qui reprend la même coque et le même cœur mais oblige à réécrire les plugins Java (lecteur, écran, partage, mise à jour). (a) est moins risquée, (b) unifie davantage.
3. **Linux et macOS** : soit une coque Tauri (WebKitGTK / WKWebView, à valider comme la phase 0 : WebGPU, MSE/HLS, plein écran), soit garder Electron en lui faisant appeler le cœur par un module natif Node (`napi-rs`), ce qui supprime la duplication sans changer de moteur web.
4. **Un seul contrat côté page** : `src/platform/{electron,tauri,capacitor}.js` (1 000 lignes) listent les mêmes commandes avec trois transports. Une fois les coques alignées, un seul adaptateur suffit.
5. **iOS** : ~600 lignes natives, même question que pour Android.

L'API Node du VPS reste hors sujet. Les deux fichiers de `src/shared/` (extraction, recette) sont utilisés par elle et par le web : le Rust les reproduit, gardés alignés par des tests communs.

### Essai de faisabilité Android (2026-11-14) : le cœur tourne sous Android

Question : peut-on remplacer `ProxyServer.java` (594 lignes) et `Downloads.java` (907 lignes) par `nartya-core`, en gardant Capacitor ? **Oui, sans obstacle technique rencontré.**

Ajouts : `crates/nartya-android` (bibliothèque `cdylib`, pont JNI : `nativeStart` démarre le cœur et renvoie port + jeton, `nativeResolve` résout un flux), la classe Java de référence `android/app/src/main/java/com/nartya/app/core/NartyaCore.java`, deux sondes (`examples/probe.rs`, `examples/dns.rs`), un accesseur `Proxy::token()` et l'export de `Target` dans le cœur, un job CI `android-core` (clippy du cœur et du pont pour arm64, `-D warnings`).

Mesures (release, LTO) :

| ABI | Taille de `libnartya_android.so` |
|---|---|
| arm64-v8a | 4,2 Mo |
| armeabi-v7a | 2,7 Mo |
| x86 / x86_64 (émulateurs) | 4,4 / 4,7 Mo |

Soit environ 7 Mo dans l'APK pour arm64 + armv7, à retrancher du code Java supprimé. Compilation de 1 à 1,5 min par ABI. Aucune dépendance bloquante : `ring`, `rustls` (racines `webpki` embarquées, pas besoin du magasin système), `mdns-sd`, `notify`, `netdev`, `sysinfo` compilent tels quels.

Vérifié sur l'émulateur Android 15 (x86_64, accélération WHPX, AVD `nartya_probe`) :
- le cœur démarre en 3 à 8 ms, le proxy filtre par jeton (403 sans jeton, 410 poignée inconnue) ;
- DoH (1.1.1.1, 8.8.8.8), résolveur système et HTTPS fonctionnent ; le proxy ramène `https://nartya.app/` (76 Ko en 1,4 s, DoH compris) ;
- le **JNI sur ART** : chargement de la bibliothèque, `nativeStart` et `nativeResolve` appelés depuis Java, requêtes HTTP vers le proxy depuis Java ;
- l'identifiant machine se calcule.
Un premier essai, lancé juste après le démarrage de l'émulateur, a échoué en 11 ms (réseau pas encore prêt) ; le même binaire a ensuite fonctionné.

Non vérifié : un appareil arm64 réel (compilé et passé à clippy, jamais exécuté), la lecture d'un vrai flux HLS dans la WebView, les téléchargements et le service de premier plan, le cycle de vie (processus tué en arrière-plan).

Travail restant pour passer à l'intégration :
1. **`Host` par JNI** : les événements (`downloads:progress`) remontent par un rappel Java ; le cœur doit garder la `JavaVM` et rattacher ses fils.
2. **Plugin Capacitor** : `NartyaProxyPlugin` appelle `NartyaCore` au lieu de `ProxyServer` / `Downloads` ; le service de premier plan des téléchargements (103 lignes) reste, il appelle le cœur.
3. **Côté page** : le proxy Java reçoit aujourd'hui les recettes (`configs`) poussées par la page et la page construit les URL. Le cœur suit le modèle du bureau : la page ne voit jamais l'URL de l'hébergeur, elle reçoit une poignée par `resolveStream`. Android doit donc passer par `resolveStream` (comme `tauri.js`), ce qui est le vrai chantier du front.
4. **ffmpeg** : pas d'exécutable embarqué sous Android ; la fusion HLS retombe sur « playlist + segments » (déjà géré par le cœur).
5. **Build** : une tâche Gradle qui lance `cargo ndk -t arm64-v8a -t armeabi-v7a -o android/app/src/main/jniLibs build -p nartya-android --release`.
6. **Tests** : les tests Java du proxy (`ProxyServerTest`, la sonde instrumentée) sont remplacés par ceux du cœur.

Reproduire l'essai :
```
cargo ndk -t x86_64 -P 24 build -p nartya-android --release --example probe
adb push target/x86_64-linux-android/release/examples/probe /data/local/tmp/
adb shell "chmod +x /data/local/tmp/probe && /data/local/tmp/probe"
```

Conclusion : la voie Capacitor + JNI est la moins risquée. Tauri mobile n'est pas testé et n'apporterait pas de gain avant d'avoir réécrit les plugins Java. iOS suivrait le même schéma (bibliothèque statique + pont Swift), non testé faute de macOS.

### Android : la lecture passe par le cœur (2026-11-14, étape 1)

`resolveStream` sur Android appelle le cœur Rust, comme `tauri.js` : la page envoie `{ token, forceRefresh }`, le cœur interroge l'API (URL fixée côté cœur), récupère la recette, extrait le flux et renvoie une URL de lecture locale avec jeton ; la page ne voit jamais l'URL de l'hébergeur.

- **Plugin** : `NartyaProxyPlugin.coreStart()` (démarre le cœur, port + jeton) et `coreResolve({ request, accessToken })`, exécutés sur un fil à part (les appels bloquent). Un `catch Throwable` rend `success: false` si la bibliothèque manque (ABI absente, cargo-ndk non installé).
- **Jeton de session** : sur Android il vit dans le `localStorage` de la WebView, hors de portée du natif ; la page le passe donc à `coreResolve` (même WebView que celle qui le détient déjà). Différence avec Tauri, où la coque le possède.
- **Garde-fou** : `RUST_CORE_ENABLED` dans `src/platform/capacitor.js` ; essai sans rebuild avec `localStorage["nartya-rust-core"]` = `"0"` (coupé) ou `"1"`. Coupé, indisponible, iOS ou `mode: "download"` : ancien chemin Java inchangé (`ProxyServer.java`, `Downloads.java` conservés ; les téléchargements gardent leurs poignées Java).
- **Build** : tâche Gradle `buildNartyaCore` (cargo-ndk, `-o android/app/src/main/jniLibs`, dossier ignoré par git) branchée sur `preBuild`. `-PnartyaCore=true` force (échoue sans cargo-ndk), `false` saute, par défaut compile si cargo-ndk est installé (le job CI `android` n'en a pas : il saute la tâche). `-PnartyaCoreAbis=x86_64` pour l'émulateur ; défaut `arm64-v8a,armeabi-v7a`. Prérequis : NDK 27, `rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android`, `cargo install cargo-ndk`. Règle R8 pour les méthodes natives dans `proguard-rules.pro`.

Vérifié : `cargo test --workspace` et clippy `-D warnings` OK ; `lintDebug` + `testDebugUnitTest` OK (cœur sauté) ; APK debug x86_64 installé sur l'émulateur `nartya_probe` : depuis la WebView, `coreStart` (447 ms, JNI sur ART), `coreResolve` d'un faux jeton atteint l'API de production depuis le cœur (réponse 401 « Connecte-toi »), le proxy local renvoie 403 sans jeton.

**Non vérifié** : une lecture réelle d'un flux HLS (aucun compte de test, je n'ai pas créé de compte invité en production) ; l'APK release minifié (règle R8 non éprouvée) ; un appareil arm64 ; le comportement du cœur après mise en arrière-plan/processus tué (la page ne relance pas le cœur : `coreStart` est idempotent mais le port ne change pas tant que le processus vit).
**Reste** : valider la lecture sur un compte réel, puis accord pour supprimer la partie lecture de `ProxyServer.java` ; téléchargements via le cœur (Host JNI, événements) ; `fetchEmbedUrl` reste sur le proxy Java (utilisé seulement par l'ancien chemin).

### Android : les téléchargements passent par le cœur (2026-11-14, étape 2)

Même garde-fou que la lecture (`RUST_CORE_ENABLED` / `localStorage["nartya-rust-core"]`) : activé, **lecture et téléchargements** vont ensemble au cœur ; coupé ou cœur absent, tout reste sur Java. Ne pas basculer d'un mode à l'autre sur une installation qui contient des épisodes : chaque mode a son index (voir ci-dessous).

- **Pont** : `NartyaCore.nativeCall(commande, argsJson)` reprend les commandes Tauri (`downloads_list`, `_start`, `_cancel`, `_cancel_season`, `_remove`, `_set_max_concurrent`, `_local_url`). Le plugin les expose par `coreCall`.
- **Événements** : `nativeStart` reçoit un `NartyaCore.Listener` ; le cœur garde la `JavaVM` et une référence globale (`JniHost`), rattache ses fils Tokio et appelle `onEvent("downloads:progress", item)`. Le plugin les relaie à la page (`downloadProgress`) et pilote `DownloadForegroundService` d'après les statuts reçus (service conservé tel quel).
- **Données existantes** : dossiers identiques (`<données>/downloads/<id base64url>/`). L'index Java (`downloads/index.json`, plus les copies `item.json` des dossiers) est converti au premier démarrage en `downloads.json` (`downloads::legacy`, testé) ; `index.json` n'est pas touché et sert de sauvegarde. Statut `interrupted` devient `error`. Limite : un dossier sans `index.json` ni `item.json` n'est pas reconstruit (le code Java le faisait depuis le nom du dossier).
- **Lecture hors ligne** : `/local` est servi par le proxy du cœur.
- **Page** : `capacitor.js` appelle `coreCall` pour list/start/cancel/remove/setMaxConcurrent/localUrl ; la résolution en mode téléchargement rend une poignée du cœur. Les réglages de dossier restent statiques (stockage privé).

Vérifié sur l'émulateur : reprise d'un faux `index.json` Java (`downloads.json` créé), `downloads_list`, lecture d'un fichier par `/local` avec `Range` (206), `downloads_remove` (dossier supprimé), et la chaîne d'événements Rust → JNI → plugin → page (queued, downloading, error) sur un téléchargement de scan qui échoue volontairement (« Accès refusé par l'hébergeur »).
**Non vérifié** : un téléchargement réel complet (MP4 et HLS, sans ffmpeg : playlist + segments), l'affichage de la notification de premier plan, la reprise après processus tué, un vrai index Java produit par une ancienne version, l'APK release (R8), arm64.

**Reste côté Android** : valider tout cela avec un compte réel ; supprimer `ProxyServer.java`, `Downloads.java` et `fetchEmbedUrl` (+ leurs tests Java) après accord ; forcer `-PnartyaCore=true` dans le script de publication ; session de consolidation (voir ci-dessus).

### Android : consolidation (2026-11-15)

Relecture des risques de la bascule lecture + téléchargements, avec un APK **release minifié** (R8, signé) installé sur l'émulateur x86_64.

Corrigé :
- **Interface `NartyaCore.Listener` et R8** : sans règle, R8 pouvait renommer ou retirer `onEvent`, que le cœur appelle par son nom en JNI. Règle `keep` ajoutée ; vérifié en release : `coreStart`, `coreResolve` (réponse 401 de l'API) et la chaîne d'événements d'un téléchargement (queued, downloading, error) fonctionnent.
- **Release sans cœur** : un APK publié sans `libnartya_android.so` retombait silencieusement sur le proxy Java, donc sur l'index `index.json` au lieu de `downloads.json` (épisodes téléchargés « disparus »). Toute tâche Gradle `*Release` exige désormais cargo-ndk et échoue sans lui (sauf `-PnartyaCore=false` explicite).

Vérifié : classe, méthodes natives et lib x86_64 présentes dans l'APK release (5,3 Mo avant compression), cœur chargé sous ART en release.

Reste, à faire avant d'activer en production :
- lecture d'un vrai flux et téléchargement complet avec un compte réel (MP4 et HLS) ;
- un vrai index produit par une ancienne version de l'app, puis mise à jour par-dessus ;
- arm64 réel (le build arm64 et armv7 n'a été exécuté que par clippy) ;
- notification de premier plan et reprise après processus tué ;
- `versionCode` à augmenter à la publication.
Piège connu : revenir en arrière (garde-fou coupé ou version sans cœur) après des téléchargements faits en mode cœur masque ces épisodes, car l'index n'est pas partagé entre les deux modes.

### Android : validation sur compte réel (2026-11-15)

APK release minifié x86_64, émulateur Android 15, compte connecté par l'utilisateur ; pilotage par la WebView (CDP) et `adb`.

Vérifié :
- **Lecture en ligne** (One Piece, saison 1, épisode 13, VOSTFR) : hls.js lit en 720p, `readyState` 4, position qui avance, aucune erreur ; seul le port du cœur écoute côté app, le proxy Java n'a jamais démarré.
- **Téléchargement complet** (épisode 12, HLS, 328 Mo, playlist + 150 segments) par le cœur, sans ffmpeg.
- **Lecture hors ligne** : la playlist et un segment sont servis par `/local` (206 avec `Range`).
- **Service de premier plan** : actif pendant un téléchargement (notification `nartya_downloads`, catégorie progress).
- **Processus tué en plein téléchargement** : au redémarrage, l'entrée passe à « Interrompu » (4 %), l'index est intact, l'épisode terminé reste lisible.
- **Compatibilité d'index** : noms de fichiers identiques entre l'ancien code Java et le cœur (`playlist.m3u8`, `segNNNNN`, `key.bin`, `init.mp4`, `video.mp4`, `pNNN.jpg`) et mêmes champs d'entrée, relevés dans `Downloads.java` ; la conversion de l'index est testée (tests Rust + faux index sur l'émulateur).

Bug trouvé en route, corrigé dans `capacitor.js` : une WebView ancienne (Chrome 124, celle de l'émulateur) rend un hôte **vide** pour `nartya://captcha-callback?...`. Le captcha réussissait mais l'app ignorait son retour, donc connexion visiteur et Discord impossibles (« mode visiteur indisponible »). Le décodage de l'hôte retombe maintenant sur le chemin. Concerne aussi les vrais téléphones à WebView ancienne.

**Mise à jour par-dessus la production (vérifiée).** Vrai APK 1.9.1 récupéré sur `nartya.app/dl/android/` (SHA-256 conforme au catalogue), installé sur l'émulateur, puis `adb install -r` de l'APK du cœur par-dessus : accepté (même signature, mêmes données conservées). Un épisode (One Piece S1E2, 335 Mo) téléchargé par le code Java (garde-fou coupé, index `index.json` réel) est repris au redémarrage suivant du processus : entrée `done` avec son titre, sa pochette et sa taille, playlist et segment servis par `/local`. Le code Java de téléchargement n'a pas changé depuis la 1.9.1 ; seul le chargement de l'index à chaud ne se rejoue pas : la conversion a lieu au démarrage du cœur, donc au premier lancement après la mise à jour (et pas en basculant le garde-fou sans relancer le processus).

Non vérifié : un appareil arm64 réel (aucun disponible : seul un build clippy), la reprise manuelle d'un téléchargement interrompu.

### Android : code Java de lecture et de téléchargement retiré (2026-11-15)

Après validation, supprimés : `ProxyServer.java` (594 lignes), `Downloads.java` (907), leurs tests (`ProxyServerTest`, la sonde instrumentée), la dépendance NanoHTTPD et le réglage Gradle `nartyaProxyProbe`. `NartyaProxyPlugin` se réduit à `coreStart`, `coreResolve`, `coreCall` et `requestDownloadPermission` (298 lignes contre ~190 avant l'étape 1, mais sans logique réseau). Il n'y a plus de garde-fou ni de repli Java sur Android : sans bibliothèque native, la page renvoie « Moteur de lecture indisponible » ; une release exige de toute façon le cœur. iOS garde son plugin Swift et son chemin dans `capacitor.js`.

Vérifié (émulateur x86_64, APK release minifié) : lecture 720p, téléchargement HLS complet, notification de fin postée. `lintDebug`, `testDebugUnitTest` et clippy passent. Hors cadre : 4 tests de `test:unit` échouent (recette et extraction : `recette rend au client…`, `recette pilote détection…`, `allowlist…`, `lecteur compacté…`), dans du code non touché ici.
Non revérifié sur le téléphone arm64 après cette suppression (déconnecté) : l'APK est identique côté Rust, seul le Java a changé.

### Phase 5 : Linux et macOS (optionnel)

À décider selon la phase 0 : WebKitGTK et WKWebView sont moins sûrs que Chromium pour WebGPU, MSE/HLS et le plein écran. Ne pas lancer sans vérification équivalente à la phase 0 sur chaque plateforme.

## Estimation

6 000 à 8 000 lignes de Rust. Plusieurs semaines de travail soutenu, l'essentiel en phases 2 et 3. À réviser après la phase 0.

## Critères de réussite

- Parité fonctionnelle sur Windows (lecture, téléchargements, Cast, Discord, Hub).
- RAM au repos sensiblement plus basse qu'Electron (à mesurer sur le PC modeste).
- Aucune perte de données utilisateur (téléchargements, session, réglages).

### Décision : Tauri sur les trois systèmes (2026-11-15)

Mesure Supabase (30 jours) : Linux 23 et macOS 48 utilisateurs actifs, soit 1,4 % des actifs. Garder Electron pour eux coûterait plus (coque, dépendances, CI, packaging) que ça ne rapporte : **Electron disparaît partout**, une fois les bêtas Linux et macOS validées. Anime4K est optionnel : indisponible là où WebGPU ne l'est pas, sans casser la lecture.

Fait (branche `feat/tauri-shell`) :
- CI `tauri-unix` (Ubuntu, macOS) : clippy `-D warnings`, `cargo test`, build, installeurs en artefact (`.dmg` arm64, `.AppImage`, `.deb`). Surcharges de bundle par plateforme (`src-tauri/tauri.bundle.{windows,macos,linux}.conf.json`), `scripts/tauri-bundle.mjs` choisit selon la machine.
- ffmpeg livré avec l'app : à côté de l'exe (Windows), `Contents/Resources` (macOS), `lib/Nartya` (Linux, vérifié dans le `.deb`).
- Chemin du Hub macOS : l'exécutable dans `Nartya Hub.app/Contents/MacOS/`.
- Test de la chaîne de lecture réelle : `npm run test:providers` (`crates/nartya-core/examples/providers_smoke.rs`), qui remplace `test:providers:electron`. `test:providers:ui` marche aussi sous Tauri avec `NARTYA_CDP_PORT=9222` (build debug).

Reste : essai réel des installeurs Linux et macOS (HLS/MSE, plein écran, captcha, Cast, Discord) par des volontaires ; `.dmg` Intel et Linux arm64 non produits ; `.dmg` non signé.


#### Essai réel de l'installeur Windows (2026-11-15, cette machine)

Installeur `Nartya-1.40.1-win.exe` lancé en `/S` (comme le Hub) par-dessus l'Electron 1.40.1 installé, sans processus Nartya ouvert : Electron désinstallé au même emplacement (`%LOCALAPPDATA%\Programs\Nartya` ne contient plus que `Nartya.exe`, `ffmpeg.exe`, `uninstall.exe`), clé `Uninstall\Nartya` mise à jour (`DisplayName` « Nartya 1.40.1 », `DisplayIcon` = l'exe), `%APPDATA%\nartya` intact. Le binaire release se lance (~43 Mo pour le process hôte) et, avec la session du Hub, affiche « Qui est là ? » : pas d'écran de connexion.

Non couvert : la migration du `localStorage` (l'Electron installé n'avait pas l'export, donc aucun `localstorage-export.json`), un Windows sans WebView2, Windows 10, la détection par le Hub dans un parcours complet (clé de registre conforme à ce qu'il lit).

## Retrait d'Electron du dépôt (2026-11-15)

Supprimés : `electron/` (4 955 lignes), `src/platform/electron.js`, `build/installer.nsh`, le bloc `build` d'electron-builder, les scripts `electron:*`, les dépendances `electron`, `electron-builder`, `electron-store`, `castv2-client`, `discord-rpc`, `dns-packet`, `multicast-dns`, `node-fetch` (`castv2` et `multicast-dns` restent en devDependencies pour `npm run test:cast:fake`). Développement : `npm run dev:tauri` (API locale si `api/` est présent, sinon publique).

Tests : `proxy-range`, `shared-session-permissions`, `video-providers-live` et `video-providers-electron-smoke` supprimés ; la couverture vit dans le cœur (`stream/range.rs`, `session.rs`, `stream/extract.rs`, `stream/provider.rs`, `url_guard.rs`) et dans `npm run test:providers` (chaîne réelle). `video-providers` et `stream-anonymization` ne gardent que ce qui concerne l'interface et le contrat de l'API.

Gardés exprès : `src-tauri/src/migrate.rs` (reprise du `localStorage` écrit par la dernière version Electron) et `src-tauri/installer-hooks.nsh` (désinstalle l'ancien Electron). À retirer quand plus aucun utilisateur n'est sur Electron.

**oauth et Hub déplacés dans le cœur** (`nartya-core::oauth`, `nartya-core::hub`) : le serveur de retour OAuth reçoit un rappel au lieu de connaître Tauri, `redirect_url(port)` est pure, et l'ouverture d'adresse du Hub passe par `Host::open_url` (méthode par défaut qui refuse : Android et iOS n'ont pas de Hub). La coque ne garde que le branchement (rappel → deep-link, port stocké dans l'état).

**Contrat de page unique** : `src/platform/contract.js` liste les clés que tout adaptateur expose (`PLATFORM_SHAPE`) et les capacités optionnelles dont la présence dit ce que la plateforme sait faire (`OPTIONAL_CAPABILITIES`), puis `definePlatform(overrides)` complète avec le comportement du web. `web.js` n'a plus rien à déclarer ; `tauri.js` et `capacitor*.js` ne listent que ce qu'ils font vraiment. `test/platform-contract.test.mjs` vérifie que web, Tauri et Capacitor exposent les mêmes clés, sans clé hors contrat.

Reste : recette partagée JS/Rust.
