import { readFile } from "fs/promises";
import { join, extname, relative } from "path";
import { loadEnv } from "./loadEnv";
import { getSupabaseAdmin } from "../src/lib/supabaseAdmin";
import { embedTexts } from "../src/lib/embeddings";
import { chunkByParagraphs } from "../src/lib/chunk";
import { lightScrubPII } from "../src/lib/pii";
import { walkTextFiles } from "./walkSourceFiles";

loadEnv();

const SOURCES_DIR = join(process.cwd(), "wiki", "sources");
const MAX_CHARS = 1400;
const OVERLAP = 160;

async function main() {
  const files = await walkTextFiles(SOURCES_DIR);
  const textFiles = files.filter((f) => [".md", ".txt", ".mdx", ".log"].includes(extname(f).toLowerCase()));
  if (!textFiles.length) {
    console.warn(`[ingest:raw] ${SOURCES_DIR} 에 문서가 없습니다.`);
    return;
  }
  const supabase = getSupabaseAdmin();
  for (const abs of textFiles) {
    const rel = relative(process.cwd(), abs).replace(/\\/g, "/");
    const withoutExt = rel.replace(/\.[^.]+$/, "");
    const docId = `raw:${withoutExt.replace(/^wiki\/sources\//, "sources/")}`;
    const rawText = lightScrubPII(await readFile(abs, "utf8"));
    const chunks = chunkByParagraphs(rawText, { maxChars: MAX_CHARS, overlapChars: OVERLAP });
    if (!chunks.length) continue;
    const { error: delErr } = await supabase.from("raw_chunks").delete().eq("doc_id", docId);
    if (delErr) throw delErr;
    const embeddings = await embedTexts(chunks);
    const baseName = abs.split(/[/\\]/).pop() ?? docId;
    const rows = chunks.map((content, i) => ({
      doc_id: docId,
      title: baseName,
      section_path: `segment-${i + 1}`,
      content,
      tags: [] as string[],
      lang: "ko",
      metadata: { path: rel, chunkIndex: i, layer: "sources" },
      embedding: embeddings[i]!,
    }));
    const { error } = await supabase.from("raw_chunks").insert(rows);
    if (error) throw error;
    console.log(`[ingest:raw] ${docId}: ${rows.length} chunks`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
