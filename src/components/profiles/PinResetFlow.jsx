import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import PinPad from "./PinPad";

/**
 * Code de profil oublié, comme le mot de passe oublié : un code à 6 chiffres part à l'adresse
 * e-mail du compte, puis on choisit le nouveau code du profil (ou on le retire).
 *
 * `request()` → `{ email }` (adresse masquée) ; `confirm(code, newPin)` → `{ ok, error }`.
 */
export default function PinResetFlow({ profile, request, confirm, errorMessage, onDone, onCancel }) {
  const [step, setStep] = useState("sending"); // sending | code | pin | failed
  const [email, setEmail] = useState(null);
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const send = useCallback(async () => {
    setStep("sending");
    setError(null);
    try {
      const res = await request(profile.id);
      setEmail(res?.email ?? null);
      setStep("code");
    } catch (e) {
      setError(errorMessage(e));
      setStep("failed");
    }
  }, [request, profile.id, errorMessage]);

  useEffect(() => {
    send();
  }, [send]);

  const finish = async (newPin) => {
    setBusy(true);
    setError(null);
    try {
      const res = await confirm(profile.id, code, newPin);
      if (res?.ok) {
        onDone(newPin ? "Nouveau code enregistré." : "Code retiré.");
        return;
      }
      setError(errorMessage(res?.error));
      setStep(res?.error === "code_invalid" ? "code" : "failed");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setResetKey((n) => n + 1);
    }
  };

  return (
    <div className="flex w-full max-w-md flex-col items-center text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Mail size={22} />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold">Code oublié</h1>

      {step === "sending" && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Envoi du code par e-mail…
        </p>
      )}

      {step === "code" && (
        <>
          <p className="mb-6 mt-3 text-sm text-muted">
            Un code à 6 chiffres a été envoyé à <span className="font-semibold text-text">{email}</span>. Il est
            valable 15 minutes.
          </p>
          <PinPad
            length={6}
            resetKey={resetKey}
            error={error}
            onComplete={(value) => {
              setCode(value);
              setError(null);
              setStep("pin");
            }}
          />
          <button onClick={send} className="mt-4 text-sm text-muted hover:text-text hover:underline">
            Renvoyer un code
          </button>
        </>
      )}

      {step === "pin" && (
        <>
          <p className="mb-6 mt-3 text-sm text-muted">
            Choisis le nouveau code du profil « {profile.name} ».
          </p>
          <PinPad onComplete={finish} busy={busy} error={error} resetKey={resetKey} />
          <button
            onClick={() => finish(null)}
            disabled={busy}
            className="mt-4 text-sm text-muted hover:text-text hover:underline"
          >
            Retirer le code plutôt
          </button>
        </>
      )}

      {step === "failed" && (
        <>
          <p className="mt-3 text-sm text-amber-200/90">{error}</p>
          <button onClick={send} className="mt-4 text-sm font-semibold text-primary hover:underline">
            Renvoyer un code
          </button>
        </>
      )}

      <button onClick={onCancel} disabled={busy} className="mt-6 text-sm text-muted hover:text-text">
        Annuler
      </button>
    </div>
  );
}
