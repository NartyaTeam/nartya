import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import ChangelogList from "@/components/changelog/ChangelogList";
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

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm animate-in fade-in-0" />
        <Dialog.Content
          className={
            isMobile
              ? "fixed inset-x-0 bottom-0 z-[101] flex max-h-[86dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border bg-surface shadow-card animate-sheet-up"
              : "fixed left-1/2 top-1/2 z-[101] flex max-h-[85vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-card ring-1 ring-white/10 animate-in fade-in-0 zoom-in-95"
          }
        >
          {isMobile ? <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/20" /> : null}
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 md:px-6 md:py-5">
            <div>
              <Dialog.Title className="font-display text-xl font-bold tracking-tight">
                Quoi de neuf ✨
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted">
                Mise à jour installée — version {version}
              </Dialog.Description>
            </div>
            <Dialog.Close className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-text">
              <X size={18} />
            </Dialog.Close>
          </header>

          <div className="overflow-y-auto px-5 py-5 md:px-6">
            <ChangelogList entries={entries} />
          </div>

          <footer className="border-t border-border px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 text-right md:px-6 md:pb-4">
            <Dialog.Close className={isMobile ? "btn-shu w-full justify-center" : "btn-shu"}>
              Super, merci !
            </Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
