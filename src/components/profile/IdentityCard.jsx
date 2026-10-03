import { Avatar } from "@/components/ui/Avatar";
import { Link } from "react-router-dom";
import { resolveAvatar } from "@/api/profile";
import { formatWatchTime } from "./StatsRow";
import RoleBadge from "./RoleBadge";
import RankBadge from "./RankBadge";
import SupporterBadge from "./SupporterBadge";
import AvatarFrame from "@/components/ambient/AvatarFrame";
import { avatarShapeClass } from "@/lib/cosmetics";

/** `extra` peut être `null` tant que la requête n'est pas revenue : ses blocs sont masqués. */
export default function IdentityCard({ profile, stats, extra, friends, ornament, isSelf, onAvatarError }) {
  if (!profile) return null;
  const avatar = resolveAvatar(profile);
  const days = stats ? Math.floor((stats.totalWatchSeconds || 0) / 86400) : 0;
  const [h, m] = stats ? formatWatchTime(stats.totalWatchSeconds).split(" h ") : ["—", null];
  const friendsShown = (friends || []).slice(0, 6);
  const friendsOverflow = (friends?.length || 0) - friendsShown.length;

  return (
    // Pas d'`overflow-hidden` : l'ornement doit pouvoir déborder.
    <div
      className="relative rounded-[16px]"
      style={{
        backgroundColor: "rgb(var(--surface))",
        boxShadow: "inset 0 0 0 1px rgb(var(--primary) / 0.28), 0 24px 60px rgb(0 0 0 / 0.6)",
      }}
    >
      <div className="p-6 pt-[27px]">
        <div className="flex items-end gap-4">
          <div className="relative h-24 w-24 shrink-0">
            <Avatar
              src={avatar}
              name={profile.username}
              onError={onAvatarError}
              className={`h-24 w-24 max-w-none border-2 bg-surface-2 shadow-xl ${avatarShapeClass(
                ornament,
                "rounded-[16px]"
              )}`}
              style={{
                borderColor: "rgb(var(--primary) / 0.7)",
                boxShadow: "0 0 0 1px rgb(var(--primary) / 0.25), 0 8px 30px rgb(var(--primary) / 0.3)",
              }}
              textClassName="text-3xl"
            />
            {ornament && <AvatarFrame token={ornament} />}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            {extra?.rank > 0 && (
              <p className="text-[0.6rem] font-bold uppercase tracking-kana text-primary">
                Rang {extra.rank.toLocaleString("fr-FR")} / {extra.totalMembers.toLocaleString("fr-FR")}
              </p>
            )}
            {/* Le rang du dessus est celui du jour ; celui-ci est le record. */}
            {extra?.bestRank > 0 && (
              <p className="mt-0.5 text-[0.6rem] font-bold uppercase tracking-kana text-muted">
                Position la plus haute #{extra.bestRank.toLocaleString("fr-FR")}
              </p>
            )}
            <h2 className="mt-1 line-clamp-1 font-display text-[26px] font-black leading-[1.1] tracking-[-0.02em] text-white">
              {profile.username || "Utilisateur"}
            </h2>
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <SupporterBadge profile={profile} size="lg" />
          <RoleBadge role={profile.role} showMember size="lg" />
          <RankBadge rank={extra?.rankBadge} size="lg" />
        </div>

        <div className="relative z-10 mt-5 border-t border-border/70 pt-5">
          <p className="text-[0.6rem] font-bold uppercase tracking-kana text-muted">Temps de visionnage</p>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span
              className="font-display text-[76px] font-black leading-[0.9] tracking-[-0.04em] tabular-nums text-white"
              style={{ textShadow: "0 0 40px rgb(var(--primary) / 0.45)" }}
            >
              {h}
            </span>
            {m != null && <span className="font-display text-2xl font-bold text-primary">h {m}</span>}
          </div>
          {days > 0 && (
            <p className="mt-1.5 text-xs text-muted">
              soit <strong className="font-bold text-text">{days} jour{days > 1 ? "s" : ""}</strong> plein{days > 1 ? "s" : ""} devant l'écran
            </p>
          )}
        </div>

        <div className="mt-[18px] grid grid-cols-2 gap-px bg-border/70">
          <div className="bg-surface px-3.5 py-3">
            <div className="font-display text-[22px] font-black leading-none tabular-nums">
              {stats ? stats.totalEpisodes.toLocaleString("fr-FR") : "—"}
            </div>
            <div className="mt-[5px] text-[0.6rem] uppercase tracking-[0.28em] text-muted">Épisodes</div>
          </div>
          <div className="bg-surface px-3.5 py-3">
            <div className="font-display text-[22px] font-black leading-none tabular-nums">
              {stats ? stats.totalAnimes.toLocaleString("fr-FR") : "—"}
            </div>
            <div className="mt-[5px] text-[0.6rem] uppercase tracking-[0.28em] text-muted">Animes</div>
          </div>
          {/* La série de jours n'est calculée que pour soi ; ailleurs, le nombre d'amis. */}
          <div className="bg-surface px-3.5 py-3">
            <div className="font-display text-[22px] font-black leading-none tabular-nums">
              {isSelf
                ? extra ? extra.streakDays : "—"
                : Number(profile.friendsCount ?? 0).toLocaleString("fr-FR")}
            </div>
            <div className="mt-[5px] text-[0.6rem] uppercase tracking-[0.28em] text-muted">
              {isSelf ? "Jours d'affilée" : "Amis"}
            </div>
          </div>
          <div className="bg-surface px-3.5 py-3">
            <div className="font-display text-[22px] font-black leading-none tabular-nums">
              {Number(profile.viewsCount ?? profile.views_count ?? 0).toLocaleString("fr-FR")}
            </div>
            <div className="mt-[5px] text-[0.6rem] uppercase tracking-[0.28em] text-muted">Vues du profil</div>
          </div>
        </div>

        {(profile.bio || isSelf) && (
          <p className="mt-5 whitespace-pre-line border-t border-border/70 pt-[18px] font-display text-sm font-medium leading-[1.75] text-text/80">
            {profile.bio || (isSelf ? "Ajoute une bio depuis « Éditer » pour te présenter." : "")}
          </p>
        )}

        {friendsShown.length > 0 && (
          <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
            <span className="text-[0.6rem] font-bold uppercase tracking-kana text-muted">
              Amis · {friends.length}
            </span>
            <div className="flex">
              {friendsShown.map((f, i) => (
                <Link
                  key={f.id}
                  to={`/u/${f.handle}`}
                  title={f.username || f.handle}
                  className="block h-8 w-8 rounded-full ring-2 ring-surface"
                  style={{ marginLeft: i ? "-8px" : 0 }}
                >
                  <Avatar
                    src={resolveAvatar(f)}
                    name={f.username}
                    className="h-8 w-8 max-w-none rounded-full"
                    textClassName="text-xs"
                  />
                </Link>
              ))}
              {friendsOverflow > 0 && (
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-[0.65rem] font-semibold text-muted ring-2 ring-surface"
                  style={{ marginLeft: "-8px" }}
                >
                  +{friendsOverflow}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
