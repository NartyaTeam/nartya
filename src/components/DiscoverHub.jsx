import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Rocket, LayoutGrid, KeyRound, RefreshCw, Download } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { HUB_DOWNLOAD_URL } from "@/lib/hubAuth";
import { platform } from "@/platform";

/**
 * Le hub porte les mises à jour : la modale revient à chaque lancement tant qu'il n'est pas
 * détecté, et rien n'est affiché si l'app est lancée par lui. Invisible hors Electron.
 */

const BENEFITS = [
  {
    Icon: KeyRound,
    title: "Une seule connexion",
    text: "Ton compte Nartya te connecte automatiquement à toutes les apps.",
  },
  {
    Icon: LayoutGrid,
    title: "Toutes les apps au même endroit",
    text: "Anime, films et les prochaines apps Nartya, installés et lancés depuis le hub.",
  },
  {
    Icon: RefreshCw,
    title: "Mises à jour gérées",
    text: "Le hub garde tes apps à jour — installe-le pour continuer à recevoir les nouveautés.",
  },
];

function openDownload() {
  platform.openExternal(HUB_DOWNLOAD_URL);
}

export default function DiscoverHub() {
  const hub = platform.hub;
  // Seulement une fois connecté, comme « Quoi de neuf ».
  const session = useAuthStore((s) => s.session);

  const [phase, setPhase] = useState("checking");
  // Pas par-dessus « Quoi de neuf » : on attend son signal de fin.
  const [whatsNewDone, setWhatsNewDone] = useState(false);

  useEffect(() => {
    const done = () => setWhatsNewDone(true);
    window.addEventListener("nartya:whatsnew-done", done);
    const t = setTimeout(done, 2500);
    return () => {
      window.removeEventListener("nartya:whatsnew-done", done);
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!hub || !session) return;
    let cancelled = false;

    (async () => {
      const [managed, info] = await Promise.all([
        hub.isManaged?.().catch(() => false),
        hub.getInfo?.().catch(() => null),
      ]);
      if (cancelled) return;
      if (managed || info) {
        setPhase("hidden");
        return;
      }
      setPhase("modal");
    })();

    return () => {
      cancelled = true;
    };
  }, [hub, session]);

  // Le hub peut être installé pendant que l'app tourne.
  useEffect(() => {
    if (!hub || phase === "hidden" || phase === "checking") return;
    const recheck = async () => {
      const info = await hub.getInfo?.().catch(() => null);
      if (info) setPhase("hidden");
    };
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, [hub, phase]);

  // Pour la session en cours seulement.
  const closeModal = () => setPhase("hidden");

  if (!hub || phase === "checking" || phase === "hidden") return null;
  if (!whatsNewDone) return null;

  return (
    <Dialog.Root open onOpenChange={(next) => !next && closeModal()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm animate-in fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-card ring-1 ring-white/10 animate-in fade-in-0 zoom-in-95">
          <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                <Rocket size={18} />
              </span>
              <div>
                <Dialog.Title className="font-display text-xl font-bold tracking-tight">
                  Découvre Nartya Hub
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-xs text-muted">
                  Le launcher qui réunit toutes les apps Nartya
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-text">
              <X size={18} />
            </Dialog.Close>
          </header>

          <div className="overflow-y-auto px-6 py-5">
            <p className="text-sm leading-relaxed text-muted">
              Nartya Hub installe, lance et met à jour toutes tes apps Nartya depuis un seul
              endroit. Il reconnaît l'app que tu utilises déjà — aucune réinstallation.
            </p>
            <ul className="mt-5 space-y-4">
              {BENEFITS.map(({ Icon, title, text }) => (
                <li key={title} className="flex gap-3">
                  <Icon size={18} className="mt-0.5 shrink-0 text-primary" />
                  <div>
                    <h3 className="font-display text-sm font-bold tracking-tight">{title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <footer className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
            <Dialog.Close className="rounded-md px-3 py-2 text-sm text-muted transition-colors hover:text-text">
              Plus tard
            </Dialog.Close>
            <button onClick={openDownload} className="btn-shu flex items-center gap-2">
              <Download size={15} />
              Installer le hub
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
