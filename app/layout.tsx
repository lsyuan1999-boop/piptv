import type { Metadata, Viewport } from "next";
// 霞鹜文楷（屏显版，MIT）。包内按 unicode-range 切成 97 个子集，
// 浏览器只下载页面实际用到的那几个（每个 ~60 KB），不是一次拉 20 MB。
// 只引这一个文件：包里的 gb 版声明了同名 font-family，一起引会得到两套
// unicode-range 重叠的 @font-face。
import "lxgw-wenkai-screen-webfont/lxgwwenkaiscreen.css";
import "./globals.css";

const title = process.env.NEXT_PUBLIC_SITE_TITLE || "直播日程";

export const metadata: Metadata = {
  title,
  description: "查看接下来一周的直播安排",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0f" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh antialiased">
        {children}
      </body>
    </html>
  );
}
