# Succès Nartya — catalogue et direction artistique

Les identifiants (`id`) ne changent plus une fois publiés. Les seuils sont portés par
`achievement_tier()` côté base et recopiés dans `src/data/achievements.js` pour l'affichage.

## Intention

Les succès récompensent la découverte et les habitudes déjà présentes, sans pousser à laisser
tourner le lecteur ni à regarder jusqu'à l'épuisement. Une famille possède trois paliers :

| Palier | Traitement visuel | Rôle |
| --- | --- | --- |
| I — Encre | châssis ajouré, ivoire et détail vermillion | première découverte, rapide à obtenir |
| II — Trame | même châssis, paire de lauriers et trames manga | habitude installée |
| III — Éclat | même châssis, couronne, rayons fins et or mat | accomplissement rare |

Un palier supérieur remplace le précédent dans la vitrine du profil, mais les trois restent
consultables dans la collection. Les titres courts s'affichent sur la carte ; aucun texte n'est
gravé dans l'image du badge.

## Familles en place

Leurs trois insignes sont dans `src/assets/achievements/`.

| id | Nom | Paliers | Mesure |
| --- | --- | --- | --- |
| `night_owl` | Oiseau de nuit | 1 / 10 / 50 épisodes après minuit | épisode réellement vu à ≥ 60 %, terminé entre 00:00 et 04:59 heure locale |
| `marathon` | Flamme du marathon | 3 / 5 / 8 épisodes dans une journée | maximum historique d'épisodes réellement vus sur une journée locale |
| `watch_time` | Le temps s'écoule | 1 h / 5 h / 12 h | temps de visionnage de confiance cumulé |
| `completion` | Jusqu'au bout | 1 / 5 / 20 saisons terminées | toutes les unités disponibles d'une saison réellement vues |

### Correspondance des fichiers

| Famille | Encre | Argent | Or |
| --- | --- | --- | --- |
| `night_owl` | `night_owl_1.png` | `night_owl_2.png` | `night_owl_3.png` |
| `marathon` | `marathon_1.png` | `marathon_2.png` | `marathon_3.png` |
| `watch_time` | `watch_time_1.png` | `watch_time_2.png` | `watch_time_3.png` |
| `completion` | `completion_1.png` | `completion_2.png` | `completion_3.png` |

## Idées pour la suite

Rien de cette section n'est implémenté.

### Visionnage

| id proposé | Nom | Paliers proposés | Mesure / symbole |
| --- | --- | --- | --- |
| `first_steps` | Premier trait | 1 / 10 / 50 épisodes | épisodes réellement vus / pinceau d'encre |
| `anime_explorer` | Cartographe | 3 / 10 / 25 animes | œuvres distinctes / carte et boussole |
| `long_journey` | Compagnon de route | 5 / 12 / 24 épisodes d'un même anime | fidélité à une œuvre / sandales de voyage |
| `early_bird` | Aube rouge | 1 / 10 / 50 épisodes entre 05:00 et 08:00 | heure locale / soleil levant |
| `weekend` | Guerrier du dimanche | 5 / 20 / 50 jours de week-end actifs | jours distincts / masque de samouraï |
| `streak` | Fil rouge | 3 / 7 / 30 jours consécutifs | meilleur record, jamais remis à zéro visuellement / nœud mizuhiki |
| `comeback` | Le retour | retour après 7 / 30 / 90 jours | une fois par durée, sans encourager l'absence / phénix |
| `up_to_date` | À la pointe | 1 / 5 / 15 saisons rattrapées | dernier épisode disponible vu / lame polie |

### Curiosité

| id proposé | Nom | Paliers proposés | Mesure / symbole |
| --- | --- | --- | --- |
| `genre_explorer` | Mille mondes | 3 / 7 / 12 genres | genres distincts avec ≥ 3 épisodes / éventail |
| `language` | Deux voix | 5 épisodes en VF et VOSTFR / 25 de chaque / 100 de chaque | langues réellement regardées / masque double |
| `short_story` | Éclair | 1 / 5 / 15 films ou OVA terminés | formats courts / foudre |
| `classic` | Archiviste | 1 / 5 / 15 œuvres de plus de 15 ans | année de diffusion / rouleau ancien |
| `simulcast` | Au rendez-vous | 1 / 10 / 30 épisodes vus sous 48 h | nécessite une date de sortie fiable / cloche |

### Communauté (vague ultérieure)

| id proposé | Nom | Paliers proposés | Mesure / symbole |
| --- | --- | --- | --- |
| `watch_party` | Même feu | 1 / 5 / 20 séances | Watch Party avec ≥ 2 personnes et ≥ 20 min / lanternes |
| `party_host` | Maître de cérémonie | 1 / 10 / 30 séances hébergées | mêmes garde-fous / éventail de guerre |
| `recommendation` | Passe-mot | 1 / 5 / 20 recommandations suivies | seulement si un vrai flux de recommandation existe / messager |

### Secrets

Les succès secrets apparaissent sous forme de silhouette et ne révèlent leur condition qu'une
fois obtenus.

| id proposé | Nom | Condition |
| --- | --- | --- |
| `witching_hour` | L'heure du renard | terminer un épisode entre 03:00 et 03:59 |
| `perfect_week` | Les sept sceaux | regarder exactement un épisode chacun des sept jours d'une semaine |
| `one_sitting` | Sans entracte | terminer une saison courte (≤ 6 épisodes) sur une même journée |
| `anniversary` | Un an déjà | regarder un épisode le jour anniversaire de l'inscription |

## Règles de comptage

- La source canonique est le temps de confiance de `heartbeat_watch` / `watch_tick`, pas
  `episode_progress` seul. « Marquer comme vu » ne débloque aucun succès.
- Un épisode compte comme réellement vu après au moins 60 % de sa durée créditée côté serveur.
- Une même unité ne compte qu'une fois par famille, même en changeant de langue.
- Les jours et créneaux utilisent le fuseau enregistré pour l'événement. Un changement de
  fuseau ne recalcule pas l'historique.
- Les succès sont attribués côté serveur et sont immuables. Une correction de métadonnées ne
  retire jamais un badge déjà obtenu.
- Le palier Marathon est plafonné à 8 épisodes par jour : au-delà, l'app ne crée aucune
  récompense supplémentaire.
- Les séries sans liste d'épisodes fiable ne peuvent pas valider `completion` ou `up_to_date`.

## Modèle de données

- `user_achievements` : attribution immuable (`user_id`, `achievement_id`, `unlocked_at`).
  `achievement_id` = `<famille>_<palier>`. Aucune policy d'écriture : tout passe par des
  fonctions `SECURITY DEFINER`.
- `user_achievement_stats` : une ligne par membre, compteurs des familles dont l'événement
  n'est pas rejouable (nuit, journée locale, saisons) + plus haut palier atteint par famille.
  Le temps de visionnage n'y est PAS dupliqué : il est lu depuis `watch_time`.
- `user_season_progress` : total d'unités déclaré par le client et date de complétion.
- `watch_time` gagne `truly_watched_at` (posé une fois, au franchissement des 60 %) et
  `tz_offset_minutes` (fuseau figé avec l'événement).
- `achievement_tier(famille, valeur)` porte le barème côté serveur — à garder synchronisé
  avec `src/data/achievements.js`, qui ne fait plus que de la présentation.

### Coût

L'évaluation ne coûte **aucune requête supplémentaire** : elle est faite dans `watch_tick`,
le battement du lecteur qui partait déjà toutes les 30 s, et qui renvoie désormais les
paliers nouvellement débloqués (pour le toast). Le chemin chaud est en lecture seule sur la
ligne d'agrégat ; les comptages réels (nuit, journée, saison) ne tournent qu'au moment où un
épisode bascule à « réellement vu », soit une fois par épisode.

La vitrine du profil passe par une colonne `achievements` **appendée** à `get_user_stats` et
`get_public_profile` — les badges d'un membre sont publics, pas ses compteurs. Seule la page
collection appelle une RPC dédiée, `get_achievements()`, une fois au chargement.

## Interface

- Toast au déblocage, renvoyé par le battement du lecteur (`AchievementUnlock`).
- Vitrine des insignes sur le profil, publique.
- Collection complète sur `/profile/achievements` : prochain palier et progression.

## Direction artistique et prompt source

Les succès suivent « 朱 / Vermillion Noir » comme des insignes de chapitres manga : encre
sumi-e, pinceau sec, trames screentone, ivoire et vermillion. Toutes les familles partagent le
même châssis vertical ajouré (pointe haute, attaches latérales, pointe basse et queues courtes)
et au moins 60 % d'espace négatif. Aucun disque, médaillon, écu plein ou plaque de fond n'est
autorisé : l'insigne doit rester lisible à 96 px sans devenir une masse sombre.

Le symbole central identifie la famille et ne change jamais entre ses trois niveaux. La montée
en gamme est strictement additive : châssis seul au niveau I, paire de lauriers au niveau II,
puis petite couronne et rayons dorés fins au niveau III. Les douze visuels gardent la même
hauteur utile, le même axe, la même ligne de base et la même épaisseur générale. Ils restent de
face, sans texte, sans ruban, sans métal réaliste et sans cadre médiéval.

La planche actuelle a été générée avec le mode intégré `imagegen` sur fond chroma uniforme,
puis détourée localement. Prompt résumé : quatre rangées (`night_owl`, `marathon`,
`watch_time`, `completion`), châssis commun ajouré, symboles centraux constants et trois
paliers additifs de richesse croissante. Esthétique éditoriale anime/manga, traits au pinceau
et trames, silhouettes isolées, aucun texte, aucun rendu 3D.
