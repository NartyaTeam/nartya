/**
 * Media Session du lecteur : ce que le système montre et pilote hors de l'app. Sur iPhone, c'est
 * elle que reprennent le centre de contrôle et la télécommande de l'Apple TV pendant un AirPlay
 * (lecture, pause, ±10 s, barre de progression, épisode suivant / précédent, titre et image) ;
 * sur PC, les touches multimédia du clavier ; sur Android, l'écran de verrouillage.
 */

const SKIP_S = 10;
const session = typeof navigator !== "undefined" ? navigator.mediaSession : null;

/** Branche les commandes système sur le lecteur `art` (ArtPlayer). `cb()` rend les callbacks à jour. → arrêt. */
export function attachMediaSession(art, cb) {
  if (!session || !art?.video) return () => {};
  const video = art.video;
  const seekTo = (t) => {
    if (!Number.isFinite(video.duration)) return;
    art.seek = Math.max(0, Math.min(video.duration - 0.5, t));
  };
  const handlers = {
    play: () => art.play(),
    pause: () => art.pause(),
    stop: () => art.pause(),
    seekbackward: (d) => seekTo(video.currentTime - (d?.seekOffset || SKIP_S)),
    seekforward: (d) => seekTo(video.currentTime + (d?.seekOffset || SKIP_S)),
    seekto: (d) => Number.isFinite(d?.seekTime) && seekTo(d.seekTime),
    nexttrack: () => cb().hasNext && cb().onNext?.(),
    previoustrack: () => cb().hasPrev && cb().onPrev?.(),
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try {
      session.setActionHandler(action, handler);
    } catch {
      // Action inconnue de ce navigateur : ignorée.
    }
  }

  // Position et état, pour la barre de progression du système (au plus toutes les secondes).
  let last = 0;
  const syncPosition = () => {
    const now = Date.now();
    if (now - last < 1000 && !video.paused) return;
    last = now;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    try {
      session.setPositionState({
        duration: video.duration,
        playbackRate: video.playbackRate || 1,
        position: Math.min(video.currentTime, video.duration),
      });
    } catch {
      // Position transitoire incohérente (changement de source) : la suivante corrige.
    }
  };
  const onPlay = () => {
    session.playbackState = "playing";
    syncPosition();
  };
  const onPause = () => {
    session.playbackState = "paused";
    syncPosition();
  };
  video.addEventListener("timeupdate", syncPosition);
  video.addEventListener("seeked", syncPosition);
  video.addEventListener("play", onPlay);
  video.addEventListener("pause", onPause);

  return () => {
    video.removeEventListener("timeupdate", syncPosition);
    video.removeEventListener("seeked", syncPosition);
    video.removeEventListener("play", onPlay);
    video.removeEventListener("pause", onPause);
    for (const action of Object.keys(handlers)) {
      try {
        session.setActionHandler(action, null);
      } catch {
        // idem
      }
    }
    session.metadata = null;
    session.playbackState = "none";
  };
}

/** Titre (épisode), sous-titre (anime) et image affichés par le système. */
export function setMediaMetadata({ title, artist, artwork }) {
  if (!session || typeof MediaMetadata === "undefined") return;
  session.metadata = new MediaMetadata({
    title: title || "Nartya",
    artist: artist || "",
    album: "Nartya",
    artwork: artwork ? [{ src: artwork, sizes: "512x512" }] : [],
  });
}
