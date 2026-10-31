import { ArrowLeftRight } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useProfilesStore } from "@/stores/useProfilesStore";
import ProfileAvatar from "./ProfileAvatar";

/** Profil ouvert et retour à « Qui est là ? » (où l'on gère aussi les profils). */
export default function ProfileSwitchCard() {
  const account = useAuthStore((s) => s.user);
  const active = useProfilesStore((s) => s.active);
  const switchProfile = useProfilesStore((s) => s.switchProfile);
  if (!active) return null;

  return (
    <div className="mt-5 flex items-center gap-4 rounded-md border border-border/70 bg-white/[0.02] px-4 py-3">
      <ProfileAvatar profile={active} account={account} className="h-11 w-11 rounded-lg" textClassName="text-lg" />
      <div className="min-w-0 flex-1">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-muted">Profil ouvert</p>
        <p className="truncate text-sm font-semibold">{active.name}</p>
        <p className="text-[0.7rem] text-muted">
          Favoris, listes et progression propres à ce profil.
        </p>
      </div>
      <button onClick={switchProfile} className="btn-ghost shrink-0 px-4 py-2 text-xs">
        <ArrowLeftRight size={14} /> Changer de profil
      </button>
    </div>
  );
}
