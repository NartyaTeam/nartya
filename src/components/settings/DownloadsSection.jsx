import { useEffect, useState } from "react";
import { Download, FolderOpen, FolderSearch, Gauge, HardDrive } from "lucide-react";
import { toast } from "@/lib/toast";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { Select } from "@/components/ui/Select";
import { getDownloadsDir, chooseDownloadsDir, openDownloadsDir } from "@/api/downloads";
import { downloadConcurrency } from "@/lib/premium";
import { Section, SettingRow } from "./SettingsLayout";

const QUALITY_OPTIONS = [
  { value: "max", label: "Maximale" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
];

/** Le dossier vit côté main. Le sélecteur et la question « déplacer l'existant ? » sont natifs. */
function DownloadDirRow() {
  const [info, setInfo] = useState(null);
  const [pending, setPending] = useState(false);
  const refreshDownloads = useDownloadsStore((s) => s.refresh);

  useEffect(() => {
    getDownloadsDir().then(setInfo);
  }, []);

  const handleChange = async () => {
    setPending(true);
    try {
      const res = await chooseDownloadsDir();
      if (res.canceled) return;
      if (!res.success) {
        toast.error(res.error || "Changement impossible");
        return;
      }
      setInfo(await getDownloadsDir());
      await refreshDownloads();
      toast.success(
        res.moved ? `Dossier changé — ${res.moved} épisode(s) déplacé(s)` : "Dossier changé"
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-5 border-t border-border/50 py-6 md:grid-cols-[minmax(0,1fr)_minmax(220px,360px)] md:items-center">
      <div className="flex min-w-0 gap-4">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[5px] bg-white/[0.045] text-primary">
          <HardDrive size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">Dossier de téléchargement</p>
          <p className="mt-1.5 text-xs leading-5 text-muted">
            Choisis où conserver les épisodes hors ligne.
          </p>
          <p
            className="mt-3 truncate border-l-2 border-primary/45 bg-black/15 px-3 py-2 font-mono text-[11px] text-muted"
            title={info?.dir || ""}
          >
            {info?.dir || "…"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 md:justify-self-end">
        <button
          type="button"
          onClick={() => openDownloadsDir()}
          disabled={!info}
          className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-white/[0.035] px-3 py-2 text-xs font-medium text-text transition-colors hover:border-white/20 hover:text-primary disabled:opacity-50"
        >
          <FolderOpen size={14} />
          Ouvrir
        </button>
        <button
          type="button"
          onClick={handleChange}
          disabled={pending || !info}
          className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-white/[0.035] px-3 py-2 text-xs font-medium text-text transition-colors hover:border-white/20 hover:text-primary disabled:opacity-50"
        >
          <FolderSearch size={14} />
          Changer…
        </button>
      </div>
    </div>
  );
}

export default function DownloadsSection({ number }) {
  const downloadQuality = useSettingsStore((s) => s.downloadQuality);
  const downloadParallelism = useSettingsStore((s) => s.downloadParallelism);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const user = useAuthStore((s) => s.user);
  const downloadLimit = downloadConcurrency(user);
  const requestedParallelism = Number(downloadParallelism);
  const parallelismExceedsPlan =
    downloadParallelism !== "auto" &&
    Number.isFinite(requestedParallelism) &&
    requestedParallelism > downloadLimit;
  const parallelismValues =
    downloadLimit >= 99 ? [1, 2, 3, 4, 5, 8, 12] : Array.from({ length: downloadLimit }, (_, i) => i + 1);
  const parallelismOptions = [
    {
      value: "auto",
      label: downloadLimit >= 99 ? "Maximum du forfait (illimité)" : `Maximum du forfait (${downloadLimit})`,
    },
    ...(parallelismExceedsPlan
      ? [{
          value: String(downloadParallelism),
          label: `${downloadParallelism} demandé(s) — limité à ${downloadLimit} par le forfait`,
        }]
      : []),
    ...parallelismValues.map((n) => ({ value: String(n), label: String(n) })),
  ];

  return (
    <Section
      id="downloads"
      number={number}
      eyebrow="Hors ligne"
      title="Téléchargements"
      description="Règle la qualité, le nombre de tâches et l'emplacement des épisodes."
    >
      <SettingRow
        icon={Download}
        label="Qualité de téléchargement"
        description="Qualité conservée pour les épisodes téléchargés."
        details="Une qualité plus basse utilise moins d'espace et se lit plus facilement sur les machines modestes."
      >
        <Select
          title="Qualité de téléchargement"
          value={downloadQuality}
          onValueChange={(v) => setSetting("downloadQuality", v)}
          align="end"
          className="min-w-[9rem]"
          options={QUALITY_OPTIONS}
        />
      </SettingRow>

      <SettingRow
        icon={Gauge}
        label="Téléchargements simultanés"
        description="Nombre d'épisodes téléchargés en parallèle."
        details="Une valeur plus basse préserve la connexion pendant la lecture. Le maximum disponible dépend de ton forfait."
      >
        <Select
          title="Téléchargements simultanés"
          value={String(downloadParallelism)}
          onValueChange={(v) => setSetting("downloadParallelism", v)}
          align="end"
          className="min-w-[13rem]"
          options={parallelismOptions}
        />
      </SettingRow>

      <DownloadDirRow />
    </Section>
  );
}
