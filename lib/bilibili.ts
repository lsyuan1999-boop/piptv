/**
 * 读哔哩哔哩直播间的真实开播状态。
 *
 * 顶部那块横幅只看这里，不看日程表 —— 排了 20:00 但 20:20 才开，
 * 或者临时提前开播，页面都得跟着真实情况走。
 *
 * 注意这是逆向出来的接口，B 站没承诺过它稳定。所以每个失败路径都要
 * 退回 null，让调用方自己决定降级怎么显示，绝不能让首页因为它渲染不出来。
 */

/** 房间信息接口，实测不需要登录、Cookie 或签名。 */
const ROOM_INFO_API = "https://api.live.bilibili.com/room/v1/Room/get_info";

/**
 * 拿状态的缓存时间（秒）。
 *
 * 每个访客都去捅一次 B 站是不礼貌的，这里走 Next 的 fetch 缓存，
 * 同一台服务器上 30 秒内的请求共用一份结果。30 秒够快了 ——
 * 开播这件事没人会盯着秒表看。
 */
const CACHE_SECONDS = 30;

export type LiveStatus = {
  /** true = 真的在播。轮播（放录像）算没播。 */
  live: boolean;
  /** 直播间当前标题，B 站上设的那个，不是我们日程表里的标题。 */
  title: string | null;
  /** 开播时刻，未开播时为 null。 */
  startedAtMs: number | null;
  /** 人气值。B 站自己的口径，不是真实人数。 */
  online: number | null;
  /** 直播间封面 / 关播时的占位图。 */
  coverUrl: string | null;
  /** 规范化后的直播间地址，短号会被换成真实房间号。 */
  roomUrl: string;
};

/**
 * 从后台填的地址里抠出房间号。
 *
 * 后台允许填纯数字或整条网址（见 actions.ts 的 normalizeLiveUrl），
 * 所以这里两种都要认。取路径最后一段的数字。
 */
export function parseRoomId(liveUrl: string): string | null {
  const trimmed = liveUrl.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    // 只认 bilibili 自己的域名，别让配置错的地址把请求发到别处去
    if (!/(^|\.)bilibili\.com$/i.test(url.hostname)) return null;
    const seg = url.pathname.split("/").filter(Boolean).pop();
    return seg && /^\d+$/.test(seg) ? seg : null;
  } catch {
    return null;
  }
}

/**
 * B 站返回的 live_time 是「2026-08-14 14:03:04」这种没有时区的字符串，
 * 实际是北京时间。直接 new Date() 会按服务器本地时区解释 ——
 * Vercel 上是 UTC，会算错 8 小时，所以显式按 +08:00 拼。
 */
function parseLiveTime(raw: unknown): number | null {
  if (typeof raw !== "string" || raw.startsWith("0000")) return null;
  const ms = Date.parse(`${raw.replace(" ", "T")}+08:00`);
  return Number.isNaN(ms) ? null : ms;
}

/** 空字符串在 B 站的返回里等于「没有」，统一成 null。 */
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * 查一次直播间状态。任何异常都返回 null，调用方负责降级。
 */
export async function fetchLiveStatus(
  liveUrl: string,
): Promise<LiveStatus | null> {
  const roomId = parseRoomId(liveUrl);
  if (!roomId) return null;

  try {
    const res = await fetch(
      `${ROOM_INFO_API}?room_id=${encodeURIComponent(roomId)}`,
      {
        headers: {
          // 不带这两个头 B 站有时会返回风控页面
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://live.bilibili.com/",
        },
        next: { revalidate: CACHE_SECONDS },
      },
    );
    if (!res.ok) return null;

    const json: unknown = await res.json();
    if (typeof json !== "object" || json === null) return null;
    const body = json as { code?: unknown; data?: unknown };
    if (body.code !== 0 || typeof body.data !== "object" || body.data === null) {
      return null;
    }

    const d = body.data as Record<string, unknown>;
    // live_status: 0 未开播 / 1 直播中 / 2 轮播（放录像）
    const live = d.live_status === 1;

    // 填的可能是短号，返回的 room_id 才是真实房间号 ——
    // 用它拼地址，短号跳转偶尔会绕一次
    const realId =
      typeof d.room_id === "number" && d.room_id > 0 ? d.room_id : roomId;

    return {
      live,
      title: str(d.title),
      startedAtMs: live ? parseLiveTime(d.live_time) : null,
      online: typeof d.online === "number" ? d.online : null,
      coverUrl: str(d.keyframe) ?? str(d.user_cover),
      roomUrl: `https://live.bilibili.com/${realId}`,
    };
  } catch {
    return null;
  }
}
