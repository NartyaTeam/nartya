import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Cpu, HardDrive, X, Zap } from "lucide-react";
import { Fox } from "@/components/brand/NartyaMark";
import { platform } from "@/platform";

const SEEN_KEY = "nartya.rustIntroSeen";
export const RUST_INTRO_DONE_EVENT = "nartya:rust-intro-done";

/** Desktop Tauri uniquement, et une seule fois. */
export function rustIntroPending() {
  if (platform.name !== "tauri") return false;
  try {
    return !localStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}

function RustGear({ className = "h-16 w-16" }) {
  const teeth = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g fill="currentColor">
        {teeth.map((deg) => (
          <rect key={deg} x="44" y="2" width="12" height="14" rx="2" transform={`rotate(${deg} 50 50)`} />
        ))}
        <path
          fillRule="evenodd"
          d="M50 12a38 38 0 1 0 0 76a38 38 0 1 0 0-76zm0 14a24 24 0 1 1 0 48a24 24 0 1 1 0-48z"
        />
      </g>
      <text
        x="50"
        y="62"
        textAnchor="middle"
        fontSize="40"
        fontWeight="800"
        fontFamily="Georgia, serif"
        fill="currentColor"
      >
        R
      </text>
    </svg>
  );
}

const POINTS = [
  { icon: Cpu, title: "Beaucoup moins de RAM", text: "Plus de Chromium embarqué : l'app s'appuie sur le WebView du système." },
  { icon: Zap, title: "Plus réactive", text: "Le cœur (réseau, téléchargements, lecteur, watch party) tourne en Rust natif." },
  { icon: HardDrive, title: "Installeur 4× plus léger", text: "38 Mo au lieu de 149 Mo, et des mises à jour plus rapides." },
];

export default function RustIntro() {
  const [open, setOpen] = useState(() => rustIntroPending());

  useEffect(() => {
    if (!open) window.dispatchEvent(new Event(RUST_INTRO_DONE_EVENT));
  }, [open]);

  const handleOpenChange = (next) => {
    if (next) return;
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    setOpen(false);
  };

  if (!open) return null;

  return (
    <Dialog.Root open onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm animate-in fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border-2 border-border bg-surface shadow-card animate-in fade-in-0 zoom-in-95">
          <header className="relative border-b-2 border-border bg-gradient-to-br from-primary/25 via-surface to-[#CE422B]/20 px-5 pb-5 pt-6 text-center">
            <div className="flex items-center justify-center gap-5">
              <Fox className="h-20 w-20 text-primary" />
              <span className="font-impact text-3xl text-muted">×</span>
              <RustGear className="h-[72px] w-[72px] text-[#F26B3A]" />
            </div>
            <Dialog.Title className="t-impact mt-4 text-3xl">Nartya passe à Rust</Dialog.Title>
            <Dialog.Description className="mt-1.5 text-sm text-muted">
              L'app a été entièrement réécrite : même Nartya, en bien plus léger.
            </Dialog.Description>
            <Dialog.Close
              aria-label="Fermer"
              className="absolute right-3 top-3 rounded-md p-1.5 text-muted transition-colors hover:bg-text/10 hover:text-text"
            >
              <X size={18} />
            </Dialog.Close>
          </header>

          <ul className="space-y-3 px-5 py-4">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-border bg-primary/10 text-primary">
                  <Icon size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold">{title}</p>
                  <p className="text-xs text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <footer className="flex justify-end border-t-2 border-border px-5 py-3">
            <Dialog.Close className="btn-shu !px-5 !py-2 text-sm">Voir les nouveautés</Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
