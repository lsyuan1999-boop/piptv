import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * 海报图存在 Vercel Blob 上，那是个独立域名，不走我们自己配的 CDN。
     * 允许 next/image 代理它之后，图片改从本站域名发出，Cloudflare 才缓存得到，
     * 顺带还能压缩尺寸和转 WebP/AVIF —— 国内不翻墙加载慢主要就卡在这。
     */
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // 早期手填的 B 站图还在库里，一起放行，否则那些卡片会变成裂图
      { protocol: "https", hostname: "*.hdslb.com" },
    ],
    /**
     * 卡片里海报最宽只占卡片的一半，而卡片本身封顶 672px（max-w-2xl），
     * 所以真正需要的宽度撑死 400 出头。列出来的这几档覆盖 1x~3x 屏，
     * 再大的档位只会让 CDN 多缓存几份没人用的图。
     */
    imageSizes: [96, 128, 192, 256, 384],
    deviceSizes: [640, 750, 828, 1080],
    /**
     * 缓存一个月：海报图上传后基本不改，URL 带随机后缀，改了也是新地址。
     *
     * 注意 Next 取原图的超时是写死的（约 7 秒），配置里改不了。所以图必须
     * 在上传时就压小 —— 见 lib/compress.ts。存量的未压缩老图会超时变裂图，
     * 用 scripts/shrink-media.ts 重新处理一遍。
     */
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;
