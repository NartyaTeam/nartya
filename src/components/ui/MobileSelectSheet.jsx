import { Check } from "lucide-react";
import { createPortal } from "react-dom";

export function MobileSelectSheet({ open, title, options = [], value, onChange, onClose }) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/60"
      style={{ animation: "fade-in 0.18s ease both" }}
      onClick={onClose}
    >
      <div
        className="animate-sheet-up max-h-[75vh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-surface pb-[max(env(safe-area-inset-bottom),1rem)] shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-surface pt-2.5">
          <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-white/20" />
          {title && (
            <p className="px-5 pb-2 font-display text-[0.7rem] uppercase tracking-kana text-muted">
              {title}
            </p>
          )}
        </div>
        <div className="px-2 pb-1">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  onClose();
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[0.95rem] transition-colors active:bg-white/[0.06] ${
                  active ? "font-semibold text-primary" : "text-text"
                }`}
              >
                {option.icon}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {active && <Check size={18} className="shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
