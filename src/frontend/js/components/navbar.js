/**
 * Composant Navbar réutilisable
 * Utilise des Web Components pour créer une navbar cohérente
 */

export function createNavbar(options = {}) {
    const {
        showSearch = false,
        showBack = false,
        onLogoClick = () => window.location.href = 'index.html'
    } = options;

    const navbar = document.createElement('div');
    navbar.className = 'header';
    navbar.id = 'header';

    navbar.innerHTML = `
        <div class="header-content">
            <div class="logo" id="navLogo">
                <div class="logo-icon">
                    <img src="../../assets/chibi.png" alt="Nartya" />
                </div>
                <span class="logo-text">Nartya</span>
            </div>

            ${showSearch ? `
            <div class="header-search" id="headerSearch">
                <div class="search-wrapper-nav">
                    <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input 
                        type="text" 
                        class="search-input-nav" 
                        placeholder="Rechercher un anime..."
                        id="searchInputNav"
                        autocomplete="off"
                    >
                    <svg class="clear-icon" id="clearIconNav" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <path d="M18 6L6 18M6 6l12 12"></path>
                    </svg>
                </div>
            </div>
            ` : ''}

            <div class="header-actions">
                <button class="nav-btn settings" onclick="window.location.href='settings.html'" title="Paramètres">
                    <div class="nav-btn-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </div>
                    <span class="nav-btn-label">Paramètres</span>
                </button>

                <button class="nav-btn premium" onclick="window.location.href='premium.html'" title="Premium">
                    <div class="nav-btn-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                    </div>
                    <span class="nav-btn-label">Premium</span>
                </button>

                ${showBack ? `
                <button class="nav-btn back" onclick="window.location.href='index.html'" title="Retour">
                    <div class="nav-btn-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                    </div>
                    <span class="nav-btn-label">Retour</span>
                </button>
                ` : ''}
            </div>
        </div>
    `;

    // Attacher l'événement au logo
    setTimeout(() => {
        const logoElement = navbar.querySelector('#navLogo');
        if (logoElement) {
            logoElement.addEventListener('click', onLogoClick);
        }
    }, 0);

    return navbar;
}

/**
 * Initialise la navbar dans un conteneur
 */
export function initNavbar(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container ${containerId} not found`);
        return;
    }

    const navbar = createNavbar(options);
    container.replaceWith(navbar);
}

