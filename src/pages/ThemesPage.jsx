import { useCallback, useEffect, useState } from "react";
import { Check, Download, Loader2, Palette, Pencil, Plus, Search, Trash2, Undo2 } from "lucide-react";
import { listThemes, publishTheme, recordThemeInstall, removeTheme, themeErrorMessage } from "@/api/themes";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useHasAccount, guestBlockToast } from "@/lib/guest";
import { toast } from "@/lib/toast";
import SegmentedControl from "@/components/ui/SegmentedControl";
import ThemePreview from "@/components/themes/ThemePreview";
import ThemeEditor from "@/components/themes/ThemeEditor";

const PAGE = 24;

/** Seul le thème lui-même est gardé en local, pas l'auteur ni les compteurs. */
const toStored = ({ v, name, description, colors, grain, id }) => ({ v, name, description, colors, grain, id: id ?? null });
const TABS = [
  { value: "popular", label: "Populaires" },
  { value: "recent", label: "Récents" },
  { value: "mine", label: "Mes thèmes", account: true },
];

export default function ThemesPage() {
  const hasAccount = useHasAccount();
  const activeTheme = useSettingsStore((s) => s.activeTheme);
  const setSetting = useSettingsStore((s) => s.setSetting);

  const [tab, setTab] = useState("popular");
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState("");
  const [items, setItems] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // { initial } | null
  const [publishing, setPublishing] = useState(false);
  const [previous, setPrevious] = useState(null); // thème actif avant un essai, pour l'annuler

  const load = useCallback(
    async (offset = 0) => {
      setLoading(true);
      try {
        const rows = await listThemes({ sort: tab, query: committed, offset, limit: PAGE });
        setItems((cur) => (offset ? [...(cur || []), ...rows] : rows));
        setDone(rows.length < PAGE);
      } catch {
        toast.error("Impossible de charger les thèmes.");
        setItems((cur) => cur || []);
        setDone(true);
      } finally {
        setLoading(false);
      }
    },
    [tab, committed]
  );

  useEffect(() => {
    setItems(null);
    load(0);
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setCommitted(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const install = (theme) => {
    setSetting("activeTheme", toStored(theme));
    setPrevious(null);
    toast.success(`Thème « ${theme.name} » installé`);
    if (theme.id && hasAccount) recordThemeInstall(theme.id).catch(() => {});
  };

  const uninstall = () => {
    setSetting("activeTheme", null);
    setPrevious(null);
  };

  const tryTheme = (theme) => {
    setPrevious((p) => p ?? { theme: activeTheme });
    setSetting("activeTheme", toStored(theme));
    setEditing(null);
    toast.info("Aperçu actif. Reviens ici pour l'annuler ou l'installer.");
  };

  const cancelTry = () => {
    setSetting("activeTheme", previous?.theme ?? null);
    setPrevious(null);
  };

  const publish = async (theme) => {
    if (!hasAccount) return guestBlockToast();
    setPublishing(true);
    try {
      await publishTheme(theme, editing?.initial?.id ?? null);
      toast.success("Thème publié");
      setEditing(null);
      setTab("mine");
      load(0);
    } catch (e) {
      toast.error(themeErrorMessage(e));
    } finally {
      setPublishing(false);
    }
  };

  const remove = async (theme) => {
    if (!window.confirm(`Retirer « ${theme.name} » de la galerie ?`)) return;
    try {
      await removeTheme(theme.id);
      if (activeTheme?.id === theme.id) uninstall();
      setItems((cur) => (cur || []).filter((t) => t.id !== theme.id));
    } catch (e) {
      toast.error(themeErrorMessage(e));
    }
  };

  return (
    <div className="animate-fade-in px-4 pb-24 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-8 md:py-10">
      <header className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-px w-6 bg-primary" />
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-primary/80">Personnalisation</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="t-impact text-4xl md:text-5xl">Thèmes</h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted">
              Change les couleurs de Nartya, crée ton thème et installe ceux de la communauté. Un thème ne change que le
              design : il n'accède jamais à tes données.
            </p>
          </div>
          <button
            onClick={() => setEditing({ initial: activeTheme ? { ...activeTheme, id: null } : null })}
            className="btn-shu px-5 py-2.5 text-sm"
          >
            <Plus size={16} /> Créer un thème
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3 sm:max-w-xs">
            <Search size={16} className="text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un thème"
              aria-label="Rechercher un thème"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          <SegmentedControl
            label="Thèmes à afficher"
            options={TABS.filter((t) => !t.account || hasAccount)}
            value={tab}
            onChange={setTab}
          />
        </div>
      </header>

      {previous && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          <span>Tu essaies un thème : il n'est pas encore installé.</span>
          <span className="flex gap-2">
            <button onClick={cancelTry} className="inline-flex items-center gap-1.5 font-semibold text-muted hover:text-text">
              <Undo2 size={14} /> Annuler
            </button>
            <button
              onClick={() => {
                setPrevious(null);
                toast.success("Thème installé");
              }}
              className="inline-flex items-center gap-1.5 font-semibold text-primary"
            >
              <Check size={14} /> Garder
            </button>
          </span>
        </div>
      )}

      {activeTheme && !previous && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3 text-sm">
          <span>
            Thème actif : <strong>{activeTheme.name}</strong>
          </span>
          <button onClick={uninstall} className="font-semibold text-muted hover:text-text">
            Revenir au thème Nartya
          </button>
        </div>
      )}

      {items === null ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-60 rounded-md" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-[40dvh] flex-col items-center justify-center rounded-md border-2 border-dashed border-border px-7 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Palette size={24} />
          </span>
          <p className="mt-4 max-w-sm text-sm text-muted">
            {committed
              ? `Aucun thème ne correspond à « ${committed} ».`
              : tab === "mine"
                ? "Tu n'as pas encore publié de thème."
                : "Aucun thème publié pour l'instant. Sois le premier !"}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((theme) => {
              const isActive = activeTheme?.id === theme.id && !previous;
              const mine = tab === "mine";
              return (
                <article key={theme.id} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
                  <ThemePreview colors={theme.colors} />
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-base font-bold">{theme.name}</h2>
                    <p className="truncate text-xs text-muted">
                      par {theme.author.username || theme.author.handle || "un membre"} · {theme.installs} installation
                      {theme.installs > 1 ? "s" : ""}
                    </p>
                    {theme.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{theme.description}</p>}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {isActive ? (
                      <button onClick={uninstall} className="btn-ghost flex-1 px-3 py-2 text-xs">
                        <Check size={14} /> Installé
                      </button>
                    ) : (
                      <button onClick={() => install(theme)} className="btn-shu flex-1 px-3 py-2 text-xs">
                        <Download size={14} /> Installer
                      </button>
                    )}
                    <button onClick={() => tryTheme(theme)} className="btn-ghost px-3 py-2 text-xs">
                      Essayer
                    </button>
                    {mine && (
                      <>
                        <button
                          onClick={() => setEditing({ initial: theme })}
                          aria-label="Modifier"
                          className="btn-ghost px-3 py-2 text-xs"
                        >
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => remove(theme)} aria-label="Retirer" className="btn-danger px-3 py-2 text-xs">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {!done && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => load(items.length)}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-md bg-white/[0.06] px-5 py-2.5 text-sm font-medium ring-1 ring-border hover:bg-white/[0.1] disabled:opacity-50"
              >
                {loading && <Loader2 size={14} className="animate-spin" />} Voir plus
              </button>
            </div>
          )}
        </>
      )}

      {editing && (
        <ThemeEditor
          initial={editing.initial}
          canPublish={hasAccount}
          busy={publishing}
          onTry={tryTheme}
          onPublish={publish}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
