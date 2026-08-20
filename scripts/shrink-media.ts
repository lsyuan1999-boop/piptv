/**
 * 把图片库里的大图重新压小，替换掉原来的 Blob 对象。
 *
 * 早期上传没有压缩，库里躺着几 MB 的原图。next/image 取原图的超时是写死的
 * （约 7 秒），国内线路拉这种大图必然超时，卡片就变成裂图 —— 这个脚本是
 * 给存量数据补课，新图在浏览器里就压好了（见 lib/compress.ts）。
 *
 * 用法: npx tsx scripts/shrink-media.ts [--dry]
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

/** 和 lib/compress.ts 保持一致 */
const MAX_EDGE = 1280;
const QUALITY = 82;
/** 小于这个体积的不用动 */
const SKIP_UNDER = 200 * 1024;

async function main() {
  const dry = process.argv.includes("--dry");
  const purge = process.argv.includes("--purge");
  const { db } = await import("../lib/db");
  const { media } = await import("../lib/schema");
  const { eq } = await import("drizzle-orm");
  const { put, del } = await import("@vercel/blob");
  const sharp = (await import("sharp")).default;

  const rows = await db.select().from(media);
  console.log(`图片库共 ${rows.length} 张\n`);

  let saved = 0;
  let touched = 0;

  for (const row of rows) {
    const label = `${row.filename} (${(row.size / 1024).toFixed(0)} KB)`;
    if (row.size < SKIP_UNDER) {
      console.log(`  跳过  ${label} —— 已经够小`);
      continue;
    }

    // 从 Blob 取回原图。这一步可能很慢，正是问题本身
    const res = await fetch(row.url);
    if (!res.ok) {
      console.log(`  ✗ 失败  ${label} —— 取图 HTTP ${res.status}`);
      continue;
    }
    const input = Buffer.from(await res.arrayBuffer());

    const out = await sharp(input)
      .rotate() // 按 EXIF 摆正，否则手机竖拍的图会躺着
      .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();

    if (out.length >= row.size) {
      console.log(`  跳过  ${label} —— 压完反而更大`);
      continue;
    }

    const meta = await sharp(out).metadata();
    const pct = ((1 - out.length / row.size) * 100).toFixed(0);
    console.log(
      `  ✓ 压缩  ${label} → ${(out.length / 1024).toFixed(0)} KB (省 ${pct}%)`,
    );
    saved += row.size - out.length;
    touched++;

    if (dry) continue;

    // 传新的，改库，再删旧的。顺序很重要：先确保新图可用，
    // 中途挂掉最多留个孤儿对象，不会让卡片指向一个已删除的地址
    const name = row.filename.replace(/\.[^.]+$/, "") + ".webp";
    const blob = await put(name, out, {
      access: "public",
      addRandomSuffix: true,
    });

    await db
      .update(media)
      .set({
        url: blob.url,
        size: out.length,
        mimeType: "image/webp",
        filename: name,
        width: meta.width ?? null,
        height: meta.height ?? null,
      })
      .where(eq(media.id, row.id));

    // 引用这张图的场次也要跟着改，否则卡片还指着旧地址
    const { streams } = await import("../lib/schema");
    const { sql } = await import("drizzle-orm");
    await db
      .update(streams)
      .set({ coverUrl: blob.url })
      .where(sql`${streams.coverUrl} = ${row.url}`);

    // 删旧对象是不可逆的，默认留着 —— 确认新图都正常之后再加 --purge 清理，
    // 或者直接去 Blob 面板手动删。留着的代价只是占点空间，删错了就找不回来了
    if (purge) {
      await del(row.url).catch(() => {
        console.log(`    (旧对象删除失败，可以之后在 Blob 面板手动清理)`);
      });
    }
  }

  console.log(
    `\n${dry ? "[预演] " : ""}处理 ${touched} 张，共省下 ${(saved / 1024 / 1024).toFixed(2)} MB`,
  );
  if (dry) {
    console.log("这是预演，去掉 --dry 才会真正写入");
  } else if (touched > 0 && !purge) {
    console.log("旧图仍留在 Blob 上。确认卡片显示正常后，加 --purge 再跑一次可清理");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
