import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Smile, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";

const EMOJIS = ["😂", "🔥", "😮", "😭", "❤️", "👏", "💀", "🎉"];
const LIFETIME_MS = 3200;
let nextId = 0;

/**
 * Sans persistance. `docked` : panneau inline pleine hauteur, sinon flottant.
 * `subscribeReactions(cb)` et `onSendReaction(emoji)` activent les réactions (variante docked).
 */
export default function PartyChat({
  chat = [],
  onSend,
  myClientId,
  docked = false,
  subscribeReactions,
  onSendReaction,
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [floating, setFloating] = useState([]);
  const scrollRef = useRef(null);
  const timersRef = useRef([]);
  const visible = docked || open;

  useEffect(() => {
    if (visible && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat, visible]);

  useEffect(() => {
    if (!subscribeReactions) return;
    const unsub = subscribeReactions((reaction) => {
      const id = ++nextId;
      const left = 5 + Math.random() * 70;
      setFloating((prev) => [...prev.slice(-24), { id, emoji: reaction.emoji, left }]);
      const t = setTimeout(() => {
        setFloating((prev) => prev.filter((f) => f.id !== id));
        timersRef.current = timersRef.current.filter((tid) => tid !== t);
      }, LIFETIME_MS);
      timersRef.current.push(t);
    });
    return () => {
      unsub();
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [subscribeReactions]);

  const submit = (e) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    onSend?.(clean);
    setText("");
  };

  const sendReaction = (emoji) => {
    onSendReaction?.(emoji);
    setPickerOpen(false);
  };

  const messages = (
    <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 py-3">
      {chat.length === 0 ? (
        <p className="py-10 text-center text-sm text-white/40">
          Aucun message. Lancez la discussion !
        </p>
      ) : (
        chat.map((m, i) => {
          if (m.type === "system") {
            return (
              <div key={`${m.ts}-${i}`} className="flex items-center gap-2 px-1 py-0.5">
                <span className="h-px flex-1 bg-white/[0.06]" />
                <span className="shrink-0 text-[10px] italic text-white/35">{m.text}</span>
                <span className="h-px flex-1 bg-white/[0.06]" />
              </div>
            );
          }
          const mine = m.clientId === myClientId;
          return (
            <div key={`${m.ts}-${i}`} className="flex items-start gap-2 rounded px-1 py-0.5 hover:bg-white/[0.03]">
              <Avatar
                src={m.avatar}
                name={m.username}
                className="mt-0.5 h-5 w-5 shrink-0 rounded-full"
                textClassName="text-[10px]"
              />
              <p className="min-w-0 break-words text-sm leading-snug text-white/90">
                <span className={`font-semibold ${mine ? "text-accent" : "text-primary"}`}>
                  {m.username}
                </span>
                <span className="text-white/40"> </span>
                {m.text}
              </p>
            </div>
          );
        })
      )}
    </div>
  );

  const inputBar = (
    <div className="relative border-t border-white/10 p-2.5">
      {pickerOpen && onSendReaction && (
        <div
          className="absolute bottom-full left-0 mb-2 grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-[#121212]/95 p-3 shadow-2xl backdrop-blur-md"
          style={{ animation: "epSelSlide 0.15s ease" }}
        >
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => sendReaction(e)}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl transition-all hover:scale-110 hover:bg-white/10"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex items-center gap-2">
        {onSendReaction && (
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-label="Réagir"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
              pickerOpen
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Smile size={16} />
          </button>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Message…"
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-white placeholder:text-white/40 focus:border-primary/60 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Envoyer"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg transition-colors hover:bg-primary/90 disabled:opacity-40"
          disabled={!text.trim()}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );

  if (docked) {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-10">
          {floating.map((f) => (
            <span
              key={f.id}
              className="absolute bottom-16 text-4xl leading-none select-none"
              style={{ left: `${f.left}%`, animation: `partyFloat ${LIFETIME_MS}ms ease-out forwards` }}
            >
              {f.emoji}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <MessageCircle size={16} className="text-primary" />
          <span className="font-display text-base font-bold text-white">Chat</span>
        </div>
        {messages}
        {inputBar}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le chat"
        className="pointer-events-auto absolute bottom-20 right-[68px] z-[58] flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-[#121212]/85 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-white/10"
      >
        <MessageCircle size={20} />
        {chat.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-fg">
            {chat.length > 99 ? "99+" : chat.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="pointer-events-auto absolute bottom-3 right-3 top-16 z-[60] flex w-[min(340px,80%)] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#121212]/95 shadow-2xl backdrop-blur-md"
      style={{ animation: "epSelSlide 0.2s ease" }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="font-display text-base font-bold text-white">Chat du salon</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fermer le chat"
          className="text-white/60 transition-colors hover:text-white"
        >
          <X size={18} />
        </button>
      </div>
      {messages}
      {inputBar}
    </div>
  );
}
