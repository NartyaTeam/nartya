import { memo, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Play, Star, Heart } from "lucide-react";
import { useFavoritesStore } from "@/stores/useFavoritesStore";
import AnimeContextMenu from "@/components/anime/AnimeContextMenu";
import { platform } from "@/platform";

const LONG_PRESS_DELAY_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 12;

/** `showFavorite` : pastille cœur si l'anime est en favori. */
function AnimeCard({
  anime,
  index,
  showFavorite = true,
  openScans = false,
  titleLines = 1,
  highlightedGenres = [],
}) {
  const navigate = useNavigate();
  const isFav = useFavoritesStore((s) => s.slugs.has(anime.slug));

  // `complete` couvre l'image déjà en cache, pour laquelle onLoad ne se déclenche pas.
  const imgRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
    if (imgRef.current?.complete) setLoaded(true);
  }, [anime.cover]);

  // { x, y } ou null
  const [menu, setMenu] = useState(null);
  const longPressTimerRef = useRef(null);
  const longPressStartRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const PrimaryIcon = openScans ? BookOpen : Play;
  const displayedGenres = [
    ...highlightedGenres.filter((genre) => anime.genres?.includes(genre)),
    ...(anime.genres || []),
  ]
    .filter((genre, genreIndex, allGenres) => allGenres.indexOf(genre) === genreIndex)
    .slice(0, 2);

  const cancelLongPress = () => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressStartRef.current = null;
  };

  useEffect(() => cancelLongPress, []);

  const openMobileMenu = () => {
    longPressTriggeredRef.current = true;
    platform.haptic?.("medium");
    setMenu({ x: 0, y: 0 });
  };

  const startLongPress = (event) => {
    if (!platform.isMobile || event.pointerType !== "touch" || !event.isPrimary) return;
    cancelLongPress();
    longPressTriggeredRef.current = false;
    longPressStartRef.current = { x: event.clientX, y: event.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressStartRef.current = null;
      openMobileMenu();
    }, LONG_PRESS_DELAY_MS);
  };

  const trackLongPress = (event) => {
    const start = longPressStartRef.current;
    if (!start) return;
    if (
      Math.hypot(event.clientX - start.x, event.clientY - start.y) >
      LONG_PRESS_MOVE_TOLERANCE_PX
    ) {
      cancelLongPress();
    }
  };

  const openCardOrIgnoreLongPress = (event) => {
    if (longPressTriggeredRef.current) {
      event.preventDefault();
      longPressTriggeredRef.current = false;
      return;
    }
    navigate(`/anime/${anime.slug}${openScans ? "?tab=scans" : ""}`);
  };

  return (
    <>
    <button
      onClick={openCardOrIgnoreLongPress}
      onPointerDown={startLongPress}
      onPointerMove={trackLongPress}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onContextMenu={(e) => {
        e.preventDefault();
        if (platform.isMobile) {
          cancelLongPress();
          if (!longPressTriggeredRef.current) openMobileMenu();
          return;
        }
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      className="group block w-full select-none text-left transition-transform active:scale-[0.98] md:active:scale-100"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-surface-2 after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-md after:ring-2 after:ring-inset after:ring-border after:transition-colors after:content-[''] group-hover:after:ring-primary">
        {anime.cover ? (
          <>
            {!loaded && <div className="absolute inset-0 skeleton" />}
            <img
              ref={imgRef}
              src={anime.cover}
              alt={anime.title}
              loading="lazy"
              decoding="async"
              draggable={false}
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
              className={`h-full w-full object-cover transition-[transform,opacity] duration-300 ease-out group-hover:scale-105 ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
            />
          </>
        ) : (
          <div className="h-full w-full skeleton" />
        )}

        <div className="absolute inset-0 hidden items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/45 group-hover:opacity-100 md:flex">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-fg shadow-[0_3px_0_color-mix(in_srgb,rgb(var(--primary))_58%,black)]">
            <PrimaryIcon size={18} className={openScans ? "" : "ml-0.5 fill-current"} />
          </span>
        </div>

        {/* Index éditorial (rangée Tendances) */}
        {typeof index === "number" && (
          <span className="absolute left-0 top-0 z-10 bg-primary py-0.5 pl-2 pr-4 font-impact text-base leading-tight tracking-wide text-primary-fg [clip-path:polygon(0_0,100%_0,calc(100%_-_9px)_100%,0_100%)]">
            {String(index + 1).padStart(2, "0")}
          </span>
        )}

        {anime.score != null && (
          <span className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1 rounded bg-bg/90 px-1.5 py-0.5 text-[0.68rem] font-bold ring-1 ring-border">
            <Star size={10} className="fill-accent text-accent" />
            {anime.score.toFixed(1)}
          </span>
        )}

        {showFavorite && isFav && (
          <span
            title="Dans tes favoris"
            className="absolute bottom-1.5 left-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-bg/90 ring-2 ring-primary/60"
          >
            <Heart size={12} className="fill-primary text-primary" />
          </span>
        )}
      </div>

      <h3
        className={`mt-2.5 text-sm font-bold text-text transition-colors group-hover:text-primary ${
          titleLines === 2 ? "min-h-10 line-clamp-2 leading-5" : "line-clamp-1"
        }`}
      >
        {anime.title}
      </h3>
      <p className="mt-0.5 line-clamp-1 text-xs text-muted">
        {displayedGenres.join(" · ")}
      </p>
    </button>
    {menu && (
      <AnimeContextMenu
        anime={anime}
        x={menu.x}
        y={menu.y}
        onClose={() => {
          longPressTriggeredRef.current = false;
          setMenu(null);
        }}
      />
    )}
    </>
  );
}

export default memo(AnimeCard);
