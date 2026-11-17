import { useMemo, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import {
  THEME_COLORS,
  THEME_DESCRIPTION_MAX,
  THEME_NAME_MAX,
  THEME_VERSION,
  DEFAULT_THEME_COLORS,
  contrastIssues,
  validateTheme,
} from "@/lib/themeFormat";
import ThemePreview from "./ThemePreview";
import { Toggle } from "@/components/settings/SettingsLayout";

/** Création d'un thème : couleurs avec aperçu en direct, lisibilité vérifiée avant l'essai ou la publication. */
export default function ThemeEditor({ initial, canPublish, busy, onTry, onPublish, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [colors, setColors] = useState({ ...DEFAULT_THEME_COLORS, ...(initial?.colors || {}) });
  const [grain, setGrain] = useState(initial?.grain !== false);
  const [importError, setImportError] = useState(null);

  const draft = { v: THEME_VERSION, name, description, colors, grain };
  const issues = useMemo(() => contrastIssues(colors), [colors]);
  const checked = validateTheme(draft);

  const importJson = async (file) => {
    setImportError(null);
    try {
      if (file.size > 8192) throw new Error("fichier trop gros");
      const parsed = validateTheme(JSON.parse(await file.text()));
      if (!parsed.ok) throw new Error(parsed.error);
      setName(parsed.theme.name);
      setDescription(parsed.theme.description);
      setColors(parsed.theme.colors);
      setGrain(parsed.theme.grain);
    } catch (e) {
      setImportError(e?.message === "fichier trop gros" ? "Fichier trop gros." : e?.message || "Fichier de thème invalide.");
    }
  };

  const exportJson = () => {
    if (!checked.ok) return;
    const blob = new Blob([JSON.stringify(checked.theme, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${checked.theme.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "theme"}.nartya-theme.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Créer un thème">
      <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-xl bg-surface ring-1 ring-border sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="font-display text-lg font-bold">{initial?.id ? "Modifier le thème" : "Créer un thème"}</h2>
          <button onClick={onClose} aria-label="Fermer" className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="grid flex-1 gap-6 overflow-y-auto p-5 md:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold text-muted">Nom</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={THEME_NAME_MAX}
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted">Description (facultative)</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={THEME_DESCRIPTION_MAX}
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              {THEME_COLORS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 rounded-md border border-border bg-bg/40 p-2">
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded" style={{ backgroundColor: colors[key] }}>
                    <input
                      type="color"
                      value={colors[key]}
                      onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label={label}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{label}</span>
                    <span className="block font-mono text-[0.7rem] uppercase text-muted">{colors[key]}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-md border border-border bg-bg/40 px-3 py-2.5">
              <span className="text-sm">Grain de pellicule</span>
              <Toggle label="Grain de pellicule" checked={grain} onChange={setGrain} />
            </div>
          </div>

          <div className="space-y-4">
            <ThemePreview colors={colors} />
            {issues.length > 0 && (
              <ul className="space-y-1 rounded-md bg-amber-500/10 p-3 text-xs text-amber-200">
                {issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
            {!checked.ok && issues.length === 0 && <p className="text-xs text-amber-200">{checked.error}</p>}
            {importError && <p className="text-xs text-red-300">{importError}</p>}
            <div className="flex gap-2">
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold text-muted hover:text-text">
                <Upload size={14} /> Importer
                <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
              </label>
              <button onClick={exportJson} disabled={!checked.ok} className="flex-1 rounded-md border border-border px-3 py-2 text-xs font-semibold text-muted hover:text-text disabled:opacity-40">
                Exporter
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-border px-5 py-3.5">
          <button onClick={() => checked.ok && onTry(checked.theme)} disabled={!checked.ok} className="btn-ghost px-5 py-2 text-sm disabled:opacity-40">
            Essayer
          </button>
          <button
            onClick={() => checked.ok && onPublish(checked.theme)}
            disabled={!checked.ok || busy || !canPublish}
            title={canPublish ? undefined : "Crée un compte pour publier"}
            className="btn-shu px-5 py-2 text-sm disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : initial?.id ? "Mettre à jour" : "Publier"}
          </button>
        </div>
      </div>
    </div>
  );
}
