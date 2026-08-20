/**
 * 校验海报层的几何：宽度有没有越过上限、斜线起点有没有落在左下角。
 *
 * 斜线起点是这套视觉的命门 —— 135deg 下点 (x,y) 在渐变上的位置是
 * (x+y)/(W+H)，左下角 (0,H) 落在 1/(1+宽高比)。遮罩的第一个色标必须
 * 精确等于这个值，偏了就会露出锐利竖边或者左下角空一块。
 * 加了宽度封顶之后盒子比例不再等于 aspect × CROP，所以必须拿实测值来验。
 *
 * 用法: npx tsx scripts/check-poster.ts [url]
 */
import { chromium } from "playwright-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const WIDTHS = [320, 360, 390, 430, 620, 900];

/** 和 stream-card.tsx 里的 MAX_POSTER 保持一致 */
const MAX = { closed: 0.38, open: 0.5 };

type Row = {
  cardW: number;
  posterW: number;
  posterH: number;
  ratio: number;
  corner: number | null;
};

async function main() {
  const url = process.argv[2] || "http://localhost:3000/";
  const browser = await chromium.launch({ executablePath: EDGE });
  let failed = 0;

  const check = (label: string, cond: boolean) => {
    console.log(`${cond ? "✓" : "✗"} ${label}`);
    if (!cond) failed++;
  };

  for (const width of WIDTHS) {
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

      const rows: Row[] = await page.evaluate(() => {
        const out: Row[] = [];
        document.querySelectorAll("[data-card-surface]").forEach((card) => {
          const poster = card.querySelector<HTMLElement>(
            "[data-poster]",
          );
          if (!poster) return;
          const pr = poster.getBoundingClientRect();
          const mask =
            getComputedStyle(poster).maskImage ||
            getComputedStyle(poster).webkitMaskImage;
          // 取渐变里第一个百分比，就是 transparent 的色标位置
          const m = mask.match(/([\d.]+)%/);
          out.push({
            cardW: card.getBoundingClientRect().width,
            posterW: pr.width,
            posterH: pr.height,
            ratio: pr.width / card.getBoundingClientRect().width,
            corner: m ? Number(m[1]) : null,
          });
        });
        return out;
      });

      if (rows.length === 0) {
        console.log(`  (${width}px ${state}: 没有带海报的卡片，跳过)`);
        continue;
      }

      const cap = MAX[state];
      const worst = Math.max(...rows.map((r) => r.ratio));
      // 留 0.5 个百分点容差：亚像素取整会让实测比例略微超过设定值
      check(
        `${width}px ${state}: 海报最宽 ${(worst * 100).toFixed(1)}% ≤ ${(cap * 100).toFixed(0)}%`,
        worst <= cap + 0.005,
      );

      // 斜线起点：色标必须等于 100/(1+实测比例)
      const bad = rows.filter((r) => {
        if (r.corner === null) return true;
        const expected = 100 / (1 + r.posterW / r.posterH);
        return Math.abs(r.corner - expected) > 1.5;
      });
      const sample = rows[0];
      const expectedSample = 100 / (1 + sample.posterW / sample.posterH);
      check(
        `${width}px ${state}: 斜线起点对齐左下角（色标 ${sample.corner?.toFixed(1)}% ≈ ${expectedSample.toFixed(1)}%）`,
        bad.length === 0,
      );

      // 文字区不能被海报压住：海报左缘要在文字区右缘之外
      const overlap = await page.evaluate(() => {
        let worstPx = 0;
        document.querySelectorAll("[data-card-surface]").forEach((card) => {
          const poster = card.querySelector<HTMLElement>(
            "[data-poster]",
          );
          const title = card.querySelector("h3");
          if (!poster || !title) return;
          const pr = poster.getBoundingClientRect();
          const tr = title.getBoundingClientRect();
          // 标题右缘越过海报左缘多少（正数=重叠）
          worstPx = Math.max(worstPx, tr.right - pr.left);
        });
        return worstPx;
      });
      // 渐隐带能吃掉零点几像素的探入，但不能真压到图上。
      // 容差 1px：不同视口下 calc 的百分比会落在亚像素上
      check(
        `${width}px ${state}: 标题没被海报压住（越界 ${overlap.toFixed(2)}px）`,
        overlap <= 1,
      );
    }

    await page.close();
  }

  await browser.close();
  console.log(failed === 0 ? "\n全部通过" : `\n${failed} 项失败`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
