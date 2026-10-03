import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * `<main>` est démonté à chaque passage au lecteur : les positions vivent au niveau module.
 * POP restaure, PUSH remonte en haut, REPLACE (changement de filtre) ne touche à rien.
 */
const positions = new Map();

export function useScrollRestoration(containerRef) {
  const location = useLocation();
  const navType = useNavigationType();
  const prevPath = useRef(location.pathname);
  const restoringRef = useRef(false);

  // En continu, pas au démontage : `<main>` est alors vidé et `scrollTop` vaut 0. Les scrolls
  // émis pendant une restauration sont souvent clampés : ignorés.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const key = location.key;
    const onScroll = () => {
      if (restoringRef.current) return;
      positions.set(key, el.scrollTop);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [location.key, containerRef]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const samePath = location.pathname === prevPath.current;
    prevPath.current = location.pathname;
    if (!el) return;

    if (navType !== "POP") {
      restoringRef.current = false;
      // Un PUSH qui ne change que la query ne remonte pas en haut.
      if (navType === "PUSH" && !samePath) el.scrollTop = 0;
      return;
    }

    const saved = positions.get(location.key);
    if (!saved) {
      restoringRef.current = false;
      return;
    }

    // La hauteur change après le premier rendu : on réapplique la position un court moment,
    // jusqu'à ce que l'utilisateur reprenne la main.
    restoringRef.current = true;
    const timers = [];
    let resizeObserver;
    const stop = () => {
      restoringRef.current = false;
    };
    const onUserScroll = () => stop();
    el.addEventListener("wheel", onUserScroll, { passive: true });
    el.addEventListener("touchstart", onUserScroll, { passive: true });
    el.addEventListener("keydown", onUserScroll);

    const apply = () => {
      if (!restoringRef.current) return;
      el.scrollTop = saved;
    };
    apply();

    [50, 150, 350, 700, 1200, 2000].forEach((delay) => {
      timers.push(setTimeout(apply, delay));
    });
    timers.push(setTimeout(stop, 2100));
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(apply);
      resizeObserver.observe(el.firstElementChild || el);
    }

    return () => {
      // `restoringRef` reste à true : en StrictMode, la position serait écrasée avant le remontage.
      timers.forEach(clearTimeout);
      resizeObserver?.disconnect();
      el.removeEventListener("wheel", onUserScroll);
      el.removeEventListener("touchstart", onUserScroll);
      el.removeEventListener("keydown", onUserScroll);
    };
  }, [location.key, location.pathname, navType, containerRef]);
}
