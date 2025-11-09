const fs = require("fs");
const Scraper = require("./index.js");
const CONFIG = require("../utils/config");
const animesIndexed = JSON.parse(
  fs.readFileSync(CONFIG.SCRAPER.ANIMES_JSON, "utf8")
);

async function indexer(animes) {
  try {
    const newAnimes = [];

    for (const anime of animes) {
      const animeExist = isExist(anime.id);
      if (animeExist) continue;

      // Obtention de données supplémentaires concernant l'anime
      const animeData = await Scraper.getAnime(anime.slug);
      newAnimes.push(animeData);

      console.log(`Anime ${anime.title} indexed`, animeData);
      console.log(
        `===========================================\n${newAnimes.length} / ${animes.length} animes indexed\n===========================================\n`
      );

      await delay(2000);
    }

    fs.writeFileSync(
      CONFIG.SCRAPER.ANIMES_JSON,
      JSON.stringify(newAnimes, null, 2)
    );
    return newAnimes;
  } catch (error) {
    console.error("Error indexing animes:", error);
  }
}

function isExist(animeId) {
  return animesIndexed.find((a) => a.id === animeId);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = indexer;
