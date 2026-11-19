import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { API_URL } from "./src/config/instance.js";

// Locale par défaut, publique sans le dossier `api/`.
const API_DEV_URL = process.env.NARTYA_DEV_API || "http://localhost:3000";

/**
 * Build seulement (coque Tauri, WebView) : en dev, le préambule React Refresh est un
 * script inline. `img-src` et `connect-src` restent ouverts à `https:` (jaquettes et avatars
 * de nombreux hôtes) ; le proxy local écoute sur un port aléatoire du loopback.
 */
function contentSecurityPolicy(supabaseUrl, apiUrl) {
  // `https:` ne couvre pas `wss:` : les WebSocket (Supabase Realtime, relais des watch parties)
  // doivent être listés un par un.
  const supabaseWs = supabaseUrl ? supabaseUrl.replace(/^http/, "ws") : "";
  const apiWs = apiUrl ? apiUrl.replace(/^http/, "ws") : "";
  const policy = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "https://challenges.cloudflare.com"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", "https:", "http://127.0.0.1:*"],
    "media-src": ["'self'", "data:", "blob:", "https:", "http://127.0.0.1:*"],
    // `ipc:` et `ipc.localhost` : canal des commandes de la coque Tauri.
    "connect-src": [
      "'self'",
      "https:",
      supabaseWs,
      apiWs,
      "http://127.0.0.1:*",
      "ipc:",
      "http://ipc.localhost",
      "data:",
      "blob:",
    ],
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

function cspPlugin(supabaseUrl, apiUrl) {
  return {
    name: "nartya-csp",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: contentSecurityPolicy(supabaseUrl, apiUrl),
          },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

const viteEnv = (mode) => loadEnv(mode, process.cwd(), "VITE_");

// Sans ces variables, le client Supabase lève dès le chargement et l'app reste sur un écran noir.
function requireSupabaseEnv(mode) {
  if (mode !== "production") return;
  const env = viteEnv(mode);
  const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"].filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`${missing.join(", ")} manquant : copier .env.example vers .env avant le build.`);
  }
}

export default defineConfig(({ mode }) => (requireSupabaseEnv(mode), {
  plugins: [
    react(),
    cspPlugin(viteEnv(mode).VITE_SUPABASE_URL, viteEnv(mode).VITE_API_URL || API_URL),
  ],
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
    // Les builds Rust/Android écrivent dans target/ : le surveiller fait planter le watcher.
    watch: { ignored: ["**/target/**", "**/src-tauri/gen/**"] },
    proxy: {
      "/api": {
        target: API_DEV_URL,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
        secure: false,
        // Relais des watch parties (WebSocket).
        ws: true,
      },
    },
  },
}));
