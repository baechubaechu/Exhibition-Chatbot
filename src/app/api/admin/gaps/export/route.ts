import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isValidAdminCookie } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function toMarkdown(rows: Record<string, unknown>[]): string {
  const lines = ["# 미해결(또는 저신뢰) 질문 목록", ""];
  for (const r of rows) {
    lines.push(`## ${r.exhibition_day} — ${r.id}`);
    lines.push(`- outcome: ${r.outcome}`);
    lines.push(`- review: ${r.review_status}`);
    lines.push("");
    lines.push("### 질문");
    lines.push(String(r.user_message));
    lines.push("");
    lines.push("### 답변(노출)");
    lines.push(String(r.assistant_message));
    lines.push("");
    lines.push("### retrieval_debug");
    lines.push("```json");
    lines.push(JSON.stringify(r.retrieval_debug, null, 2));
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}

function toCsv(rows: Record<string, unknown>[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const header = ["id", "exhibition_day", "outcome", "review_status", "user_message", "assistant_message"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        esc(String(r.id)),
        esc(String(r.exhibition_day)),
        esc(String(r.outcome)),
        esc(String(r.review_status)),
        esc(String(r.user_message)),
        esc(String(r.assistant_message)),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  if (!isValidAdminCookie(req.headers.get("cookie"))) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const day = searchParams.get("day");
  const format = searchParams.get("format") ?? "md";
  const parsedDay = day ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(day) : null;
  if (!day || !parsedDay?.success) {
    return NextResponse.json({ error: "day=YYYY-MM-DD 필수" }, { status: 400 });
  }
  if (format !== "md" && format !== "csv") {
    return NextResponse.json({ error: "format은 md 또는 csv" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("chat_turns")
    .select("id, exhibition_day, user_message, assistant_message, outcome, review_status, retrieval_debug")
    .eq("exhibition_day", parsedDay.data)
    .eq("gap_candidate", true)
    .eq("review_status", "pending")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Record<string, unknown>[];
  const body = format === "csv" ? toCsv(rows) : toMarkdown(rows);
  const name = `gaps-${parsedDay.data}.${format === "csv" ? "csv" : "md"}`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
