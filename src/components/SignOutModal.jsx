import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LogOut, X, Loader2, AlertTriangle } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { authOwnedByHub, openHub, quitApp } from "@/lib/hubAuth";

/**
 * Sur le bureau, la session est partagée avec le hub : on ouvre le hub puis on ferme l'app.
 * S'il ne s'ouvre pas, l'app reste ouverte et affiche l'erreur.
 */
export default function SignOutModal({ onClose }) {
  const signOut = useAuthStore((s) => s.signOut);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const isDesktop = authOwnedByHub();

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
    } catch {
      // Un échec réseau ne bloque pas la suite.
    }

    if (!isDesktop) {
      onClose();
      return;
    }

    const res = await openHub(true);

    // `"website"` = hub introuvable.
    const hubOpened = res?.success && res.method !== "website";
    if (!hubOpened) {
      setBusy(false);
      setError(
        res?.stale
          ? "L'app doit être redémarrée pour appliquer la mise à jour de la déconnexion. Tu es déconnecté : ferme et rouvre Nartya."
          : "Nartya Hub est introuvable sur cet appareil. Tu es déconnecté : lance le Hub manuellement pour te reconnecter."
      );
      return;
    }

    // Laisse le fichier de session être écrit et le hub démarrer.
    setTimeout(() => quitApp(), 600);
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />

      <div className="animate-fade-in-fast relative flex w-full max-w-md flex-col rounded-lg border border-border bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)]">
        <div className="h-[3px] w-full rounded-t-lg bg-gradient-to-r from-primary via-primary/70 to-transparent" />

        <div className="relative bg-gradient-to-b from-primary/[0.05] to-transparent px-6 pb-5 pt-4">
          <button
            onClick={onClose}
            disabled={busy}
            title="Fermer"
            className="absolute right-4 top-4 text-muted transition-colors hover:text-primary disabled:opacity-40"
          >
            <X size={18} />
          </button>
          <p className="eyebrow">Compte</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Se déconnecter</h2>
        </div>

        <div className="px-6 pb-2">
          <p className="text-sm leading-relaxed text-text/90">
            {isDesktop ? (
              <>
                Ta session est partagée avec <strong className="font-semibold">Nartya Hub</strong>.
                En te déconnectant, <strong className="font-semibold">Nartya se fermera</strong> et
                le Hub s'ouvrira sur sa page de connexion.
              </>
            ) : (
              <>Tu vas être déconnecté de ton compte Nartya.</>
            )}
          </p>

          {isDesktop && (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Tes téléchargements et tes réglages restent sur cet appareil.
            </p>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/[0.07] px-3 py-2.5 text-xs leading-relaxed text-text/90">
              <AlertTriangle size={14} className="mt-px shrink-0 text-primary" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Déconnexion…
              </>
            ) : (
              <>
                <LogOut size={15} />
                {isDesktop ? "Se déconnecter et fermer" : "Se déconnecter"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
