# Fonctionnalités : desktop vs Android

Ce fichier dit ce que contient **concrètement** l'app Android par rapport au desktop, page
par page. [MOBILE.md](MOBILE.md) décrit l'architecture ; ici on ne parle que de
ce que voit l'utilisateur.

> Dernière vérification dans le code : **2026-09-27** (`main` @ v1.29.1).
> Dernière APK publiée : **android-v1.1.0** (4 octobre 2026).

**À mettre à jour à chaque feature** : si tu ajoutes, retires ou adaptes quelque chose,
corrige la ligne concernée dans le même commit. Un tableau faux est pire que pas de tableau.

## Légende

| Symbole | Sens |
| ------- | ---- |
| ✅ | Identique au desktop (même composant, même contenu) |
| 🟡 | Présent mais adapté au tactile (détail dans la colonne Notes) |
| 📱 | Existe uniquement sur Android |
| 🖥️ | Existe uniquement sur desktop |
| 🔗 | La page existe sur Android mais aucun bouton n'y mène (lien direct ou deep link seulement) |
| ⏳ | Déjà sur `main`, **pas encore dans l'APK publiée** — arrive à la prochaine version Android |

## Comment ça marche dans le code

Android réutilise **les mêmes pages que le desktop** (`src/pages/**`, `src/components/**`).
Seuls trois écrans sont propres au mobile, dans `src/mobile/` :

- `MobileLayout.jsx` : la coque (barre d'onglets en bas, bouton retour flottant), à la place
  de `AppLayout` (Sidebar + TopBar).
- `MobileSearchPage.jsx` : la recherche, à la place de `SearchPage`.
- `MobileChangelogPage.jsx` : la page « Nouveautés », qui lit `changelog.mobile.js`.

Tout le reste est aiguillé par `platform.isMobile` / `platform.isDesktop` (`src/platform/`).
Conséquence directe : **une feature ajoutée à une page partagée arrive aussi sur Android**
à la prochaine APK, sauf si on la masque volontairement. Pour savoir ce qui diverge,
`grep -rn "platform.isMobile\|platform.isDesktop" src`.

Les fonctions système (proxy de lecture, téléchargements, connexion, mises à jour) passent
par `src/platform/capacitor.js` côté Android et `src/platform/electron.js` côté desktop.
Une entrée à `null` ou `noop` dans `capacitor.js` = fonction absente sur Android.

---

## Navigation

| Élément | Desktop | Android | Notes |
| ------- | ------- | ------- | ----- |
| Navigation principale | Sidebar à gauche + TopBar | 🟡 Barre d'onglets en bas | Onglets : Accueil, Recherche, Calendrier, Hors ligne, « Plus » |
| Menu « Plus » | — | 📱 | Feuille avec : Mangas, À venir, Classement, Favoris, Mes listes, Profil, Succès, Paramètres, Nouveautés, Amis, Signalements, Aide |
| Bouton retour | Historique du navigateur | 🟡 Bouton flottant + bouton retour Android | |
| Barre de recherche dans la TopBar | 🖥️ | ❌ | Sur Android, la recherche est un onglet |
| Bouton « remonter en haut » | 🖥️ | ❌ | |
| Mode hors ligne | ✅ | ✅ | Bascule automatique sur les téléchargements. Sur Android, l'onglet Profil apparaît hors ligne |

## Pages

| Page | Route | Android | Notes |
| ---- | ----- | ------- | ----- |
| Accueil | `/` | 🟡 | Même contenu. Rangées chargées au fil du scroll, carrousels en scroll natif (pas de glisser Embla) |
| Fiche anime | `/anime/:slug` | 🟡 | Même contenu. Liste d'épisodes chargée par paquets, appui long sur un épisode → actions, vibrations. Mode « no beauty » |
| Lecteur | `/watch/:slug` | 🟡 | Voir [Lecteur](#lecteur) |
| Scans (dans la fiche) | — | 🟡 | Aperçu léger au lieu de charger toutes les pages dans la fiche |
| Lecteur de scans | `/scan/:slug` | 🟡 | Zoom au pincement |
| Accueil Mangas | `/mangas` | ✅ | Via le menu « Plus » |
| Recherche | `/search` | 🟡 | Écran mobile dédié : texte, historique, parcours par genre |
| Recherche avancée (filtres, onglet manga, filtre de langue) | `/recherche` | 🔗 | Aucun bouton n'y mène sur Android. L'onglet manga et le filtre de langue ne sont donc pas accessibles |
| Genre | `/genre/:genre` | ✅ | |
| Calendrier | `/planning` | ✅ | Onglet principal |
| À venir | `/prochainement` | ✅ | Via « Plus » |
| Classement | `/leaderboard` | ✅ | Via « Plus » |
| Téléchargements | `/downloads` | 🟡 | Onglet « Hors ligne ». Stockage privé de l'app (pas de choix de dossier), reprise auto des téléchargements interrompus au retour du réseau. Pas de repli automatique sur une autre source quand l'hébergeur lâche en route (desktop seulement) |
| Favoris | `/favorites` | ✅ | Via « Plus » |
| Mes listes | `/my-lists` | ✅ | Via « Plus » |
| Profil | `/profile` | ✅ | Refonte cosmétiques / parures / ambiances |
| Profil public | `/u/:handle` | ✅ | Nouveau design |
| Succès | `/profile/achievements` | ✅ | Via « Plus » |
| Amis | `/communaute` | ✅ | Via « Plus » |
| Paramètres | `/settings` | 🟡 | Voir [Paramètres](#paramètres) |
| Signalements | `/reports` | ✅ | Via « Plus ». Anti-spam 1.29 inclus |
| Nouveautés | `/nouveautes` | 📱 | Journal propre au mobile (`changelog.mobile.js`) |
| Aide / FAQ | `/faq` | ✅ | Via « Plus » |
| État du service | `/uptime` | 🔗 | Accessible seulement depuis un lien de la FAQ |
| Équipe | `/equipe` | 🔗 | Aucun bouton n'y mène |
| Watch Party (accueil) | `/party` | 🔗 | Retirée de la navigation mobile |
| Salon Watch Party | `/party/:code` | 🔗 | Ouvrable via un lien d'invitation `nartya://party/<code>`. Écran desktop non adapté au tactile, **à vérifier** |
| Connexion | `/login` | 🟡 | Connexion Discord dans le navigateur du téléphone, retour par `nartya://` |

## Lecteur

| Élément | Desktop | Android | Notes |
| ------- | ------- | ------- | ----- |
| Lecture HLS / MP4 | ✅ | ✅ | Proxy natif (Java) au lieu du proxy Electron. Proxy à jeton |
| Orientation | — | 📱 | En lecture, suit le sens du téléphone (portrait compris) ; portrait ailleurs |
| Bouton plein écran | 🖥️ | ❌ | Le lecteur occupe déjà tout l'écran |
| Picture-in-Picture | Bouton du lecteur | 🟡 | PiP natif : bouton du lecteur, et automatique en quittant l'app pendant la lecture. Fermer la fenêtre met en pause |
| Gestes | Clavier, souris, double-clic = plein écran | 📱 | Luminosité à gauche, volume à droite, double tap ±5 s, boutons ±5 s au centre |
| Écran toujours allumé | — | 📱 | Pendant la lecture uniquement |
| Choix de l'épisode | Panneau au survol | 🟡 | Sélecteur mobile dédié (`EpisodeSelectorMobile`) |
| Choix de la langue | Dans les réglages du lecteur | 🟡 | Dans le sélecteur d'épisodes |
| Choix de la source | Réglages du lecteur (si « Contrôles avancés ») | ✅ | Code partagé, jamais testé sur téléphone |
| Aperçu de l'épisode suivant au survol | 🖥️ | ❌ | Pas de survol en tactile |
| Masquage des contrôles en pause | 🖥️ | ❌ | |
| Upscale Anime4K | 🖥️ | ❌ | Forcé à « off » sur Android |
| Chromecast | 🖥️ | ❌ | `platform.cast = null` |
| Boost audio | ✅ | ✅ | |
| Autoskip intro/ending | ✅ | ✅ | |
| Réglages HLS | Standard | 🟡 | Profil réseau mobile (estimation de débit initiale plus basse) |

## Paramètres

| Section | Desktop | Android | Notes |
| ------- | ------- | ------- | ----- |
| Compte | ✅ | 🟡 | Android : bloc « Comptes liés » (liaison Discord propre à l'app). Desktop : délégué au Hub |
| Déconnexion | Déconnecte aussi le Hub et ferme l'app | 🟡 | Déconnecte seulement cet appareil |
| Lecture | ✅ | 🟡 | Sans « Qualité source Anime4K » |
| Notifications | ✅ | ✅ | |
| Téléchargements | ✅ | 🟡 | Dossier fixe (stockage privé) |
| Apparence | ✅ | ✅ | |
| Confidentialité (présence Discord) | 🖥️ | ❌ | |
| Sauvegarde | ✅ | ✅ | |
| Clés d'API | ✅ | ✅ | Comptes uniquement (pas les invités) |
| Mode « no beauty » | ✅ | ✅ | Code partagé |

## Éléments globaux (hors pages)

| Élément | Desktop | Android | Notes |
| ------- | ------- | ------- | ----- |
| Présence Discord | 🖥️ | ❌ | |
| Panneau + notifications d'annonces | 🖥️ | ❌ | |
| Cadeau de palier (`MilestoneGift`) | 🖥️ | ❌ | |
| Découverte du Hub (`DiscoverHub`) | 🖥️ | ❌ | Pas de Hub sur Android |
| Notification de nouvelle version (`ReleaseNotifier`) | 🖥️ | 🟡 | Android : pastille sur « Plus » + mise à jour de l'APK depuis l'app (facultative ou obligatoire) |
| Popup « Nouveautés » | ✅ | 🟡 | Feuille du bas, lit le journal mobile |
| Toasts | Coin bas-droit | 🟡 | Snackbar au-dessus de la barre d'onglets |
| Bandeau hors ligne | ✅ | 🟡 | Remplacé par un toast |
| Menu contextuel d'un anime | Clic droit | 🟡 | Appui long → feuille du bas |
| Grain de fond | 🖥️ | ❌ | |
| Ouvrir dans une nouvelle fenêtre | 🖥️ | ❌ | |
| Partage natif | — | 📱 | |
| Deep links `nartya://anime/…`, `nartya://watch/…`, `nartya://party/…` | — | 📱 | |
| Mode invité (lecture seule) | ✅ | ✅ | Mêmes restrictions |
| Bannissement machine | ✅ | ✅ | Identifiant d'appareil haché sur Android |

## Retiré partout (ni desktop ni Android)

| Élément | Depuis | Notes |
| ------- | ------ | ----- |
| Parrainage / page Affiliation | v1.29.0 desktop | N'a jamais été sur Android |
| Limite d'appareils | 2026-09-30 | Seul le bannissement machine reste |

---

## Points ouverts

À trancher ou à vérifier, par ordre de priorité :

1. **CSP du build vs bridge Capacitor.** La CSP injectée au build (`vite.config.js`) n'autorise
   pas les scripts inline. Or, sur une WebView trop ancienne (sans `DOCUMENT_START_SCRIPT`),
   Capacitor injecte son bridge en `<script>` inline. Il serait alors bloqué, l'app se
   croirait en mode web et plus rien ne se lirait. À tester avant la prochaine APK.
2. **Proxy à jeton** : lecture streaming, téléchargement et lecture hors ligne jamais testés
   sur téléphone depuis ce changement.
3. **Recherche avancée** (`/recherche`, onglet manga, filtre de langue) : l'ajouter au
   mobile ou l'assumer comme desktop only ?
4. **Watch Party** : on la rend jouable sur mobile ou on bloque proprement le lien
   d'invitation ?
5. **Équipe / État du service** : les ajouter au menu « Plus » ?
6. Certains animes ne se lisent pas sur Android (retours utilisateurs sur la 1.0.5), à
   diagnostiquer.
