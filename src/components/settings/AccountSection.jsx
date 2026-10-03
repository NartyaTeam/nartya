import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, ExternalLink, Image, LoaderCircle, LogOut } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSignOutModalStore } from "@/stores/useSignOutModalStore";
import { Avatar } from "@/components/ui/Avatar";
import DiscordIcon from "@/components/icons/DiscordIcon";
import { resolveAvatar, resolveBanner } from "@/api/profile";
import { platform } from "@/platform";
import { Section } from "./SettingsLayout";
import DiscordSyncModal from "./DiscordSyncModal";

function LinkedAccountButton({
  icon: Icon,
  name,
  description,
  iconClassName,
  linked = false,
  pending = false,
  unavailable = false,
  onClick,
}) {
  return (
    <button
      type="button"
      disabled={linked || pending || unavailable}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3.5 text-left transition-colors md:gap-4 md:rounded-[5px] md:px-4 md:py-4 ${
        linked
          ? "border-emerald-400/20 bg-emerald-400/[0.035]"
          : "border-border/70 bg-bg/25 hover:border-[#5865F2]/45 hover:bg-[#5865F2]/[0.055]"
      } disabled:cursor-default`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[5px] bg-white/[0.05]">
        <Icon className={`h-[18px] w-[18px] ${iconClassName}`} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{name}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <span
        className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border px-2 py-1 text-[0.62rem] font-bold uppercase tracking-[0.12em] ${
          linked
            ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300"
            : "border-[#5865F2]/30 bg-[#5865F2]/10 text-[#9ba4ff]"
        }`}
      >
        {pending ? (
          <LoaderCircle size={11} className="animate-spin" />
        ) : linked ? (
          <CheckCircle2 size={11} />
        ) : null}
        {pending ? "Ouverture" : linked ? "Lié" : unavailable ? "E-mail requis" : "Lier"}
      </span>
    </button>
  );
}


function AccountSpace({
  profile,
  session,
  isDesktop,
  onAvatarError,
  onSignOut,
  discordLinked,
  discordLinking,
  discordInspecting,
  discordLinkError,
  onLinkDiscord,
  onManageDiscord,
}) {
  const banner = resolveBanner(profile);
  const avatar =
    resolveAvatar(profile) || session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture;
  const username =
    profile?.username || session?.user?.user_metadata?.full_name || session?.user?.email || "Compte Nartya";
  const handle = profile?.handle;
  const email = session?.user?.email;
  const canLinkDiscord = !session?.user?.is_anonymous;

  return (
    <div className="py-4 md:py-6">
      <div className="relative h-36 overflow-hidden rounded-xl border border-border/70 bg-surface sm:h-48 md:rounded-[6px]">
        {banner ? (
          <img src={banner} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background:
                "radial-gradient(70% 140% at 85% 20%, rgb(var(--primary) / 0.28), transparent 68%), rgb(var(--surface))",
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-primary via-primary/35 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 sm:gap-4 sm:p-6">
          <Avatar
            src={avatar}
            name={username}
            onError={onAvatarError}
            className="h-14 w-14 shrink-0 rounded-xl border-2 border-primary/60 bg-surface-2 shadow-xl sm:h-20 sm:w-20 sm:rounded-[6px]"
            textClassName="text-2xl"
          />
          <div className="min-w-0 flex-1 pb-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-display text-lg font-black text-white sm:text-2xl">
                {username}
              </h3>
              <span className="rounded-[3px] bg-primary/15 px-2 py-0.5 text-[0.56rem] font-bold uppercase tracking-[0.14em] text-primary">
                Compte Nartya
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-white/60">
              {handle ? `@${handle}` : email || "Session active"}
            </p>
          </div>
          <Link
            to="/profile"
            className="hidden h-9 items-center gap-2 rounded-[5px] border border-white/15 bg-black/35 px-3 text-xs font-semibold text-white/75 backdrop-blur-sm transition-colors hover:border-white/30 hover:text-white sm:inline-flex"
          >
            Voir le profil
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>

      {/* Sur le bureau, elle passe par le Hub. */}
      {!isDesktop && (
        <div className="mt-5 md:mt-6">
          <div className="mb-3">
            <div>
              <p className="text-sm font-semibold text-text">Comptes liés</p>
              <p className="mt-1 text-xs text-muted">
                Ajoute Discord comme moyen de connexion sans perdre ton compte ni ta progression.
              </p>
            </div>
          </div>
          <div className="max-w-2xl">
            <LinkedAccountButton
              icon={DiscordIcon}
              iconClassName="text-[#5865F2]"
              name="Discord"
              description={
                discordLinked
                  ? "Compte associé — tu peux aussi te connecter avec Discord"
                  : canLinkDiscord
                    ? "Lier ce compte e-mail à ton identité Discord"
                    : "Crée d'abord un compte e-mail permanent"
              }
              linked={discordLinked}
              pending={discordLinking}
              unavailable={!canLinkDiscord}
              onClick={onLinkDiscord}
            />
            {discordLinked && (
              <button
                type="button"
                onClick={onManageDiscord}
                disabled={discordInspecting}
                className="mt-2 inline-flex h-9 items-center gap-2 rounded-[5px] border border-[#5865F2]/30 bg-[#5865F2]/[0.06] px-3 text-xs font-semibold text-[#aeb5ff] transition-colors hover:border-[#5865F2]/50 hover:bg-[#5865F2]/10 disabled:opacity-55"
              >
                {discordInspecting ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <Image size={14} />
                )}
                Choisir les visuels à importer
              </button>
            )}
            {discordLinkError && (
              <div
                role="alert"
                className="mt-2 flex items-start gap-3 rounded-[5px] border border-red-400/30 bg-red-400/[0.07] px-4 py-3 text-red-200"
              >
                <AlertCircle size={17} className="mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold">Action Discord impossible</p>
                  <p className="mt-1 text-xs leading-relaxed text-red-100/70">{discordLinkError}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col justify-between gap-3 border-t border-border/50 pt-4 sm:mt-6 sm:flex-row sm:items-center sm:gap-4 sm:pt-5">
        <div>
          <p className="text-xs font-semibold text-text/75">Session et identité</p>
          <p className="mt-1 text-xs text-muted">
            {isDesktop
              ? "La déconnexion s'applique aussi au Hub puis ferme l'application."
              : "La déconnexion s'applique à cet appareil."}
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/30 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 sm:h-9 sm:rounded-[5px]"
        >
          <LogOut size={14} />
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

export default function AccountSection({ number }) {
  const isDesktop = platform.isDesktop;
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const refreshAvatar = useAuthStore((s) => s.refreshAvatarFromDiscord);
  const linkDiscordIdentity = useAuthStore((s) => s.linkDiscordIdentity);
  const discordSyncOffer = useAuthStore((s) => s.discordSyncOffer);
  const discordLinkFeedback = useAuthStore((s) => s.discordLinkFeedback);
  const discordLinkError = useAuthStore((s) => s.discordLinkError);
  const inspectDiscordProfile = useAuthStore((s) => s.inspectDiscordProfile);
  const syncDiscordProfile = useAuthStore((s) => s.syncDiscordProfile);
  const dismissDiscordSyncOffer = useAuthStore((s) => s.dismissDiscordSyncOffer);
  const clearDiscordLinkFeedback = useAuthStore((s) => s.clearDiscordLinkFeedback);
  const [discordLinking, setDiscordLinking] = useState(false);
  const [discordInspecting, setDiscordInspecting] = useState(false);
  const [discordSyncing, setDiscordSyncing] = useState(false);
  const showSignOut = useSignOutModalStore((s) => s.show);
  const discordLinked =
    !!user?.discord_id ||
    session?.user?.identities?.some((identity) => identity.provider === "discord") ||
    session?.user?.app_metadata?.providers?.includes("discord");

  useEffect(() => {
    if (!discordLinkFeedback) return;
    if (discordLinkFeedback.type === "success") toast.success(discordLinkFeedback.message);
    else if (discordLinkFeedback.type === "warning") toast.warn(discordLinkFeedback.message);
    else toast.error(discordLinkFeedback.message || "Liaison Discord impossible");
    clearDiscordLinkFeedback();
  }, [clearDiscordLinkFeedback, discordLinkFeedback]);

  const handleLinkDiscord = async () => {
    setDiscordLinking(true);
    try {
      const result = await linkDiscordIdentity();
      if (result?.error) {
        const manualLinkingDisabled = /manual|linking.*disabled|identity.*link/i.test(result.error);
        toast.error(
          manualLinkingDisabled
            ? "La liaison de comptes doit d'abord être activée côté Nartya."
            : result.error
        );
      } else if (result?.alreadyLinked) {
        toast.info("Ce compte Discord est déjà lié.");
      }
    } finally {
      setDiscordLinking(false);
    }
  };

  const handleManageDiscord = async () => {
    setDiscordInspecting(true);
    try {
      const result = await inspectDiscordProfile();
      if (result?.error) toast.error(result.error);
    } finally {
      setDiscordInspecting(false);
    }
  };

  const handleSyncDiscord = async (selection) => {
    setDiscordSyncing(true);
    try {
      const result = await syncDiscordProfile(selection);
      if (result?.error) toast.error(result.error);
      else toast.success("Profil Discord importé sur Nartya.");
    } finally {
      setDiscordSyncing(false);
    }
  };

  return (
    <>
      <Section
        id="account"
        number={number}
        eyebrow="Identité Nartya"
        title="Compte"
        description="Ton profil, ta session et les services externes bientôt reliés à Nartya."
      >
        <AccountSpace
          profile={user}
          session={session}
          isDesktop={isDesktop}
          onAvatarError={refreshAvatar}
          onSignOut={showSignOut}
          discordLinked={discordLinked}
          discordLinking={discordLinking}
          discordInspecting={discordInspecting}
          discordLinkError={discordLinkError}
          onLinkDiscord={handleLinkDiscord}
          onManageDiscord={handleManageDiscord}
        />
      </Section>
      {discordSyncOffer && (
        <DiscordSyncModal
          offer={discordSyncOffer}
          pending={discordSyncing}
          onConfirm={handleSyncDiscord}
          onCancel={() => {
            dismissDiscordSyncOffer();
            toast.info("Tes visuels Nartya restent inchangés.");
          }}
        />
      )}
    </>
  );
}
