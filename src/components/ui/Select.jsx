/**
 * Radix, menu entièrement stylé.
 * <Select value={v} onValueChange={setV} title="Saison" options={[{ value, label, icon? }]} />
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
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <RSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RSelect.Trigger
        title={title}
        aria-label={title}
        className={`${SIZES[size] || SIZES.md} inline-flex cursor-pointer items-center gap-2 rounded-md bg-surface pl-3.5 pr-3 text-sm font-medium text-text outline-none ring-2 ring-border transition-colors hover:bg-surface-2 focus:ring-primary/60 data-[state=open]:ring-primary/60 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[disabled]:hover:bg-surface ${joined ? `${JOINED_BASE} ${JOINED[joined]}` : ""} ${className}`}
      >
        {selected?.icon}
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon asChild>
          <ChevronDown size={15} className="ml-auto text-muted" />
        </RSelect.Icon>
      </RSelect.Trigger>

      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          align={align}
          sideOffset={6}
          className="z-[300] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-surface shadow-card ring-1 ring-black/40 animate-in fade-in-0 zoom-in-95 data-[side=top]:slide-in-from-bottom-1 data-[side=bottom]:slide-in-from-top-1"
        >
          <RSelect.Viewport className="max-h-72 p-1">
            {options.map((opt) => (
              <RSelect.Item
                key={opt.value}
                value={opt.value}
                className="relative flex cursor-pointer select-none items-center gap-2.5 rounded px-2.5 py-2 pr-8 text-sm text-text outline-none transition-colors data-[highlighted]:bg-primary data-[highlighted]:text-primary-fg data-[state=checked]:font-semibold"
              >
                {opt.icon}
                <RSelect.ItemText>{opt.label}</RSelect.ItemText>
                <RSelect.ItemIndicator className="absolute right-2.5">
                  <Check size={15} />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}
