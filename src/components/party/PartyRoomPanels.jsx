import { AlertTriangle, Crown, Languages, Loader2, Users, X } from "lucide-react";
import { Flag, getLanguageLabel } from "@/components/ui/Flag";
import { Avatar } from "@/components/ui/Avatar";
import SupporterBadge from "@/components/profile/SupporterBadge";

/** Salon introuvable ou complet. */
export function PartyRoomNotice({ kind, code, onBack }) {
  const full = kind === "full";
  const unavailable = kind === "unavailable";
  const Icon = full ? Users : AlertTriangle;
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-bg px-8 text-center text-text">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/30">
        <Icon size={30} />
      </span>
      <div>
        <p className="eyebrow">
          {unavailable ? "Indisponible" : full ? "Salon complet" : "Salon introuvable"}
        </p>
        <h1 className="t-impact mt-2 text-4xl">
          {unavailable ? "Watch party indisponible" : full ? "Ce salon est plein" : "Personne dans ce salon"}
        </h1>
      </div>
      <p className="max-w-md text-sm leading-relaxed text-muted">
        {unavailable ? (
          <>La watch party est disponible dans l'application de bureau Nartya.</>
        ) : full ? (
          <>
            Ce salon a atteint le nombre maximum de participants autorisé par l'offre de son hôte.
            Demande à l'hôte de passer à une offre supérieure (Nartya + : 10 · Ultimate : illimité),
            ou réessaie plus tard.
          </>
        ) : (
          <>
            Le code <span className="font-bold tracking-widest text-primary">{code}</span> ne
            correspond à aucune séance en cours. Vérifie qu'il est bien recopié, ou demande à
            l'hôte de te renvoyer son lien d'invitation.
          </>
        )}
      </p>
      <button onClick={onBack} className="btn-shu">
        Retour
      </button>
    </div>
  );
}

export function TabButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
        active ? "border-primary text-white" : "border-transparent text-muted hover:text-white"
      }`}
    >
      <Icon size={15} /> {children}
    </button>
  );
}

export function LangBadge({ lang }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-white/10 px-1.5 py-0.5">
      <Flag lang={lang} size={11} />
      <span className="text-[10px] font-bold text-white/70">{getLanguageLabel(lang)}</span>
    </span>
  );
}

export function WaitingBanner({ names, onSkip }) {
  const label = names.length === 1
    ? names[0]
    : `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm">
      <div className="flex items-center gap-2 text-white/80">
        <Loader2 size={14} className="shrink-0 animate-spin text-primary" />
        <span>
          En attente de <span className="font-semibold text-white">{label}</span> qui charge la vidéo…
        </span>
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-white/60 transition-colors hover:bg-white/20 hover:text-white"
      >
        Lancer quand même
      </button>
    </div>
  );
}

export function LangChangingBanner({ info }) {
  return (
    <div className="flex items-center gap-2 border-b border-accent/20 bg-accent/10 px-4 py-2 text-sm text-white/80">
      <Languages size={14} className="shrink-0 text-accent" />
      <span>
        <span className="font-semibold text-white">{info.username}</span> change vers{" "}
        <span className="font-semibold text-white">{langLabel(info.toLang)}</span>, patienter…
      </span>
    </div>
  );
}

function langLabel(l) {
  return { vostfr: "VOSTFR", vf: "VF", vo: "VO" }[l] || (l || "").toUpperCase();
}

export function OptionsPanel({ options, setOptions }) {
  return (
    <div className="border-b border-border bg-bg/60 px-4 py-3 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted">Options du salon</p>

      <OptionToggle
        label="Salon public"
        description="Visible sur la page Watch Party : n'importe quel membre peut le rejoindre sans code"
        checked={!!options.isPublic}
        onChange={(v) => setOptions({ isPublic: v })}
      />
      <OptionToggle
        label="Attendre le chargement de l'épisode"
        description="Pause automatique jusqu'à ce que tout le monde ait sa source vidéo"
        checked={options.waitOnSourceLoad}
        onChange={(v) => setOptions({ waitOnSourceLoad: v })}
      />
      <OptionToggle
        label="Attendre les nouveaux arrivants"
        description="Pause si quelqu'un rejoint en cours de séance"
        checked={options.waitOnJoin}
        disabled={!options.waitOnSourceLoad}
        onChange={(v) => setOptions({ waitOnJoin: v })}
      />
      <OptionToggle
        label="Attendre en cas de coupure"
        description="Pause si la vidéo de quelqu'un se met à charger en cours d'épisode"
        checked={options.waitOnBuffer}
        onChange={(v) => setOptions({ waitOnBuffer: v })}
      />

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white/70">Retard de synchro accepté</span>
          <span className="text-xs font-bold tabular-nums text-primary">
            {options.driftTolerance.toFixed(1)} s
          </span>
        </div>
        <input
          type="range"
          min="0.5"
          max="5"
          step="0.5"
          value={options.driftTolerance}
          onChange={(e) => setOptions({ driftTolerance: Number(e.target.value) })}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-[10px] text-white/30">
          <span>0.5 s (strict)</span>
          <span>5 s (tolérant)</span>
        </div>
      </div>
    </div>
  );
}

function OptionToggle({ label, description, checked, disabled, onChange }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 ${disabled ? "opacity-40" : ""}`}>
      <div className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          className={`h-5 w-9 rounded-full transition-colors ${checked ? "bg-primary" : "bg-white/20"}`}
        />
        <div
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </div>
      <div>
        <p className="text-xs font-semibold text-white/80">{label}</p>
        {description && <p className="mt-0.5 text-[10px] text-white/40">{description}</p>}
      </div>
    </label>
  );
}

/** « À suivre » : cartes horizontales sous le lecteur. */
export function QueueStrip({ queue, isHost, party }) {
  if (!queue.length) return null;
  return (
    <ul className="no-scrollbar flex gap-3 overflow-x-auto overscroll-contain pb-1">
      {queue.map((item, i) => {
        const thumb = item.epThumb || item.cover;
        return (
          <li key={item.id || i} className="group w-52 shrink-0">
            <div className="relative aspect-video overflow-hidden rounded-md bg-surface-2 ring-2 ring-border">
              {thumb && <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />}
              <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
                {item.ep ?? i + 1}
              </span>
              {isHost && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => party.setCurrent(item)}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-fg"
                  >
                    Lire
                  </button>
                  <button
                    type="button"
                    onClick={() => party.dequeue(item.id)}
                    title="Retirer"
                    className="flex h-8 w-8 items-center justify-center rounded-md bg-white/15 text-white hover:bg-white/25"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
            <p className="mt-1.5 truncate text-sm font-semibold text-white">
              {item.epTitle || `Épisode ${item.ep}`}
            </p>
            <p className="truncate text-xs text-white/45">{item.title}</p>
          </li>
        );
      })}
    </ul>
  );
}

export function PeopleList({ participants }) {
  return (
    <ul className="h-full space-y-1 overflow-y-auto overscroll-contain p-3">
      {participants.map((p) => {
        const status = p.sourceStatus;
        return (
          <li key={p.clientId} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-white/5">
            <Avatar
              src={p.avatar}
              name={p.username}
              className="h-8 w-8 rounded-full"
              textClassName="text-sm"
            />
            <span className="truncate text-sm font-medium text-white">{p.username}</span>
            {p.premium && <SupporterBadge profile={{ premium_tier: p.premium }} />}
            <span className="flex-1" />
            {p.isHost && (
              <span className="flex items-center gap-1 text-xs font-semibold text-accent">
                <Crown size={13} className="fill-accent" /> Hôte
              </span>
            )}
            {status === "loading" && (
              <span title="Chargement…" className="flex items-center gap-1 text-[10px] text-white/40">
                <Loader2 size={11} className="animate-spin" /> Source
              </span>
            )}
            {status === "buffering" && (
              <span title="Mise en mémoire tampon" className="flex items-center gap-1 text-[10px] text-accent/70">
                <Loader2 size={11} className="animate-spin" /> Tampon
              </span>
            )}
            {status === "error" && (
              <span title="Erreur source" className="text-[10px] text-primary/70">
                <AlertTriangle size={11} />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
