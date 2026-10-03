import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, Loader2, ZoomIn, Move, AlertTriangle } from "lucide-react";

// Doit rester le ratio de la bannière réelle (`sm:aspect-[460/148]`) et de son aperçu.
const FRAME_W = 460;
const FRAME_H = 148;
// Suffisant en plein écran sans gonfler les fichiers.
const MAX_OUT_W = 2560;
// En dessous, la zone risque d'être étirée sur un écran Full HD.
const MIN_SRC_W = 1920;

/** Recadrage local (canvas), à la résolution de la zone recadrée. Images fixes seulement. */
export default function BannerCropModal({ file, onCancel, onConfirm }) {
  const [url, setUrl] = useState(null);
  const [nat, setNat] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const imgRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    const img = new Image();
    img.onload = () => setNat({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  // Au zoom 1, l'image couvre le cadre.
  const baseScale = nat ? Math.max(FRAME_W / nat.w, FRAME_H / nat.h) : 1;
  const scale = baseScale * zoom;
  const imgW = nat ? nat.w * scale : 0;
  const imgH = nat ? nat.h * scale : 0;
  const maxX = Math.max(0, (imgW - FRAME_W) / 2);
  const maxY = Math.max(0, (imgH - FRAME_H) / 2);

  const clamp = (o) => ({
    x: Math.max(-maxX, Math.min(maxX, o.x)),
    y: Math.max(-maxY, Math.min(maxY, o.y)),
  });

  useEffect(() => setOffset((o) => clamp(o)), [zoom, nat]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (e) => {
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset(clamp({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
  };
  const onPointerUp = (e) => {
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  const onWheel = (e) => {
    setZoom((z) => Math.min(3, Math.max(1, z - e.deltaY * 0.0015)));
  };

  const confirm = async () => {
    if (!nat || !imgRef.current) return;
    setBusy(true);
    try {
      const sW = FRAME_W / scale; // portion visible, en pixels naturels
      const sH = FRAME_H / scale;
      const sx = nat.w / 2 - (FRAME_W / 2 + offset.x) / scale;
      const sy = nat.h / 2 - (FRAME_H / 2 + offset.y) / scale;
      // `floor` : pas de mise à l'échelle vers le haut.
      const outW = Math.max(1, Math.floor(Math.min(MAX_OUT_W, sW)));
      const outH = Math.max(1, Math.round((outW * FRAME_H) / FRAME_W));
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(imgRef.current, sx, sy, sW, sH, 0, 0, outW, outH);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.95));
      onConfirm(blob);
    } finally {
      setBusy(false);
    }
  };

  // Indicateur de qualité.
  const effW = nat ? Math.round(FRAME_W / scale) : 0;
  const lowRes = nat && effW < MIN_SRC_W;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !busy && onCancel()} />

      <div className="animate-fade-in-fast relative flex w-full max-w-xl flex-col rounded-lg border border-border bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)]">
        <div className="relative px-6 pb-3 pt-4">
          <button
            onClick={onCancel}
            disabled={busy}
            className="absolute right-4 top-4 text-muted transition-colors hover:text-primary disabled:opacity-40"
          >
            <X size={18} />
          </button>
          <p className="eyebrow">Bannière</p>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight">Recadrer la bannière</h2>
        </div>

        <div className="flex flex-col items-center px-6 pb-2">
          <div
            className="relative touch-none select-none overflow-hidden rounded-md bg-black"
            style={{ width: FRAME_W, height: FRAME_H, maxWidth: "100%", cursor: dragRef.current ? "grabbing" : "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
          >
            {url && (
              <img
                ref={imgRef}
                src={url}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                style={{
                  width: imgW || "auto",
                  height: imgH || "auto",
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                }}
              />
            )}
            <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-white/60" />
          </div>

          <div className="mt-2.5 flex w-full items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Move size={13} /> Glisse pour repositionner
            </span>
            {nat && (
              <span className="tabular-nums">
                Source : {nat.w} × {nat.h} px
              </span>
            )}
          </div>

          <div className="mt-2 flex w-full items-center gap-3">
            <ZoomIn size={16} className="shrink-0 text-muted" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer accent-[rgb(var(--primary))]"
              aria-label="Zoom"
            />
          </div>

          {lowRes && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-400">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              Zone un peu petite ({effW} px de large) — la bannière risque d'être floue. Dézoome ou
              choisis une image plus grande pour un meilleur rendu.
            </p>
          )}
        </div>

        <div className="mt-2 flex items-center justify-end gap-4 border-t border-border px-6 py-4">
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            onClick={confirm}
            disabled={busy || !nat}
            className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={15} />}
            Appliquer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
