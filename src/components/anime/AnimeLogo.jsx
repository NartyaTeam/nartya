/**
 * Assets hétérogènes (horizontal, carré, larges marges) : le conteneur borne le rendu, sans
 * zoom déduit du ratio.
 */
export function isClearLogoUrl(src) {
  return Boolean(src) && !/\/icons\//i.test(src);
}

export default function AnimeLogo({
  src,
  alt,
  className = "",
  imageClassName = "",
  ...imageProps
}) {
  return (
    <span className={`relative block shrink-0 overflow-hidden ${className}`}>
      <img
        src={src}
        alt={alt}
        {...imageProps}
        className={`absolute inset-0 h-full w-full object-contain ${imageClassName}`}
      />
    </span>
  );
}
