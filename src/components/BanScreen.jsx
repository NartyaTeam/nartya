import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { authOwnedByHub, openHub } from "@/lib/hubAuth";
import BlockScreen from "@/components/BlockScreen";

/** « dans 3 jours », « dans 5 h », « bientôt » */
function remainingText(untilIso) {
  const ms = new Date(untilIso).getTime() - Date.now();
  if (ms <= 0) return "bientôt";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `dans ${days} jour${days > 1 ? "s" : ""}`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `dans ${hours} h`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `dans ${mins} min`;
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="text-right text-text/90">{children}</span>
    </div>
  );
}

/** Un ban « machine » vise l'appareil, un ban de compte l'utilisateur. */
export default function BanScreen({ kind, reason, until }) {
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const isMachine = kind === "machine";

  const [, tick] = useState(0);
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [until]);

  return (
    <BlockScreen
      eyebrow="Accès révoqué"
      title={isMachine ? "Appareil banni" : "Compte suspendu"}
      description={
        isMachine
          ? "Cet appareil a été banni de Nartya. L'accès reste bloqué même après un changement de compte."
          : "Ton accès à Nartya a été suspendu."
      }
      actions={
        // Il faut une sortie pour changer de compte : sur le bureau, elle mène au hub.
        session &&
        (authOwnedByHub() ? (
          <button onClick={() => openHub(true)} className="btn-ghost">
            Gérer ma session dans le Hub
          </button>
        ) : (
          <button onClick={signOut} className="btn-ghost">
            Se déconnecter
          </button>
        ))
      }
      footnote="Tu penses qu'il s'agit d'une erreur ? Contacte un administrateur sur le Discord."
    >
      <div className="w-full divide-y divide-border/60 rounded-lg border border-border/60 bg-surface/40">
        <DetailRow label="Motif">{reason || "Non précisé"}</DetailRow>
        <DetailRow label="Durée">
          {until ? (
            <>
              Levé {remainingText(until)}{" "}
              <span className="text-muted">
                (
                {new Date(until).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
                )
              </span>
            </>
          ) : (
            "Permanent"
          )}
        </DetailRow>
      </div>
    </BlockScreen>
  );
}
