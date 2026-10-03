import { useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { platform } from "@/platform";
import { useAuthStore } from "@/stores/useAuthStore";
import { API_URL } from "@/config/instance";
import { createApiKey, listApiKeys, revokeApiKey } from "@/api/apiKeys";
import { Section, SettingRow } from "./SettingsLayout";

const MAX_KEYS = 5;

const BUTTON =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[5px] border border-border bg-white/[0.035] px-3.5 py-2 text-sm font-medium leading-5 text-text transition-colors hover:border-white/20 hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-50";
const PRIMARY_BUTTON =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[5px] border border-primary bg-primary px-3.5 py-2 text-sm font-semibold leading-5 text-primary-fg transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50";
const FIELD =
  "min-w-0 flex-1 rounded-[5px] border border-border bg-black/20 px-3 py-2 text-sm leading-5 text-text placeholder:text-muted/60 focus:border-white/25 focus:outline-none";
const CODE = "rounded-[5px] border border-border/60 bg-black/30 px-3 py-2 font-mono text-xs leading-5 text-text";

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Pleine largeur sous une `SettingRow`, alignée sur son texte. */
function Panel({ children }) {
  return <div className="border-t border-border/45 py-4 md:py-5 md:pl-[52px]">{children}</div>;
}

function CreateKeyForm({ onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);

  const submit = async (e) => {
    e.preventDefault();
    setPending(true);
    try {
      onCreated(await createApiKey(name.trim()));
    } catch (err) {
      toast.error(err.message);
      setPending(false);
    }
  };

  return (
    <Panel>
      <form onSubmit={submit}>
        <label htmlFor="api-key-name" className="text-xs font-semibold text-text">
          Nom de la clé
        </label>
        <p className="mt-0.5 text-xs text-muted">Pour la reconnaître plus tard, par exemple le nom de ton projet.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            id="api-key-name"
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Mon bot Discord"
            className={FIELD}
          />
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className={`${BUTTON} flex-1 sm:flex-none`}>
              Annuler
            </button>
            <button type="submit" disabled={pending || !name.trim()} className={`${PRIMARY_BUTTON} flex-1 sm:flex-none`}>
              {pending && <LoaderCircle size={15} className="animate-spin" />}
              Créer la clé
            </button>
          </div>
        </div>
      </form>
    </Panel>
  );
}

function NewKeyNotice({ created, onDone }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
    } catch {
      toast.error("Copie impossible, sélectionne la clé à la main.");
    }
  };

  return (
    <Panel>
      <p className="text-sm font-semibold text-text">Clé « {created.name} » créée</p>
      <p className="mt-0.5 text-xs text-muted">Copie-la maintenant : elle ne sera plus jamais affichée.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <code className={`${CODE} min-w-0 flex-1 select-all truncate`}>{created.key}</code>
        <button type="button" onClick={copy} className={BUTTON}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Copiée" : "Copier"}
        </button>
      </div>
      <p className="mt-4 text-xs font-semibold text-text">Exemple</p>
      <pre className={`${CODE} mt-1.5 overflow-x-auto text-muted`}>
        {`curl -H "Authorization: Bearer ${created.prefix}…" \\\n  "${API_URL}/v1/anime/search?q=naruto"`}
      </pre>
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onDone} className={PRIMARY_BUTTON}>
          J'ai copié la clé
        </button>
      </div>
    </Panel>
  );
}

function KeyRow({ apiKey, onRevoke }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border/45 py-4 md:py-5">
      <div className="flex min-w-0 gap-3 md:gap-4">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.045] text-muted md:rounded-[5px]">
          <KeyRound size={15} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{apiKey.name}</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            <code className="font-mono">{apiKey.prefix}…</code>
            {" · "}créée le {formatDate(apiKey.created_at)}
            {" · "}
            {apiKey.last_used_at ? `utilisée le ${formatDate(apiKey.last_used_at)}` : "jamais utilisée"}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => (confirming ? onRevoke(apiKey.id) : setConfirming(true))}
        onBlur={() => setConfirming(false)}
        className={`${BUTTON} ${confirming ? "border-red-500/50 text-red-300 hover:border-red-500/70" : ""}`}
      >
        <Trash2 size={15} />
        {confirming ? "Confirmer" : "Révoquer"}
      </button>
    </div>
  );
}

export default function ApiKeysSection({ number }) {
  const session = useAuthStore((s) => s.session);
  // L'identité Discord, pas `profiles.discord_id` qui reste renseigné après un déliage.
  const discordLinked =
    session?.user?.identities?.some((identity) => identity.provider === "discord") ||
    session?.user?.app_metadata?.providers?.includes("discord");
  const [keys, setKeys] = useState(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);

  const refresh = () =>
    listApiKeys()
      .then(setKeys)
      .catch((e) => {
        setKeys([]);
        toast.error(e.message);
      });

  useEffect(() => {
    refresh();
  }, []);

  const handleCreated = (result) => {
    setCreating(false);
    setCreated(result);
    refresh();
  };

  const handleRevoke = async (id) => {
    try {
      await revokeApiKey(id);
      toast.success("Clé révoquée");
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const full = (keys?.length || 0) >= MAX_KEYS;
  let description = "Lecture du catalogue, des fiches et des épisodes. La lecture vidéo reste réservée à l'app.";
  if (!discordLinked) {
    description = platform.isDesktop
      ? "Lie d'abord un compte Discord depuis le Hub Nartya pour créer une clé."
      : "Lie d'abord un compte Discord (Compte → Comptes liés) pour créer une clé.";
  } else if (full) {
    description = `Tu as atteint ${MAX_KEYS} clés actives : révoque-en une pour en créer une autre.`;
  }

  return (
    <Section
      id="api-keys"
      number={number}
      eyebrow="Développeurs"
      title="Clés d'API"
      description="Interroge l'API Nartya depuis tes scripts ou ton projet, sans gérer de connexion."
    >
      <SettingRow
        icon={KeyRound}
        label="Nouvelle clé"
        description={description}
        details={`Une clé est rattachée à ton compte et à ton Discord : mêmes limites que l'app, et elle cesse de fonctionner dès que tu la révoques. ${MAX_KEYS} clés actives au maximum.`}
      >
        {discordLinked && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={creating || full || keys === null}
            className={BUTTON}
          >
            <Plus size={15} />
            Créer une clé
          </button>
        )}
      </SettingRow>

      {creating && <CreateKeyForm onCreated={handleCreated} onCancel={() => setCreating(false)} />}
      {created && <NewKeyNotice created={created} onDone={() => setCreated(null)} />}

      {keys === null ? (
        <div className="flex justify-center border-t border-border/45 py-6">
          <LoaderCircle size={18} className="animate-spin text-muted" />
        </div>
      ) : (
        keys.map((apiKey) => <KeyRow key={apiKey.id} apiKey={apiKey} onRevoke={handleRevoke} />)
      )}
    </Section>
  );
}
