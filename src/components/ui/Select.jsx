/**
 * Radix, menu entièrement stylé.
 * <Select value={v} onValueChange={setV} title="Saison" options={[{ value, label, icon? }]} />
 * Filtre : `prefix="Format"` nomme le champ, `emptyValue` la valeur « aucun filtre » (le champ ne
 * montre alors que son nom) ; une valeur choisie le teinte.
 */
import * as RSelect from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";

const SIZES = { md: "h-10", sm: "h-8 text-xs" };

// Cellule d'un bloc de sélecteurs séparés par des obliques : le fond de survol suit la pente.
const JOINED_BASE =
  "relative isolate !rounded-none !bg-transparent !ring-0 before:absolute before:inset-y-0 before:-z-10 before:bg-surface-2 before:opacity-0 before:transition-opacity before:content-[''] hover:before:opacity-100 data-[state=open]:before:opacity-100";
const JOINED = {
  start:
    "before:left-0 before:-right-1.5 before:[clip-path:polygon(0_0,calc(100%_-_1px)_0,calc(100%_-_11px)_100%,0_100%)]",
  middle:
    "before:-left-1.5 before:-right-1.5 before:[clip-path:polygon(11px_0,calc(100%_-_1px)_0,calc(100%_-_11px)_100%,1px_100%)]",
  end: "before:-left-1.5 before:right-0 before:[clip-path:polygon(11px_0,100%_0,100%_100%,1px_100%)]",
};

/** Options regroupées par `group` (sections), dans l'ordre d'apparition ; une seule section sans titre sinon. */
export function groupOptions(options) {
  const sections = [];
  for (const opt of options) {
    const last = sections[sections.length - 1];
    if (last && last.group === (opt.group || null)) last.items.push(opt);
    else sections.push({ group: opt.group || null, items: [opt] });
  }
  return sections;
}

function renderItem(opt) {
  return (
    <RSelect.Item
      key={opt.value}
      value={opt.value}
      className="relative flex cursor-pointer select-none items-center gap-2.5 rounded px-3 py-2.5 pr-9 text-sm leading-snug text-text outline-none transition-colors data-[highlighted]:bg-text/10 data-[state=checked]:font-bold data-[state=checked]:text-primary"
    >
      {opt.icon}
      <RSelect.ItemText>{opt.label}</RSelect.ItemText>
      <RSelect.ItemIndicator className="absolute right-2.5">
        <Check size={15} />
      </RSelect.ItemIndicator>
    </RSelect.Item>
  );
}

export function Select({
  value,
  onValueChange,
  options = [],
  placeholder,
  title,
  className = "",
  align = "start",
  disabled = false,
  size = "md",
  joined,
  prefix,
  emptyValue,
}) {
  const selected = options.find((o) => o.value === value);
  const filtering = prefix && emptyValue !== undefined && value !== emptyValue;
  return (
    <RSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RSelect.Trigger
        title={title}
        aria-label={title}
        className={`${SIZES[size] || SIZES.md} inline-flex cursor-pointer items-center justify-between gap-3 rounded-md pl-3.5 pr-3 text-left text-sm font-medium text-text outline-none ring-2 transition-colors focus:ring-primary/60 data-[state=open]:ring-primary/60 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 ${
          filtering
            ? "bg-primary/10 ring-primary/45 hover:bg-primary/15"
            : "bg-surface ring-border hover:bg-surface-2 data-[disabled]:hover:bg-surface"
        } ${joined ? `${JOINED_BASE} ${JOINED[joined]}` : ""} ${className}`}
      >
        {selected?.icon}
        <RSelect.Value placeholder={placeholder} className="min-w-0 truncate">
          {prefix ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={filtering ? "text-text/60" : "text-muted"}>{prefix}</span>
              {filtering && <span className="truncate font-bold text-primary">{selected?.label}</span>}
            </span>
          ) : undefined}
        </RSelect.Value>
        <RSelect.Icon asChild>
          <ChevronDown size={15} className="ml-auto shrink-0 text-muted" />
        </RSelect.Icon>
      </RSelect.Trigger>

      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          align={align}
          sideOffset={6}
          className="z-[300] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-surface shadow-card ring-1 ring-black/40 animate-in fade-in-0 zoom-in-95 data-[side=top]:slide-in-from-bottom-1 data-[side=bottom]:slide-in-from-top-1"
        >
          <RSelect.Viewport className="max-h-80 p-1.5">
            {groupOptions(options).map(({ group, items }, i) =>
              group ? (
                <RSelect.Group key={group}>
                  {i > 0 && <RSelect.Separator className="mx-1 my-1 h-px bg-border" />}
                  <RSelect.Label className="px-2.5 pb-1 pt-2 font-display text-[0.68rem] uppercase tracking-kana text-muted">
                    {group}
                  </RSelect.Label>
                  {items.map(renderItem)}
                </RSelect.Group>
              ) : (
                items.map(renderItem)
              )
            )}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}
