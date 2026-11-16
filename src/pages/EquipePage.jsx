import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import RoleBadge from "@/components/profile/RoleBadge";
import { getTeamRoster, resolveAvatar } from "@/api/profile";
import { openDiscord } from "@/lib/community";

/** Par handle. Un membre absent a un traitement « staff » générique. */
const TEAM_META = {
  zeleff_: {
    order: 0,
    group: "dev",
    title: "Développeur principal",
    kanji: "朱",
    rgb: "255 113 62",
  },
  "007": {
    order: 1,
    group: "dev",
    title: "Développeur secondaire",
    kanji: "刀",
    rgb: "245 158 11",
  },
  "001": {
    order: 2,
    group: "community",
    title: "Chef de projet & communauté",
    kanji: "光",
    rgb: "56 189 248",
  },
  end: {
    order: 3,
    group: "community",
    title: "Responsable de la modération",
    kanji: "影",
    rgb: "168 85 247",
  },
};

const STAFF_FALLBACK = {
  order: 99,
  group: "community",
  title: "Membre du staff",
  kanji: "星",
  rgb: "52 211 153",
};

const GROUPS = [
  { key: "dev", title: "Développement", text: "Ceux qui écrivent, cassent et réparent l'application." },
  { key: "community", title: "Communauté & modération", text: "Ceux qui font vivre le Discord et veillent sur les échanges." },
];

function metaFor(member) {
  return TEAM_META[member.handle] || STAFF_FALLBACK;
}

function MemberCard({ member, meta }) {
  const avatar = resolveAvatar(member);
  const body = (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-6 -right-2 select-none font-display text-[9rem] font-black leading-none opacity-[0.05] transition-opacity duration-300 group-hover:opacity-[0.1]"
        style={{ color: `rgb(${meta.rgb})` }}
      >
        {meta.kanji}
      </span>
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: `rgb(${meta.rgb})` }}
      />

      <Avatar
        src={avatar}
        name={member.username}
        className="h-20 w-20 shrink-0 rounded-full sm:h-24 sm:w-24"
        textClassName="text-3xl"
        style={{ boxShadow: `0 0 0 3px rgb(${meta.rgb} / 0.45), 0 0 32px -8px rgb(${meta.rgb} / 0.55)` }}
      />

      <div className="relative min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="font-display text-xl font-bold text-text">{member.username}</p>
          <RoleBadge role={member.role} size="sm" />
        </div>
        {member.handle && <p className="text-xs text-muted">@{member.handle}</p>}
        <p className="mt-2 text-sm font-bold" style={{ color: `rgb(${meta.rgb})` }}>
          {meta.title}
        </p>
      </div>
    </>
  );

  const cls =
    "group relative flex items-start gap-5 overflow-hidden rounded-md border-2 border-border bg-surface/40 p-5 pl-6 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-[color:rgb(var(--m-rgb)/0.5)] hover:shadow-[0_20px_40px_-26px_rgb(var(--m-rgb)/0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--m-rgb))] sm:p-6 sm:pl-7";
  const style = { "--m-rgb": meta.rgb };

  return member.handle ? (
    <Link to={`/u/${member.handle}`} className={cls} style={style}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex items-start gap-5 rounded-md border-2 border-border bg-surface/40 p-6">
      <div className="h-24 w-24 shrink-0 skeleton rounded-full" />
      <div className="flex-1 space-y-2.5 pt-1">
        <div className="h-5 w-32 skeleton rounded" />
        <div className="h-3 w-24 skeleton rounded" />
        <div className="h-3 w-full skeleton rounded" />
        <div className="h-3 w-3/4 skeleton rounded" />
      </div>
    </div>
  );
}

export default function EquipePage() {
  const [roster, setRoster] = useState(null);
  const [error, setError] = useState(null);

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
    <div className="animate-fade-in mx-auto max-w-5xl px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-8 md:py-12">
      <header className="mb-12 max-w-2xl">
        <p className="mb-3 flex items-center gap-2.5 text-[0.7rem] font-bold uppercase tracking-[0.25em] text-muted">
          <span className="h-3.5 w-[6px] -skew-x-[14deg] bg-primary" />
          Nartya
        </p>
        <h1 className="t-impact text-5xl sm:text-7xl">L'équipe</h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Une petite équipe, beaucoup de passion. Voici les personnes qui font tourner Nartya au quotidien.
        </p>
      </header>

      {error && (
        <p className="py-16 text-center text-sm text-muted">
          Impossible de charger l'équipe pour le moment. Réessaie plus tard.
        </p>
      )}

      {!error && sorted === null && (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {!error && sorted !== null && sorted.length === 0 && (
        <p className="py-16 text-center text-sm text-muted">Aucun membre à afficher.</p>
      )}

      {!error &&
        sorted !== null &&
        GROUPS.map((group) => {
          const members = sorted.filter((m) => metaFor(m).group === group.key);
          if (!members.length) return null;
          return (
            <section key={group.key} className="mb-12">
              <h2 className="section-title">{group.title}</h2>
              <p className="mb-5 mt-2 text-sm text-muted">{group.text}</p>
              <div className="grid gap-4 md:grid-cols-2">
                {members.map((member) => (
                  <MemberCard key={member.id} member={member} meta={metaFor(member)} />
                ))}
              </div>
            </section>
          );
        })}

      {!error && sorted !== null && (
        <section className="flex flex-col items-start gap-4 rounded-md border-2 border-dashed border-border p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-text">Une question, un bug, une idée ?</h2>
            <p className="mt-1 text-sm text-muted">Toute l'équipe répond sur le Discord de Nartya.</p>
          </div>
          <button type="button" onClick={openDiscord} className="btn-shu shrink-0">
            <MessageCircle size={18} /> Rejoindre le Discord
          </button>
        </section>
      )}
    </div>
  );
}
