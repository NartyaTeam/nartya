/**
 * Uniquement les changements disponibles sur iPhone, entrée la plus récente en tête. Rien n'est
 * recopié d'Android : une fonction commune se rédige dans chaque journal.
 * type ∈ "new" | "improved" | "fixed" ; premiumOnly: true → visible avec un abonnement actif.
 */
export const IOS_CHANGELOG = [
  {
    version: "1.6.0",
    date: "22 octobre 2026",
    items: [
      {
        type: "improved",
        text: "Si ton compte Discord était déjà lié, Nartya te demande une seule fois de te reconnecter avec Discord.",
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
        text: "Le lecteur suit le sens de ton iPhone : regarde en paysage ou en portrait, comme tu préfères.",
      },
      {
        type: "improved",
        text: "Picture-in-Picture : lance-le avec son bouton dans le lecteur, puis quitte l’app : la vidéo continue dans sa petite fenêtre.",
      },
      {
        type: "improved",
        text: "Si la connexion coupe pendant un épisode, la lecture reprend toute seule au même endroit avant de passer à une autre source.",
      },
      {
        type: "new",
        text: "Une courte intro animée t’accueille à l’ouverture de l’app. Paramètres → Lecture → Intro Nartya pour la couper.",
      },
      {
        type: "fixed",
        text: "Fini les erreurs « Aucune source » après une pause, une mise en veille ou une coupure réseau : plus besoin de relancer l’app.",
      },
      {
        type: "fixed",
        text: "Les menus du lecteur se ferment en touchant à côté, et les boutons cachés ne se déclenchent plus par erreur. Le bouton plein écran, inutile sur iPhone, disparaît.",
      },
      {
        type: "fixed",
        text: "La page de profil s’affiche enfin correctement sur iPhone.",
      },
      {
        type: "fixed",
        text: "L’épisode 0 d’une saison lançait l’épisode 1, et la progression s’enregistre aussi sur les épisodes spéciaux.",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "29 septembre 2026",
    items: [
      {
        type: "new",
        text: "Nartya arrive sur iPhone : tout le catalogue d’anime en VF et VOSTFR, avec ta progression et tes listes synchronisées avec tes autres appareils.",
      },
      {
        type: "new",
        text: "Lecteur plein écran en paysage : glisse sur le bord gauche pour la luminosité, sur le bord droit pour le volume, et touche deux fois pour avancer ou reculer.",
      },
      {
        type: "new",
        text: "Téléchargements hors ligne des épisodes et des chapitres de scans. Si tu quittes l’app pendant un téléchargement, il reprend tout seul à ton retour.",
      },
      {
        type: "new",
        text: "Lecture des scans, connexion par e-mail ou avec Discord, et mode visiteur pour découvrir l’app sans compte.",
      },
    ],
  },
];
