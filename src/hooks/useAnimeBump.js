import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/stores/useAuthStore";
import { getAnimeBump, toggleAnimeBump } from "@/api/bumps";
import { guestBlockToast, GUEST_FEATURE_MSG } from "@/lib/guest";

/** Recommandation d'un anime à la communauté. Mise à jour optimiste. */
export function useAnimeBump(slug, meta = {}) {
  const session = useAuthStore((s) => s.session);
  const isGuest = !!session?.user?.is_anonymous;
  const [state, setState] = useState({ bumped: false, bumps: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState({ bumped: false, bumps: 0 });
    if (!slug) return;
    let alive = true;
    getAnimeBump(slug)
      .then((v) => alive && setState(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug, session?.user?.id]);

  const toggle = async () => {
    if (!session || isGuest) {
      guestBlockToast(session ? GUEST_FEATURE_MSG : "Connecte-toi pour recommander un anime");
      return;
    }
    if (busy || !slug) return;
    const prev = state;
    const next = !prev.bumped;
    setState({ bumped: next, bumps: Math.max(0, prev.bumps + (next ? 1 : -1)) });
    setBusy(true);
    try {
      await toggleAnimeBump({ slug, title: meta.title, cover: meta.cover });
      if (next) toast.success("Recommandé à la communauté");
    } catch (err) {
      setState(prev);
      toast.error(
        /rate_limited/.test(err?.message || "")
          ? "Tu as beaucoup recommandé aujourd'hui, réessaie demain."
          : "Impossible d'enregistrer la recommandation."
      );
    } finally {
      setBusy(false);
    }
  };

  return { bumped: state.bumped, bumps: state.bumps, toggle };
}
