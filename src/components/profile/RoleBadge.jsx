import { Shield, ShieldCheck, Code2 } from "lucide-react";

// Figé : le badge ne suit pas le `--primary` d'un thème de profil.
const VERMILLION = "255 113 62";

/** `user` est masqué sauf `showMember`. */
const STYLES = {
  developer: {
    label: "Développeur",
    icon: Code2,
    className: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
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
    className: "border-sky-400/25 bg-sky-400/10 text-sky-300",
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
  const dims = size === "lg" ? "gap-1.5 px-2 py-1 text-[0.7rem]" : "gap-1 px-1.5 py-0.5 text-[0.6rem]";
  return (
    <span
      style={s.style}
      className={`inline-flex items-center rounded-[5px] border font-semibold uppercase tracking-kana ${dims} ${s.className}`}
    >
      {Icon && <Icon size={size === "lg" ? 12 : 10} strokeWidth={2.5} />}
      {s.label}
    </span>
  );
}
