import { useEffect, useState } from "react";

function initial(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

/**
 * Repli sur l'initiale si l'URL manque ou échoue (une URL Discord expire quand l'utilisateur
 * change de photo). `className` porte taille et forme ; `textClassName` ne stylise que l'initiale.
 */
export function Avatar({ src, name, className = "", textClassName = "text-sm", style, onError }) {
  const [failed, setFailed] = useState(false);
  // Une nouvelle URL retente le chargement.
  useEffect(() => setFailed(false), [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        onError={() => {
          setFailed(true);
          onError?.();
        }}
        className={`object-cover ${className}`}
        style={style}
      />
    );
  }
  return (
    <span
      className={`flex items-center justify-center bg-surface-2 font-bold text-white ${className} ${textClassName}`}
      style={style}
    >
      {initial(name)}
    </span>
  );
}
