import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Locale par défaut, publique sans le dossier `api/`.
const API_DEV_URL = process.env.NARTYA_DEV_API || "http://localhost:3000";

/**
 * Build seulement (Electron `file://`, WebView) : en dev, le préambule React Refresh est un
 * script inline. `img-src` et `connect-src` restent ouverts à `https:` (jaquettes et avatars
 * de nombreux hôtes) ; le proxy local écoute sur un port aléatoire du loopback.
 */
function contentSecurityPolicy(supabaseUrl) {
  const supabaseWs = supabaseUrl ? supabaseUrl.replace(/^http/, "ws") : "";
  const policy = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "https://challenges.cloudflare.com"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", "https:", "http://127.0.0.1:*"],
    "media-src": ["'self'", "data:", "blob:", "https:", "http://127.0.0.1:*"],
    "connect-src": ["'self'", "https:", supabaseWs, "http://127.0.0.1:*", "data:", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["https://challenges.cloudflare.com"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'none'"],
  };
  return Object.entries(policy)
    .map(([directive, sources]) => [directive, ...sources.filter(Boolean)].join(" "))
    .join("; ");
}

function cspPlugin(supabaseUrl) {
  return {
    name: "nartya-csp",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: contentSecurityPolicy(supabaseUrl),
          },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), cspPlugin(loadEnv(mode, process.cwd(), "VITE_").VITE_SUPABASE_URL)],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-player": ["artplayer", "hls.js"],
          "vendor-supabase": ["@supabase/supabase-js"],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      "/api": {
        target: API_DEV_URL,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
        secure: false,
      },
    },
  },
}));
