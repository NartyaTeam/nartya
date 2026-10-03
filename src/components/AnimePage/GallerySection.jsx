import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, ImageOff, Loader2, X } from "lucide-react";
import { useCachedResource } from "@/hooks/useCachedResource";
import { getAnimeGallery } from "@/api/animeApi";
import { toast } from "@/lib/toast";

const GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4";

function fileNameFor(title, index) {
  const safe = (title || "image").replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 80);
  return `${safe || "image"}-${index + 1}.jpg`;
}

async function downloadImage(url, filename) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Navigation précédent/suivant (flèches, clavier, boucle) et téléchargement. */
function GalleryLightbox({ images, index, animeTitle, onClose, onNavigate }) {
  const [downloading, setDownloading] = useState(false);
  const image = images[index];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onNavigate(-1);
      else if (e.key === "ArrowRight") onNavigate(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNavigate]);

  // La page derrière ne défile pas pendant ce temps.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadImage(image.full, fileNameFor(animeTitle, index));
    } catch {
      toast.error("Téléchargement de l'image impossible");
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <div className="animate-fade-in-fast fixed inset-0 z-[70] flex flex-col bg-black/95 backdrop-blur-sm">
      <div className="relative z-10 flex shrink-0 items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-xs font-medium text-white/60">
          <span className="tabular-nums">
            {index + 1} / {images.length}
          </span>
          {image.width && image.height && (
            <>
              <span aria-hidden className="text-white/25">
                ·
              </span>
              <span className="tabular-nums">
                {image.width} × {image.height}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Fermer"
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      {/* Cliquer le fond ferme la visionneuse. */}
      <div className="relative flex flex-1 items-center justify-center px-2" onClick={onClose}>
        {images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(-1);
            }}
            title="Image précédente"
            className="absolute left-2 z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/40 text-white/80 ring-1 ring-white/10 transition-colors hover:bg-black/60 hover:text-white sm:left-4 sm:h-12 sm:w-12"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        <img
          key={image.full}
          src={image.full}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="animate-fade-in-fast max-h-[82dvh] max-w-[92vw] rounded-md object-contain shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] sm:max-w-[85vw]"
        />

        {images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(1);
            }}
            title="Image suivante"
            className="absolute right-2 z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/40 text-white/80 ring-1 ring-white/10 transition-colors hover:bg-black/60 hover:text-white sm:right-4 sm:h-12 sm:w-12"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      <div className="relative z-10 flex shrink-0 justify-center bg-gradient-to-t from-black/60 to-transparent px-4 py-4">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/15 disabled:opacity-60"
        >
          {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          Télécharger
        </button>
      </div>
    </div>,
    document.body
  );
}

/** Chargé à l'ouverture de l'onglet. */
export function GallerySection({ slug, animeTitle }) {
  const { data, loading } = useCachedResource(
    slug ? `anime-gallery:${slug}` : null,
    () => getAnimeGallery(slug),
    30 * 60 * 1000
  );
  const images = data || [];
  const [openIndex, setOpenIndex] = useState(null);

  const navigate = (delta) => {
    setOpenIndex((i) => (i === null ? i : (i + delta + images.length) % images.length));
  };

  if (loading && !data) {
    return (
      <div className={`px-4 pb-10 pt-6 sm:px-8 ${GRID_CLASS}`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-video skeleton rounded-lg" />
        ))}
      </div>
    );
  }

  if (!images.length) {
    return (
      <div className="flex min-h-[30dvh] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ImageOff size={22} strokeWidth={1.8} />
        </span>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Pas encore d'images trouvées pour cet anime.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={`px-4 pb-10 pt-6 sm:px-8 ${GRID_CLASS}`}>
        {images.map((image, index) => (
          <button
            key={image.full}
            type="button"
            onClick={() => setOpenIndex(index)}
            className="group relative aspect-video overflow-hidden rounded-lg bg-surface-2 ring-1 ring-border transition-transform active:scale-[0.98]"
          >
            <img
              src={image.thumb || image.full}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-bg/0 transition-colors duration-150 group-hover:bg-bg/20" />
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <GalleryLightbox
          images={images}
          index={openIndex}
          animeTitle={animeTitle}
          onClose={() => setOpenIndex(null)}
          onNavigate={navigate}
        />
      )}
    </>
  );
}
