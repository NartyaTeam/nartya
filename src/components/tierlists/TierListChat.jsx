import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronDown, Heart, Loader2, MessageCircle, Reply, Send, Trash2, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { useHasAccount, guestBlockToast, GUEST_FEATURE_MSG } from "@/lib/guest";
import { useAuthStore } from "@/stores/useAuthStore";
import { resolveAvatar } from "@/api/profile";
import {
  commentErrorMessage,
  deleteComment,
  listComments,
  listReplies,
  postComment,
  toggleCommentLike,
} from "@/api/comments";
import { Avatar } from "@/components/ui/Avatar";

const PAGE = 30;
// Les commentaires ne sont pas en temps réel : on relit les derniers tant que la page est visible.
const POLL_MS = 12_000;

const byOldest = (a, b) => new Date(a.createdAt) - new Date(b.createdAt) || (a.id < b.id ? -1 : 1);

/** Applique `fn` aux réponses de chaque fil chargé. */
function mapThreads(threads, fn) {
  return Object.fromEntries(
    Object.entries(threads).map(([id, t]) => [id, t.replies ? { ...t, replies: fn(t.replies) } : t])
  );
}

function mergeMessages(current, incoming) {
  const map = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].filter((m) => !m.deletedAt).sort(byOldest);
}

const authorName = (m) => m.author.username || m.author.handle || "Membre";

/**
 * `thread` (racine seulement) : { replies, open, loading }. Les réponses n'ont qu'un niveau,
 * comme les commentaires des fiches : répondre à une réponse reste dans le même fil.
 */
function Message({ message, onLike, onDelete, onReply, thread, onToggleThread, isReply = false }) {
  const name = authorName(message);
  const ago = formatDistanceToNowStrict(new Date(message.createdAt), { locale: fr, addSuffix: false });
  return (
    <div className="group flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.03]">
      <Avatar
        src={resolveAvatar(message.author)}
        name={name}
        className={`mt-0.5 shrink-0 rounded-full ${isReply ? "h-6 w-6" : "h-7 w-7"}`}
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
        <div className="mt-0.5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onReply(message)}
            className="flex items-center gap-1 text-[11px] font-semibold text-white/35 transition-colors hover:text-white/80"
          >
            <Reply size={11} />
            Répondre
          </button>
          {!isReply && message.replies > 0 && (
            <button
              type="button"
              onClick={() => onToggleThread(message)}
              className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-80"
            >
              {thread?.loading ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <ChevronDown size={11} className={thread?.open ? "rotate-180" : ""} />
              )}
              {message.replies} réponse{message.replies > 1 ? "s" : ""}
            </button>
          )}
        </div>
        {!isReply && thread?.open && thread.replies?.length > 0 && (
          <div className="mt-1 space-y-0.5 border-l border-white/10 pl-1.5">
            {thread.replies.map((r) => (
              <Message
                key={r.id}
                message={r}
                onLike={onLike}
                onDelete={onDelete}
                onReply={() => onReply(message, r)}
                isReply
              />
            ))}
          </div>
        )}
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
  // id du message racine -> { replies, open, loading }
  const [threads, setThreads] = useState({});
  // { parent, name } : le message auquel on répond, et l'auteur cité.
  const [replyTo, setReplyTo] = useState(null);
  const inputRef = useRef(null);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
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
    setThreads({});
    setReplyTo(null);
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

  const loadThread = useCallback(async (parentId) => {
    setThreads((prev) => ({ ...prev, [parentId]: { ...prev[parentId], open: true, loading: true } }));
    try {
      const replies = (await listReplies(parentId, 100)).filter((r) => !r.deletedAt).sort(byOldest);
      setThreads((prev) => ({ ...prev, [parentId]: { replies, open: true, loading: false } }));
    } catch (err) {
      setThreads((prev) => ({ ...prev, [parentId]: { ...prev[parentId], loading: false } }));
      toast.error(commentErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      fetchLatest()
        .then((rows) => {
          setMessages((prev) => {
            if (!prev) return prev;
            const next = mergeMessages(prev, rows);
            if (!visible) setUnread((n) => n + Math.max(0, next.length - prev.length));
            return next;
          });
          // Un fil ouvert dont le nombre de réponses a changé est relu.
          for (const row of rows) {
            const thread = threadsRef.current[row.id];
            if (thread?.open && !thread.loading && thread.replies?.length !== row.replies) loadThread(row.id);
          }
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchLatest, visible, loadThread]);

  useEffect(() => {
    if (visible) setUnread(0);
  }, [visible]);

  // Clavier mobile : quand la page n'est pas redimensionnée (Android plein écran, iPhone), il
  // recouvrirait le champ de saisie. La hauteur cachée se lit sur le viewport visuel.
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (docked || !open || !vv) return;
    const update = () => setKeyboardInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setKeyboardInset(0);
    };
  }, [docked, open]);

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
      const parentId = replyTo?.parent.id || null;
      await postComment(target, body, { parentId });
      setText("");
      setReplyTo(null);
      if (!parentId) stickRef.current = true;
      const rows = await fetchLatest();
      setMessages((prev) => mergeMessages(prev || [], rows));
      if (parentId) await loadThread(parentId);
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
    const flipAll = () => {
      setMessages((prev) => prev.map(flip));
      setThreads((prev) => mapThreads(prev, (replies) => replies.map(flip)));
    };
    flipAll();
    try {
      await toggleCommentLike(message.id);
    } catch (err) {
      flipAll();
      toast.error(commentErrorMessage(err));
    }
  };

  const remove = async (message) => {
    try {
      await deleteComment(message.id);
      const parentId = Object.keys(threads).find((id) => threads[id].replies?.some((r) => r.id === message.id));
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== message.id)
          .map((m) => (m.id === parentId ? { ...m, replies: Math.max(0, m.replies - 1) } : m))
      );
      setThreads((prev) => mapThreads(prev, (replies) => replies.filter((r) => r.id !== message.id)));
    } catch (err) {
      toast.error(commentErrorMessage(err));
    }
  };

  const toggleThread = (message) => {
    const thread = threads[message.id];
    if (thread?.replies && !thread.loading) {
      setThreads((prev) => ({ ...prev, [message.id]: { ...thread, open: !thread.open } }));
    } else if (!thread?.loading) {
      loadThread(message.id);
    }
  };

  // Une réponse à une réponse reste dans le fil racine, en citant son auteur.
  const startReply = (parent, reply = null) => {
    if (!requireAccount()) return;
    const name = authorName(reply || parent);
    setReplyTo({ parent, name });
    if (reply && !text.trim()) setText(`@${name} `);
    inputRef.current?.focus();
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
              <Message
                key={m.id}
                message={m}
                onLike={like}
                onDelete={remove}
                onReply={startReply}
                thread={threads[m.id]}
                onToggleThread={toggleThread}
              />
            ))}
          </>
        )}
      </div>
      {replyTo && (
        <div className="flex items-center gap-2 border-t border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-white/55">
          <Reply size={12} className="shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            Réponse à <span className="font-semibold text-white/85">{replyTo.name}</span>
          </span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label="Annuler la réponse"
            className="rounded p-0.5 text-white/40 hover:text-white"
          >
            <X size={13} />
          </button>
        </div>
      )}
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-white/10 p-2.5">
        <input
          ref={inputRef}
          onKeyDown={(e) => {
            if (e.key === "Escape" && replyTo) {
              e.preventDefault();
              setReplyTo(null);
            }
          }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => !hasAccount && requireAccount()}
          maxLength={500}
          placeholder={
            !hasAccount
              ? "Connecte-toi pour écrire"
              : replyTo
                ? `Répondre à ${replyTo.name}…`
                : "Ton avis sur cette tier list…"
          }
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

  // Au-dessus de la barre de navigation mobile (z-70), qui sinon recouvre le champ de saisie.
  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-black/60 backdrop-blur-sm"
      style={{ paddingBottom: keyboardInset }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`mt-auto flex h-[78dvh] max-h-full flex-col overflow-hidden rounded-t-xl border border-white/10 bg-[#121212] shadow-2xl ${
          keyboardInset ? "" : "pb-[env(safe-area-inset-bottom)]"
        }`}
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
