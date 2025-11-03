/**
 * Gestionnaire des animations de chibis et effets visuels
 * Crée une ambiance anime immersive avec particules et animations
 */

export class ChibiAnimations {
    constructor() {
        this.chibis = [];
        this.particles = [];
        this.sparkles = [];
    }

    createFloatingChibis() {
        const chibiImages = [
            { src: '../assets/chibi.png', class: 'chibi-float-1', position: { top: '20%', left: '8%' }, rotation: 5 },
            { src: '../assets/chibi1.png', class: 'chibi-float-2', position: { top: '15%', right: '12%' }, rotation: -8 },
            { src: '../assets/chibi2.png', class: 'chibi-float-3', position: { bottom: '25%', left: '5%' }, rotation: -5 },
            { src: '../assets/chibi3.png', class: 'chibi-float-4', position: { bottom: '20%', right: '8%' }, rotation: 7 }
        ];

        chibiImages.forEach((chibi, index) => {
            // Container avec glow effect
            const chibiContainer = document.createElement('div');
            chibiContainer.className = `floating-chibi chibi-parallax ${chibi.class}`;
            chibiContainer.style.cssText = `
                position: absolute;
                ${Object.entries(chibi.position).map(([key, value]) => `${key}: ${value}`).join('; ')};
                z-index: 0;
                pointer-events: all;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            `;

            // Wrapper pour l'animation
            const chibiWrapper = document.createElement('div');
            chibiWrapper.className = 'chibi-wrapper';
            chibiWrapper.style.cssText = `
                position: relative;
                animation: floatBounce ${4 + index}s ease-in-out infinite;
                animation-delay: ${index * 0.5}s;
            `;

            // Image du chibi
            const img = document.createElement('img');
            img.src = chibi.src;
            img.alt = `Chibi ${index + 1}`;
            img.className = 'chibi-image';
            img.style.cssText = `
                width: 80px;
                height: 80px;
                object-fit: contain;
                filter: drop-shadow(0 8px 16px rgba(99, 102, 241, 0.3));
                transform: rotate(${chibi.rotation}deg);
                transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            `;

            // Glow effect derrière le chibi
            const glow = document.createElement('div');
            glow.className = 'chibi-glow';
            glow.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 100px;
                height: 100px;
                background: radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%);
                border-radius: 50%;
                animation: pulseGlow ${3 + index * 0.5}s ease-in-out infinite;
                z-index: -1;
            `;

            chibiWrapper.appendChild(glow);
            chibiWrapper.appendChild(img);
            chibiContainer.appendChild(chibiWrapper);
            
            // Ajouter au hero-section au lieu du body
            const heroSection = document.querySelector('.hero-section') || document.body;
            heroSection.appendChild(chibiContainer);

            // Animation d'apparition
            chibiContainer.style.opacity = '0';
            chibiContainer.style.transform = 'scale(0.5)';
            setTimeout(() => {
                chibiContainer.style.opacity = '0.8';
                chibiContainer.style.transform = 'scale(1)';
            }, index * 300);

            // Effet hover
            chibiContainer.addEventListener('mouseenter', () => {
                img.style.transform = `rotate(${chibi.rotation}deg) scale(1.2)`;
                img.style.filter = 'drop-shadow(0 12px 24px rgba(99, 102, 241, 0.6))';
                chibiContainer.style.opacity = '1';
                this.createSparkles(chibiContainer);
            });

            chibiContainer.addEventListener('mouseleave', () => {
                img.style.transform = `rotate(${chibi.rotation}deg) scale(1)`;
                img.style.filter = 'drop-shadow(0 8px 16px rgba(99, 102, 241, 0.3))';
                chibiContainer.style.opacity = '0.8';
            });

            // Click effect
            chibiContainer.addEventListener('click', () => {
                this.createClickEffect(chibiContainer);
            });

            this.chibis.push(chibiContainer);
        });
    }

    addParallaxEffect() {
        let ticking = false;

        const updateParallax = () => {
            const scrolled = window.pageYOffset;
            const chibis = document.querySelectorAll('.chibi-parallax');

            chibis.forEach((chibi, index) => {
                const speed = 0.5 + (index * 0.1);
                const yPos = -(scrolled * speed);
                chibi.style.transform = `translateY(${yPos}px)`;
            });

            ticking = false;
        };

        const requestTick = () => {
            if (!ticking) {
                requestAnimationFrame(updateParallax);
                ticking = true;
            }
        };

        window.addEventListener('scroll', requestTick);
    }

    addMouseEffect() {
        let mouseX = 0;
        let mouseY = 0;

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX / window.innerWidth;
            mouseY = e.clientY / window.innerHeight;
        });

        const updateMouseEffect = () => {
            const chibis = document.querySelectorAll('.floating-chibi');

            chibis.forEach((chibi, index) => {
                const speed = 0.015 + (index * 0.008);
                const x = (mouseX - 0.5) * speed * 40;
                const y = (mouseY - 0.5) * speed * 25;

                const currentTransform = chibi.style.transform || '';
                const baseTransform = currentTransform.split('translate')[0];
                chibi.style.transform = `${baseTransform} translate(${x}px, ${y}px)`;
            });

            requestAnimationFrame(updateMouseEffect);
        };

        updateMouseEffect();
    }

    createParticles() {
        const particleCount = 30;
        const particleContainer = document.createElement('div');
        particleContainer.className = 'particle-container';
        particleContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
            overflow: hidden;
        `;
        document.body.appendChild(particleContainer);

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'anime-particle';

            const size = Math.random() * 4 + 2;
            const startX = Math.random() * 100;
            const duration = Math.random() * 15 + 10;
            const delay = Math.random() * 5;
            const opacity = Math.random() * 0.5 + 0.2;

            particle.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                background: radial-gradient(circle, rgba(99, 102, 241, ${opacity}), rgba(168, 85, 247, ${opacity * 0.8}));
                border-radius: 50%;
                left: ${startX}%;
                top: -20px;
                animation: floatParticle ${duration}s linear ${delay}s infinite;
                box-shadow: 0 0 ${size * 2}px rgba(99, 102, 241, 0.5);
            `;

            particleContainer.appendChild(particle);
            this.particles.push(particle);
        }
    }

    createSparkles(element) {
        const rect = element.getBoundingClientRect();
        const sparkleCount = 8;

        for (let i = 0; i < sparkleCount; i++) {
            const sparkle = document.createElement('div');
            sparkle.className = 'sparkle';

            const angle = (Math.PI * 2 * i) / sparkleCount;
            const distance = 40;
            const x = Math.cos(angle) * distance;
            const y = Math.sin(angle) * distance;

            sparkle.style.cssText = `
                position: fixed;
                left: ${rect.left + rect.width / 2}px;
                top: ${rect.top + rect.height / 2}px;
                width: 6px;
                height: 6px;
                background: radial-gradient(circle, #fbbf24, #f59e0b);
                border-radius: 50%;
                pointer-events: none;
                z-index: 1000;
                animation: sparkleOut 0.6s ease-out forwards;
                transform: translate(${x}px, ${y}px);
                box-shadow: 0 0 10px #fbbf24;
            `;

            document.body.appendChild(sparkle);

            setTimeout(() => sparkle.remove(), 600);
        }
    }

    createClickEffect(element) {
        const rect = element.getBoundingClientRect();
        const ripple = document.createElement('div');

        ripple.style.cssText = `
            position: fixed;
            left: ${rect.left + rect.width / 2}px;
            top: ${rect.top + rect.height / 2}px;
            width: 0;
            height: 0;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(99, 102, 241, 0.6), transparent);
            pointer-events: none;
            z-index: 999;
            animation: rippleEffect 0.8s ease-out forwards;
            transform: translate(-50%, -50%);
        `;

        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 800);
    }

    createColorWaves() {
        const wave1 = document.createElement('div');
        const wave2 = document.createElement('div');

        wave1.className = 'color-wave wave-1';
        wave2.className = 'color-wave wave-2';

        const waveStyles = `
            position: fixed;
            width: 150%;
            height: 150%;
            pointer-events: none;
            z-index: 0;
            opacity: 0.03;
        `;

        wave1.style.cssText = waveStyles + `
            background: radial-gradient(ellipse at 20% 30%, rgba(99, 102, 241, 0.4) 0%, transparent 50%);
            animation: waveMove1 20s ease-in-out infinite;
        `;

        wave2.style.cssText = waveStyles + `
            background: radial-gradient(ellipse at 80% 70%, rgba(168, 85, 247, 0.4) 0%, transparent 50%);
            animation: waveMove2 25s ease-in-out infinite;
        `;

        document.body.insertBefore(wave1, document.body.firstChild);
        document.body.insertBefore(wave2, document.body.firstChild);
    }

    initialize() {
        this.createColorWaves();
        this.createFloatingChibis();
        this.createParticles();
        this.addParallaxEffect();
        this.addMouseEffect();
    }
}

