"use client";

import { useEffect, useState } from "react";
import type { LiveStatus } from "@/lib/bilibili";
import { PALETTES, paletteByKey } from "@/lib/themes";
import { humanizeCountdown } from "@/lib/time";
import { useNowMs } from "@/lib/use-clock";

/**
 * 顶部横幅：只看哔哩哔哩直播间的真实状态，跟下面的日程表完全无关。
 *
 * 为什么不看日程表：排了 20:00 不代表 20:00 真的开了，临时提前或者拖后
 * 都很常见。这块只回答「现在能不能点进去看」这一个问题，答案只有 B 站知道。
 *
 * 首屏状态由服务端带下来（initial），保证不闪一下「未开播」再跳成在播。
 * 挂载后自己轮询，页面不重新加载也能等到开播。
 */

/**
 * 轮询间隔。
 *
 * 30 秒是服务端那层 fetch 缓存的寿命，比它更勤快只是白打自己的服务器，
 * 拿回来还是同一份缓存。取 35 秒，让缓存有时间过期。
 */
const POLL_MS = 35_000;

type Payload =
  | ({ configured: true; unknown?: false } & LiveStatus)
  | { configured: true; unknown: true; live: false }
  | { configured: false; live: false };

export default function LiveBanner({
  initial,
  serverNowMs,
}: {
  initial: Payload;
  serverNowMs: number;
}) {
  const [data, setData] = useState<Payload>(initial);
  const now = useNowMs(serverNowMs);

  useEffect(() => {
    // 没配直播间地址的话没什么可轮询的
    if (!initial.configured) return;

    let cancelled = false;

    async function poll() {
      // 标签页在后台就别查了 —— 挂着一整天的标签页会白发几千个请求
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/live-status", { cache: "no-store" });
        if (!res.ok) return;
        const next: Payload = await res.json();
        // 查不到状态时保持原样，不要把界面跳成「未开播」骗人
        if (!cancelled && !("unknown" in next && next.unknown)) setData(next);
      } catch {
        // 网络抖一下就算了，下一轮会再试
      }
    }

    const timer = setInterval(poll, POLL_MS);
    // 切回前台立刻查一次，别让人对着过期状态等一轮
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [initial.configured]);

  // 后台还没填地址：这块整个不出现，别给观众看一个点不动的按钮
  if (!data.configured) return null;

  const live = data.live;
  const status = "unknown" in data && data.unknown ? null : (data as LiveStatus);
  // 固定配色，不跟着场次走 —— 这块跟日程表无关，颜色也不该跟着变
  const palette = paletteByKey("peach") ?? PALETTES[0];
  const elapsedMs = status?.startedAtMs ? now - status.startedAtMs : 0;

  return (
    <div
      className="relative overflow-hidden rounded-3xl p-5 text-white shadow-lg"
      style={{
        background: `linear-gradient(135deg, ${palette.gradient[0]}, ${palette.gradient[1]})`,
      }}
    >
      {/* 只在播的时候铺背景图，用的是直播画面的实时截帧（keyframe），
          等于给观众一眼看到「现在正在播什么」。
          没播时 B 站给的是直播间宣传图，信息是过期的，而且那种图对比度高、
          文字压在上面根本看不清 —— 不如就留纯渐变 */}
      {live && status?.coverUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={status.coverUrl}
            alt=""
            // hdslb.com 防盗链：带 Referer 的请求一律 403，不带才给图。
            // 少了这行封面就是个碎图标
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-black/25" />
        </>
      )}

      <div className="relative">
        {live ? (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-red-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
            </span>
            正在直播
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/25 px-2.5 py-1 text-xs font-bold">
            <span className="h-2 w-2 rounded-full bg-white/70" />
            现在没在播
          </div>
        )}

        <h2
          className="mt-2 text-2xl drop-shadow-sm"
          style={{ fontFamily: "var(--font-hand)" }}
        >
          {/* 在播时显示 B 站上的直播间标题，那是此刻最准的信息 */}
          {live && status?.title ? status.title : "直播间"}
        </h2>

        <p className="mt-0.5 text-sm font-medium text-white/90">
          {/* 开播时长满一分钟才显示，不然刚开播那会儿是「已经播了 0分钟」。
              humanizeCountdown 对非正数会返回「即将开始」，这里也一并绕开 */}
          {live && elapsedMs >= 60_000
            ? `已经播了 ${humanizeCountdown(elapsedMs)}`
            : live
              ? "刚开播，点进去看看"
              : "开播的时候这里会变，日程见下方"}
        </p>

        <a
          href={status?.roomUrl ?? "https://live.bilibili.com/"}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm transition hover:scale-105"
          style={{ color: palette.ink }}
        >
          {live ? "进直播间 →" : "去直播间 →"}
        </a>
      </div>
    </div>
  );
}
