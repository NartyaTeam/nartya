import { Link } from "react-router-dom";
import { EyeOff, MessageSquare, ThumbsUp } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { resolveAvatar } from "@/api/profile";
import { kindOfSlug, readableTextColor } from "@/lib/tierLists";

/**
 * Aperçu : les premières rangées avec leurs premières affiches. La hauteur est fixe : avec peu de
 * rangées elles s'étirent, pour que le titre reste au même endroit d'une carte à l'autre.
 */
function MiniBoard({ tierMeta, preview }) {
  const rows = tierMeta.slice(0, 4).map((tier) => ({ ...tier, covers: [] }));
  // L'aperçu suit l'ordre du classement : on remplit les rangées dans l'ordre, par couleur.
  let row = 0;
  for (const item of preview) {
    while (row < rows.length && rows[row].color !== item.color) row++;
    if (row >= rows.length) break;
    rows[row].covers.push(item);
  }
  return (
    <div className="flex h-48 flex-col overflow-hidden rounded-t-md bg-surface-2/40">
      {rows.map((tier, i) => (
        <div key={i} className="flex min-h-0 max-h-24 flex-1 border-b border-black last:border-b-0">
          <span
            className="flex w-16 shrink-0 items-center justify-center break-words px-1 text-center text-[0.6rem] font-bold leading-tight [overflow-wrap:anywhere]"
            style={{ background: tier.color, color: readableTextColor(tier.color) }}
          >
            {tier.label}
          </span>
          <div className="flex min-w-0 flex-1 gap-px overflow-hidden bg-surface-2/60">
            {tier.covers.map((c, j) =>
              c.cover ? (
                <img
                  key={j}
                  src={c.cover}
                  alt=""
                  loading="lazy"
                  className={`h-full shrink-0 object-cover ${kindOfSlug(c.slug) === "music" ? "aspect-square" : "aspect-[5/7]"}`}
                />
              ) : (
                <span key={j} className="h-full aspect-[5/7] shrink-0 bg-surface-2" />
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Ruban : les premières affiches à la suite, pour la vue en liste. */
function Strip({ preview }) {
  const covers = preview.filter((c) => c.cover).slice(0, 8);
  return (
    <div className="hidden h-14 w-[15.5rem] shrink-0 gap-px overflow-hidden rounded bg-surface-2 sm:flex">
      {covers.map((c, i) => (
        <img
          key={i}
          src={c.cover}
          alt=""
          loading="lazy"
          className={`h-full shrink-0 object-cover ${kindOfSlug(c.slug) === "music" ? "aspect-square" : "aspect-[5/7]"}`}
        />
      ))}
    </div>
  );
}

const linkClass =
  "group flex flex-col overflow-hidden rounded-md bg-surface ring-2 ring-border transition-[box-shadow,transform] hover:-translate-y-0.5 hover:ring-primary/60";

/** `row` : vue en liste, une tier list par ligne. */
export default function TierListCard({ list, row = false }) {
  const name = list.author.username || list.author.handle || "Membre";
  const stats = (
    <>
      <span className="flex items-center gap-1 tabular-nums">
        <ThumbsUp size={12} /> {list.likes}
      </span>
      <span className="flex items-center gap-1 tabular-nums">
        <MessageSquare size={12} /> {list.comments}
      </span>
    </>
  );
  const draft = !list.isPublic && (
    <span className="flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-bold text-text">
      <EyeOff size={11} /> Brouillon
    </span>
  );

  if (row) {
    return (
      <Link
        to={`/tierlists/${list.id}`}
        className="group flex items-center gap-3 rounded-md bg-surface p-2 ring-2 ring-border transition-colors hover:ring-primary/60"
      >
        <Strip preview={list.preview} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-text transition-colors group-hover:text-primary">{list.title}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            <Avatar src={resolveAvatar(list.author)} name={name} className="h-5 w-5" textClassName="text-[0.55rem]" />
            <span className="truncate">{name}</span>
            {draft}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 pr-2 text-xs text-muted">{stats}</div>
      </Link>
    );
  }

  return (
    <Link to={`/tierlists/${list.id}`} className={linkClass}>
      <MiniBoard tierMeta={list.tierMeta} preview={list.preview} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-5 text-text transition-colors group-hover:text-primary">
          {list.title}
        </p>
        <div className="mt-auto flex items-center gap-2 text-xs text-muted">
          <Avatar src={resolveAvatar(list.author)} name={name} className="h-5 w-5" textClassName="text-[0.55rem]" />
          <span className="min-w-0 flex-1 truncate">{name}</span>
          {draft}
          {stats}
        </div>
      </div>
    </Link>
  );
}
