/**
 * Adresses de l'instance Nartya : le site, l'API, le Discord, le contact et la clé du
 * captcha. Seules les bases sont ici, le code y ajoute ses chemins (`${SITE_URL}/callback`).
 * Un fork modifie ce fichier pour pointer vers sa propre instance ; Supabase se règle dans
 * `.env`.
 */
export const SITE_URL = "https://nartya.app";
export const SITE_HOST = new URL(SITE_URL).host;
export const API_URL = "https://anime.nartya.app";
export const DISCORD_INVITE = "https://discord.gg/q5MHWyBXNm";
export const CONTACT_EMAIL = "contact@nartya.app";
// Clé publique Cloudflare Turnstile, liée aux domaines du site.
export const TURNSTILE_SITEKEY = "0x4AAAAAAEFfyKPirwZPGekW";
