/**
 * 用系统装的 Edge 给页面截图，用来肉眼核对视觉效果。
 * 用法: npx tsx scripts/shot.ts [url] [out.png]
 */
import { chromium } from "playwright-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function main() {
  const url = process.argv[2] || "http://localhost:3000/";
  const out = process.argv[3] || "shot.png";

  const browser = await chromium.launch({ executablePath: EDGE });
  const page = await browser.newPage({
    viewport: { width: 620, height: 1100 },
    deviceScaleFactor: 2, // 2x 才看得清线条细节
  });

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(url, { waitUntil: "networkidle" });
  // 等字体加载完，否则截到的是回退字体
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  await page.screenshot({ path: out, fullPage: false });
  console.log(`已截图 → ${out}`);
  if (errors.length) {
    console.log("页面报错:");
    errors.forEach((e) => console.log("  " + e.slice(0, 200)));
  } else {
    console.log("无页面报错");
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
