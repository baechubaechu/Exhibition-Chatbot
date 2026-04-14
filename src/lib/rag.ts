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

/** 원문 RPC 직전에 호출(스트림에 상태 푸시 등). */
export type TwoStageRetrieveHooks = {
  onBeforeRawSearch?: () => void | Promise<void>;
};

function envNum(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 임베딩 검색에만 사용. 인사·짧은 구어 질문이 위키 제목/용어와 벡터상 멀어지는 경우를 줄임.
 * (채팅 본문에는 원문 질문 그대로 둠)
 */
export function augmentQueryForRetrieval(query: string): string {
  let t = query
    .trim()
    .replace(/^(안녕하세요|안녕[\s,.!?하세요]*|반가워|하이|헬로|hi|hello)[\s,.!?]*/i, "")
    .trim();
  if (!t) t = query.trim();

  const short = t.length <= 80;
  const soundsLikeWhatIsThis =
    /작품|프로젝트|전시|뭐야|뭔가요|뭔\s*데|소개|소개해|어떤\s*거|무슨\s*거|무엇|이거|이건|이\s*작품|이게|뭐\s*냐|뭐에요|한\s*줄|줄로\s*소개/.test(
      t,
    );
  const alreadySpecific =
    /매싱|마싱|레이어|노드|층위|단면|평면|입면|gtx|산본천|환승|보행|동선|금정역\s*역사|크리틱|비평|이론|virilio|pallasmaa/i.test(
      t,
    );

  if (short && soundsLikeWhatIsThis && !alreadySpecific) {
    return `${t}\n\n## 프로젝트 한 줄 요약\n금정역 일대 extra space 공공공간 전시 개요 졸업설계`;
  }
  return t;
}

type WikiRpcRow = {
  id: number;
  doc_id: string;
  title: string;
  section_path: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
};

function rowsToWikiChunks(rows: WikiRpcRow[]): RetrievedChunk[] {
  return rows.map((r) => ({
    id: r.id,
    source: "wiki" as const,
    docId: r.doc_id,
    title: r.title,
    sectionPath: r.section_path,
    content: r.content,
    similarity: r.similarity,
    metadata: r.metadata ?? {},
  }));
}

function rowsToRawChunks(rows: WikiRpcRow[]): RetrievedChunk[] {
  return rows.map((r) => ({
    id: r.id,
    source: "raw" as const,
    docId: r.doc_id,
    title: r.title,
    sectionPath: r.section_path,
    content: r.content,
    similarity: r.similarity,
    metadata: r.metadata ?? {},
  }));
}

/** 동일 청크 id는 더 높은 유사도만 유지해 병합 후 정렬 */
function mergeWikiRpcRows(a: WikiRpcRow[], b: WikiRpcRow[]): WikiRpcRow[] {
  const map = new Map<number, WikiRpcRow>();
  for (const row of [...a, ...b]) {
    const prev = map.get(row.id);
    if (!prev || row.similarity > prev.similarity) map.set(row.id, row);
  }
  return [...map.values()].sort((x, y) => y.similarity - x.similarity);
}

/**
 * 짧은「한 줄 소개」「이 작품」류는 임베딩만으로는 개요 청크와 코사인이 낮게 나오는 경우가 있어,
 * 위키에 실제로 있는 제목 문구가 들어간 청크에만 소폭 가산(게이트 통과용, 순서 재정렬).
 */
function applyOverviewIntroBoost(query: string, chunks: RetrievedChunk[]): RetrievedChunk[] {
  const q = query.trim();
  if (!/한\s*줄|줄로\s*소개|한줄|이\s*작품|작품을|소개해\s*줘|소개해줘/i.test(q)) {
    return chunks;
  }
  const boost = envNum("WIKI_INTRO_SECTION_BOOST", 0.12);
  return chunks
    .map((c) => {
      if (!/프로젝트\s*한\s*줄\s*요약|#\s*프로젝트\s*개요/.test(c.content)) return c;
      const bumped = Math.min(1, c.similarity + boost);
      if (bumped === c.similarity) return c;
      return {
        ...c,
        similarity: bumped,
        metadata: { ...c.metadata, introSectionBoost: true },
      };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

export async function twoStageRetrieve(
  query: string,
  hooks?: TwoStageRetrieveHooks,
): Promise<TwoStageResult> {
  const wikiThreshold = envNum("WIKI_MATCH_THRESHOLD", 0.21);
  const rawThreshold = envNum("RAW_MATCH_THRESHOLD", 0.2);
  const marginMin = envNum("WIKI_MARGIN_MIN", 0.018);

  const supabase = getSupabaseAdmin();
  const trimmed = query.trim();
  const retrievalQuery = augmentQueryForRetrieval(query);

  /** SQL 단계에서는 넓게 후보를 가져오고, 확신 여부는 아래 top1·마진으로 판단 */
  const wikiRecallFloor = envNum("WIKI_RECALL_FLOOR", 0.05);
  const rawRecallFloor = envNum("RAW_RECALL_FLOOR", 0.05);
  const matchCount = Math.max(8, Math.floor(envNum("WIKI_MATCH_COUNT", 12)));

  const short = trimmed.length <= 80;
  const soundsOverview =
    /작품|프로젝트|전시|소개|소개해|이\s*작품|한\s*줄|줄로\s*소개/.test(trimmed) &&
    !/매싱|마싱|레이어|노드|층위|단면|평면|입면|gtx|산본천|환승|보행|동선|금정역\s*역사|크리틱|비평|이론|virilio|pallasmaa/i.test(
      trimmed,
    );
  const useDualEmbed = short && soundsOverview;

  let wikiRows: WikiRpcRow[];
  let rawQueryVector: number[];

  const rpcRaw = (vec: number[]) =>
    supabase.rpc("match_raw_chunks", {
      query_embedding: vec,
      match_threshold: rawRecallFloor,
      match_count: matchCount,
    });

  if (useDualEmbed) {
    const [vecRaw, vecAug] = await Promise.all([embedText(trimmed), embedText(retrievalQuery)]);
    rawQueryVector = vecAug;
    const [resA, resB] = await Promise.all([
      supabase.rpc("match_wiki_chunks", {
        query_embedding: vecRaw,
        match_threshold: wikiRecallFloor,
        match_count: matchCount,
      }),
      supabase.rpc("match_wiki_chunks", {
        query_embedding: vecAug,
        match_threshold: wikiRecallFloor,
        match_count: matchCount,
      }),
    ]);
    if (resA.error) throw resA.error;
    if (resB.error) throw resB.error;
    wikiRows = mergeWikiRpcRows((resA.data ?? []) as WikiRpcRow[], (resB.data ?? []) as WikiRpcRow[]);
  } else {
    rawQueryVector = await embedText(retrievalQuery);
    const wRes = await supabase.rpc("match_wiki_chunks", {
      query_embedding: rawQueryVector,
      match_threshold: wikiRecallFloor,
      match_count: matchCount,
    });
    if (wRes.error) throw wRes.error;
    wikiRows = (wRes.data ?? []) as WikiRpcRow[];
  }

  const wikiChunks = applyOverviewIntroBoost(trimmed, rowsToWikiChunks(wikiRows));

  const top1 = wikiChunks[0]?.similarity ?? 0;
  const top2 = wikiChunks[1]?.similarity ?? 0;
  const margin = top1 - top2;
  const sameDocTop2 =
    wikiChunks.length >= 2 && wikiChunks[0]!.docId === wikiChunks[1]!.docId;
  const marginMinEff = sameDocTop2 ? marginMin * 0.55 : marginMin;
  const secondIsNotCompetitive =
    wikiChunks.length < 2 || top2 < wikiThreshold - 0.06 || top2 < top1 - 0.035;
  const wikiConfidenceOK =
    top1 >= wikiThreshold && (secondIsNotCompetitive || margin >= marginMinEff);

  let rawChunks: RetrievedChunk[] = [];
  let rawTop = 0;
  let rawConfidenceOK = false;

  if (!wikiConfidenceOK) {
    await hooks?.onBeforeRawSearch?.();
    const rawRes = await rpcRaw(rawQueryVector);
    if (rawRes.error) throw rawRes.error;
    rawChunks = rowsToRawChunks((rawRes.data ?? []) as WikiRpcRow[]);
    rawTop = rawChunks[0]?.similarity ?? 0;
    rawConfidenceOK = !!rawTop && rawTop >= rawThreshold;
  }

  const debug: GateDebug = {
    wikiTop: top1,
    wikiSecond: wikiChunks[1]?.similarity,
    wikiMargin: margin,
    wikiConfidenceOK,
    rawTop,
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
