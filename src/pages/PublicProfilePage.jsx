import { useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { UserX } from "lucide-react";
import { getPublicProfile, getPublicFavorites, getPublicActivity, getPublicFriends, recordProfileView } from "@/api/profile";
import ProfileColumn from "@/components/profile/ProfileColumn";
import ProfileFriendButton from "@/components/community/ProfileFriendButton";
import { useCachedResource } from "@/hooks/useCachedResource";

export default function PublicProfilePage() {
  const { handle } = useParams();
  const navigate = useNavigate();
  const profileTtl = 2 * 60 * 1000;
  const {
    data: profileData,
    loading: profileLoading,
    error: profileError,
  } = useCachedResource(
    handle ? `public-profile:${handle.toLowerCase()}` : null,
    () => getPublicProfile(handle),
    profileTtl
  );
  const profile = profileLoading ? undefined : profileError ? null : profileData;
  const { data: favorites } = useCachedResource(
    profile?.id ? `profile:favorites:${profile.id}` : null,
    () => getPublicFavorites(profile.id),
    profileTtl
  );
  const { data: activity } = useCachedResource(
    profile?.id ? `profile:activity:${profile.id}` : null,
    () => getPublicActivity(profile.id, 15),
    profileTtl
  );
  const { data: friends } = useCachedResource(
    profile?.id ? `profile:friends:${profile.id}` : null,
    () => getPublicFriends(profile.id),
    profileTtl
  );

  // Comptée après un temps de présence : un simple passage ne compte pas.
  const isSelf = profile?.isSelf;
  const viewedHandle = profile?.handle;
  useEffect(() => {
    if (!viewedHandle || isSelf) return;
    const t = setTimeout(() => recordProfileView(viewedHandle), 4000);
    return () => clearTimeout(t);
  }, [viewedHandle, isSelf]);

  if (profile === undefined) {
    return (
      <div className="animate-fade-in space-y-4 p-5 sm:p-7">
        <div className="h-56 skeleton rounded-md" />
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="h-40 skeleton rounded-md" />
          <div className="h-40 skeleton rounded-md" />
        </div>
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center px-8 py-32 text-center">
        <UserX size={40} className="text-muted" strokeWidth={1.5} />
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">Profil indisponible</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Ce profil n'existe pas ou son propriétaire l'a rendu privé.
        </p>
        <Link
          to="/"
          className="mt-6 rounded bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg transition-colors duration-200 hover:bg-primary/90"
        >
          Retour à l'accueil
        </Link>
      </div>
    );
  }

  return (
    <ProfileColumn
      profile={profile}
      stats={profile.stats}
      // Rang, record et série ne sont exposés que pour soi ; seul le badge top 10 est public.
      extra={profile.isSelf ? null : { rankBadge: profile.rankBadge }}
      favorites={favorites}
      activity={activity}
      friends={friends}
      isSelf={profile.isSelf}
      onBack={() => navigate(-1)}
      showFavorites={profile.favoritesPublic || profile.isSelf}
      showActivity={profile.activityPublic || profile.isSelf}
      actions={<ProfileFriendButton userId={profile.id} handle={profile.handle} username={profile.username} />}
    />
  );
}
