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

Vérifié : l'installeur se construit (NSIS compile les hooks), son contenu est correct, 93 tests Rust dont l'import (valeur hostile incluse), lint propre. Le dépôt du Hub n'est pas sur cette machine : son format n'a pas pu être relu.

Non vérifié :
- **installation réelle** de l'installeur (elle remplacerait l'Electron de cette machine : raccourcis et clé de registre) ;
- **lancement du binaire release** : un `tauri dev` tournait, l'instance unique l'a laissé sortir ;
- **détection de la version par le Hub** : la clé de registre est `Uninstall\Nartya` au lieu d'un GUID, et l'`UninstallString` n'a pas `/currentuser` ; à vérifier dans le dépôt du Hub ;
- migration depuis une vraie installation Electron, WebView2 absent, Windows 10.

Reste de la phase : canal bêta via le Hub, réécriture de `test:providers:electron`, retrait d'Electron sur Windows.

### Phase 5 : Linux et macOS (optionnel)

À décider selon la phase 0 : WebKitGTK et WKWebView sont moins sûrs que Chromium pour WebGPU, MSE/HLS et le plein écran. Ne pas lancer sans vérification équivalente à la phase 0 sur chaque plateforme.

## Estimation

6 000 à 8 000 lignes de Rust. Plusieurs semaines de travail soutenu, l'essentiel en phases 2 et 3. À réviser après la phase 0.

## Critères de réussite

- Parité fonctionnelle sur Windows (lecture, téléchargements, Cast, Discord, Hub).
- RAM au repos sensiblement plus basse qu'Electron (à mesurer sur le PC modeste).
- Aucune perte de données utilisateur (téléchargements, session, réglages).
