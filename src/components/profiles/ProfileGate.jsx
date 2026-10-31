import { useState } from "react";
import { ChevronLeft, Crown, Loader2, Lock, LogOut, Pencil, Plus } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useProfilesStore } from "@/stores/useProfilesStore";
import {
  checkAccountProfilePin,
  confirmProfilePinReset,
  profileErrorMessage,
  requestProfilePinReset,
} from "@/api/accountProfiles";
import { premiumTier } from "@/lib/premium";
import { Fox } from "@/components/brand/NartyaMark";
import SignOutModal from "@/components/SignOutModal";
import ProfileAvatar from "./ProfileAvatar";
import ProfileEditor from "./ProfileEditor";
import PinPad from "./PinPad";
import PinResetFlow from "./PinResetFlow";

/** « Qui est là ? » : choix du profil au lancement, et gestion des profils du compte. */
export default function ProfileGate() {
  const account = useAuthStore((s) => s.user);
  const profiles = useProfilesStore((s) => s.profiles);
  const limit = useProfilesStore((s) => s.limit);
  const status = useProfilesStore((s) => s.status);
  const loadError = useProfilesStore((s) => s.error);
  const enter = useProfilesStore((s) => s.enter);
  const refresh = useProfilesStore((s) => s.refresh);

  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState(null); // { profile, authPin } | { profile: null }
  const [pinFor, setPinFor] = useState(null); // { profile, purpose: "enter" | "edit" }
  const [resetFor, setResetFor] = useState(null); // code oublié : envoi par e-mail
  const [pinError, setPinError] = useState(null);
  const [pinReset, setPinReset] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  const tier = premiumTier(account);
  const canAdd = profiles.length < limit;

  const open = async (profile) => {
    setNotice(null);
    if (profile.locked) {
      setNotice(profileErrorMessage("profile_locked"));
      return;
    }
    if (managing) {
      if (profile.has_pin) setPinFor({ profile, purpose: "edit" });
      else setEditing({ profile, authPin: null });
      return;
    }
    if (profile.has_pin) {
      setPinFor({ profile, purpose: "enter" });
      return;
    }
    setBusyId(profile.id);
    try {
      const res = await enter(profile);
      if (!res.ok) setNotice(profileErrorMessage(res.error));
    } catch (e) {
      setNotice(profileErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const submitPin = async (pin) => {
    const { profile, purpose } = pinFor;
    setBusyId(profile.id);
    setPinError(null);
    try {
      if (purpose === "edit") {
        const res = await checkAccountProfilePin(profile.id, pin);
        if (!res?.ok) throw new Error(res?.error);
        setPinFor(null);
        setEditing({ profile, authPin: pin });
      } else {
        const res = await enter(profile, pin);
        if (!res.ok) throw new Error(res.error);
      }
    } catch (e) {
      setPinError(profileErrorMessage(e));
      setPinReset((n) => n + 1);
    } finally {
      setBusyId(null);
    }
  };

  const forgotPin = () => {
    setResetFor(pinFor.profile);
    setPinFor(null);
    setPinError(null);
  };

  if (resetFor) {
    return (
      <Screen>
        <PinResetFlow
          profile={resetFor}
          request={requestProfilePinReset}
          confirm={confirmProfilePinReset}
          errorMessage={profileErrorMessage}
          onCancel={() => setResetFor(null)}
          onDone={(message) => {
            setNotice(`${message} (« ${resetFor.name} »)`);
            setResetFor(null);
            refresh().catch(() => {});
          }}
        />
      </Screen>
    );
  }

  if (pinFor) {
    const { profile, purpose } = pinFor;
    return (
      <Screen>
        <button
          onClick={() => {
            setPinFor(null);
            setPinError(null);
          }}
          className="absolute left-6 top-14 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
        >
          <ChevronLeft size={18} /> Retour
        </button>
        <ProfileAvatar profile={profile} account={account} className="h-24 w-24 rounded-xl" />
        <p className="mt-3 font-display text-lg font-bold">{profile.name}</p>
        <h1 className="mb-8 mt-6 text-center font-display text-2xl font-bold sm:text-3xl">
          {purpose === "edit" ? "Saisis le code pour modifier ce profil" : "Saisis le code du profil"}
        </h1>
        <PinPad onComplete={submitPin} busy={busyId === profile.id} error={pinError} resetKey={pinReset} />
        <button onClick={forgotPin} disabled={!!busyId} className="mt-6 text-sm text-muted underline-offset-4 hover:text-text hover:underline">
          Code oublié ?
        </button>
      </Screen>
    );
  }

  return (
    <Screen>
      <h1 className="text-center font-display text-3xl font-bold tracking-tight sm:text-5xl">
        {managing ? "Gérer les profils" : "Qui est là ?"}
      </h1>

      {status === "loading" ? (
        <Loader2 className="mt-14 animate-spin text-muted" />
      ) : (
        <div className="mt-10 flex max-w-4xl flex-wrap justify-center gap-5 sm:gap-8">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => open(p)}
              disabled={!!busyId}
              className="group flex w-24 flex-col items-center gap-3 outline-none sm:w-32"
            >
              <span className="relative block">
                <ProfileAvatar
                  profile={p}
                  account={account}
                  className={`h-24 w-24 rounded-xl ring-primary ring-offset-4 ring-offset-bg transition group-hover:ring-2 group-focus-visible:ring-2 sm:h-32 sm:w-32 ${
                    p.locked ? "opacity-40 grayscale" : ""
                  }`}
                  textClassName="text-4xl"
                />
                {managing && !p.locked && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/55">
                    <Pencil size={26} />
                  </span>
                )}
                {busyId === p.id && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/55">
                    <Loader2 size={26} className="animate-spin" />
                  </span>
                )}
                {p.locked && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Crown size={26} className="text-amber-300" />
                  </span>
                )}
              </span>
              <span className="flex max-w-full items-center gap-1.5 text-sm text-muted transition group-hover:text-text sm:text-base">
                <span className="truncate">{p.name}</span>
                {p.has_pin && <Lock size={13} className="shrink-0" />}
              </span>
            </button>
          ))}

          {canAdd && (
            <button
              onClick={() => setEditing({ profile: null })}
              className="group flex w-24 flex-col items-center gap-3 outline-none sm:w-32"
            >
              <span className="flex h-24 w-24 items-center justify-center rounded-xl border-2 border-dashed border-border text-muted transition group-hover:border-primary group-hover:text-primary sm:h-32 sm:w-32">
                <Plus size={36} />
              </span>
              <span className="text-sm text-muted group-hover:text-text sm:text-base">Ajouter un profil</span>
            </button>
          )}
        </div>
      )}

      {(notice || (loadError && !profiles.length)) && (
        <p className="mt-8 max-w-md text-center text-sm text-amber-200/90">
          {notice || "Les profils n'ont pas pu être chargés."}
          {loadError && !profiles.length && (
            <button onClick={() => refresh().catch(() => {})} className="ml-2 font-semibold text-primary hover:underline">
              Réessayer
            </button>
          )}
        </p>
      )}

      <p className="mt-8 text-xs text-muted">
        {profiles.length} / {limit} profils
        {tier !== "ultimate" && !canAdd && (tier === "plus" ? " · 5 avec Ultimate" : " · 4 avec Nartya +, 5 avec Ultimate")}
      </p>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={() => setManaging((m) => !m)} className={managing ? "btn-shu px-6 py-2.5" : "btn-ghost px-6 py-2.5"}>
          {managing ? "Terminé" : "Gérer les profils"}
        </button>
      </div>

      <button
        onClick={() => setSigningOut(true)}
        className="mt-10 inline-flex items-center gap-2 text-xs text-muted hover:text-text"
      >
        <LogOut size={14} /> {account?.username ? `Se déconnecter de ${account.username}` : "Se déconnecter"}
      </button>

      {editing && (
        <ProfileEditor
          profile={editing.profile}
          authPin={editing.authPin}
          account={account}
          onClose={() => setEditing(null)}
        />
      )}
      {signingOut && <SignOutModal onClose={() => setSigningOut(false)} />}
    </Screen>
  );
}

function Screen({ children }) {
  return (
    <div className="app-drag relative flex h-full flex-col items-center justify-center overflow-y-auto bg-bg px-4 py-16">
      <Fox className="absolute left-6 top-5 h-8 w-8 text-primary" />
      <div className="app-no-drag flex flex-col items-center">{children}</div>
    </div>
  );
}
