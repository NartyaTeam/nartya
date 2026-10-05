import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, CheckCircle2, RefreshCw, XCircle, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { getApiBaseUrl } from "@/config/config";

// Seulement page ouverte ; `/status` est déjà caché 60 s côté serveur.
const POLL_MS = 20_000;
const PROBE_TIMEOUT_MS = 8_000;

const CATEGORY_META = {
  core: {
    label: "Cœur",
    icon: ShieldCheck,
    description: "Indispensables : sans eux, plus de catalogue ni de lecture.",
  },
  enrich: {
    label: "Enrichissement",
    icon: Sparkles,
    description: "Dégradation gracieuse : une panne ici rend les fiches moins riches, jamais inutilisables.",
  },
};

async function fetchStatus() {
  const res = await fetch(`${getApiBaseUrl()}/v1/status`, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body?.data) throw new Error("réponse invalide");
  return body.data;
}

function relativeSeconds(date) {
  if (!date) return null;
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 5) return "à l'instant";
  if (s < 60) return `il y a ${s}s`;
  return `il y a ${Math.round(s / 60)} min`;
}

function ServiceRow({ service }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${service.ok ? "bg-emerald-400" : "bg-red-400"}`}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{service.label}</p>
          {!service.ok && service.detail && (
            <p className="mt-0.5 truncate text-xs text-red-300/90">{service.detail}</p>
          )}
          {service.ok && service.detail && (
            <p className="mt-0.5 truncate text-xs text-muted">{service.detail}</p>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-xs font-bold ${service.ok ? "text-emerald-300" : "text-red-300"}`}>
          {service.ok ? "En ligne" : "Hors ligne"}
        </p>
        {service.ok && service.ms != null && (
          <p className="text-[0.65rem] tabular-nums text-muted/60">{service.ms}ms</p>
        )}
      </div>
    </div>
  );
}

function CategorySection({ category, services }) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <Icon size={14} className="text-primary" />
        <h2 className="section-title !text-lg">
          {meta.label}
        </h2>
      </div>
      <p className="mb-3 px-1 text-xs text-muted">{meta.description}</p>
      <div className="divide-y divide-border/60 overflow-hidden rounded-md border-2 border-border bg-surface/40">
        {services.map((s) => (
          <ServiceRow key={s.id} service={s} />
        ))}
      </div>
    </section>
  );
}

export default function UptimePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const [, forceTick] = useState(0);
  const checkingRef = useRef(false);

  const check = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setRefreshing(true);
    try {
      const result = await fetchStatus();
      setData(result);
      setError(false);
      setLastChecked(new Date());
    } catch {
      setError(true);
      setLastChecked(new Date());
    } finally {
      checkingRef.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    check();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") check();
    }, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [check]);

  // Fait tourner « il y a N s » sans re-sonder.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1_000);
    return () => clearInterval(t);
  }, []);

  const services = data?.services || [];
  const core = services.filter((s) => s.category === "core");
  const enrich = services.filter((s) => s.category === "enrich");
  const coreDown = core.some((s) => !s.ok);
  const enrichDown = enrich.some((s) => !s.ok);

  let banner = null;
  if (error && !data) {
    banner = {
      cls: "border-red-400/25 bg-red-400/[0.06] text-red-200",
      icon: XCircle,
      text: "Impossible de récupérer l'état des services. Vérifie ta connexion.",
    };
  } else if (coreDown) {
    banner = {
      cls: "border-red-400/25 bg-red-400/[0.06] text-red-200",
      icon: XCircle,
      text: "Un service essentiel est perturbé — le catalogue ou la lecture peuvent être affectés.",
    };
  } else if (enrichDown) {
    banner = {
      cls: "border-amber-400/25 bg-amber-400/[0.06] text-amber-200",
      icon: RefreshCw,
      text: "Tout l'essentiel fonctionne. Un service d'enrichissement est perturbé : certaines fiches peuvent être moins complètes (synopsis, vignettes, musiques…).",
    };
  } else if (data) {
    banner = {
      cls: "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-200",
      icon: CheckCircle2,
      text: "Tout fonctionne normalement.",
    };
  }
  const BannerIcon = banner?.icon;

  return (
    <div className="animate-fade-in mx-auto max-w-2xl px-4 pb-10 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-8 md:py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Activity size={26} className="text-primary" />
          <div>
            <h1 className="t-impact text-4xl sm:text-5xl">Uptime</h1>
            <p className="mt-1 text-sm text-muted">
              État en direct de tous les services dont dépend Nartya.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={check}
          title="Vérifier maintenant"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {banner && (
        <div className={`mb-6 flex items-center gap-2.5 rounded-md border-2 px-4 py-3 text-sm font-bold ${banner.cls}`}>
          <BannerIcon size={16} className={banner.icon === RefreshCw ? "animate-spin" : "shrink-0"} />
          {banner.text}
        </div>
      )}

      {!data && !error && (
        <div className="flex h-32 items-center justify-center text-sm text-muted">
          <RefreshCw size={18} className="mr-2 animate-spin" />
          Vérification en cours…
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-6">
          {core.length > 0 && <CategorySection category="core" services={core} />}
          {enrich.length > 0 && <CategorySection category="enrich" services={enrich} />}
        </div>
      )}

      <div className="mt-6 flex items-center gap-1.5 px-1 text-[0.7rem] text-muted/70">
        <Clock3 size={12} />
        {lastChecked
          ? `Dernière vérification ${relativeSeconds(lastChecked)}`
          : "Première vérification en cours…"}
        <span className="ml-auto">Auto-actualisation toutes les {POLL_MS / 1000}s</span>
      </div>
    </div>
  );
}
