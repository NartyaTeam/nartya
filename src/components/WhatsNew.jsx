import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { History, X } from "lucide-react";
import { Fox } from "@/components/brand/NartyaMark";
import ChangelogList from "@/components/changelog/ChangelogList";
import ReleaseNotes from "@/components/changelog/ReleaseNotes";
import GithubIcon from "@/components/icons/GithubIcon";
import { GITHUB_URL } from "@/config/instance";
import { useAuthStore } from "@/stores/useAuthStore";
import { platform } from "@/platform";
import { isPremiumActive } from "@/lib/premium";
import {
  changelogTargetForPlatform,
  getChangelog,
  markChangelogSeen,
  readLastSeenChangelogVersion,
} from "@/lib/changelog";
import { compareVersions } from "@/lib/semver";

/**
 * Version installée comparée à la dernière vue (localStorage). Sur Android, une installation
 * neuve pose la référence sans popup.
 */

// Pour que « Découvre le Hub » n'ouvre pas sa modale par-dessus.
const WHATSNEW_DONE_EVENT = "nartya:whatsnew-done";
const signalDone = () => window.dispatchEvent(new Event(WHATSNEW_DONE_EVENT));

export default function WhatsNew() {
  const session = useAuthStore((s) => s.session);
  // Sans profil, un compte premium serait pris pour un gratuit et l'annonce exclusive marquée vue.
  const profile = useAuthStore((s) => s.user);
  const isPremium = isPremiumActive(profile);
  const isMobile = platform.isMobile;
  const target = changelogTargetForPlatform(platform);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [version, setVersion] = useState(null);
  const [showOlder, setShowOlder] = useState(false);

  useEffect(() => {
    if (!session || !profile) return;
    let cancelled = false;

    (async () => {
      let current;
      try {
        current = await platform.getVersion();
      } catch {
        return;
      }
      if (cancelled || !current) return;

      const lastSeen = readLastSeenChangelogVersion(target);

      // Les lignes `premiumOnly` sont retirées avant de décider s'il y a quelque chose à montrer.
      const relevant = getChangelog({
        target,
        currentVersion: current,
        isPremium,
      });

      let fresh;
      if (!lastSeen) {
        if (isMobile) {
          // Première version mobile dotée du journal : référence posée sans popup.
          markChangelogSeen(current, target);
          return signalDone();
        }
        // Sans marqueur : les nouveautés récentes, 6 au plus.
        fresh = relevant.slice(0, 6);
      } else {
        if (compareVersions(current, lastSeen) <= 0) return signalDone();
        fresh = relevant.filter((e) => compareVersions(e.version, lastSeen) > 0);
      }

      // Rien à montrer : on avance le marqueur.
      if (fresh.length === 0) {
        markChangelogSeen(current, target);
        return signalDone();
      }

      setEntries(fresh);
      setVersion(current);
      setOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [session, profile, isPremium, isMobile, target]);

  // Seulement à la fermeture.
  const handleOpenChange = (next) => {
    setOpen(next);
    if (!next) {
      if (version) markChangelogSeen(version, target);
      signalDone();
    }
  };

  if (!open) return null;

  const [latest, ...older] = entries;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm animate-in fade-in-0" />
        <Dialog.Content
          className={
            isMobile
              ? "fixed inset-x-0 bottom-0 z-[101] flex max-h-[88dvh] flex-col overflow-hidden rounded-t-xl border-t-2 border-border bg-surface shadow-card animate-sheet-up"
              : "fixed left-1/2 top-1/2 z-[101] flex max-h-[80vh] w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-md border-2 border-border bg-surface shadow-card animate-in fade-in-0 zoom-in-95"
          }
        >
          <header className="relative shrink-0 overflow-hidden border-b-2 border-border bg-gradient-to-br from-primary/25 via-surface to-surface px-5 py-4">
            <Fox className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 -rotate-6 text-primary/20" />
            <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Dialog.Title className="t-impact text-3xl">Quoi de neuf</Dialog.Title>
              <span className="inline-flex bg-primary py-0.5 pl-2.5 pr-4 font-impact text-sm leading-tight tracking-wide text-primary-fg [clip-path:polygon(0_0,100%_0,calc(100%_-_8px)_100%,0_100%)]">
                V{version}
              </span>
            </div>
            {(latest.tagline || latest.date) && (
              <p className="relative mt-1.5 text-xs text-muted">
                {[latest.tagline, latest.date].filter(Boolean).join(" · ")}
              </p>
            )}
            <Dialog.Description className="sr-only">Nouveautés de la version {version}</Dialog.Description>
            <Dialog.Close
              aria-label="Fermer"
              className="absolute right-3 top-3 rounded-md p-1.5 text-muted transition-colors hover:bg-text/10 hover:text-text"
            >
              <X size={18} />
            </Dialog.Close>
          </header>

          <div className="overflow-y-auto px-5 py-4">
            <ReleaseNotes key={latest.version} entry={latest} />
            {showOlder && older.length > 0 && (
              <div className="mt-5 border-t-2 border-border pt-4">
                <ChangelogList entries={older} showHeader />
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t-2 border-border px-5 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 md:pb-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => platform.openExternal(GITHUB_URL)}
                title="Nartya est open source : voir le code sur GitHub"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-text/10 hover:text-text"
              >
                <GithubIcon className="h-4 w-4 shrink-0" /> GitHub
              </button>
              {older.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowOlder((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-text/10 hover:text-text"
                >
                  <History size={14} className="shrink-0" />
                  <span className="truncate">{showOlder ? "Masquer les précédentes" : "Versions précédentes"}</span>
                </button>
              )}
            </div>
            <Dialog.Close className={isMobile ? "btn-shu !py-2.5 text-sm" : "btn-shu !px-5 !py-2 text-sm"}>
              Super, merci !
            </Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
