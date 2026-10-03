import { useRef } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "@/lib/toast";
import { useFavoritesStore } from "@/stores/useFavoritesStore";
import { useListsStore } from "@/stores/useListsStore";
import { exportBackup, importBackup } from "@/api/backup";
import { Section, SettingRow } from "./SettingsLayout";

export default function BackupSection({ number }) {
  const fileRef = useRef(null);

  const handleExport = async () => {
    try {
      const data = await exportBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nartya-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Sauvegarde exportée");
    } catch (_) {
      toast.error("Export impossible");
    }
  };

  // Fusion, puis rechargement des stores concernés.
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // autorise le ré-import du même fichier
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const res = await importBackup(data);
      useFavoritesStore.getState().reset();
      useFavoritesStore.getState().ensureLoaded();
      useListsStore.getState().reset();
      useListsStore.getState().ensureLoaded();
      toast.success(
        `Importé : ${res.lists} liste(s), ${res.favorites} favori(s), ${res.progress} épisode(s)`
      );
    } catch (err) {
      toast.error(err?.message || "Import impossible");
    }
  };

  return (
    <Section
      id="backup"
      number={number}
      eyebrow="Données"
      title="Sauvegarde"
      description="Exporte ou restaure favoris, listes et progression."
    >
      <SettingRow
        icon={Download}
        label="Exporter mes données"
        description="Télécharge une copie de tes favoris, listes et progressions."
        details="La sauvegarde est enregistrée dans un fichier JSON que tu pourras importer plus tard."
      >
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-[5px] border border-border bg-white/[0.035] px-3.5 py-2 text-sm font-medium text-text transition-colors hover:border-white/20 hover:bg-surface-2"
        >
          <Download size={15} />
          Exporter
        </button>
      </SettingRow>

      <SettingRow
        icon={Upload}
        label="Importer une sauvegarde"
        description="Restaure les données d'une sauvegarde Nartya."
        details="L'importation fusionne les favoris, listes et progressions sans effacer les données existantes."
      >
        <button
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-[5px] border border-border bg-white/[0.035] px-3.5 py-2 text-sm font-medium text-text transition-colors hover:border-white/20 hover:bg-surface-2"
        >
          <Upload size={15} />
          Importer
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImport}
          className="hidden"
        />
      </SettingRow>
    </Section>
  );
}
