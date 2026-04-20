type Entry = { answer: string; citationsJson: string; expires: number };

const store = new Map<string, Entry>();
const TTL_MS = 5 * 60 * 1000;

function norm(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 500);
}

export function faqCacheGet(question: string): Entry | null {
  const k = norm(question);
  const hit = store.get(k);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    store.delete(k);
    return null;
  }
  return hit;
}

export function faqCacheSet(question: string, answer: string, citationsJson: string): void {
  const k = norm(question);
  store.set(k, { answer, citationsJson, expires: Date.now() + TTL_MS });
}
