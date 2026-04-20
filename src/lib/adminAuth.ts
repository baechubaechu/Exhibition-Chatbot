import { createHmac, timingSafeEqual } from "crypto";

export function adminCookieName(): string {
  return "exhibit_admin";
}

export function buildAdminCookieValue(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error("ADMIN_SECRET 미설정");
  return createHmac("sha256", secret).update("exhibit-admin-v1").digest("base64url");
}

export function isValidAdminCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader || !process.env.ADMIN_SECRET) return false;
  const expected = buildAdminCookieValue();
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k, decodeURIComponent(rest.join("="))];
    }),
  );
  const got = cookies[adminCookieName()];
  if (!got || got.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}
