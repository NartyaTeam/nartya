# Watch party : contrat page ↔ moteur Rust

Statut : moteur implémenté et testé (2026-11-16, `crates/nartya-core/src/party/`, 39 tests). Branché sur Tauri (commande `party_input`, `platform.party`, `usePartyEngine`, `PartyRoomPage` réduite à l'affichage), pas encore testé à plusieurs clients. Android : `platform.party` reste `null`, la party n'y est pas proposée.

## Pourquoi

Toute la logique vit aujourd'hui dans `src/hooks/useWatchParty.js` (803 lignes) et
`src/pages/party/PartyRoomPage.jsx` (611 lignes) : transport, présence, élection d'hôte, horloge,
dérive, attente des sources, persistance, chat. Intestable, et chaque optimisation traverse la vue.

Cible : un **moteur Rust** (`crates/nartya-core/src/party/`) qui possède tout l'état et toutes les
décisions. La page n'affiche, ne fait que **transmettre des faits** (message reçu, tick du lecteur,
clic) et **exécuter des ordres** (seek, envoyer ce message). Nartya n'a pas de version web : le
cœur est toujours présent (Tauri et Android), pas de WASM ni de repli.

## Principes

1. **Le moteur décide, la page exécute.** Aucun calcul de dérive, d'élection ou d'attente en JS.
2. **Le moteur est pur et déterministe.** Entrées = événements datés, sorties = effets. Il ne lit
   pas l'heure lui-même : `Engine::handle(now, input)` reçoit l'heure murale en ms (epoch), posée
   par l'acteur Tokio (`Party`), pas par la page. Le protocole échange des heures d'hôte corrigées
   par un décalage d'horloge, il faut donc la même échelle partout. Testable avec une horloge
   simulée (`cargo test`).
3. **La page ne garde aucune ref miroir.** Elle rend le dernier `party:state` reçu.
4. **Le transport est un détail remplaçable.** Aujourd'hui Supabase Realtime piloté par le JS ;
   demain un serveur autoritaire. Le moteur ne voit que des « messages reçus » et des « messages à
   envoyer ».
5. **Tous les minuteurs sont dans le moteur** (battement, ping d'horloge, délai d'attente,
   tolérance de décrochage). Le JS n'a plus aucun `setInterval` lié à la party.

## Forme du module

Même patron que `Discord` (`crates/nartya-core/src/discord.rs`) : un acteur Tokio qui possède
l'état, avec un canal de commandes et un `Host` pour pousser des événements.

```
Party::start(host: Arc<dyn Host>) -> Party        // poignée clonable
party.input(Input)                                // non bloquant, file mpsc
// l'acteur émet via host.emit("party:…", json)
```

Côté coques : une commande `party_input` (Tauri `invoke`, JNI sur Android) et des événements
`party:*`. Côté page : `platform.party` dans `src/platform/contract.js`
(`{ input(i), onState(cb), onEffect(cb) }`), implémenté dans `tauri.js` et `capacitor.js`.

## Entrées (page → moteur)

Toutes les entrées sont envoyées par `party_input({ type, ... })` ; l'heure est posée côté Rust.

### Cycle de vie

| type | champs | rôle |
|---|---|---|
| `open` | `code`, `intent: "create" \| "join"`, `me`, `seed?`, `isPublic?` | ouvre un salon. `me = { clientId, userId, username, avatar, premium }` |
| `close` | — | quitte (volontaire ou démontage) |

### Transport (la page relaie ce que Realtime lui dit)

| type | champs | rôle |
|---|---|---|
| `transport` | `status: "subscribed" \| "reconnecting" \| "lost"` | état de la connexion |
| `message` | `event`, `payload` | message de diffusion reçu (voir « Protocole ») |
| `presence` | `members: [{ clientId, userId, username, avatar, premium, joinedAt, … }]` | présence complète après chaque sync/join/leave (le moteur calcule les écarts) |
| `rpc_result` | `id`, `ok`, `data?` | réponse à un effet `rpc` (persistance, relève) |

### Lecteur

| type | champs | rôle |
|---|---|---|
| `player_tick` | `mediaId`, `position`, `duration`, `paused` | ~4 Hz depuis `timeupdate` |
| `player_event` | `mediaId`, `kind: "play" \| "pause" \| "seek" \| "stall" \| "stall_end" \| "ended" \| "error"`, `position` | gestes du lecteur local |
| `source` | `mediaId`, `status: "loading" \| "ready" \| "error"`, `sourceKey?` | résultat de l'extraction locale |

### Intentions de l'utilisateur

| type | champs | rôle |
|---|---|---|
| `set_current` | `descriptor` | hôte : lancer un épisode |
| `play_now` | `descriptor` | hôte : ajouter à la file et lancer |
| `set_queue` | `op: "add" \| "remove" \| "replace"`, `item?` / `items?` | hôte : file |
| `set_options` | `patch` | hôte : options (public, attentes, tolérance) |
| `change_lang` | `lang` | hôte |
| `next` / `prev` | — | hôte |
| `chat` | `text` | message de chat |
| `reaction` | `emoji` | réaction |

Le moteur **rejette** les intentions d'hôte reçues d'un non-hôte (la page grise déjà l'UI, mais la
décision est ici).

## Sorties (moteur → page)

### `party:state` : tout ce qu'affiche la page

Instantané complet, numéroté (`rev` croissant) ; la page remplace son état, sans fusion. Émis
seulement quand quelque chose d'affichable change, jamais à 4 Hz.

```jsonc
{
  "rev": 128,
  "phase": "idle | connecting | in_room | not_found | full | lost",
  "code": "AB12CD",
  "role": "host | guest",
  "me": { "clientId": "…" },
  "participants": [{ "clientId", "userId", "username", "avatar", "premium",
                     "isHost": true, "sourceStatus": "loading | ready | error | buffering" }],
  "capacity": 5,                       // null = illimité
  "current": { /* descripteur d'épisode */ },
  "queue": [ /* descripteurs */ ],
  "options": { "isPublic": false, "waitOnSourceLoad": true, "waitOnJoin": true,
               "waitOnBuffer": true, "driftTolerance": 1.5 },
  "waiting": { "active": true, "for": ["clientId"] },   // bannière d'attente
  "langChanging": { "username": "…", "toLang": "vf" },
  "sourcePin": { "mediaId": "…", "sourceKey": "…" }
}
```

### `party:effect` : ordres à exécuter

Chaque effet a un `type` ; la page les exécute dans l'ordre reçu.

| type | champs | exécuté par la page |
|---|---|---|
| `player_load` | `mediaId`, `pinnedSource?` | lancer l'extraction (la page garde le code d'extraction tant qu'il n'est pas porté en Rust) puis répondre par `source` |
| `player_seek` | `position` | `video.currentTime = …` |
| `player_play` / `player_pause` | — | idem |
| `player_rate` | `rate` | `video.playbackRate`, 1.0 par défaut (rattrapage ±5 %) |
| `player_notice` | `text` | toast dans le lecteur (« Resynchronisé sur l'hôte ») |
| `send` | `event`, `payload`, `to?` | envoyer ce message de diffusion |
| `track` | `meta` | mettre à jour sa présence (`channel.track`) |
| `subscribe` / `unsubscribe` | `channel` | ouvrir ou fermer le canal |
| `rpc` | `id`, `name`, `args` | appeler la RPC Supabase (persistance, publication du salon public), puis `rpc_result` |
| `chat` | `message` | ajouter au fil de chat (`{ type: "chat" \| "system", … }`) |
| `reaction` | `reaction` | animation de réaction |
| `progress` | `slug`, `season`, `ep`, `lang`, `position`, `duration` | `watchTick` (stats de visionnage, toutes les 60 s) |

`send` et `rpc` disparaîtront quand le transport passera en Rust : le moteur parlera directement au
serveur et la page ne verra plus que `party:state` et les effets `player_*`.

## Protocole sur le fil (v1)

Le moteur parle d'abord **le protocole actuel**, pour qu'un client migré et un client ancien
cohabitent pendant le déploiement : `playback`, `current`, `queue`, `options`, `request_sync`,
`clock_ping`/`clock_pong`, `source_loading|ready|error|stall`, `source_pin`, `lang_changing`,
`chat`, `reaction`.

Ajouts rétro-compatibles (champs ignorés par les anciens clients) :

- `v` : version du protocole (1 aujourd'hui).
- `seq` : compteur par émetteur. Le moteur ignore un `playback` plus ancien que le dernier reçu.
- `rev` sur `current` / `queue` / `options` : un participant détecte un trou et envoie `request_sync`.
- `epoch` : incrémenté à chaque élection d'hôte ; un message d'un `epoch` périmé est ignoré.

La sécurité réelle (empêcher un non-hôte d'émettre) ne peut pas venir du moteur côté client :
elle demande le serveur autoritaire (étape 4 de la feuille de route).

## Ce que le moteur absorbe

| Aujourd'hui (JS) | Moteur |
|---|---|
| `syncPresence`, `effectiveHost`, `isHostClaim` | élection, relève, capacité |
| `clock_ping/pong`, `clockOffsetRef` | estimation d'horloge (médiane + filtre RTT, plus un EMA) |
| `applyRemote` (seek / rate / tolérance) | décision de dérive → `player_seek` / `player_rate` |
| `armWait`, `checkAllReady`, `waitTimerRef` | attente des sources, arrivées, décrochage |
| `persistState`, `restoreFromPersistedState` | effets `rpc`, relève sans retour en arrière |
| battement 1,5 s / 4 s, `STATS_BEAT_MS` | minuteurs internes |
| `lastSentRef`, `DEDUP_*` | dédoublonnage des émissions |

## Ce qui reste en JS

- le lecteur (`<video>`, hls.js, Anime4K) : la page exécute les ordres et remonte les faits ;
- l'extraction des sources, tant qu'elle n'est pas portée (effet `player_load` → `source`) ;
- le transport Supabase Realtime, jusqu'à l'étape 4 ;
- l'affichage (`PartyRoomPage`, `PartyChat`, panneaux).

## Tests prévus

- Rust : horloge simulée, canal avec pertes, doublons, réordonnancement et latence variable ;
  scénarios d'élection, de relève d'hôte, d'arrivée en cours de séance, de décrochage.
- Contrat : fichiers JSON d'entrées et de sorties attendues, rejoués côté Rust et côté JS pour
  garder les deux compréhensions alignées.
- Compatibilité : un client moteur contre un client ancien (trames enregistrées).

## Feuille de route

1. **Ce contrat**, relu et validé.
2. Moteur Rust avec tests, sans toucher à la page.
3. `platform.party` (Tauri + Capacitor) et nouvelle page d'affichage ; suppression de
   `useWatchParty.js`.
4. Transport autoritaire (serveur ou cœur Rust) : propriété du salon, hôte et capacité vérifiés
   côté serveur, durcissement des RPC `party_room_save_state` / `party_room_close`.

## Questions ouvertes

- **Android** : les événements du cœur y arrivent par JNI puis Java ; il faut confirmer comment ils
  atteignent le JS Capacitor (même chemin que `cast:status` ou `downloads:progress`).
- **Fréquence de `player_tick`** : 4 Hz suffit-il côté mobile, ou le moteur doit-il pouvoir demander
  un autre rythme ?
- **Où vit l'extraction** : rester en JS dans la page, ou être demandée par le moteur au cœur
  (`resolve_stream` existe déjà) ?
- **Chat** : reste éphémère, ou l'historique est-il persisté (nécessite un serveur) ?

## Comportements décidés à l'implémentation

- **Relève d'hôte sans retour en arrière.** Un participant qui devient hôte garde l'état qu'il a
  déjà reçu (épisode, file, options, position) ; la base n'est relue que s'il n'a rien reçu. Avant,
  un état persisté vieux de 10 s pouvait faire revenir la lecture en arrière.
- **Code inexistant.** Un participant seul sur un code qu'il n'a jamais vu occupé ne crée pas de
  salon : au bout de 2,5 s, la phase passe à `not_found`.
- **Horloge.** Rafale de 4 pings au démarrage, puis un toutes les 8 s ; l'échantillon retenu est
  celui du plus faible aller-retour sur les 8 derniers.
- **Rattrapage.** Un saut n'est pas renvoyé avant 1,5 s, et `play`/`pause` pas avant 1 s, pour ne
  pas marteler un lecteur qui n'a pas encore répondu.
- **Chat.** 8 messages par 10 s par expéditeur (à l'émission comme à la réception), 500 caractères.
- **Compatibilité.** `current` est envoyé en enveloppe `{ descriptor, rev, epoch }` **et** avec les
  champs du descripteur à la racine, pour qu'un client non migré le lise toujours.
- **Limites connues.** Les messages d'autorité portent l'époque, mais n'identifient pas l'émetteur :
  un client malveillant peut toujours monter son `epoch`. Seul le serveur autoritaire règle ça.

