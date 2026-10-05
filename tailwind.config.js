/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        "bg-2": "rgb(var(--bg-2) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        text: "rgb(var(--text) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        primary: "rgb(var(--primary) / <alpha-value>)",
        "primary-fg": "rgb(var(--primary-fg) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        sakura: "rgb(var(--sakura) / <alpha-value>)",
      },
      fontFamily: {
        display: ['"Zen Maru Gothic"', "sans-serif"],
        impact: ['"Anton"', "Impact", "sans-serif"],
        sans: ['"Zen Kaku Gothic Antique"', "system-ui", "sans-serif"],
      },
      letterSpacing: {
        kana: "0.35em",
      },
      borderRadius: {
        xl: "0.5rem",
        "2xl": "0.75rem",
      },
      boxShadow: {
        glow: "0 0 60px -12px rgb(var(--primary) / 0.55)",
        card: "0 18px 40px -18px rgb(0 0 0 / 0.8)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "ken-burns": {
          "0%": { transform: "scale(1.05) translate(0,0)" },
          "100%": { transform: "scale(1.18) translate(-2%, -1%)" },
        },
        "marquee-down": {
          from: { transform: "translateY(0)" },
          to: { transform: "translateY(-50%)" },
        },
        "marquee-x": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-out-left": {
          from: { opacity: "1", transform: "translateX(0)" },
          to: { opacity: "0", transform: "translateX(-24px)" },
        },
        "autoskip-bounce": {
          "0%, 100%": { transform: "translateX(0)" },
          "50%": { transform: "translateX(3px)" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "scale(0.92) translateY(8px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.6s ease both",
        "fade-in-fast": "fade-in 0.28s ease both",
        "slide-up": "slide-up 0.7s cubic-bezier(0.16,1,0.3,1) both",
        "ken-burns": "ken-burns 18s ease-out both",
        "marquee-down": "marquee-down 40s linear infinite",
        "marquee-x": "marquee-x 60s linear infinite",
        shimmer: "shimmer 1.6s infinite",
        "slide-in-right": "slide-in-right 0.25s cubic-bezier(0.16,1,0.3,1) both",
        "slide-in-left": "slide-in-left 0.35s cubic-bezier(0.16,1,0.3,1) both",
        "slide-out-left": "slide-out-left 0.35s cubic-bezier(0.4,0,1,1) both",
        "autoskip-bounce": "autoskip-bounce 0.7s ease-in-out infinite",
        "pop-in": "pop-in 0.45s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
