import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "gs_admin";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 天，避免管理员频繁重新登录

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("缺少环境变量 AUTH_SECRET（至少 16 位随机字符）");
  }
  return new TextEncoder().encode(s);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === "admin";
  } catch {
    return false;
  }
}

/** 从 cookie 中验证当前会话，用于 API 路由鉴权。 */
export async function verifySession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SEC,
};

/** 定时比较，避免通过响应时间差推测密码。 */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // 长度不同也要跑完循环，保持耗时一致
  let diff = ab.length === bb.length ? 0 : 1;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/**
 * 登录失败限流。同一 IP 每分钟最多 5 次。
 * serverless 下每个实例各有一份计数，不算严格，但足以阻挡简单的暴力尝试。
 * 真正的安全下限仍然是密码强度本身。
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

export function rateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfterSec: 0 };
  }
  rec.count++;
  if (rec.count > MAX_ATTEMPTS) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((rec.resetAt - now) / 1000),
    };
  }
  return { ok: true, retryAfterSec: 0 };
}

export function clearRateLimit(ip: string): void {
  attempts.delete(ip);
}
