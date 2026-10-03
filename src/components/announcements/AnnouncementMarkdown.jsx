import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { platform } from "@/platform";

/**
 * HTML brut refusé (`skipHtml`). Deux ajouts hors CommonMark, le spoiler `||texte||` et le
 * souligné `__texte__`, encodés avant le parse par des sentinelles (zone privée Unicode) ;
 * le plugin remark les retransforme en nœuds.
 */

const U_OPEN = String.fromCharCode(0xE000);
const U_CLOSE = String.fromCharCode(0xE001);
const S_OPEN = String.fromCharCode(0xE002);
const S_CLOSE = String.fromCharCode(0xE003);
const C_OPEN = String.fromCharCode(0xE010);
const C_CLOSE = String.fromCharCode(0xE011);
// Orphelines, effacées avant rendu.
const STRAY = new RegExp("[" + U_OPEN + "-" + C_CLOSE + "]", "g");

function encodeDiscordExtras(src) {
  const code = [];
  // 1) Code mis de côté
  let s = src.replace(/```[\s\S]*?```|`[^`\n]*`/g, (m) => {
    code.push(m);
    return `${C_OPEN}${code.length - 1}${C_CLOSE}`;
  });
  // 2) Souligné puis spoiler
  s = s.replace(/__(.+?)__/g, (_, t) => `${U_OPEN}${t}${U_CLOSE}`);
  s = s.replace(/\|\|(.+?)\|\|/g, (_, t) => `${S_OPEN}${t}${S_CLOSE}`);
  // 3) Code restauré
  s = s.replace(new RegExp(`${C_OPEN}(\\d+)${C_CLOSE}`, "g"), (_, i) => code[+i]);
  return s;
}

/** En nœuds mdast. */
function tokenize(value) {
  const out = [];
  const re = new RegExp(
    `${U_OPEN}([\\s\\S]*?)${U_CLOSE}|${S_OPEN}([\\s\\S]*?)${S_CLOSE}`,
    "g"
  );
  let last = 0;
  let m;
  while ((m = re.exec(value))) {
    if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index).replace(STRAY, "") });
    if (m[1] !== undefined) {
      out.push({ type: "emphasis", data: { hName: "u" }, children: [{ type: "text", value: m[1] }] });
    } else {
      out.push({
        type: "emphasis",
        data: { hName: "nzspoiler" },
        children: [{ type: "text", value: m[2] }],
      });
    }
    last = re.lastIndex;
  }
  if (last < value.length) out.push({ type: "text", value: value.slice(last).replace(STRAY, "") });
  return out;
}

function remarkDiscordExtras() {
  const walk = (node) => {
    if (!node.children) return;
    const next = [];
    for (const child of node.children) {
      if (child.type === "text" && (child.value.includes(U_OPEN) || child.value.includes(S_OPEN))) {
        next.push(...tokenize(child.value));
      } else {
        walk(child);
        next.push(child);
      }
    }
    node.children = next;
  };
  return (tree) => walk(tree);
}

function safeHref(href) {
  return typeof href === "string" && /^(https?:\/\/|nartya:\/\/)/i.test(href) ? href : null;
}

function Spoiler({ children }) {
  const [shown, setShown] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setShown(true)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setShown(true)}
      className={
        "cursor-pointer rounded px-1 transition-colors " +
        (shown ? "bg-white/10 text-text" : "select-none bg-white/15 text-transparent hover:bg-white/20")
      }
      style={shown ? undefined : { textShadow: "0 0 8px rgba(255,255,255,0.55)" }}
      title={shown ? undefined : "Cliquer pour révéler"}
    >
      {children}
    </span>
  );
}

const COMPONENTS = {
  a({ href, children }) {
    const safe = safeHref(href);
    if (!safe) return <span className="text-muted">{children}</span>;
    return (
      <a
        href={safe}
        onClick={(e) => {
          e.preventDefault();
          platform.openExternal(safe);
        }}
        className="text-primary underline underline-offset-2 hover:text-primary/80"
      >
        {children}
      </a>
    );
  },
  p: ({ children }) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-1.5 mt-2 font-display text-lg font-bold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1.5 mt-2 font-display text-base font-bold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-bold first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-primary/50 pl-3 text-muted">{children}</blockquote>
  ),
  code: ({ inline, children }) =>
    inline ? (
      <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
    ) : (
      <code className="font-mono text-[0.85em]">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-black/40 p-3 ring-1 ring-border">{children}</pre>
  ),
  strong: ({ children }) => <strong className="font-bold text-text">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="opacity-70">{children}</del>,
  hr: () => <hr className="my-3 border-border" />,
  u: ({ children }) => <u className="underline underline-offset-2">{children}</u>,
  nzspoiler: ({ children }) => <Spoiler>{children}</Spoiler>,
};

/** @param {{ children: string, className?: string }} props `children` = markdown brut */
export default function AnnouncementMarkdown({ children, className = "" }) {
  const source = typeof children === "string" ? encodeDiscordExtras(children) : "";
  return (
    <div className={"text-sm text-text/90 [word-break:break-word] " + className}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkDiscordExtras]}
        components={COMPONENTS}
        skipHtml
      >
        {source}
      </Markdown>
    </div>
  );
}
