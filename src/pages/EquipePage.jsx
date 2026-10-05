import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Users, X, ArrowRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import RoleBadge from "@/components/profile/RoleBadge";
import { getTeamRoster, resolveAvatar } from "@/api/profile";

/** Par handle. Un membre absent a un traitement « staff » générique. */
const TEAM_META = {
  zeleff_: {
    order: 0,
    title: "Développeur principal",
    kanji: "朱",
    rgb: "255 113 62",
    blurb:
      "Le développeur principal de Nartya. Écrit le code, casse le code, répare le code — souvent le même jour, parfois entre deux épisodes qu'il regarde soi-disant « pour tester le lecteur ».",
  },
  "007": {
    order: 1,
    title: "Développeur secondaire",
    kanji: "刀",
    rgb: "245 158 11",
    blurb:
      "Développeur secondaire, complice de code de Zeleff_ : aussi doué pour livrer des fonctionnalités que pour dénicher les bugs qu'on aurait préféré ne jamais croiser.",
  },
  "001": {
    order: 2,
    title: "Chef de projet & communauté",
    kanji: "光",
    rgb: "56 189 248",
    blurb:
      "Gère le Discord, les réseaux et l'image de Nartya — le visage public d'un projet mené par deux développeurs qui préfèrent rester dans leur terminal.",
  },
  uhq: {
    order: 3,
    title: "Responsable de la modération",
    kanji: "影",
    rgb: "168 85 247",
    blurb: "Responsable de la modération. Rien ne lui échappe sur les commentaires — le pseudo n'est pas un hasard.",
  },
};

const STAFF_FALLBACK = {
  order: 99,
  title: "Membre du staff",
  kanji: "星",
  rgb: "52 211 153",
  blurb: "Membre du staff Nartya, présent pour que tout tourne rond — un commentaire signalé ou un bug remonté à la fois.",
};

function metaFor(member) {
  return TEAM_META[member.handle] || STAFF_FALLBACK;
}

function TeamCard({ member, meta, onOpen }) {
  const avatar = resolveAvatar(member);
  return (
    <button
      type="button"
      onClick={() => onOpen(member)}
      className="group relative flex flex-col items-center gap-3 overflow-hidden rounded-xl border border-border/60 bg-surface/40 p-6 text-center transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-[color:rgb(var(--m-rgb)/0.5)] hover:shadow-[0_20px_40px_-24px_rgb(var(--m-rgb)/0.55)] focus-visible:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--m-rgb))]"
      style={{ "--m-rgb": meta.rgb }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 -top-3 font-display text-[5.5rem] font-black leading-none opacity-0 transition-opacity duration-300 group-hover:opacity-[0.07]"
        style={{ color: `rgb(${meta.rgb})` }}
      >
        {meta.kanji}
      </span>

      <Avatar
        src={avatar}
        name={member.username}
        className="h-20 w-20 rounded-full ring-2 ring-border/60 transition-[box-shadow] duration-300 group-hover:ring-[color:rgb(var(--m-rgb)/0.65)]"
        textClassName="text-2xl"
        style={{ boxShadow: `0 0 0 0 rgb(${meta.rgb} / 0)` }}
      />
      <div className="relative">
        <p className="font-display text-base font-bold text-text">{member.username}</p>
        {member.handle && <p className="text-xs text-muted">@{member.handle}</p>}
      </div>
      <p className="text-xs font-semibold" style={{ color: `rgb(${meta.rgb})` }}>
        {meta.title}
      </p>
      <RoleBadge role={member.role} size="sm" />
    </button>
  );
}

function TeamMemberReveal({ member, meta, onClose }) {
  const avatar = resolveAvatar(member);
  const cardRef = useRef(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, px: 50, py: 50 });
  const reducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Sauf si l'utilisateur préfère moins de mouvement.
  const handleMove = (e) => {
    if (reducedMotion.current || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTilt({ rx: (0.5 - py) * 14, ry: (px - 0.5) * 14, px: px * 100, py: py * 100 });
  };
  const handleLeave = () => setTilt({ rx: 0, ry: 0, px: 50, py: 50 });

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="animate-fade-in-fast absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      {/* Mesuré sur un wrapper stable : lire la position de l'élément qui pivote crée une boucle de rétroaction. `perspective` doit être sur le parent direct. */}
      <div
        ref={cardRef}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        className="animate-pop-in motion-reduce:animate-fade-in-fast relative w-full max-w-sm"
        style={{ perspective: 1200 }}
      >
        <div
          className="relative overflow-hidden rounded-2xl border border-border bg-surface p-8 text-center shadow-[0_40px_80px_-24px_rgba(0,0,0,0.7)] will-change-transform motion-reduce:!transform-none"
          style={{
            "--m-rgb": meta.rgb,
            transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
            transition: "transform 0.4s cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-70 motion-reduce:hidden"
            style={{
              background: `radial-gradient(340px circle at ${tilt.px}% ${tilt.py}%, rgb(${meta.rgb} / 0.16), transparent 60%)`,
            }}
          />

          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-6 -top-8 select-none font-display text-[11rem] font-black leading-none opacity-[0.06]"
            style={{ color: `rgb(${meta.rgb})` }}
          >
            {meta.kanji}
          </span>

          <button
            onClick={onClose}
            title="Fermer"
            className="absolute right-4 top-4 text-muted transition-colors hover:text-text"
          >
            <X size={18} />
          </button>

          <div className="relative flex flex-col items-center gap-3">
            <Avatar
              src={avatar}
              name={member.username}
              className="h-24 w-24 rounded-full ring-4"
              style={{ boxShadow: `0 0 0 4px rgb(${meta.rgb} / 0.35), 0 0 40px -6px rgb(${meta.rgb} / 0.5)` }}
              textClassName="text-3xl"
            />

            <div>
              <p className="font-display text-xl font-bold text-text">{member.username}</p>
              {member.handle && <p className="text-xs text-muted">@{member.handle}</p>}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color: `rgb(${meta.rgb})` }}>
                {meta.title}
              </span>
              <RoleBadge role={member.role} size="sm" />
            </div>

            <p className="mt-1 text-sm leading-relaxed text-muted">{meta.blurb}</p>

            <Link
              to={member.handle ? `/u/${member.handle}` : "#"}
              onClick={onClose}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold transition-opacity hover:opacity-75"
              style={{ color: `rgb(${meta.rgb})` }}
            >
              Voir le profil <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function EquipePage() {
  const [roster, setRoster] = useState(null);
  const [error, setError] = useState(null);
  const [opened, setOpened] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getTeamRoster()
      .then((data) => !cancelled && setRoster(data))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Ordre éditorial, pas l'ordre par rôle de la RPC.
  const sorted = roster
    ? [...roster].sort((a, b) => {
        const ma = metaFor(a).order;
        const mb = metaFor(b).order;
        return ma !== mb ? ma - mb : a.username.localeCompare(b.username);
      })
    : null;

  return (
    <div className="animate-fade-in mx-auto max-w-4xl px-8 py-10">
      <div className="mb-8 flex items-center gap-3">
        <Users size={26} className="text-primary" />
        <div>
          <h1 className="font-display text-3xl font-extrabold text-glow">Équipe</h1>
          <p className="mt-1 text-sm text-muted">Les personnes qui font tourner Nartya.</p>
        </div>
      </div>

      {error && (
        <p className="py-16 text-center text-sm text-muted">
          Impossible de charger l'équipe pour le moment. Réessaie plus tard.
        </p>
      )}

      {!error && sorted === null && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-surface/40 p-6">
              <div className="h-20 w-20 skeleton rounded-full" />
              <div className="h-3 w-16 skeleton rounded" />
            </div>
          ))}
        </div>
      )}

      {!error && sorted !== null && sorted.length === 0 && (
        <p className="py-16 text-center text-sm text-muted">Aucun membre à afficher.</p>
      )}

      {!error && sorted !== null && sorted.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {sorted.map((member) => (
            <TeamCard key={member.id} member={member} meta={metaFor(member)} onOpen={setOpened} />
          ))}
        </div>
      )}

      {opened && <TeamMemberReveal member={opened} meta={metaFor(opened)} onClose={() => setOpened(null)} />}
    </div>
  );
}
