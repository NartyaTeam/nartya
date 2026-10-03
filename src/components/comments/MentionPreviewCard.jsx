import { Check, ImageOff } from "lucide-react";

export default function MentionPreviewCard({ info, align = "start" }) {
  const { image, title, seasonLabel, description, progress } = info;

  return (
    <div
      className={`pointer-events-none absolute bottom-full z-50 mb-2 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl ${
        align === "end" ? "right-0" : "left-0"
      }`}
    >
      <div className="relative aspect-video w-full bg-surface-2">
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted/60">
            <ImageOff size={20} />
          </div>
        )}
        {progress?.completed ? (
          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-fg shadow-sm">
            <Check size={12} strokeWidth={3} />
          </span>
        ) : (
          progress?.progressPercent > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
              <span
                className="block h-full bg-primary"
                style={{ width: `${Math.max(4, progress.progressPercent)}%` }}
              />
            </div>
          )
        )}
      </div>
      <div className="p-3">
        {seasonLabel && (
          <p className="mb-0.5 truncate text-[0.65rem] font-semibold uppercase tracking-kana text-primary">
            {seasonLabel}
          </p>
        )}
        <h4 className="line-clamp-1 text-sm font-semibold text-text">{title || "Épisode"}</h4>
        {description && (
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted">{description}</p>
        )}
      </div>
    </div>
  );
}
