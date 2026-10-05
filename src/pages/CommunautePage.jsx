import { useEffect, useMemo, useRef, useState } from "react";
import { Search, UserPlus, Check, X, UserMinus, Users, Clock, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { useFriendsStore } from "@/stores/useFriendsStore";
import { searchUsers } from "@/api/friends";
import FriendCard from "@/components/community/FriendCard";

const GRID_CLASS = "grid gap-3 sm:grid-cols-2";

function ActionButton({ icon: Icon, label, onClick, variant = "ghost", disabled = false, title }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "bg-primary text-primary-fg hover:bg-primary/90"
      : variant === "danger"
      ? "text-muted ring-1 ring-border hover:text-red-300 hover:ring-red-400/40"
      : "text-muted ring-1 ring-border hover:text-text hover:ring-primary/40";
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`${base} ${styles}`}>
      {Icon && <Icon size={14} />}
      {label}
    </button>
  );
}

/** Selon la relation avec l'appelant. */
function SearchAction({ person, onAdd, onAccept }) {
  switch (person.relation) {
    case "friends":
      return <ActionButton icon={Check} label="Amis" variant="ghost" disabled />;
    case "pending_out":
      return <ActionButton icon={Clock} label="En attente" variant="ghost" disabled title="Demande envoyée" />;
    case "pending_in":
      return <ActionButton icon={Check} label="Accepter" variant="primary" onClick={() => onAccept(person)} />;
    default:
      return <ActionButton icon={UserPlus} label="Ajouter" variant="primary" onClick={() => onAdd(person)} />;
  }
}

export default function CommunautePage() {
  const friends = useFriendsStore((s) => s.friends);
  const incoming = useFriendsStore((s) => s.incoming);
  const outgoing = useFriendsStore((s) => s.outgoing);
  const loaded = useFriendsStore((s) => s.loaded);
  const refresh = useFriendsStore((s) => s.refresh);
  const sendRequest = useFriendsStore((s) => s.sendRequest);
  const accept = useFriendsStore((s) => s.accept);
  const refuse = useFriendsStore((s) => s.refuse);
  const cancelRequest = useFriendsStore((s) => s.cancelRequest);
  const remove = useFriendsStore((s) => s.remove);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null); // null = pas de recherche active
  const [searching, setSearching] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // `reqId` écarte les réponses obsolètes.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mine = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const rows = await searchUsers(q);
        if (mine === reqId.current) setResults(rows);
      } catch {
        if (mine === reqId.current) setResults([]);
      } finally {
        if (mine === reqId.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const patchResult = (id, relation) =>
    setResults((rows) => (rows ? rows.map((r) => (r.id === id ? { ...r, relation } : r)) : rows));

  const handleAdd = async (person) => {
    try {
      const status = await sendRequest(person.handle);
      patchResult(person.id, status === "accepted" ? "friends" : "pending_out");
      toast.success(status === "accepted" ? `Tu es maintenant ami avec ${person.username}.` : "Demande envoyée.");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleAccept = async (person) => {
    try {
      await accept(person.id);
      patchResult(person.id, "friends");
      toast.success(`Tu es maintenant ami avec ${person.username}.`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleRefuse = async (person) => {
    try {
      await refuse(person.id);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleCancel = async (person) => {
    try {
      await cancelRequest(person.id);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleRemove = async (person) => {
    try {
      await remove(person.id);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const hasRequests = incoming.length > 0 || outgoing.length > 0;
  const showResults = useMemo(() => query.trim().length >= 2, [query]);

  return (
    <div className="animate-fade-in p-8">
      <header className="mb-8">
        <p className="eyebrow">Communauté</p>
        <h1 className="t-impact text-4xl md:text-5xl">
          Amis
          {loaded && friends.length > 0 && (
            <span className="ml-2.5 align-middle text-lg font-medium text-muted">{friends.length}</span>
          )}
        </h1>
      </header>

      <section className="mb-10">
        <div className="flex h-10 w-full max-w-md items-center gap-2.5 rounded-md bg-surface px-3.5 ring-2 ring-border focus-within:ring-primary/70">
          {searching ? (
            <Loader2 size={16} className="shrink-0 animate-spin text-muted" />
          ) : (
            <Search size={16} className="shrink-0 text-muted" />
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un membre par pseudo ou @handle…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </div>

        {showResults && (
          <div className="mt-4">
            {results === null ? null : results.length === 0 ? (
              <p className="text-sm text-muted">Aucun membre ne correspond à «&nbsp;{query.trim()}&nbsp;».</p>
            ) : (
              <div className={GRID_CLASS}>
                {results.map((person) => (
                  <FriendCard
                    key={person.id}
                    person={person}
                    action={<SearchAction person={person} onAdd={handleAdd} onAccept={handleAccept} />}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {hasRequests && (
        <section className="mb-10">
          <h2 className="section-title mb-4 !text-xl">Demandes</h2>

          {incoming.length > 0 && (
            <>
              <p className="eyebrow mb-3">Reçues</p>
              <div className={`${GRID_CLASS} mb-6`}>
                {incoming.map((person) => (
                  <FriendCard
                    key={person.id}
                    person={person}
                    action={
                      <div className="flex items-center gap-1.5">
                        <ActionButton icon={Check} label="Accepter" variant="primary" onClick={() => handleAccept(person)} />
                        <ActionButton icon={X} label="" title="Refuser" variant="danger" onClick={() => handleRefuse(person)} />
                      </div>
                    }
                  />
                ))}
              </div>
            </>
          )}

          {outgoing.length > 0 && (
            <>
              <p className="eyebrow mb-3">Envoyées</p>
              <div className={GRID_CLASS}>
                {outgoing.map((person) => (
                  <FriendCard
                    key={person.id}
                    person={person}
                    action={<ActionButton icon={X} label="Annuler" variant="ghost" onClick={() => handleCancel(person)} />}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <section>
        <h2 className="section-title mb-4 !text-xl">Mes amis</h2>
        {!loaded ? (
          <div className={GRID_CLASS}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[76px] skeleton rounded-md" />
            ))}
          </div>
        ) : friends.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border-2 border-dashed border-border py-16 text-center">
            <Users size={28} className="text-muted" />
            <p className="mt-3 max-w-sm text-sm text-muted">
              Tu n'as pas encore d'amis. Cherche un membre par son pseudo ci-dessus pour lui envoyer une demande.
            </p>
          </div>
        ) : (
          <div className={GRID_CLASS}>
            {friends.map((person) => (
              <FriendCard
                key={person.id}
                person={person}
                action={<ActionButton icon={UserMinus} label="Retirer" variant="danger" onClick={() => handleRemove(person)} />}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
