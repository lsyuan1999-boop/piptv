/**
 * 量海报位有没有填满卡片高度。宽度封顶后 aspect-ratio 会反过来压低高度，
 * 下边缘空出一条 —— 这个只量高度，不看宽度。
 */
import { chromium } from "playwright-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function main() {
  const url = process.argv[2] || "http://localhost:3000/";
  const browser = await chromium.launch({ executablePath: EDGE });

  for (const width of [320, 390, 620]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);

    for (const state of ["closed", "open"] as const) {
      if (state === "open") {
        await page.evaluate(() => {
          document
            .querySelectorAll<HTMLButtonElement>("[data-card-surface]")
            .forEach((b) => b.click());
        });
        await page.waitForTimeout(500);
      }

      const rows = await page.evaluate(() => {
        const out: { cardH: number; posterH: number; gap: number }[] = [];
        document.querySelectorAll("[data-card-surface]").forEach((card) => {
          const poster = card.querySelector<HTMLElement>(
            "[data-poster]",
          );
          if (!poster) return;
          const cr = card.getBoundingClientRect();
          const pr = poster.getBoundingClientRect();
          out.push({
            cardH: cr.height,
            posterH: pr.height,
            // 海报下缘离卡片下缘还差多少（扣掉 5px 内缩）
            gap: cr.bottom - 5 - pr.bottom,
          });
        });
        return out;
      });

      const worst = Math.max(...rows.map((r) => r.gap));
      const s = rows[0];
      console.log(
        `${width}px ${state}: 卡高 ${s.cardH.toFixed(0)} 海报高 ${s.posterH.toFixed(0)} 下方空隙 ${worst.toFixed(1)}px ${worst > 1 ? "✗" : "✓"}`,
      );
    }
    await page.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
