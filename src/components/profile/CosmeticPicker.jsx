import { Check, Crown, Lock } from "lucide-react";
import { ITEMS, SLOTS, SLOT_LABELS, canUseItem, avatarShapeClass } from "@/lib/cosmetics";
import AvatarFrame from "@/components/ambient/AvatarFrame";
import { Avatar } from "@/components/ui/Avatar";

/** `value` : { ornament, banner } tel que stocké (`null`, `"none"` ou un id d'item). */

/** L'overlay réel, au ratio de l'asset (3:1). */
function BannerPreview({ id }) {
  return <img src={ITEMS.banner[id]?.asset} alt="" className="absolute inset-0 h-full w-full object-cover" />;
}

/** L'avatar de l'utilisateur, posé de la parure. La sélection se lit au liseré blanc. */
function OrnamentTile({ id, item, on, locked, avatarUrl, username, onClick }) {
  return (
    <button
      type="button"
      onClick={() => !locked && onClick()}
      title={locked ? "Exclusivité Ultimate" : item?.label || "Aucun"}
      aria-pressed={on}
      aria-disabled={locked}
      className="group flex flex-col items-center gap-2 rounded-lg py-2 text-xs font-medium transition-opacity"
    >
      <span className="relative h-16 w-16 shrink-0">
        <Avatar
          src={avatarUrl}
          name={username}
          className={`h-full w-full ring-2 transition-colors ${
            on ? "ring-white" : "ring-white/15 group-hover:ring-white/35"
          } ${avatarShapeClass(id, "rounded-[10px]")}`}
          textClassName="text-lg"
        />
        {id && <AvatarFrame token={id} />}
        {on && !locked && (
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-black ring-2 ring-surface">
            <Check size={10} strokeWidth={3} />
          </span>
        )}
        {locked && (
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#d6aa68] text-black ring-2 ring-surface">
            <Crown size={9} />
          </span>
        )}
      </span>
      <span className={`truncate ${on ? "text-text" : "text-muted"}`}>{item?.label || "Aucun"}</span>
    </button>
  );
}

/** `wide` (bannières) prend le format large de l'en-tête. */
function Tile({ rgb, on, locked, title, label, sub, wide, onClick, children }) {
  return (
    <button
      type="button"
      onClick={() => !locked && onClick()}
      title={locked ? "Exclusivité Ultimate" : title}
      aria-pressed={on}
      aria-disabled={locked}
      className={`group relative overflow-hidden rounded-lg border text-left transition-colors duration-200 ${
        wide ? "aspect-[460/148] w-full" : "h-[126px]"
      } ${on ? "border-white/60 ring-1 ring-white/20" : "border-border hover:border-white/25"}`}
      style={{ background: `radial-gradient(120% 110% at 50% -20%, rgb(${rgb} / 0.28), rgb(10 8 9) 78%)` }}
    >
      {children}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 pb-1.5 pt-4">
        <span className="block truncate text-xs font-semibold text-white">{label}</span>
        {sub && <span className="block truncate text-[0.62rem] text-white/60">{sub}</span>}
      </span>
      {on && !locked && (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-black">
          <Check size={11} strokeWidth={3} />
        </span>
      )}
      {locked && (
        <>
          <span className="absolute inset-0 bg-black/45" />
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-[4px] border border-[#d6aa68]/40 bg-[#d6aa68]/15 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-kana text-[#d6aa68]">
            <Crown size={9} /> Ultimate
          </span>
        </>
      )}
    </button>
  );
}

export default function CosmeticPicker({ isPremium, tier, value, onChange, avatarUrl, username }) {
  if (!isPremium) {
    return (
      <div className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-bg/40 px-4 py-3 text-xs font-medium text-muted">
        <Lock size={13} /> Débloque les parures de profil avec un abonnement
      </div>
    );
  }

  const setSlot = (slot, id) => onChange({ ...value, [slot]: id });

  return (
    <div className="mt-2 space-y-5">
      {SLOTS.map((slot) => {
        const cur = value[slot] === "none" ? null : value[slot] || null;
        const items = Object.entries(ITEMS[slot]);
        return (
          <div key={slot}>
            <p className="text-[0.68rem] font-semibold uppercase tracking-kana text-muted/80">
              {SLOT_LABELS[slot].title}
            </p>
            <p className="mt-1 text-xs text-muted">{SLOT_LABELS[slot].desc}</p>
            {items.length === 0 ? (
              <p className="mt-2 text-xs text-muted/70">Rien pour l'instant — à venir.</p>
            ) : slot === "banner" ? (
              <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSlot(slot, null)}
                  aria-pressed={!cur}
                  className={`flex aspect-[460/148] w-full flex-col items-center justify-center rounded-lg border text-xs font-medium transition-colors ${
                    !cur ? "border-white/70 text-text" : "border-border text-muted hover:border-white/25"
                  }`}
                >
                  Aucun
                </button>
                {items.map(([id, item]) => (
                  <Tile
                    key={id}
                    rgb={item.rgb}
                    on={cur === id}
                    locked={!canUseItem(tier, slot, id)}
                    label={item.label}
                    wide
                    onClick={() => setSlot(slot, id)}
                  >
                    <BannerPreview id={id} />
                  </Tile>
                ))}
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-4">
                <OrnamentTile
                  id={null}
                  item={null}
                  on={!cur}
                  locked={false}
                  avatarUrl={avatarUrl}
                  username={username}
                  onClick={() => setSlot(slot, null)}
                />
                {items.map(([id, item]) => (
                  <OrnamentTile
                    key={id}
                    id={id}
                    item={item}
                    on={cur === id}
                    locked={!canUseItem(tier, slot, id)}
                    avatarUrl={avatarUrl}
                    username={username}
                    onClick={() => setSlot(slot, id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
