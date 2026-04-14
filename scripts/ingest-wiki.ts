import { readFile } from "fs/promises";
import { join, extname, relative } from "path";
import { loadEnv } from "./loadEnv";
import { getSupabaseAdmin } from "../src/lib/supabaseAdmin";
import { embedTexts } from "../src/lib/embeddings";
import { chunkByParagraphs } from "../src/lib/chunk";
import { walkTextFiles } from "./walkSourceFiles";

loadEnv();

const CANONICAL_DIR = join(process.cwd(), "wiki", "canonical");
const MAX_CHARS = 1200;
const OVERLAP = 120;

async function main() {
  const files = await walkTextFiles(CANONICAL_DIR);
  const mdFiles = files.filter((f) => [".md", ".mdx", ".txt"].includes(extname(f).toLowerCase()));
  if (!mdFiles.length) {
    console.warn(`[ingest:wiki] ${CANONICAL_DIR} 에 문서가 없습니다.`);
    return;
  }
  const supabase = getSupabaseAdmin();
  for (const abs of mdFiles) {
    const rel = relative(process.cwd(), abs).replace(/\\/g, "/");
    const docId = rel.replace(/^wiki\/canonical\//, "canonical/").replace(/\.[^.]+$/, "");
    const raw = await readFile(abs, "utf8");
    const chunks = chunkByParagraphs(raw, { maxChars: MAX_CHARS, overlapChars: OVERLAP });
    if (!chunks.length) continue;
    const { error: delErr } = await supabase.from("wiki_chunks").delete().eq("doc_id", docId);
    if (delErr) throw delErr;
    const embeddings = await embedTexts(chunks);
    const baseName = abs.split(/[/\\]/).pop() ?? docId;
    const rows = chunks.map((content, i) => ({
      doc_id: docId,
      title: baseName,
      section_path: `part-${i + 1}`,
      content,
      tags: [] as string[],
      lang: "ko",
      metadata: { path: rel, chunkIndex: i, layer: "canonical" },
      embedding: embeddings[i]!,
    }));
    const { error } = await supabase.from("wiki_chunks").insert(rows);
    if (error) throw error;
    console.log(`[ingest:wiki] ${docId}: ${rows.length} chunks`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
