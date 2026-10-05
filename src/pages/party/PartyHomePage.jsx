import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, LogIn, Loader2, Play, Sparkles, MonitorUp, X } from "lucide-react";
import { useParty } from "@/contexts/WatchPartyProvider";
import { getHomeSections, getAnimePage } from "@/api/animeApi";
import { getContinueWatching, hideAnimeFromResume } from "@/api/progress";
import { enrichHistoryItems, applyCachedEnrichment, advanceCompletedItems } from "@/utils/watchHistory";
import { normalizePartyCode } from "@/utils/partyCode";
import { platform } from "@/platform";

const canOpenWindow = platform.canOpenNewWindow;

/** « 12:34 », ou null si inconnu. */
function remainingLabel(item) {
  if (!item.duration || item.duration <= 0) return null;
  const left = Math.max(0, item.duration - item.positionSeconds);
  if (left < 30) return null;
  const m = Math.floor(left / 60);
  const s = Math.floor(left % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PartyHomePage() {
  const navigate = useNavigate();
  const party = useParty();
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [resume, setResume] = useState([]);
  const [recos, setRecos] = useState([]);

  useEffect(() => {
    getContinueWatching(12).then((base) => {
      setResume(advanceCompletedItems(applyCachedEnrichment(base)));
      enrichHistoryItems(base)
        .then((enriched) => setResume(advanceCompletedItems(enriched)))
        .catch(() => {});
    }).catch(() => {});

    getHomeSections()
      .then((d) => setRecos((d?.rows?.[0]?.items || []).slice(0, 12)))
      .catch(() => {});
  }, []);

  const goCreate = async (seed = null) => {
    setError(null);
    setBusy(true);
    const res = await party.createRoom({ seed });
    setBusy(false);
    if (res.success) navigate(`/party/${res.code}`);
    else setError(res.error || "Impossible de créer le salon.");
  };

  const goJoin = (e) => {
    e.preventDefault();
    const c = normalizePartyCode(joinCode);
    if (c.length === 6) navigate(`/party/${c}`);
  };

  // Masqué en base, sans effacer l'historique.
  const removeResume = async (item) => {
    setResume((prev) => prev.filter((i) => i.slug !== item.slug));
    await hideAnimeFromResume(item.slug);
  };

  const resumeSeed = (item) => ({
    id: `${item.slug}:${item.seasonId}:${item.episodeNumber}:${item.language}`,
    slug: item.slug,
    season: item.seasonId,
    ep: item.episodeNumber,
    lang: item.language,
    title: item.title,
    cover: item.cover,
    seasonName: item.seasonName || "",
    epTitle: `Épisode ${item.episodeNumber}`,
    epThumb: item.episodeImage || null,
  });

  // Première saison, épisode 1.
  const startReco = async (card) => {
    setBusy(true);
    setError(null);
    try {
      const page = await getAnimePage(card.slug);
      const season = page?.seasons?.[0];
      if (!season) throw new Error("Pas de saison disponible.");
      await goCreate({
        id: `${card.slug}:${season.id}:1:vostfr`,
        slug: card.slug,
        season: season.id,
        ep: 1,
        lang: "vostfr",
        title: page?.anime?.title?.trim() || card.title,
        cover: page?.images?.poster || card.cover || "",
        seasonName: season.name || "",
        epTitle: "Épisode 1",
      });
    } catch (err) {
      setBusy(false);
      setError(err.message || "Impossible de démarrer cet anime.");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex items-center gap-3">
        <Users className="text-primary" size={28} />
        <div>
          <h1 className="t-impact text-4xl sm:text-5xl">Watch Party</h1>
          <p className="text-sm text-muted">Regardez vos animes en même temps que vos potes.</p>
        </div>
      </div>

      <div className="mb-12 grid gap-4 md:grid-cols-2">
        <div className="flex flex-col items-start gap-3 rounded-md border-2 border-border bg-surface p-6">
          <div className="flex items-center gap-2 text-white">
            <Plus size={18} className="text-primary" />
            <span className="font-display text-lg font-bold">Créer un salon</span>
          </div>
          <p className="text-sm text-muted">
            Lance un salon vide et choisis quoi regarder une fois dedans, ou pars d'une suggestion ci-dessous.
          </p>
          <button onClick={() => goCreate(null)} disabled={busy} className="btn-shu mt-1 disabled:opacity-60">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            Créer un salon
          </button>
        </div>

        <form
          onSubmit={goJoin}
          className="flex flex-col items-start gap-3 rounded-md border-2 border-border bg-surface p-6"
        >
          <div className="flex items-center gap-2 text-white">
            <LogIn size={18} className="text-primary" />
            <span className="font-display text-lg font-bold">Rejoindre</span>
          </div>
          <p className="text-sm text-muted">Saisis le code que ton pote t'a partagé.</p>
          <div className="flex w-full gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(normalizePartyCode(e.target.value))}
              placeholder="ABC123"
              className="min-w-0 flex-1 rounded-md border border-border bg-bg px-4 py-2.5 text-center text-lg font-bold uppercase tracking-[0.3em] text-text placeholder:tracking-normal placeholder:text-base placeholder:font-normal placeholder:text-muted focus:border-primary/60 focus:outline-none"
            />
            <button type="submit" disabled={joinCode.length < 6} className="btn-ghost shrink-0 disabled:opacity-50">
              Rejoindre
            </button>
          </div>
        </form>
      </div>

      {error && <p className="mb-6 text-sm text-primary">{error}</p>}

      {resume.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="section-title !text-xl">Reprendre à plusieurs</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {resume.map((item) => (
              <ResumeCard
                key={item.episodeKey}
                item={item}
                onClick={() => goCreate(resumeSeed(item))}
                onRemove={removeResume}
                busy={busy}
              />
            ))}
          </div>
        </section>
      )}

      {recos.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            <h2 className="section-title !text-xl">À regarder ensemble</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {recos.map((card) => (
              <PosterCard
                key={card.slug}
                cover={card.cover}
                title={card.title}
                subtitle={card.genres?.slice(0, 2).join(" · ")}
                onClick={() => startReco(card)}
              />
            ))}
          </div>
        </section>
      )}

      {canOpenWindow && (
        <button
          type="button"
          onClick={() => platform.openNewWindow()}
          className="mt-4 flex items-center gap-2 text-xs text-muted transition-colors hover:text-text"
        >
          <MonitorUp size={14} /> Ouvrir une 2ᵉ fenêtre (test à deux sur cette machine)
        </button>
      )}
    </div>
  );
}

function ResumeCard({ item, onClick, onRemove, busy }) {
  const img = item.episodeImage || item.cover;
  const remaining = remainingLabel(item);

  return (
    <div className="group relative">
      <button
        onClick={() => onRemove(item)}
        title="Retirer de Reprendre"
        aria-label="Retirer de Reprendre"
        className="absolute right-2 top-2 z-10 text-white opacity-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] transition-all hover:scale-110 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X size={20} strokeWidth={2.5} />
      </button>

      <button onClick={onClick} disabled={busy} className="block w-full text-left disabled:pointer-events-none">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-surface-2 [transform:translateZ(0)]">
          {img ? (
            <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full skeleton" />
          )}

          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/45 group-hover:opacity-100">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-fg">
              <Play size={20} className="ml-0.5 fill-current" />
            </span>
          </div>

          {remaining && (
            <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums backdrop-blur-sm">
              {remaining}
            </span>
          )}

          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <span
              className="block h-full bg-primary"
              style={{ width: `${Math.max(3, item.progressPercent)}%` }}
            />
          </div>
        </div>

        <h3 className="mt-2 line-clamp-1 text-sm font-semibold text-text transition-colors group-hover:text-primary">
          {item.title || item.slug}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">
          {item.seasonName ? `${item.seasonName} · ` : ""}Épisode {item.episodeNumber} ·{" "}
          {item.language?.toUpperCase()}
        </p>
      </button>
    </div>
  );
}

function PosterCard({ cover, title, subtitle, onClick }) {
  return (
    <button onClick={onClick} className="group block w-full text-left">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-surface-2">
        {cover ? (
          <img src={cover} alt={title} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full skeleton" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/45 group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-fg">
            <Play size={18} className="ml-0.5 fill-current" />
          </span>
        </div>
      </div>
      <h3 className="mt-2 line-clamp-1 text-sm font-semibold text-text transition-colors group-hover:text-primary">
        {title}
      </h3>
      {subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{subtitle}</p>}
    </button>
  );
}
