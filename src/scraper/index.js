const { load } = require("cheerio");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const CONFIG = require("../utils/config");

class Scraper {
  static async getHtml(url, loadCheerio = true) {
    const response = await fetch(url, {
      // Headers importants pour éviter les erreurs cloudflare
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });
    const text = await response.text();
    return loadCheerio ? load(text) : text;
  }

  static async getAnilistInfo(search) {
    const response = await fetch(`${CONFIG.ANILIST.GRAPHQL_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        id
        title { romaji english native }
        coverImage { large medium }
        format
        isAdult
      }
    }
  `,
        variables: { search },
      }),
    });
    const json = await response.json();
    return json.data.Media;
  }

  static async getAnimes() {
    const animes = [];
    let page = 1;
    let hasNextPage = true;

    do {
      const $ = await this.getHtml(
        `${CONFIG.SCRAPER.BASE_URL}/catalogue/?type[0]=Anime&page=${page}`
      );
      const catalog = $("#list_catalog").find("a");
      catalog.each((i, el) => {
        const title = $("h1", el).text();
        const url = $(el).attr("href");
        const id = url.split("/")[4];
        animes.push({ title, url, id });
      });
      hasNextPage = catalog.length > 0;
      page++;
      console.log(
        "page",
        page,
        "catalog.length",
        catalog.length,
        "hasNextPage",
        hasNextPage
      );
    } while (hasNextPage);

    return animes;
  }

  static async getAnime(animeId) {
    const $ = await this.getHtml(
      `${CONFIG.SCRAPER.BASE_URL}/catalogue/${animeId}/`
    );

    const title = $("#titreOeuvre").text();
    const synopsisHeader = $("h2").filter(
      (i, el) => $(el).text().trim().toLowerCase() === "synopsis"
    );
    const synopsis = synopsisHeader.next("p").text();

    const anilistSearch = await this.getAnilistInfo(title.replaceAll('"', ""));

    return {
      slug: animeId,
      synopsis,
      ...anilistSearch,
    };
  }

  static async searchAnime(query) {
    const response = await fetch(
      `${CONFIG.SCRAPER.BASE_URL}/template-php/defaut/fetch.php`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        },
        body: `query=${encodeURIComponent(query)}`,
      }
    );

    const htmlData = await response.text();
    const $ = load(htmlData);

    const results = [];
    $("a").each((i, el) => {
      const title = $("h3", el).text();
      const url = $(el).attr("href");
      const id = url.split("/")[4];
      results.push({
        title,
        url,
        id,
      });
    });

    return results;
  }

  static async getSeasons(animeId) {
    const $ = await this.getHtml(
      `${CONFIG.SCRAPER.BASE_URL}/catalogue/${animeId}/`
    );
    const scripts = $("script")
      .map((i, el) => $(el).html())
      .get()
      .filter((code) => code.includes('panneauAnime("'));

    // 1️⃣ Fusionner tous les scripts
    const code = scripts.join("\n");

    // 2️⃣ Supprimer proprement les blocs commentés sans bouffer le reste
    let cleaned = code;

    // Tant qu'on trouve un /*...*/, on l'efface avec le contenu jusqu'au prochain */
    while (cleaned.includes("/*")) {
      cleaned = cleaned.replace(/\/\*[^]*?\*\//, "");
    }

    // 3️⃣ Extraire les appels valides
    const matches = [
      ...cleaned.matchAll(/panneauAnime\("([^"]+)",\s*"([^"]+)"\)/g),
    ];

    // 4️⃣ Transformer en tableau d'objets
    const seasons = matches.map(([_, name, id]) => ({
      name,
      id: id.split("/")[0],
    }));

    return seasons;
  }

  static async getEpisodes(animeId, seasonId) {
    const result = {};
    for (const lang of ["vf", "vostfr", "va"]) {
      const url = `${CONFIG.SCRAPER.BASE_URL}/catalogue/${animeId}/${seasonId}/${lang}/episodes.js`;
      const html = await this.getHtml(url, false);

      const regex = /var\s+(eps\d+)\s*=\s*\[([\s\S]*?)\];/g;
      const matches = [...html.matchAll(regex)];

      const sources = {};
      for (const match of matches) {
        const [, name, content] = match;

        // Nettoyer et transformer le contenu en vrai tableau
        const urls = content
          .split(",") // sépare par virgules
          .map((u) => u.replace(/['"\s]/g, "")) // enlève guillemets et espaces
          .filter(Boolean); // enlève les vides

        sources[name] = urls;
      }

      result[lang] = sources;
    }

    return result;
  }

  /**
   * Recherche locale dans les animes indexés
   * @param {string} query - Terme de recherche
   * @param {Array} animes - Liste des animes indexés
   * @returns {Array} - Résultats de la recherche
   */
  static searchLocalAnimes(query, animes) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const searchTerm = query.toLowerCase().trim();

    return animes
      .filter((anime) => {
        // Recherche dans le titre principal
        const title =
          anime.title?.title?.romaji ||
          anime.title?.title?.english ||
          anime.title?.title?.native ||
          anime.title ||
          "";

        // Recherche dans les différents champs
        const searchFields = [
          title,
          anime.title?.title?.english || "",
          anime.title?.title?.native || "",
          anime.synopsis || "",
        ].map((field) => field.toLowerCase());

        // Recherche exacte ou partielle
        return searchFields.some(
          (field) =>
            field.includes(searchTerm) ||
            searchTerm.split(" ").every((word) => field.includes(word))
        );
      })
      .slice(0, 20); // Limiter à 20 résultats pour les performances
  }

  /**
   * Charge les animes depuis le fichier JSON
   * @returns {Array} - Liste des animes
   */
  static loadAnimes() {
    try {
      const animesData = fs.readFileSync(
        path.join(__dirname, "..", "data", "animes.json"),
        "utf8"
      );
      return JSON.parse(animesData);
    } catch (error) {
      console.error("Erreur lors du chargement des animes:", error);
      return [];
    }
  }
}

module.exports = Scraper;
