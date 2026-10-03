import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { useMentionInfo } from "@/hooks/useMentionInfo";
import MentionPreviewCard from "./MentionPreviewCard";

/** Libellé de repli (« S1 · Ép. 5 »), puis le vrai titre dès que `resolver.info` répond. */
export default function MentionPill({ resolver, season, episode, raw }) {
  const link = resolver?.link?.(season, episode);
  const info = useMentionInfo(resolver, season, episode);
  const [hover, setHover] = useState(false);
  const hideTimer = useRef(null);

  if (!link) return raw;

  const show = () => {
    clearTimeout(hideTimer.current);
    setHover(true);
  };
  const hide = () => {
    hideTimer.current = setTimeout(() => setHover(false), 120);
  };

  const label = info?.title
    ? `${info.seasonLabel ? info.seasonLabel + " · " : ""}${info.title}`
    : link.label;

  return (
    <span className="relative inline-block" onMouseEnter={show} onMouseLeave={hide}>
      <Link
        to={link.href}
        className="mx-0.5 inline-flex max-w-[18rem] items-center gap-1 truncate rounded bg-primary/15 px-1.5 py-0.5 align-baseline text-[0.82em] font-semibold text-primary ring-1 ring-primary/25 transition-colors hover:bg-primary/25"
      >
        {info?.progress?.completed && <Check size={11} className="shrink-0" strokeWidth={3} />}
        <span className="truncate">{label}</span>
      </Link>
      {hover && info && <MentionPreviewCard info={info} />}
    </span>
  );
}
