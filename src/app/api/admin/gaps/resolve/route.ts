import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isValidAdminCookie } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  if (!isValidAdminCookie(req.headers.get("cookie"))) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "잘못된 본문" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("chat_turns")
    .update({ review_status: "resolved", notes: body.notes ?? null })
    .in("id", body.ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: body.ids.length });
}
