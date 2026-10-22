import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, RefreshCw } from "lucide-react";
import DiscordIcon from "@/components/icons/DiscordIcon";
import { useAuthStore } from "@/stores/useAuthStore";

// En dev : `localStorage.setItem("nartya-debug-discord-reauth", "1")` affiche la modale sans condition.
const DEBUG_KEY = "nartya-debug-discord-reauth";

function readFlag(storage, key) {
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** Comptes Discord liés avant `guilds.join` : reconnexion obligatoire, une seule fois. */
export default function DiscordReauthModal() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const accessToken = useAuthStore((s) => s.session?.access_token);
  const expiresAt = useAuthStore((s) => s.session?.expires_at);
  const discordGuild = useAuthStore((s) => s.discordGuild);
  const reauthError = useAuthStore((s) => s.discordReauthError);
  const checkDiscordGuild = useAuthStore((s) => s.checkDiscordGuild);
  const reauthorizeDiscord = useAuthStore((s) => s.reauthorizeDiscord);
  const waiting = useAuthStore((s) => s.discordReauthPending);
  const [debugDone, setDebugDone] = useState(false);
  const wasWaiting = useRef(false);
  const debug = import.meta.env.DEV && readFlag(localStorage, DEBUG_KEY);

  // Au démarrage, la session amorcée peut porter un jeton expiré (sur le bureau, le Hub le
  // rafraîchit) : l'API répondrait 401. On attend un jeton valide, et on retente au suivant.
  useEffect(() => {
    if (!accessToken || discordGuild !== "unknown") return;
    if (expiresAt && expiresAt * 1000 <= Date.now()) return;
    checkDiscordGuild();
  }, [accessToken, expiresAt, discordGuild, checkDiscordGuild]);

  // En debug, la modale ne dépend pas de l'état réel : on la ferme après un retour réussi.
  useEffect(() => {
    if (wasWaiting.current && !waiting && !reauthError) setDebugDone(true);
    wasWaiting.current = waiting;
  }, [waiting, reauthError]);

  const open = debug ? !debugDone : !!userId && discordGuild === "missing";
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="discord-reauth-title"
        className="animate-slide-up relative w-full max-w-[28rem] overflow-hidden rounded-[6px] border border-border bg-surface shadow-[0_28px_90px_-24px_rgba(0,0,0,0.95)] ring-1 ring-white/10"
      >
        <div className="h-[2px] bg-[#5865F2]" />
        <header className="px-6 pb-5 pt-6">
          <span className="grid h-11 w-11 place-items-center rounded-[5px] bg-[#5865F2]/12 text-[#8f99ff]">
            <DiscordIcon className="h-5 w-5" />
          </span>
          <h2 id="discord-reauth-title" className="mt-5 font-display text-2xl font-bold tracking-tight">
            Reconnecte ton compte Discord
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            La connexion entre Nartya et Discord a été mise à jour. Reconnecte-toi une fois pour la
            renouveler : tu restes sur ton compte, rien n'est perdu.
          </p>
          {reauthError && (
            <p role="alert" className="mt-4 rounded-[5px] border border-primary/30 bg-primary/10 px-3 py-2 text-xs leading-relaxed text-text">
              {reauthError}
            </p>
          )}
          {waiting && (
            <p className="mt-4 flex items-center gap-2 text-xs leading-relaxed text-muted">
              <LoaderCircle size={13} className="shrink-0 animate-spin" />
              Termine l'autorisation dans la fenêtre Discord, puis reviens ici.
            </p>
          )}
        </header>

        <footer className="flex items-center justify-end gap-3 border-t border-border/60 px-6 py-5">
          {/* Jamais désactivé : la modale est obligatoire, une page Discord fermée ne doit pas bloquer. */}
          <button
            type="button"
            onClick={reauthorizeDiscord}
            className="inline-flex h-9 items-center gap-2 rounded-[5px] bg-[#5865F2] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#4752c4]"
          >
            <RefreshCw size={14} />
            {waiting ? "Rouvrir la page Discord" : "Se reconnecter avec Discord"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
