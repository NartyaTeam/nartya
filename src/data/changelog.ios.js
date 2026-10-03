/**
 * Uniquement les changements disponibles sur iPhone, entrée la plus récente en tête. Rien n'est
 * recopié d'Android : une fonction commune se rédige dans chaque journal.
 * type ∈ "new" | "improved" | "fixed" ; premiumOnly: true → visible avec un abonnement actif.
 */
export const IOS_CHANGELOG = [
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
