/**
 * 量海报图实际下载了多少字节、请求打到哪个域名。
 * 图片走不走本站代理，是国内加载快慢的分水岭 —— 走 Blob 独立域名就绕过了 CDN。
 */
import { chromium } from "playwright-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function main() {
  const url = process.argv[2] || "http://localhost:3000/";
  const browser = await chromium.launch({ executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });

  const hits: { url: string; bytes: number; type: string }[] = [];
  page.on("response", async (res) => {
    const ct = res.headers()["content-type"] || "";
    if (!ct.startsWith("image/")) return;
    let bytes = Number(res.headers()["content-length"] || 0);
    if (!bytes) {
      try {
        bytes = (await res.body()).length;
      } catch {
        /* 有些响应读不到 body，忽略 */
      }
    }
    hits.push({ url: res.url(), bytes, type: ct });
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  // 海报是 lazy 的，滚到底才会全部触发
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3000);

  let proxied = 0;
  let direct = 0;
  let total = 0;
  for (const h of hits) {
    const isProxy = h.url.includes("/_next/image");
    if (isProxy) proxied++;
    else if (/blob\.vercel-storage|hdslb/.test(h.url)) direct++;
    total += h.bytes;
    const short = isProxy
      ? `/_next/image?...${h.url.slice(-40)}`
      : h.url.slice(0, 70);
    console.log(
      `  ${(h.bytes / 1024).toFixed(0).padStart(5)} KB  ${h.type.padEnd(12)} ${short}`,
    );
  }

  console.log(`\n图片请求 ${hits.length} 个，共 ${(total / 1024).toFixed(0)} KB`);
  console.log(`走本站代理 ${proxied} 个，直连图床 ${direct} 个`);
  if (direct > 0) {
    console.log("✗ 还有图绕过代理，这些在国内会慢");
  } else if (proxied > 0) {
    console.log("✓ 海报图全部走代理");
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
