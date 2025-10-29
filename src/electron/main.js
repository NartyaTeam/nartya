
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const Scraper = require(path.join(__dirname, '..', 'scraper', 'index.js'));

// Garder une référence globale de l'objet window
let mainWindow;

function createWindow() {
    // Créer la fenêtre du navigateur
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 1200,
        minHeight: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, '..', 'assets', 'chibi.png'), // Icône optionnelle
        title: 'Anime Viewer',
    });

    mainWindow.webContents.openDevTools();

    // Charger le fichier HTML
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'index.html'));

    // Ouvrir les DevTools en mode développement
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    // Émettre quand la fenêtre est fermée
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC handler propre et priorisé pour extraire une URL vidéo (mp4 / m3u8 / ts)
ipcMain.handle('extract-video-url', async (event, embedUrl) => {
    console.log('🎬 extract-video-url:', embedUrl);

    // Correction simple si nécessaire
    const correctedUrl = embedUrl.replace('vidmoly.to', 'vidmoly.net');

    // On crée une session "temporaire" unique pour chaque extraction (évite fuites)
    const partition = `videoplayer-temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ses = session.fromPartition(partition);

    // Headers minimum (tu peux garder/refactorer selon besoin)
    ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
        if (details.url.includes('vidmoly')) {
            details.requestHeaders['Referer'] = 'https://anime-sama.fr/';
            details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        }
        callback({ requestHeaders: details.requestHeaders });
    });

    // BrowserWindow cachée pour charger l'embed
    const win = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, session: ses }
    });

    // utilitaire pour repérer les candidates réseau
    const isVideoCandidate = (url = '') => {
        try {
            const u = url.split('?')[0].toLowerCase();
            if (!u) return false;
            return u.endsWith('.mp4') || u.endsWith('.m3u8') || u.endsWith('.ts') ||
                u.includes('/video/') || u.includes('/videos/') || u.includes('/media/');
        } catch { return false; }
    };

    // -------------------
    // 1) Interception réseau : priorité la plus élevée (rapide)
    // -------------------
    const interceptNetwork = (timeoutMs = 8000) => new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeoutMs);

        const filter = { urls: ['*://*/*'] };

        // beforeRequest : prend la moindre chance d'attraper .m3u8/.mp4 avant que le player manipule
        const beforeHandler = (details, callback) => {
            try {
                if (done) { callback({}); return; }
                if (isVideoCandidate(details.url)) {
                    done = true; clearTimeout(timer);
                    resolve(details.url);
                }
            } catch (e) { /* ignore */ }
            callback({}); // laisser passer
        };

        // completed : confirme parfois les ressources
        const completedHandler = (details) => {
            try {
                if (done) return;
                if (isVideoCandidate(details.url)) {
                    done = true; clearTimeout(timer);
                    resolve(details.url);
                }
            } catch (e) { }
        };

        ses.webRequest.onBeforeRequest(filter, beforeHandler);
        ses.webRequest.onCompleted(filter, completedHandler);

        // quand on a fini (timeout ou result), on ne peut pas "détacher" facilement les callbacks
        // sur certaines versions d'Electron. Pour éviter fuite d'état, on laisse la partition être unique par appel.
        // Toutefois on nettoie la fenêtre plus tard et relyons sur partition unique.
    });

    // -------------------
    // 2) Vérification DOM simple (non-blob)
    // -------------------
    const checkDomForDirectUrl = async () => {
        try {
            return await win.webContents.executeJavaScript(`
          (function() {
            const videos = Array.from(document.querySelectorAll('video, source'));
            for (const el of videos) {
              const src = el.src || el.currentSrc || (el.getAttribute && el.getAttribute('src'));
              if (src && !src.startsWith('blob:')) return src;
            }
            // cherche dans les scripts une URL explicite .m3u8/.mp4
            const scriptsText = Array.from(document.scripts).map(s => s.textContent).join('\\n');
            const match = scriptsText.match(/https?:\\/\\/[^\\s'"]+\\.(mp4|m3u8)(\\?[^'"]*)?/i);
            return match ? match[0] : null;
          })();
        `, true);
        } catch (e) { return null; }
    };

    // -------------------
    // 3) Hook createObjectURL / fetch / XHR (fallback plus long)
    // -------------------
    const injectHooks = async (timeoutMs = 8000) => {
        try {
            const res = await win.webContents.executeJavaScript(`
          (function() {
            return new Promise((resolve) => {
              // Hook URL.createObjectURL pour détecter création de blob (retourne type)
              const origCreate = URL.createObjectURL;
              URL.createObjectURL = function(obj) {
                try { resolve({ type: 'createObjectURL', objType: obj && obj.constructor && obj.constructor.name }); } catch {}
                return origCreate.apply(URL, arguments);
              };
  
              // Hook fetch pour détecter requêtes vers .m3u8/.mp4
              const origFetch = window.fetch;
              window.fetch = function(resource) {
                try {
                  const url = (typeof resource === 'string') ? resource : (resource && resource.url);
                  if (url && /\\.(m3u8|mp4|ts)(\\?|$)/i.test(url)) {
                    resolve({ type: 'fetch', url: url.toString() });
                  }
                } catch(e){}
                return origFetch.apply(this, arguments);
              };
  
              // Hook XHR
              const origOpen = XMLHttpRequest.prototype.open;
              XMLHttpRequest.prototype.open = function(method, url) {
                try {
                  if (url && /\\.(m3u8|mp4|ts)(\\?|$)/i.test(url)) {
                    resolve({ type: 'xhr', url: url.toString() });
                  }
                } catch(e){}
                return origOpen.apply(this, arguments);
              };
  
              // Observe le DOM au cas où une source non-blob apparaisse plus tard
              const obs = new MutationObserver(() => {
                const v = document.querySelector('video, source');
                if (v) {
                  const src = v.src || v.currentSrc || (v.getAttribute && v.getAttribute('src'));
                  if (src && !src.startsWith('blob:')) {
                    obs.disconnect();
                    resolve({ type: 'dom', url: src });
                  }
                }
              });
              obs.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  
              // Timeout fallback
              setTimeout(() => resolve(null), ${timeoutMs});
            });
          })();
        `, true);
            return res;
        } catch (e) {
            return null;
        }
    };

    try {
        // Lance la capture réseau en parallèle (rapide)
        const networkPromise = interceptNetwork(8000);

        // Charge la page
        await win.loadURL(correctedUrl);

        // Attend un court instant pour que la page commence à faire des requêtes
        await new Promise(r => setTimeout(r, 1200));

        // 1) Si réseau a trouvé qqch rapidement, on le récupère immédiatement
        let netResult = await Promise.race([networkPromise, Promise.resolve(null)]);
        if (netResult) {
            console.log('🔍 trouvé via réseau:', netResult);
            try { win.close(); } catch (e) { }
            return { success: true, videoUrl: netResult };
        }

        // 2) Vérifie le DOM pour des sources directes (non-blob)
        const domUrl = await checkDomForDirectUrl();
        if (domUrl) {
            console.log('🔍 trouvé via DOM direct:', domUrl);
            try { win.close(); } catch (e) { }
            return { success: true, videoUrl: domUrl };
        }

        // 3) On attend encore un peu que le réseau finisse (on laisse plus de temps)
        //    on attend la promesse d'interception réseau (max total 8s déjà lancée)
        netResult = await networkPromise;
        if (netResult) {
            console.log('🔍 trouvé via réseau (après attente):', netResult);
            try { win.close(); } catch (e) { }
            return { success: true, videoUrl: netResult };
        }

        // 4) Fallback inject hooks (plus long / heuristique)
        const hookResult = await injectHooks(8000);
        if (hookResult && hookResult.url) {
            console.log('🔍 trouvé via hooks:', hookResult);
            try { win.close(); } catch (e) { }
            return { success: true, videoUrl: hookResult.url };
        }

        // 5) Dernier essai : lire la video element et renvoyer blob: si c'est tout ce qu'il y a
        const domFinal = await win.webContents.executeJavaScript(`
        (function() {
          const v = document.querySelector('video');
          if (!v) return null;
          return { src: v.src || null, currentSrc: v.currentSrc || null };
        })();
      `, true);

        try { win.close(); } catch (e) { }

        if (domFinal) {
            const candidate = domFinal.src || domFinal.currentSrc;
            if (candidate) {
                console.log('ℹ️ seul disponible (probablement blob):', candidate);
                return { success: true, videoUrl: candidate, note: 'Possiblement blob: URL — non téléchargeable directement' };
            }
        }

        return { success: false, error: 'Aucune URL vidéo directe trouvée (le player pourrait servir la vidéo via blob/MediaSource).' };

    } catch (err) {
        try { win.close(); } catch (e) { }
        return { success: false, error: err && err.message ? err.message : String(err) };
    }
});



ipcMain.handle('extract-multiple-video-urls', async (event, embedUrls) => {
    const results = {};

    for (const embedUrl of embedUrls) {
        try {
            const result = await ipcMain.invoke('extract-video-url', embedUrl);
            results[embedUrl] = result.success ? result.videoUrl : null;

            // Délai entre les extractions
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            results[embedUrl] = null;
        }
    }

    return results;
});

// Gestionnaire pour la recherche locale d'animes
ipcMain.handle('search-local-animes', async (event, query) => {
    try {
        const animes = require(path.join(__dirname, '..', 'data', 'animes.json'));
        const results = animes.filter(anime => {
            const name = anime.title?.romaji || anime.title?.english || anime.title?.native;
            return typeof name === "string" && name.toLowerCase().includes(query.toLowerCase());
        });
        return { success: true, results }; // ✅ renvoie un objet
    } catch (error) {
        console.error('Erreur lors de la recherche locale:', error);
        return { success: false, error: error.message };
    }
});

// Gestionnaire pour récupérer les saisons d'un anime
ipcMain.handle('get-anime-seasons', async (event, animeId) => {
    try {
        console.log(`Récupération des saisons pour l'anime: ${animeId}`);
        const seasons = await Scraper.getSeasons(animeId);
        return { success: true, seasons };
    } catch (error) {
        console.error('Erreur lors de la récupération des saisons:', error);
        return { success: false, error: error.message };
    }
});

// Gestionnaire pour récupérer les épisodes d'une saison
ipcMain.handle('get-anime-episodes', async (event, animeId, seasonId) => {
    try {
        console.log(`Récupération des épisodes pour l'anime: ${animeId}, saison: ${seasonId}`);

        const episodes = await Scraper.getEpisodes(animeId, seasonId);
        console.log(animeId, seasonId);
        return { success: true, episodes };
    } catch (error) {
        console.error('Erreur lors de la récupération des épisodes:', error);
        return { success: false, error: error.message };
    }
});

// Gestionnaire pour récupérer les métadonnées des épisodes
ipcMain.handle('get-episode-metadata', async (event, anilistId) => {
    try {
        console.log(`Récupération des métadonnées pour l'AniList ID: ${anilistId}`);

        const response = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return { success: true, metadata: data };
    } catch (error) {
        console.error('Erreur lors de la récupération des métadonnées:', error);
        return { success: false, error: error.message };
    }
});

// Cette méthode sera appelée quand Electron aura fini de s'initialiser
app.whenReady().then(createWindow);

// Quitter quand toutes les fenêtres sont fermées
app.on('window-all-closed', () => {
    // Sur macOS, il est courant pour les applications et leur barre de menu
    // de rester actives jusqu'à ce que l'utilisateur quitte explicitement avec Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // Sur macOS, il est courant de recréer une fenêtre dans l'app quand
    // l'icône du dock est cliquée et qu'il n'y a pas d'autres fenêtres ouvertes
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
