import { supabase } from "@/lib/supabase";
import { getSeasonEpisodes, postFn } from "@/api/animeApi";
import { isPremiumActive, premiumTier } from "@/lib/premium";

/** Tokens de la colonne `accent_color`. */
const THEMES = {
  vermillion: { label: "Vermillion", kanji: "朱", rgb: "255 74 45" },
  sakura: { label: "Sakura", kanji: "桜", rgb: "255 141 132" },
};

const isPremiumTheme = (token) => !!THEMES[token]?.premium;

/** Abonnés : filigrane sur l'en-tête du profil. */
export const EMBLEMS = ["朱", "龍", "桜", "刀", "神", "影", "星", "月", "炎", "雪", "花", "夢", "心", "光", "王", "空"];

const AVATAR_BUCKET = "avatars";
const BANNER_BUCKET = "banners";
const BACKGROUND_BUCKET = "page_backgrounds";

function publicImageUrl(bucket, path) {
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

const isGifPath = (path) => /\.gif(\?|$)/i.test(path || "");

/** L'avatar uploadé, sinon celui de Discord. Un gif est réservé aux abonnés. */
export function resolveAvatar(profile) {
  if (!profile) return null;
  const custom = profile.avatar_custom;
  if (custom && isGifPath(custom) && !isPremiumActive(profile)) return profile.avatar || null;
  return publicImageUrl(AVATAR_BUCKET, custom) || profile.avatar || null;
}

/** URL Discord telle quelle, ou chemin d'un avatar uploadé. */
export function avatarUrl(value) {
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : publicImageUrl(AVATAR_BUCKET, value);
}

/** Une bannière animée (gif) est réservée à Ultimate. */
export function resolveBanner(profile) {
  const path = profile?.banner;
  if (!path) return null;
  if (isGifPath(path) && premiumTier(profile) !== "ultimate") return null;
  return publicImageUrl(BANNER_BUCKET, path);
}

/** Même règle gif/Ultimate que la bannière. */
export function resolvePageBackground(profile) {
  const path = profile?.page_background;
  if (!path) return null;
  if (isGifPath(path) && premiumTier(profile) !== "ultimate") return null;
  return publicImageUrl(BACKGROUND_BUCKET, path);
}

/** Un thème réservé retombe sur « vermillion » sans abonnement actif. */
export function resolveAccent(profile) {
  const token = profile?.accent || profile?.accent_color || "vermillion";
  if (isPremiumTheme(token) && !isPremiumActive(profile)) return "vermillion";
  return token;
}

/** Null sans abonnement actif. */
export function resolveEmblem(profile, fallback = null) {
  if (profile?.profile_emblem && isPremiumActive(profile)) return profile.profile_emblem;
  return fallback;
}

export function accentRgb(token) {
  const custom = /^#?([0-9a-f]{6})$/i.exec((token || "").trim());
  if (custom) {
    const value = Number.parseInt(custom[1], 16);
    return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
  }
  return (THEMES[token] || THEMES.vermillion).rgb;
}

/** Quand le profil n'a ni bannière ni fond dédié. */
export function pageAmbientBackdrop() {
  return (
    "radial-gradient(120% 90% at 85% -10%, rgb(var(--primary) / 0.32), transparent 60%)," +
    "radial-gradient(100% 85% at -10% 100%, rgb(var(--primary) / 0.16), transparent 65%)," +
    "linear-gradient(165deg, rgb(var(--surface)) 0%, rgb(var(--bg)) 70%)"
  );
}

/** Les erreurs serveur courtes (handle_pris, bio_trop_longue…) sont laissées à l'appelant. */
export async function updateMyProfile({ handle, bio, accent, emblem, ambient, cosmetics, isPublic, activityPublic, favoritesPublic }) {
  const { error } = await supabase.rpc("update_my_profile", {
    p_handle: handle,
    p_bio: bio ?? null,
    p_accent: accent || "vermillion",
    p_is_public: isPublic,
    p_activity_public: activityPublic,
    p_favorites_public: favoritesPublic,
    p_emblem: emblem ?? null,
    p_ambient: ambient ?? null,
    // `null` vide l'emplacement. `p_particles` absent : la RPC garde la valeur stockée.
    p_ornament: cosmetics?.ornament ?? null,
    p_banner: cosmetics?.banner ?? null,
  });
  if (error) throw error;
}

/** Seul chemin d'écriture du pseudo : la colonne n'est pas modifiable en direct. */
export async function setUsername(username) {
  const { error } = await supabase.rpc("set_username", { p_username: username });
  if (error) throw error;
}

/** Dossier « <uid>/… », imposé par les policies du bucket. */
export async function uploadProfileImage(kind, file) {
  // `getSession()` plutôt que `getUser()` : un appel réseau avec un jeton déjà pivoté par le
  // Hub déclencherait une déconnexion.
  const userId = (await supabase.auth.getSession()).data.session?.user?.id;
  if (!userId) throw new Error("forbidden");
  const bucket = kind === "avatar" ? AVATAR_BUCKET : kind === "background" ? BACKGROUND_BUCKET : BANNER_BUCKET;
  const ext = (file.name?.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type || "image/png", upsert: false });
  if (upErr) throw upErr;

  const { error } = await supabase.rpc("set_profile_image", { p_kind: kind, p_path: path });
  if (error) throw error;
  return path;
}

export async function clearProfileImage(kind) {
  const { error } = await supabase.rpc("set_profile_image", { p_kind: kind, p_path: null });
  if (error) throw error;
}

/** Null si le profil est introuvable ou privé. */
export async function getPublicProfile(handle) {
  const { data, error } = await supabase.rpc("get_public_profile", { p_handle: handle });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: row.id,
    handle: row.handle,
    username: row.username,
    avatar: row.avatar,
    avatar_custom: row.avatar_custom,
    banner: row.banner,
    page_background: row.page_background,
    bio: row.bio,
    role: row.role,
    accent: row.accent_color,
    premium_tier: row.premium_tier || null,
    profile_emblem: row.profile_emblem || null,
    ambient_theme: row.ambient_theme || null,
    // Déjà filtrés par palier côté serveur.
    cosmetic_ornament: row.cosmetic_ornament || null,
    cosmetic_banner: row.cosmetic_banner || null,
    createdAt: row.created_at,
    isSelf: !!row.is_self,
    activityPublic: !!row.activity_public,
    favoritesPublic: !!row.favorites_public,
    friendsCount: Number(row.friends_count || 0),
    lastActive: row.last_active || null, // null si masquée par le membre
    viewsCount: Number(row.views_count || 0),
    // Top 10 seulement.
    rankBadge: row.rank_badge == null ? null : Number(row.rank_badge),
    stats: {
      totalWatchSeconds: Math.round(row.total_watch_seconds || 0),
      totalEpisodes: Number(row.total_episodes || 0),
      totalAnimes: Number(row.total_animes || 0),
      // Les badges sont publics, pas les compteurs.
      achievements: row.achievements || {},
    },
  };
}

/** Visiteur, déduplication et plafonds sont gérés côté serveur. Un échec est silencieux. */
export async function recordProfileView(handle) {
  if (!handle) return;
  try {
    await postFn(`/v1/profiles/${encodeURIComponent(handle)}/views`);
  } catch {
    /* best-effort */
  }
}

/** Staff, admin, développeur. Réservé aux comptes connectés. */
export async function getTeamRoster() {
  const { data, error } = await supabase.rpc("get_team_roster");
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    handle: r.handle,
    username: r.username,
    avatar: r.avatar,
    avatar_custom: r.avatarCustom,
    bio: r.bio,
    role: r.role,
    createdAt: r.createdAt,
  }));
}

/** [] si le membre masque sa liste. */
export async function getPublicFriends(userId, lim = 24) {
  const { data, error } = await supabase.rpc("get_public_friends", { p_id: userId, lim });
  if (error) throw error;
  return data || [];
}

/** self | friends | pending_out | pending_in | none */
export async function getFriendStatus(userId) {
  const { data, error } = await supabase.rpc("friend_status", { p_id: userId });
  if (error) throw error;
  return data || "none";
}

export async function setSocialPrefs(friendsPublic, presencePublic) {
  const { error } = await supabase.rpc("set_social_prefs", {
    p_friends_public: friendsPublic,
    p_presence_public: presencePublic,
  });
  if (error) throw error;
}

export async function getPublicFavorites(userId) {
  const { data, error } = await supabase.rpc("get_public_favorites", { p_id: userId });
  if (error) throw error;
  return (data || []).map((r) => ({
    slug: r.anime_slug,
    title: r.anime_title,
    cover: r.anime_cover,
    pinnedAt: r.pinned_at,
    episodesWatched: Number(r.episodes_watched || 0),
    watchSeconds: Math.round(r.watch_seconds || 0),
  }));
}

export async function getProfileExtraStats() {
  const { data, error } = await supabase.rpc("get_profile_extra_stats");
  if (error) {
    console.warn("[profile] get_profile_extra_stats:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    rank: Number(row.rank || 0),
    totalMembers: Number(row.total_members || 0),
    // Null tant qu'elle n'a pas été calculée.
    bestRank: row.best_rank == null ? null : Number(row.best_rank),
    rankBadge: row.rank_badge == null ? null : Number(row.rank_badge),
    streakDays: Number(row.streak_days || 0),
    nightEpisodes: Number(row.night_episodes || 0),
    seasonSpring: Number(row.season_spring || 0),
    seasonSummer: Number(row.season_summer || 0),
    seasonAutumn: Number(row.season_autumn || 0),
    seasonWinter: Number(row.season_winter || 0),
  };
}

/** [{ day, count }] sur `days` jours glissants. */
export async function getWatchCalendar(userId, days = 119) {
  const { data, error } = await supabase.rpc("get_watch_calendar", { p_id: userId, p_days: days });
  if (error) throw error;
  return (data || []).map((r) => ({ day: r.day, count: Number(r.count || 0) }));
}

export async function getPublicActivity(userId, limit = 20) {
  const { data, error } = await supabase.rpc("get_public_activity", { p_id: userId, lim: limit });
  if (error) throw error;
  return (data || []).map((r) => ({
    kind: r.kind,
    slug: r.anime_slug,
    title: r.anime_title,
    cover: r.anime_cover,
    seasonId: r.season_id,
    episodeNumber: r.episode_number,
    chapter: r.chapter,
    label: r.label,
    ts: r.ts,
  }));
}

/** Slug en minuscules. */
export function episodeThumbKey(slug, seasonId, episodeNumber) {
  return `${String(slug || "").toLowerCase()}|${seasonId}|${episodeNumber}`;
}

const episodeMetaCache = new Map();
const EPISODE_META_TTL = 60 * 60 * 1000;

/** Synchrone, avant le premier rendu, pour éviter le flash d'image. */
export function getCachedEpisodeMeta(items) {
  const now = Date.now();
  const out = {};
  for (const item of items || []) {
    const key = episodeThumbKey(item.slug, item.seasonId, item.episodeNumber);
    const hit = episodeMetaCache.get(key);
    if (hit && now - hit.ts < EPISODE_META_TTL) out[key] = hit.meta;
  }
  return out;
}

/**
 * Regroupées par saison, pour ne charger chacune qu'une fois.
 * @returns {Promise<Object<string, {image:string|null, title:string|null,
 * season:string|null, seasonShort:string|null, total:number|null}>>}
 */
export async function getEpisodeMeta(items) {
  const valid = (items || []).filter(
    (it) => it.slug && it.seasonId != null && it.episodeNumber != null
  );
  if (!valid.length) return {};

  const metas = getCachedEpisodeMeta(valid);
  const groups = new Map();
  for (const item of valid) {
    const itemKey = episodeThumbKey(item.slug, item.seasonId, item.episodeNumber);
    if (metas[itemKey]) continue;
    const groupKey = `${item.slug}|${item.seasonId}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { slug: item.slug, seasonId: item.seasonId, items: [] });
    }
    groups.get(groupKey).items.push(item);
  }

  const now = Date.now();
  await Promise.all(
    [...groups.values()].map(async ({ slug, seasonId, items: seasonItems }) => {
      const data = await getSeasonEpisodes(slug, seasonId).catch(() => null);
      const episodes = data?.episodes || [];
      const season = data?.seasonName || seasonLabelFromId(seasonId);
      for (const item of seasonItems) {
        const target = Number(item.episodeNumber);
        const episode = episodes.find((ep) => Number(ep.episode ?? ep.number) === target);
        const meta = {
          image: episode?.image || episode?.thumbnail || null,
          // Les vrais titres seulement, pas « Épisode 7 ».
          title: cleanEpisodeTitle(episode?.title, target),
          season,
          seasonShort: shortSeasonLabel(season),
          total: Number(data?.totalEpisodes) || episodes.length || null,
        };
        const key = episodeThumbKey(item.slug, item.seasonId, item.episodeNumber);
        metas[key] = meta;
        episodeMetaCache.set(key, { meta, ts: now });
      }
    })
  );
  return metas;
}

/** « saison2-vostfr » → « Saison 2 », quand l'API ne nomme pas la saison. */
function seasonLabelFromId(seasonId) {
  const raw = String(seasonId || "");
  const num = raw.match(/(\d+)/)?.[1];
  if (/film/i.test(raw)) return "Films";
  if (/hors|oav|ova|special/i.test(raw)) return "Hors-série";
  return num ? `Saison ${num}` : null;
}

/** « Saison 2 VOSTFR » → « S2 ». */
function shortSeasonLabel(season) {
  if (!season) return null;
  const num = String(season).match(/(\d+)/)?.[1];
  if (num) return `S${num}`;
  if (/film/i.test(season)) return "Film";
  if (/hors|oav|ova|special/i.test(season)) return "HS";
  return null;
}

function cleanEpisodeTitle(title, number) {
  const t = String(title || "").trim();
  if (!t) return null;
  if (new RegExp(`^(episode|épisode|ep\\.?|e)\\s*0*${number}$`, "i").test(t)) return null;
  if (t === String(number)) return null;
  return t;
}

export function profileErrorMessage(err) {
  const m = (err?.message || "").trim();
  const map = {
    handle_invalide: "Le pseudo public doit faire 3–20 caractères (lettres, chiffres, _).",
    handle_reserve: "Ce pseudo public est réservé.",
    handle_pris: "Ce pseudo public est déjà pris.",
    username_invalide: "Le pseudo doit faire 3–24 caractères (lettres, chiffres, espace, _ . -).",
    username_reserve: "Ce pseudo est réservé.",
    bio_trop_longue: "La bio est trop longue (300 caractères max).",
    forbidden: "Action non autorisée.",
  };
  return map[m] || "Une erreur est survenue. Réessaie.";
}
