import Scraper from './scraper/index.js';

async function testVideoExtraction() {
    console.log('🎬 Test d\'extraction de vidéo depuis SendVid...\n');

    const embedUrl = 'https://video.sibnet.ru/shell.php?videoid=4942143';

    try {
        console.log(`📡 Tentative d'extraction depuis: ${embedUrl}`);
        const videoUrl = await Scraper.extractVideoUrl(embedUrl);

        if (videoUrl) {
            console.log('✅ Succès ! URL de la vidéo extraite:');
            console.log(`🔗 ${videoUrl}\n`);

            // Test de validité de l'URL
            try {
                const response = await fetch(videoUrl, { method: 'HEAD' });
                if (response.ok) {
                    console.log('✅ L\'URL de la vidéo est accessible');
                    console.log(`📊 Taille du fichier: ${response.headers.get('content-length')} bytes`);
                    console.log(`🎥 Type de contenu: ${response.headers.get('content-type')}`);
                } else {
                    console.log('⚠️ L\'URL de la vidéo n\'est pas accessible');
                }
            } catch (fetchError) {
                console.log('⚠️ Impossible de vérifier l\'URL:', fetchError.message);
            }
        } else {
            console.log('❌ Aucune URL de vidéo trouvée');
        }
    } catch (error) {
        console.error('❌ Erreur lors du test:', error);
    }
}

// Test avec plusieurs URLs d'embeds
async function testMultipleEmbeds() {
    console.log('\n🎬 Test avec plusieurs embeds...\n');

    const embedUrls = [
        'https://sendvid.com/embed/d6ypq2pa',
        // Ajoutez d'autres URLs d'embeds ici pour tester
    ];

    try {
        const results = await Scraper.extractMultipleVideoUrls(embedUrls);

        console.log('📊 Résultats:');
        for (const [embedUrl, videoUrl] of Object.entries(results)) {
            console.log(`\n🔗 Embed: ${embedUrl}`);
            console.log(`🎥 Vidéo: ${videoUrl || 'Non trouvée'}`);
        }
    } catch (error) {
        console.error('❌ Erreur lors du test multiple:', error);
    }
}

// Exécuter les tests
if (import.meta.url === `file://${process.argv[1]}`) {
    testVideoExtraction()
        .then(() => testMultipleEmbeds())
        .then(() => {
            console.log('\n✨ Tests terminés !');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Erreur fatale:', error);
            process.exit(1);
        });
}

export { testVideoExtraction, testMultipleEmbeds };
