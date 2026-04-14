import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isValidAdminCookie } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isValidAdminCookie(req.headers.get("cookie"))) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const day = searchParams.get("day");
  const pendingOnly = searchParams.get("pendingOnly") === "1";
  const parsedDay = day ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(day) : null;
  if (day && !parsedDay?.success) {
    return NextResponse.json({ error: "day 형식은 YYYY-MM-DD" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("chat_turns")
    .select("id, created_at, exhibition_day, session_id, user_message, assistant_message, outcome, gap_candidate, review_status, retrieval_debug")
    .eq("gap_candidate", true)
    .order("created_at", { ascending: false })
    .limit(500);
  if (parsedDay?.success) q = q.eq("exhibition_day", parsedDay.data);
  if (pendingOnly) q = q.eq("review_status", "pending");
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
