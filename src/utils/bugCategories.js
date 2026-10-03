// `value` est stocké en base, `icon` est un nom d'icône lucide.
export const BUG_CATEGORIES = [
  { value: "playback", label: "Lecture vidéo", icon: "Play", hint: "Buffering, écran noir, pas de son, sous-titres…" },
  { value: "scans", label: "Scans / manga", icon: "BookOpen", hint: "Pages manquantes, lecteur de scans…" },
  { value: "downloads", label: "Téléchargements", icon: "Download", hint: "Échec, fichier corrompu, hors ligne…" },
  { value: "catalog", label: "Catalogue & infos", icon: "LibraryBig", hint: "Anime/épisode manquant, mauvaise info…" },
  { value: "account", label: "Compte & connexion", icon: "UserCog", hint: "Connexion, profil, favoris, listes…" },
  { value: "ui", label: "Interface & affichage", icon: "LayoutDashboard", hint: "Glitch visuel, bouton cassé, lenteur…" },
  { value: "other", label: "Autre", icon: "CircleHelp", hint: "Tout le reste" },
];

export const BUG_CATEGORY_MAP = Object.fromEntries(BUG_CATEGORIES.map((c) => [c.value, c]));
export const bugCategoryLabel = (v) => BUG_CATEGORY_MAP[v]?.label || "Autre";
