const { app, BrowserWindow, session, Menu } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const IPCHandlers = require('./ipc-handlers');

// Garder une référence globale de l'objet window
let mainWindow;

// Configuration de l'auto-updater
autoUpdater.autoDownload = false; // Ne pas télécharger automatiquement
autoUpdater.autoInstallOnAppQuit = true; // Installer automatiquement à la fermeture

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
    // Désactiver la barre de menu
    Menu.setApplicationMenu(null);

    // Créer la fenêtre du navigateur
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 1024,  // Réduit pour compatibilité laptop 13"
        minHeight: 768,  // Standard minimal moderne
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true  // Garder la sécurité activée
        },
        icon: path.join(__dirname, '..', 'build', 'icon.png'),
        title: 'Nartya',
        autoHideMenuBar: true  // Cacher automatiquement la barre de menu
    });

    // Charger le fichier HTML
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'index.html'));

    // Ouvrir les DevTools UNIQUEMENT en mode développement
    if (process.argv.includes('--dev') || process.env.NODE_ENV === 'development') {
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

/**
 * Configure les événements de l'auto-updater
 */
function setupAutoUpdater() {
    // Vérifier les mises à jour au démarrage (après 3 secondes)
    setTimeout(() => {
        autoUpdater.checkForUpdates();
    }, 3000);

    // Événement: Vérification des mises à jour
    autoUpdater.on('checking-for-update', () => {
        console.log('🔍 Vérification des mises à jour...');
        if (mainWindow) {
            mainWindow.webContents.send('update-checking');
        }
    });

    // Événement: Mise à jour disponible
    autoUpdater.on('update-available', (info) => {
        console.log('✨ Mise à jour disponible:', info.version);
        if (mainWindow) {
            mainWindow.webContents.send('update-available', info);
        }
    });

    // Événement: Pas de mise à jour
    autoUpdater.on('update-not-available', (info) => {
        console.log('✅ Application à jour');
        if (mainWindow) {
            mainWindow.webContents.send('update-not-available', info);
        }
    });

    // Événement: Erreur
    autoUpdater.on('error', (err) => {
        console.error('❌ Erreur lors de la mise à jour:', err);
        if (mainWindow) {
            mainWindow.webContents.send('update-error', err.message);
        }
    });

    // Événement: Progression du téléchargement
    autoUpdater.on('download-progress', (progressObj) => {
        console.log(`📥 Téléchargement: ${Math.round(progressObj.percent)}%`);
        if (mainWindow) {
            mainWindow.webContents.send('update-download-progress', progressObj);
        }
    });

    // Événement: Mise à jour téléchargée
    autoUpdater.on('update-downloaded', (info) => {
        console.log('✅ Mise à jour téléchargée:', info.version);
        if (mainWindow) {
            mainWindow.webContents.send('update-downloaded', info);
        }
    });
}

// Cette méthode sera appelée quand Electron aura fini de s'initialiser
app.whenReady().then(() => {
    // Configurer les headers pour la lecture de vidéos
    configureVideoHeaders();

    // Créer la fenêtre
    createWindow();

    // Configurer l'auto-updater (uniquement en production)
    if (!process.argv.includes('--dev') && process.env.NODE_ENV !== 'development') {
        setupAutoUpdater();
    }
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
