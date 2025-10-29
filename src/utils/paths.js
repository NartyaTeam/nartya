const path = require('path');

// Chemins relatifs depuis la racine du projet
const PATHS = {
    // Dossiers principaux
    SRC: path.join(__dirname, '..'),
    ELECTRON: path.join(__dirname, '..', 'electron'),
    FRONTEND: path.join(__dirname, '..', 'frontend'),
    SCRAPER: path.join(__dirname, '..', 'scraper'),
    ASSETS: path.join(__dirname, '..', 'assets'),
    DATA: path.join(__dirname, '..', 'data'),
    UTILS: path.join(__dirname, '..', 'utils'),

    // Fichiers spécifiques
    MAIN_JS: path.join(__dirname, '..', 'electron', 'main.js'),
    PRELOAD_JS: path.join(__dirname, '..', 'electron', 'preload.js'),
    INDEX_HTML: path.join(__dirname, '..', 'frontend', 'index.html'),
    ANIMES_JSON: path.join(__dirname, '..', 'data', 'animes.json'),

    // Assets
    ICON: path.join(__dirname, '..', 'assets', 'chibi.png'),
};

module.exports = PATHS;
