/**
 * Système de logging conditionnel pour production
 * Active les logs uniquement en mode développement
 */

const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

const logger = {
    log: (...args) => {
        if (isDev) console.log(...args);
    },
    
    warn: (...args) => {
        if (isDev) console.warn(...args);
    },
    
    error: (...args) => {
        // Toujours logger les erreurs
        console.error(...args);
    },
    
    debug: (...args) => {
        if (isDev) console.debug(...args);
    },
    
    info: (...args) => {
        if (isDev) console.info(...args);
    }
};

module.exports = logger;

