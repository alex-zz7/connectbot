import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * Single-admin auth: the console is protected by one ADMIN_PASSWORD env var.
 *
 * A successful login sets a cookie holding an HMAC derived from the password.
 * The token is stateless — no sessions table — and rotating the password
 * invalidates every existing cookie at once.
 */

export const ADMIN_COOKIE = "cb_admin";

function password(): string {
  return process.env.ADMIN_PASSWORD || "";
}

export function adminToken(): string {
  return createHmac("sha256", password()).update("connectbot-admin-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPassword(candidate: string): boolean {
  const expected = password();
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

export async function isAdmin(): Promise<boolean> {
  if (!password()) return false;
  const jar = await cookies();
  const cookie = jar.get(ADMIN_COOKIE)?.value || "";
  return cookie.length > 0 && safeEqual(cookie, adminToken());
}
