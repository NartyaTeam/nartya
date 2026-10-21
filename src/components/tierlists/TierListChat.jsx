import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { fr } from "date-fns/locale";
import { Heart, Loader2, MessageCircle, Send, Trash2, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { useHasAccount, guestBlockToast, GUEST_FEATURE_MSG } from "@/lib/guest";
import { useAuthStore } from "@/stores/useAuthStore";
import { resolveAvatar } from "@/api/profile";
import { commentErrorMessage, deleteComment, listComments, postComment, toggleCommentLike } from "@/api/comments";
import { Avatar } from "@/components/ui/Avatar";

const PAGE = 30;
// Les commentaires ne sont pas en temps réel : on relit les derniers tant que la page est visible.
const POLL_MS = 12_000;

const byOldest = (a, b) => new Date(a.createdAt) - new Date(b.createdAt) || (a.id < b.id ? -1 : 1);

function mergeMessages(current, incoming) {
  const map = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].filter((m) => !m.deletedAt).sort(byOldest);
}

function Message({ message, onLike, onDelete }) {
  const name = message.author.username || message.author.handle || "Membre";
  const ago = formatDistanceToNowStrict(new Date(message.createdAt), { locale: fr, addSuffix: false });
  return (
    <div className="group flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.03]">
      <Avatar
        src={resolveAvatar(message.author)}
        name={name}
        className="mt-0.5 h-7 w-7 shrink-0 rounded-full"
        textClassName="text-[10px]"
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5 text-xs">
          {message.author.handle ? (
            <Link to={`/u/${message.author.handle}`} className="truncate font-semibold text-primary hover:underline">
              {name}
            </Link>
          ) : (
            <span className="truncate font-semibold text-primary">{name}</span>
          )}
          <span className="shrink-0 text-[10px] text-white/35">{ago}</span>
        </p>
        <p className="whitespace-pre-line break-words text-sm leading-snug text-white/90">{message.body}</p>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-0.5">
        <button
          type="button"
          onClick={() => onLike(message)}
          aria-label="J'aime"
          className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] tabular-nums transition-colors ${
            message.likedByMe ? "text-primary" : "text-white/30 hover:text-white/70"
          }`}
        >
          <Heart size={12} className={message.likedByMe ? "fill-current" : ""} />
          {message.likes > 0 && message.likes}
        </button>
        {message.canModerate && (
          <button
            type="button"
            onClick={() => onDelete(message)}
            aria-label="Supprimer le message"
            className="rounded p-0.5 text-white/30 opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Chat d'une tier list, façon Watch Party. Les messages sont des commentaires (même
 * modération, mêmes signalements). `docked` : panneau pleine hauteur, sinon bouton flottant.
 */
export default function TierListChat({ target, docked = false }) {
  const hasAccount = useHasAccount();
  const session = useAuthStore((s) => s.session);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(null);
  const [olderDone, setOlderDone] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef(null);
  const stickRef = useRef(true);
  const keepOffsetRef = useRef(null);
  const visible = docked || open;
  const targetKey = `${target.kind}:${target.key}`;

  const fetchLatest = useCallback(
    () => listComments(target, null, PAGE),
    [targetKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    let alive = true;
    setMessages(null);
    fetchLatest()
      .then((rows) => {
        if (!alive) return;
        setMessages(mergeMessages([], rows));
        setOlderDone(rows.length < PAGE);
      })
      .catch(() => alive && setMessages([]));
    return () => {
      alive = false;
    };
  }, [fetchLatest]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      fetchLatest()
        .then((rows) =>
          setMessages((prev) => {
            if (!prev) return prev;
            const next = mergeMessages(prev, rows);
            if (!visible) setUnread((n) => n + Math.max(0, next.length - prev.length));
            return next;
          })
        )
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchLatest, visible]);

  useEffect(() => {
    if (visible) setUnread(0);
  }, [visible]);

  // Reste collé en bas, sauf si on remonte lire l'historique.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !messages) return;
    if (keepOffsetRef.current != null) {
      el.scrollTop = el.scrollHeight - keepOffsetRef.current;
      keepOffsetRef.current = null;
    } else if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, visible]);

  const loadOlder = async () => {
    if (loadingOlder || olderDone || !messages?.length) return;
    setLoadingOlder(true);
    const oldest = messages[0];
    try {
      const rows = await listComments(target, { createdAt: oldest.createdAt, id: oldest.id }, PAGE);
      const el = scrollRef.current;
      if (el) keepOffsetRef.current = el.scrollHeight - el.scrollTop;
      setMessages((prev) => mergeMessages(prev || [], rows));
      setOlderDone(rows.length < PAGE);
    } catch {
      // On réessaiera au prochain défilement.
    } finally {
      setLoadingOlder(false);
    }
  };

  const onScroll = (e) => {
    const el = e.currentTarget;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (el.scrollTop < 60) loadOlder();
  };

  const requireAccount = () => {
    if (hasAccount) return true;
    guestBlockToast(session ? GUEST_FEATURE_MSG : "Connecte-toi pour participer au chat");
    return false;
  };

  const submit = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending || !requireAccount()) return;
    setSending(true);
    try {
      await postComment(target, body);
      setText("");
      stickRef.current = true;
      const rows = await fetchLatest();
      setMessages((prev) => mergeMessages(prev || [], rows));
    } catch (err) {
      toast.error(commentErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const like = async (message) => {
    if (!requireAccount()) return;
    const flip = (m) =>
      m.id === message.id ? { ...m, likedByMe: !m.likedByMe, likes: m.likes + (m.likedByMe ? -1 : 1) } : m;
    setMessages((prev) => prev.map(flip));
    try {
      await toggleCommentLike(message.id);
    } catch (err) {
      setMessages((prev) => prev.map(flip));
      toast.error(commentErrorMessage(err));
    }
  };

  const remove = async (message) => {
    try {
      await deleteComment(message.id);
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
    } catch (err) {
      toast.error(commentErrorMessage(err));
    }
  };

  const body = (
    <>
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-2">
        {messages === null ? (
          <div className="flex justify-center py-10 text-white/40">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : messages.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-white/40">
            Aucun message. Donne ton avis sur cette tier list !
          </p>
        ) : (
          <>
            {loadingOlder && (
              <div className="flex justify-center py-2 text-white/40">
                <Loader2 className="animate-spin" size={14} />
              </div>
            )}
            {messages.map((m) => (
              <Message key={m.id} message={m} onLike={like} onDelete={remove} />
            ))}
          </>
        )}
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-white/10 p-2.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => !hasAccount && requireAccount()}
          maxLength={500}
          placeholder={hasAccount ? "Ton avis sur cette tier list…" : "Connecte-toi pour écrire"}
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-white placeholder:text-white/40 focus:border-primary/60 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Envoyer"
          disabled={!text.trim() || sending}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </>
  );

  const count = messages?.length ?? 0;

  if (docked) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <MessageCircle size={16} className="text-primary" />
          <span className="font-display text-base font-bold text-white">Chat</span>
          {count > 0 && <span className="text-xs tabular-nums text-white/40">{count}{olderDone ? "" : "+"}</span>}
        </div>
        {body}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le chat"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-fg shadow-xl active:scale-95"
      >
        <MessageCircle size={18} /> Chat
        {(unread > 0 || count > 0) && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-black/30 px-1.5 text-[11px] tabular-nums">
            {unread > 0 ? `+${unread}` : count}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-auto flex h-[78dvh] flex-col overflow-hidden rounded-t-xl border border-white/10 bg-[#121212] pb-[env(safe-area-inset-bottom)] shadow-2xl"
        style={{ animation: "epSelSlide 0.2s ease" }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="flex items-center gap-2 font-display text-base font-bold text-white">
            <MessageCircle size={16} className="text-primary" /> Chat
          </span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fermer le chat" className="text-white/60 hover:text-white">
            <X size={18} />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
