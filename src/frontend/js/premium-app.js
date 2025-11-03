/**
 * Application Premium - Gestion des abonnements
 */

class PremiumApp {
    constructor() {
        this.init();
    }

    init() {
        console.log('Premium app initialized');
        this.attachEventListeners();
        this.createSubtleParticles();
    }

    attachEventListeners() {
        // Les événements onclick sont déjà dans le HTML
    }

    createSubtleParticles() {
        // Créer quelques particules subtiles comme sur la page d'accueil
        const particleContainer = document.createElement('div');
        particleContainer.className = 'premium-particles';
        particleContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
            overflow: hidden;
        `;
        document.body.insertBefore(particleContainer, document.body.firstChild);

        const particleCount = 15;

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'premium-particle';
            
            const size = Math.random() * 4 + 2;
            const startX = Math.random() * 100;
            const duration = Math.random() * 15 + 10;
            const delay = Math.random() * 5;
            const opacity = Math.random() * 0.3 + 0.1;
            
            particle.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                background: radial-gradient(circle, rgba(99, 102, 241, ${opacity}), rgba(168, 85, 247, ${opacity * 0.8}));
                border-radius: 50%;
                left: ${startX}%;
                top: -20px;
                animation: floatParticlePremium ${duration}s linear ${delay}s infinite;
                box-shadow: 0 0 ${size * 2}px rgba(99, 102, 241, 0.3);
            `;
            
            particleContainer.appendChild(particle);
        }

        // Ajouter l'animation CSS
        const style = document.createElement('style');
        style.textContent = `
            @keyframes floatParticlePremium {
                0% {
                    transform: translateY(0) translateX(0) rotate(0deg);
                    opacity: 0;
                }
                10% {
                    opacity: 1;
                }
                90% {
                    opacity: 1;
                }
                100% {
                    transform: translateY(100vh) translateX(50px) rotate(360deg);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Fonction globale pour sélectionner un plan
window.selectPlan = function (planType) {
    console.log(`Plan sélectionné: ${planType}`);

    // Afficher un message temporaire simple
    const message = document.createElement('div');
    message.className = 'plan-selected-message';
    message.innerHTML = `
        <div class="message-content">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5"/>
            </svg>
            <span>Fonctionnalité en cours de développement</span>
        </div>
    `;
    document.body.appendChild(message);

    // Ajouter les styles dynamiquement
    const style = document.createElement('style');
    style.textContent = `
        .plan-selected-message {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(10, 10, 10, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            padding: 2rem 3rem;
            z-index: 9999;
            animation: fadeInOut 2.5s ease forwards;
            backdrop-filter: blur(10px);
        }

        .message-content {
            display: flex;
            align-items: center;
            gap: 1rem;
            color: #fafafa;
            font-size: 1.1rem;
            font-weight: 500;
        }

        .message-content svg {
            color: #a78bfa;
        }

        @keyframes fadeInOut {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
            20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        }
    `;
    document.head.appendChild(style);

    // Retirer le message après l'animation
    setTimeout(() => {
        message.remove();
        style.remove();
    }, 2500);
};

// Initialiser l'application
const app = new PremiumApp();

