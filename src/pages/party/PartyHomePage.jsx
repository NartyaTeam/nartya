import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Users, Plus, LogIn, Loader2, Globe, Lock, Link2, Play, MessageCircle, X } from "lucide-react";
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
  const [sheetOpen, setSheetOpen] = useState(false);

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
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:px-6 sm:py-14">
      <header className="mb-6 sm:mb-10 sm:text-center">
        <span className="mx-auto mb-4 hidden h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary sm:flex">
          <Users size={26} />
        </span>
        <div className="mb-2 flex items-center gap-2 sm:hidden">
          <span className="h-px w-6 bg-primary" />
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-primary/80">Entre potes</p>
        </div>
        <div className="flex items-end justify-between gap-3">
          <h1 className="t-impact text-4xl sm:mx-auto sm:text-6xl">Watch Party</h1>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-bold text-primary-fg active:scale-95 sm:hidden"
          >
            <Plus size={17} /> Créer
          </button>
        </div>
        <p className="mt-1.5 max-w-md text-sm text-muted sm:mx-auto sm:mt-3 sm:text-base">
          Regardez vos animes en même temps que vos potes, parfaitement synchronisés.
        </p>
      </header>

      <form onSubmit={goJoin} className="flex gap-2 sm:hidden">
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md bg-surface px-3.5 ring-2 ring-border focus-within:ring-primary/70">
          <Link2 size={16} className="shrink-0 text-muted" />
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(normalizePartyCode(e.target.value))}
            placeholder="Code d'un ami"
            aria-label="Code du salon"
            className="min-w-0 flex-1 bg-transparent text-sm font-bold uppercase tracking-[0.2em] outline-none placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-muted"
          />
        </div>
        <button
          type="submit"
          disabled={joinCode.length < 6}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-md bg-surface px-3.5 text-sm font-bold text-text ring-2 ring-border disabled:opacity-50"
        >
          <LogIn size={16} /> Rejoindre
        </button>
      </form>

      <div className="hidden grid-cols-1 gap-3 sm:grid sm:gap-5 md:grid-cols-5">
        <section className="relative flex min-w-0 flex-col overflow-hidden rounded-xl border-2 border-border bg-surface p-4 sm:p-6 md:col-span-3">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/20 blur-3xl sm:hidden" />
          <h2 className="relative font-display text-lg font-bold text-white sm:text-xl">Créer un salon</h2>
          <p className="mt-1 hidden text-sm text-muted sm:block">Tu choisiras l'épisode une fois dans le salon.</p>

          <div className="relative mt-3 grid grid-cols-2 gap-2.5 sm:mt-5 sm:gap-3">
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

          <button onClick={goCreate} disabled={busy} className="btn-shu relative mt-4 w-full justify-center disabled:opacity-60 sm:mt-6">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            Créer le salon
          </button>
          {error && <p className="mt-3 text-sm text-primary">{error}</p>}
        </section>

        <form
          onSubmit={goJoin}
          className="flex min-w-0 flex-col rounded-xl border-2 border-border bg-surface p-4 sm:p-6 md:col-span-2"
        >
          <h2 className="font-display text-lg font-bold text-white sm:text-xl">Rejoindre</h2>
          <p className="mt-1 hidden text-sm text-muted sm:block">Colle le code reçu d'un ami.</p>
          <div className="mt-3 flex gap-2 sm:mt-0 sm:contents">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(normalizePartyCode(e.target.value))}
            placeholder="ABC123"
            aria-label="Code du salon"
            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-2.5 text-center text-lg sm:mt-5 sm:w-full sm:flex-none sm:px-4 sm:py-3 sm:text-xl font-bold uppercase tracking-[0.35em] text-text placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-muted focus:border-primary/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={joinCode.length < 6}
            aria-label="Rejoindre le salon"
            className="btn-ghost shrink-0 justify-center disabled:opacity-50 max-sm:!px-4 sm:mt-4 sm:w-full md:mt-auto"
          >
            <LogIn size={18} />
            <span className="hidden sm:inline">Rejoindre</span>
          </button>
          </div>
        </form>
      </div>

      <ol className="mt-5 hidden gap-3 sm:grid sm:grid-cols-3">
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

      <section className="mt-7 sm:mt-12">
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
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="mt-2 flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-bold text-primary-fg active:scale-95 sm:hidden"
            >
              <Plus size={16} /> Créer mon salon
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {publicRooms.map((room) => (
              <PublicRoomCard key={room.code} room={room} onJoin={() => navigate(`/party/${room.code}`)} />
            ))}
          </div>
        )}
      </section>

      {sheetOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-end bg-black/60 backdrop-blur-sm sm:hidden" onClick={() => !busy && setSheetOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full animate-fade-in rounded-t-xl border-t-2 border-border bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
          >
            <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-white/15" />
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">Créer un salon</h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Fermer"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted active:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-0.5 text-sm text-muted">Tu choisiras l'épisode une fois dans le salon.</p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <VisibilityOption active={!isPublic} onClick={() => setIsPublic(false)} Icon={Lock} title="Privé" text="Uniquement avec le code" />
              <VisibilityOption active={isPublic} onClick={() => setIsPublic(true)} Icon={Globe} title="Public" text="Visible par tous les membres" />
            </div>
            <button onClick={goCreate} disabled={busy} className="btn-shu mt-4 w-full justify-center disabled:opacity-60">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              Créer le salon
            </button>
            {error && <p className="mt-3 text-sm text-primary">{error}</p>}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function VisibilityOption({ active, onClick, Icon, title, text }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-w-0 flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-colors ${
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
