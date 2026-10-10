/**
 * Uniquement les changements disponibles sur iPhone, entrée la plus récente en tête. Rien n'est
 * recopié d'Android : une fonction commune se rédige dans chaque journal.
 * type ∈ "new" | "improved" | "fixed" ; premiumOnly: true → visible avec un abonnement actif.
 */
export const IOS_CHANGELOG = [
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
