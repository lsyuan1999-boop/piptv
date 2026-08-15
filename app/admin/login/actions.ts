"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  clearRateLimit,
  createSessionToken,
  rateLimit,
  safeEqual,
  sessionCookieOptions,
} from "@/lib/auth";

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export async function login(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const ip = await clientIp();
  const limit = rateLimit(ip);
  if (!limit.ok) {
    return `尝试次数太多，请等 ${limit.retryAfterSec} 秒后再试`;
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return "服务端还没设置管理密码，请检查环境变量 ADMIN_PASSWORD";
  }

  const input = String(formData.get("password") ?? "");
  if (!safeEqual(input, expected)) {
    return "密码不对，请再试一次";
  }

  clearRateLimit(ip);
  (await cookies()).set(
    SESSION_COOKIE,
    await createSessionToken(),
    sessionCookieOptions,
  );
  redirect("/admin");
}
