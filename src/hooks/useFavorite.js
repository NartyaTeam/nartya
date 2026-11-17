import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/stores/useAuthStore";
import { useFavoritesStore } from "@/stores/useFavoritesStore";
import { addFavorite, removeFavorite } from "@/api/favorites";
import { guestBlockToast, GUEST_FEATURE_MSG } from "@/lib/guest";

/** Mise à jour optimiste. */
export function useFavorite(slug, meta = {}) {
  const session = useAuthStore((s) => s.session);
  const isGuest = !!session?.user?.is_anonymous;
  // La liste des favoris est déjà chargée au démarrage (cartes) : pas de requête par fiche.
  const stored = useFavoritesStore((s) => !!slug && s.slugs.has(slug));
  const ensureLoaded = useFavoritesStore((s) => s.ensureLoaded);
  const fav = !!session && !isGuest && stored;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session && !isGuest) ensureLoaded();
  }, [session, isGuest, ensureLoaded]);

  const toggle = async () => {
    if (!session || isGuest) {
      guestBlockToast(session ? GUEST_FEATURE_MSG : "Connecte-toi pour gérer tes favoris");
      return;
    }
    if (busy) return;
    const next = !fav;
    setBusy(true);
    const store = useFavoritesStore.getState();
    if (next) store.markFavorite(slug);
    else store.unmarkFavorite(slug);
    try {
      if (next) {
        await addFavorite({
          slug,
          title: meta.title,
          cover: meta.cover,
          genre: meta.genre,
          mediaType: meta.mediaType,
        });
        toast.success("Ajouté aux favoris");
      } else {
        await removeFavorite(slug);
        toast.info("Retiré des favoris");
      }
    } catch (e) {
      if (next) store.unmarkFavorite(slug);
      else store.markFavorite(slug);
      toast.error("Impossible de mettre à jour les favoris");
    } finally {
      setBusy(false);
    }
  };

  return { fav, toggle, busy };
}
