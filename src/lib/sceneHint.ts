import { eventBus } from "@/lib/eventBus";

function intentFromQuestion(question: string): { intentTag: string; confidence: number; targetZone?: "zoneA" | "zoneB" | "all" } {
  const q = question.toLowerCase();
  if (/단면|section|zone\s*a|모형\s*a/.test(q)) return { intentTag: "section_focus", confidence: 0.78, targetZone: "zoneA" };
  if (/모형\s*b|zone\s*b|레이어|layer|층위/.test(q)) return { intentTag: "layer_focus", confidence: 0.76, targetZone: "zoneB" };
  if (/동선|보행|흐름|flow/.test(q)) return { intentTag: "circulation", confidence: 0.72, targetZone: "all" };
  if (/조명|빛|light/.test(q)) return { intentTag: "light_attention", confidence: 0.68, targetZone: "all" };
  if (/사운드|소리|speaker|음향/.test(q)) return { intentTag: "sound_attention", confidence: 0.68, targetZone: "all" };
  return { intentTag: "general_exhibit", confidence: 0.55, targetZone: "all" };
}

export function publishSceneHintFromChat(input: { question: string; locale: "ko" | "en"; sessionId: string }): void {
  const hint = intentFromQuestion(input.question);
  eventBus.publish(
    "chat.scene_hint",
    {
      intentTag: hint.intentTag,
      confidence: hint.confidence,
      locale: input.locale,
      messageSummary: input.question.slice(0, 280),
      targetZone: hint.targetZone,
    },
    {
      sessionId: input.sessionId,
      source: "chat-api",
      ttlMs: 90_000,
    },
  );
}
