/** 매우 단순한 마스킹(ingest 파이프라인용). 실제 운영 시 규칙을 강화하세요. */
export function lightScrubPII(input: string): string {
  return input
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[email]")
    .replace(/\b0\d{1,2}-\d{3,4}-\d{4}\b/g, "[phone]")
    .replace(/\b\d{3}-\d{3,4}-\d{4}\b/g, "[phone]");
}
