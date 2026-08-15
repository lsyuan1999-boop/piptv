import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { media } from "@/lib/schema";
import { verifySession } from "@/lib/auth";

export const runtime = "nodejs";

/** 允许的图片类型 */
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** 最大文件大小：4MB */
const MAX_SIZE = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  // 检查 Blob token 是否存在
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN 未设置");
    return NextResponse.json(
      { error: "服务器配置错误：缺少 Blob 存储令牌" },
      { status: 500 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "未选择文件" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "只支持 JPG、PNG、WebP 格式" },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "文件太大，最大 4MB" },
        { status: 400 },
      );
    }

    // 上传到 Vercel Blob（公开访问）
    const blob = await put(file.name, file, {
      access: "public",
      addRandomSuffix: true,
    });

    // 读取图片尺寸
    const buffer = await file.arrayBuffer();
    const dimensions = await getImageDimensions(buffer, file.type);

    // 存入数据库
    const [record] = await db
      .insert(media)
      .values({
        filename: file.name,
        url: blob.url,
        size: file.size,
        mimeType: file.type,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
      })
      .returning();

    return NextResponse.json({ media: record });
  } catch (error) {
    console.error("上传失败：", error);
    return NextResponse.json(
      { error: "上传失败，请重试" },
      { status: 500 },
    );
  }
}

/** 从图片二进制数据中读取宽高 */
async function getImageDimensions(
  buffer: ArrayBuffer,
  mimeType: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const bytes = new Uint8Array(buffer);

    if (mimeType === "image/png") {
      // PNG：读取 IHDR 块（偏移 16 开始的 8 字节）
      if (bytes.length < 24) return null;
      const width =
        (bytes[16]! << 24) |
        (bytes[17]! << 16) |
        (bytes[18]! << 8) |
        bytes[19]!;
      const height =
        (bytes[20]! << 24) |
        (bytes[21]! << 16) |
        (bytes[22]! << 8) |
        bytes[23]!;
      return { width, height };
    }

    if (mimeType === "image/jpeg") {
      // JPEG：查找 SOF0/SOF2 标记
      let offset = 2; // 跳过 FFD8
      while (offset < bytes.length - 9) {
        if (bytes[offset] !== 0xff) break;
        const marker = bytes[offset + 1];
        // SOF0 (0xC0) 或 SOF2 (0xC2)
        if (marker === 0xc0 || marker === 0xc2) {
          const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
          const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
          return { width, height };
        }
        // 跳到下一个标记
        const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
        offset += 2 + length;
      }
    }

    // WebP 或解析失败：返回 null，数据库字段允许空值
    return null;
  } catch {
    return null;
  }
}
