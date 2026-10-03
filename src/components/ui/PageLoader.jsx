import { asset } from "@/lib/asset";

/** `min-h-screen` par défaut : les pages passent sous la TopBar. Pour une section, un `py-*`. */
export default function PageLoader({ className = "min-h-screen", label = "Chargement" }) {
  return (
    <div className={`flex w-full flex-col items-center justify-center gap-4 ${className}`}>
      <img
        src={asset("loading.gif")}
        alt=""
        aria-hidden
        className="h-28 w-28 select-none object-contain"
        draggable={false}
      />
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
