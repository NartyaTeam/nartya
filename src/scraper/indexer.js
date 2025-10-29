const fs = require('fs');
const path = require('path');
const Scraper = require('./index.js');
const animesIndexed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'animes.json'), 'utf8'));

async function indexer(animes) {
    try {
        const newAnimes = [];

        for (const anime of animes) {
            const animeExist = isExist(anime.id);
            // if (animeExist) continue;

            // Obtention de données supplémentaires concernant l'anime
            const animeData = await Scraper.getAnime(anime.id);
            newAnimes.push(animeData);

            console.log(`Anime ${anime.title} indexed`, animeData);
            console.log(`===========================================\n${newAnimes.length} / ${animes.length} animes indexed\n===========================================\n`);

            await delay(2000);
        }

        fs.writeFileSync(path.join(__dirname, '..', 'data', 'animes.json'), JSON.stringify(newAnimes, null, 2));
        return newAnimes;
    } catch (error) {
        console.error('Error indexing animes:', error);
    }
}

function isExist(animeId) {
    return animesIndexed.find(a => a.id === animeId);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

indexer(animesIndexed);