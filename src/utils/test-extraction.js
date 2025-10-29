// Script de test pour l'extraction de vidéo
// Usage: node test-extraction.js

import { app, BrowserWindow } from 'electron';

async function testVideoExtraction() {
    console.log('🎬 Test d\'extraction de vidéo depuis SendVid...\n');

    const embedUrl = 'https://video.sibnet.ru/shell.php?videoid=4942143';

    try {
        console.log(`📡 Tentative d'extraction depuis: ${embedUrl}`);

        const win = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: false
            }
        });

        await win.loadURL(embedUrl);

        // Attendre que la page se charge complètement
        console.log('⏳ Attente du chargement de la page...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        const videoUrl = await win.webContents.executeJavaScript(`
            (function() {
                console.log('🔍 Recherche de la vidéo...');
                
                // Chercher la balise video principale
                const video = document.querySelector('video');
                if (video && video.src) {
                    console.log('✅ Vidéo trouvée dans la balise video principale');
                    return video.src;
                }
                
                // Chercher dans les sources de la balise video
                const source = document.querySelector('video source');
                if (source && source.src) {
                    console.log('✅ Vidéo trouvée dans les sources');
                    return source.src;
                }
                
                // Chercher dans les iframes imbriquées
                const iframes = document.querySelectorAll('iframe');
                console.log('🔍 Recherche dans', iframes.length, 'iframes...');
                for (let iframe of iframes) {
                    try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                        const iframeVideo = iframeDoc.querySelector('video');
                        if (iframeVideo && iframeVideo.src) {
                            console.log('✅ Vidéo trouvée dans une iframe');
                            return iframeVideo.src;
                        }
                    } catch (e) {
                        console.log('⚠️ Erreur cross-origin dans iframe:', e.message);
                    }
                }
                
                // Chercher des URLs de vidéo dans le code source
                const scripts = document.querySelectorAll('script');
                console.log('🔍 Recherche dans', scripts.length, 'scripts...');
                for (let script of scripts) {
                    const content = script.textContent || script.innerHTML;
                    const videoUrlMatch = content.match(/(?:src|url|file)["\s]*[:=]["\s]*["']([^"']*\\.(?:mp4|webm|ogg|avi|mov))["']/i);
                    if (videoUrlMatch) {
                        console.log('✅ URL de vidéo trouvée dans un script');
                        return videoUrlMatch[1];
                    }
                }
                
                // Afficher le contenu de la page pour debug
                console.log('📄 Contenu de la page:', document.body.innerHTML.substring(0, 500));
                
                return null;
            })();
        `);

        win.close();

        if (videoUrl) {
            console.log('\n✅ Succès ! URL de la vidéo extraite:');
            console.log(`🔗 ${videoUrl}\n`);

            // Test de validité de l'URL
            try {
                const response = await fetch(videoUrl, { method: 'HEAD' });
                if (response.ok) {
                    console.log('✅ L\'URL de la vidéo est accessible');
                    console.log(`📊 Taille du fichier: ${response.headers.get('content-length')} bytes`);
                    console.log(`🎥 Type de contenu: ${response.headers.get('content-type')}`);
                } else {
                    console.log('⚠️ L\'URL de la vidéo n\'est pas accessible (status:', response.status, ')');
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

// Initialiser Electron et lancer le test
app.whenReady().then(async () => {
    await testVideoExtraction();
    app.quit();
});

app.on('window-all-closed', () => {
    app.quit();
});
