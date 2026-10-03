import { useEffect, useRef, useState } from "react";
import { Cast, Play, Pause, Square, Volume2, VolumeX, Loader2, X, RotateCw, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { useCastStore } from "@/stores/useCastStore";

// Au-delà, une recherche vide affiche l'aide.
const SEARCH_GRACE_MS = 8000;
// La recherche s'arrête seule côté main : on la prolonge tant que le menu est ouvert.
const DISCOVER_KEEPALIVE_MS = 60_000;

/** Accent jusqu'à la valeur, piste neutre après. */
function castRangeBg(value, max) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return {
    background: `linear-gradient(to right, rgb(var(--primary)) ${pct}%, rgb(255 255 255 / 0.14) ${pct}%)`,
  };
}

function fmt(s) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? h + ":" : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/**
 * Electron uniquement.
 * @param {() => {url:string, contentType?:string, title?:string, poster?:string}|null} getMedia
 * @param {() => number} getCurrentTime position locale, pour reprendre au même endroit
 * @param {({deviceId:string, startAt:number}) => boolean} [onMediaFailed] la TV ne lit pas
 * cette vidéo ; true si la page relance le cast sur une autre source
 */
export default function CastControls({ getMedia, getCurrentTime, onMediaFailed }) {
  const {
    available,
    devices,
    status,
    deviceId,
    connecting,
    diagnostics,
    lastError,
    mediaFailure,
    clearMediaFailure,
    discover,
    addHost,
    loadDiagnostics,
    clearError,
    cast,
    play,
    pause,
    seek,
    setVolume,
    setMuted,
    stop,
  } = useCastStore();
  const [open, setOpen] = useState(false);
  const [searchExpired, setSearchExpired] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualIp, setManualIp] = useState("");
  const [adding, setAdding] = useState(false);
  const boxRef = useRef(null);
  const graceRef = useRef(null);
  // null = on suit l'état distant
  const [scrubbing, setScrubbing] = useState(null);

  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const startSearch = () => {
    setSearchExpired(false);
    discover();
    clearTimeout(graceRef.current);
    graceRef.current = setTimeout(() => setSearchExpired(true), SEARCH_GRACE_MS);
  };

  useEffect(() => {
    if (!open || !available) return undefined;
    startSearch();
    const keepAlive = setInterval(discover, DISCOVER_KEEPALIVE_MS);
    return () => {
      clearInterval(keepAlive);
      clearTimeout(graceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, available]);

  useEffect(() => {
    if (searchExpired && devices.length === 0) loadDiagnostics();
  }, [searchExpired, devices.length, loadDiagnostics]);

  useEffect(() => {
    if (!lastError) return;
    toast.error(lastError);
    clearError();
  }, [lastError, clearError]);

  useEffect(() => {
    if (!mediaFailure) return;
    clearMediaFailure();
    const startAt = Math.floor(mediaFailure.at);
    if (onMediaFailed?.({ deviceId: mediaFailure.deviceId, startAt })) {
      toast.info("La TV ne lit pas cette source, essai d'une autre…");
    } else {
      toast.error("La TV n'a pas pu lire cette vidéo.");
    }
  }, [mediaFailure, clearMediaFailure, onMediaFailed]);

  if (!available) return null;

  const casting = !!deviceId;
  const playing = status?.playerState === "PLAYING" || status?.playerState === "BUFFERING";
  const firewallBlocked = diagnostics?.firewall?.blocked;

  const handlePick = async (id) => {
    const media = getMedia?.();
    if (!media?.url) {
      toast.error("Aucune vidéo à caster pour le moment.");
      return;
    }
    const startAt = Math.floor(getCurrentTime?.() || 0);
    const res = await cast(id, { ...media, startAt });
    if (res.success) toast.success("Lecture envoyée sur la TV");
    else if (res.mediaFailed && onMediaFailed?.({ deviceId: id, startAt })) {
      toast.info("La TV ne lit pas cette source, essai d'une autre…");
    } else toast.error(res.error || "Cast impossible");
  };

  const handleAddHost = async (e) => {
    e.preventDefault();
    if (!manualIp.trim() || adding) return;
    setAdding(true);
    const res = await addHost(manualIp.trim());
    setAdding(false);
    if (res.success) {
      setManualIp("");
      setShowManual(false);
    } else {
      toast.error(res.error || "Appareil introuvable");
    }
  };

  const manualForm = showManual ? (
    <form onSubmit={handleAddHost} className="mt-2 flex items-center gap-2">
      <input
        value={manualIp}
        onChange={(e) => setManualIp(e.target.value)}
        placeholder="192.168.1.20"
        inputMode="decimal"
        autoFocus
        className="min-w-0 flex-1 rounded-md bg-white/[0.06] px-2.5 py-1.5 text-sm text-text ring-1 ring-border placeholder:text-muted focus:outline-none focus:ring-primary"
      />
      <button
        type="submit"
        disabled={adding}
        className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-fg disabled:opacity-50"
      >
        {adding ? <Loader2 className="animate-spin" size={14} /> : "Ajouter"}
      </button>
    </form>
  ) : (
    <button
      type="button"
      onClick={() => setShowManual(true)}
      className="mt-2 flex items-center gap-1.5 px-1 text-xs text-muted transition-colors hover:text-text"
    >
      <Plus size={12} /> Ajouter par adresse IP
    </button>
  );

  const duration = status?.duration ?? 0;
  const current = scrubbing != null ? scrubbing : status?.currentTime ?? 0;
  const volume = status?.volume ?? 1;
  const muted = status?.muted ?? false;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Caster sur une TV"
        title="Caster sur une TV"
        className={`cast-trigger flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-black/30 ${
          casting ? "text-primary" : "text-white"
        } drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]`}
      >
        <Cast size={22} />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-[60] w-72 overflow-hidden rounded-lg bg-surface/95 p-3 shadow-card ring-1 ring-white/10 backdrop-blur-xl animate-slide-up">
          {!casting ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Appareils
                </p>
                <button onClick={() => setOpen(false)} className="text-muted hover:text-text">
                  <X size={14} />
                </button>
              </div>
              {devices.length === 0 && !searchExpired ? (
                <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted">
                  <Loader2 className="animate-spin" size={16} />
                  Recherche d'appareils…
                </div>
              ) : devices.length === 0 ? (
                <div className="px-1 py-2 text-xs leading-relaxed text-muted">
                  <p className="mb-2 text-sm text-text">Aucun appareil trouvé.</p>
                  {firewallBlocked && (
                    <p className="mb-2 rounded-md bg-primary/10 px-2 py-1.5 text-text ring-1 ring-primary/30">
                      Le pare-feu Windows bloque Nartya. Autorise-le dans « Pare-feu Windows Defender ›
                      Autoriser une application ».
                    </p>
                  )}
                  <ul className="mb-2 list-disc space-y-1 pl-4">
                    <li>La TV et ce PC doivent être sur le même réseau.</li>
                    <li>Coupe ton VPN s'il est actif.</li>
                    <li>Si ton réseau Windows est en « Public », passe-le en « Privé ».</li>
                  </ul>
                  <button
                    type="button"
                    onClick={startSearch}
                    className="flex items-center gap-1.5 px-1 text-xs text-muted transition-colors hover:text-text"
                  >
                    <RotateCw size={12} /> Relancer la recherche
                  </button>
                  {manualForm}
                </div>
              ) : (
                <div className="flex flex-col">
                  {devices.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => handlePick(d.id)}
                      disabled={connecting}
                      className="flex items-center gap-2.5 rounded-md px-2 py-2.5 text-left text-sm text-text transition-colors hover:bg-surface-2 disabled:opacity-50"
                    >
                      {connecting ? (
                        <Loader2 size={16} className="shrink-0 animate-spin text-muted" />
                      ) : (
                        <Cast size={16} className="shrink-0 text-muted" />
                      )}
                      <span className="min-w-0 truncate">{d.name}</span>
                    </button>
                  ))}
                  {manualForm}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[0.65rem] uppercase tracking-wider text-muted">
                    {connecting ? "Connexion…" : "Cast sur"}
                  </p>
                  <p className="truncate text-sm font-semibold text-text">
                    {status?.deviceName || "TV"}
                  </p>
                </div>
                <button
                  onClick={() => stop()}
                  title="Arrêter le cast"
                  className="flex items-center gap-1.5 rounded-md bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-text ring-1 ring-border transition-colors hover:bg-white/[0.1] hover:text-primary"
                >
                  <Square size={12} /> Stop
                </button>
              </div>

              <input
                type="range"
                min={0}
                max={Math.max(1, Math.floor(duration))}
                value={Math.floor(current)}
                onChange={(e) => setScrubbing(Number(e.target.value))}
                onMouseUp={(e) => {
                  seek(Number(e.target.value));
                  setScrubbing(null);
                }}
                onTouchEnd={(e) => {
                  seek(Number(e.target.value));
                  setScrubbing(null);
                }}
                style={castRangeBg(current, Math.max(1, duration))}
                className="cast-range w-full"
              />
              <div className="mb-3 flex justify-between text-[0.65rem] tabular-nums text-muted">
                <span>{fmt(current)}</span>
                <span>{fmt(duration)}</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => (playing ? pause() : play())}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-fg transition-transform hover:scale-105"
                  aria-label={playing ? "Pause" : "Lecture"}
                >
                  {playing ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button
                  onClick={() => setMuted(!muted)}
                  className="text-muted transition-colors hover:text-text"
                  aria-label={muted ? "Réactiver le son" : "Couper le son"}
                >
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round((muted ? 0 : volume) * 100)}
                  onChange={(e) => setVolume(Number(e.target.value) / 100)}
                  style={castRangeBg(muted ? 0 : volume * 100, 100)}
                  className="cast-range flex-1"
                  aria-label="Volume"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
