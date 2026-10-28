/**
 * Thèmes précis proposés à la recherche : tags AniList (noms exacts) et leur libellé français.
 * Choisis pour ce qu'ils disent de l'histoire, là où les genres restent trop larges.
 */
export const TROPE_GROUPS = [
  {
    label: "Intrigue",
    tags: [
      ["Revenge", "Vengeance"],
      ["Death Game", "Jeu mortel"],
      ["Battle Royale", "Battle royale"],
      ["Survival", "Survie"],
      ["Time Loop", "Boucle temporelle"],
      ["Time Manipulation", "Voyage dans le temps"],
      ["Reincarnation", "Réincarnation"],
      ["Reverse Isekai", "Isekai inversé"],
      ["Conspiracy", "Complot"],
      ["Kingdom Management", "Gestion de royaume"],
      ["Politics", "Politique"],
      ["War", "Guerre"],
      ["Tragedy", "Tragédie"],
      ["Coming of Age", "Passage à l'âge adulte"],
    ],
  },
  {
    label: "Pouvoirs et combats",
    tags: [
      ["Super Power", "Super-pouvoirs"],
      ["Cultivation", "Cultivation"],
      ["Magic", "Magie"],
      ["Superhero", "Super-héros"],
      ["Martial Arts", "Arts martiaux"],
      ["Swordplay", "Combats à l'épée"],
      ["Assassins", "Assassins"],
      ["Ninja", "Ninjas"],
      ["Samurai", "Samouraïs"],
      ["Military", "Militaire"],
    ],
  },
  {
    label: "Univers",
    tags: [
      ["Dystopian", "Dystopie"],
      ["Post-Apocalyptic", "Post-apocalyptique"],
      ["Cyberpunk", "Cyberpunk"],
      ["Space Opera", "Space opera"],
      ["Virtual World", "Monde virtuel"],
      ["Video Games", "Jeux vidéo"],
      ["Dungeon", "Donjons"],
      ["Mythology", "Mythologie"],
      ["Urban Fantasy", "Fantasy urbaine"],
      ["Criminal Organization", "Pègre et mafia"],
      ["Historical", "Historique"],
    ],
  },
  {
    label: "Personnages",
    tags: [
      ["Anti-Hero", "Anti-héros"],
      ["Female Protagonist", "Héroïne"],
      ["Villainess", "Méchante"],
      ["Ensemble Cast", "Personnages multiples"],
      ["Primarily Adult Cast", "Personnages adultes"],
      ["Detective", "Détective"],
      ["Demons", "Démons"],
      ["Gods", "Dieux"],
      ["Vampire", "Vampires"],
      ["Found Family", "Famille de cœur"],
    ],
  },
  {
    label: "Ambiance",
    tags: [
      ["Iyashikei", "Feel-good"],
      ["Love Triangle", "Triangle amoureux"],
      ["Fake Relationship", "Faux couple"],
      ["Cohabitation", "Colocation"],
      ["Food", "Cuisine"],
      ["Idol", "Idols"],
      ["Band", "Groupe de musique"],
    ],
  },
];

export const TROPE_LABEL = Object.fromEntries(TROPE_GROUPS.flatMap((g) => g.tags));
