export function chunkByParagraphs(
  text: string,
  opts: { maxChars: number; overlapChars: number },
): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const paras = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let buf = "";
  const flush = () => {
    const t = buf.trim();
    if (t) out.push(t);
    buf = "";
  };
  for (const p of paras) {
    if ((buf + "\n\n" + p).length > opts.maxChars && buf) {
      flush();
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
    if (buf.length > opts.maxChars) {
      for (let i = 0; i < buf.length; i += opts.maxChars - opts.overlapChars) {
        out.push(buf.slice(i, i + opts.maxChars));
      }
      buf = "";
    }
  }
  flush();
  return dedupeChunks(out);
}

export function dedupeChunks(chunks: string[]): string[] {
  const seen = new Set<string>();
  const res: string[] = [];
  for (const c of chunks) {
    const key = c.replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    res.push(c);
  }
  return res;
}
