/**
 * Gestionnaire des animations de chibis
 * Crée et anime les personnages flottants en arrière-plan
 */

export class ChibiAnimations {
    constructor() {
        this.chibis = [];
    }

    createFloatingChibis() {
        const chibiImages = [
            { src: '../assets/chibi.png', class: 'chibi-float-1', position: { top: '15%', left: '8%' } },
            { src: '../assets/chibi1.png', class: 'chibi-float-2', position: { top: '25%', right: '12%' } },
            { src: '../assets/chibi2.png', class: 'chibi-float-3', position: { bottom: '20%', left: '5%' } },
            { src: '../assets/chibi3.png', class: 'chibi-float-4', position: { bottom: '30%', right: '8%' } }
        ];

        chibiImages.forEach((chibi, index) => {
            const chibiElement = document.createElement('div');
            chibiElement.className = `floating-chibi chibi-parallax ${chibi.class}`;
            chibiElement.style.cssText = `
                position: fixed;
                ${Object.entries(chibi.position).map(([key, value]) => `${key}: ${value}`).join('; ')};
                z-index: 0;
                pointer-events: none;
            `;

            const img = document.createElement('img');
            img.src = chibi.src;
            img.alt = `Chibi ${index + 1}`;
            img.style.cssText = `
                width: 60px;
                height: 60px;
                object-fit: contain;
                filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
            `;

            chibiElement.appendChild(img);
            document.body.appendChild(chibiElement);

            setTimeout(() => {
                chibiElement.style.opacity = '0.6';
            }, index * 500);

            this.chibis.push(chibiElement);
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
        document.addEventListener('mousemove', (e) => {
            const chibis = document.querySelectorAll('.floating-chibi');
            const mouseX = e.clientX / window.innerWidth;
            const mouseY = e.clientY / window.innerHeight;

            chibis.forEach((chibi, index) => {
                const speed = 0.02 + (index * 0.01);
                const x = (mouseX - 0.5) * speed * 50;
                const y = (mouseY - 0.5) * speed * 30;

                chibi.style.transform += ` translate(${x}px, ${y}px)`;
            });
        });
    }

    initialize() {
        this.createFloatingChibis();
        this.addParallaxEffect();
        this.addMouseEffect();
    }
}

