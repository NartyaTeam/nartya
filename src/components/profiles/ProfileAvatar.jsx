import { Avatar } from "@/components/ui/Avatar";
import { resolveAvatar } from "@/api/profile";

/** Avatar choisi, sinon (profil principal) celui du compte, sinon l'initiale. */
export function profileAvatarSrc(profile, account) {
  if (profile?.avatar_url) return profile.avatar_url;
  return profile?.is_main ? resolveAvatar(account) : null;
}

export default function ProfileAvatar({ profile, account, className = "", textClassName = "text-3xl" }) {
  return (
    <Avatar
      src={profileAvatarSrc(profile, account)}
      name={profile?.name}
      className={className}
      textClassName={textClassName}
    />
  );
}
