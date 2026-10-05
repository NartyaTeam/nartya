import { useEffect, useState } from "react";
import { Fox, NartyaLockup } from "@/components/brand/NartyaMark";
import { useNavigate } from "react-router-dom";
import { Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { getRow } from "@/api/anilist";
import TermsDialog from "@/components/legal/TermsDialog";
import HubSignInCard from "@/components/auth/HubSignInCard";
import { translateAuthError } from "@/lib/authErrors";
import { authOwnedByHub } from "@/lib/hubAuth";

/** Contenu dupliqué et translaté de -50 % pour boucler. */
function MarqueeRow({ covers, reverse, duration }) {
  const doubled = [...covers, ...covers];
  return (
    <div
      className="flex w-max animate-marquee-x"
      style={{ animationDuration: duration, animationDirection: reverse ? "reverse" : "normal" }}
    >
      {doubled.map((src, i) => (
        <div
          key={i}
          className="mr-5 aspect-[2/3] h-[38vh] shrink-0 overflow-hidden rounded-xl shadow-card ring-1 ring-white/10"
        >
          <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
      ))}
    </div>
  );
}

export default function LoginPage() {
  const session = useAuthStore((s) => s.session);
  const signInWithDiscord = useAuthStore((s) => s.signInWithDiscord);
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail);
  const signUpWithEmail = useAuthStore((s) => s.signUpWithEmail);
  const continueAsGuest = useAuthStore((s) => s.continueAsGuest);
  const navigate = useNavigate();
  const [covers, setCovers] = useState([]);
  const [termsOpen, setTermsOpen] = useState(false);

  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    // Un invité peut revenir créer un vrai compte : seule une session non anonyme redirige.
    if (session && !session.user?.is_anonymous) navigate("/", { replace: true });
  }, [session, navigate]);

  const submitEmail = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    if (!email.trim() || password.length < 6) {
      setError("Renseigne un email et un mot de passe d'au moins 6 caractères.");
      return;
    }
    setBusy("email");
    try {
      const res =
        mode === "signup"
          ? await signUpWithEmail(email, password)
          : await signInWithEmail(email, password);
      if (res?.error) {
        setError(translateAuthError(res.error));
      } else if (res?.needsConfirm) {
        setNotice("Compte créé ! Vérifie ta boîte mail pour confirmer, puis connecte-toi.");
        setMode("signin");
      }
    } finally {
      setBusy(null);
    }
  };

  const onGuest = async () => {
    if (busy) return;
    setError("");
    setBusy("guest");
    try {
      const res = await continueAsGuest();
      if (res?.error) {
        setError("Le mode visiteur est momentanément indisponible.");
        return;
      }
      // L'effet de redirection ignore les invités : la sortie du flux visiteur est explicite.
      navigate("/", { replace: true });
    } finally {
      setBusy(null);
    }
  };

  const onDiscord = async () => {
    if (busy) return;
    setError("");
    setBusy("discord");
    try {
      const result = await signInWithDiscord();
      if (result?.error) setError(result.error);
    } finally {
      // Page OAuth annulée : le bouton doit redevenir utilisable.
      setBusy(null);
    }
  };

  useEffect(() => {
    getRow({ sort: ["POPULARITY_DESC"], perPage: 24 })
      .then((list) => setCovers(list.map((a) => a.cover).filter(Boolean)))
      .catch(() => {});
  }, []);

  const row1 = covers.slice(0, 12);
  const row2 = covers.slice(12, 24).reverse();

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-bg">
      {covers.length > 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-5 opacity-55 blur-[1px]">
          <MarqueeRow covers={row1} duration="65s" />
          <MarqueeRow covers={row2} reverse duration="80s" />
        </div>
      )}

      {/* Lisibilité de la carte. */}
      <div className="absolute inset-0 bg-bg/75" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/55 to-bg/80" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 55% at 50% 50%, rgb(var(--primary) / 0.18), transparent 70%)",
        }}
      />

      <Fox className="pointer-events-none absolute -bottom-24 -left-16 h-[34rem] w-[34rem] -rotate-6 select-none text-white/[0.035]" />

      {/* Défilable : le clavier mobile ne coupe pas la carte. */}
      <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto px-6 py-8">
        <div className="w-full max-w-sm animate-slide-up">
        {authOwnedByHub() ? (
          <HubSignInCard onOpenTerms={() => setTermsOpen(true)} />
        ) : (
        <div className="rounded-lg bg-surface/70 p-7 shadow-card ring-1 ring-white/10 backdrop-blur-2xl">
          <div className="mb-6 text-center">
            <NartyaLockup className="mb-5" />
            <p className="text-sm leading-relaxed text-muted">
              {mode === "signup"
                ? "Crée ton compte pour suivre ta progression et bâtir ta collection."
                : "Connecte-toi pour retrouver ta progression et ta collection."}
            </p>
          </div>

          <form onSubmit={submitEmail} className="space-y-3">
            <label className="flex items-center gap-2.5 rounded-md bg-surface-2/70 px-3.5 ring-1 ring-border transition-colors focus-within:ring-primary/60">
              <Mail size={16} className="shrink-0 text-muted" />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Adresse email"
                className="w-full bg-transparent py-3 text-sm text-text outline-none placeholder:text-muted"
              />
            </label>

            <label className="flex items-center gap-2.5 rounded-md bg-surface-2/70 px-3.5 ring-1 ring-border transition-colors focus-within:ring-primary/60">
              <Lock size={16} className="shrink-0 text-muted" />
              <input
                type={showPw ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                className="w-full bg-transparent py-3 text-sm text-text outline-none placeholder:text-muted"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                className="shrink-0 text-muted transition-colors hover:text-text"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </label>

            {error && <p className="text-xs leading-relaxed text-primary">{error}</p>}
            {notice && <p className="text-xs leading-relaxed text-accent">{notice}</p>}

            <button
              type="submit"
              disabled={!!busy}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90 disabled:opacity-60"
            >
              {busy === "email" && <Loader2 size={16} className="animate-spin" />}
              {mode === "signup" ? "Créer mon compte" : "Se connecter"}
            </button>
          </form>

          <p className="mt-3 text-center text-xs text-muted">
            {mode === "signup" ? "Déjà un compte ? " : "Pas encore de compte ? "}
            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === "signup" ? "signin" : "signup"));
                setError("");
                setNotice("");
              }}
              className="font-semibold text-text underline decoration-dotted underline-offset-2 transition-colors hover:text-primary"
            >
              {mode === "signup" ? "Se connecter" : "Créer un compte"}
            </button>
          </p>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[0.7rem] uppercase tracking-kana text-muted/70">ou</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={onDiscord}
            disabled={!!busy}
            className="flex w-full items-center justify-center gap-2.5 rounded-md bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#4d59e0] disabled:opacity-60"
          >
            {busy === "discord" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.21.375-.444.88-.608 1.28a18.27 18.27 0 0 0-5.487 0A12.6 12.6 0 0 0 9.18 3 19.74 19.74 0 0 0 4.74 4.37C1.91 8.59 1.144 12.7 1.527 16.75a19.9 19.9 0 0 0 6.073 3.058c.49-.667.927-1.376 1.304-2.122a12.9 12.9 0 0 1-2.053-.985c.172-.126.34-.257.502-.392a14.2 14.2 0 0 0 12.293 0c.164.135.332.266.502.392-.654.387-1.343.72-2.056.986.377.745.813 1.454 1.304 2.12a19.84 19.84 0 0 0 6.075-3.057c.45-4.695-.766-8.768-3.224-12.38ZM8.02 14.331c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.335-.955 2.42-2.157 2.42Zm7.974 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.335-.946 2.42-2.157 2.42Z" />
              </svg>
            )}
            Continuer avec Discord
          </button>

          <button
            onClick={onGuest}
            disabled={!!busy}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-60"
          >
            {busy === "guest" && <Loader2 size={15} className="animate-spin" />}
            Continuer en visiteur
          </button>

          <p className="mt-5 text-center text-xs leading-relaxed text-muted/70">
            En continuant, tu acceptes nos{" "}
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              className="font-medium text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-primary"
            >
              conditions d'utilisation
            </button>
            .
          </p>
        </div>
        )}
        </div>
      </div>

      <TermsDialog open={termsOpen} onOpenChange={setTermsOpen} />
    </div>
  );
}
