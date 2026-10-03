import { Ban, Check, CloudLightning, CloudRain, Crown, Leaf, Lock, Snowflake, Star } from "lucide-react";
import { EMBLEMS } from "@/api/profile";

const ACCENT_SWATCHES = ["#FF4A2D", "#F4648C", "#A855F7", "#3B82F6", "#14B8A6", "#EAB308", "#F97316", "#E5E7EB"];
export const AMBIENCES = [
  { id: "storm", label: "Orage", desc: "Éclairs lointains et ciel électrique", color: "#8aa6ff", icon: CloudLightning },
  { id: "rain", label: "Pluie", desc: "Averses fines sur le profil", color: "#59aee8", icon: CloudRain },
  { id: "snow", label: "Neige", desc: "Flocons doux et lumière froide", color: "#d9efff", icon: Snowflake },
  { id: "autumn", label: "Automne", desc: "Feuilles cuivrées portées par le vent", color: "#e8823d", icon: Leaf },
];

function Toggle({ checked, onChange, label, hint }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-md border border-border bg-bg/40 px-3.5 py-3 text-left transition-colors hover:border-white/20"
    >
      <span>
        <span className="block text-sm font-medium text-text">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      <span
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-surface-2"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function SubscriberBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-[4px] border border-[#d6aa68]/35 bg-[#d6aa68]/10 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-kana text-[#d6aa68]">
      <Crown size={9} /> Abonnés
    </span>
  );
}

export function AccentPicker({ accent, onChange }) {
  return (
    <div>
      <label className="text-[0.7rem] font-semibold uppercase tracking-kana text-muted">
        Couleur d'accent
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2.5">
        {ACCENT_SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onClick={() => onChange(color)}
            className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-surface transition-transform hover:scale-110 ${
              accent.toLowerCase() === color.toLowerCase() ? "ring-white" : "ring-transparent"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
        <label
          title="Choisir une couleur"
          className="relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/35 bg-[conic-gradient(#ff4a2d,#f7d154,#4bc48c,#4d91ff,#b568f5,#ff4a2d)] ring-2 ring-transparent ring-offset-2 ring-offset-surface transition-transform hover:scale-110"
        >
          <input
            type="color"
            value={accent}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span className="text-xs font-bold text-white drop-shadow">+</span>
        </label>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Elle teinte les liserés, boutons et halos de ton profil, quel que soit l'ornement choisi.
      </p>
    </div>
  );
}

export function AmbiencePicker({ isPremium, ambient, onChange }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-[0.7rem] font-semibold uppercase tracking-kana text-muted">Ambiance de page</label>
        <SubscriberBadge />
      </div>
      <p className="mt-1 text-xs text-muted">Elle transforme tout le fond de ton profil ; elle ne dépend pas de ton cadre ou de ta bannière.</p>
      {isPremium ? (
        <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-pressed={!ambient}
            className={`relative flex flex-col items-center gap-2 rounded-lg border p-3.5 text-center transition-colors ${
              !ambient ? "border-white/60 bg-white/5" : "border-border bg-bg/30 hover:border-white/25"
            }`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-muted">
              <Ban size={16} />
            </span>
            <span className="text-sm font-semibold text-text">Aucune</span>
            <span className="text-[0.68rem] leading-snug text-muted">Le profil garde son fond sobre.</span>
            {!ambient && (
              <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-white text-black">
                <Check size={10} strokeWidth={3} />
              </span>
            )}
          </button>
          {AMBIENCES.map((item) => {
            const Icon = item.icon;
            const on = ambient === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                aria-pressed={on}
                className={`relative flex flex-col items-center gap-2 rounded-lg border p-3.5 text-center transition-colors ${
                  on ? "border-white/60 bg-white/5" : "border-border bg-bg/30 hover:border-white/25"
                }`}
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${item.color}22`, color: item.color }}
                >
                  <Icon size={17} />
                </span>
                <span className="text-sm font-semibold text-text">{item.label}</span>
                <span className="text-[0.68rem] leading-snug text-muted">{item.desc}</span>
                {on && (
                  <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-white text-black">
                    <Check size={10} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-bg/40 px-4 py-3 text-xs font-medium text-muted"><Lock size={13} /> Débloque les ambiances avec un abonnement</div>
      )}
    </div>
  );
}

export function EmblemPicker({ isPremium, emblem, onChange }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-[0.7rem] font-semibold uppercase tracking-kana text-muted">
          Emblème kanji
        </label>
        <SubscriberBadge />
      </div>
      {isPremium ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => onChange(null)}
            title="Aucun emblème"
            className={`flex h-10 w-10 items-center justify-center rounded-lg border text-xs font-medium transition-colors ${
              !emblem ? "border-white/70 text-text" : "border-border text-muted hover:border-white/25"
            }`}
          >
            Aucun
          </button>
          {EMBLEMS.map((k) => {
            const on = emblem === k;
            return (
              <button
                key={k}
                onClick={() => onChange(k)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border font-display text-lg font-bold leading-none transition-colors ${
                  on ? "border-white/70 text-primary" : "border-border text-text/80 hover:border-white/25"
                }`}
              >
                {k}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-bg/40 px-4 py-3 text-xs font-medium text-muted">
          <Lock size={13} /> Débloque un emblème kanji avec un abonnement
        </div>
      )}
    </div>
  );
}

export function PinnedFavoritesPicker({ favorites, pinned, maxPinsLabel, onToggle }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-[0.7rem] font-semibold uppercase tracking-kana text-muted">
          Favoris à la une
        </label>
        <span className="text-[0.7rem] tabular-nums text-muted/60">
          {pinned.size}/{maxPinsLabel}
        </span>
      </div>
      {favorites === null ? (
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] skeleton rounded" />
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <p className="mt-2 text-xs text-muted">
          Ajoute des animes à tes favoris pour pouvoir les mettre en avant.
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {favorites.map((f) => {
            const on = pinned.has(f.anime_slug);
            return (
              <button
                key={f.anime_slug}
                onClick={() => onToggle(f.anime_slug)}
                title={f.anime_title || f.anime_slug}
                className={`group relative aspect-[2/3] overflow-hidden rounded ring-2 transition ${
                  on ? "ring-primary" : "ring-transparent hover:ring-white/30"
                }`}
              >
                {f.anime_cover ? (
                  <img src={f.anime_cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-surface-2" />
                )}
                <div
                  className={`absolute inset-0 flex items-center justify-center transition-colors ${
                    on ? "bg-primary/25" : "bg-black/0 group-hover:bg-black/40"
                  }`}
                >
                  {on && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-fg">
                      <Star size={13} fill="currentColor" />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PrivacySettings({
  isPublic,
  setIsPublic,
  activityPublic,
  setActivityPublic,
  favoritesPublic,
  setFavoritesPublic,
  friendsPublic,
  setFriendsPublic,
  presencePublic,
  setPresencePublic,
}) {
  return (
    <div>
      <label className="text-[0.7rem] font-semibold uppercase tracking-kana text-muted">
        Confidentialité
      </label>
      <div className="mt-2 space-y-2">
        <Toggle
          checked={isPublic}
          onChange={setIsPublic}
          label="Profil public"
          hint="Les autres membres peuvent visiter ton profil via ton lien."
        />
        <Toggle
          checked={activityPublic}
          onChange={setActivityPublic}
          label="Activité visible"
          hint="Affiche ce que tu regardes et ajoutes en favori."
        />
        <Toggle
          checked={favoritesPublic}
          onChange={setFavoritesPublic}
          label="Favoris à la une visibles"
          hint="Affiche tes favoris mis en avant sur ton profil public."
        />
        <Toggle
          checked={friendsPublic}
          onChange={setFriendsPublic}
          label="Liste d'amis visible"
          hint="Affiche tes amis sur ton profil public."
        />
        <Toggle
          checked={presencePublic}
          onChange={setPresencePublic}
          label="Présence visible"
          hint="Affiche ta dernière activité (« en ligne », « actif il y a… »)."
        />
      </div>
    </div>
  );
}
