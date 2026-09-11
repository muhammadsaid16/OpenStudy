"use client";

import { Fragment, type ReactNode, type ElementType } from "react";

// ─── Tiny, dependency-free Markdown renderer ─────────────────
// Supports: headings (#..######), bold **x**, italic *x*, inline code
// `x`, code blocks ```...```, links [t](u), unordered lists (- / *),
// ordered lists (1.), blockquotes (>), and line breaks. Escapes HTML.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/[^\\)]*|\.\.?\/[^\s)]*|data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+)\)/gi,
    '<img src="$2" alt="$1" class="md-img" loading="lazy" style="max-width:100%;height:auto;border-radius:4px;" />'
  );
  s = s.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>'
  );
  return s;
}

export function Markdown({ content, className, align }: { content: string; className?: string; align?: "inherit" | "right" | "center" }) {
  const hasArabic = /[ـ-\u06FF]/.test(content ?? "");
  const outerDir = hasArabic ? ("rtl" as const) : undefined;
  const normalized = (content ?? "")
    .replace(/<\/?br\s*\/?>/gi, "\n")
    // pre-escaped variants (&lt;/br&gt;) — '\/?' NOT '\/\?' (that typo
    // required a literal '?' char and matched nothing, ever)
    .replace(/&lt;\/?br\s*\/?&gt;/gi, "\n")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/<\/?div[^>]*>/gi, "\n")
    .replace(/<\/?p[^>]*>/gi, "\n")
    .replace(/\u00A0/g, " ");
  const lines = normalized.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        <pre key={key++} className="md-pre">
          <code>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const Tag = (`h${level}`) as ElementType;
      blocks.push(
        <Tag key={key++} className={`md-h md-h${level}`} dangerouslySetInnerHTML={{ __html: renderInline(text) }} />
      );
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={key++} className="md-quote" dangerouslySetInnerHTML={{ __html: quote.map((l) => renderInline(l)).join("<br/>") }} />
      );
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="md-ul">
          {items.map((it, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: renderInline(it) }} />
          ))}
        </ul>
      );
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="md-ol">
          {items.map((it, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: renderInline(it) }} />
          ))}
        </ol>
      );
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !lines[i].startsWith(">") &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="md-p" dangerouslySetInnerHTML={{ __html: para.map((l) => renderInline(l)).join("<br/>") }} />
    );
  }

  return <div dir={outerDir} className={className} style={hasArabic ? ({ unicodeBidi: "plaintext", textAlign: align ?? "right" } as React.CSSProperties) : undefined}>{blocks.map((b, idx) => <Fragment key={idx}>{b}</Fragment>)}</div>;
}
