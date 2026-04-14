/**
 * 원문 wiki/sources → wiki/canonical 소화 (맵-리듀스).
 * 사용법:
 *   npx tsx scripts/digest-sources-to-canonical.ts --canonical 03_site_analysis.md
 *   npx tsx scripts/digest-sources-to-canonical.ts --canonical 08_public_faq.md --sources chatgpt
 */
import { readFile, appendFile } from "fs/promises";
import { join, relative } from "path";
import { loadEnv } from "./loadEnv";
import { walkTextFiles } from "./walkSourceFiles";
import { chunkByParagraphs } from "../src/lib/chunk";
import { lightScrubPII } from "../src/lib/pii";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { CANONICAL_ROLE } from "./canonical-manifest";

loadEnv();

const CANONICAL_DIR = join(process.cwd(), "wiki", "canonical");
const SOURCES_ROOT = join(process.cwd(), "wiki", "sources");

const claimChunkSchema = z.object({
  claims: z
    .array(
      z.object({
        text: z.string().max(500),
        confidence: z.enum(["high", "medium", "low"]),
      }),
    )
    .max(24),
});

const reduceSchema = z.object({
  markdown: z.string().max(12000),
  open_questions: z.array(z.string().max(400)).max(16),
});

function parseArgs() {
  const argv = process.argv.slice(2);
  let canonical = "";
  let sourcesSub = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--canonical" && argv[i + 1]) {
      canonical = argv[i + 1]!;
      i++;
    }
    if (argv[i] === "--sources" && argv[i + 1]) {
      sourcesSub = argv[i + 1]!;
      i++;
    }
  }
  return { canonical, sourcesSub };
}

async function mapClaimsForChunk(input: {
  chunk: string;
  sourceRelPath: string;
}): Promise<string[]> {
  const { object } = await generateObject({
    model: openai(process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini"),
    schema: claimChunkSchema,
    temperature: 0,
    prompt: [
      "너는 편집자다. 아래 SOURCE에서 **원문에 근거한 짧은 주장/사실/결정**만 추출하라.",
      "원문에 없는 추측은 넣지 마라. 한국어로.",
      `SOURCE_FILE: ${input.sourceRelPath}`,
      "",
      "TEXT:",
      input.chunk,
    ].join("\n"),
  });
  return object.claims.map((c) => `[${c.confidence}] ${c.text}`);
}

async function reduceToCanonical(input: {
  canonicalFile: string;
  role: string;
  existingCanonical: string;
  claims: string[];
}): Promise<{ markdown: string; open_questions: string[] }> {
  const claimsBlock = input.claims.join("\n");
  const { object } = await generateObject({
    model: openai(process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini"),
    schema: reduceSchema,
    temperature: 0.2,
    prompt: [
      "너는 건축 졸업전시용 위키 편집자다.",
      `대상 문서: ${input.canonicalFile}`,
      `문서 역할: ${input.role}`,
      "",
      "이미 있는 canonical 앞부분(참고만, 불필요한 복붙 금지):",
      input.existingCanonical.slice(0, 2500),
      "",
      "아래 CLAIMS만 근거로, **새로 추가할 Markdown 섹션**을 작성하라.",
      "기존 제목을 덮어쓰지 말고, 하위 섹션(`###`) 위주로 작성.",
      "CLAIMS에 없는 내용은 쓰지 마라.",
      "",
      "CLAIMS:",
      claimsBlock.slice(0, 28000),
    ].join("\n"),
  });
  return object;
}

async function main() {
  const { canonical, sourcesSub } = parseArgs();
  if (!canonical || !CANONICAL_ROLE[canonical]) {
    console.error(
      "사용법: npx tsx scripts/digest-sources-to-canonical.ts --canonical 03_site_analysis.md [--sources chatgpt]",
    );
    console.error("가능한 canonical:", Object.keys(CANONICAL_ROLE).join(", "));
    process.exit(1);
  }

  const srcRoot = sourcesSub ? join(SOURCES_ROOT, sourcesSub) : SOURCES_ROOT;
  const files = await walkTextFiles(srcRoot);
  if (!files.length) {
    console.warn(`[digest] 소스 파일 없음: ${srcRoot}`);
    process.exit(0);
  }

  const existing = await readFile(join(CANONICAL_DIR, canonical), "utf8").catch(() => "");
  const role = CANONICAL_ROLE[canonical] ?? "";

  const allClaims: string[] = [];
  const maxChunks = Number(process.env.DIGEST_MAX_CHUNKS ?? "36");

  let chunkCount = 0;
  for (const abs of files) {
    const rel = relative(process.cwd(), abs).replace(/\\/g, "/");
    const raw = lightScrubPII(await readFile(abs, "utf8"));
    const chunks = chunkByParagraphs(raw, { maxChars: 1600, overlapChars: 140 });
    for (const ch of chunks) {
      if (chunkCount >= maxChunks) break;
      const claims = await mapClaimsForChunk({ chunk: ch, sourceRelPath: rel });
      for (const c of claims) allClaims.push(`${rel} :: ${c}`);
      chunkCount++;
    }
    if (chunkCount >= maxChunks) break;
  }

  if (!allClaims.length) {
    console.warn("[digest] 추출된 claims 없음");
    process.exit(0);
  }

  const reduced = await reduceToCanonical({
    canonicalFile: canonical,
    role,
    existingCanonical: existing,
    claims: allClaims,
  });

  const stamp = new Date().toISOString().slice(0, 19);
  const block = [
    "",
    `## 자동 소화 초안 (검수 필요) — ${stamp}`,
    "",
    reduced.markdown.trim(),
    "",
    reduced.open_questions.length ? "### 열린 질문(원문만으로 불충분)\n" : "",
    ...reduced.open_questions.map((q) => `- ${q}`),
    "",
  ].join("\n");

  const target = join(CANONICAL_DIR, canonical);
  await appendFile(target, block, "utf8");
  console.log(`[digest] appended → ${target} (${allClaims.length} claim lines)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
