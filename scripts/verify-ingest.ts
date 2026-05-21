import { loadEnv } from "./loadEnv";
import { getSupabaseAdmin } from "../src/lib/supabaseAdmin";

loadEnv();

const WIKI_TARGETS = [
  "canonical/07_theory",
  "canonical/09_critic_faq",
  "canonical/12_exhibition",
  "canonical/00_project_overview",
];

/** ingest:raw 가 저장하는 doc_id = `raw:` + sources/... 경로 */
const RAW_TARGETS = [
  "raw:sources/chatgpt/아이저드_감정_중요성_대화추출",
  "raw:sources/chatgpt/건축현상학_연결점_찾기_대화추출",
  "raw:sources/chatgpt/프로젝트_비판적_크리틱_대화추출",
];

async function countTable(table: "wiki_chunks" | "raw_chunks") {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function docStats(table: "wiki_chunks" | "raw_chunks", docId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(table)
    .select("id, created_at, content")
    .eq("doc_id", docId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const latest = rows[0]?.created_at ?? null;
  const preview = (rows[0]?.content ?? "").slice(0, 120).replace(/\s+/g, " ");
  return { chunks: rows.length, latest, preview };
}

async function distinctDocCount(table: "wiki_chunks" | "raw_chunks") {
  const supabase = getSupabaseAdmin();
  const pageSize = 1000;
  const ids = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("doc_id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) ids.add(row.doc_id);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return ids.size;
}

async function main() {
  const wikiTotal = await countTable("wiki_chunks");
  const rawTotal = await countTable("raw_chunks");
  const wikiDocs = await distinctDocCount("wiki_chunks");
  const rawDocs = await distinctDocCount("raw_chunks");

  console.log("=== Supabase ingest snapshot ===");
  console.log(`wiki_chunks: ${wikiTotal} rows, ${wikiDocs} distinct doc_id`);
  console.log(`raw_chunks:  ${rawTotal} rows, ${rawDocs} distinct doc_id`);
  console.log("");

  console.log("--- wiki (canonical) targets ---");
  for (const docId of WIKI_TARGETS) {
    const s = await docStats("wiki_chunks", docId);
    const status = s.chunks > 0 ? "OK" : "MISSING";
    console.log(`[${status}] ${docId}: ${s.chunks} chunks, latest=${s.latest ?? "—"}`);
    if (s.preview) console.log(`  preview: ${s.preview}…`);
  }

  console.log("");
  console.log("--- raw (sources) targets ---");
  for (const docId of RAW_TARGETS) {
    const s = await docStats("raw_chunks", docId);
    const status = s.chunks > 0 ? "OK" : "MISSING";
    console.log(`[${status}] ${docId}: ${s.chunks} chunks, latest=${s.latest ?? "—"}`);
    if (s.preview) console.log(`  preview: ${s.preview}…`);
  }

  const theory = await docStats("wiki_chunks", "canonical/07_theory");
  const hasIzard = theory.chunks > 0 && /Izard|아이저드|김초엽/.test(
    (await getSupabaseAdmin().from("wiki_chunks").select("content").eq("doc_id", "canonical/07_theory")).data?.map((r) => r.content).join("\n") ?? "",
  );
  console.log("");
  console.log(`07_theory contains Izard/김초엽 markers: ${hasIzard ? "yes" : "no"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
