import { Fragment, type ReactNode } from "react";

/**
 * Exibe o texto com a formatação do WhatsApp aplicada, mantendo os caracteres
 * de marcação visíveis (bem claros), como no WhatsApp Web ao editar:
 *   *negrito*  _itálico_  ~tachado~  `código`  ```bloco```  > citação  - lista  1. lista
 * Links ficam clicáveis.
 */

const Mark = ({ children }: { children: ReactNode }) => (
  <span className="select-none font-normal not-italic text-current opacity-35 [text-decoration:none]">{children}</span>
);

type Rule = { open: string; close: string; render: (inner: ReactNode, key: number) => ReactNode; raw?: boolean };

const RULES: Rule[] = [
  { open: "```", close: "```", raw: true, render: (i, k) => <code key={k} className="rounded bg-black/5 px-1 font-mono text-[0.92em]">{i}</code> },
  { open: "`", close: "`", raw: true, render: (i, k) => <code key={k} className="rounded bg-black/5 px-1 font-mono text-[0.92em]">{i}</code> },
  { open: "*", close: "*", render: (i, k) => <strong key={k} className="font-semibold">{i}</strong> },
  { open: "_", close: "_", render: (i, k) => <em key={k}>{i}</em> },
  { open: "~", close: "~", render: (i, k) => <s key={k}>{i}</s> },
];

const URL_RE = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/y;
const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

let keySeq = 0;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push(buf);
    buf = "";
  };
  let i = 0;
  while (i < text.length) {
    // links
    if (text.startsWith("http", i) && !isWord(text[i - 1])) {
      URL_RE.lastIndex = i;
      const m = URL_RE.exec(text);
      if (m) {
        flush();
        out.push(
          <a key={keySeq++} href={m[0]} target="_blank" rel="noreferrer" className="break-all text-brand-700 underline underline-offset-2">
            {m[0]}
          </a>
        );
        i += m[0].length;
        continue;
      }
    }
    let matched = false;
    for (const r of RULES) {
      if (!text.startsWith(r.open, i)) continue;
      // abre só se não estiver colado em letra/número antes, e o conteúdo não começar com espaço
      if (isWord(text[i - 1])) continue;
      const start = i + r.open.length;
      if (!text[start] || /\s/.test(text[start])) continue;
      let end = text.indexOf(r.close, start + 1);
      while (end !== -1 && (/\s/.test(text[end - 1]) || isWord(text[end + r.close.length]))) end = text.indexOf(r.close, end + 1);
      if (end === -1) continue;
      const inner = text.slice(start, end);
      if (!r.raw && inner.includes("\n")) continue;
      flush();
      out.push(
        <Fragment key={keySeq++}>
          <Mark>{r.open}</Mark>
          {r.render(r.raw ? inner : inline(inner), keySeq++)}
          <Mark>{r.close}</Mark>
        </Fragment>
      );
      i = end + r.close.length;
      matched = true;
      break;
    }
    if (!matched) buf += text[i++];
  }
  flush();
  return out;
}

export function WhatsappText({ text }: { text: string }) {
  // blocos ``` multilinha primeiro
  const parts = text.split(/(```[\s\S]+?```)/g);
  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, pi) => {
        if (part.startsWith("```") && part.endsWith("```") && part.length > 6)
          return (
            <pre key={pi} className="my-1 overflow-x-auto rounded-lg bg-black/5 px-2 py-1.5 font-mono text-[0.9em]">
              <Mark>```</Mark>
              {part.slice(3, -3)}
              <Mark>```</Mark>
            </pre>
          );
        const lines = part.split("\n");
        return lines.map((line, li) => {
          const k = `${pi}-${li}`;
          const nl = li < lines.length - 1 ? "\n" : null;
          let m: RegExpMatchArray | null;
          if ((m = line.match(/^>\s?(.*)$/)))
            return (
              <span key={k} className="my-0.5 block border-l-[3px] border-current/30 pl-2 opacity-80">
                <Mark>&gt; </Mark>
                {inline(m[1])}
              </span>
            );
          if ((m = line.match(/^([-*•])\s+(.*)$/)))
            return (
              <span key={k} className="block pl-1">
                <span className="mr-1.5 opacity-60">•</span>
                {inline(m[2])}
              </span>
            );
          if ((m = line.match(/^(\d+)\.\s+(.*)$/)))
            return (
              <span key={k} className="block pl-1">
                <span className="mr-1.5 tabular-nums opacity-60">{m[1]}.</span>
                {inline(m[2])}
              </span>
            );
          return (
            <Fragment key={k}>
              {inline(line)}
              {nl}
            </Fragment>
          );
        });
      })}
    </div>
  );
}
