import { useEffect } from "react";
import { X } from "lucide-react";

export default function Lightbox({ url, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!url) return null;
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm animate-fade-in-fast"
      onClick={onClose}
    >
      <img
        src={url}
        alt="Pièce jointe"
        className="max-h-full max-w-full rounded-md object-contain shadow-card"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        title="Fermer"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/20 transition-colors hover:bg-black/70"
      >
        <X size={18} />
      </button>
    </div>
  );
}
