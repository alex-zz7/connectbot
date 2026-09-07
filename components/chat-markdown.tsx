import type { ReactNode } from "react";

// ============================================================
// Renders the light markdown chat messages carry (numbered steps, headings,
// **bold**, `code`, links) the same way public/relay.js does for visitors,
// so the owner's inbox shows the message as the visitor saw it. React
// elements only — no innerHTML — so the text is never interpreted as HTML.
// ============================================================

const INLINE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)|\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${n++}`;
    if (m[1] && m[2]) {
      out.push(<a key={k} href={m[2]} target="_blank" rel="noopener noreferrer" className="underline">{m[1]}</a>);
    } else if (m[3]) {
      out.push(<a key={k} href={m[3]} target="_blank" rel="noopener noreferrer" className="underline break-all">{m[3]}</a>);
    } else if (m[4]) {
      out.push(<b key={k}>{m[4]}</b>);
    } else if (m[5]) {
      out.push(<code key={k} className="rounded bg-black/10 px-1 py-px font-mono text-[12px]">{m[5]}</code>);
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function ChatMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let gap = false;
  lines.forEach((line, i) => {
    if (!line.trim() || /^\s*([-*_]\s*){3,}$/.test(line)) {
      gap = true;
      return;
    }
    const spacing = gap && blocks.length ? " mt-2" : "";
    gap = false;
    let m: RegExpExecArray | null;
    if ((m = /^#{1,6}\s+(.*)$/.exec(line))) {
      blocks.push(<p key={i} className={`font-bold whitespace-pre-wrap${spacing}`}>{inline(m[1], String(i))}</p>);
    } else if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) {
      blocks.push(
        <p key={i} className={`flex gap-1.5${spacing}`}>
          <span className="shrink-0 min-w-[14px] text-right">•</span>
          <span className="min-w-0 whitespace-pre-wrap">{inline(m[1], String(i))}</span>
        </p>,
      );
    } else if ((m = /^\s*(\d{1,2})[.)]\s+(.*)$/.exec(line))) {
      blocks.push(
        <p key={i} className={`flex gap-1.5${spacing}`}>
          <span className="shrink-0 min-w-[14px] text-right">{m[1]}.</span>
          <span className="min-w-0 whitespace-pre-wrap">{inline(m[2], String(i))}</span>
        </p>,
      );
    } else {
      blocks.push(<p key={i} className={`whitespace-pre-wrap${spacing}`}>{inline(line, String(i))}</p>);
    }
  });
  return <>{blocks}</>;
}
