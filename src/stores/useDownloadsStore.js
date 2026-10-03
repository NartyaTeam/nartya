import { create } from "zustand";
import {
  listDownloads,
  onDownloadProgress,
  startDownload as apiStart,
  cancelDownload as apiCancel,
  cancelSeasonDownloads as apiCancelSeason,
  removeDownload as apiRemove,
  getLocalPlaybackUrl,
  downloadsAvailable,
} from "@/api/downloads";
import { getSeasonEpisodes } from "@/api/animeApi";
import { resolveDownloadSource } from "@/utils/episodeDownload";
import { buildRecoveryPayload, findDownloadEpisode } from "@/utils/downloadRecovery";

const recoveryTasks = new Map();
const canceledRecoveries = new Set();

/** Un chapitre de scan n'a pas de vignette. */
async function withLocalCovers(items) {
  return Promise.all(
    items.map(async (it) => {
      if ((it.coverFile && !it.coverLocal) || (it.thumbFile && !it.thumbLocal)) {
        const [coverLocal, thumbLocal] = await Promise.all([
          it.coverFile ? getLocalPlaybackUrl(it.id, "cover.jpg") : null,
          it.thumbFile ? getLocalPlaybackUrl(it.id, "thumb.jpg") : null,
        ]);
        return { ...it, coverLocal: coverLocal || it.coverLocal, thumbLocal: thumbLocal || it.thumbLocal };
      }
      return it;
    })
  );
}

export const useDownloadsStore = create((set, get) => ({
  items: [],
  byId: {},
  loaded: false,
  _loading: false,
  _subscribed: false,
  _resuming: false,

  init: async () => {
    if (get().loaded || get()._loading) return;
    set({ _loading: true });
    if (!downloadsAvailable()) {
      set({ loaded: true, _loading: false });
      return;
    }
    const items = await withLocalCovers(await listDownloads());
    set({ items, byId: index(items), loaded: true, _loading: false });

    if (!get()._subscribed) {
      onDownloadProgress((item) => {
        const items = get().items.slice();
        const i = items.findIndex((it) => it.id === item.id);
        const previous = i === -1 ? null : items[i];
        const merged = i === -1 ? item : { ...items[i], ...item };
        if (i === -1) items.push(merged);
        else items[i] = merged;
        set({ items, byId: { ...get().byId, [item.id]: merged } });
        // L'hébergeur a lâché en route : on repart sur une autre source, comme le lecteur.
        if (hostJustFailed(previous, merged)) {
          setTimeout(() => get().retry(merged, { automatic: true }), 0);
        }
      });
      set({ _subscribed: true });
    }
  },

  refresh: async () => {
    const items = await withLocalCovers(await listDownloads());
    set({ items, byId: index(items) });
  },

  start: async (payload) => {
    const res = await apiStart(payload);
    await get().refresh();
    return res;
  },

  /**
   * L'URL vidéo n'est jamais persistée : on reprend avec un jeton frais. Une reprise manuelle
   * réessaie les hébergeurs déjà en échec s'il n'en reste aucun autre.
   */
  retry: async (item, { automatic = false } = {}) => {
    if (!item?.id || !item.slug) {
      return { success: false, error: "Téléchargement incomplet" };
    }
    // Les pages d'un scan ont une URL stable : les pages déjà présentes sont sautées.
    if (item.type === "scan") {
      updateItem(set, get, item.id, { status: "resolving", percent: 0, error: null });
      const result = await apiStart(item);
      if (!result?.success) {
        updateItem(set, get, item.id, { status: "interrupted", error: result?.error || "Reprise impossible" });
        return { success: false, error: result?.error || "Reprise impossible" };
      }
      await get().refresh();
      return result;
    }
    if (item.seasonId == null) {
      return { success: false, error: "Téléchargement incomplet" };
    }
    if (recoveryTasks.has(item.id)) return recoveryTasks.get(item.id);
    canceledRecoveries.delete(item.id);
    const task = (async () => {
      updateItem(set, get, item.id, { status: "resolving", percent: 0, error: null });
      try {
        const data = await getSeasonEpisodes(item.slug, item.seasonId);
        if (canceledRecoveries.has(item.id)) throw new Error("Téléchargement annulé");
        const episodes = data?.episodes || [];
        const episode = findDownloadEpisode(episodes, item.ep);
        if (!episode) throw new Error("Épisode introuvable pour la reprise");

        const source = await resolveDownloadSource(
          episode,
          item.lang,
          item.sourcePreference || "auto",
          {
            shouldAbort: () => canceledRecoveries.has(item.id),
            excludeSources: item.failedProviders || [],
            lastResort: !automatic,
          },
        );
        if (!source.success || !source.handle) {
          throw new Error(source.error || "Source indisponible pour la reprise");
        }

        if (canceledRecoveries.has(item.id)) throw new Error("Téléchargement annulé");
        const result = await apiStart(buildRecoveryPayload(item, source.handle));
        if (canceledRecoveries.has(item.id)) {
          await apiCancel(item.id);
          return { success: false, error: "Téléchargement annulé" };
        }
        if (!result?.success) throw new Error(result?.error || "Reprise impossible");
        await get().refresh();
        return result;
      } catch (error) {
        const message = error?.message || "Reprise impossible";
        if (!canceledRecoveries.has(item.id)) {
          updateItem(set, get, item.id, { status: "interrupted", error: message });
        }
        return { success: false, error: message };
      }
    })();
    recoveryTasks.set(item.id, task);
    try {
      return await task;
    } finally {
      recoveryTasks.delete(item.id);
    }
  },

  /** Séquentielle, pour respecter le quota de résolution de l'API. */
  resumeInterrupted: async () => {
    if (get()._resuming) return;
    const interrupted = get().items.filter((item) => item.status === "interrupted");
    if (!interrupted.length) return;
    set({ _resuming: true });
    try {
      for (const item of interrupted) await get().retry(item);
    } finally {
      set({ _resuming: false });
    }
  },

  cancel: async (id) => {
    // Retrait optimiste : l'annulation est asynchrone côté main.
    canceledRecoveries.add(id);
    const items = get().items.filter((it) => it.id !== id);
    set({ items, byId: index(items) });
    await apiCancel(id);
    const recovery = recoveryTasks.get(id);
    if (recovery) {
      await recovery.catch(() => {});
      await apiCancel(id);
    }
    canceledRecoveries.delete(id);
  },

  cancelSeason: async ({ slug, seasonId, lang }) => {
    const prefix = `${slug}::${seasonId}::`;
    const items = get().items.filter((it) => {
      if (!it.id.startsWith(prefix)) return true;
      if (lang && !it.id.endsWith(`::${lang}`)) return true;
      return it.status !== "queued" && it.status !== "downloading";
    });
    set({ items, byId: index(items) });
    const res = await apiCancelSeason({ slug, seasonId, lang });
    // Le main peut avoir annulé des entrées d'une session précédente.
    await get().refresh();
    return res;
  },

  cancelOeuvre: async ({ slug, oeuvre }) => {
    const prefix = `scan::${slug}::${oeuvre}::`;
    const items = get().items.filter((it) => {
      if (!it.id.startsWith(prefix)) return true;
      return it.status !== "queued" && it.status !== "downloading";
    });
    set({ items, byId: index(items) });
    const res = await apiCancelSeason({ slug, oeuvre, type: "scan" });
    await get().refresh();
    return res;
  },

  remove: async (id) => {
    await apiRemove(id);
    await get().refresh();
  },

  /** Pas de retrait optimiste : l'appelant ne passe que des entrées inactives. */
  removeMany: async (ids) => {
    if (!ids?.length) return;
    await Promise.all(ids.map((id) => apiRemove(id)));
    await get().refresh();
  },
}));

/**
 * Le main n'ajoute l'hébergeur à `failedProviders` que s'il est en cause (pas pour une erreur
 * disque) : chaque repli en écarte un, la boucle s'arrête faute de source.
 */
function hostJustFailed(previous, next) {
  return (
    next.status === "error" &&
    next.type !== "scan" &&
    (next.failedProviders?.length || 0) > (previous?.failedProviders?.length || 0)
  );
}

function updateItem(set, get, id, patch) {
  const items = get().items.slice();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return;
  const next = { ...items[index], ...patch };
  items[index] = next;
  set({ items, byId: { ...get().byId, [id]: next } });
}

function index(items) {
  const m = {};
  for (const it of items) m[it.id] = it;
  return m;
}
