/**
 * wiki/sources 아래 PDF·이미지 → OpenAI(텍스트·비전)로 설명·텍스트 추출 후
 * wiki/sources/_media_extracts/ 아래에 .md 로 저장 → digest / ingest:raw 가 그대로 소화·인제스트.
 *
 * 도면 권장: 같은 폴더에 `plan.pdf`(텍스트 레이어) + `plan.png`(고해상도) → 한 md로 병합.
 *
 * 사용: npx tsx scripts/extract-media-sources.ts [--force] [--only pdf|image|all]
 */
import { promises as fs } from "fs";
import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import { basename, dirname, extname, join, relative } from "path";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import { loadEnv } from "./loadEnv";

loadEnv();

const SOURCES_ROOT = join(process.cwd(), "wiki", "sources");
const EXTRACT_ROOT = join(SOURCES_ROOT, "_media_extracts");
const PDF_EXT = ".pdf";
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const MEDIA_EXT = new Set([PDF_EXT, ...IMAGE_EXT]);

const DEFAULT_DIAGRAM_DIRS = ["diagrams", "drawings", "plans", "도면"];

const IMAGE_PROMPT = [
  "이 이미지는 건축 졸업전시용 자료(렌더, 다이어그램, 도면, 사진, 스크린샷 등)일 수 있다.",
  "한국어로 다음을 작성하라.",
  "1) 보이는 주요 내용(공간, 동선, 레이어, 관계 등)",
  "2) 이미지 안에 읽을 수 있는 글자가 있으면 가능한 한 그대로 옮겨 적기",
  "3) 확실하지 않은 해석은 [불확실] 접두어를 붙여 짧게 쓰기",
  "4) 이미지에 없는 정보는 지어내지 말 것.",
].join("\n");

const DIAGRAM_IMAGE_PROMPT = [
  "이 이미지는 건축 도면(평면·단면·배치·다이어그램) PNG일 수 있다.",
  "한국어로 다음을 작성하라.",
  "1) 도면 종류(평면/단면/배치 등)와 축척·방향이 보이면 적기",
  "2) 공간 구획, 동선, 레이어·노드·매스 관계가 보이면 설명",
  "3) 범례·주석·치수·라벨·방호·재료 표기는 읽을 수 있는 것만 그대로 옮기기 (추측 금지)",
  "4) 확실하지 않은 해석·숫자는 [불확실] 접두어",
  "5) 이미지에 없는 프로그램·수치는 만들지 말 것.",
].join("\n");

const PDF_VISION_PROMPT = [
  "첨부 PDF는 건축 도면·전시 자료일 수 있다(텍스트 레이어가 없을 수 있음).",
  "한국어로 다음을 작성하라.",
  "1) 읽을 수 있는 제목·칙수·범례·주석",
  "2) 도면/다이어그램으로 보이는 구성 요약",
  "3) 확실하지 않은 부분은 [불확실]로 표시",
  "4) PDF에 없는 내용은 만들지 말 것.",
].join("\n");

type MediaJob =
  | { kind: "pair"; pdf: string; image: string; relFromSources: string }
  | { kind: "pdf"; path: string }
  | { kind: "image"; path: string };

let openai: OpenAI | null = null;
function client(): OpenAI {
  if (!openai) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
    openai = new OpenAI({ apiKey: key });
  }
  return openai;
}

function parseArgs() {
  let force = false;
  let only: "pdf" | "image" | "all" = "all";
  for (const a of process.argv.slice(2)) {
    if (a === "--force") force = true;
    if (a.startsWith("--only=")) {
      const v = a.slice("--only=".length).toLowerCase();
      if (v === "pdf" || v === "image" || v === "all") only = v;
    }
  }
  return { force, only };
}

function diagramDirNames(): string[] {
  const raw = process.env.DIAGRAM_SOURCE_DIRS?.trim();
  if (!raw) return DEFAULT_DIAGRAM_DIRS;
  return raw.split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function isDiagramPath(abs: string): boolean {
  const rel = relative(SOURCES_ROOT, abs).replace(/\\/g, "/").toLowerCase();
  const parts = rel.split("/");
  const dirs = diagramDirNames();
  return parts.some((p) => dirs.includes(p));
}

async function walkMediaFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "_media_extracts") continue;
        await walk(p);
      } else if (ent.isFile() && MEDIA_EXT.has(extname(ent.name).toLowerCase())) {
        out.push(p);
      }
    }
  }
  await walk(root);
  return out.sort();
}

/** 단일 입력 파일용 (레거시 per-file 출력) */
function outputMdPath(inputAbs: string): string {
  const rel = relative(SOURCES_ROOT, inputAbs).replace(/\\/g, "/");
  const safe = rel.replace(/\//g, "__");
  return join(EXTRACT_ROOT, `${safe}.md`);
}

/** PDF+PNG 페어: 확장자 없이 stem 하나로 통합 md */
function outputMdPathForPair(relFromSources: string): string {
  const safe = relFromSources.replace(/\//g, "__");
  return join(EXTRACT_ROOT, `${safe}.md`);
}

function pickPairImage(images: string[]): string | null {
  const order = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
  for (const ext of order) {
    const hit = images.find((p) => extname(p).toLowerCase() === ext);
    if (hit) return hit;
  }
  return images[0] ?? null;
}

function buildMediaJobs(files: string[]): MediaJob[] {
  const byStem = new Map<string, { pdf?: string; images: string[] }>();

  for (const abs of files) {
    const rel = relative(SOURCES_ROOT, abs).replace(/\\/g, "/");
    const dir = dirname(rel);
    const stem = basename(abs, extname(abs));
    const key = dir === "." ? stem : `${dir}/${stem}`;
    const bucket = byStem.get(key) ?? { images: [] };
    const ext = extname(abs).toLowerCase();
    if (ext === PDF_EXT) bucket.pdf = abs;
    else bucket.images.push(abs);
    byStem.set(key, bucket);
  }

  const jobs: MediaJob[] = [];

  for (const [relFromSources, bucket] of byStem) {
    const image = bucket.pdf && bucket.images.length ? pickPairImage(bucket.images) : null;
    if (bucket.pdf && image) {
      jobs.push({ kind: "pair", pdf: bucket.pdf, image, relFromSources });
      for (const img of bucket.images) {
        if (img !== image) jobs.push({ kind: "image", path: img });
      }
      continue;
    }
    if (bucket.pdf) jobs.push({ kind: "pdf", path: bucket.pdf });
    for (const img of bucket.images) jobs.push({ kind: "image", path: img });
  }

  return jobs;
}

function mimeForImage(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".webp") return "image/webp";
  if (e === ".gif") return "image/gif";
  return "application/octet-stream";
}

async function extractImage(
  inputAbs: string,
  model: string,
  prompt: string,
  maxTokens = 2500,
): Promise<string> {
  const buf = await readFile(inputAbs);
  if (buf.length > 18 * 1024 * 1024) {
    return `[오류] 파일이 18MB를 넘어 Vision API 제한에 걸릴 수 있습니다. 해상도를 줄인 뒤 다시 시도하세요.`;
  }
  const ext = extname(inputAbs);
  const mime = mimeForImage(ext);
  const b64 = buf.toString("base64");
  const res = await client().chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mime};base64,${b64}`, detail: "high" } },
        ],
      },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || "(빈 응답)";
}

async function extractPdfText(inputAbs: string): Promise<{ text: string; pages: number }> {
  const buf = await readFile(inputAbs);
  const data = await pdfParse(buf);
  return { text: (data.text || "").trim(), pages: data.numpages ?? 0 };
}

async function extractPdfWithVision(inputAbs: string, model: string): Promise<string> {
  const buf = await readFile(inputAbs);
  if (buf.length > 24 * 1024 * 1024) {
    return `[오류] PDF가 24MB를 넘습니다. 나누어 올리거나 해상도를 낮춘 뒤 시도하세요.`;
  }
  const b64 = buf.toString("base64");
  const name = basename(inputAbs);
  const res = await client().chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 3500,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PDF_VISION_PROMPT },
          { type: "file", file: { filename: name, file_data: b64 } },
        ],
      },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || "(빈 응답)";
}

async function shouldSkip(sources: string[], outAbs: string, force: boolean): Promise<boolean> {
  if (force) return false;
  try {
    const outSt = await stat(outAbs);
    let newestIn = 0;
    for (const src of sources) {
      const st = await stat(src);
      if (st.mtimeMs > newestIn) newestIn = st.mtimeMs;
    }
    return outSt.mtimeMs >= newestIn;
  } catch {
    return false;
  }
}

function buildMarkdown(meta: Record<string, string>, body: string): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(meta)) {
    lines.push(`${k}: ${JSON.stringify(v)}`);
  }
  lines.push("---", "", body.trim(), "");
  return lines.join("\n");
}

async function removeStalePerFileExtracts(paths: string[]): Promise<void> {
  for (const p of paths) {
    const legacy = outputMdPath(p);
    try {
      await unlink(legacy);
      console.log(`[extract:media] removed legacy ${relative(process.cwd(), legacy)}`);
    } catch {
      /* 없으면 무시 */
    }
  }
}

async function processPair(
  job: Extract<MediaJob, { kind: "pair" }>,
  opts: {
    force: boolean;
    only: "pdf" | "image" | "all";
    diagramModel: string;
    pdfMinChars: number;
  },
): Promise<{ done: boolean; skipped: boolean }> {
  const { pdf, image, relFromSources } = job;
  const outAbs = outputMdPathForPair(relFromSources);
  await mkdir(dirname(outAbs), { recursive: true });

  if (await shouldSkip([pdf, image], outAbs, opts.force)) {
    console.log(`[extract:media] skip (최신) pair ${relFromSources}`);
    return { done: false, skipped: true };
  }

  const pdfRel = relative(process.cwd(), pdf).replace(/\\/g, "/");
  const imgRel = relative(process.cwd(), image).replace(/\\/g, "/");

  try {
    const { text, pages } = await extractPdfText(pdf);
    const parts: string[] = [];
    let kind = "diagram-pair";

    if (text.length > 0) {
      parts.push(`## PDF 텍스트 레이어 (${pages}페이지)`, "", text);
    } else {
      parts.push(`## PDF 텍스트 레이어 (${pages}페이지)`, "", "(추출된 텍스트 없음 — PNG 시각 해석에 의존)");
    }

    if (opts.only !== "pdf") {
      console.log(`[extract:media] pair png → ${opts.diagramModel} … ${imgRel}`);
      const vision = await extractImage(image, opts.diagramModel, DIAGRAM_IMAGE_PROMPT, 3500);
      parts.push("", "---", "", `## 도면 시각 해석 (PNG, 검수 필요)`, "", vision);
      kind = text.length >= opts.pdfMinChars ? "diagram-pair-text+vision" : "diagram-pair-vision";
    } else {
      kind = "diagram-pair-text-only";
    }

    const meta = {
      source_files: `${pdfRel}; ${imgRel}`,
      extraction_kind: kind,
      extracted_at: new Date().toISOString(),
      pdf_text_chars: String(text.length),
      vision_model: opts.only === "pdf" ? "pdf-parse" : opts.diagramModel,
    };

    await writeFile(outAbs, buildMarkdown(meta, parts.join("\n")), "utf8");
    await removeStalePerFileExtracts([pdf, image]);
    console.log(`[extract:media] wrote pair ${relative(process.cwd(), outAbs)}`);
    return { done: true, skipped: false };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await writeFile(
      outAbs,
      buildMarkdown(
        {
          source_files: `${pdfRel}; ${imgRel}`,
          extraction_kind: "error",
          extracted_at: new Date().toISOString(),
          error: err.slice(0, 500),
        },
        `## 추출 실패\n\n\`\`\`\n${err}\n\`\`\`\n`,
      ),
      "utf8",
    );
    console.error(`[extract:media] ERROR pair ${relFromSources}:`, err);
    return { done: true, skipped: false };
  }
}

async function processPdf(
  abs: string,
  opts: {
    force: boolean;
    pdfVisionModel: string;
    pdfMinChars: number;
  },
): Promise<{ done: boolean; skipped: boolean }> {
  const outAbs = outputMdPath(abs);
  await mkdir(dirname(outAbs), { recursive: true });

  if (await shouldSkip([abs], outAbs, opts.force)) {
    console.log(`[extract:media] skip (최신) ${relative(process.cwd(), abs)}`);
    return { done: false, skipped: true };
  }

  const rel = relative(process.cwd(), abs).replace(/\\/g, "/");
  const diagram = isDiagramPath(abs);

  try {
    const { text, pages } = await extractPdfText(abs);
    let body = "";
    let kind = "";

    if (diagram) {
      console.warn(
        `[extract:media] 도면 PDF 단독(${basename(abs)}): 같은 이름 PNG 페어링 권장 (예: ${basename(abs, PDF_EXT)}.png)`,
      );
    }

    if (text.length >= opts.pdfMinChars) {
      kind = "pdf-text";
      console.log(`[extract:media] pdf text (${pages}p, ${text.length}자) … ${rel}`);
      body = [`## PDF 텍스트 추출 (${pages}페이지)`, "", text].join("\n");
    } else {
      kind = "pdf-vision";
      console.log(
        `[extract:media] pdf 텍스트 부족(${text.length}자) → ${opts.pdfVisionModel} … ${rel}`,
      );
      const visionPart = await extractPdfWithVision(abs, opts.pdfVisionModel);
      const head =
        text.length > 0
          ? `## PDF 텍스트 레이어(짧음, ${pages}페이지)\n\n${text}\n\n---\n\n## PDF 시각 해석 (검수 필요)\n\n`
          : `## PDF 시각 해석 (텍스트 레이어 없음, 검수 필요)\n\n`;
      body = head + visionPart;
    }

    await writeFile(
      outAbs,
      buildMarkdown(
        {
          source_file: rel,
          extraction_kind: kind,
          extracted_at: new Date().toISOString(),
          vision_model: kind === "pdf-text" ? "pdf-parse" : opts.pdfVisionModel,
        },
        body,
      ),
      "utf8",
    );
    console.log(`[extract:media] wrote ${relative(process.cwd(), outAbs)}`);
    return { done: true, skipped: false };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await writeFile(
      outAbs,
      buildMarkdown(
        {
          source_file: rel,
          extraction_kind: "error",
          extracted_at: new Date().toISOString(),
          error: err.slice(0, 500),
        },
        `## 추출 실패\n\n\`\`\`\n${err}\n\`\`\`\n\n원본: \`${rel}\`\n`,
      ),
      "utf8",
    );
    console.error(`[extract:media] ERROR ${rel}:`, err);
    return { done: true, skipped: false };
  }
}

async function processImage(
  abs: string,
  opts: {
    force: boolean;
    visionModel: string;
    diagramModel: string;
  },
): Promise<{ done: boolean; skipped: boolean }> {
  const outAbs = outputMdPath(abs);
  await mkdir(dirname(outAbs), { recursive: true });

  if (await shouldSkip([abs], outAbs, opts.force)) {
    console.log(`[extract:media] skip (최신) ${relative(process.cwd(), abs)}`);
    return { done: false, skipped: true };
  }

  const rel = relative(process.cwd(), abs).replace(/\\/g, "/");
  const diagram = isDiagramPath(abs);
  const model = diagram ? opts.diagramModel : opts.visionModel;
  const prompt = diagram ? DIAGRAM_IMAGE_PROMPT : IMAGE_PROMPT;
  const maxTokens = diagram ? 3500 : 2500;
  const kind = diagram ? "diagram-image-vision" : "image-vision";

  try {
    console.log(`[extract:media] image → ${model} … ${rel}`);
    const body = await extractImage(abs, model, prompt, maxTokens);
    await writeFile(
      outAbs,
      buildMarkdown(
        {
          source_file: rel,
          extraction_kind: kind,
          extracted_at: new Date().toISOString(),
          vision_model: model,
        },
        body,
      ),
      "utf8",
    );
    console.log(`[extract:media] wrote ${relative(process.cwd(), outAbs)}`);
    return { done: true, skipped: false };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await writeFile(
      outAbs,
      buildMarkdown(
        {
          source_file: rel,
          extraction_kind: "error",
          extracted_at: new Date().toISOString(),
          error: err.slice(0, 500),
        },
        `## 추출 실패\n\n\`\`\`\n${err}\n\`\`\`\n\n원본: \`${rel}\`\n`,
      ),
      "utf8",
    );
    console.error(`[extract:media] ERROR ${rel}:`, err);
    return { done: true, skipped: false };
  }
}

async function main() {
  const { force, only } = parseArgs();
  const visionModel = process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";
  const diagramModel =
    process.env.OPENAI_DIAGRAM_VISION_MODEL ??
    process.env.OPENAI_PDF_VISION_MODEL ??
    "gpt-4o";
  const pdfVisionModel = process.env.OPENAI_PDF_VISION_MODEL ?? diagramModel;
  const pdfMinChars = Math.max(50, Number(process.env.PDF_TEXT_MIN_CHARS ?? "200"));

  let files: string[] = [];
  try {
    files = await walkMediaFiles(SOURCES_ROOT);
  } catch {
    console.warn("[extract:media] wiki/sources 가 없거나 읽을 수 없습니다. 건너뜁니다.");
    process.exit(0);
  }

  const jobs = buildMediaJobs(files);
  let done = 0;
  let skipped = 0;

  for (const job of jobs) {
    if (job.kind === "pair") {
      if (only === "image" || only === "pdf" || only === "all") {
        const r = await processPair(job, { force, only, diagramModel, pdfMinChars });
        if (r.done) done++;
        if (r.skipped) skipped++;
      }
      continue;
    }

    if (job.kind === "pdf") {
      if (only === "pdf" || only === "all") {
        const r = await processPdf(job.path, { force, pdfVisionModel, pdfMinChars });
        if (r.done) done++;
        if (r.skipped) skipped++;
      }
      continue;
    }

    if (job.kind === "image") {
      if (only === "image" || only === "all") {
        const r = await processImage(job.path, { force, visionModel, diagramModel });
        if (r.done) done++;
        if (r.skipped) skipped++;
      }
    }
  }

  console.log(
    `[extract:media] 완료: 신규/갱신 ${done}건, 건너뜀 ${skipped}건 → ${relative(process.cwd(), EXTRACT_ROOT)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
