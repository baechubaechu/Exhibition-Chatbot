import { NextRequest } from "next/server";
import { z } from "zod";
import { translateToEnglishBatch } from "@/lib/translateDisplay";
import { rateLimitOrThrow } from "@/lib/rateLimit";

export const runtime = "nodejs";

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        text: z.string().max(8000),
      }),
    )
    .min(1)
    .max(20),
});

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  try {
    rateLimitOrThrow(`translate-display:${clientIp(req)}`);
  } catch (e) {
    if ((e as Error).message === "RATE_LIMITED") {
      return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    throw e;
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const totalChars = body.items.reduce((n, x) => n + x.text.length, 0);
  if (totalChars > 24_000) {
    return Response.json({ error: "Payload too large." }, { status: 400 });
  }

  const texts = body.items.map((x) => x.text);
  const translations = await translateToEnglishBatch(texts);
  const results = body.items.map((item, i) => ({
    id: item.id,
    translation: translations[i] ?? item.text,
  }));

  return Response.json({ items: results });
}
