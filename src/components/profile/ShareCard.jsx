import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "@/lib/toast";
import { resolveAvatar } from "@/api/profile";
import { ITEMS } from "@/lib/cosmetics";
import { renderShareCard } from "@/lib/renderShareCard";

/** Le même canvas sert d'aperçu et d'export PNG. */
export default function ShareCard({ profile, stats, extra, kanji, posters, banner, accent, cosmetics }) {
  const canvasRef = useRef(null);
  const [rendered, setRendered] = useState(null);
  const [saving, setSaving] = useState(false);
  const frame = ITEMS.ornament[cosmetics?.ornament];
  // Dépendance par valeur : les rendus du parent ne relancent pas les chargements.
  const scene = JSON.stringify({
    username: profile?.username || "Utilisateur", handle: profile?.handle || "",
    avatar: resolveAvatar(profile), banner, accent, kanji,
    frame: frame?.asset, frameScale: frame?.frameScale,
    overlay: ITEMS.banner[cosmetics?.banner]?.asset,
    posters: (posters || []).slice(0, 4),
    hours: stats ? Math.floor((stats.totalWatchSeconds || 0) / 3600) : null,
    episodes: stats?.totalEpisodes ?? null, animes: stats?.totalAnimes ?? null,
    rank: extra?.rank || null,
  });
  useEffect(() => {
    let cancelled = false;
    setRendered(null);
    renderShareCard(JSON.parse(scene)).then(({ canvas, missingImages }) => {
      if (cancelled || !canvasRef.current) return;
      canvasRef.current.getContext("2d").drawImage(canvas, 0, 0);
      setRendered({ scene, missingImages });
    }).catch(() => {
      if (!cancelled) setRendered({ scene, error: true });
    });
    return () => { cancelled = true; };
  }, [scene]);
  const ready = rendered?.scene === scene && !rendered.error;
  const download = async () => {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const blob = await new Promise((resolve, reject) => {
        canvasRef.current.toBlob((value) => value ? resolve(value) : reject(new Error("PNG vide")), "image/png");
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nartya-${(profile?.handle || "profil").replace(/[^a-z0-9_-]/gi, "-")}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("Impossible de télécharger la carte. Réessaie dans un instant.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="mt-6 rounded-md bg-surface ring-2 ring-border">
      <div className="flex items-center gap-2 border-b border-border/90 px-4 py-3">
        <h3 className="section-title !text-xl">Ma carte Nartya</h3>
      </div>
      <div className="p-4">
        <div className="relative overflow-hidden rounded-xl bg-bg" style={{ aspectRatio: "4 / 5" }} aria-busy={!rendered}>
          <canvas ref={canvasRef} width={1080} height={1350} role="img"
            aria-label={`Carte de ${profile?.username || "profil"} : ${stats ? Math.floor((stats.totalWatchSeconds || 0) / 3600) + " heures, " + (stats.totalEpisodes ?? 0) + " épisodes, " + (stats.totalAnimes ?? 0) + " animes" : "statistiques en cours de chargement"}`}
            className={`block h-auto w-full ${ready ? "opacity-100" : "opacity-0"}`} />
          {!ready && <p role="status" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
            {rendered?.error ? "La carte n’a pas pu être générée." : "Préparation de ta carte…"}
          </p>}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">Ton profil, tes couleurs, tes animes. PNG en 1080 × 1350, prêt à partager.</p>
        {ready && rendered.missingImages > 0 && <p role="status" className="mt-2 text-xs text-muted">Certaines images sont indisponibles. L’image téléchargée sera identique à cet aperçu.</p>}
        <button type="button" onClick={download} disabled={!ready || saving}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3.5 text-[13px] font-bold text-bg transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50">
          <Download size={15} />{saving ? "Téléchargement…" : "Télécharger ma carte"}
        </button>
      </div>
    </section>
  );
}
