import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, LogIn, Loader2, Globe, Lock, Link2, Play, MessageCircle } from "lucide-react";
import { useParty } from "@/contexts/WatchPartyProvider";
import { normalizePartyCode } from "@/utils/partyCode";
import { listPublicPartyRooms } from "@/api/partyRoom";
import { resolveAvatar } from "@/api/profile";
import { partyCapacityForTier, premiumTier } from "@/lib/premium";

const PUBLIC_REFRESH_MS = 20000;

const STEPS = [
  { Icon: Plus, title: "Crée un salon", text: "Privé ou public, en un clic." },
  { Icon: Link2, title: "Partage le code", text: "Six caractères suffisent à tes potes." },
  { Icon: Play, title: "Regardez ensemble", text: "Lecture synchronisée et chat intégré." },
];

export default function PartyHomePage() {
  const navigate = useNavigate();
  const party = useParty();
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [isPublic, setIsPublic] = useState(false);
  const [publicRooms, setPublicRooms] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      listPublicPartyRooms()
        .then((rooms) => alive && setPublicRooms(rooms))
        .catch(() => alive && setPublicRooms((prev) => prev ?? []));
    load();
    const timer = setInterval(load, PUBLIC_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const goCreate = async () => {
    setError(null);
    setBusy(true);
    const res = await party.createRoom({ seed: null, isPublic });
    setBusy(false);
    if (res.success) navigate(`/party/${res.code}`);
    else setError(res.error || "Impossible de créer le salon.");
  };

  const goJoin = (e) => {
    e.preventDefault();
    const c = normalizePartyCode(joinCode);
    if (c.length === 6) navigate(`/party/${c}`);
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <header className="mb-10 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Users size={26} />
        </span>
        <h1 className="t-impact text-4xl sm:text-6xl">Watch Party</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted sm:text-base">
          Regardez vos animes en même temps que vos potes, parfaitement synchronisés.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-5">
        <section className="flex flex-col rounded-xl border-2 border-border bg-surface p-6 md:col-span-3">
          <h2 className="font-display text-xl font-bold text-white">Créer un salon</h2>
          <p className="mt-1 text-sm text-muted">Tu choisiras l'épisode une fois dans le salon.</p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <VisibilityOption
              active={!isPublic}
              onClick={() => setIsPublic(false)}
              Icon={Lock}
              title="Privé"
              text="Uniquement avec le code"
            />
            <VisibilityOption
              active={isPublic}
              onClick={() => setIsPublic(true)}
              Icon={Globe}
              title="Public"
              text="Visible par tous les membres"
            />
          </div>

          <button onClick={goCreate} disabled={busy} className="btn-shu mt-6 w-full justify-center disabled:opacity-60">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            Créer le salon
          </button>
          {error && <p className="mt-3 text-sm text-primary">{error}</p>}
        </section>

        <form
          onSubmit={goJoin}
          className="flex flex-col rounded-xl border-2 border-border bg-surface p-6 md:col-span-2"
        >
          <h2 className="font-display text-xl font-bold text-white">Rejoindre</h2>
          <p className="mt-1 text-sm text-muted">Colle le code reçu d'un ami.</p>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(normalizePartyCode(e.target.value))}
            placeholder="ABC123"
            aria-label="Code du salon"
            className="mt-5 w-full rounded-md border border-border bg-bg px-4 py-3 text-center text-xl font-bold uppercase tracking-[0.35em] text-text placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-muted focus:border-primary/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={joinCode.length < 6}
            className="btn-ghost mt-auto w-full justify-center disabled:opacity-50 max-md:mt-4"
          >
            <LogIn size={18} />
            Rejoindre
          </button>
        </form>
      </div>

      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {STEPS.map(({ Icon, title, text }, i) => (
          <li key={title} className="flex items-start gap-3 rounded-lg px-2 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary">
              <Icon size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-text">
                <span className="mr-1.5 text-muted">{i + 1}.</span>
                {title}
              </p>
              <p className="text-xs text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-12">
        <div className="mb-4 flex items-center gap-2">
          <Globe size={18} className="text-primary" />
          <h2 className="section-title !text-xl">Salons publics</h2>
          {publicRooms?.length > 0 && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold tabular-nums text-muted">
              {publicRooms.length}
            </span>
          )}
        </div>
        {publicRooms === null ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-24 rounded-lg skeleton" />
            ))}
          </div>
        ) : publicRooms.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-5 py-10 text-center">
            <MessageCircle size={22} className="text-muted" />
            <p className="text-sm text-muted">
              Aucun salon public pour le moment. Crée le tien en mode Public pour que d'autres te rejoignent.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {publicRooms.map((room) => (
              <PublicRoomCard key={room.code} room={room} onJoin={() => navigate(`/party/${room.code}`)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function VisibilityOption({ active, onClick, Icon, title, text }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-colors ${
        active ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
      }`}
    >
      <span className={`flex items-center gap-2 text-sm font-bold ${active ? "text-primary" : "text-text"}`}>
        <Icon size={15} />
        {title}
      </span>
      <span className="text-xs text-muted">{text}</span>
    </button>
  );
}

function PublicRoomCard({ room, onJoin }) {
  const { current, host } = room;
  const capacity = partyCapacityForTier(premiumTier(host));
  const full = room.participants >= capacity;
  const avatar = resolveAvatar(host);
  const what = current
    ? [current.seasonName, current.ep ? `Épisode ${current.ep}` : null, current.lang ? String(current.lang).toUpperCase() : null]
        .filter(Boolean)
        .join(" · ")
    : "Choisit quoi regarder";

  return (
    <button
      type="button"
      onClick={onJoin}
      disabled={full}
      title={full ? "Salon complet" : "Rejoindre le salon"}
      className="group flex w-full items-center gap-3 rounded-xl border-2 border-border bg-surface p-3 text-left transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border"
    >
      <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md bg-surface-2">
        {current?.cover ? (
          <img src={current.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/20">
            <Users size={20} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-semibold text-text transition-colors group-hover:text-primary">
          {current?.title || "Salon sans épisode"}
        </p>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{what}</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
          {avatar ? (
            <img src={avatar} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="h-4 w-4 shrink-0 rounded-full bg-white/10" />
          )}
          <span className="line-clamp-1 min-w-0">{host.username || "Membre"}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1 font-semibold tabular-nums text-text/80">
            <Users size={12} />
            {room.participants}/{capacity === Infinity ? "∞" : capacity}
          </span>
        </div>
      </div>
      <span className="shrink-0 rounded-md bg-primary/15 px-2.5 py-1.5 text-xs font-bold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-fg">
        {full ? "Complet" : "Rejoindre"}
      </span>
    </button>
  );
}
