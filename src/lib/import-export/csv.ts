// Central CSV import/export for cards (5.2) — one parser/writer for all pages.
export type CardRow = { front: string; back: string; frontDescription?: string; backDescription?: string };

export function toCsv(rows: CardRow[]): string {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const header = ["front","back","frontDescription","backDescription"].map(esc).join(",");
  const lines = rows.map((r) => [r.front, r.back, r.frontDescription ?? "", r.backDescription ?? ""].map(esc).join(","));
  return [header, ...lines].join("\n");
}

export function fromCsv(text: string): CardRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out;
  };
  const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes("front") && header.includes("back");
  const start = hasHeader ? 1 : 0;
  const fi = hasHeader ? header.indexOf("front") : 0;
  const bi = hasHeader ? header.indexOf("back") : 1;
  const fdi = hasHeader ? header.indexOf("frontdescription") : 2;
  const bdi = hasHeader ? header.indexOf("backdescription") : 3;
  const rows: CardRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const front = (cols[fi] ?? "").trim();
    const back = (cols[bi] ?? "").trim();
    if (!front || !back) continue;
    if (front.length > 2000 || back.length > 5000) continue;
    rows.push({ front, back, frontDescription: cols[fdi]?.trim() || undefined, backDescription: cols[bdi]?.trim() || undefined });
  }
  return rows;
}
