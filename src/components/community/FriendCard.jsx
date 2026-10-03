import { Link } from "react-router-dom";
import { Avatar } from "@/components/ui/Avatar";
import { resolveAvatar } from "@/api/profile";
import { cosmeticRingStyle } from "@/lib/cosmetics";
import { presenceFrom } from "@/lib/presence";
import RoleBadge from "@/components/profile/RoleBadge";
import SupporterBadge from "@/components/profile/SupporterBadge";

/** `action` reçoit le bouton contextuel. */
export default function FriendCard({ person, action = null }) {
  const presence = presenceFrom(person.lastActive);
  const ring = cosmeticRingStyle(person);
  return (
    <div className="flex items-center gap-3 rounded-md bg-surface p-3 ring-1 ring-border">
      <Link
        to={`/u/${person.handle}`}
        className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-90"
      >
        <div className="relative h-11 w-11 shrink-0">
          <Avatar
            src={resolveAvatar(person)}
            name={person.username}
            className="h-11 w-11 max-w-none rounded-full"
            textClassName="text-sm"
          />
          {/* Dans un calque au-dessus de l'image : un box-shadow inset sur l'<img> serait masqué. */}
          {ring && (
            <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full" style={ring} />
          )}
          {/* En ligne (< 5 min) */}
          {presence?.online && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-surface" />
          )}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{person.username || "—"}</p>
          <p className="truncate text-xs text-muted">@{person.handle}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <RoleBadge role={person.role} />
            <SupporterBadge profile={person} />
            {presence && (
              <span className={`text-[0.65rem] ${presence.online ? "text-emerald-400" : "text-muted/70"}`}>
                {presence.label}
              </span>
            )}
          </div>
        </div>
      </Link>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
