/**
 * wiki/sources 아래 PDF·이미지 → OpenAI(텍스트·비전)로 설명·텍스트 추출 후
 * wiki/sources/_media_extracts/ 아래에 .md 로 저장 → digest / ingest:raw 가 그대로 소화·인제스트.
 *
 * 사용: npx tsx scripts/extract-media-sources.ts [--force] [--only pdf|image|all]
 */
import { promises as fs } from "fs";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { basename, dirname, extname, join, relative } from "path";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import { loadEnv } from "./loadEnv";

loadEnv();

const SOURCES_ROOT = join(process.cwd(), "wiki", "sources");
const EXTRACT_ROOT = join(SOURCES_ROOT, "_media_extracts");
const MEDIA_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif"]);

const IMAGE_PROMPT = [
  "이 이미지는 건축 졸업전시용 자료(렌더, 다이어그램, 도면, 사진, 스크린샷 등)일 수 있다.",
  "한국어로 다음을 작성하라.",
  "1) 보이는 주요 내용(공간, 동선, 레이어, 관계 등)",
  "2) 이미지 안에 읽을 수 있는 글자가 있으면 가능한 한 그대로 옮겨 적기",
  "3) 확실하지 않은 해석은 [불확실] 접두어를 붙여 짧게 쓰기",
  "4) 이미지에 없는 정보는 지어내지 말 것.",
].join("\n");

const PDF_VISION_PROMPT = [
  "첨부 PDF는 건축 도면·전시 자료일 수 있다(텍스트 레이어가 없을 수 있음).",
  "한국어로 다음을 작성하라.",
  "1) 읽을 수 있는 제목·칙수·범례·주석",
  "2) 도면/다이어그램으로 보이는 구성 요약",
  "3) 확실하지 않은 부분은 [불확실]로 표시",
  "4) PDF에 없는 내용은 만들지 말 것.",
].join("\n");

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

function outputMdPath(inputAbs: string): string {
  const rel = relative(SOURCES_ROOT, inputAbs).replace(/\\/g, "/");
  const safe = rel.replace(/\//g, "__");
  return join(EXTRACT_ROOT, `${safe}.md`);
}

function mimeForImage(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".webp") return "image/webp";
  if (e === ".gif") return "image/gif";
  return "application/octet-stream";
}

async function extractImage(inputAbs: string, model: string): Promise<string> {
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
    max_tokens: 2500,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: IMAGE_PROMPT },
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
          {
            type: "file",
            file: { filename: name, file_data: b64 },
          },
        ],
      },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || "(빈 응답)";
}

async function shouldSkip(inputAbs: string, outAbs: string, force: boolean): Promise<boolean> {
  if (force) return false;
  try {
    const [inSt, outSt] = await Promise.all([stat(inputAbs), stat(outAbs)]);
    return outSt.mtimeMs >= inSt.mtimeMs;
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

async function main() {
  const { force, only } = parseArgs();
  const visionModel = process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";
  const pdfVisionModel = process.env.OPENAI_PDF_VISION_MODEL ?? process.env.OPENAI_VISION_MODEL ?? "gpt-4o";

  let inputs: string[] = [];
  try {
    inputs = await walkMediaFiles(SOURCES_ROOT);
  } catch {
    console.warn("[extract:media] wiki/sources 가 없거나 읽을 수 없습니다. 건너뜁니다.");
    process.exit(0);
  }
  const pdfMinChars = Math.max(50, Number(process.env.PDF_TEXT_MIN_CHARS ?? "200"));

  let done = 0;
  let skipped = 0;

  for (const abs of inputs) {
    const ext = extname(abs).toLowerCase();
    const isPdf = ext === ".pdf";
    const isImage = !isPdf;

    if (only === "pdf" && !isPdf) continue;
    if (only === "image" && !isImage) continue;

    const outAbs = outputMdPath(abs);
    await mkdir(dirname(outAbs), { recursive: true });

    if (await shouldSkip(abs, outAbs, force)) {
      skipped++;
      console.log(`[extract:media] skip (최신) ${relative(process.cwd(), abs)}`);
      continue;
    }

    const rel = relative(process.cwd(), abs).replace(/\\/g, "/");
    let body = "";
    let kind = "";

    try {
      if (isImage) {
        kind = "image-vision";
        console.log(`[extract:media] image → ${visionModel} … ${rel}`);
        body = await extractImage(abs, visionModel);
      } else {
        const { text, pages } = await extractPdfText(abs);
        if (text.length >= pdfMinChars) {
          kind = "pdf-text";
          console.log(`[extract:media] pdf text (${pages}p, ${text.length}자) … ${rel}`);
          body = [`## PDF 텍스트 추출 (${pages}페이지)`, "", text].join("\n");
        } else {
          kind = "pdf-vision";
          console.log(
            `[extract:media] pdf 텍스트 부족(${text.length}자 < ${pdfMinChars}) → ${pdfVisionModel} … ${rel}`,
          );
          const visionPart = await extractPdfWithVision(abs, pdfVisionModel);
          const head =
            text.length > 0
              ? `## PDF 텍스트 레이어(짧음, ${pages}페이지)\n\n${text}\n\n---\n\n## PDF 시각 해석 (모델, 검수 필요)\n\n`
              : `## PDF 시각 해석 (텍스트 레이어 없음 또는 스캔본 추정, 검수 필요)\n\n`;
          body = head + visionPart;
        }
      }

      const meta = {
        source_file: rel,
        extraction_kind: kind,
        extracted_at: new Date().toISOString(),
        vision_model: isImage ? visionModel : kind === "pdf-text" ? "pdf-parse" : pdfVisionModel,
      };

      await writeFile(outAbs, buildMarkdown(meta, body), "utf8");
      done++;
      console.log(`[extract:media] wrote ${relative(process.cwd(), outAbs)}`);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      const failBody = `## 추출 실패\n\n\`\`\`\n${err}\n\`\`\`\n\n원본: \`${rel}\`\n`;
      await writeFile(
        outAbs,
        buildMarkdown(
          {
            source_file: rel,
            extraction_kind: "error",
            extracted_at: new Date().toISOString(),
            error: err.slice(0, 500),
          },
          failBody,
        ),
        "utf8",
      );
      done++;
      console.error(`[extract:media] ERROR ${rel}:`, err);
    }
  }

  console.log(`[extract:media] 완료: 신규/갱신 ${done}건, 건너뜀 ${skipped}건 → ${relative(process.cwd(), EXTRACT_ROOT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
