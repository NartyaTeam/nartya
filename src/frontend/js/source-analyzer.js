/**
 * Analyseur et gestionnaire intelligent des sources vidéo
 * Détecte les providers (Sibnet, Vidmoly, SendVid...) et optimise la sélection
 */

export class SourceAnalyzer {
    constructor() {
        this.providerPatterns = {
            'sibnet': /sibnet\.ru/i,
            'vidmoly': /vidmoly\.(to|net)/i,
            'sendvid': /sendvid\.com/i,
            'vudeo': /vudeo\.net/i,
            'gounlimited': /gounlimited\.to/i
        };

        // Providers lents à éviter si alternatives disponibles
        this.slowProviders = ['sibnet'];

        // Providers rapides préférés
        this.fastProviders = ['vidmoly', 'sendvid', 'vudeo'];
    }

    /**
     * Détecte le provider d'une URL embed
     */
    detectProvider(url) {
        if (!url) return 'unknown';

        for (const [provider, pattern] of Object.entries(this.providerPatterns)) {
            if (pattern.test(url)) {
                return provider;
            }
        }

        return 'unknown';
    }

    /**
     * Analyse tous les épisodes d'une source pour déterminer le provider dominant
     */
    analyzeSource(episodes) {
        if (!episodes || episodes.length === 0) {
            return {
                mainProvider: 'unknown',
                distribution: {},
                isMixed: false,
                isSlow: false,
                episodes: []
            };
        }

        const providerCount = {};
        const episodeProviders = [];

        // Compter les providers
        episodes.forEach((url, index) => {
            const provider = this.detectProvider(url);
            providerCount[provider] = (providerCount[provider] || 0) + 1;
            episodeProviders.push({
                index,
                url,
                provider
            });
        });

        // Trouver le provider dominant
        let mainProvider = 'unknown';
        let maxCount = 0;

        for (const [provider, count] of Object.entries(providerCount)) {
            if (count > maxCount) {
                maxCount = count;
                mainProvider = provider;
            }
        }

        // Si égalité, utiliser le provider du premier épisode
        if (Object.values(providerCount).filter(c => c === maxCount).length > 1) {
            mainProvider = episodeProviders[0].provider;
        }

        const isMixed = Object.keys(providerCount).length > 1;
        const isSlow = this.slowProviders.includes(mainProvider);

        return {
            mainProvider,
            distribution: providerCount,
            isMixed,
            isSlow,
            episodes: episodeProviders,
            totalEpisodes: episodes.length
        };
    }

    /**
     * Analyse toutes les sources disponibles pour une langue
     */
    analyzeAllSources(episodesData, language) {
        if (!episodesData || !episodesData[language]) {
            return {};
        }

        const analysis = {};
        const sources = episodesData[language];

        for (const [sourceName, episodes] of Object.entries(sources)) {
            analysis[sourceName] = this.analyzeSource(episodes);
        }

        return analysis;
    }

    /**
     * Trouve la meilleure source alternative pour un épisode donné
     * Évite Sibnet si possible
     */
    findBestAlternativeForEpisode(episodeIndex, allSourcesAnalysis, currentSource) {
        const alternatives = [];

        // Parcourir toutes les sources
        for (const [sourceName, analysis] of Object.entries(allSourcesAnalysis)) {
            if (sourceName === currentSource) continue; // Skip source actuelle

            if (episodeIndex < analysis.episodes.length) {
                const episodeInfo = analysis.episodes[episodeIndex];
                alternatives.push({
                    sourceName,
                    provider: episodeInfo.provider,
                    url: episodeInfo.url,
                    isFast: this.fastProviders.includes(episodeInfo.provider),
                    isSlow: this.slowProviders.includes(episodeInfo.provider)
                });
            }
        }

        if (alternatives.length === 0) return null;

        // Priorité 1 : Providers rapides
        const fastAlternative = alternatives.find(alt => alt.isFast);
        if (fastAlternative) return fastAlternative;

        // Priorité 2 : N'importe quel provider non-lent
        const nonSlowAlternative = alternatives.find(alt => !alt.isSlow);
        if (nonSlowAlternative) return nonSlowAlternative;

        // Priorité 3 : Même les lents si pas d'autre choix
        return alternatives[0];
    }

    /**
     * Recommande la meilleure source globale
     * Évite les sources Sibnet si alternatives disponibles
     */
    recommendBestSource(allSourcesAnalysis) {
        const sources = Object.entries(allSourcesAnalysis);

        if (sources.length === 0) return null;

        // Priorité 1 : Sources rapides et non-mixtes
        const fastPure = sources.find(([_, analysis]) =>
            this.fastProviders.includes(analysis.mainProvider) && !analysis.isMixed
        );
        if (fastPure) return fastPure[0];

        // Priorité 2 : Sources rapides même mixtes
        const fastMixed = sources.find(([_, analysis]) =>
            this.fastProviders.includes(analysis.mainProvider)
        );
        if (fastMixed) return fastMixed[0];

        // Priorité 3 : N'importe quelle source non-Sibnet
        const nonSibnet = sources.find(([_, analysis]) =>
            !this.slowProviders.includes(analysis.mainProvider)
        );
        if (nonSibnet) return nonSibnet[0];

        // Priorité 4 : Sibnet si pas d'autre choix
        return sources[0][0];
    }

    /**
     * Génère un rapport lisible de l'analyse
     */
    generateReport(allSourcesAnalysis) {
        const report = {
            totalSources: Object.keys(allSourcesAnalysis).length,
            sources: []
        };

        for (const [sourceName, analysis] of Object.entries(allSourcesAnalysis)) {
            report.sources.push({
                name: sourceName,
                mainProvider: analysis.mainProvider,
                totalEpisodes: analysis.totalEpisodes,
                isMixed: analysis.isMixed,
                isSlow: analysis.isSlow,
                distribution: analysis.distribution
            });
        }

        return report;
    }

    /**
     * Affiche un rapport dans la console
     */
    logReport(allSourcesAnalysis, language) {
        console.group(`📊 Analyse des sources (${language.toUpperCase()})`);

        for (const [sourceName, analysis] of Object.entries(allSourcesAnalysis)) {
            const icon = analysis.isSlow ? '🐌' : '⚡';
            const mixedTag = analysis.isMixed ? ' [MIXTE]' : '';

            console.log(`${icon} ${sourceName}${mixedTag}:`, {
                'Provider principal': analysis.mainProvider,
                'Épisodes': analysis.totalEpisodes,
                'Distribution': analysis.distribution
            });
        }

        const recommended = this.recommendBestSource(allSourcesAnalysis);
        if (recommended) {
            console.log(`\n✅ Source recommandée: ${recommended}`);
        }

        console.groupEnd();
    }

    /**
     * Détecte si une extraction a échoué (erreur réseau, timeout, HTML invalide)
     */
    isExtractionError(error) {
        if (!error) return false;

        const errorStr = error.toString().toLowerCase();
        
        // Patterns d'erreurs connues
        const errorPatterns = [
            'timeout',
            'network error',
            'failed to fetch',
            'net::err',
            'aucune url vidéo',
            'impossible d\'extraire',
            '404',
            '403',
            '500',
            'not found',
            'forbidden',
            'unavailable'
        ];

        return errorPatterns.some(pattern => errorStr.includes(pattern));
    }

    /**
     * Détecte si le HTML retourné est invalide (page d'erreur, maintenance, etc.)
     */
    isInvalidHtml(html) {
        if (!html || typeof html !== 'string') return true;

        const invalidPatterns = [
            '404 not found',
            '403 forbidden',
            'page not found',
            'video not found',
            'file not found',
            'maintenance',
            'temporarily unavailable',
            'error occurred'
        ];

        const htmlLower = html.toLowerCase();
        return invalidPatterns.some(pattern => htmlLower.includes(pattern));
    }
}

