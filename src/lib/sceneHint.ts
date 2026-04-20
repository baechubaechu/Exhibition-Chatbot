function intentFromQuestion(question: string): {
  intentTag: string;
  confidence: number;
  targetZone?: "zoneA" | "zoneB" | "all";
} {
  const q = question.toLowerCase();
  if (/단면|section|zone\s*a|모형\s*a/.test(q)) return { intentTag: "section_focus", confidence: 0.78, targetZone: "zoneA" };
  if (/모형\s*b|zone\s*b|레이어|layer|층위/.test(q)) return { intentTag: "layer_focus", confidence: 0.76, targetZone: "zoneB" };
  if (/동선|보행|흐름|flow/.test(q)) return { intentTag: "circulation", confidence: 0.72, targetZone: "all" };
  if (/조명|빛|light/.test(q)) return { intentTag: "light_attention", confidence: 0.68, targetZone: "all" };
  if (/사운드|소리|speaker|음향/.test(q)) return { intentTag: "sound_attention", confidence: 0.68, targetZone: "all" };
  return { intentTag: "general_exhibit", confidence: 0.55, targetZone: "all" };
}

/**
 * `EXHIBIT_EVENTS_BASE_URL`에 떠 있는 **exhibition-control** 앱의 `/api/events/publish` 로 전달합니다.
 * (메모리 이벤트 버스는 control 프로세스 안에만 존재합니다.)
 */
export async function publishSceneHintFromChat(input: {
  question: string;
  locale: "ko" | "en";
  sessionId: string;
}): Promise<void> {
  const base = process.env.EXHIBIT_EVENTS_BASE_URL?.replace(/\/$/, "");
  if (!base) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[sceneHint] EXHIBIT_EVENTS_BASE_URL unset; chat.scene_hint not published");
    }
    return;
  }

  const hint = intentFromQuestion(input.question);
  try {
    const res = await fetch(`${base}/api/events/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "chat.scene_hint",
        source: "chat-api",
        sessionId: input.sessionId,
        payload: {
          intentTag: hint.intentTag,
          confidence: hint.confidence,
          locale: input.locale,
          messageSummary: input.question.slice(0, 280),
          targetZone: hint.targetZone,
        },
      }),
    });
    if (!res.ok) {
      console.error("[sceneHint] publish failed", res.status, await res.text());
    }
  } catch (e) {
    console.error("[sceneHint]", e);
  }
}
