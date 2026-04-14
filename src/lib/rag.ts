import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { embedText } from "@/lib/embeddings";

export type RetrievedChunk = {
  id: number;
  source: "wiki" | "raw";
  docId: string;
  title: string;
  sectionPath: string | null;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
};

export type GateDebug = {
  wikiTop: number;
  wikiSecond?: number;
  wikiMargin?: number;
  wikiConfidenceOK: boolean;
  rawTop: number;
  rawConfidenceOK: boolean;
  wikiThreshold: number;
  rawThreshold: number;
  marginMin: number;
};

export type TwoStageResult = {
  wikiChunks: RetrievedChunk[];
  rawChunks: RetrievedChunk[];
  debug: GateDebug;
};

function envNum(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export async function twoStageRetrieve(query: string): Promise<TwoStageResult> {
  const wikiThreshold = envNum("WIKI_MATCH_THRESHOLD", 0.28);
  const rawThreshold = envNum("RAW_MATCH_THRESHOLD", 0.25);
  const marginMin = envNum("WIKI_MARGIN_MIN", 0.02);

  const supabase = getSupabaseAdmin();
  const vector = await embedText(query);

  const { data: wikiRows, error: wErr } = await supabase.rpc("match_wiki_chunks", {
    query_embedding: vector,
    match_threshold: Math.max(0, wikiThreshold - 0.15),
    match_count: 8,
  });
  if (wErr) throw wErr;

  const wiki = (wikiRows ?? []) as Array<{
    id: number;
    doc_id: string;
    title: string;
    section_path: string | null;
    content: string;
    metadata: Record<string, unknown> | null;
    similarity: number;
  }>;

  const wikiChunks: RetrievedChunk[] = wiki.map((r) => ({
    id: r.id,
    source: "wiki" as const,
    docId: r.doc_id,
    title: r.title,
    sectionPath: r.section_path,
    content: r.content,
    similarity: r.similarity,
    metadata: r.metadata ?? {},
  }));

  const top1 = wikiChunks[0]?.similarity ?? 0;
  const top2 = wikiChunks[1]?.similarity ?? 0;
  const margin = top1 - top2;
  const wikiConfidenceOK =
    top1 >= wikiThreshold && (wikiChunks.length < 2 || margin >= marginMin);

  let rawChunks: RetrievedChunk[] = [];
  let rawTop: number | undefined;
  let rawConfidenceOK = false;

  if (!wikiConfidenceOK) {
    const { data: rawRows, error: rErr } = await supabase.rpc("match_raw_chunks", {
      query_embedding: vector,
      match_threshold: Math.max(0, rawThreshold - 0.12),
      match_count: 8,
    });
    if (rErr) throw rErr;
    const raw = (rawRows ?? []) as typeof wiki;
    rawChunks = raw.map((r) => ({
      id: r.id,
      source: "raw" as const,
      docId: r.doc_id,
      title: r.title,
      sectionPath: r.section_path,
      content: r.content,
      similarity: r.similarity,
      metadata: r.metadata ?? {},
    }));
    rawTop = rawChunks[0]?.similarity ?? 0;
    rawConfidenceOK = !!rawTop && rawTop >= rawThreshold;
  }

  const debug: GateDebug = {
    wikiTop: top1,
    wikiSecond: wikiChunks[1]?.similarity,
    wikiMargin: margin,
    wikiConfidenceOK,
    rawTop: rawTop ?? 0,
    rawConfidenceOK,
    wikiThreshold,
    rawThreshold,
    marginMin,
  };

  return {
    wikiChunks: wikiConfidenceOK ? wikiChunks.slice(0, 5) : wikiChunks.slice(0, 3),
    rawChunks: rawConfidenceOK ? rawChunks.slice(0, 5) : rawChunks.slice(0, 3),
    debug,
  };
}

export function buildContextBlock(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c, i) => {
      const path = c.sectionPath ? `${c.title} / ${c.sectionPath}` : c.title;
      return `[#${i + 1} source=${c.source} id=${c.id} path="${path}"]\n${c.content}`;
    })
    .join("\n\n---\n\n");
}
