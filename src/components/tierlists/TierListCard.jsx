import { Link } from "react-router-dom";
import { EyeOff, MessageSquare, ThumbsUp } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { resolveAvatar } from "@/api/profile";
import { readableTextColor } from "@/lib/tierLists";

/** Aperçu : les premières rangées avec leurs premières affiches. */
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
    <div className="overflow-hidden rounded-t-md bg-black">
      {rows.map((tier, i) => (
        <div key={i} className="flex h-12 border-b border-black last:border-b-0">
          <span
            className="flex w-14 shrink-0 items-center justify-center truncate px-1 text-[0.65rem] font-bold"
            style={{ background: tier.color, color: readableTextColor(tier.color) }}
          >
            {tier.label}
          </span>
          <div className="flex flex-1 gap-px overflow-hidden bg-surface-2/60">
            {tier.covers.slice(0, 6).map((c, j) =>
              c.cover ? (
                <img key={j} src={c.cover} alt="" loading="lazy" className="h-full w-[2.1rem] shrink-0 object-cover" />
              ) : (
                <span key={j} className="h-full w-[2.1rem] shrink-0 bg-surface-2" />
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TierListCard({ list }) {
  const name = list.author.username || list.author.handle || "Membre";
  return (
    <Link
      to={`/tierlists/${list.id}`}
      className="group flex flex-col overflow-hidden rounded-md bg-surface ring-2 ring-border transition-[box-shadow,transform] hover:-translate-y-0.5 hover:ring-primary/60"
    >
      <MiniBoard tierMeta={list.tierMeta} preview={list.preview} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-2 text-sm font-bold text-text transition-colors group-hover:text-primary">{list.title}</p>
        <div className="mt-auto flex items-center gap-2 text-xs text-muted">
          <Avatar src={resolveAvatar(list.author)} name={name} className="h-5 w-5" textClassName="text-[0.55rem]" />
          <span className="min-w-0 flex-1 truncate">{name}</span>
          {!list.isPublic && (
            <span className="flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-bold text-text">
              <EyeOff size={11} /> Brouillon
            </span>
          )}
          <span className="flex items-center gap-1 tabular-nums">
            <ThumbsUp size={12} /> {list.likes}
          </span>
          <span className="flex items-center gap-1 tabular-nums">
            <MessageSquare size={12} /> {list.comments}
          </span>
        </div>
      </div>
    </Link>
  );
}
