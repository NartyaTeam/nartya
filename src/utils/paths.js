const path = require("path");
const fs = require("fs");

/**
 * Gère les chemins de l'application de manière compatible avec le mode dev et production
 * En mode production (.exe), les données sont stockées dans userData
 * En mode dev, les données sont dans le dossier src/data
 */

// Déterminer si on est en mode dev ou production
const isDev =
  process.argv.includes("--dev") || process.env.NODE_ENV === "development";

// Chemins de base
const SRC_DIR = path.join(__dirname, "..");
const DATA_DIR_DEV = path.join(SRC_DIR, "data");

// Fonction pour obtenir le dossier userData de manière sûre
function getUserDataPath() {
  try {
    const { app } = require("electron");
    if (app && app.getPath) {
      return path.join(app.getPath("userData"), "data");
    }
  } catch (error) {
    // Electron n'est pas disponible ou app n'est pas prêt
  }
  return DATA_DIR_DEV;
}

const DATA_DIR_PROD = getUserDataPath();

// Utiliser le bon dossier de données selon le mode
const DATA_DIR = isDev ? DATA_DIR_DEV : DATA_DIR_PROD;

// Créer le dossier de données en production s'il n'existe pas
if (!isDev && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log("📁 Dossier de données créé:", DATA_DIR);
}

// Fonction pour copier les fichiers de données par défaut en production
function ensureDataFiles() {
  if (isDev) return; // En dev, on utilise directement les fichiers sources

  const dataFiles = [
    "animes.json",
    "favorites.json",
    "watch-history.json",
    "video-progress.json",
  ];

  dataFiles.forEach((filename) => {
    const destPath = path.join(DATA_DIR, filename);

    // Si le fichier n'existe pas dans userData, le créer
    if (!fs.existsSync(destPath)) {
      const sourcePath = path.join(DATA_DIR_DEV, filename);

      // Si le fichier source existe dans l'asar, le copier
      if (fs.existsSync(sourcePath)) {
        try {
          const content = fs.readFileSync(sourcePath, "utf8");
          fs.writeFileSync(destPath, content, "utf8");
          console.log(`✅ Fichier copié: ${filename}`);
        } catch (error) {
          console.error(`❌ Erreur lors de la copie de ${filename}:`, error);
          // Créer un fichier vide par défaut
          if (filename === "animes.json") {
            fs.writeFileSync(destPath, "[]", "utf8");
          } else {
            fs.writeFileSync(destPath, "{}", "utf8");
          }
        }
      } else {
        // Créer un fichier vide par défaut
        console.log(`⚠️ Création d'un fichier vide: ${filename}`);
        if (filename === "animes.json") {
          fs.writeFileSync(destPath, "[]", "utf8");
        } else {
          fs.writeFileSync(destPath, "{}", "utf8");
        }
      }
    }
  });
}

// Initialiser les fichiers de données en production
ensureDataFiles();

const PATHS = {
  // Dossiers principaux
  SRC: SRC_DIR,
  ELECTRON: path.join(SRC_DIR, "electron"),
  FRONTEND: path.join(SRC_DIR, "frontend"),
  SCRAPER: path.join(SRC_DIR, "scraper"),
  ASSETS: path.join(SRC_DIR, "assets"),
  DATA: DATA_DIR,
  UTILS: path.join(SRC_DIR, "utils"),

  // Fichiers spécifiques
  MAIN_JS: path.join(SRC_DIR, "electron", "main.js"),
  PRELOAD_JS: path.join(SRC_DIR, "electron", "preload.js"),
  INDEX_HTML: path.join(SRC_DIR, "frontend", "index.html"),
  ANIMES_JSON: path.join(DATA_DIR, "animes.json"),
  FAVORITES_JSON: path.join(DATA_DIR, "favorites.json"),
  WATCH_HISTORY_JSON: path.join(DATA_DIR, "watch-history.json"),
  VIDEO_PROGRESS_JSON: path.join(DATA_DIR, "video-progress.json"),

  // Assets
  ICON: path.join(SRC_DIR, "assets", "chibi.png"),

  // Informations utiles
  IS_DEV: isDev,
  get USER_DATA() {
    try {
      const { app } = require("electron");
      return app && app.getPath ? app.getPath("userData") : null;
    } catch (error) {
      return null;
    }
  },
};

console.log("📂 Chemins de l'application:");
console.log("   Mode:", isDev ? "DÉVELOPPEMENT" : "PRODUCTION");
console.log("   Données:", DATA_DIR);

module.exports = PATHS;
