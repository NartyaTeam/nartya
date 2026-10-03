import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Gift, Check, Loader2, Crown } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  getCampaignStatus,
  claimCampaign,
  messageRefus,
  CURRENT_CAMPAIGN,
} from "@/api/campaigns";

/**
 * Modale une fois, puis rappel discret tant qu'il n'est pas réclamé. Le marqueur « modale vue »
 * est local, l'état réclamé vient du serveur.
 */

const MODAL_SEEN_KEY = `nartya-gift-seen:${CURRENT_CAMPAIGN}`;

const CONFETTI_COULEURS = [
  "rgb(var(--primary))",
  "rgb(var(--accent))",
  "rgb(var(--sakura))",
  "#d6aa68", // l'or des badges premium
];

/**
 * Répartition horizontale par multiples du conjugué du nombre d'or : irrationnel, donc sans
 * cycle. Pas l'angle d'or 137,5, qui modulo 100 ne produit que 8 valeurs.
 */
const PHI_CONJUGUE = 61.80339887498949;
function Confettis({ nombre = 34 }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: nombre }, (_, i) => {
        const forme = i % 5 === 0 ? "pastille" : i % 3 === 0 ? "ruban" : "rect";
        const largeur = forme === "ruban" ? 3 : forme === "pastille" ? 6 : 5 + (i % 3);
        return {
          left: `${(i * PHI_CONJUGUE) % 100}%`,
          largeur,
          hauteur: forme === "ruban" ? 14 : forme === "pastille" ? 6 : largeur * 1.7,
          rond: forme === "pastille",
          couleur: CONFETTI_COULEURS[i % CONFETTI_COULEURS.length],
          opacite: 0.65 + ((i * 13) % 35) / 100,
          delai: `${((i * 7) % 16) * 0.11}s`,
          duree: `${2.8 + ((i * 11) % 22) / 10}s`,
          sway: `${(forme === "ruban" ? 10 : 5) + ((i * 5) % 9)}px`,
          voltige: `${0.5 + ((i * 3) % 7) / 10}s`,
        };
      }),
    [nombre]
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="gift-piece"
          style={{
            left: p.left,
            width: p.largeur,
            height: p.hauteur,
            animationDelay: p.delai,
            animationDuration: p.duree,
          }}
        >
          <i
            style={{
              background: p.couleur,
              opacity: p.opacite,
              borderRadius: p.rond ? "50%" : 1,
              animationDelay: p.delai,
              animationDuration: p.voltige,
              "--sway": p.sway,
            }}
          />
        </span>
      ))}
    </div>
  );
}

function Compteur({ to = 3000, duration = 1400 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      // easeOutCubic
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <span className="tabular-nums">{n.toLocaleString("fr-FR")}</span>;
}

export default function MilestoneGift() {
  const session = useAuthStore((s) => s.session);
  const loadProfile = useAuthStore((s) => s.loadProfile);

  const [statut, setStatut] = useState(null);
  const [phase, setPhase] = useState("checking"); // checking | modal | reminder | hidden
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState(null);
  const [whatsNewDone, setWhatsNewDone] = useState(false);

  // Pas deux modales au lancement : on attend le signal de « Quoi de neuf ».
  useEffect(() => {
    const done = () => setWhatsNewDone(true);
    window.addEventListener("nartya:whatsnew-done", done);
    const t = setTimeout(done, 2500);
    return () => {
      window.removeEventListener("nartya:whatsnew-done", done);
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const s = await getCampaignStatus();
      if (cancelled) return;
      setStatut(s);
      if (!s || s.claimed || !s.available) {
        setPhase("hidden");
        return;
      }
      setPhase(localStorage.getItem(MODAL_SEEN_KEY) ? "reminder" : "modal");
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const reclamer = async () => {
    if (busy) return;
    setBusy(true);
    setErreur("");
    const res = await claimCampaign();
    setBusy(false);
    if (!res.ok) {
      setErreur(messageRefus(res.error));
      // Déjà réclamé ailleurs.
      if (res.error === "already_claimed") localStorage.setItem(MODAL_SEEN_KEY, "1");
      return;
    }
    setSucces({ until: res.until });
    // Le badge et les limites premium se lisent sur le profil.
    loadProfile?.();
  };

  const fermerModale = () => {
    localStorage.setItem(MODAL_SEEN_KEY, "1");
    setPhase(succes ? "hidden" : "reminder");
  };

  if (!session || phase === "checking" || phase === "hidden" || !statut) return null;
  if (phase === "modal" && !whatsNewDone) return null;

  const dateFin = succes?.until
    ? new Date(succes.until).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  if (phase === "reminder") {
    return (
      <div className="fixed bottom-5 right-5 z-50 w-80 rounded-lg border border-border bg-surface p-4 shadow-2xl animate-fade-in">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <Gift size={18} className="mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <h3 className="font-display text-sm font-bold tracking-tight">Il reste ton cadeau</h3>
              <p className="mt-0.5 text-xs text-muted">
                Ultimate offert {statut.durationDays} jours, pour nos 3000 membres.
              </p>
            </div>
          </div>
          <button
            onClick={() => setPhase("hidden")}
            className="shrink-0 text-muted transition-colors hover:text-text"
            title="Plus tard"
          >
            <X size={16} />
          </button>
        </div>
        <button onClick={() => setPhase("modal")} className="btn-shu mt-3 flex w-full items-center justify-center gap-2">
          <Gift size={15} /> Réclamer
        </button>
      </div>
    );
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && fermerModale()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm animate-fade-in-fast" />
        {/* Centrage porté par ce conteneur : les keyframes d'entrée écraseraient le `transform` de la modale. */}
        <div className="fixed inset-0 z-[91] flex items-center justify-center p-4">
          <Dialog.Content className="relative w-full max-w-[30rem] overflow-hidden rounded-lg border border-border bg-surface shadow-2xl animate-slide-up">
          {!succes && <Confettis />}

          <span
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-10 select-none font-display text-[9rem] font-extrabold leading-none text-white/[0.04]"
          >
            三千
          </span>

          <div className="relative p-7 text-center">
            <Dialog.Close className="absolute right-3 top-3 text-muted transition-colors hover:text-text" title="Fermer">
              <X size={18} />
            </Dialog.Close>

            {succes ? (
              <>
                <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/30">
                  <Check size={30} />
                </span>
                <Dialog.Title className="font-display text-2xl font-bold tracking-tight text-glow">
                  Ultimate activé
                </Dialog.Title>
                <Dialog.Description className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
                  C'est à toi {dateFin ? <>jusqu'au <span className="font-semibold text-text">{dateFin}</span></> : "dès maintenant"} :
                  téléchargements illimités, Watch Party sans limite de place, thèmes exclusifs.
                  Merci encore d'être là.
                </Dialog.Description>
                <button onClick={fermerModale} className="btn-shu mt-6 w-full">
                  C'est parti
                </button>
              </>
            ) : (
              <>
                {/* « Vous êtes », le compteur et le titre se lisent comme une seule phrase. */}
                <p className="eyebrow">Vous êtes</p>
                <div className="mt-1 font-display text-6xl font-extrabold leading-none tracking-tight text-primary text-glow">
                  <Compteur />
                </div>
                <Dialog.Title className="mt-3 font-display text-xl font-bold tracking-tight">
                  {statut.title || "et on ne s'y attendait vraiment pas"}
                </Dialog.Title>
                <Dialog.Description className="mx-auto mt-3 max-w-sm whitespace-pre-line text-sm leading-relaxed text-muted">
                  {statut.message ||
                    "Nartya a commencé tout petit, entre deux bugs et trois idées de plus.\n\nMerci d'être là, vraiment. Ultimate t'est offert pendant 7 jours — rien à faire, rien à payer."}
                </Dialog.Description>

                <div className="mt-5 flex items-center justify-center gap-2 rounded-md bg-surface-2/70 px-4 py-3 ring-1 ring-border">
                  <Crown size={16} className="shrink-0 text-[#d6aa68]" />
                  <span className="text-sm font-semibold text-text">
                    Ultimate — {statut.durationDays} jours offerts
                  </span>
                </div>

                {erreur && <p className="mt-3 text-xs leading-relaxed text-primary">{erreur}</p>}

                <button
                  onClick={reclamer}
                  disabled={busy}
                  className="btn-shu mt-5 flex w-full items-center justify-center gap-2 disabled:opacity-60"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />}
                  Réclamer mon Ultimate
                </button>

                {statut.closesAt && (
                  <p className="mt-3 text-[0.7rem] text-muted/70">
                    À réclamer avant le{" "}
                    {new Date(statut.closesAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                  </p>
                )}
              </>
            )}
          </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
