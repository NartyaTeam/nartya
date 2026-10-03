import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ImagePlus,
  Loader2,
  Play,
  Send,
  Wrench,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Avatar } from "@/components/ui/Avatar";
import { avatarUrl } from "@/api/profile";
import RoleBadge from "@/components/profile/RoleBadge";
import { bugCategoryLabel } from "@/utils/bugCategories";
import AttachmentThumb from "./AttachmentThumb";
import Lightbox from "./Lightbox";

const TEAM_ROLES = new Set(["staff", "admin"]);
const MAX_FILES = 4;
const MAX_FILE_MB = 5;

const STATUS_META = {
  open: { label: "Ouvert", cls: "bg-primary/10 text-primary" },
  handled: { label: "Pris en charge", cls: "bg-sky-400/10 text-sky-300" },
  resolved: { label: "Résolu", cls: "bg-emerald-400/10 text-emerald-300" },
  rejected: { label: "Non retenu", cls: "bg-white/[0.06] text-muted" },
};

function messageTime(value) {
  try {
    return format(new Date(value), "HH:mm", { locale: fr });
  } catch {
    return "";
  }
}

function contextLabel(ctx) {
  if (!ctx) return null;
  const title = ctx.title || ctx.slug;
  if (ctx.kind === "scan") {
    const parts = [title, ctx.oeuvre].filter(Boolean);
    if (ctx.chapter != null) parts.push(`Chapitre ${ctx.chapter}`);
    return parts.join(" · ");
  }
  const parts = [title, ctx.season, ctx.episode != null ? `Épisode ${ctx.episode}` : null].filter(Boolean);
  return parts.join(" · ");
}

/** Prise en charge, résolution, réouverture. */
function SystemMessage({ message }) {
  return (
    <div className="mx-auto w-fit max-w-[85%] self-center rounded border border-border/70 bg-surface/40 px-2.5 py-1 text-center text-[0.72rem] text-muted">
      {message.body}
    </div>
  );
}

function MessageBubble({ message, onOpenImage }) {
  if (message.authorRole === "system") return <SystemMessage message={message} />;

  const fromTeam = TEAM_ROLES.has(message.authorRole);
  const alignRight = !fromTeam;

  return (
    <div className={`flex gap-2.5 ${alignRight ? "flex-row-reverse self-end" : "self-start"}`}>
      <Avatar
        src={avatarUrl(message.authorAvatar)}
        name={message.authorName}
        className={`mt-5 h-8 w-8 shrink-0 rounded-full ring-1 ${
          fromTeam ? "ring-primary/45" : "ring-border"
        }`}
        textClassName="text-xs"
      />
      <div className={`max-w-[min(38rem,82vw)] ${alignRight ? "items-end" : "items-start"}`}>
        <div className={`mb-1 flex items-center gap-2 ${alignRight ? "justify-end" : ""}`}>
          <span className="text-xs font-semibold text-text/90">{message.authorName}</span>
          {fromTeam && <RoleBadge role={message.authorRole} />}
          <span className="text-[0.65rem] tabular-nums text-muted/60">
            {messageTime(message.createdAt)}
          </span>
        </div>
        {message.attachments?.length > 0 && (
          <div className={`mb-1.5 flex flex-wrap gap-1.5 ${alignRight ? "justify-end" : ""}`}>
            {message.attachments.map((a) => (
              <AttachmentThumb key={a.path} path={a.path} onOpen={onOpenImage} size="h-16 w-16" />
            ))}
          </div>
        )}
        {message.body && (
          <div
            className={`whitespace-pre-wrap break-words rounded-lg px-4 py-3 text-sm leading-relaxed shadow-sm ${
              fromTeam
                ? "rounded-tl-sm border border-primary/25 bg-primary/[0.08] text-text"
                : "rounded-tr-sm border border-border/70 bg-surface-2/80 text-text/90"
            }`}
          >
            {message.body}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportConversation({ report, messages, loading, sending, onSend }) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const active = report && ["open", "handled"].includes(report.status);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, report?.reportId]);

  // On repart de "auto" avant de mesurer, sinon `scrollHeight` ne redescendrait pas. Revenir sur
  // une conversation remonte un textarea neuf : d'où `active` et le reportId dans les deps.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body, active, report?.reportId]);

  // Révoqué à chaque changement de sélection.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setFilePreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const pickFiles = (list) => {
    const next = [...files];
    for (const f of Array.from(list || [])) {
      if (next.length >= MAX_FILES) break;
      if (!f.type.startsWith("image/")) continue;
      if (f.size > MAX_FILE_MB * 1024 * 1024) continue;
      next.push(f);
    }
    setFiles(next);
  };

  const submit = async () => {
    const value = body.trim();
    if ((!value && !files.length) || sending || !active) return;
    try {
      await onSend(value, files);
      setBody("");
      setFiles([]);
      textareaRef.current?.focus();
    } catch {
      // Le parent affiche l'erreur ; le brouillon est gardé.
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  if (!report) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-bg/20 px-6 text-center">
        <div>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] text-muted ring-1 ring-border">
            <Wrench size={20} />
          </div>
          <p className="mt-4 text-sm font-semibold text-text">Sélectionne un signalement</p>
          <p className="mt-1 text-xs text-muted">La conversation apparaîtra ici.</p>
        </div>
      </div>
    );
  }

  const status = STATUS_META[report.status] || STATUS_META.open;
  const ctxLabel = contextLabel(report.context);

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-bg/20">
      <header className="flex min-h-[4.5rem] flex-col justify-center gap-1.5 border-b border-border/70 bg-surface/55 px-4 py-2.5 backdrop-blur-xl sm:px-5">
        <div className="flex items-center gap-2">
          <span
            className={`shrink-0 rounded-[4px] px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-kana ${status.cls}`}
          >
            {status.label}
          </span>
          <span className="shrink-0 rounded-[4px] bg-white/[0.05] px-2 py-0.5 text-[0.62rem] font-semibold text-muted">
            {bugCategoryLabel(report.category)}
          </span>
          <span className="truncate text-xs text-muted">
            {report.handledBy ? `Pris en charge par ${report.handledBy}` : "En attente de l’équipe"}
          </span>
        </div>
        {ctxLabel && (
          <div className="flex items-center gap-1.5 text-xs text-muted/80">
            {report.context?.kind === "scan" ? <BookOpen size={12} /> : <Play size={12} />}
            <span className="truncate">{ctxLabel}</span>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={22} className="animate-spin text-primary" />
          </div>
        ) : messages.length ? (
          <div className="mx-auto flex max-w-5xl flex-col gap-5">
            {messages.map((message) => (
              <MessageBubble key={message.messageId} message={message} onOpenImage={setLightbox} />
            ))}
            <div ref={bottomRef} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Aucun message dans cette conversation.
          </div>
        )}
      </div>

      <footer className="border-t border-border/70 bg-surface/65 p-3 backdrop-blur-xl sm:p-4">
        {active ? (
          <div className="mx-auto max-w-5xl">
            {files.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="relative">
                    <img
                      src={filePreviews[i]}
                      alt=""
                      className="h-14 w-14 rounded-md object-cover ring-1 ring-border"
                    />
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/20"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-1 rounded-md border border-border bg-bg/60 p-2 shadow-[0_-12px_35px_-28px_rgba(0,0,0,0.9)] focus-within:border-primary/45">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  pickFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={files.length >= MAX_FILES}
                title="Ajouter une capture d'écran"
                // Le bouton reste en haut quand le textarea grandit.
                className="flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-text disabled:opacity-30"
              >
                <ImagePlus size={17} />
              </button>
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={onKeyDown}
                maxLength={4000}
                rows={1}
                placeholder="Écris ton message à l’équipe…"
                className="min-h-10 max-h-64 flex-1 resize-none overflow-y-auto bg-transparent py-2.5 pl-0.5 pr-2 text-sm leading-5 text-text outline-none placeholder:text-muted/55"
              />
              <button
                type="button"
                onClick={submit}
                disabled={(!body.trim() && !files.length) || sending}
                aria-label="Envoyer le message"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-fg transition-transform hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl rounded-md border border-border bg-white/[0.03] px-4 py-3 text-center text-sm text-muted">
            {report.status === "rejected"
              ? "Ce signalement n'a pas été retenu. Ouvre-en un nouveau si le problème persiste."
              : "Ce signalement est résolu. Ouvre un nouveau signalement si tu rencontres un autre problème."}
          </div>
        )}
      </footer>

      <Lightbox url={lightbox} onClose={() => setLightbox(null)} />
    </section>
  );
}
