import { Shield, ShieldCheck, Code2 } from "lucide-react";

// Figé : le badge ne suit pas le `--primary` d'un thème de profil.
const VERMILLION = "255 113 62";

/** `user` est masqué sauf `showMember`. */
const STYLES = {
  developer: {
    label: "Développeur",
    icon: Code2,
    className: "border-success/25 bg-success/10 text-success",
  },
  admin: {
    label: "Admin",
    icon: Shield,
    className: "border",
    style: {
      color: `rgb(${VERMILLION})`,
      backgroundColor: `rgb(${VERMILLION} / 0.10)`,
      borderColor: `rgb(${VERMILLION} / 0.35)`,
    },
  },
  staff: {
    label: "Staff",
    icon: ShieldCheck,
    className: "border-info/25 bg-info/10 text-info",
  },
  user: {
    label: "Membre",
    icon: null,
    className: "border-border bg-white/[0.03] text-muted",
  },
};

export default function RoleBadge({ role = "user", showMember = false, size = "sm" }) {
  if (role === "user" && !showMember) return null;
  const s = STYLES[role] || STYLES.user;
  const Icon = s.icon;
  const dims = size === "lg" ? "gap-1.5 px-2 py-1 text-2xs" : "gap-1 px-1.5 py-0.5 text-3xs";
  return (
    <span
      style={s.style}
      className={`inline-flex items-center rounded-md border font-semibold uppercase tracking-kana ${dims} ${s.className}`}
    >
      {Icon && <Icon size={size === "lg" ? 12 : 10} strokeWidth={2.5} />}
      {s.label}
    </span>
  );
}
