import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ACHIEVEMENT_TIERS_BY_ID, ACHIEVEMENT_TIER_LOOKS } from "@/data/achievements";
import { useAchievementUnlockStore } from "@/stores/useAchievementUnlockStore";

/**
 * Montée une fois pour toute l'app. Elle tombe pendant la lecture : la scène est
 * `pointer-events-none` et se referme seule (Échap l'expédie).
 */
/**
 * L'élément en plein écran s'il y en a un : en plein écran natif, un portail vers le body
 * serait invisible.
 */
function useCeremonyHost() {
  const [host, setHost] = useState(
    () => document.fullscreenElement || document.webkitFullscreenElement || document.body
  );
  useEffect(() => {
    const sync = () =>
      setHost(document.fullscreenElement || document.webkitFullscreenElement || document.body);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);
  return host;
}

/** Un succès tombé en arrière-plan attend le retour au premier plan. */
function useDocumentVisible() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const sync = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return visible;
}

/** En ms. */
const CHAIN_GAP_MS = 280;

export default function AchievementUnlock() {
  const queue = useAchievementUnlockStore((state) => state.queue);
  const batch = useAchievementUnlockStore((state) => state.batch);
  const dismiss = useAchievementUnlockStore((state) => state.dismiss);
  const host = useCeremonyHost();
  const visible = useDocumentVisible();
  // Battement de noir entre deux paliers, sinon l'enchaînement se lit comme un clignotement.
  const [pausing, setPausing] = useState(false);
  const gapRef = useRef(null);

  const handleDone = useCallback(() => {
    setPausing(true);
    gapRef.current = setTimeout(() => {
      dismiss();
      setPausing(false);
    }, CHAIN_GAP_MS);
  }, [dismiss]);

  useEffect(() => () => clearTimeout(gapRef.current), []);

  const currentId = queue[0] || null;
  if (!currentId || pausing || !visible) return null;

  return (
    // `key` remonte la scène d'un palier à l'autre, pour rejouer les animations CSS.
    <Ceremony
      key={`${currentId}:${host === document.body ? "page" : "fs"}`}
      id={currentId}
      host={host}
      // « 2 / 3 »
      position={batch > 1 ? batch - queue.length + 1 : 0}
      total={batch}
      onDone={handleDone}
    />
  );
}

function Ceremony({ id, host, position, total, onDone }) {
  const { family, tier } = ACHIEVEMENT_TIERS_BY_ID[id];
  const look = ACHIEVEMENT_TIER_LOOKS[tier.level] || ACHIEVEMENT_TIER_LOOKS[1];

  // Palier III, tirées une fois par cérémonie.
  const embers = useMemo(
    () =>
      Array.from({ length: look.embers }, (_, i) => {
        const angle = (i / look.embers) * Math.PI * 2 + Math.random() * 0.6;
        const reach = 120 + Math.random() * 130;
        return {
          dx: `${Math.cos(angle) * reach}px`,
          // Biais vers le haut.
          dy: `${Math.sin(angle) * reach - 60}px`,
          size: 2 + Math.random() * 3,
          delay: `${0.36 + Math.random() * 0.5}s`,
          life: `${1.8 + Math.random() * 1.4}s`,
        };
      }),
    [look.embers]
  );

  useEffect(() => {
    const timer = setTimeout(onDone, look.life);
    const onKey = (e) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [look.life, onDone]);

  return createPortal(
    <div
      // Les rayons débordent du cadre.
      className="ach-stage fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
      style={{ "--halo": look.halo, "--life": `${look.life}ms` }}
      role="status"
      aria-live="polite"
    >
      <div className="ach-veil absolute inset-0" />

      {/* Secousse à l'atterrissage du sceau. */}
      <div className="ach-punch relative flex flex-col items-center px-6">
        {/* Décor, allumé par paliers */}
        <div className="pointer-events-none absolute left-1/2 top-[104px] h-0 w-0 -translate-x-1/2">
          {look.rays && (
            <div className="absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2">
              <div className="ach-rays h-full w-full opacity-[0.22]" />
            </div>
          )}
          {look.tone && (
            <div className="absolute left-1/2 top-1/2 h-[430px] w-[430px] -translate-x-1/2 -translate-y-1/2">
              <div className="ach-tone h-full w-full opacity-[0.28]" />
            </div>
          )}
          <div className="absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2">
            <div className="ach-splash h-full w-full rounded-full" />
          </div>
          {/* Deux ondes décalées au palier III. */}
          <div className="absolute left-1/2 top-1/2 h-[230px] w-[230px] -translate-x-1/2 -translate-y-1/2">
            <div className="ach-shock h-full w-full rounded-full" />
          </div>
          {tier.level === 3 && (
            <div className="absolute left-1/2 top-1/2 h-[230px] w-[230px] -translate-x-1/2 -translate-y-1/2">
              <div
                className="ach-shock h-full w-full rounded-full"
                style={{ "--delay": "0.62s" }}
              />
            </div>
          )}
          {embers.map((ember, i) => (
            <span key={i} className="absolute left-1/2 top-1/2 h-0 w-0">
              <span
                className="ach-ember block rounded-full"
                style={{
                  width: ember.size,
                  height: ember.size,
                  "--dx": ember.dx,
                  "--dy": ember.dy,
                  "--delay": ember.delay,
                  "--ember-life": ember.life,
                }}
              />
            </span>
          ))}
        </div>

        {/* Trois couches, une propriété animée chacune : sur un seul nœud, `transform` et `filter` se battraient. */}
        <div className="ach-halo relative h-[208px] w-[208px]">
          <div className="ach-float relative h-full w-full">
            <img src={tier.badge} alt="" className="ach-badge h-full w-full object-contain" />
            {/* Masqué par l'insigne ; le palier III le repasse. */}
            {look.gloss && (
              <>
                <div
                  className="ach-gloss pointer-events-none absolute inset-0"
                  style={{ "--badge": `url(${tier.badge})` }}
                />
                {tier.level === 3 && (
                  <div
                    className="ach-gloss pointer-events-none absolute inset-0"
                    style={{ "--badge": `url(${tier.badge})`, "--delay": "2.9s" }}
                  />
                )}
              </>
            )}
          </div>
        </div>

        <div className="ach-line mt-5 h-px w-[190px]" />

        <p
          className="ach-text mt-4 text-[0.62rem] font-bold uppercase tracking-kana"
          style={{ color: look.halo, "--delay": "0.6s" }}
        >
          Succès débloqué
        </p>
        <h2
          className="ach-text mt-2 text-center font-display text-3xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.9)] sm:text-4xl"
          style={{ "--delay": "0.7s" }}
        >
          {tier.name}
        </h2>
        <p className="ach-text mt-1.5 text-sm text-white/65" style={{ "--delay": "0.8s" }}>
          {family.name}
        </p>

        <div
          className="ach-text mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1"
          style={{ borderColor: look.halo, "--delay": "0.9s" }}
        >
          <span className="font-display text-xs font-black" style={{ color: look.halo }}>
            {look.numeral}
          </span>
          <span className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-white/70">
            {look.label}
          </span>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-[2px] w-[120px] overflow-hidden rounded-full bg-white/10">
            <div className="ach-timer h-full w-full" style={{ "--life": `${look.life}ms` }} />
          </div>
          {/* Combien il en reste dans la salve. */}
          {position > 0 && (
            <span className="font-display text-[0.62rem] font-bold tabular-nums text-white/45">
              {position} / {total}
            </span>
          )}
        </div>
      </div>
    </div>,
    host
  );
}
