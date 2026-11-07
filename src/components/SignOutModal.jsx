import { useState } from "react";
import { LogOut, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
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

  return (
    <Modal
      eyebrow="Compte"
      title="Se déconnecter"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={confirm} loading={busy} icon={LogOut}>
            {busy ? "Déconnexion…" : isDesktop ? "Se déconnecter et fermer" : "Se déconnecter"}
          </Button>
        </>
      }
    >
      <p>
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
    </Modal>
  );
}
