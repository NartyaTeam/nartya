import { createClient } from "@supabase/supabase-js";
import { authOwnedByHub } from "./hubAuth";
import { platform } from "@/platform";
import { SITE_URL } from "@/config/instance";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants. Renseigner le fichier .env."
  );
}

/**
 * Session partagée avec le Hub (fichier commun, via le processus principal). Le miroir
 * localStorage sert au démarrage synchrone ; hors Electron, tout repose sur lui.
 */
const hasBridge = () => !!platform.session;

const sharedStorage = {
  async getItem(key) {
    if (!hasBridge()) return localStorage.getItem(key);
    let v = await platform.session.get(key);
    if (v == null) {
      const legacy = localStorage.getItem(key);
      if (legacy != null) {
        await platform.session.set(key, legacy); // reprise d'une ancienne session locale
        v = legacy;
      }
    }
    if (v != null) localStorage.setItem(key, v); // miroir pour le démarrage synchrone
    else localStorage.removeItem(key);
    return v;
  },
  async setItem(key, value) {
    localStorage.setItem(key, value);
    if (hasBridge()) await platform.session.set(key, value);
  },
  async removeItem(key) {
    localStorage.removeItem(key);
    if (hasBridge()) await platform.session.remove(key);
  },
};

/**
 * Avec le Hub, lui seul rafraîchit le jeton : deux rafraîchisseurs sur le même refresh-token
 * rotatif se révoquent mutuellement.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: !authOwnedByHub(),
    detectSessionInUrl: false,
    storageKey: "nartya-auth",
    storage: sharedStorage,
  },
});

/** Enregistré côté Supabase (Auth > URL Configuration > Redirect URLs). */
export const OAUTH_REDIRECT = `${SITE_URL}/callback`;
