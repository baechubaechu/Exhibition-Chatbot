/** wiki/sources 대화 추출본 헤더(제목·생성 시각) 파싱 */

export type ConversationHeader = {
  title?: string;
  /** YYYY-MM-DD */
  createdAt?: string;
};

const TITLE_RE = /^제목:\s*(.+)$/m;
const CREATED_RE = /^생성\s*시각:\s*(\d{4})-(\d{2})-(\d{2})/m;

export function parseConversationHeader(text: string): ConversationHeader {
  const titleM = TITLE_RE.exec(text.slice(0, 1200));
  const createdM = CREATED_RE.exec(text.slice(0, 1200));
  const out: ConversationHeader = {};
  if (titleM?.[1]) out.title = titleM[1].trim();
  if (createdM) out.createdAt = `${createdM[1]}-${createdM[2]}-${createdM[3]}`;
  return out;
}

export function formatConversationDate(createdAt: string, locale: "ko" | "en"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(createdAt);
  if (!m) return createdAt;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (locale === "en") {
    const month = new Date(y, mo - 1, d).toLocaleString("en-US", { month: "long" });
    return `${month} ${d}, ${y}`;
  }
  return `${y}년 ${mo}월 ${d}일`;
}
