import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, MessageSquare, RotateCw } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/stores/useAuthStore";
import { useHasAccount, guestBlockToast } from "@/lib/guest";
import {
  commentErrorMessage,
  countComments,
  listComments,
  postComment,
} from "@/api/comments";
import CommentComposer from "./CommentComposer";
import CommentItem, { buildLocalComment } from "./CommentItem";

const PAGE = 15;

/**
 * Rien n'est demandé au serveur avant l'ouverture de l'onglet ; un montage coûte deux RPC.
 * `seasons` : [{ number, label, episodeCount? }] ; `myRating` rafraîchit les badges du membre.
 */
export default function CommentsSection({
  target,
  resolveMention,
  seasons = [],
  className = "",
  showHeader = true,
  allowMentions = true,
  myRating,
}) {
  const targetKey = `${target?.kind}:${target?.key}`;
  const me = useAuthStore((s) => s.user);
  const hasAccount = useHasAccount();

  const [items, setItems] = useState([]);
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(
    async (cursor) => {
      setLoading(true);
      setError(false);
      try {
        const rows = await listComments(target, cursor, PAGE);
        setItems((prev) => (cursor ? [...prev, ...rows] : rows));
        setDone(rows.length < PAGE);
      } catch (e) {
        setError(true);
        if (cursor) toast.error(commentErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [targetKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Au montage, c'est-à-dire à l'ouverture de l'onglet.
  useEffect(() => {
    if (!target?.key) return;
    setItems([]);
    setDone(false);
    setCount(null);
    load(null);
    countComments(target)
      .then(setCount)
      .catch(() => {});
  }, [targetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = () => {
    const last = items[items.length - 1];
    if (last) load({ createdAt: last.createdAt, id: last.id });
  };

  const patch = (id, p) =>
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    setCount((n) => (n == null ? n : Math.max(0, n - 1)));
  };

  const publish = async (body, { spoiler }) => {
    try {
      const id = await postComment(target, body, { spoiler });
      setItems((prev) => [buildLocalComment({ id, body, spoiler, author: me, animeRating: myRating ?? null }), ...prev]);
      setCount((n) => (n == null ? n : n + 1));
      return true;
    } catch (e) {
      toast.error(commentErrorMessage(e));
      return false;
    }
  };

  return (
    <section className={`pt-6 ${className}`}>
      {(showHeader || (count != null && count > 0)) && (
        <div className="flex items-center gap-3 pb-4">
          {showHeader && (
            <>
              <h2 className="section-title !text-xl">Commentaires</h2>
            </>
          )}
          {count != null && count > 0 && (
            <span
              className={`text-xs font-semibold tabular-nums text-muted ${
                showHeader ? "" : "uppercase tracking-kana"
              }`}
            >
              {count} {!showHeader && `commentaire${count > 1 ? "s" : ""}`}
            </span>
          )}
        </div>
      )}

      <div className="mb-6">
        <button
          onClick={() => (hasAccount ? setComposerOpen((v) => !v) : guestBlockToast("Crée un compte gratuit pour commenter"))}
          className="flex w-full items-center justify-between rounded-xl bg-surface-2/80 px-4 py-3 text-sm font-medium text-muted ring-1 ring-border/70 transition-colors hover:text-text"
        >
          <span className="flex items-center gap-2">
            <MessageSquare size={15} />
            {hasAccount ? "Écrire un commentaire" : "Crée un compte gratuit pour rejoindre la discussion"}
          </span>
          {hasAccount && (
            <ChevronDown size={16} className={`transition-transform ${composerOpen ? "rotate-180" : ""}`} />
          )}
        </button>

        {hasAccount && composerOpen && (
          <div className="mt-3">
            <CommentComposer
              onSubmit={publish}
              seasons={seasons}
              resolver={resolveMention}
              allowMentions={allowMentions}
              autoFocus
            />
          </div>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 skeleton rounded-md" />
          ))}
        </div>
      ) : error && items.length === 0 ? (
        <div className="flex justify-center py-14">
          <button
            onClick={() => load(null)}
            className="flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80"
          >
            <RotateCw size={14} />
            Les commentaires n'ont pas pu être chargés — réessayer
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-sm text-muted/80">
          <MessageSquare size={18} />
          Aucun commentaire pour l'instant — lance la discussion.
        </div>
      ) : (
        <>
          <ul className="space-y-4">
            {items.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                target={target}
                resolveMention={resolveMention}
                seasons={seasons}
                allowMentions={allowMentions}
                canWrite={hasAccount}
                myRating={myRating}
                onGuestAction={() => guestBlockToast("Crée un compte gratuit pour commenter")}
                onPatch={patch}
                onRemove={remove}
              />
            ))}
          </ul>

          {!done && (
            <button
              onClick={more}
              disabled={loading}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-surface py-2.5 text-sm font-semibold text-muted ring-1 ring-border transition-colors hover:text-text disabled:opacity-50"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Charger plus de commentaires
            </button>
          )}
        </>
      )}
    </section>
  );
}
