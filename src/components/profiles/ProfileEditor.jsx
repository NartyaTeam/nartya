import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Lock, LockOpen, Pencil, Trash2, X } from "lucide-react";
import { useProfilesStore } from "@/stores/useProfilesStore";
import { profileErrorMessage } from "@/api/accountProfiles";
import { resolveAvatar } from "@/api/profile";
import { Avatar } from "@/components/ui/Avatar";
import AvatarPicker from "./AvatarPicker";
import PinPad from "./PinPad";

/**
 * Création ou modification d'un profil : nom, avatar, code à 4 chiffres, suppression.
 * `authPin` : code déjà saisi pour ouvrir l'édition d'un profil protégé.
 */
export default function ProfileEditor({ profile = null, account, authPin = null, onClose }) {
  const isNew = !profile;
  const create = useProfilesStore((s) => s.create);
  const update = useProfilesStore((s) => s.update);
  const setPin = useProfilesStore((s) => s.setPin);
  const remove = useProfilesStore((s) => s.remove);

  const [name, setName] = useState(profile?.name && !(profile.is_main && profile.name === account?.username) ? profile.name : "");
  const [avatarId, setAvatarId] = useState(profile?.avatar_id ?? null);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? null);
  const [picking, setPicking] = useState(false);
  // Création : code facultatif. Modification : `pinStep` pour poser ou changer le code.
  const [newPin, setNewPin] = useState(null);
  const [pinStep, setPinStep] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && !picking && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy, picking]);

  const accountAvatar = profile?.is_main ? resolveAvatar(account) : null;
  const previewSrc = avatarUrl ?? accountAvatar;
  const placeholder = profile?.is_main ? account?.username || "Profil principal" : "Nom du profil";

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(profileErrorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const trimmed = name.trim();
      if (isNew) {
        await create({ name: trimmed, avatarId, pin: newPin });
      } else {
        await update(profile.id, { name: trimmed || null, avatarId }, authPin);
      }
    }).then((ok) => ok && onClose());

  const savePin = (pin) =>
    run(() => setPin(profile.id, pin, authPin)).then((ok) => {
      if (ok) {
        setPinStep(false);
        onClose();
      }
    });

  const del = () => run(() => remove(profile.id, authPin)).then((ok) => ok && onClose());

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="animate-fade-in-fast relative w-full max-w-md rounded-lg border border-border bg-surface shadow-card">
        <div className="h-[3px] w-full rounded-t-lg bg-gradient-to-r from-primary via-primary/70 to-transparent" />
        <div className="flex items-start justify-between px-6 pb-2 pt-4">
          <div>
            <p className="eyebrow">Profils</p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
              {isNew ? "Ajouter un profil" : "Modifier le profil"}
            </h2>
          </div>
          <button onClick={onClose} disabled={busy} title="Fermer" className="text-muted hover:text-primary disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        {pinStep ? (
          <div className="px-6 pb-6 pt-4">
            <p className="mb-5 text-center text-sm text-muted">
              Choisis un code à 4 chiffres. Il sera demandé pour ouvrir ce profil.
            </p>
            <PinPad onComplete={savePin} busy={busy} error={error} />
            <button
              onClick={() => {
                setPinStep(false);
                setError(null);
              }}
              className="mx-auto mt-3 block text-sm text-muted hover:text-text"
            >
              Annuler
            </button>
          </div>
        ) : (
          <div className="space-y-5 px-6 pb-6 pt-3">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="group relative shrink-0 overflow-hidden rounded-lg"
                title="Changer d'avatar"
              >
                <Avatar src={previewSrc} name={name || placeholder} className="h-24 w-24 rounded-lg" textClassName="text-4xl" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100">
                  <Pencil size={22} />
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="profile-name">
                  Nom
                </label>
                <input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 20))}
                  placeholder={placeholder}
                  autoFocus={isNew}
                  maxLength={20}
                  className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2.5 text-sm outline-none transition focus:border-primary"
                />
                <button onClick={() => setPicking(true)} className="mt-2 text-xs font-semibold text-primary hover:underline">
                  Changer d'avatar
                </button>
              </div>
            </div>

            <div className="rounded-md border border-border bg-bg/60 px-4 py-3">
              <div className="flex items-center gap-3">
                {(isNew ? newPin : profile.has_pin) ? (
                  <Lock size={18} className="shrink-0 text-primary" />
                ) : (
                  <LockOpen size={18} className="shrink-0 text-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Code du profil</p>
                  <p className="text-xs text-muted">
                    {(isNew ? newPin : profile.has_pin)
                      ? "Un code à 4 chiffres est demandé pour l'ouvrir."
                      : isNew
                        ? "Facultatif : 4 chiffres pour le protéger."
                        : "Tout le monde sur ce compte peut l'ouvrir."}
                  </p>
                </div>
              </div>
              {isNew ? (
                newPin ? (
                  <button onClick={() => setNewPin(null)} className="mt-3 text-xs font-semibold text-muted hover:text-text">
                    Retirer le code
                  </button>
                ) : (
                  <div className="mt-3">
                    <PinPad onComplete={setNewPin} autoFocus={false} />
                  </div>
                )
              ) : (
                <div className="mt-3 flex gap-4">
                  <button onClick={() => setPinStep(true)} disabled={busy} className="text-xs font-semibold text-primary hover:underline">
                    {profile.has_pin ? "Changer le code" : "Ajouter un code"}
                  </button>
                  {profile.has_pin && (
                    <button onClick={() => savePin(null)} disabled={busy} className="text-xs font-semibold text-muted hover:text-text">
                      Retirer le code
                    </button>
                  )}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex items-center gap-3">
              {!isNew && !profile.is_main && (
                confirmDelete ? (
                  <button
                    onClick={del}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-md bg-red-500/15 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/25"
                  >
                    <Trash2 size={14} /> Supprimer définitivement
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy}
                    title="Supprime aussi ses favoris, listes et sa progression"
                    className="inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-red-300"
                  >
                    <Trash2 size={14} /> Supprimer
                  </button>
                )
              )}
              <button
                onClick={save}
                disabled={busy || (isNew && !name.trim())}
                className="btn-shu ml-auto px-5 py-2.5 text-sm disabled:opacity-50"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {isNew ? "Créer" : "Enregistrer"}
              </button>
            </div>
            {confirmDelete && (
              <p className="text-xs text-muted">
                Ses favoris, ses listes et sa progression seront supprimés. Le reste du compte n'est pas touché.
              </p>
            )}
          </div>
        )}
      </div>

      {picking && (
        <AvatarPicker
          value={avatarId}
          accountAvatar={accountAvatar}
          onClose={() => setPicking(false)}
          onPick={(id, item) => {
            setAvatarId(id);
            setAvatarUrl(item?.image_url ?? null);
            setPicking(false);
          }}
        />
      )}
    </div>,
    document.body
  );
}
