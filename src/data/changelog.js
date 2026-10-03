/**
 * Affiché par <WhatsNew /> après une mise à jour. Une entrée par version, la plus récente en
 * tête, rédigée pour l'utilisateur.
 * type ∈ "new" | "improved" | "fixed" ; premiumOnly: true → visible avec un abonnement actif.
 */
export const CHANGELOG = [
  {
    version: "1.30.0",
    date: "1er octobre 2026",
    items: [
      {
        type: "new",
        text: "Une courte intro animée t’accueille à l’ouverture de l’app. Paramètres → Lecture → Intro Nartya pour la couper.",
      },
      {
        type: "new",
        text: "Raccourcis clavier : Ctrl+F pour chercher, Ctrl+J pour les téléchargements, Ctrl+M pour tes listes et Ctrl+K pour les mangas.",
      },
      {
        type: "new",
        text: "Une carte « Nouvel épisode » de l’accueil ouvre la fiche directement sur cet épisode.",
      },
      {
        type: "new",
        text: "Fini la limite d’appareils : ton compte peut être connecté partout en même temps.",
      },
      {
        type: "improved",
        text: "Les épisodes démarrent plus vite.",
      },
      {
        type: "improved",
        text: "Si un hébergeur lâche pendant un téléchargement, l’app continue sur une autre source.",
      },
      {
        type: "improved",
        text: "Aide & FAQ entièrement mise à jour : connexion par e-mail, mode visiteur, iPhone, téléchargements…",
      },
      {
        type: "improved",
        text: "Le clic droit dans le lecteur n’ouvre plus de menu inutile.",
      },
      {
        type: "fixed",
        text: "L’épisode 0 d’une saison lançait l’épisode 1.",
      },
      {
        type: "fixed",
        text: "La progression s’enregistre aussi sur les épisodes spéciaux.",
      },
      {
        type: "fixed",
        text: "Un téléchargement repris garde sa qualité au lieu de repartir en qualité minimale.",
      },
      {
        type: "fixed",
        text: "Anime4K : l’image ne reste plus figée après un retour en arrière dans l’épisode.",
      },
      {
        type: "fixed",
        text: "Taille des chapitres de scan mieux estimée avant téléchargement, et sécurité renforcée.",
      },
    ],
  },
  {
    version: "1.29.1",
    date: "27 septembre 2026",
    items: [
      {
        type: "fixed",
        text: "Le profil des autres membres profite enfin de la nouvelle page de profil, comme le tien.",
      },
    ],
  },
  {
    version: "1.29.0",
    date: "27 septembre 2026",
    items: [
      {
        type: "new",
        text: "Nouvelle page de profil : rang, activité, succès, calendrier de visionnage et anime préférés.",
      },
      {
        type: "new",
        text: "Profil personnalisable : couleurs, fond, parures et carte Nartya à partager.",
      },
      {
        type: "new",
        text: "Signalements suivis : échange avec l’équipe et consulte l’état des services dans l’app.",
      },
      {
        type: "new",
        text: "Recherche manga et nouveaux filtres.",
      },
      {
        type: "new",
        text: "Mode anti-spoiler : floute les vignettes des épisodes non vus, depuis la liste des épisodes.",
      },
      {
        type: "new",
        text: "Onglet Galerie sur les fiches anime, avec téléchargement des visuels.",
      },
      {
        type: "new",
        text: "Mode rapide pour ouvrir les fiches plus vite. Paramètres → Mode no beauty.",
      },
      {
        type: "new",
        text: "Page Équipe.",
      },
      {
        type: "improved",
        text: "Lecteur simplifié, avec un aperçu de l’épisode suivant.",
      },
      {
        type: "improved",
        text: "Le choix des sources se trouve dans les réglages du lecteur. Paramètres → Contrôles avancés du lecteur.",
      },
      {
        type: "improved",
        text: "Cast vers la TV plus fiable, pilotable depuis la télécommande.",
      },
      {
        type: "improved",
        text: "Salons de visionnage mieux synchronisés.",
      },
      {
        type: "improved",
        text: "Logos officiels des séries sur l’accueil et les fiches.",
      },
      {
        type: "improved",
        text: "Rang et parure affichés dans les commentaires.",
      },
      {
        type: "improved",
        text: "Installation plus légère d’environ 40 Mo.",
      },
      {
        type: "improved",
        text: "Le parrainage prend fin, remplacé bientôt par un système de crédits.",
      },
      {
        type: "fixed",
        text: "Corrections d’affichage et de chargement sur les fiches, le lecteur, l’accueil et les scans.",
      },
      {
        type: "fixed",
        text: "Sécurité renforcée. macOS 12 n’est plus pris en charge.",
      },
    ],
  },
  {
    version: "1.28.1",
    date: "27 août 2026",
    items: [
      {
        type: "fixed",
        text: "Le recadrage de la photo de profil et de la bannière fonctionne de nouveau correctement dans l’éditeur de profil.",
      },
      {
        type: "fixed",
        text: "Les Watch Parties restent mieux synchronisées et reprennent plus facilement après une coupure.",
      },
      {
        type: "fixed",
        text: "Anime4K peut de nouveau être activé sur certaines configurations Linux équipées d’un GPU NVIDIA récent.",
      },
    ],
  },
  {
    version: "1.27.0",
    date: "25 août 2026",
    items: [
      {
        type: "new",
        text: "On est 3000 : Ultimate t'est offert pendant 1 mois. Réclame-le depuis la fenêtre au lancement.",
      },
      {
        type: "new",
        text: "Autoskip intro/ending : saute automatiquement l'opening et l'ending, parfait pour les marathons.",
      },
      {
        type: "new",
        text: "Un bandeau d'avertissement façon Netflix (Violence, Scènes suggestives…) s'affiche au lancement d'un anime.",
      },
      {
        type: "new",
        text: "Les chapitres de scans se téléchargent maintenant pour une lecture hors ligne.",
      },
      {
        type: "new",
        text: "Nouveaux onglets « Recommandations » et « Musiques » sur la fiche anime.",
      },
      {
        type: "improved",
        text: "Le saut d'intro/ending couvre beaucoup plus d'épisodes qu'avant.",
      },
      {
        type: "improved",
        text: "Le détail d'un anime dans « Mes listes » fait peau neuve : dates modifiables, accès direct à la fiche, retrait plus simple.",
      },
      {
        type: "improved",
        text: "Tri manuel par glisser-déposer sur tes listes et tes favoris.",
      },
      {
        type: "improved",
        text: "Les fiches anime s'ouvrent nettement plus vite.",
      },
      {
        type: "improved",
        text: "La vitrine Premium quitte l'app desktop : ça se gère depuis le Hub désormais.",
      },
      {
        type: "fixed",
        text: "Un anime ne se marque plus « En cours » après un simple coup d'œil.",
      },
      {
        type: "fixed",
        text: "Fini les redirections aléatoires vers Téléchargements au démarrage.",
      },
      {
        type: "fixed",
        text: "Le bouton Retour du lecteur de scans fonctionne enfin normalement.",
      },
      {
        type: "fixed",
        text: "Le classement reflète maintenant le vrai visionnage, plus le marquage manuel.",
      },
      {
        type: "fixed",
        text: "Mauvais visuel affiché sur certains films (Demon Slayer) : corrigé.",
      },
      {
        type: "fixed",
        text: "L'affiche et la bannière ne restent plus collées à l'anime précédent.",
      },
      {
        type: "fixed",
        text: "Anime4K et l'accélération GPU refonctionnent sous Linux.",
      },
    ],
  },
  {
    version: "1.26.0",
    date: "16 août 2026",
    items: [
      {
        type: "improved",
        text: "Un épisode téléchargé pour le hors-ligne tient maintenant dans un seul fichier vidéo, prêt à être copié ou partagé, au lieu de dizaines de petits fichiers.",
      },
      {
        type: "fixed",
        text: "Les téléchargements qui restaient bloqués aux alentours de 99% se terminent maintenant correctement. En cas d’échec, un message clair s’affiche à la place d’une erreur technique.",
      },
      {
        type: "fixed",
        text: "Tes épisodes déjà téléchargés restent accessibles hors ligne, même sans connexion internet ni session active.",
      },
      {
        type: "fixed",
        text: "La lecture ne saccade plus quand la fenêtre de Nartya perd le focus, par exemple en mode PiP ou sur un second écran.",
      },
      {
        type: "fixed",
        text: "La jaquette et le résumé affichés suivent maintenant la saison que tu regardes, quand ils diffèrent de la fiche générale de l’anime.",
      },
      {
        type: "fixed",
        text: "Le tri des saisons fonctionne maintenant correctement pour les anime dont les saisons portent un nom d’arc plutôt qu’un numéro (comme JoJo’s Bizarre Adventure).",
      },
      {
        type: "fixed",
        text: "Le bouton Retour du lecteur de manga ne te renvoie plus dans un chapitre déjà lu : il retrouve la page consultée juste avant d’ouvrir le manga.",
      },
    ],
  },
  {
    version: "1.25.0",
    date: "14 août 2026",
    items: [
      {
        type: "new",
        text: "Tu peux maintenant noter chaque anime de 1 à 5 étoiles. La moyenne Nartya apparaît sur la fiche à partir de cinq notes, juste à côté de celle d’AniList.",
      },
      {
        type: "new",
        text: "Quand un membre participe aux commentaires, sa note pour l’anime s’affiche à côté de son pseudo : pratique pour comprendre son point de vue en un coup d’œil.",
      },
      {
        type: "improved",
        text: "Le sélecteur range désormais les saisons dans l’ordre, puis les sagas, les films et enfin les contenus spéciaux. Les longues listes deviennent beaucoup plus simples à parcourir.",
      },
      {
        type: "improved",
        text: "Dans « Marquer vus », le choix de l’épisode profite maintenant de commandes plus nettes et mieux intégrées au style de Nartya.",
      },
      {
        type: "fixed",
        text: "Les commentaires restent accessibles sur les fiches qui ne proposent encore aucun épisode, au lieu de se retrouver cachés avec l’onglet de lecture.",
      },
      {
        type: "fixed",
        text: "L’épisode annoncé comme « bientôt disponible » tient maintenant compte de la langue choisie et ne s’affiche plus plusieurs épisodes trop loin en VF.",
      },
      {
        type: "fixed",
        text: "L’accès aux sources et aux services Nartya devient plus fiable sur les réseaux dont le DNS bloque certaines adresses, tout en conservant une solution de secours sur les réseaux qui refusent le DNS sécurisé.",
      },
      {
        type: "fixed",
        text: "Anime4K se désactive proprement si le pilote graphique redémarre ou après une sortie de veille, plutôt que de laisser le lecteur noir ou figé.",
      },
      {
        type: "improved",
        text: "L’ancienne option de liaison Discord a été retirée de l’app desktop : la gestion du compte passe désormais par Nartya Hub.",
      },
    ],
  },
  {
    version: "1.24.0",
    date: "12 août 2026",
    items: [
      {
        type: "fixed",
        text: "Les fonctions liées au profil, au parrainage et aux demandes de retrait ont été reconnectées à la nouvelle infrastructure pour retrouver un fonctionnement normal.",
      },
      {
        type: "improved",
        text: "Les synchronisations en arrière-plan ont été allégées afin de réduire les ralentissements pendant les périodes chargées.",
      },
    ],
  },
  {
    version: "1.23.0",
    date: "9 août 2026",
    items: [
      {
        type: "new",
        text: "Une nouvelle page Recherche réunit le catalogue anime et tous ses filtres : titre, genres, format et nombre d'épisodes se combinent maintenant au même endroit.",
      },
      {
        type: "improved",
        text: "Les Réglages ont été entièrement réorganisés pour être plus lisibles, avec un aperçu de tes préférences et un accès rapide à chaque rubrique.",
      },
      {
        type: "new",
        text: "Tu peux désormais lier Discord à ton compte e-mail sans perdre ta progression, puis choisir séparément d'importer ta photo de profil ou ta bannière.",
      },
      {
        type: "new",
        text: "Anime4K arrive dans le lecteur pour tous les utilisateurs : améliore la netteté et les détails des animes en temps réel, choisis la qualité source à verrouiller et profite de plusieurs modes d'upscale depuis la roue des réglages.",
      },
      {
        type: "improved",
        text: "Le sélecteur d'épisodes devient plus grand et plus lisible : miniatures, descriptions, progression et épisode en cours sont mieux mis en valeur, y compris en plein écran.",
      },
      {
        type: "fixed",
        text: "Changer de saison n'affiche plus brièvement les épisodes de la saison précédente, et les commandes personnalisées du lecteur gardent maintenant la bonne taille en plein écran.",
      },
      {
        type: "improved",
        text: "Les fiches anime affichent maintenant leur logo officiel détouré lorsqu'il est disponible, avec le titre habituel en repli.",
      },
      {
        type: "improved",
        text: "Tu peux maintenant choisir combien d'épisodes se téléchargent simultanément afin de préserver ta connexion pendant la lecture, dans la limite de ton forfait.",
      },
      {
        type: "improved",
        text: "L'accueil conserve maintenant son dernier catalogue pendant sept jours : il s'affiche immédiatement au démarrage et reste disponible si le service met du temps à répondre.",
      },
      {
        type: "new",
        text: "Sur les pages longues, un bouton apparaît après le défilement pour revenir instantanément en haut de la page — une suggestion de la communauté.",
      },
      {
        type: "fixed",
        text: "Un contrôle réseau momentanément indisponible ne fait plus basculer l'app au hasard en mode hors ligne.",
      },
      {
        type: "fixed",
        text: "Les titres, descriptions et images d'épisodes sont de nouveau associés à la bonne saison ou partie, notamment sur Bleach, Boruto, Seven Deadly Sins et les listes sans fillers.",
      },
      {
        type: "improved",
        text: "Lorsqu'un épisode annoncé n'est toujours pas disponible après sa date prévue, sa fiche indique désormais clairement le retard et rappelle la date initiale.",
      },
    ],
  },
  {
    version: "1.22.1",
    date: "4 août 2026",
    items: [
      {
        type: "fixed",
        text: "Le son est de retour sur les sources qui en manquaient. La vidéo se lançait normalement mais restait muette sur une partie des sources — Source A notamment. Le partage vers un Chromecast était touché par le même défaut.",
      },
    ],
  },
  {
    version: "1.22.0",
    date: "4 août 2026",
    items: [
      {
        type: "fixed",
        text: "Tes épisodes téléchargés sont de nouveau accessibles sans connexion. Lancée hors ligne, l'app te renvoyait vers l'écran de connexion et ta bibliothèque devenait inatteignable — précisément au moment où elle sert le plus.",
      },
      {
        type: "fixed",
        text: "Le badge « Nouveau » ne se déclenche plus à tort. Terminer le premier épisode d'un anime fini depuis des années faisait remonter son épisode 2 en tête de « Reprendre » comme une nouveauté. Seuls les épisodes réellement sortis depuis ton dernier visionnage sont signalés.",
      },
      {
        type: "new",
        text: "Les animes diffusés ailleurs ont enfin leur place. Pour Wakfu ou Le Collège Noir, l'onglet Épisodes te renvoie maintenant vers le diffuseur officiel — France TV, ADN, Crunchyroll… — au lieu de disparaître, avec la mention « gratuit » quand c'est le cas.",
      },
      {
        type: "improved",
        text: "Les sources du lecteur portent désormais des noms neutres et stables — « Source A », « Source B »… — l'étoile marquant celle qu'on recommande. Si tu avais choisi une source prioritaire dans les Paramètres, elle repasse sur « Automatique » : à re-choisir une fois.",
      },
      {
        type: "improved",
        text: "Télécharger une saison entière ne s'essouffle plus en cours de route. Sur les longues saisons, les derniers épisodes échouaient parfois à s'ajouter ; ils partent maintenant à un rythme que le serveur suit jusqu'au bout.",
      },
      {
        type: "new",
        text: "Inscription mieux protégée : une vérification anti-robot discrète, et les mots de passe connus pour figurer dans des fuites publiques sont refusés. Ton mot de passe ne quitte jamais ton appareil pour cette vérification.",
      },
    ],
  },
  {
    version: "1.21.0",
    date: "30 juillet 2026",
    items: [
      {
        type: "new",
        text: "Films & Séries quitte l'app anime et devient Nartya Movies, une application à part entière à installer depuis le Hub. Ta liste et ta progression t'y attendent : tout est lié à ton compte, rien n'est perdu.",
      },
      {
        type: "fixed",
        text: "Quand une source vidéo lâche en pleine lecture, Nartya bascule maintenant tout seul sur une autre et reprend exactement là où tu en étais. Le message « la lecture a échoué » n'apparaît plus que si toutes les sources de l'épisode sont tombées.",
      },
      {
        type: "improved",
        text: "Beaucoup moins de coupures : les hébergeurs les plus rapides sont désormais essayés en premier, et la qualité s'ajuste toute seule quand une source ne suit pas le rythme.",
      },
      {
        type: "improved",
        text: "« Qualité de lecture » devient un plafond plutôt qu'une qualité imposée : l'app peut descendre en dessous pour garder une image fluide, au lieu de s'obstiner et de charger toutes les cinq secondes.",
      },
      {
        type: "fixed",
        text: "Un hébergeur qui ne fonctionnait plus du tout n'est plus proposé dans le lecteur, et ceux qui sont en panne passent en fin de liste au lieu d'être essayés en premier.",
      },
    ],
  },
  {
    version: "1.20.0",
    date: "30 juillet 2026",
    items: [
      {
        type: "new",
        text: "Les succès arrivent : quatre familles de badges (Oiseau de nuit, Flamme du marathon, Le temps s'écoule, Jusqu'au bout), chacune avec trois paliers. Épingle tes préférés sur ton profil et retrouve toute ta collection dans le nouvel onglet « Succès ».",
      },
      {
        type: "new",
        text: "Nouvelle page « Prochainement » : le calendrier des sorties de la saison en cours et de la saison prochaine, en un coup d'œil.",
      },
      {
        type: "new",
        text: "Le genre se précise désormais sur tes favoris, pour un tri plus fin de ta collection.",
      },
      {
        type: "improved",
        text: "Films & Séries passe sur une nouvelle infrastructure de streaming : meilleure qualité vidéo sur davantage de titres, et « Ma liste » suit désormais ton compte au lieu de rester coincée sur un seul appareil.",
      },
    ],
  },
  {
    version: "1.19.0",
    date: "25 juillet 2026",
    items: [
      {
        type: "new",
        text: "Chaque anime, film et série a désormais son espace de discussion : réponses, likes, édition de ton message, et un tag spoiler qui floute le texte tant qu'on ne clique pas dessus.",
      },
      {
        type: "new",
        text: "Dans un commentaire, tape « @ » pour citer un épisode précis : il devient un lien cliquable avec sa vignette, qui emmène directement au bon endroit.",
      },
      {
        type: "new",
        text: "Nouvelle page Communauté : recherche de membres, demandes d'amis, et une pastille dans le menu quand quelqu'un t'ajoute. Tes amis s'affichent sur ton profil.",
      },
      {
        type: "new",
        text: "Ton profil indique si tu es en ligne, ou quand tu étais actif pour la dernière fois. Désactivable dans les options du profil, comme la liste d'amis.",
      },
      {
        type: "new",
        text: "Ton profil compte ses visites, dans l'app comme sur le site. Une visite par personne et par jour, et les tiennes ne comptent pas.",
      },
      {
        type: "new",
        text: "La progression est enfin sauvegardée côté Films & Séries : section « Reprendre » sur l'accueil, barre de progression et coche « vu » sur les épisodes, comme sur les animes.",
      },
      {
        type: "new",
        text: "Une cloche apparaît dans l'app quand l'équipe publie une annonce, avec l'historique complet.",
      },
      {
        type: "new",
        text: "Tu choisis le cadrage de ta bannière de profil au moment de l'importer, au lieu de subir un recadrage automatique.",
      },
      {
        type: "new",
        text: "La page Premium affiche la date de fin de ton abonnement et les jours restants.",
      },
      {
        type: "improved",
        text: "Les vignettes et les titres d'épisodes des animes sont plus fiables et couvrent davantage de séries.",
      },
      {
        type: "improved",
        text: "Un anime que tu avais fini remonte en tête de « Reprendre » dès qu'un nouvel épisode sort, avec un badge « Nouveau » — plus besoin d'aller le rechercher à la main.",
      },
      {
        type: "fixed",
        text: "Sur Windows, le plein écran pouvait afficher une bande noire d'un côté et rogner l'image de l'autre, surtout sur les écrans en mise à l'échelle.",
      },
      {
        type: "fixed",
        text: "La flèche droite pouvait enchaîner plusieurs épisodes d'un coup en fin de lecture.",
      },
      {
        type: "fixed",
        text: "La page Téléchargements pouvait rester définitivement noire après l'annulation d'épisodes, et le rester même après réinstallation. Le problème se répare tout seul au prochain lancement.",
      },
      {
        type: "fixed",
        text: "Plus de déconnexions surprises quand l'app et le Hub rafraîchissaient ta session en même temps. Changer d'avatar ou de bannière ne peut plus te déconnecter non plus.",
      },
    ],
  },
  {
    version: "1.18.1",
    date: "23 juillet 2026",
    items: [
      {
        type: "improved",
        text: "Sur l'écran de connexion, le Nartya Hub s'ouvre maintenant automatiquement — plus besoin de cliquer sur « Ouvrir Nartya Hub ».",
      },
      {
        type: "improved",
        text: "La déconnexion a rejoint Paramètres > Compte, avec une confirmation avant de fermer ta session.",
      },
      {
        type: "fixed",
        text: "Une connexion faite dans le Hub pendant que l'app attendait pouvait ne jamais être détectée. L'app se met maintenant automatiquement au premier plan une fois connectée.",
      },
      {
        type: "fixed",
        text: "Dans le rail replié, la pastille de notifications pouvait chevaucher l'avatar ou déborder du menu.",
      },
    ],
  },
  {
    version: "1.18.0",
    date: "22 juillet 2026",
    items: [
      {
        type: "new",
        text: "On est 1000 : Ultimate t'est offert pendant 7 jours si ton compte existait avant l'annonce. Une fenêtre te propose de le réclamer au lancement — rien à faire, rien à payer.",
      },
      {
        type: "fixed",
        text: "Sur Mac, le Nartya Hub annonçait qu'aucune version de l'app n'était disponible et refusait de l'installer. L'app est de nouveau proposée, avec une version adaptée à chaque type de Mac — Apple Silicon comme Intel.",
      },
    ],
  },
  {
    version: "1.17.0",
    date: "22 juillet 2026",
    items: [
      {
        type: "new",
        text: "Ta connexion se fait maintenant depuis le Nartya Hub : connecte-toi une fois là-bas et toutes tes apps suivent, sans avoir à te reconnecter dans chacune.",
      },
      {
        type: "new",
        text: "Les scans que tu lis apparaissent dans l'activité de ton profil, avec le chapitre atteint.",
      },
      {
        type: "new",
        text: "Chaque épisode affiche désormais sa vignette, sa durée et sa note — y compris sur les longues sagas comme One Piece, où les images manquaient jusqu'ici.",
      },
      {
        type: "improved",
        text: "Le menu latéral se range en catégories repliables : plus court, plus lisible, et il retient ce que tu as replié.",
      },
      {
        type: "improved",
        text: "Téléchargements : les épisodes se téléchargent dans l'ordre, et une saison entière peut être annulée d'un coup.",
      },
      {
        type: "fixed",
        text: "L'activité du profil oubliait les scans dont tu n'avais pas dépassé la première page : ils s'affichent tous.",
      },
      {
        type: "fixed",
        text: "Le bouton d'installation du hub menait à une page inexistante.",
      },
    ],
  },
  {
    version: "1.16.1",
    date: "18 juillet 2026",
    items: [
      {
        type: "new",
        text: "Nartya Hub est arrivé : le launcher qui réunit toutes les apps Nartya au même endroit — installe, lance et met à jour tes apps depuis une seule fenêtre. Installe-le pour continuer à recevoir les mises à jour de l'application.",
      },
      {
        type: "new",
        text: "Connexion unique : une seule connexion dans le hub et toutes tes apps Nartya démarrent déjà connectées, sans avoir à te reconnecter app par app.",
      },
      {
        type: "improved",
        text: "Le hub reconnaît automatiquement l'application déjà installée sur ton PC : aucune réinstallation, il prend simplement le relais pour les mises à jour.",
      },
    ],
  },
  {
    version: "1.15.0",
    date: "17 juillet 2026",
    items: [
      {
        type: "new",
        text: "Classement hebdomadaire : basculez entre « Cette semaine » et « Depuis toujours » pour voir qui est le plus actif sur la semaine en cours (le classement repart à zéro chaque lundi).",
      },
      {
        type: "new",
        text: "Nouveau bandeau communauté sur l'accueil pour rejoindre le Discord (support, annonces, suggestions).",
      },
      {
        type: "improved",
        text: "Le pseudo affiché sur votre profil est désormais éditable et ne se réinitialise plus tout seul à la reconnexion.",
      },
      {
        type: "improved",
        text: "Bandeau Premium repensé sur l'accueil : argumentaire clair pour les non-abonnés, message de remerciement pour les abonnés.",
      },
      {
        type: "improved",
        text: "Vérifications de connexion (bannissement, limite d'appareils) allégées pour une app plus réactive et plus économe en réseau.",
      },
      {
        type: "fixed",
        text: "La suppression d'un compte déconnecte désormais immédiatement l'appareil et coupe l'accès à l'application.",
      },
      {
        type: "fixed",
        text: "Le temps de visionnage et les épisodes réellement vus sont désormais comptabilisés plus fidèlement.",
      },
    ],
  },
  {
    version: "1.14.0",
    date: "17 juillet 2026",
    items: [
      {
        type: "new",
        text: "Classement de la communauté : découvrez les membres les plus assidus (temps de visionnage, épisodes vus, animes suivis) et visitez leur profil d'un simple clic.",
      },
      {
        type: "new",
        text: "Watch Party : invitez vos amis avec un simple lien — ils rejoignent automatiquement le salon.",
      },
      {
        type: "improved",
        text: "Marquez toute une saison (ou jusqu'à un épisode donné) comme vue en un clic, au lieu de cocher chaque épisode un par un.",
      },
      {
        type: "improved",
        text: "Photo de profil : recadrez et zoomez votre avatar avant de l'enregistrer.",
      },
      {
        type: "improved",
        text: "Films & Séries : accédez directement à une page précise du catalogue, sans avancer page par page.",
      },
      {
        type: "fixed",
        text: "Profil : « Aucune » retire de nouveau correctement l'ambiance animée et l'emblème kanji.",
      },
    ],
  },
  {
    version: "1.13.2",
    date: "16 juillet 2026",
    items: [
      {
        type: "new",
        text: "Connexion par e-mail et mot de passe, en plus de Discord — avec un mode visiteur pour découvrir l'app sans compte.",
      },
      {
        type: "new",
        text: "Nartya Premium : abonnement Plus et Ultimate, avec cosmétiques et avantages exclusifs.",
      },
      {
        type: "new",
        text: "Ambiances animées Premium : personnalisez votre app et votre profil avec un thème immersif.",
      },
      {
        type: "fixed",
        text: "Lecteur : la vidéo pouvait rester figée sur certaines configurations — la qualité s'adapte désormais automatiquement.",
      },
    ],
  },
  {
    version: "1.13.1",
    date: "14 juillet 2026",
    items: [
      {
        type: "improved",
        text: "Films & Séries : naviguez entre épisodes directement depuis le lecteur, grâce à un sélecteur de saisons et d'épisodes accessible même en plein écran, et aux boutons épisode précédent/suivant.",
      },
      {
        type: "improved",
        text: "Lecteur d'anime : changez manuellement de source (hébergeur) quand une source est cassée ou mal étiquetée, et changez de source ou de langue sans perdre votre progression.",
      },
      {
        type: "improved",
        text: "Le plein écran reste actif quand vous passez à l'épisode suivant : plus besoin de le réactiver à chaque changement.",
      },
      {
        type: "improved",
        text: "Démarrage des épisodes plus rapide : les sources sont désormais essayées en parallèle, fini les longues attentes quand une source est lente.",
      },
      {
        type: "improved",
        text: "Meilleure prise en charge des animes proposant plusieurs doublages (VF 1, VF 2…) : drapeaux et libellés corrects, et choix de la langue plus fiable.",
      },
      {
        type: "fixed",
        text: "Films & Séries : correction de séries qui affichaient par erreur les épisodes d'une œuvre sans rapport.",
      },
      {
        type: "fixed",
        text: "Films & Séries : les versions françaises sont proposées en priorité et les sources illisibles sont écartées automatiquement.",
      },
    ],
  },
  {
    version: "1.13.0",
    date: "13 juillet 2026",
    items: [
      {
        type: "new",
        text: "Nouvel espace Films & Séries (BÊTA) : Nartya ne se limite plus aux animes ! Un tout nouveau catalogue de films et de séries, avec sa propre navigation. Basculez d'un univers à l'autre depuis la barre latérale (petite animation au passage), parcourez, regardez en streaming avec plusieurs sources et langues (VF/VOSTFR), et retrouvez vos titres dans une liste et un profil dédiés à cet univers. ⚠️ Votre liste Films & Séries est pour l'instant enregistrée localement sur votre appareil : ne désinstallez pas Nartya, au risque de la perdre.",
      },
      {
        type: "new",
        text: "Profil repensé : ajoutez une bannière et une photo de profil personnalisées, une bio, choisissez un pseudo public et une couleur d'accent, et mettez vos animes préférés en avant. Votre activité de visionnage et vos statistiques s'affichent automatiquement.",
      },
      {
        type: "new",
        text: "Partagez votre profil : chaque membre a désormais un lien public nartya.app/u/votre-pseudo qui ouvre son profil directement dans le navigateur, avec un bouton « Voir dans l'app ». Copiez-le depuis votre profil via le bouton Partager.",
      },
      {
        type: "new",
        text: "Confidentialité du profil : masquez votre activité, vos favoris ou rendez tout votre profil privé depuis « Éditer ».",
      },
      {
        type: "new",
        text: "Téléchargement d'une saison entière : téléchargez tous les épisodes d'une saison d'un anime en une seule fois pour les regarder hors ligne.",
      },
      {
        type: "new",
        text: "Scans : la lecture de scans arrive ! Accédez-y depuis le nouvel onglet « Scans » sur la page d'un anime.",
      },
      {
        type: "new",
        text: "Calendrier des sorties : consultez les prochains épisodes et suivez un anime (depuis le calendrier ou sa page) pour être notifié dès qu'un nouvel épisode est disponible.",
      },
      {
        type: "new",
        text: "Qualité vidéo : choisissez la qualité de votre épisode dans les options du lecteur (uniquement quand plusieurs qualités sont disponibles).",
      },
      {
        type: "new",
        text: "Chromecast (expérimental) : envoyez votre épisode sur un appareil compatible Chromecast. En cas de bug, n'hésitez pas à nous le signaler.",
      },
      {
        type: "improved",
        text: "Recherche améliorée : nouveaux filtres, notamment par nombre d'épisodes.",
      },
      {
        type: "improved",
        text: "Affichage des images corrigé : beaucoup moins d'affiches pixelisées ou cassées.",
      },
      {
        type: "improved",
        text: "Accueil : fin des doublons dans le grand carrousel du haut, et une sélection d'animes plus variée.",
      },
      {
        type: "improved",
        text: "Lecture plus fluide (moins de saccades) et divers correctifs de performance.",
      },
      {
        type: "fixed",
        text: "Renforcements de sécurité côté téléchargements et lecture locale.",
      },
    ],
  },
  {
    version: "1.12.1",
    date: "5 juillet 2026",
    items: [
      {
        type: "fixed",
        text: "Correction d'un problème de connexion avec Discord : certains comptes restaient bloqués sur la page « Échec de la connexion » et n'arrivaient pas à se connecter. La connexion fonctionne désormais pour tous les comptes.",
      },
    ],
  },
  {
    version: "1.12.0",
    date: "5 juillet 2026",
    items: [
      {
        type: "new",
        text: "Mes listes : classez vos animes par statut (En cours, À voir, Terminé, Abandonné) depuis « Ma collection ». Les dates de début et de fin se remplissent toutes seules au fil de votre visionnage.",
      },
      {
        type: "new",
        text: "Recherche et genres : une barre de recherche en haut de l'app et la navigation par genre pour explorer plus facilement le catalogue.",
      },
      {
        type: "new",
        text: "Sauvegarde de votre collection : exportez vos favoris, listes et progression dans un fichier, et restaurez-les quand vous voulez (dans les Réglages).",
      },
      {
        type: "new",
        text: "Nouvelle page d'aide (FAQ) dans le menu Studio : les réponses aux questions les plus courantes sur Nartya.",
      },
      {
        type: "improved",
        text: "Accueil repensé et section « Reprendre » plus claire : retirez un anime de « Reprendre » d'un clic, et choisissez combien d'éléments y afficher.",
      },
      {
        type: "improved",
        text: "Boost audio réglable dans les Réglages : montez le volume au-delà de 100 % pour les épisodes au son trop faible.",
      },
      {
        type: "fixed",
        text: "Correction du menu de choix du statut dans « Mes listes », qui n'était pas cliquable.",
      },
    ],
  },
  {
    version: "1.11.0",
    date: "2 juillet 2026",
    items: [
      {
        type: "new",
        text: "Parrainage : invitez vos amis sur Nartya et gagnez 0,20 € par personne. Retrouvez votre lien perso et vos gains dans la nouvelle page « Affiliation » (menu de gauche).",
      },
      {
        type: "new",
        text: "Suivi de vos filleuls en temps réel : voyez qui a rejoint grâce à vous et l'avancement de la validation de chaque invitation.",
      },
      {
        type: "new",
        text: "Retrait des gains : dès 15 € accumulés, demandez votre versement en un clic directement depuis la page Affiliation.",
      },
    ],
  },
  {
    version: "1.10.1",
    date: "28 juin 2026",
    items: [
      {
        type: "new",
        text: "Transparence renforcée : chaque version de Nartya est désormais analysée automatiquement par plus de 70 antivirus (VirusTotal) et publiée avec une empreinte de vérification. Vous pouvez contrôler vous-même ce que vous téléchargez depuis notre site.",
      },
    ],
  },
  {
    version: "1.10.0",
    date: "28 juin 2026",
    items: [
      {
        type: "new",
        text: "Nouvelle page Réglages (dans le menu de gauche) pour personnaliser l'application selon vos envies.",
      },
      {
        type: "new",
        text: "Choisissez la couleur de l'app : plusieurs ambiances prêtes à l'emploi, ou votre propre couleur sur mesure.",
      },
      {
        type: "new",
        text: "Langue par défaut : la langue que vous préférez (VOSTFR, VF…) est désormais sélectionnée automatiquement à l'ouverture d'un anime.",
      },
      {
        type: "new",
        text: "Source vidéo préférée : choisissez la source à essayer en premier — en cas de souci, l'app bascule toute seule sur une autre.",
      },
      {
        type: "new",
        text: "Qualité de téléchargement : choisissez la qualité de vos épisodes hors ligne. Une qualité plus légère se lit plus facilement sur les appareils peu puissants (Chromebook, ancien PC) et prend moins de place.",
      },
      {
        type: "new",
        text: "Vous gardez la main : activez ou désactivez la lecture automatique de l'épisode suivant, l'affichage de votre activité sur Discord, et un mode performance qui allège les animations sur les machines modestes.",
      },
      {
        type: "fixed",
        text: "Téléchargements plus fiables : un épisode ne reste plus bloqué en cours de téléchargement.",
      },
    ],
  },
  {
    version: "1.9.0",
    date: "27 juin 2026",
    items: [
      {
        type: "new",
        text: "Lecture automatique de l'épisode suivant : à la fin d'un épisode, un bouton avec décompte enchaîne tout seul sur le suivant — vous pouvez l'annuler ou lancer la suite immédiatement.",
      },
      {
        type: "new",
        text: "Avance et recul rapides au clavier : les flèches ← et → sautent de 10 secondes (avec un indicateur à l'écran), et la touche F passe en plein écran.",
      },
      {
        type: "improved",
        text: "Réglage du volume simplifié : le boost (jusqu'à 300 %) est maintenant intégré directement à la barre de volume — plus besoin de passer par les réglages. Vous pouvez aussi ajuster le son à la molette, et votre niveau est mémorisé.",
      },
      {
        type: "improved",
        text: "L'épisode suivant se précharge avant la fin du précédent pour démarrer quasi instantanément.",
      },
      {
        type: "fixed",
        text: "Le double-clic pour passer en plein écran ne met plus la lecture en pause.",
      },
      {
        type: "fixed",
        text: "Le lecteur ne propose plus de « reprendre » un épisode que vous n'avez jamais regardé.",
      },
      {
        type: "fixed",
        text: "Un bouton retour reste accessible même lorsqu'une source vidéo ne se charge pas (avant, on pouvait rester bloqué sur la page).",
      },
    ],
  },
  {
    version: "1.8.2",
    date: "24 juin 2026",
    items: [
      {
        type: "improved",
        text: "Téléchargements hors ligne plus rapides : la meilleure source est choisie automatiquement et le téléchargement est accéléré.",
      },
      {
        type: "fixed",
        text: "Le bouton d'annulation d'un téléchargement répond désormais au premier clic.",
      },
      {
        type: "fixed",
        text: "La source vidéo et la langue choisies sont conservées quand vous revenez à la fiche de l'anime depuis le lecteur (au lieu de repasser sur « auto »).",
      },
      {
        type: "improved",
        text: "« Reprendre » passe directement à l'épisode suivant quand vous avez terminé un épisode, au lieu de reproposer celui déjà vu.",
      },
      {
        type: "fixed",
        text: "Photo de profil Discord : si vous changez d'avatar, elle se met à jour dans l'application au lieu de rester cassée.",
      },
    ],
  },
  {
    version: "1.8.1",
    date: "23 juin 2026",
    items: [
      {
        type: "fixed",
        text: "L'application s'ouvre désormais correctement sur Chromebook (ChromeOS) : la fenêtre restait invisible et l'app se fermait toute seule au démarrage.",
      },
    ],
  },
  {
    version: "1.8.0",
    date: "21 juin 2026",
    items: [
      {
        type: "new",
        text: "Boost audio dans le lecteur : montez le son au-delà de 100 % (jusqu'à 300 %) via les réglages ⚙️ — pratique sur Chromebook ou les appareils dont le volume paraît un peu faible.",
      },
      {
        type: "fixed",
        text: "Le « Quoi de neuf » ne s'affiche plus avant la connexion : il apparaît désormais une fois que vous êtes connecté.",
      },
    ],
  },
  {
    version: "1.7.1",
    date: "21 juin 2026",
    items: [
      {
        type: "fixed",
        text: "Connexion Discord réparée : après « Connexion réussie » dans le navigateur, vous êtes désormais bien connecté dans l'application.",
      },
    ],
  },
  {
    version: "1.7.0",
    date: "20 juin 2026",
    items: [
      {
        type: "improved",
        text: "Ouverture de l'application plus rapide et plus fiable : votre compte (pseudo, avatar) est retrouvé instantanément au démarrage.",
      },
    ],
  },
  {
    version: "1.6.1",
    date: "20 juin 2026",
    items: [
      {
        type: "fixed",
        text: "La présence Discord (l'anime que vous regardez sur votre profil) fonctionne désormais dans l'application installée, et plus seulement en interne.",
      },
      {
        type: "improved",
        text: "Démarrage hors ligne quasi instantané : l'app ne patiente plus à l'ouverture sans connexion.",
      },
      {
        type: "fixed",
        text: "Quand la connexion revient, l'app se resynchronise toute seule : votre profil (pseudo, avatar) et les sections du catalogue réapparaissent sans avoir à la redémarrer.",
      },
    ],
  },
  {
    version: "1.6.0",
    date: "20 juin 2026",
    items: [
      {
        type: "new",
        text: "Présence Discord : l'anime que vous regardez s'affiche automatiquement sur votre profil Discord (épisode et saison compris).",
      },
      {
        type: "new",
        text: "Deux boutons sur la présence Discord : « Regarder cet anime » (ouvre directement la fiche dans l'app) et « Visiter le site ».",
      },
      {
        type: "improved",
        text: "Chargement du catalogue nettement plus rapide et fiable au démarrage, grâce à un cache plus malin côté serveur.",
      },
      {
        type: "improved",
        text: "Ouverture de l'application accélérée : l'accueil ne patiente plus après la connexion.",
      },
      {
        type: "fixed",
        text: "Fini l'écran « impossible de charger le catalogue » sur un simple ralentissement : l'app retente automatiquement avant d'abandonner.",
      },
    ],
  },
  {
    version: "1.5.0",
    date: "20 juin 2026",
    items: [
      {
        type: "new",
        text: "Téléchargez vos épisodes pour les regarder hors ligne, où que vous soyez et sans connexion.",
      },
      {
        type: "new",
        text: "Mode hors ligne : une bibliothèque dédiée regroupe vos épisodes téléchargés (par anime) et les lance même sans internet.",
      },
      {
        type: "improved",
        text: "Les téléchargements choisissent automatiquement la source la plus rapide pour réduire l'attente.",
      },
      {
        type: "fixed",
        text: "La saison sélectionnée est désormais conservée quand vous revenez en arrière depuis le lecteur.",
      },
    ],
  },
  {
    version: "1.4.0",
    date: "19 juin 2026",
    items: [
      {
        type: "new",
        text: "Watch Party : regardez vos animes en même temps que vos amis, en temps réel, depuis n'importe où.",
      },
      {
        type: "new",
        text: "Chaque participant peut choisir sa langue (VF / VOSTFR) indépendamment — la lecture attend que tout le monde soit prêt avant de démarrer.",
      },
      {
        type: "new",
        text: "Chat en direct intégré au salon : réactions emoji flottantes, messages système (arrivée / départ), et historique de session.",
      },
      {
        type: "new",
        text: "Options du salon pour l'hôte : attente au changement de langue, attente d'un nouveau participant, réglage du délai de synchronisation accepté.",
      },
      {
        type: "improved",
        text: "Page d'accueil Watch Party repensée : reprenez un épisode en cours à plusieurs avec les mêmes vignettes et barres de progression que la page principale.",
      },
      {
        type: "improved",
        text: "Installeur Windows : affiche désormais une interface d'installation visible avec barre de progression au lieu de s'exécuter silencieusement.",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "18 juin 2026",
    items: [
      {
        type: "new",
        text: "Un récapitulatif « Quoi de neuf » apparaît désormais après chaque mise à jour pour vous présenter les nouveautés.",
      },
    ],
  },
  {
    version: "1.2.1",
    date: "18 juin 2026",
    items: [
      {
        type: "fixed",
        text: "Connexion Discord réparée sur Chromebook et certaines configurations Linux (la fenêtre d'autorisation ne ramenait pas toujours vers l'application).",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "18 juin 2026",
    items: [
      {
        type: "new",
        text: "Barre latérale repliable : gardez seulement les icônes pour gagner de l'espace, ou dépliez-la d'un clic.",
      },
      {
        type: "new",
        text: "Sélecteur d'épisodes et choix de la langue (VF / VOSTFR) directement dans le lecteur.",
      },
      {
        type: "fixed",
        text: "Correction d'artefacts d'affichage et de la grille des favoris.",
      },
    ],
  },
];
