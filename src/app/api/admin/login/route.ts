import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminCookieName, buildAdminCookieValue } from "@/lib/adminAuth";

export const runtime = "nodejs";

const schema = z.object({ password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "ADMIN_SECRET 미설정" }, { status: 500 });
  }
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 본문" }, { status: 400 });
  }
  if (body.password !== secret) {
    return NextResponse.json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(adminCookieName(), buildAdminCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
