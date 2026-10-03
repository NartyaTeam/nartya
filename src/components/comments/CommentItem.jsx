import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  Flag,
  Heart,
  Loader2,
  MoreHorizontal,
  Pencil,
  Reply,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { resolveAvatar } from "@/api/profile";
import { avatarShapeClass } from "@/lib/cosmetics";
import { useAuthStore } from "@/stores/useAuthStore";
import { Avatar } from "@/components/ui/Avatar";
import AvatarFrame from "@/components/ambient/AvatarFrame";
import RoleBadge from "@/components/profile/RoleBadge";
import RankBadge from "@/components/profile/RankBadge";
import SupporterBadge from "@/components/profile/SupporterBadge";
import { extractMentions, renderCommentBody } from "@/lib/commentMentions";
import MentionRow from "./MentionRow";
import {
  commentErrorMessage,
  deleteComment,
  editComment,
  listReplies,
  postComment,
  reportComment,
  toggleCommentLike,
} from "@/api/comments";
import CommentComposer from "./CommentComposer";

/** Date absolue au-delà d'une semaine. */
function timeAgo(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

const REPORT_REASONS = [
  "Spoiler non signalé",
  "Insultes / harcèlement",
  "Spam ou publicité",
  "Contenu haineux",
  "Hors sujet",
];

/** Les réponses arrivent au clic sur « N réponses », pas avec le fil. */
export default function CommentItem({
  comment,
  target,
  resolveMention,
  seasons = [],
  allowMentions = true,
  canWrite,
  myRating,
  onGuestAction,
  onPatch,
  onRemove,
  isReply = false,
}) {
  const c = comment;
  const deleted = !!c.deletedAt;
  const me = useAuthStore((s) => s.user);

  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [liking, setLiking] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const [replies, setReplies] = useState(null); // null = jamais ouvert
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  const guard = () => {
    if (canWrite) return true;
    onGuestAction?.();
    return false;
  };

  const like = async () => {
    if (!guard() || liking) return;
    setLiking(true);
    // Optimiste, annulé si l'appel échoue.
    const before = { likedByMe: c.likedByMe, likes: c.likes };
    onPatch?.(c.id, { likedByMe: !c.likedByMe, likes: c.likes + (c.likedByMe ? -1 : 1) });
    try {
      const now = await toggleCommentLike(c.id);
      onPatch?.(c.id, { likedByMe: now });
    } catch (e) {
      onPatch?.(c.id, before);
      toast.error(commentErrorMessage(e));
    } finally {
      setLiking(false);
    }
  };

  const saveEdit = async (body, { spoiler }) => {
    try {
      await editComment(c.id, body, spoiler);
      onPatch?.(c.id, { body, isSpoiler: spoiler, editedAt: new Date().toISOString() });
      setEditing(false);
      return true;
    } catch (e) {
      toast.error(commentErrorMessage(e));
      return false;
    }
  };

  const remove = async () => {
    setMenu(false);
    try {
      await deleteComment(c.id);
      // Une racine emporte tout son fil, une réponse part seule.
      onRemove?.(c.id);
    } catch (e) {
      toast.error(commentErrorMessage(e));
    }
  };

  const report = async (reason) => {
    setReporting(false);
    setMenu(false);
    try {
      // `false` = déjà signalé par ce membre.
      const sent = await reportComment(c.id, reason);
      if (sent) toast.success("Message signalé. Merci — l'équipe va le relire.");
      else toast.info("Tu as déjà signalé ce message — l'équipe doit encore le relire.");
    } catch (e) {
      toast.error(commentErrorMessage(e));
    }
  };

  const openReplies = async () => {
    if (replies) return setReplies(null);
    setRepliesLoading(true);
    try {
      setReplies(await listReplies(c.id, 50));
    } catch (e) {
      toast.error(commentErrorMessage(e));
    } finally {
      setRepliesLoading(false);
    }
  };

  const sendReply = async (body, { spoiler }) => {
    try {
      const id = await postComment(target, body, { parentId: c.id, spoiler });
      const row = buildLocalComment({ id, body, spoiler, author: me, animeRating: myRating ?? null });
      // Réponses jamais ouvertes : seule la nouvelle est affichée.
      setReplies((prev) => [...(prev || []), row]);
      onPatch?.(c.id, { replies: c.replies + 1 });
      setReplyOpen(false);
      return true;
    } catch (e) {
      toast.error(commentErrorMessage(e));
      return false;
    }
  };

  const avatarUrl = resolveAvatar(c.author);
  // Déjà filtré par palier côté serveur.
  const ornament = c.author?.cosmetic_ornament || null;
  const name = c.author?.username || c.author?.handle || "Membre";
  const displayedRating = c.author?.id === me?.id && myRating !== undefined
    ? myRating
    : c.animeRating;
  const hidden = c.isSpoiler && !revealed && !deleted;
  const mentions = useMemo(() => extractMentions(c.body), [c.body]);

  return (
    <li className={isReply ? "" : "border-b border-border/60 pb-4 last:border-0"}>
      <div className="flex gap-3">
        <Link
          to={c.author?.handle ? `/u/${c.author.handle}` : "#"}
          className={`relative shrink-0 ${isReply ? "h-7 w-7" : "h-9 w-9"}`}
        >
          <Avatar
            src={avatarUrl}
            name={name}
            className={`${isReply ? "h-7 w-7" : "h-9 w-9"} ${avatarShapeClass(ornament, "rounded-full")}`}
            textClassName="text-xs"
          />
          {ornament && <AvatarFrame token={ornament} />}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to={c.author?.handle ? `/u/${c.author.handle}` : "#"}
              className="text-sm font-semibold text-text hover:text-primary"
            >
              {name}
            </Link>
            {displayedRating != null && (
              <span
                title={`Note donnée à cet anime : ${displayedRating}/5`}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums text-primary ring-1 ring-primary/20"
              >
                <Star size={10} className="fill-current" />
                {displayedRating}/5
              </span>
            )}
            <RoleBadge role={c.author?.role} />
            <RankBadge rank={c.author?.rankBadge} />
            <SupporterBadge profile={c.author} />
            <span className="text-[0.7rem] text-muted/70">
              {timeAgo(c.createdAt)}
              {c.editedAt && " · modifié"}
            </span>

            {!deleted && (
              <div className="relative ml-auto">
                <button
                  onClick={() => setMenu((v) => !v)}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-text"
                  title="Options"
                >
                  <MoreHorizontal size={15} />
                </button>
                {menu && (
                  <>
                    <div className="fixed inset-0 z-40" onMouseDown={() => setMenu(false)} />
                    <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-2xl">
                      {c.canModerate && (
                        <>
                          <button
                            onClick={() => {
                              setMenu(false);
                              setEditing(true);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-surface-2"
                          >
                            <Pencil size={13} />
                            Modifier
                          </button>
                          <button
                            onClick={remove}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-primary hover:bg-surface-2"
                          >
                            <Trash2 size={13} />
                            Supprimer
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          if (!guard()) return setMenu(false);
                          setMenu(false);
                          setReporting(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-text"
                      >
                        <Flag size={13} />
                        Signaler
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {deleted ? (
            <p className="mt-1 text-sm italic text-muted/70">Message supprimé.</p>
          ) : editing ? (
            <div className="mt-2">
              <CommentComposer
                compact
                autoFocus
                seasons={seasons}
                resolver={resolveMention}
                allowMentions={allowMentions}
                initialBody={c.body}
                initialSpoiler={c.isSpoiler}
                submitLabel="Enregistrer"
                onSubmit={saveEdit}
                onCancel={() => setEditing(false)}
              />
            </div>
          ) : (
            <div className="relative mt-1">
              <p
                className={`whitespace-pre-wrap break-words text-sm leading-relaxed text-text/90 ${
                  hidden ? "select-none blur-[6px]" : ""
                }`}
              >
                {renderCommentBody(c.body, resolveMention)}
              </p>
              {hidden && (
                <button
                  onClick={() => setRevealed(true)}
                  className="absolute inset-0 flex items-center justify-center rounded bg-surface/40 text-[0.7rem] font-semibold uppercase tracking-kana text-primary"
                >
                  Spoiler · afficher
                </button>
              )}
            </div>
          )}

          {/* Masqués tant que le spoiler n'est pas révélé. */}
          {!deleted && !editing && !hidden && (
            <MentionRow resolver={resolveMention} mentions={mentions} />
          )}

          {reporting && (
            <div className="mt-2 rounded-lg bg-surface-2 p-2.5 ring-1 ring-border">
              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-kana text-muted">
                Motif du signalement
              </p>
              <div className="flex flex-wrap gap-1.5">
                {REPORT_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => report(r)}
                    className="rounded-md bg-surface px-2 py-1 text-xs text-muted ring-1 ring-border transition-colors hover:text-primary hover:ring-primary/40"
                  >
                    {r}
                  </button>
                ))}
                <button
                  onClick={() => setReporting(false)}
                  className="rounded-md px-2 py-1 text-xs text-muted hover:text-text"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {!deleted && !editing && (
            <div className="mt-2 flex items-center gap-4">
              <button
                onClick={like}
                disabled={liking}
                className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                  c.likedByMe ? "text-primary" : "text-muted hover:text-text"
                }`}
              >
                <Heart size={13} fill={c.likedByMe ? "currentColor" : "none"} />
                {c.likes > 0 && <span className="tabular-nums">{c.likes}</span>}
              </button>
              {!isReply && (
                <button
                  onClick={() => (guard() ? setReplyOpen((v) => !v) : null)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-text"
                >
                  <Reply size={13} />
                  Répondre
                </button>
              )}
            </div>
          )}

          {!isReply && (c.replies > 0 || replyOpen) && (
            <div className="mt-3">
              {c.replies > 0 && (
                <button
                  onClick={openReplies}
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80"
                >
                  {repliesLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <ChevronDown size={13} className={replies ? "rotate-180" : ""} />
                  )}
                  {c.replies} réponse{c.replies > 1 ? "s" : ""}
                </button>
              )}

              {replies && replies.length > 0 && (
                <ul className="mt-3 space-y-4 border-l border-border/70 pl-4">
                  {replies.map((r) => (
                    <CommentItem
                      key={r.id}
                      comment={r}
                      target={target}
                      resolveMention={resolveMention}
                      seasons={seasons}
                      allowMentions={allowMentions}
                      canWrite={canWrite}
                      myRating={myRating}
                      onGuestAction={onGuestAction}
                      isReply
                      onPatch={(id, patch) =>
                        setReplies((prev) =>
                          prev.map((x) => (x.id === id ? { ...x, ...patch } : x))
                        )
                      }
                      onRemove={(id) => {
                        setReplies((prev) => prev.filter((x) => x.id !== id));
                        onPatch?.(c.id, { replies: Math.max(0, c.replies - 1) });
                      }}
                    />
                  ))}
                </ul>
              )}

              {replyOpen && (
                <div className="mt-3 border-l border-border/70 pl-4">
                  <CommentComposer
                    compact
                    autoFocus
                    seasons={seasons}
                    resolver={resolveMention}
                    allowMentions={allowMentions}
                    placeholder={`Répondre à ${name}…`}
                    submitLabel="Répondre"
                    onSubmit={sendReply}
                    onCancel={() => setReplyOpen(false)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** Affichée sans recharger le fil. */
export function buildLocalComment({ id, body, spoiler, author, animeRating = null }) {
  return {
    id,
    body,
    isSpoiler: !!spoiler,
    likes: 0,
    replies: 0,
    likedByMe: false,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    canModerate: true,
    animeRating,
    author: author || null,
  };
}
