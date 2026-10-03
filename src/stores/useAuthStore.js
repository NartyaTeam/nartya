import { create } from "zustand";
import { supabase, OAUTH_REDIRECT } from "@/lib/supabase";
import { authOwnedByHub } from "@/lib/hubAuth";
import { getCaptchaToken } from "@/lib/captcha";
import { countPasswordLeaks } from "@/lib/passwordSafety";
import { platform } from "@/platform";
import { postFn } from "@/api/animeApi";
import {
  classifySession,
  shouldKeepSessionOnInitialSignedOut,
  hasFresherSharedToken,
} from "@/lib/sessionGuards";

/** Lecture synchrone, pour démarrer sans attendre le réseau. Tolère les deux formes de stockage GoTrue. */
function readPersistedSession() {
  try {
    const raw = localStorage.getItem("nartya-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession ?? parsed;
    return session?.access_token && session?.user ? session : null;
  } catch {
    return null;
  }
}

async function readSharedSessionFile() {
  let raw = null;
  try {
    raw = await platform.session?.get?.("nartya-auth");
  } catch (_) {}
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    const s = parsed?.currentSession ?? parsed;
    if (s?.access_token && s?.refresh_token) return s;
  } catch (_) {}
  return null;
}

function readableOAuthError(value) {
  if (!value) return "La liaison avec Discord a échoué.";
  const withSpaces = String(value).replace(/\+/g, " ");
  let decoded = withSpaces;
  try {
    decoded = decodeURIComponent(withSpaces);
  } catch (_) {}
  const normalized = decoded.toLowerCase();
  if (
    normalized.includes("identity is already linked to another user") ||
    normalized.includes("identity_already_exists")
  ) {
    return "Ce compte Discord est déjà lié à un autre compte Nartya. Connectez-vous à ce compte ou choisissez un autre compte Discord.";
  }
  if (normalized.includes("access_denied")) return "L'autorisation Discord a été annulée.";
  if (normalized.includes("manual") && normalized.includes("link")) {
    return "La liaison de comptes Discord n'est pas encore activée côté Nartya.";
  }
  return decoded;
}

/** OAuth Discord : l'URL s'ouvre dans le navigateur système, le retour arrive par deep-link. */
let profileRequest = null;

export const useAuthStore = create((set, get) => ({
  session: null,
  user: null,
  loading: true,
  _avatarRefreshTried: false, // une tentative par session
  _recoveringSession: false, // anti-boucle de la re-synchro depuis le fichier partagé
  _refresherStarted: false,
  _refreshingShared: false,
  _pollStarted: false,
  discordSyncOffer: null,
  discordLinkFeedback: null,
  discordLinkError: null,

  init: async () => {
    // Le profil n'est pas chargé ici : sans jeton encore, la requête partirait non authentifiée.
    const seeded = readPersistedSession();
    set({ session: seeded, loading: false });

    // Avant tout await, pour ne dépendre d'aucun appel réseau.
    supabase.auth.onAuthStateChange((event, newSession) => {
      // Un SIGNED_OUT peut venir d'une course de refresh avec le Hub : on tente le fichier partagé.
      if (!newSession && event === "SIGNED_OUT" && authOwnedByHub()) {
        get().recoverFromSharedSession(get().session?.access_token);
        return;
      }
      // Hors ligne, `INITIAL_SESSION, null` peut venir d'un refresh impossible : on confirme avant de vider.
      if (!newSession && event === "INITIAL_SESSION" && get().session) {
        get().confirmInitialSignedOut();
        return;
      }
      set({ session: newSession, _avatarRefreshTried: false });
      if (newSession) get().loadProfile({ dedupe: true });
      else set({ user: null });
    });

    platform.onAuthCallback((url) => get().handleAuthCallback(url));

    if (platform.session?.onChanged) {
      platform.session.onChanged((value) => get().applyExternalSession(value));
    }

    // Le timer de fond de Supabase est coupé : ce filet ne rafraîchit que si le Hub ne l'a pas fait.
    if (authOwnedByHub()) get().startSharedRefresher();

    // Repli si `fs.watch` manque une notification.
    if (authOwnedByHub()) get().pollSharedSessionUntilConnected();

    // getSession peut revenir null hors ligne : on garde la session amorcée.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session) {
          set({ session });
          if (get().user?.id !== session.user.id) get().loadProfile({ dedupe: true });
        }
      })
      .catch(() => {});
  },

  loadProfile: ({ dedupe = false } = {}) => {
    const userId = get().session?.user?.id;
    if (!userId) return Promise.resolve();
    if (dedupe && profileRequest?.userId === userId) return profileRequest.promise;
    const promise = get()._fetchProfile().finally(() => {
      if (profileRequest?.promise === promise) profileRequest = null;
    });
    profileRequest = { userId, promise };
    return promise;
  },

  _fetchProfile: async () => {
    const { session } = get();
    if (!session?.user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();
    if (error) {
      console.warn("[auth] loadProfile:", error.message);
      return;
    }
    // Profil absent : requête partie avant l'authentification, ou compte supprimé. `getUser()`
    // tranche : 401/403 déconnecte, une erreur réseau ne change rien.
    if (!data) {
      try {
        const { data: u, error: uErr } = await supabase.auth.getUser();
        const status = uErr?.status;
        if ((uErr && (status === 401 || status === 403)) || (!uErr && !u?.user)) {
          console.warn("[auth] compte introuvable côté serveur → déconnexion");
          await get().signOut();
        }
      } catch (_) {
        /* réseau indisponible : ne pas déconnecter */
      }
      return;
    }

    // Seul l'avatar suit les métadonnées de session : le pseudo appartient à l'utilisateur.
    const meta = session.user.user_metadata || {};
    const freshAvatar = meta.avatar_url || meta.picture || null;
    const patch = {};

    // À l'heure près : ce bloc tourne à chaque rafraîchissement de jeton.
    const lastLogin = data.last_login ? new Date(data.last_login).getTime() : 0;
    if (Date.now() - lastLogin > 60 * 60 * 1000) {
      patch.last_login = new Date().toISOString();
    }

    // Lier Discord à un compte e-mail ne vaut pas consentement à importer ses visuels.
    const primaryProvider = session.user.app_metadata?.provider;
    if (primaryProvider === "discord" && freshAvatar && freshAvatar !== data.avatar) {
      patch.avatar = freshAvatar;
    }

    set({ user: { ...data, avatar: patch.avatar ?? data.avatar } });

    // Import dynamique : évite un cycle de modules au démarrage.
    import("@/stores/useAnnouncementsStore")
      .then((m) => m.useAnnouncementsStore.getState().refresh())
      .catch(() => {});

    if (Object.keys(patch).length) {
      supabase
        .from("profiles")
        .update(patch)
        .eq("id", session.user.id)
        .then(() => {});
    }
  },

  /** Quand l'avatar stocké renvoie 404. Une tentative par session. */
  refreshAvatarFromDiscord: async () => {
    if (get()._avatarRefreshTried || !get().session?.user) return;
    set({ _avatarRefreshTried: true });
    try {
      const { data, error } = await postFn("/v1/me/discord");
      if (error || !data?.avatar) return;
      const { user } = get();
      if (user) set({ user: { ...user, avatar: data.avatar } });
    } catch (_) {}
  },

  signInWithDiscord: async () => {
    // Loopback si disponible (fiable sur Linux/ChromeOS), sinon deep-link.
    let redirectTo = OAUTH_REDIRECT;
    try {
      const loopback = await platform.getAuthRedirectUrl();
      if (loopback) redirectTo = loopback;
    } catch (e) {
      console.warn("[auth] getAuthRedirectUrl indisponible, fallback deep-link:", e);
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        scopes: "identify",
      },
    });
    if (error) {
      console.error("[auth] signInWithOAuth:", error.message);
      return { error: readableOAuthError(error.message) };
    }
    if (!data?.url) return { error: "Discord n'a pas renvoyé de page d'autorisation." };
    const opened = await platform.openAuth(data.url);
    if (!opened?.opened) {
      return { error: opened?.error || "Impossible d'ouvrir la page de connexion Discord." };
    }
    return { error: null };
  },

  /** `linkIdentity` conserve l'UUID du compte. */
  linkDiscordIdentity: async () => {
    set({ discordLinkError: null });
    const currentUser = get().session?.user;
    if (!currentUser || currentUser.is_anonymous) {
      return { error: "Cette liaison nécessite un compte e-mail." };
    }
    if (currentUser.identities?.some((identity) => identity.provider === "discord")) {
      return { error: null, alreadyLinked: true };
    }

    let redirectTo = OAUTH_REDIRECT;
    try {
      const loopback = await platform.getAuthRedirectUrl();
      if (loopback) redirectTo = loopback;
    } catch (e) {
      console.warn("[auth] redirect de liaison Discord indisponible, fallback deep-link:", e);
    }

    const { data, error } = await supabase.auth.linkIdentity({
      provider: "discord",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        scopes: "identify",
      },
    });
    if (error) {
      console.error("[auth] linkIdentity Discord:", error.message);
      const message = readableOAuthError(error.message);
      set({ discordLinkError: message });
      return { error: message };
    }
    if (!data?.url) return { error: "Discord n'a pas renvoyé de page d'autorisation." };

    sessionStorage.setItem("nartya-discord-link-pending", "1");
    const opened = await platform.openAuth(data.url);
    if (!opened?.opened) {
      sessionStorage.removeItem("nartya-discord-link-pending");
      const message = opened?.error || "Impossible d'ouvrir la page de connexion Discord.";
      set({ discordLinkError: message });
      return { error: message };
    }
    return { error: null };
  },

  inspectDiscordProfile: async () => {
    try {
      const { data, error } = await postFn("/v1/me/discord", {
        action: "inspect-link",
      });
      if (error || !data) {
        const message =
          "Le compte Discord est lié, mais le service d'import du profil est momentanément indisponible.";
        set({ discordLinkError: message });
        return { error: message };
      }
      const offer = {
        avatar: !!data.hasDiscordAvatar,
        banner: !!data.hasDiscordBanner,
        avatarWillReplace: !!data.avatarWillReplace,
        bannerWillReplace: !!data.bannerWillReplace,
        avatarUrl: data.avatarUrl || null,
        bannerUrl: data.bannerUrl || null,
      };
      if (!offer.avatar && !offer.banner) {
        return { error: "Aucun visuel Discord n'est disponible pour ce compte." };
      }
      set({ discordSyncOffer: offer, discordLinkError: null });
      return { error: null };
    } catch (error) {
      const message = error?.message || "Impossible de charger le profil Discord.";
      set({ discordLinkError: message });
      return { error: message };
    }
  },

  syncDiscordProfile: async ({ avatar = false, banner = false } = {}) => {
    try {
      const { data, error } = await postFn("/v1/me/discord", {
        action: "sync-profile",
        avatar,
        banner,
      });
      if (error || !data) return { error: error?.message || "Synchronisation impossible" };
      set({ discordSyncOffer: null });
      await get().loadProfile();
      return { error: null, imported: data.imported || [] };
    } catch (error) {
      return { error: error?.message || "Synchronisation impossible" };
    }
  },

  dismissDiscordSyncOffer: () => set({ discordSyncOffer: null }),
  clearDiscordLinkFeedback: () => set({ discordLinkFeedback: null }),

  continueAsGuest: async () => {
    // Sans captcha, `signInAnonymously` fabriquerait des comptes en boucle.
    const captchaToken = await getCaptchaToken();
    const { error } = await supabase.auth.signInAnonymously({
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (error) {
      console.error("[auth] signInAnonymously:", error.message);
      return { error: error.message };
    }
    return { error: null };
  },

  signInWithEmail: async (email, password) => {
    const captchaToken = await getCaptchaToken();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (error) return { error: error.message };
    return { error: null };
  },

  /** `needsConfirm` vaut true si l'e-mail doit être confirmé. */
  signUpWithEmail: async (email, password, displayName) => {
    const clean = email.trim();
    const name = (displayName || "").trim() || clean.split("@")[0] || "";
    // Avant le captcha : inutile de faire résoudre un défi pour rejeter le mot de passe.
    // `null` = vérification impossible, on laisse passer.
    const leaks = await countPasswordLeaks(password);
    if (leaks > 0) return { error: "pwned password" };

    const captchaToken = await getCaptchaToken();
    const options = {};
    if (name) options.data = { full_name: name };
    if (captchaToken) options.captchaToken = captchaToken;

    const { data, error } = await supabase.auth.signUp({
      email: clean,
      password,
      options: Object.keys(options).length ? options : undefined,
    });
    if (error) return { error: error.message };
    return { error: null, needsConfirm: !data?.session };
  },

  isGuest: () => classifySession(get().session) === "guest",

  handleAuthCallback: async (callbackUrl) => {
    try {
      const url = new URL(callbackUrl);
      const completingDiscordLink =
        sessionStorage.getItem("nartya-discord-link-pending") === "1";
      const oauthError =
        url.searchParams.get("error_description") ||
        url.searchParams.get("error_code") ||
        url.searchParams.get("error");
      if (oauthError) {
        if (completingDiscordLink) {
          sessionStorage.removeItem("nartya-discord-link-pending");
          const message = readableOAuthError(oauthError);
          set({
            discordLinkFeedback: { type: "error", message },
            discordLinkError: message,
          });
        }
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) return;
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[auth] exchangeCodeForSession:", error.message);
        if (completingDiscordLink) {
          sessionStorage.removeItem("nartya-discord-link-pending");
          const message = readableOAuthError(error.message);
          set({
            discordLinkFeedback: { type: "error", message },
            discordLinkError: message,
          });
        }
        return;
      }

      if (completingDiscordLink) {
        sessionStorage.removeItem("nartya-discord-link-pending");
        const inspection = await get().inspectDiscordProfile();
        if (inspection?.error) {
          set({
            discordLinkFeedback: {
              type: "warning",
              message: inspection.error,
            },
          });
        } else {
          set({ discordLinkFeedback: null, discordLinkError: null });
        }
        get().loadProfile();
      }
    } catch (e) {
      console.error("[auth] callback invalide:", e);
      if (sessionStorage.getItem("nartya-discord-link-pending") === "1") {
        sessionStorage.removeItem("nartya-discord-link-pending");
        set({
          discordLinkFeedback: {
            type: "error",
            message: "Le retour de Discord n'a pas pu être traité.",
          },
          discordLinkError: "Le retour de Discord n'a pas pu être traité. Réessayez depuis les paramètres.",
        });
      }
    }
  },

  signOut: async () => {
    // Libère le créneau d'appareil (best-effort).
    try {
      const { releaseDeviceSlot } = await import("@/api/devices");
      await releaseDeviceSlot();
    } catch (_) {}
    await supabase.auth.signOut();
    set({
      session: null,
      user: null,
      discordLinkError: null,
      discordLinkFeedback: null,
      discordSyncOffer: null,
    });
  },

  /** `raw` : contenu brut du fichier, `null` s'il a été effacé. */
  applyExternalSession: async (raw) => {
    if (!raw) {
      if (!get().session) return;
      try {
        const { releaseDeviceSlot } = await import("@/api/devices");
        await releaseDeviceSlot();
      } catch (_) {}
      // Le Hub a déjà révoqué le refresh token : une déconnexion globale couperait les autres appareils.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      set({ session: null, user: null });
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const s = parsed?.currentSession ?? parsed;
      if (!s?.access_token || !s?.refresh_token) return;
      // Notre propre écriture nous revient par le watcher.
      if (s.access_token === get().session?.access_token) return;
      // Connexion faite dans le Hub : on ramène la fenêtre devant, seulement sur cette transition
      // (le watcher se déclenche aussi à chaque rotation de jeton).
      const wasSignedOut = !get().session;
      const { error } = await supabase.auth.setSession({
        access_token: s.access_token,
        refresh_token: s.refresh_token,
      });
      if (error) {
        console.warn("[auth] session partagée refusée par le serveur:", error.message);
        return;
      }
      if (wasSignedOut) platform.focusWindow();
    } catch (e) {
      console.warn("[auth] session partagée illisible:", e?.message || e);
    }
  },

  /**
   * Vraie déconnexion ou refresh impossible ? Une déconnexion réelle vide le stockage (sur
   * le bureau, le fichier partagé), un échec réseau le laisse intact.
   */
  confirmInitialSignedOut: async () => {
    if (!get().session) return;
    const stored = authOwnedByHub() ? await readSharedSessionFile() : readPersistedSession();
    if (shouldKeepSessionOnInitialSignedOut(stored)) return;
    set({ session: null, user: null });
  },

  /** @param {string|undefined} staleAccessToken jeton qu'on vient de perdre, à ne pas rejouer */
  recoverFromSharedSession: async (staleAccessToken) => {
    const clear = () => set({ session: null, user: null });
    if (get()._recoveringSession) {
      clear();
      return;
    }
    set({ _recoveringSession: true });
    try {
      let fresh = await readSharedSessionFile();
      // Le Hub écrit parfois le jeton frais quelques ms après notre SIGNED_OUT : on relit une fois.
      if (!hasFresherSharedToken(fresh, staleAccessToken)) {
        await new Promise((r) => setTimeout(r, 300));
        fresh = await readSharedSessionFile();
      }
      if (!hasFresherSharedToken(fresh, staleAccessToken)) {
        clear();
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: fresh.access_token,
        refresh_token: fresh.refresh_token,
      });
      if (error) {
        console.warn("[auth] re-synchro session partagée refusée:", error.message);
        clear();
      }
    } catch (e) {
      console.warn("[auth] re-synchro session partagée:", e?.message || e);
      clear();
    } finally {
      set({ _recoveringSession: false });
    }
  },

  /** Indépendant du watcher `fs.watch`, qui peut manquer une notification. */
  pollSharedSessionUntilConnected: () => {
    if (get()._pollStarted) return;
    set({ _pollStarted: true });
    const id = setInterval(async () => {
      if (get().session) {
        clearInterval(id);
        return;
      }
      try {
        const raw = await platform.session?.get?.("nartya-auth");
        if (raw) await get().applyExternalSession(raw);
      } catch (_) {
      }
    }, 3000);
  },

  /** Ne prend le relais que si le Hub ne rafraîchit pas. Tique au timer, au focus et au retour en ligne. */
  startSharedRefresher: () => {
    if (get()._refresherStarted) return;
    set({ _refresherStarted: true });
    const tick = () => get().maybeRefreshSharedSession();
    setInterval(tick, 30_000);
    if (typeof window !== "undefined") {
      window.addEventListener("focus", tick);
      window.addEventListener("online", tick);
    }
  },

  /** Le Hub rafraîchit avec une marge plus large : on ne franchit ce seuil que s'il est absent. */
  maybeRefreshSharedSession: async () => {
    const { session, _recoveringSession, _refreshingShared } = get();
    if (!session?.refresh_token || _recoveringSession || _refreshingShared) return;
    const expiresAt = session.expires_at;
    if (!expiresAt) return;
    const msLeft = expiresAt * 1000 - Date.now();
    if (msLeft > 60_000) return;
    set({ _refreshingShared: true });
    try {
      const fresh = await readSharedSessionFile();
      if (
        fresh &&
        (fresh.expires_at ?? 0) > expiresAt &&
        fresh.access_token !== session.access_token
      ) {
        await supabase.auth.setSession({
          access_token: fresh.access_token,
          refresh_token: fresh.refresh_token,
        });
        return;
      }
      const { error } = await supabase.auth.refreshSession();
      if (error) console.warn("[auth] refresh coordonné refusé:", error.message);
    } catch (e) {
      console.warn("[auth] refresh coordonné:", e?.message || e);
    } finally {
      set({ _refreshingShared: false });
    }
  },
}));
