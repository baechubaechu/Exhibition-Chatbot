import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const model = () => openai(process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini");

/**
 * UI 표시용: 한국어(등) 문장을 자연스러운 영어로 일괄 번역.
 * 채팅 파이프라인/캐시의 한국어 원문은 바꾸지 않는다.
 */
export async function translateToEnglishBatch(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  const trimmed = texts.map((t) => t.trim());
  if (trimmed.every((t) => !t)) return texts;

  const { text } = await generateText({
    model: model(),
    temperature: 0.15,
    maxTokens: Math.min(4096, 120 + trimmed.length * 220),
    prompt: [
      "You translate UI/chat snippets into clear, natural English.",
      "Input is a JSON array of strings (same order as output required).",
      "Output ONLY a JSON array of strings with the same length. No markdown fences, no commentary.",
      "",
      "INPUT:",
      JSON.stringify(trimmed),
    ].join("\n"),
  });

  let parsed: unknown;
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    parsed = JSON.parse(cleaned);
  } catch {
    return trimmed;
  }
  if (!Array.isArray(parsed) || parsed.length !== trimmed.length) {
    return trimmed;
  }
  return parsed.map((x, i) => (typeof x === "string" ? x : trimmed[i]!));
}
