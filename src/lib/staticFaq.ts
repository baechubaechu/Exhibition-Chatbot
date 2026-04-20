import { z } from "zod";

const entrySchema = z.object({ q: z.string(), a: z.string() });

export function tryStaticFaqMatch(userText: string): string | null {
  const raw =
    process.env.STATIC_FAQ_JSON ?? process.env.NEXT_PUBLIC_STATIC_FAQ_JSON ?? "";
  if (!raw.trim()) return null;
  try {
    const parsed = z.array(entrySchema).safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const qn = userText.trim().toLowerCase();
    for (const { q, a } of parsed.data) {
      if (qn.includes(q.toLowerCase()) || q.toLowerCase().includes(qn)) return a;
    }
  } catch {
    return null;
  }
  return null;
}
