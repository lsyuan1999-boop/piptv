import { fetchLiveStatus } from "@/lib/bilibili";
import { getSettings } from "@/lib/queries";

/**
 * 前端轮询开播状态用。
 *
 * 直播间地址存在数据库里，所以这条路由必须每次请求都跑（默认行为，
 * Route Handler 不缓存）。真正的挡流量在 fetchLiveStatus 里 ——
 * 那层 fetch 缓存 30 秒，所以打过来的请求多也不会都落到 B 站。
 *
 * 不接受任何参数：房间号只能来自后台设置，不能由调用方指定，
 * 否则这就成了一个能查任意直播间的公开代理。
 */
export async function GET(): Promise<Response> {
  const config = await getSettings();
  if (!config.liveUrl) {
    return Response.json({ configured: false, live: false });
  }

  const status = await fetchLiveStatus(config.liveUrl);
  if (!status) {
    // 查不到就明说，前端会保持上一次的显示而不是跳成「未开播」
    return Response.json({ configured: true, unknown: true, live: false });
  }

  return Response.json({ configured: true, ...status });
}
