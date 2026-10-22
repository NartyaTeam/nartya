import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CloudDownload,
  CloudUpload,
  ExternalLink,
  Gauge,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  Star,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { platform } from "@/platform";
import { useAuthStore } from "@/stores/useAuthStore";
import { Select } from "@/components/ui/Select";
import ConfirmModal from "@/components/ui/ConfirmModal";
import {
  DEFAULT_TRACKER_PREFS,
  TRACKERS,
  exportToTrackers,
  getTrackerAvailability,
  getTrackerPrefs,
  importTrackerList,
  listTrackerAccounts,
  saveTrackerPrefs,
  startTrackerLink,
  unlinkTracker,
} from "@/api/trackers";
import { Section, SettingRow, Toggle } from "./SettingsLayout";

const BUTTON =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[5px] border border-border bg-white/[0.035] px-3.5 py-2 text-sm font-medium leading-5 text-text transition-colors hover:border-white/20 hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-50";
const PRIMARY_BUTTON =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[5px] border border-primary bg-primary px-3.5 py-2 text-sm font-semibold leading-5 text-primary-fg transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50";

const THRESHOLD_OPTIONS = [50, 60, 70, 75, 80, 85, 90, 95, 100].map((n) => ({ value: String(n), label: `${n} %` }));

// Le service ne s'affiche pas en marque déposée : une pastille aux initiales suffit.
const BADGES = { anilist: "AL", mal: "MAL" };

// Délais tenus par le serveur entre deux exports et entre deux imports.
const COOLDOWN_MS = 10 * 60_000;

/** Minutes avant de pouvoir relancer, 0 si c'est déjà possible. */
function minutesLeft(iso, now) {
  const wait = (Date.parse(iso || "") || 0) + COOLDOWN_MS - now;
  return wait > 0 ? Math.ceil(wait / 60_000) : 0;
}

function sinceLabel(iso) {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

function accountDescription(account, available) {
  if (!available && !account) return "Pas encore disponible sur Nartya.";
  if (!account) return "Pas lié. Ce que tu regardes sur Nartya y sera reporté automatiquement.";
  if (account.needs_relink) return "La connexion a expiré : relie ton compte pour reprendre la synchro.";
  const parts = [`Connecté en tant que ${account.username}`];
  if (account.pending > 0) parts.push(`${account.pending} envoi${account.pending > 1 ? "s" : ""} en attente`);
  else if (account.last_synced_at) parts.push(`dernier envoi ${sinceLabel(account.last_synced_at)}`);
  return `${parts.join(" · ")}.`;
}

function importLabel(state) {
  if (!state) return null;
  if (state.status === "running") return "Import en cours…";
  if (state.status === "failed") return "L'import a échoué. Réessaie dans quelques minutes.";
  const counts = [
    [state.lists, "œuvre", "œuvres"],
    [state.episodes, "épisode vu", "épisodes vus"],
    [state.chapters, "manga en cours de lecture", "mangas en cours de lecture"],
    [state.ratings, "note", "notes"],
  ]
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n > 1 ? many : one}`);
  return counts.length ? `Import terminé : ${counts.join(", ")}.` : "Import terminé : tout était déjà sur Nartya.";
}

function ProviderBadge({ id }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/[0.08] text-[0.6rem] font-black tracking-wide text-primary md:rounded-[5px] md:bg-white/[0.045]">
      {BADGES[id]}
    </span>
  );
}

function ProviderRow({ provider, account, available, busy, onLink, onUnlink }) {
  const linked = !!account && !account.needs_relink;
  return (
    <div className="grid gap-3 border-t border-border/45 py-4 first:border-t-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-5 md:py-6">
      <div className="flex min-w-0 gap-3 md:gap-4">
        {account?.avatar_url ? (
          <img src={account.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover md:rounded-[5px]" />
        ) : (
          <ProviderBadge id={provider.id} />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text">{provider.label}</p>
            {account?.needs_relink && <TriangleAlert size={14} className="text-amber-400" />}
          </div>
          <p className="mt-1 text-[0.7rem] leading-[1.15rem] text-muted md:mt-1.5 md:text-xs md:leading-5">
            {accountDescription(account, available)}
          </p>
          {account?.last_error && !account.needs_relink && (
            <p className="mt-1 text-[0.7rem] leading-[1.15rem] text-amber-400/90 md:text-xs">{account.last_error}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-12 md:justify-end md:pl-0">
        {linked && account.profile_url && (
          <button type="button" onClick={() => platform.openExternal(account.profile_url)} className={BUTTON}>
            <ExternalLink size={14} />
            Profil
          </button>
        )}
        {account && (
          <button type="button" disabled={busy} onClick={onUnlink} className={BUTTON}>
            Délier
          </button>
        )}
        {(!account || account.needs_relink) && (
          <button type="button" disabled={!available || busy} onClick={onLink} className={PRIMARY_BUTTON}>
            {busy && <LoaderCircle size={15} className="animate-spin" />}
            {account ? "Relier" : "Lier"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function TrackersSection({ number }) {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const [available, setAvailable] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [prefs, setPrefs] = useState(DEFAULT_TRACKER_PREFS);
  const [busy, setBusy] = useState(null);
  const [confirmUnlink, setConfirmUnlink] = useState(null);
  const awaitingLink = useRef(false);
  const [now, setNow] = useState(() => Date.now());

  // Fait avancer les « dans X min » des boutons.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await listTrackerAccounts();
      setAccounts(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    getTrackerAvailability().then(setAvailable);
    refresh();
    getTrackerPrefs().then(setPrefs).catch(() => {});
  }, [refresh]);

  // La liaison se termine dans le navigateur : au retour dans l'app, on relit les comptes.
  useEffect(() => {
    const onFocus = async () => {
      const next = await refresh();
      if (awaitingLink.current && next?.some((a) => !a.needs_relink)) {
        awaitingLink.current = false;
        setBusy(null);
      }
    };
    const onVisibility = () => document.visibilityState === "visible" && onFocus();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  // Pendant un import ou des envois en attente, l'état avance sans action de l'utilisateur.
  const working = accounts.some((a) => a.import_state?.status === "running" || a.pending > 0);
  useEffect(() => {
    if (!working) return;
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [working, refresh]);

  const exportWait = minutesLeft(prefs.last_export_at, now);
  const accountOf = (id) => accounts.find((a) => a.provider === id) || null;
  const linkedAccounts = accounts.filter((a) => !a.needs_relink);

  const link = async (provider) => {
    setBusy(provider.id);
    try {
      awaitingLink.current = true;
      await startTrackerLink(provider.id);
      toast.info(`Autorise Nartya sur ${provider.label}, puis reviens ici.`);
    } catch (e) {
      awaitingLink.current = false;
      toast.error(e.message);
    } finally {
      // Le bouton se libère tout de suite : l'utilisateur peut avoir fermé l'onglet.
      setTimeout(() => setBusy((b) => (b === provider.id ? null : b)), 4000);
    }
  };

  const unlink = async (provider) => {
    setConfirmUnlink(null);
    setBusy(provider.id);
    try {
      await unlinkTracker(provider.id);
      await refresh();
      toast.success(`${provider.label} est délié.`);
    } catch (e) {
      toast.error(e.message || "Impossible de délier le compte.");
    } finally {
      setBusy(null);
    }
  };

  const setPref = async (key, value) => {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    try {
      await saveTrackerPrefs(userId, { [key]: value });
    } catch {
      setPrefs(previous);
      toast.error("Réglage non enregistré, réessaie.");
    }
  };

  const runImport = async (provider) => {
    setBusy(`import:${provider.id}`);
    try {
      await importTrackerList(provider.id);
      await refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const runExport = async () => {
    setBusy("export");
    try {
      const queued = await exportToTrackers();
      setPrefs((p) => ({ ...p, last_export_at: new Date().toISOString() }));
      setNow(Date.now());
      await refresh();
      toast.success(queued ? "Ta liste Nartya part vers tes comptes liés." : "Rien à envoyer pour l'instant.");
    } catch (e) {
      if (e?.message === "tracker_export_cooldown") {
        const wait = Number(e.details) || COOLDOWN_MS / 1000;
        setPrefs((p) => ({ ...p, last_export_at: new Date(Date.now() + wait * 1000 - COOLDOWN_MS).toISOString() }));
        toast.info(`Tu pourras renvoyer ta liste dans ${Math.max(1, Math.ceil(wait / 60))} min.`);
      } else {
        toast.error(e.message || "Envoi impossible.");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      id="trackers"
      number={number}
      eyebrow="Suivi externe"
      title="AniList & MyAnimeList"
      description="Lie tes comptes : les épisodes que tu regardes, tes statuts, tes notes et tes chapitres lus y sont reportés tout seuls."
    >
      {TRACKERS.map((provider) => (
        <ProviderRow
          key={provider.id}
          provider={provider}
          account={accountOf(provider.id)}
          available={!!available[provider.id]}
          busy={busy === provider.id}
          onLink={() => link(provider)}
          onUnlink={() => setConfirmUnlink(provider)}
        />
      ))}

      {linkedAccounts.length > 0 && (
        <>
          <SettingRow
            icon={RefreshCw}
            label="Synchronisation automatique"
            description="Désactivée, plus rien n'est envoyé. Tes comptes restent liés."
            inlineControl
          >
            <Toggle checked={prefs.auto_sync} onChange={(v) => setPref("auto_sync", v)} label="Synchronisation automatique" />
          </SettingRow>

          {prefs.auto_sync && (
            <>
              <SettingRow
                icon={Gauge}
                label="Épisode compté comme vu à partir de"
                description="La part de l'épisode à regarder avant qu'il parte comme vu."
                details="Un épisode marqué comme vu à la main part aussi, quel que soit ce réglage. Les génériques de fin ne sont pas détectés de façon fiable sur tous les animes : le pourcentage l'est."
              >
                <Select
                  title="Seuil"
                  value={String(prefs.threshold)}
                  onValueChange={(v) => setPref("threshold", Number(v))}
                  align="end"
                  className="min-w-[7rem]"
                  options={THRESHOLD_OPTIONS}
                />
              </SettingRow>
              <SettingRow
                icon={ListChecks}
                label="Statuts de liste"
                description="En cours, À voir, Terminé et Abandonné."
                inlineControl
              >
                <Toggle checked={prefs.sync_lists} onChange={(v) => setPref("sync_lists", v)} label="Statuts de liste" />
              </SettingRow>
              <SettingRow
                icon={Star}
                label="Notes"
                description="Ta note sur 5 devient une note sur 100 sur AniList et sur 10 sur MyAnimeList."
                inlineControl
              >
                <Toggle checked={prefs.sync_ratings} onChange={(v) => setPref("sync_ratings", v)} label="Notes" />
              </SettingRow>
              <SettingRow
                icon={BookOpen}
                label="Mangas"
                description="Les chapitres de scans que tu lis, et les mangas de tes listes."
                inlineControl
              >
                <Toggle checked={prefs.sync_manga} onChange={(v) => setPref("sync_manga", v)} label="Mangas" />
              </SettingRow>
            </>
          )}

          {linkedAccounts.map((account) => {
            const provider = TRACKERS.find((p) => p.id === account.provider);
            const running = account.import_state?.status === "running";
            const importWait = running ? 0 : minutesLeft(account.import_state?.at, now);
            return (
              <SettingRow
                key={`import-${account.provider}`}
                icon={CloudDownload}
                label={`Importer depuis ${provider.label}`}
                description={
                  importLabel(account.import_state) ||
                  "Ajoute à Nartya ta liste, tes épisodes vus, tes chapitres lus et tes notes. Rien de ce que tu as déjà n'est remplacé, et ton classement ne compte toujours que ce que tu regardes sur Nartya."
                }
              >
                <button
                  type="button"
                  disabled={running || importWait > 0 || busy === `import:${account.provider}`}
                  onClick={() => runImport(provider)}
                  className={BUTTON}
                >
                  {(running || busy === `import:${account.provider}`) && <LoaderCircle size={15} className="animate-spin" />}
                  {importWait > 0 ? `Dans ${importWait} min` : "Importer"}
                </button>
              </SettingRow>
            );
          })}

          <SettingRow
            icon={CloudUpload}
            label="Envoyer ma liste Nartya"
            description="Reporte tout ce que tu as déjà sur Nartya : épisodes vus, statuts, notes et chapitres. Utile juste après avoir lié un compte. Une fois toutes les 10 minutes."
          >
            <button type="button" disabled={busy === "export" || exportWait > 0} onClick={runExport} className={BUTTON}>
              {busy === "export" && <LoaderCircle size={15} className="animate-spin" />}
              {exportWait > 0 ? `Dans ${exportWait} min` : "Envoyer"}
            </button>
          </SettingRow>
        </>
      )}

      {confirmUnlink && (
        <ConfirmModal
          eyebrow="Suivi externe"
          title={`Délier ${confirmUnlink.label} ?`}
          confirmLabel="Délier"
          onConfirm={() => unlink(confirmUnlink)}
          onClose={() => setConfirmUnlink(null)}
        >
          Plus rien ne sera envoyé sur ce compte. Ce qui y est déjà reste en place, et ta liste Nartya ne change pas.
        </ConfirmModal>
      )}
    </Section>
  );
}
