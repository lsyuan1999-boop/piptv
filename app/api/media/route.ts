import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { media } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { verifySession } from "@/lib/auth";

export const runtime = "nodejs";

/** 获取图片库列表 */
export async function GET() {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const items = await db
    .select()
    .from(media)
    .orderBy(desc(media.uploadedAt))
    .limit(100);

  return NextResponse.json({ media: items });
}
