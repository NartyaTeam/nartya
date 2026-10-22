/**
 * Uniquement les changements disponibles dans l'APK, entrée la plus récente en tête. Rien n'est
 * recopié du desktop : une fonction commune se rédige dans chaque journal.
 * type ∈ "new" | "improved" | "fixed" ; premiumOnly: true → visible avec un abonnement actif.
 */
export const MOBILE_CHANGELOG = [
  {
    version: "1.6.0",
    date: "22 octobre 2026",
    items: [
      {
        type: "improved",
        text: "Si ton compte Discord était déjà lié, Nartya te demande une seule fois de te reconnecter avec Discord.",
      },
      {
        type: "fixed",
        text: "La mise à jour depuis l’app ne bloque plus sur « Signature APK absente » sur certains téléphones.",
      },
    ],
  },
  {
    version: "1.5.0",
    date: "22 octobre 2026",
    items: [
      {
        type: "new",
        text: "Lie tes comptes AniList et MyAnimeList dans les Paramètres : les épisodes que tu regardes, tes statuts, tes notes et tes chapitres lus y sont reportés tout seuls. Tu peux aussi importer ta liste AniList ou MyAnimeList dans Nartya, ou envoyer ta liste Nartya là-bas.",
      },
      {
        type: "new",
        text: "Nouveau bouton « Recommander » sur la fiche des animes : les animes les plus recommandés du mois forment la rangée « Recommandé par la communauté » sur l’accueil.",
      },
      {
        type: "new",
        text: "Classement : nouvel onglet « Chapitres lus », et des classements du jour, du mois et de l’année en plus de la semaine.",
      },
      {
        type: "new",
        text: "Tier lists : tu peux répondre à un message du chat, les réponses se rangent en fil sous le message.",
      },
      {
        type: "new",
        text: "Paramètres → Apparence → « Ambiance du profil partout » : l’ambiance de ton profil (pluie, neige, pétales…) s’affiche en fond de toute l’app.",
      },
      {
        type: "improved",
        text: "L’ambiance selon l’heure est plus marquée : matin clair, après-midi d’automne, coucher de soleil, puis lanternes la nuit.",
      },
      {
        type: "improved",
        text: "En créant une tier list, le titre et la description sont deux champs bien distincts : plus de risque de taper le titre au mauvais endroit.",
      },
    ],
  },
  {
    version: "1.4.0",
    date: "21 octobre 2026",
    items: [
      {
        type: "new",
        text: "Grosse nouveauté : les Tier lists ! Classe tes animes dans tes propres rangées (texte, couleurs et nombre au choix), publie ta tier list, et la communauté peut voter 👍/👎 et en discuter dans son chat. Tu peux aussi refaire la tier list d’un autre à ta sauce, ou la télécharger en image.",
      },
      {
        type: "new",
        text: "Nouvelle page Historique, dans le menu « Plus » : tout ce que tu as regardé ou lu, classé par jour, avec un bouton pour reprendre.",
      },
      {
        type: "new",
        text: "Favoris et Mes listes ont maintenant un onglet Animes et un onglet Mangas.",
      },
      {
        type: "new",
        text: "Nouveau réglage « Ambiance selon l’heure » dans Paramètres → Apparence : la lueur de fond suit l’aube, le jour, le coucher de soleil et la nuit.",
      },
      {
        type: "new",
        text: "Le lecteur de scans se lit aussi dans le sens manga, de droite à gauche, en pages horizontales.",
      },
      {
        type: "new",
        text: "Dans « Éditer » sur ton profil, choisis l’affiche de chaque anime de ton podium parmi les visuels de sa galerie.",
      },
      {
        type: "new",
        text: "Un bouton cadenas dans le lecteur fige l’écran dans le sens actuel, même allongé sur le côté.",
      },
      {
        type: "fixed",
        text: "La carte de profil et les visuels de la Galerie s’enregistrent maintenant dans Images › Nartya.",
      },
      {
        type: "improved",
        text: "Les titres des mangas sont plus faciles à reconnaître, et « Langue des titres » s’applique aussi aux mangas.",
      },
      {
        type: "fixed",
        text: "La vitesse de lecture choisie (x2 par exemple) reste appliquée à l’épisode suivant.",
      },
      {
        type: "fixed",
        text: "Calendrier : le jour souligné suit maintenant le jour choisi, et celui que tu fais défiler. Un point indique aujourd’hui.",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "20 octobre 2026",
    items: [
      {
        type: "new",
        text: "La recherche a un onglet Mangas, qui trouve aussi les mangas et webtoons sans anime.",
      },
      {
        type: "new",
        text: "Choisis la langue des titres dans Paramètres → Apparence : d’origine, romaji ou anglais.",
      },
      {
        type: "new",
        text: "Au dernier épisode d’une saison, le bouton suivant et le compte à rebours enchaînent directement sur la saison d’après.",
      },
      {
        type: "new",
        text: "Filtre Tout / VF / VOSTFR dans le calendrier : ton choix est gardé.",
      },
      {
        type: "new",
        text: "Ton profil affiche le nombre de chapitres de scans que tu as lus.",
      },
      {
        type: "new",
        text: "Tu choisis l’ordre de ton podium dans « Éditer » sur ton profil.",
      },
      {
        type: "new",
        text: "Nouveau réglage « Succès pendant la lecture » dans Paramètres → Lecture : une petite carte dans le coin, à la fin de l’épisode, ou l’animation en grand.",
      },
      {
        type: "improved",
        text: "Une confirmation s’affiche avant de retirer un anime ou un scan de « Reprendre ».",
      },
      {
        type: "improved",
        text: "Quand tu finis le dernier épisode d’un anime terminé, il se range tout seul dans tes animes terminés.",
      },
      {
        type: "improved",
        text: "Dans l’activité de ton profil, un épisode ouvre la fiche de l’anime au lieu de lancer la lecture.",
      },
      {
        type: "fixed",
        text: "Un anime rangé dans « Terminé » ne revient plus dans « Reprendre » quand tu marques des épisodes vus, sauf si un nouvel épisode sort.",
      },
    ],
  },
  {
    version: "1.2.1",
    date: "10 octobre 2026",
    items: [
      {
        type: "new",
        text: "Halloween s’invite sur Nartya pendant tout le mois d’octobre : une intro inédite (orage, pleine lune, nuée de chauves-souris) et une icône d’app avec le renard coiffé de son chapeau de sorcière.",
      },
      {
        type: "fixed",
        text: "Le podium et l’activité de ton profil affichent de nouveau la bonne affiche pour certains animes, comme Demon Slayer.",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "5 octobre 2026",
    items: [
      {
        type: "new",
        text: "Nartya change de visage : nouveau renard, nouvelle icône et nouvelle identité (encre, corail et blanc, titres inclinés, contours francs, boutons en relief) sur toute l’app.",
      },
      {
        type: "new",
        text: "Ton profil prend sa place au centre de la barre du bas, avec ta photo. « Hors ligne » passe dans le menu « Plus » et revient dans la barre quand tu n’as plus de connexion.",
      },
      {
        type: "new",
        text: "Ton classement : une carte affiche ta position exacte sur chaque vue du classement.",
      },
      {
        type: "improved",
        text: "La page de profil occupe tout l’écran, sans bandes de fond sur les côtés, en haut ou en bas.",
      },
      {
        type: "improved",
        text: "Paramètres → Téléchargements : l’emplacement des épisodes est expliqué, sans boutons inutiles.",
      },
      {
        type: "fixed",
        text: "Le bouton retour ne recouvre plus le titre des pages comme Signalements, Aide, Amis, Équipe ou Statut des services.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "4 octobre 2026",
    items: [
      {
        type: "new",
        text: "Picture-in-Picture : quitte l’app pendant un épisode et la vidéo continue dans une petite fenêtre. Le bouton PiP du lecteur fonctionne aussi.",
      },
      {
        type: "new",
        text: "Le lecteur suit le sens de ton téléphone : regarde en paysage ou en portrait, comme tu préfères.",
      },
      {
        type: "new",
        text: "Nouvelle page de profil : rang, activité, succès, calendrier de visionnage et anime préférés, avec tes couleurs, ton fond, tes parures et ta carte Nartya à partager.",
      },
      {
        type: "new",
        text: "Mode anti-spoiler, onglet Galerie sur les fiches anime et mode rapide pour ouvrir les fiches plus vite (Paramètres → Mode no beauty).",
      },
      {
        type: "new",
        text: "Signalements suivis : échange avec l’équipe depuis le menu « Plus ».",
      },
      {
        type: "new",
        text: "Une courte intro animée t’accueille à l’ouverture de l’app. Paramètres → Lecture → Intro Nartya pour la couper.",
      },
      {
        type: "improved",
        text: "Si la connexion coupe pendant un épisode, la lecture reprend toute seule au même endroit avant de passer à une autre source.",
      },
      {
        type: "improved",
        text: "Les épisodes démarrent plus vite, et le choix des sources se trouve dans les réglages du lecteur (Paramètres → Contrôles avancés du lecteur).",
      },
      {
        type: "fixed",
        text: "Les menus du lecteur se ferment en touchant à côté, et les boutons cachés ne se déclenchent plus par erreur. Le bouton plein écran, inutile sur téléphone, disparaît.",
      },
      {
        type: "fixed",
        text: "L’épisode 0 d’une saison lançait l’épisode 1, et la progression s’enregistre aussi sur les épisodes spéciaux.",
      },
    ],
  },
  {
    version: "1.0.5",
    date: "26 août 2026",
    items: [
      {
        type: "fixed",
        text: "L’image de l’épisode pouvait rester noire en cours de lecture sur certains téléphones Xiaomi/POCO, tant qu’aucun contrôle n’était affiché à l’écran. Le correctif de la version précédente ne suffisait pas.",
      },
      {
        type: "fixed",
        text: "Le bouton « Reprendre » d’un anime pouvait annoncer un mauvais numéro de saison (ex. « Saison 6 ») quand l’anime a des films ou des rediffusions spéciales entre deux saisons.",
      },
      {
        type: "fixed",
        text: "Impossible de confirmer le recadrage d’une nouvelle photo de profil ou bannière : la fenêtre de recadrage s’affichait derrière celle d’édition du profil.",
      },
    ],
  },
  {
    version: "1.0.4",
    date: "26 août 2026",
    items: [
      {
        type: "fixed",
        text: "L’image de l’épisode pouvait aussi rester noire en cours de lecture (pas seulement au lancement) tant qu’aucun contrôle n’était affiché à l’écran, sur certains téléphones Xiaomi.",
      },
    ],
  },
  {
    version: "1.0.3",
    date: "26 août 2026",
    items: [
      {
        type: "fixed",
        text: "L’image de l’épisode pouvait rester invisible au lancement sur certains téléphones Xiaomi/POCO, le temps qu’un contrôle apparaisse à l’écran.",
      },
      {
        type: "fixed",
        text: "En plein écran, l’heure et les boutons du téléphone pouvaient rester affichés par-dessus le lecteur au lieu de disparaître.",
      },
      {
        type: "fixed",
        text: "Un bandeau blanc pouvait apparaître brièvement en haut de l’app, notamment en scrollant tout en haut d’une page.",
      },
      {
        type: "fixed",
        text: "Sur tablette, le menu de navigation en bas de l’écran pouvait être invisible, rendant l’app difficile à utiliser.",
      },
      {
        type: "new",
        text: "Le zoom au pincement (pinch-to-zoom) est disponible en lisant un scan, pour une lecture plus confortable — il ne fait plus tourner la page par erreur.",
      },
      {
        type: "fixed",
        text: "Reprendre un épisode déjà téléchargé pendant qu’on le regardait en streaming ne remet plus la lecture à zéro.",
      },
      {
        type: "new",
        text: "Autoskip intro/ending arrive sur mobile : saute automatiquement l’opening et l’ending depuis les réglages, parfait pour les marathons.",
      },
      {
        type: "fixed",
        text: "L’écran pouvait rester allumé plus longtemps que nécessaire après une mise en pause.",
      },
      {
        type: "improved",
        text: "La qualité vidéo en mode Auto est plus stable sur un réseau instable, au lieu d’osciller sans arrêt entre deux qualités.",
      },
      {
        type: "fixed",
        text: "Sur tablette, la progression d’un téléchargement de saison pouvait s’afficher sur la mauvaise saison si on changeait de saison entre-temps.",
      },
      {
        type: "improved",
        text: "Le passage en mode hors ligne est signalé par une simple notification au lieu d’un bandeau qui restait affiché en permanence, y compris par-dessus le lecteur.",
      },
    ],
  },
  {
    version: "1.0.2",
    date: "22 août 2026",
    items: [
      {
        type: "fixed",
        text: "La flèche de retour ne répondait plus une fois un épisode lancé — elle fonctionne à nouveau normalement.",
      },
      {
        type: "fixed",
        text: "Choisir une qualité vidéo plus basse pendant la lecture est maintenant bien respecté, y compris en plein écran.",
      },
      {
        type: "fixed",
        text: "Le bouton « Passer l’intro » restait parfois affiché sans réagir au tap — il disparaît et fonctionne comme prévu.",
      },
      {
        type: "fixed",
        text: "Le sélecteur d’épisodes pouvait rester bloqué, impossible à fermer ou à utiliser.",
      },
      {
        type: "fixed",
        text: "Un crash pouvait survenir en annulant un téléchargement sur certains appareils (notamment Redmi).",
      },
      {
        type: "fixed",
        text: "La connexion avec Discord pouvait rester coincée dans le navigateur au lieu de revenir dans l’application.",
      },
      {
        type: "fixed",
        text: "La qualité choisie pour un téléchargement hors ligne n’était pas toujours respectée.",
      },
      {
        type: "new",
        text: "Le mode Picture-in-Picture (PiP) est maintenant disponible pour continuer à regarder en réduisant le lecteur.",
      },
      {
        type: "new",
        text: "Il est maintenant possible de sélectionner plusieurs épisodes d’un coup pour les télécharger, plutôt qu’un par un.",
      },
    ],
  },
  {
    version: "1.0.1",
    date: "21 août 2026",
    items: [
      {
        type: "fixed",
        text: "Le téléchargement d’un épisode ne provoque plus de fermeture de l’application sur les APK release Android.",
      },
      {
        type: "improved",
        text: "Le lecteur tactile distingue maintenant les gestes volontaires : maintenir puis glisser permet de chercher dans l’épisode, tandis que le double tap avance ou recule sans faire clignoter les contrôles.",
      },
      {
        type: "improved",
        text: "La qualité vidéo s’adapte plus progressivement au débit mobile et le lecteur conserve davantage d’avance afin de réduire les chargements pendant un épisode.",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "21 août 2026",
    items: [
      {
        type: "new",
        text: "Le journal des nouveautés est maintenant disponible directement dans le menu Plus, avec un indicateur discret quand une mise à jour apporte du nouveau.",
      },
      {
        type: "improved",
        text: "Les confirmations apparaissent désormais dans une seule notification discrète en bas de l’écran. Le dernier message remplace le précédent et peut être balayé vers le bas.",
      },
      {
        type: "new",
        text: "Un appui long sur un épisode ou une carte d’anime ouvre maintenant sa feuille d’actions Android, avec une légère vibration de confirmation.",
      },
      {
        type: "improved",
        text: "Les épisodes déjà vus sont plus faciles à reconnaître et leurs descriptions profitent de davantage d’espace, sans alourdir la liste.",
      },
      {
        type: "fixed",
        text: "Le hero et les carrousels de l’accueil sont maintenant parfaitement alignés : plus d’interstice entre deux images pendant un balayage ni de contenu collé au bord gauche.",
      },
      {
        type: "fixed",
        text: "Continuer en tant que visiteur ouvre maintenant correctement l’accueil au lieu de rester bloqué sur le chargement.",
      },
      {
        type: "fixed",
        text: "Les sessions de connexion sont désormais exclues des sauvegardes Android afin qu’aucun jeton de compte ne soit restauré sur un autre appareil.",
      },
    ],
  },
];
