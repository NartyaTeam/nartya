const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const IPCHandlers = require('./ipc-handlers');

// Garder une référence globale de l'objet window
let mainWindow;

/**
 * Configure les headers HTTP pour la lecture de vidéos
 * Permet de contourner les protections anti-hotlinking (403 Forbidden)
 */
function configureVideoHeaders() {
    const defaultSession = session.defaultSession;

    defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
        // Headers pour Sibnet (fix 403 Forbidden)
        if (details.url.includes('sibnet.ru')) {
            details.requestHeaders['Referer'] = 'https://video.sibnet.ru/';
            details.requestHeaders['Origin'] = 'https://video.sibnet.ru';
            details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            console.log('🔧 Headers Sibnet ajoutés pour:', details.url.substring(0, 80));
        }

        // Headers pour Vidmoly
        if (details.url.includes('vidmoly')) {
            details.requestHeaders['Referer'] = 'https://anime-sama.fr/';
            details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            console.log('🔧 Headers Vidmoly ajoutés pour:', details.url.substring(0, 80));
        }

        // Headers pour SendVid
        if (details.url.includes('sendvid')) {
            details.requestHeaders['Referer'] = 'https://sendvid.com/';
            details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            console.log('🔧 Headers SendVid ajoutés pour:', details.url.substring(0, 80));
        }

        callback({ requestHeaders: details.requestHeaders });
    });

    console.log('✅ Configuration des headers vidéo terminée');
}

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
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true  // Garder la sécurité activée
        },
        icon: path.join(__dirname, '..', 'assets', 'chibi.png'),
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

// Enregistrer les handlers IPC
const ipcHandlers = new IPCHandlers();
ipcHandlers.registerAll();

// Cette méthode sera appelée quand Electron aura fini de s'initialiser
app.whenReady().then(() => {
    // Configurer les headers pour la lecture de vidéos
    configureVideoHeaders();

    // Créer la fenêtre
    createWindow();
});

// Quitter quand toutes les fenêtres sont fermées
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
