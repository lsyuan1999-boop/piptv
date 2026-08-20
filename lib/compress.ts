/**
 * 上传前在浏览器里把图压小。
 *
 * 卡片上海报最宽也就 400 出头（卡片封顶 672px，海报占一半），存 2560px 宽的
 * 原图纯属浪费：Blob 空间、服务器取图时间、CDN 缓存都要为它买单。国内线路
 * 拉一张 2MB 的原图能要几十秒，next/image 那边直接超时变裂图。
 *
 * 压到 1280px 宽是留了余量的 —— 够 3x 屏用，也够以后卡片做大。
 * 用 canvas 而不是等服务端处理：省一次大文件上传，用户在弱网下也快得多。
 */

/** 压缩后的最大边长。超过这个尺寸的图会等比缩小。 */
const MAX_EDGE = 1280;
/** JPEG/WebP 质量。0.82 是画质和体积的常见甜点，再低会看出色带。 */
const QUALITY = 0.82;
/** 小于这个体积的图不值得压，直接原样传。 */
const SKIP_UNDER = 200 * 1024;

export type CompressResult = {
  file: File;
  /** 原始体积，用来给用户看压缩效果 */
  originalSize: number;
};

/**
 * 需要时压缩图片，不需要就原样返回。
 * 任何一步失败都退回原文件 —— 压缩是优化，不该成为上传失败的理由。
 */
export async function compressImage(file: File): Promise<CompressResult> {
  const originalSize = file.size;

  // 小图和不认识的格式直接放过。GIF 压了会丢动画
  if (file.size < SKIP_UNDER || file.type === "image/gif") {
    return { file, originalSize };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

    // 已经够小就不重新编码了，避免二次压缩掉画质
    if (scale === 1 && file.size < 800 * 1024) {
      bitmap.close();
      return { file, originalSize };
    }

    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { file, originalSize };
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    // 统一转 WebP：同画质下比 JPEG 小三成，浏览器都支持了。
    // 截图类 PNG 转过去省得最多 —— 库里那张 1.8MB 的就是这种
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY),
    );
    if (!blob || blob.size >= file.size) {
      // 压完反而更大（本来就是压过的小图），保留原文件
      return { file, originalSize };
    }

    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return {
      file: new File([blob], name, { type: "image/webp" }),
      originalSize,
    };
  } catch {
    // 解码失败（格式怪、图损坏）就原样传，让服务端去判断
    return { file, originalSize };
  }
}

/** 「1.8 MB」这样的可读体积。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
