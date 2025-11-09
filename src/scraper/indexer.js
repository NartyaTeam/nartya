const fs = require("fs");
const Scraper = require("./index.js");
const CONFIG = require("../utils/config");

/**
 * Indexe les nouveaux animes depuis Anime-Sama
 * @param {Array} animes - Liste des animes à indexer
 * @param {Function} progressCallback - Callback pour suivre la progression (optionnel)
 * @returns {Promise<Object>} - Résultat de l'indexation
 */
async function indexer(animes, progressCallback = null) {
  try {
    // Charger les animes existants
    let animesIndexed = [];
    if (fs.existsSync(CONFIG.SCRAPER.ANIMES_JSON)) {
      animesIndexed = JSON.parse(
        fs.readFileSync(CONFIG.SCRAPER.ANIMES_JSON, "utf8")
      );
    }

    const newAnimes = [];
    const updatedAnimes = [];
    let skipped = 0;

    for (let i = 0; i < animes.length; i++) {
      const anime = animes[i];
      
      // Vérifier si l'anime existe déjà
      const existingAnime = animesIndexed.find((a) => a.slug === anime.slug);
      
      if (existingAnime) {
        skipped++;
        console.log(`⏭️ Anime déjà indexé: ${anime.title}`);
        
        // Envoyer la progression
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: animes.length,
            anime: anime.title,
            status: 'skipped',
            newCount: newAnimes.length,
            updatedCount: updatedAnimes.length,
            skippedCount: skipped
          });
        }
        continue;
      }

      try {
        // Obtention de données supplémentaires concernant l'anime
        console.log(`🔍 Indexation: ${anime.title}...`);
        const animeData = await Scraper.getAnime(anime.slug);
        newAnimes.push(animeData);

        console.log(`✅ Anime ${anime.title} indexé`);
        console.log(
          `===========================================\n${newAnimes.length} nouveaux / ${animes.length} total\n===========================================\n`
        );

        // Envoyer la progression
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: animes.length,
            anime: anime.title,
            status: 'indexed',
            newCount: newAnimes.length,
            updatedCount: updatedAnimes.length,
            skippedCount: skipped
          });
        }

        // Délai entre chaque anime pour éviter le rate limiting
        await delay(2000);
      } catch (error) {
        console.error(`❌ Erreur lors de l'indexation de ${anime.title}:`, error.message);
        
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: animes.length,
            anime: anime.title,
            status: 'error',
            error: error.message,
            newCount: newAnimes.length,
            updatedCount: updatedAnimes.length,
            skippedCount: skipped
          });
        }
      }
    }

    // Fusionner les nouveaux animes avec les existants
    const allAnimes = [...animesIndexed, ...newAnimes];

    // Sauvegarder
    fs.writeFileSync(
      CONFIG.SCRAPER.ANIMES_JSON,
      JSON.stringify(allAnimes, null, 2)
    );

    const result = {
      success: true,
      total: animes.length,
      new: newAnimes.length,
      updated: updatedAnimes.length,
      skipped: skipped,
      totalInDatabase: allAnimes.length
    };

    console.log(`\n✅ Indexation terminée:`, result);
    return result;
  } catch (error) {
    console.error("❌ Erreur lors de l'indexation:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = indexer;
