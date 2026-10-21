import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutList, X } from "lucide-react";

// Changer la clé pour réafficher le bandeau avec une nouvelle annonce.
const DISMISS_KEY = "nartya_banner_tierlists_v1";

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Bandeau d'annonce en haut des pages, jusqu'au clic sur la croix. Le lecteur et le lecteur de
 * scans sont hors de ces mises en page : il n'y apparaît jamais.
 */
export default function FeatureBanner({ className = "" }) {
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(wasDismissed);

  if (dismissed || pathname.startsWith("/tierlists")) return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Le bandeau reviendra au prochain lancement, rien de grave.
    }
  };

  return (
    <div
      className={`relative z-40 flex items-center gap-3 overflow-hidden bg-gradient-to-r from-primary via-primary/85 to-[#ff8a3d] px-4 py-2 text-primary-fg md:px-6 ${className}`}
    >
      <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/20 sm:flex">
        <LayoutList size={17} />
      </span>
      <p className="min-w-0 flex-1 text-xs leading-snug sm:text-sm">
        <span className="mr-1.5 rounded bg-black px-1.5 py-0.5 text-[0.6rem] font-black uppercase tracking-widest text-white sm:text-[0.65rem]">
          Grosse nouveauté
        </span>
        <strong>Les tier lists débarquent sur Nartya !</strong>{" "}
        <span className="hidden opacity-90 md:inline">
          Classe tes animes de GOATED à bof, publie ta tier list et fais réagir toute la communauté 🔥
        </span>
      </p>
      <Link
        to="/tierlists"
        className="shrink-0 rounded-md bg-black/80 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-black"
      >
        Créer la mienne
      </Link>
      <button
        type="button"
        onClick={close}
        aria-label="Fermer l'annonce"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/20"
      >
        <X size={16} />
      </button>
    </div>
  );
}
