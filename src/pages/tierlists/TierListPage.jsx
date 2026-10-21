import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Copy, Download, EyeOff, LayoutList, Loader2, Pencil, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { saveImage } from "@/lib/saveImage";
import { renderTierList } from "@/lib/renderTierList";
import { useHasAccount, guestBlockToast, GUEST_FEATURE_MSG } from "@/lib/guest";
import { useAuthStore } from "@/stores/useAuthStore";
import { resolveAvatar } from "@/api/profile";
import { deleteTierList, getTierList, tierListErrorMessage, tierListTarget, voteTierList } from "@/api/tierLists";
import { Avatar } from "@/components/ui/Avatar";
import ConfirmModal from "@/components/ui/ConfirmModal";
import TierBoard from "@/components/tierlists/TierBoard";
import TierListChat from "@/components/tierlists/TierListChat";

// Chat à droite, comme la Watch Party, dès qu'il y a la place ; sinon bouton flottant.
const WIDE = "(min-width: 1280px)";

function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const update = () => setWide(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

const actionClass =
  "flex h-10 items-center gap-2 rounded-md bg-surface px-3.5 text-sm font-bold text-text ring-2 ring-border transition-colors hover:ring-primary/60 active:scale-95 disabled:opacity-50";

export default function TierListPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const hasAccount = useHasAccount();
  const session = useAuthStore((s) => s.session);
  const [list, setList] = useState(undefined);
  const [voting, setVoting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const wide = useWide();

  useEffect(() => {
    let alive = true;
    setList(undefined);
    getTierList(id)
      .then((data) => alive && setList(data))
      .catch(() => alive && setList(null));
    return () => {
      alive = false;
    };
  }, [id]);

  if (list === undefined) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center text-muted">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (list === null) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
        <LayoutList size={32} className="text-primary" />
        <p className="text-sm text-muted">Cette tier list n'existe pas ou n'est plus publique.</p>
        <Link to="/tierlists" className="text-sm font-bold text-primary">
          Voir les tier lists
        </Link>
      </div>
    );
  }

  const authorName = list.author.username || list.author.handle || "Membre";
  const requireAccount = () => {
    if (hasAccount) return true;
    guestBlockToast(session ? GUEST_FEATURE_MSG : "Connecte-toi pour voter");
    return false;
  };

  const vote = async (value) => {
    if (list.isMine) {
      toast.info("Tu ne peux pas voter pour ta propre tier list : ce sont les autres qui votent !");
      return;
    }
    if (!requireAccount() || voting) return;
    const next = list.myVote === value ? 0 : value;
    setVoting(true);
    try {
      const counts = await voteTierList(list.id, next);
      setList((prev) => ({ ...prev, ...counts }));
    } catch (e) {
      toast.error(tierListErrorMessage(e));
    } finally {
      setVoting(false);
    }
  };

  const exportImage = async () => {
    setExporting(true);
    try {
      const blob = await renderTierList({ title: list.title, authorName, tiers: list.tiers });
      const where = await saveImage(blob, `tierlist-${list.title.replace(/[^\w-]+/g, "-").slice(0, 40) || "nartya"}.png`);
      toast.success(where === "gallery" ? "Image enregistrée dans Images › Nartya" : "Image enregistrée");
    } catch {
      toast.error("Impossible de créer l'image");
    } finally {
      setExporting(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    try {
      await deleteTierList(list.id);
      toast.success("Tier list supprimée");
      navigate("/tierlists?tab=mine", { replace: true });
    } catch (e) {
      toast.error(tierListErrorMessage(e));
    }
  };

  const date = list.publishedAt || list.updatedAt;

  return (
    <div className="animate-fade-in px-4 pb-24 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-8 md:py-10 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-6">
      <div className="min-w-0">
      <header className="mb-5 max-w-5xl">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-px w-6 bg-primary" />
          <Link to="/tierlists" className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-primary/80 hover:text-primary">
            Tier list
          </Link>
          {!list.isPublic && (
            <span className="flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-bold text-text">
              <EyeOff size={11} /> Brouillon, visible par toi seul
            </span>
          )}
        </div>
        <h1 className="t-impact text-3xl md:text-4xl">{list.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Avatar src={resolveAvatar(list.author)} name={authorName} className="h-6 w-6" textClassName="text-[0.6rem]" />
          {list.author.handle ? (
            <Link to={`/u/${list.author.handle}`} className="font-semibold text-text hover:text-primary">
              {authorName}
            </Link>
          ) : (
            <span className="font-semibold text-text">{authorName}</span>
          )}
          {date && <span>· {format(new Date(date), "d MMMM yyyy", { locale: fr })}</span>}
          <span>· {list.itemCount} anime{list.itemCount > 1 ? "s" : ""}</span>
          {list.forkedFrom?.title && (
            <span>
              · inspirée de{" "}
              <Link to={`/tierlists/${list.forkedFrom.id}`} className="text-text hover:text-primary">
                {list.forkedFrom.title}
              </Link>
            </span>
          )}
        </div>
        {list.description && <p className="mt-3 max-w-2xl whitespace-pre-line text-sm text-text/85">{list.description}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {list.isPublic && (
            <>
              <button
                onClick={() => vote(1)}
                disabled={voting}
                title={list.isMine ? "Tu ne peux pas voter pour ta propre tier list" : "J'aime"}
                className={`${actionClass} ${list.myVote === 1 ? "bg-primary/15 text-primary ring-primary/70" : ""}`}
              >
                <ThumbsUp size={16} className={list.myVote === 1 ? "fill-current" : ""} />
                <span className="tabular-nums">{list.likes}</span>
              </button>
              <button
                onClick={() => vote(-1)}
                disabled={voting}
                title={list.isMine ? "Tu ne peux pas voter pour ta propre tier list" : "Je n'aime pas"}
                className={`${actionClass} ${list.myVote === -1 ? "bg-white/10 ring-white/40" : ""}`}
              >
                <ThumbsDown size={16} className={list.myVote === -1 ? "fill-current" : ""} />
                <span className="tabular-nums">{list.dislikes}</span>
              </button>
            </>
          )}
          {!list.isMine && (
            <button
              onClick={() => requireAccount() && navigate(`/tierlists/new?from=${list.id}`)}
              className={actionClass}
            >
              <Copy size={16} /> Faire ma version
            </button>
          )}
          <button onClick={exportImage} disabled={exporting} className={actionClass}>
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Image
          </button>
          {list.isMine && (
            <button onClick={() => navigate(`/tierlists/${list.id}/edit`)} className={actionClass}>
              <Pencil size={16} /> Modifier
            </button>
          )}
          {list.canModerate && (
            <button onClick={() => setConfirmDelete(true)} className={`${actionClass} hover:text-primary`}>
              <Trash2 size={16} /> Supprimer
            </button>
          )}
        </div>
      </header>

      <div className="max-w-5xl">
        <TierBoard tiers={list.tiers} onOpen={(item) => navigate(`/anime/${item.slug}`)} />
      </div>

      </div>

      {list.isPublic &&
        (wide ? (
          <aside className="sticky top-20 flex h-[calc(100dvh-6.5rem)] min-h-[24rem] flex-col overflow-hidden rounded-lg bg-[#121212] ring-2 ring-border">
            <TierListChat target={tierListTarget(list.id)} docked />
          </aside>
        ) : (
          <TierListChat target={tierListTarget(list.id)} />
        ))}

      {confirmDelete && (
        <ConfirmModal
          eyebrow="Tier list"
          title="Supprimer cette tier list ?"
          confirmLabel="Supprimer"
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        >
          Ses votes et ses commentaires seront supprimés aussi. C'est définitif.
        </ConfirmModal>
      )}
    </div>
  );
}
