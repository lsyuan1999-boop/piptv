import LiveBanner from "./live-banner";
import ScheduleView from "./schedule-view";
import { fetchLiveStatus } from "@/lib/bilibili";
import { getSettings, getUpcomingWeek } from "@/lib/queries";
import { TIME_ZONE_LABEL } from "@/lib/time";
import { backgroundByKey } from "@/lib/themes";

// 数据变动很少，缓存 60 秒；管理端写入后会主动 revalidate。
export const revalidate = 60;

const DEFAULT_TITLE = process.env.NEXT_PUBLIC_SITE_TITLE || "直播日程";

export default async function HomePage() {
  const now = new Date();
  const [rows, config] = await Promise.all([
    getUpcomingWeek(now, 7),
    getSettings(),
  ]);

  // 首屏就把真实开播状态带下来，避免先渲染「没在播」再跳成在播。
  // 这页 ISR 缓存 60 秒，所以这份状态最多旧 60 秒 ——
  // 横幅挂载后会立刻自己查一次补上
  const status = config.liveUrl ? await fetchLiveStatus(config.liveUrl) : null;
  const initialStatus = !config.liveUrl
    ? ({ configured: false, live: false } as const)
    : status
      ? ({ configured: true, ...status } as const)
      : ({ configured: true, unknown: true, live: false } as const);

  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    startAtMs: r.startAt.getTime(),
    durationMin: r.durationMin,
    cancelled: r.cancelled,
    note: r.note,
    colorKey: r.colorKey,
    coverUrl: r.coverUrl,
  }));

  const bg = backgroundByKey(config.background);
  const title = config.siteTitle || DEFAULT_TITLE;
  const tagline = config.tagline || `接下来 7 天的安排 · 时间均为${TIME_ZONE_LABEL}`;

  return (
    <div
      className="min-h-dvh"
      style={
        {
          "--bg-light": bg.css,
          "--bg-dark": bg.cssDark,
          ...(config.backgroundUrl
            ? {
                backgroundImage: `url(${config.backgroundUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundAttachment: "fixed",
              }
            : {}),
        } as React.CSSProperties
      }
      data-themed-bg={config.backgroundUrl ? undefined : ""}
    >
      <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-7 sm:pt-12">
        <header className="mb-7">
          <h1
            className="text-3xl tracking-tight sm:text-4xl"
            style={{ fontFamily: "var(--font-hand)" }}
          >
            {title}
          </h1>
          <p className="mt-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            {tagline}
          </p>
        </header>

        {/* 没配直播间地址时横幅整个不渲染，外层的间距也不能留 */}
        {config.liveUrl && (
          <div className="mb-7">
            <LiveBanner initial={initialStatus} serverNowMs={now.getTime()} />
          </div>
        )}

        <ScheduleView items={items} serverNowMs={now.getTime()} />
      </main>
    </div>
  );
}
