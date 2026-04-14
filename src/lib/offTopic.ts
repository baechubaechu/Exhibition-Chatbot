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

/** 전시/프로젝트 범위 설명(분류용). */
export async function loadProjectScopeSnippet(): Promise<string> {
  if (scopeCache) return scopeCache;
  if (process.env.PROJECT_SCOPE_SNIPPET?.trim()) {
    scopeCache = process.env.PROJECT_SCOPE_SNIPPET.trim();
    return scopeCache;
  }
  try {
    const p = join(process.cwd(), "wiki", "canonical", "00_project_overview.md");
    const full = await readFile(p, "utf8");
    scopeCache = full.slice(0, 6000);
  } catch {
    scopeCache =
      "이 챗봇은 건축 졸업전시 프로젝트(금정 맥락, 대지·층위·노드·매싱·이론·FAQ) 안내만 합니다. " +
      "날씨, 주식, 개인 과제 대행, 다른 학교 과제, 무관한 잡담 등은 범위 밖입니다.";
  }
  return scopeCache;
}

/**
 * 오프토픽 가드: 저비용 구조화 분류.
 * `needs_clarification`은 RAG까지 진행(너무 많이 막지 않기 위함).
 */
export async function classifyExhibitTopic(userQuestion: string): Promise<z.infer<typeof topicSchema>> {
  const scope = await loadProjectScopeSnippet();
  const { object } = await generateObject({
    model: openai(process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini"),
    schema: topicSchema,
    temperature: 0,
    prompt: [
      "다음 SCOPE는 전시 챗봇이 다루는 프로젝트 범위 설명이다.",
      "USER_QUESTION이 이 범위와 직접 관련 있으면 on_topic.",
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
