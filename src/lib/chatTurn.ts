import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { exhibitionDayKst } from "@/lib/kst";
import type { GateDebug } from "@/lib/rag";

export type Outcome = "answered" | "refused" | "low_confidence";

export function classifyOutcome(debug: GateDebug): { outcome: Outcome; gapCandidate: boolean } {
  if (!debug.wikiConfidenceOK && !debug.rawConfidenceOK) {
    return { outcome: "low_confidence", gapCandidate: true };
  }
  return { outcome: "answered", gapCandidate: false };
}

export type RetrievalDebugPayload = Partial<GateDebug> & {
  wikiChunkIds: number[];
  rawChunkIds: number[];
  cache?: "memory" | "static_faq";
  offTopic?: boolean;
  topicReason?: string;
};

export async function insertChatTurn(input: {
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
  outcome: Outcome;
  gapCandidate: boolean;
  retrievalDebug: RetrievalDebugPayload;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const day = exhibitionDayKst();
  const { error } = await supabase.from("chat_turns").insert({
    exhibition_day: day,
    session_id: input.sessionId,
    user_message: input.userMessage,
    assistant_message: input.assistantMessage,
    outcome: input.outcome,
    gap_candidate: input.gapCandidate,
    retrieval_debug: input.retrievalDebug,
    review_status: "pending",
  });
  if (error) throw error;
}
