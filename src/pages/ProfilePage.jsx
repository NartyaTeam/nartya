import { useRef, useState } from "react";
import { Pencil, Camera } from "lucide-react";
import { profileArt } from "@/lib/profileArt";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/stores/useAuthStore";
import { getUserStats } from "@/api/progress";
import {
  getPublicFavorites,
  getPublicActivity,
  getPublicFriends,
  getProfileExtraStats,
  accentRgb,
  resolveAccent,
  resolveBanner,
  resolveEmblem,
} from "@/api/profile";
import { invalidateCache, useCachedResource } from "@/hooks/useCachedResource";
import { resolveCosmetics } from "@/lib/cosmetics";
import ProfileColumn from "@/components/profile/ProfileColumn";
import ShareCard from "@/components/profile/ShareCard";
import ProfileEditModal from "@/components/profile/ProfileEditModal";
import { SITE_URL } from "@/config/instance";

function useShareProfile(user) {
  return () => {
    if (!user?.handle) return;
    navigator.clipboard?.writeText(`${SITE_URL}/u/${user.handle}`).then(
      () => toast.success("Lien du profil copié"),
      () => {}
    );
  };
}

function AnimeProfile() {
  const user = useAuthStore((s) => s.user);
  const refreshAvatar = useAuthStore((s) => s.refreshAvatarFromDiscord);
  const [editing, setEditing] = useState(false);
  const shareCardRef = useRef(null);

  const userId = user?.id;
  const profileTtl = 2 * 60 * 1000;
  const { data: stats } = useCachedResource(
    userId ? `profile:stats:${userId}` : null,
    getUserStats,
    profileTtl
  );
  const { data: favorites } = useCachedResource(
    userId ? `profile:favorites:${userId}` : null,
    () => getPublicFavorites(userId),
    profileTtl
  );
  const { data: activity } = useCachedResource(
    userId ? `profile:activity:${userId}` : null,
    () => getPublicActivity(userId, 15),
    profileTtl
  );
  const { data: friends } = useCachedResource(
    userId ? `profile:friends:${userId}` : null,
    () => getPublicFriends(userId),
    profileTtl
  );
  // Ces compteurs bougent lentement.
  const { data: extra } = useCachedResource(
    userId ? `profile:extra:${userId}` : null,
    getProfileExtraStats,
    5 * 60 * 1000
  );

  const closeEditor = () => {
    setEditing(false);
    // Les épinglages ont pu changer dans la modale.
    if (userId) invalidateCache(`profile:favorites:${userId}`);
  };

  const share = useShareProfile(user);
  const cos = resolveCosmetics(user);
  const banner = resolveBanner(user) || (profileArt(cos.banner)?.background ?? null);
  const emblem = resolveEmblem(user);
  const accent = accentRgb(resolveAccent(user));
  // Reprises dans la carte partageable.
  const podiumCovers = [...(favorites || [])]
    .sort((a, b) => (b.watchSeconds || 0) - (a.watchSeconds || 0))
    .slice(0, 4)
    .map((it) => it.cover)
    .filter(Boolean);

  return (
    <ProfileColumn
      profile={user}
      stats={stats}
      extra={extra}
      favorites={favorites}
      activity={activity}
      friends={friends}
      isSelf
      onAvatarError={refreshAvatar}
      actions={
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex h-[38px] items-center gap-2 rounded-md bg-bg/85 px-4 text-[13px] font-bold text-text ring-2 ring-border transition-colors hover:bg-bg"
          >
            <Pencil size={14} /> Éditer
          </button>
          <button
            type="button"
            onClick={() => shareCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="flex h-[38px] items-center gap-2 rounded-md bg-primary px-4 text-[13px] font-bold text-primary-fg shadow-[0_3px_0_color-mix(in_srgb,rgb(var(--primary))_58%,black)] transition hover:brightness-105 active:translate-y-[2px] active:shadow-none"
          >
            <Camera size={14} /> Ma carte
          </button>
        </>
      }
      belowIdentity={
        <>
          <div ref={shareCardRef}>
            <ShareCard profile={user} stats={stats} extra={extra} kanji={emblem} posters={podiumCovers} banner={banner} accent={accent} cosmetics={cos} />
          </div>
          {user?.handle && (
            <button
              type="button"
              onClick={share}
              className="mt-4 w-full rounded-md bg-surface-2/50 px-3.5 py-2.5 text-center text-xs font-bold text-muted ring-2 ring-border transition-colors hover:text-text"
            >
              Copier le lien du profil
            </button>
          )}
        </>
      }
    >
      {editing && <ProfileEditModal onClose={closeEditor} />}
    </ProfileColumn>
  );
}

export default function ProfilePage() {
  return <AnimeProfile />;
}
