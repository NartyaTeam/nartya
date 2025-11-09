const { load } = require("cheerio");
const fs = require("fs");
const path = require("path");
const CONFIG = require("../utils/config");

class Scraper {
  static async getHtml(url, loadCheerio = true, retries = 5) {
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (attempt > 1) {
          // Attendre un peu avant de réessayer (délai progressif + aléatoire pour paraître humain)
          const baseDelay = attempt * 600; // 600ms, 1200ms, 1800ms, 2400ms, 3000ms
          const randomDelay = Math.floor(Math.random() * 300); // +0-300ms aléatoire
          const delay = baseDelay + randomDelay;
          console.log(`⏳ Attente de ${delay}ms avant nouvelle tentative...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        console.log(
          `🌐 Requête vers: ${url}${
            attempt > 1 ? ` (tentative ${attempt}/${retries})` : ""
          }`
        );

        // Utiliser le fetch natif de Node.js - simple et efficace
        const response = await fetch(url);

        console.log(`📊 Status: ${response.status}`);

        // Si 403, on réessaie (Cloudflare warming up)
        if (response.status === 403 && attempt < retries) {
          console.warn(
            `⚠️ 403 Forbidden - Cloudflare warming up, nouvelle tentative...`
          );
          lastError = new Error(`HTTP 403: Forbidden`);
          continue; // Passer à la tentative suivante
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        console.log(`✅ Réponse reçue (${html.length} caractères)`);

        // Vérifier si c'est un VRAI challenge Cloudflare actif (pas juste les scripts)
        const isRealChallenge =
          html.includes("Just a moment") && html.length < 10000;

        if (isRealChallenge) {
          console.error("❌ Challenge Cloudflare actif détecté");
          console.log(`📄 Aperçu:`, html.substring(0, 500));
          throw new Error(
            "Challenge Cloudflare actif. Le site bloque temporairement les requêtes."
          );
        }

        // Succès ! On sort de la boucle
        if (attempt > 1) {
          console.log(`✅ Succès après ${attempt} tentative(s)`);
        }
        return loadCheerio ? load(html) : html;
      } catch (error) {
        lastError = error;

        // Si c'est la dernière tentative, on lance l'erreur
        if (attempt === retries) {
          console.error(
            `❌ Échec après ${retries} tentatives pour ${url}:`,
            error.message
          );
          throw error;
        }

        // Sinon on log et on continue
        console.warn(
          `⚠️ Tentative ${attempt}/${retries} échouée:`,
          error.message
        );
      }
    }

    // Si on arrive ici, toutes les tentatives ont échoué
    throw lastError;
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
        const slug = url.split("/")[4];
        animes.push({ title, url, slug });
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
    console.log(
      `🔍 getSeasons: Récupération de ${CONFIG.SCRAPER.BASE_URL}/catalogue/${animeId}/`
    );

    const $ = await this.getHtml(
      `${CONFIG.SCRAPER.BASE_URL}/catalogue/${animeId}/`
    );

    const allScripts = $("script");
    console.log(
      `📜 Nombre total de balises <script> trouvées: ${allScripts.length}`
    );

    const scripts = $("script")
      .map((i, el) => $(el).html())
      .get()
      .filter((code) => code.includes('panneauAnime("'));

    console.log(`📜 Scripts contenant 'panneauAnime("': ${scripts.length}`);

    if (scripts.length === 0) {
      console.warn(
        `⚠️ Aucun script contenant 'panneauAnime("' trouvé pour ${animeId}`
      );
      // Afficher un échantillon du HTML pour debug
      const bodyText = $("body").text().substring(0, 500);
      console.log(`📄 Échantillon du contenu de la page:`, bodyText);
    }

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

    console.log(`🎯 Nombre de matches trouvés: ${matches.length}`);

    // 4️⃣ Transformer en tableau d'objets
    const seasons = matches.map(([_, name, id]) => ({
      name,
      id: id.split("/")[0],
    }));

    console.log(`✅ Saisons extraites:`, seasons);
    return seasons;
  }

  static async getEpisodes(animeId, seasonId) {
    const result = {};

    for (const lang of ["vf", "vostfr", "va"]) {
      const url = `${CONFIG.SCRAPER.BASE_URL}/catalogue/${animeId}/${seasonId}/${lang}/episodes.js`;

      try {
        console.log(
          `🔍 Tentative de récupération des épisodes en ${lang.toUpperCase()}...`
        );

        // Utiliser fetch directement pour gérer les 404
        const response = await fetch(url);

        // Si 404, cette langue n'existe pas pour cet anime
        if (response.status === 404) {
          console.log(`⚠️ Pas d'épisodes en ${lang.toUpperCase()} (404)`);
          result[lang] = {}; // Langue non disponible
          continue;
        }

        // Si autre erreur, on la signale mais on continue
        if (!response.ok) {
          console.warn(
            `⚠️ Erreur ${response.status} pour ${lang.toUpperCase()}`
          );
          result[lang] = {};
          continue;
        }

        const html = await response.text();
        console.log(
          `✅ Épisodes ${lang.toUpperCase()} récupérés (${
            html.length
          } caractères)`
        );

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
        console.log(
          `✅ ${
            Object.keys(sources).length
          } source(s) trouvée(s) en ${lang.toUpperCase()}`
        );
      } catch (error) {
        console.error(
          `❌ Erreur lors de la récupération des épisodes en ${lang.toUpperCase()}:`,
          error.message
        );
        result[lang] = {}; // En cas d'erreur, on met un objet vide
      }
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
