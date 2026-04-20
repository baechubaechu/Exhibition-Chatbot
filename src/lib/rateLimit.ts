type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

/** 서버리스 단일 인스턴스 한정 단순 레이트리밋(전시 데모용). */
export function rateLimitOrThrow(key: string): void {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  const max = Number(process.env.RATE_LIMIT_MAX ?? 20);
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return;
  }
  if (b.count >= max) {
    const err = new Error("RATE_LIMITED");
    (err as Error & { status?: number }).status = 429;
    throw err;
  }
  b.count += 1;
}
