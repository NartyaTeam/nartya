import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "@/lib/toast";
import { Info, Heart, Check } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useFavoritesStore } from "@/stores/useFavoritesStore";
import { useListsStore } from "@/stores/useListsStore";
import { addFavorite, removeFavorite } from "@/api/favorites";
import { LIST_STATUSES } from "@/utils/lists";
import { GUEST_FEATURE_MSG } from "@/lib/guest";
import { platform } from "@/platform";

const MENU_W = 210;

/** Positionné au curseur ; fermé au clic extérieur, à Échap ou après une action. */
export default function AnimeContextMenu({ anime, x, y, onClose }) {
  const navigate = useNavigate();
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });
  const isMobile = platform.isMobile;

  const session = useAuthStore((s) => s.session);
  const isFav = useFavoritesStore((s) => s.slugs.has(anime.slug));
  const listStatus = useListsStore((s) => s.statuses.get(anime.slug) || null);

  useEffect(() => {
    useListsStore.getState().ensureLoaded();
  }, []);

  // Recalé dans la fenêtre après mesure.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight || 260;
    setPos({
      x: Math.min(x, window.innerWidth - MENU_W - 8),
      y: Math.min(y, window.innerHeight - h - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const isGuest = !!session?.user?.is_anonymous;
  const requireAuth = () => {
    if (session && !isGuest) return true;
    toast.info(session ? GUEST_FEATURE_MSG : "Connecte-toi pour gérer favoris et listes");
    onClose();
    return false;
  };

  const toggleFav = () => {
    if (!requireAuth()) return;
    const store = useFavoritesStore.getState();
    if (isFav) {
      store.unmarkFavorite(anime.slug);
      removeFavorite(anime.slug).catch(() => store.markFavorite(anime.slug));
    } else {
      store.markFavorite(anime.slug);
      addFavorite({ slug: anime.slug, title: anime.title, cover: anime.cover }).catch(() =>
        store.unmarkFavorite(anime.slug)
      );
    }
    onClose();
  };

  const setStatus = (status) => {
    if (!requireAuth()) return;
    if (status === listStatus) useListsStore.getState().remove(anime.slug);
    else
      useListsStore
        .getState()
        .setStatus(anime.slug, status, { title: anime.title, cover: anime.cover });
    onClose();
  };

  const Item = ({ icon: Icon, children, onClick, active }) => (
    <button
      onClick={onClick}
      className={
        isMobile
          ? "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[0.95rem] text-text transition-colors active:bg-white/[0.06]"
          : "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-text transition-colors hover:bg-white/[0.06]"
      }
    >
      {Icon ? (
        <Icon size={isMobile ? 20 : 15} className={active ? "text-primary" : "text-muted"} />
      ) : (
        <span className={isMobile ? "w-5" : "w-[15px]"} />
      )}
      <span className="flex-1">{children}</span>
      {active && <Check size={isMobile ? 18 : 14} className="text-primary" />}
    </button>
  );

  const menuItems = (
    <>
      <Item icon={Info} onClick={() => (navigate(`/anime/${anime.slug}`), onClose())}>
        Ouvrir la fiche
      </Item>

      <div className="my-1 h-px bg-border/60" />

      <Item icon={Heart} onClick={toggleFav} active={isFav}>
        {isFav ? "Dans mes favoris" : "Ajouter aux favoris"}
      </Item>

      <div className="my-1 h-px bg-border/60" />
      <p
        className={
          isMobile
            ? "px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-kana text-muted"
            : "px-3 pb-0.5 pt-1 text-[0.62rem] uppercase tracking-wider text-muted"
        }
      >
        Ma liste
      </p>
      {LIST_STATUSES.map((s) => (
        <Item key={s.key} onClick={() => setStatus(s.key)} active={listStatus === s.key}>
          {s.label}
        </Item>
      ))}
    </>
  );

  if (isMobile) {
    return createPortal(
      <div
        className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/60 md:hidden"
        style={{ animation: "fade-in 0.18s ease both" }}
        onClick={onClose}
      >
        <div
          ref={ref}
          className="animate-sheet-up max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface pb-[max(env(safe-area-inset-bottom),1rem)] shadow-card"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="pt-2.5">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" />
            <div className="border-b border-border/70 px-5 pb-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-kana text-muted">
                Actions
              </p>
              <p className="mt-1 line-clamp-1 text-base font-semibold text-text">
                {anime.title}
              </p>
            </div>
          </div>
          <div className="px-2 py-2">{menuItems}</div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      ref={ref}
      style={{ left: pos.x, top: pos.y, width: MENU_W }}
      className="fixed z-[100] overflow-hidden rounded-md bg-surface py-1 shadow-card ring-1 ring-border animate-slide-up"
    >
      {menuItems}
    </div>,
    document.body
  );
}
