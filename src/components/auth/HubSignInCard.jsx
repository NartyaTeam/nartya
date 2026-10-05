import { useEffect, useRef, useState } from "react";
import { NartyaLockup } from "@/components/brand/NartyaMark";
import { Loader2, KeyRound, ExternalLink, Download, CheckCircle2 } from "lucide-react";
import { openHub, getHubInfo } from "@/lib/hubAuth";
import { useAuthStore } from "@/stores/useAuthStore";

/**
 * La session partagée arrive en deux temps (miroir localStorage, puis fichier commun) : sans
 * ce délai, on ouvrirait le hub pour des utilisateurs déjà connectés.
 */
const AUTO_OPEN_DELAY_MS = 1200;

/**
 * C'est le Hub qui authentifie ; la session partagée connecte ensuite l'app. Pas de mode
 * visiteur ici, il s'ouvre depuis le hub.
 */
export default function HubSignInCard({ onOpenTerms }) {
  // `undefined` = détection en cours, `null` = hub absent, objet = hub présent.
  const [hubInfo, setHubInfo] = useState(undefined);
  // "idle" → "opening" → "opened" | "failed"
  const [autoOpen, setAutoOpen] = useState("idle");
  const attempted = useRef(false);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    let alive = true;
    getHubInfo().then((info) => alive && setHubInfo(info));
    return () => {
      alive = false;
    };
  }, []);

  const hubPresent = !!hubInfo;

  /** Une seule fois, si le hub est présent et qu'aucune session n'existe, même anonyme. */
  useEffect(() => {
    if (!hubPresent || session || attempted.current) return;
    const timer = setTimeout(async () => {
      attempted.current = true;
      setAutoOpen("opening");
      const res = await openHub(true);
      // Un repli sur le site signifie que le hub est introuvable.
      setAutoOpen(res?.success && res.method !== "website" ? "opened" : "failed");
    }, AUTO_OPEN_DELAY_MS);
    // Session arrivée entre-temps : rien ne s'ouvre.
    return () => clearTimeout(timer);
  }, [hubPresent, session]);

  return (
    <div className="rounded-lg bg-surface/70 p-7 shadow-card ring-1 ring-white/10 backdrop-blur-2xl">
      <div className="mb-6 text-center">
        <NartyaLockup className="mb-5" />
        <p className="text-sm leading-relaxed text-muted">
          Ta connexion Nartya se fait maintenant depuis le Hub. Connecte-toi là-bas, et toutes
          tes apps suivent.
        </p>
      </div>

      <div className="mb-5 flex items-start gap-3 rounded-md bg-surface-2/60 p-3.5 ring-1 ring-border">
        <KeyRound size={16} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted">
          {!hubPresent
            ? "Le Hub gère ta connexion et les mises à jour de tes apps Nartya. Installe-le une fois, et c'est réglé."
            : autoOpen === "opened"
              ? "Le Hub vient de s'ouvrir : connecte-toi là-bas et cette fenêtre se débloquera toute seule, sans avoir à la relancer."
              : autoOpen === "failed"
                ? "Le Hub n'a pas pu être ouvert automatiquement. Lance-le depuis ton menu Démarrer, ou réessaie ci-dessous."
                : "Ouvre le Hub et connecte-toi : cette fenêtre se débloquera toute seule, sans avoir à la relancer."}
        </p>
      </div>

      {hubInfo === undefined ? (
        <div className="flex w-full items-center justify-center gap-2 rounded-md bg-surface-2/70 px-4 py-3 text-sm font-medium text-muted">
          <Loader2 size={16} className="animate-spin" />
          Recherche du Hub…
        </div>
      ) : autoOpen === "opening" ? (
        <div className="flex w-full items-center justify-center gap-2 rounded-md bg-surface-2/70 px-4 py-3 text-sm font-medium text-muted">
          <Loader2 size={16} className="animate-spin" />
          Ouverture du Hub…
        </div>
      ) : (
        <button
          onClick={async () => {
            if (!hubPresent) return openHub(false);
            setAutoOpen("opening");
            const res = await openHub(true);
            setAutoOpen(res?.success && res.method !== "website" ? "opened" : "failed");
          }}
          className={`flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition-opacity duration-200 hover:opacity-90 ${
            autoOpen === "opened"
              ? "bg-surface-2 text-text ring-1 ring-border"
              : "bg-primary text-white"
          }`}
        >
          {!hubPresent ? (
            <Download size={16} />
          ) : autoOpen === "opened" ? (
            <CheckCircle2 size={16} className="text-primary" />
          ) : (
            <ExternalLink size={16} />
          )}
          {!hubPresent
            ? "Installer Nartya Hub"
            : autoOpen === "opened"
              ? "Rouvrir le Hub"
              : "Ouvrir Nartya Hub"}
        </button>
      )}

      <p className="mt-3 text-center text-xs leading-relaxed text-muted">
        Pas de compte ? Le Hub propose aussi le mode visiteur.
      </p>

      <p className="mt-5 text-center text-xs leading-relaxed text-muted/70">
        En continuant, tu acceptes nos{" "}
        <button
          type="button"
          onClick={onOpenTerms}
          className="font-medium text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-primary"
        >
          conditions d'utilisation
        </button>
        .
      </p>
    </div>
  );
}
