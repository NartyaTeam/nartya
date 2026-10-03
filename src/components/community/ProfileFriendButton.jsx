import { useEffect, useState } from "react";
import { UserPlus, Check, Clock, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/stores/useAuthStore";
import { getFriendStatus } from "@/api/profile";
import { sendFriendRequest, respondFriendRequest, removeFriend } from "@/api/friends";
import { useFriendsStore } from "@/stores/useFriendsStore";

/** Masqué pour soi-même et pour un invité. */
export default function ProfileFriendButton({ userId, handle, username }) {
  const session = useAuthStore((s) => s.session);
  const isGuest = !!session?.user?.is_anonymous;
  const refreshCount = useFriendsStore((s) => s.refreshCount);
  const [status, setStatus] = useState(null); // null = chargement
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId || !session || isGuest) return;
    let alive = true;
    getFriendStatus(userId)
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus("none"));
    return () => {
      alive = false;
    };
  }, [userId, session, isGuest]);

  if (!session || isGuest || status === null || status === "self") return null;

  const run = async (fn, next, okMsg) => {
    setBusy(true);
    try {
      await fn();
      setStatus(next);
      refreshCount();
      if (okMsg) toast.success(okMsg);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Posé sur la bannière : styles lisibles sur image.
  const base =
    "inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold shadow-lg backdrop-blur-md transition-colors disabled:opacity-60";
  const primary = "bg-primary text-primary-fg ring-1 ring-black/10 hover:bg-primary/90";
  const glass = "bg-black/45 text-white ring-1 ring-white/15 hover:bg-black/65";

  if (status === "friends") {
    return (
      <span className={`${base} ${glass}`}>
        <Check size={15} /> Amis
      </span>
    );
  }

  if (status === "pending_out") {
    return (
      <button
        onClick={() => run(() => removeFriend(userId), "none", "Demande annulée.")}
        disabled={busy}
        className={`${base} ${glass} hover:text-red-300`}
        title="Annuler la demande"
      >
        <Clock size={15} /> Demande envoyée
      </button>
    );
  }

  if (status === "pending_in") {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => run(() => respondFriendRequest(userId, true), "friends", `Tu es maintenant ami avec ${username}.`)}
          disabled={busy}
          className={`${base} ${primary}`}
        >
          <Check size={15} /> Accepter
        </button>
        <button
          onClick={() => run(() => respondFriendRequest(userId, false), "none")}
          disabled={busy}
          title="Refuser"
          className={`${base} ${glass} hover:text-red-300`}
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => run(() => sendFriendRequest(handle), "pending_out", "Demande envoyée.")}
      disabled={busy}
      className={`${base} ${primary}`}
    >
      <UserPlus size={15} /> Ajouter en ami
    </button>
  );
}
