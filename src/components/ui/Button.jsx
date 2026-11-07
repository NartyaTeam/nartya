import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

/**
 * Bouton du design system. `variant` : primary | secondary | ghost | danger ;
 * `size` : sm | md | lg. `loading` remplace l'icône par un spinner et désactive le bouton.
 */
const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50";

const VARIANTS = {
  primary: "bg-primary text-primary-fg hover:bg-primary/90",
  secondary: "bg-surface-2 text-text ring-1 ring-inset ring-border hover:bg-surface-2/70 hover:ring-muted/40",
  ghost: "text-muted hover:bg-white/[0.06] hover:text-text",
  danger: "bg-danger/15 text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger/25",
};

const SIZES = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-3.5 text-sm",
  lg: "h-11 px-5 text-sm",
};

export const Button = forwardRef(function Button(
  { variant = "primary", size = "md", icon: Icon, loading = false, className = "", children, disabled, type = "button", ...props },
  ref
) {
  const iconSize = size === "sm" ? 14 : 16;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`${BASE} ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...props}
    >
      {loading ? <Loader2 size={iconSize} className="animate-spin" /> : Icon ? <Icon size={iconSize} /> : null}
      {children}
    </button>
  );
});

export default Button;
