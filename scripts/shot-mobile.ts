/**
 * 在几个窄视口下截图，收起和展开各来一张 —— 海报挤压文字只在窄屏 + 展开
 * 时才明显，固定 620px 的 shot.ts 看不出来。
 * 用法: npx tsx scripts/shot-mobile.ts [url]
 */
import { chromium } from "playwright-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

/** iPhone SE / iPhone 15 / 小平板，覆盖最窄到临界 */
const WIDTHS = [320, 390, 620];

async function main() {
  const url = process.argv[2] || "http://localhost:3000/";
  const browser = await chromium.launch({ executablePath: EDGE });

  for (const width of WIDTHS) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
    });
    // 不用 networkidle：直播横幅在轮询状态，网络永远不会空闲
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);

    await page.screenshot({ path: `shot-${width}-closed.png`, fullPage: false });

    // 展开所有卡片：挤压在展开态最严重
    await page.evaluate(() => {
      document
        .querySelectorAll<HTMLButtonElement>("[data-card-surface]")
        .forEach((b) => b.click());
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `shot-${width}-open.png`, fullPage: false });

    // 量一下海报到底占了多宽，比看图更硬
    const measured = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll("[data-card-surface]").forEach((card, i) => {
        const poster = card.querySelector<HTMLElement>("[data-poster]");
        if (!poster) return;
        const cw = card.getBoundingClientRect().width;
        const pw = poster.getBoundingClientRect().width;
        out.push(`  卡${i + 1}: 卡片 ${cw.toFixed(0)}px, 海报 ${pw.toFixed(0)}px (${((pw / cw) * 100).toFixed(1)}%)`);
      });
      return out;
    });
    console.log(`${width}px 展开态:`);
    measured.forEach((m) => console.log(m));

    await page.close();
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
