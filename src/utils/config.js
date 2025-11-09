const path = require("path");

// Configuration de l'application AnimeStream
const CONFIG = {
  // Configuration Electron
  ELECTRON: {
    WINDOW: {
      WIDTH: 1200,
      HEIGHT: 800,
      MIN_WIDTH: 800,
      MIN_HEIGHT: 600,
      TITLE: "AnimeStream",
      ICON: "chibi.png",
    },
    DEV_TOOLS: process.argv.includes("--dev"),
  },

  // Configuration du scraper
  SCRAPER: {
    BASE_URL: "https://anime-sama.org",
    SEARCH_ENDPOINT: "/template-php/defaut/fetch.php",
    CATALOG_ENDPOINT: "/catalogue/",
    DELAY_BETWEEN_REQUESTS: 2000, // ms
    MAX_RESULTS: 20,
    ANIMES_JSON: path.join(__dirname, "..", "data", "animes.json"),
  },

  // Configuration AniList API
  ANILIST: {
    GRAPHQL_ENDPOINT: "https://graphql.anilist.co",
    TIMEOUT: 5000, // ms
  },

  // Configuration de l'interface
  UI: {
    SEARCH_DELAY: 300, // ms
    ANIMATION_DURATION: 300, // ms
    MAX_SEARCH_RESULTS: 20,
  },

  // Configuration des vidéos
  VIDEO: {
    EXTRACTION_TIMEOUT: 5000, // ms
    PAGE_LOAD_DELAY: 2000, // ms
    SUPPORTED_FORMATS: ["mp4", "webm", "ogg", "avi", "mov"],
  },
};

module.exports = CONFIG;
