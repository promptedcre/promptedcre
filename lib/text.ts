// A tiny, safe inline formatter for instruction text: `code`, **strong** and
// [label](https://link). Everything else is plain text; no HTML is ever parsed.

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; v: string }
  | { t: "link"; v: string; href: string };

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;
  let last = 0;
  for (const m of source.matchAll(re)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ t: "text", v: source.slice(last, index) });
    if (m[1] !== undefined) out.push({ t: "code", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "strong", v: m[2] });
    else if (m[3] !== undefined && m[4] !== undefined) out.push({ t: "link", v: m[3], href: m[4] });
    last = index + m[0].length;
  }
  if (last < source.length) out.push({ t: "text", v: source.slice(last) });
  return out;
}

export function paragraphs(source: string): string[] {
  return source
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
