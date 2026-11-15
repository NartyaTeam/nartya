import { useEffect, useRef, useState } from "react";

/**
 * Bannière d'une fiche. L'affiche, déjà connue, passe d'abord en fond flouté ; la vraie
 * image arrive en fondu une fois chargée. Sans ça, le cadre reste vide puis s'allume d'un coup.
 */
export default function HeroBanner({ src, placeholder }) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    // Image déjà en cache du navigateur : `onLoad` peut être parti avant le montage.
    const img = imgRef.current;
    setLoaded(Boolean(img?.complete && img.naturalWidth > 0));
  }, [src]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-surface">
      {placeholder && placeholder !== src && (
        <div
          aria-hidden="true"
          className="absolute inset-0 scale-110 bg-cover bg-center opacity-70 blur-2xl"
          style={{ backgroundImage: `url(${placeholder})` }}
        />
      )}
      {src && (
        <img
          ref={imgRef}
          src={src}
          alt=""
          decoding="async"
          fetchPriority="high"
          draggable="false"
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-500 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
