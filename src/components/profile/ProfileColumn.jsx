import { ArrowLeft } from "lucide-react";
import { foregroundFor } from "@/utils/theme";
import { profileArt } from "@/lib/profileArt";
import { pageAmbientBackdrop, accentRgb, resolveAccent, resolveBanner, resolveEmblem, resolvePageBackground } from "@/api/profile";
import { resolveCosmetics } from "@/lib/cosmetics";
import BannerDecor from "@/components/ambient/BannerDecor";
import ThemeAmbience from "@/components/ambient/ThemeAmbience";
import ProfileAmbience from "@/components/ambient/ProfileAmbience";
import ProfilePanelAmbience from "@/components/ambient/ProfilePanelAmbience";
import IdentityCard from "./IdentityCard";
import PodiumSection from "./PodiumSection";
import AchievementsList from "./AchievementsList";
import WatchCalendar from "./WatchCalendar";
import ActivityFeed from "./ActivityFeed";

const SCANLINES = "repeating-linear-gradient(0deg, transparent, transparent 2px, rgb(0 0 0 / 0.05) 2px, rgb(0 0 0 / 0.05) 4px)";

/**
 * Les cosmétiques affichés sont ceux du propriétaire du profil. `actions` : boutons en haut
 * à droite de la bannière. `showFavorites` / `showActivity` : confidentialité du membre.
 */
export default function ProfileColumn({
  profile,
  stats,
  extra,
  favorites,
  activity,
  friends,
  isSelf,
  actions,
  belowIdentity,
  onBack,
  onAvatarError,
  showFavorites = true,
  showActivity = true,
  children,
}) {
  const cos = resolveCosmetics(profile);
  const accent = accentRgb(resolveAccent(profile));
  const ambience = profile?.ambient_theme ?? null;
  // Fond de page dédié, sinon la bannière floutée, sinon un halo de thème.
  const savedBanner = resolveBanner(profile);
  const themeBanner = profileArt(cos.banner)?.background ?? null;
  const banner = savedBanner || themeBanner;
  const pageBg = resolvePageBackground(profile) || savedBanner || themeBanner;
  const emblem = resolveEmblem(profile);

  return (
    <div className="relative animate-fade-in" style={accent ? { "--primary": accent, "--primary-fg": foregroundFor(accent) } : undefined}>
      {/* `fixed` : couvre les côtés d'une fenêtre large. */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {pageBg ? (
          <div
            className="absolute inset-0 scale-105 bg-cover bg-center"
            style={{ backgroundImage: `url(${pageBg})`, filter: "brightness(0.55) saturate(1.1) blur(6px)" }}
          />
        ) : (
          <div className="absolute inset-0" style={{ backgroundImage: pageAmbientBackdrop() }} />
        )}
        <div className="absolute inset-0" style={{ backgroundImage: SCANLINES }} />
        <div className="absolute inset-0 bg-bg/15" />
      </div>
      <ProfileAmbience id={ambience} />
      {/* 1440 moins le rail de 64. */}
      <div className="relative z-10 mx-auto w-full min-w-0 max-w-[1376px] overflow-x-clip md:pb-24 md:pt-[env(safe-area-inset-top)]">
        {/* Fond opaque, pour rester lisible sur le fond de page. */}
        <section
          className="relative"
          style={{
            background:
              "radial-gradient(120% 90% at 85% -10%, rgb(var(--primary) / 0.26), transparent 60%)," +
              "radial-gradient(100% 85% at -10% 100%, rgb(var(--primary) / 0.14), transparent 65%)," +
              "linear-gradient(165deg, rgb(var(--surface)) 0%, rgb(var(--bg)) 70%)",
            boxShadow: "0 30px 80px rgb(0 0 0 / 0.55)",
          }}
        >
          <div className="pointer-events-none absolute inset-0" style={{ background: SCANLINES }} />
          <ProfilePanelAmbience id={ambience} />
          <div className="relative h-[calc(13rem+env(safe-area-inset-top))] w-full overflow-hidden sm:h-[300px]">
            {banner ? (
              <img src={banner} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full" style={{ backgroundImage: pageAmbientBackdrop() }} />
            )}
            {banner && (
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(115deg, rgb(var(--primary) / 0.22), transparent 45%, rgb(var(--primary) / 0.05))" }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "repeating-linear-gradient(0deg, transparent, transparent 2px, rgb(0 0 0 / 0.06) 2px, rgb(0 0 0 / 0.06) 4px)",
              }}
            />
            {cos.banner && <BannerDecor key={`${cos.banner}-back`} token={cos.banner} />}
            {ambience && <ThemeAmbience token={ambience === "sakura_fall" ? "kurotsuki" : ambience === "phantom" ? "raijin" : ambience === "ocean" ? "grand_line" : ambience} />}
            {emblem && (
              <span
                className="pointer-events-none absolute right-5 -top-9 select-none font-display font-bold leading-none"
                style={{
                  // `soft-light` : le kanji est porté par la lumière de l'image.
                  fontSize: "clamp(8rem, 32vw, 13rem)",
                  color: `rgb(255 255 255 / ${banner ? 0.7 : 0.78})`,
                  WebkitTextStroke: "1px rgb(255 255 255 / 0.1)",
                  mixBlendMode: "soft-light",
                }}
              >
                {emblem}
              </span>
            )}
            {/* Là où la fiche d'identité chevauche la bannière. */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgb(var(--bg)) 2%, rgb(var(--bg) / 0.55) 45%, transparent)",
              }}
            />
            {cos.banner && <BannerDecor key={`${cos.banner}-front`} token={cos.banner} layer="front" />}
            <div
              className="absolute inset-x-0 bottom-0 h-[2px]"
              style={{ background: "linear-gradient(90deg, rgb(var(--primary)), rgb(var(--primary) / 0.3) 60%, transparent)" }}
            />
            {/* Au-dessus de la couche d'ambiance (z-[5]). */}
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="absolute left-4 top-[calc(env(safe-area-inset-top)+1rem)] z-20 flex h-[38px] items-center gap-2 rounded-md bg-bg/85 px-4 text-[13px] font-bold text-text ring-2 ring-border transition-colors hover:bg-bg sm:left-7 sm:top-6"
              >
                <ArrowLeft size={14} /> Retour
              </button>
            )}
            {actions && (
              <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-20 flex flex-wrap justify-end gap-2 sm:right-7 sm:top-6">
                {actions}
              </div>
            )}
          </div>

          {/* La fiche d'identité mord sur le tiers bas de la bannière. */}
          {/* `minmax(0,1fr)` : un pseudo d'un seul tenant élargissait la colonne au-delà de l'écran. */}
          <div className="relative z-10 grid grid-cols-[minmax(0,1fr)] gap-8 px-4 pb-12 sm:px-10 lg:-mt-[108px] lg:grid-cols-[352px_minmax(0,1fr)]">
            <div>
              <IdentityCard
                profile={profile}
                stats={stats}
                extra={extra}
                friends={friends}
                ornament={cos.ornament}
                isSelf={isSelf}
                onAvatarError={onAvatarError}
              />
              {belowIdentity}
            </div>

            <div className="lg:pt-[132px]">
              {showFavorites && <PodiumSection items={favorites} username={profile?.username} isSelf={isSelf} />}

              <WatchCalendar userId={profile?.id} />

              <div className="mt-9 grid gap-8 sm:grid-cols-2">
                <AchievementsList stats={stats} isSelf={isSelf} />
                {showActivity ? (
                  <ActivityFeed items={activity} loading={activity === null} variant="compact" />
                ) : (
                  <p className="self-start rounded-md border border-dashed border-border/70 px-4 py-10 text-center font-display text-sm font-medium text-muted/70">
                    Ce membre garde son activité privée.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
      {children}
    </div>
  );
}
