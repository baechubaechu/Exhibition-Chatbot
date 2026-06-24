import { readFile } from "fs/promises";
import { join } from "path";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const topicSchema = z.object({
  label: z.enum(["on_topic", "off_topic", "needs_clarification"]),
  reason_ko: z.string().max(400),
});

export type TopicLabel = z.infer<typeof topicSchema>["label"];

let scopeCache: string | null = null;

const EXHIBITION_TOPIC_RE =
  /졸업전시|전시\s*부스|홍익|부스|패널|모형|태블릿|모니터|인터랙션|관람|전시장|전시\s*구성|전시에서|배치도|방명록|매트릭스\s*다이어그램|interactive|exhibit/i;

function looksExhibitionRelated(question: string): boolean {
  return EXHIBITION_TOPIC_RE.test(question);
}

async function readScopeHead(relPath: string, maxChars: number): Promise<string> {
  if (maxChars <= 0) return "";
  try {
    const full = await readFile(join(process.cwd(), relPath), "utf8");
    return full.slice(0, maxChars);
  } catch {
    return "";
  }
}

/** 전시/프로젝트 범위 설명(분류용). */
export async function loadProjectScopeSnippet(): Promise<string> {
  if (scopeCache) return scopeCache;
  if (process.env.PROJECT_SCOPE_SNIPPET?.trim()) {
    scopeCache = process.env.PROJECT_SCOPE_SNIPPET.trim();
    return scopeCache;
  }
  const mc = Number(process.env.PROJECT_SCOPE_SNIPPET_MAX_CHARS);
  const maxChars = Number.isFinite(mc) ? Math.min(8000, Math.max(1500, mc)) : 3800;
  const exhibitionChars = Math.min(1800, Math.floor(maxChars * 0.45));
  const overviewChars = maxChars - exhibitionChars;

  const overview = await readScopeHead("wiki/canonical/00_project_overview.md", overviewChars);
  const exhibition = await readScopeHead("wiki/canonical/12_exhibition.md", exhibitionChars);

  if (overview || exhibition) {
    scopeCache = [
      overview,
      exhibition ? "## 전시 구성 (이 프로젝트 졸업전시 부스·관람 FAQ — 범위 안)\n" + exhibition : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  } else {
    scopeCache =
      "이 챗봇은 건축 졸업전시 프로젝트(금정 맥락, 대지·층위·노드·매싱·이론·전시 FAQ, 홍익대 졸업전시 부스 배치·모형·태블릿·모니터) 안내만 합니다. " +
      "날씨, 주식, 개인 과제 대행, 다른 학교 과제, 무관한 잡담 등은 범위 밖입니다.";
  }
  return scopeCache;
}

/**
 * 오프토픽 가드: 저비용 구조화 분류.
 * `needs_clarification`은 RAG까지 진행(너무 많이 막지 않기 위함).
 */
export async function classifyExhibitTopic(userQuestion: string): Promise<z.infer<typeof topicSchema>> {
  if (looksExhibitionRelated(userQuestion)) {
    return {
      label: "on_topic",
      reason_ko: "졸업전시·부스·관람 구성 관련 질문으로 분류했습니다.",
    };
  }

  const scope = await loadProjectScopeSnippet();
  const topicModel = process.env.OPENAI_TOPIC_MODEL ?? process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
  const { object } = await generateObject({
    model: openai(topicModel),
    schema: topicSchema,
    temperature: 0,
    maxTokens: 180,
    prompt: [
      "다음 SCOPE는 전시 챗봇이 다루는 프로젝트 범위 설명이다.",
      "USER_QUESTION이 이 범위와 직접 관련 있으면 on_topic.",
      "이 프로젝트의 **홍익대 건축학과 졸업전시 부스**, 물리 전시 배치, 패널·모형·태블릿·모니터·관람 안내는 **반드시 on_topic**이다.",
      "명백히 무관(날씨, 게임, 다른 학과, 코드 대행, 정치 선동 등)이면 off_topic.",
      "짧아서 판단이 애매하면 needs_clarification.",
      "",
      "SCOPE:",
      scope,
      "",
      "USER_QUESTION:",
      userQuestion,
    ].join("\n"),
  });
  return object;
}
