import { useEffect, useRef, useState } from "react";

/**
 * Bannière d'une fiche. L'affiche, déjà connue, passe d'abord en fond flouté ; la vraie
 * image arrive en fondu une fois chargée. Sans ça, le cadre reste vide puis s'allume d'un coup.
 * `sources` : adresses candidates par ordre de préférence ; une image qui ne charge pas
 * (404, hôte bloqué) laisse la place à la suivante au lieu d'un cadre vide.
 */
export default function HeroBanner({ src, sources, placeholder }) {
  const candidates = [...new Set([src, ...(sources || [])].filter(Boolean))];
  const candidatesKey = candidates.join("|");
  const [failed, setFailed] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef(null);
  const current = candidates[failed] || null;

  useEffect(() => {
    setFailed(0);
  }, [candidatesKey]);

  useEffect(() => {
    // Image déjà en cache du navigateur : `onLoad` peut être parti avant le montage.
    const img = imgRef.current;
    setLoaded(Boolean(img?.complete && img.naturalWidth > 0));
  }, [current]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-surface">
      {placeholder && placeholder !== current && (
        <div
          aria-hidden="true"
          className="absolute inset-0 scale-110 bg-cover bg-center opacity-70 blur-2xl"
          style={{ backgroundImage: `url(${placeholder})` }}
        />
      )}
      {current && (
        <img
          ref={imgRef}
          src={current}
          alt=""
          decoding="async"
          fetchPriority="high"
          draggable="false"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed((n) => n + 1)}
          className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-500 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
