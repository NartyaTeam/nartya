import { Fox } from "@/components/brand/NartyaMark";

/** `min-h-screen` par défaut : les pages passent sous la TopBar. Pour une section, un `py-*`. */
export default function PageLoader({ className = "min-h-screen", label = "Chargement" }) {
  return (
    <div className={`flex w-full flex-col items-center justify-center gap-4 ${className}`}>
      <Fox className="h-20 w-20 animate-pulse text-primary" aria-hidden="true" />
      <p className="text-sm font-medium text-muted">
        {label}
        <span className="loader-dots" aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </p>
    </div>
  );
}
