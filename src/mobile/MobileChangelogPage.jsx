import { useEffect, useState } from "react";
import { Download, Loader2, Sparkles } from "lucide-react";
import { getHomeSections } from "@/api/animeApi";
import ChangelogList from "@/components/changelog/ChangelogList";
import { useCachedResource } from "@/hooks/useCachedResource";
import { useChangelog } from "@/hooks/useChangelog";
import { changelogTargetForPlatform, markChangelogSeen } from "@/lib/changelog";
import { platform } from "@/platform";
import { isPremiumActive } from "@/lib/premium";
import { useAuthStore } from "@/stores/useAuthStore";
import { useUpdatePolicy } from "@/contexts/UpdatePolicyContext";
import { installAppUpdate } from "@/lib/installAppUpdate";
import { toast } from "@/lib/toast";

export default function MobileChangelogPage() {
  const [updateBusy, setUpdateBusy] = useState(false);
  const profile = useAuthStore((state) => state.user);
  const { data: homeData } = useCachedResource(
    "home:sections:v2",
    getHomeSections,
    10 * 60 * 1000,
    { persist: true, persistentMaxAgeMs: 7 * 24 * 60 * 60 * 1000 },
  );
  const { currentVersion, entries } = useChangelog({
    isPremium: isPremiumActive(profile),
  });
  const updatePolicy = useUpdatePolicy();
  const featuredAnime = homeData?.hero?.find(
    (anime) => anime?.fanart || anime?.banner || anime?.cover,
  );
  const headerImage =
    featuredAnime?.fanart || featuredAnime?.banner || featuredAnime?.cover || null;

  // Ouvrir l'historique vaut lecture et retire la pastille du menu « Plus ».
  useEffect(() => {
    if (currentVersion) markChangelogSeen(currentVersion, changelogTargetForPlatform(platform));
  }, [currentVersion]);

  const startUpdate = async () => {
    if (updateBusy) return;
    setUpdateBusy(true);
    try {
      const result = await installAppUpdate(updatePolicy);
      if (result?.permissionRequired) {
        toast.info("Autorise Nartya à installer des APK, puis relance la mise à jour.");
      }
    } catch (error) {
      toast.error(error?.message || "Mise à jour impossible");
    } finally {
      setUpdateBusy(false);
    }
  };

  return (
    <div className="min-h-full animate-fade-in pb-8">
      <header className="relative overflow-hidden border-b border-border/70 bg-bg px-4 pb-6 pt-[calc(env(safe-area-inset-top)+8rem)]">
        {headerImage ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-52 overflow-hidden">
            <img
              src={headerImage}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover object-center opacity-65"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-bg/35 to-bg" />
          </div>
        ) : null}
        <div className="relative">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles size={14} />
            <span className="text-[0.62rem] font-bold uppercase tracking-[0.22em]">
              Journal de bord
            </span>
          </div>
          <h1 className="mt-3 font-display text-[2.15rem] font-black tracking-[-0.035em] text-white">
            Nouveautés
          </h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-white/55">
            Les nouvelles fonctions, améliorations et corrections disponibles sur Android.
          </p>
          <div className="mt-5 inline-flex items-center rounded-md border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/60">
            Version installée&nbsp;: {currentVersion ? `v${currentVersion}` : "—"}
          </div>
        </div>
      </header>

      <main className="px-4 py-5">
        {updatePolicy.status === "outdated" ? (
          <button
            type="button"
            onClick={startUpdate}
            disabled={updateBusy}
            className="mb-4 flex w-full items-center gap-3 rounded-lg border border-primary/25 bg-primary/[0.08] px-4 py-3 text-left active:bg-primary/[0.14]"
          >
            {updateBusy ? (
              <Loader2 size={20} className="shrink-0 animate-spin text-primary" />
            ) : (
              <Download size={20} className="shrink-0 text-primary" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text">Mise à jour disponible</span>
              <span className="block text-xs text-muted">
                {updatePolicy.latest ? `Télécharger la version ${updatePolicy.latest}` : "Télécharger la dernière version"}
              </span>
            </span>
            <span className="text-xs font-bold text-primary">
              {updateBusy ? "Préparation…" : "Installer"}
            </span>
          </button>
        ) : null}
        {entries.length > 0 ? (
          <ChangelogList entries={entries} card />
        ) : (
          <div className="rounded-2xl border border-border bg-surface px-5 py-8 text-center">
            <Sparkles size={24} className="mx-auto text-primary" />
            <p className="mt-3 font-semibold text-text">Aucune nouveauté à afficher</p>
            <p className="mt-1 text-sm text-muted">Le journal sera complété à la prochaine version.</p>
          </div>
        )}
      </main>
    </div>
  );
}
