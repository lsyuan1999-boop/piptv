/**
 * 把图片库里的图全部下载到本地，留个档。
 *
 * Blob 上的对象一旦删掉就找不回来了，改动前先存一份。
 * 存的是原图，不做任何压缩转码。
 *
 * 用法: npx tsx scripts/download-media.ts [目录]
 */
import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

loadEnvConfig(process.cwd());

async function main() {
  const dir = process.argv[2] || "media-backup";
  const { db } = await import("../lib/db");
  const { media } = await import("../lib/schema");

  await mkdir(dir, { recursive: true });

  const rows = await db.select().from(media);
  console.log(`图片库共 ${rows.length} 张，存到 ${dir}/\n`);

  let ok = 0;
  for (const row of rows) {
    // 文件名可能重复（同名不同次上传），带上 id 保证不互相覆盖
    const safe = row.filename.replace(/[/\\:*?"<>|]/g, "_");
    const out = join(dir, `${row.id}-${safe}`);

    process.stdout.write(`  ${row.filename} (${(row.size / 1024).toFixed(0)} KB) … `);
    try {
      // 大图从国内拉可能要几十秒，给足时间
      const res = await fetch(row.url, {
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) {
        console.log(`✗ HTTP ${res.status}`);
        continue;
      }
      await writeFile(out, Buffer.from(await res.arrayBuffer()));
      console.log("✓");
      ok++;
    } catch (e) {
      console.log(`✗ ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n下载成功 ${ok}/${rows.length} 张 → ${dir}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
