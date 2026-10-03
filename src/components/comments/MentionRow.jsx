import { Link } from "react-router-dom";
import { Check, ImageOff } from "lucide-react";
import { useMentionInfo } from "@/hooks/useMentionInfo";

function MentionCard({ resolver, season, episode }) {
  const link = resolver?.link?.(season, episode);
  const info = useMentionInfo(resolver, season, episode);

  if (!link) return null;
  if (info === undefined) {
    return <div className="h-[72px] w-60 shrink-0 skeleton rounded-lg" />;
  }
  if (!info) return null;

  return (
    <Link
      to={link.href}
      className="group flex w-64 shrink-0 items-center gap-2.5 rounded-lg bg-surface-2/60 p-2 ring-1 ring-border/60 transition-colors hover:bg-surface-2 hover:ring-primary/30"
    >
      <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded bg-surface">
        {info.image ? (
          <img src={info.image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted/60">
            <ImageOff size={14} />
          </div>
        )}
        {info.progress?.completed && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-fg">
            <Check size={9} strokeWidth={3} />
          </span>
        )}
        {!info.progress?.completed && info.progress?.progressPercent > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-black/50">
            <span
              className="block h-full bg-primary"
              style={{ width: `${Math.max(4, info.progress.progressPercent)}%` }}
            />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {info.seasonLabel && (
          <p className="truncate text-[0.6rem] font-semibold uppercase tracking-kana text-primary/80">
            {info.seasonLabel}
          </p>
        )}
        <p className="line-clamp-2 text-xs font-medium leading-snug text-text group-hover:text-primary">
          {info.title || `Épisode ${episode}`}
        </p>
      </div>
    </Link>
  );
}

export default function MentionRow({ resolver, mentions }) {
  if (!resolver || !mentions?.length) return null;
  return (
    <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
      {mentions.map((m) => (
        <MentionCard key={`${m.season ?? ""}:${m.episode}`} resolver={resolver} season={m.season} episode={m.episode} />
      ))}
    </div>
  );
}
