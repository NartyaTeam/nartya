/**
 * Petite étiquette en majuscules. `tone` : neutral | primary | success | warning | danger | info | gold.
 */
const TONES = {
  neutral: "border-border bg-surface-2 text-muted",
  primary: "border-primary/30 bg-primary/10 text-primary",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-info/30 bg-info/10 text-info",
  gold: "border-gold/35 bg-gold/10 text-gold",
};

export function Badge({ tone = "neutral", icon: Icon, className = "", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-kana ${TONES[tone] || TONES.neutral} ${className}`}
    >
      {Icon && <Icon size={9} strokeWidth={2.4} />}
      {children}
    </span>
  );
}

export default Badge;
