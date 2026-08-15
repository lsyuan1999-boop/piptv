"use client";

import { assignPalettes, PALETTES } from "@/lib/themes";
import type { StreamItem } from "@/lib/view-types";
import { useNowMs } from "@/lib/use-clock";
import {
  dayKey,
  formatDayLabel,
  relativeDayName,
  zonedDayRange,
} from "@/lib/time";
import { SketchyUnderline } from "./sketchy";
import StreamCard from "./stream-card";

export default function ScheduleView({
  items,
  serverNowMs,
}: {
  items: StreamItem[];
  serverNowMs: number;
}) {
  // 首屏用服务端时间保证 hydration 一致，挂载后自动切到客户端时间
  const now = new Date(useNowMs(serverNowMs));
  const days = zonedDayRange(now, 7);

  // 「正在直播」的判断不在这里 —— 顶部横幅只认 B 站的真实状态，
  // 这块只负责把排好的场次按天铺出来
  const empty = items.length === 0;

  return (
    <div className="space-y-7">
      {empty && (
        <p className="rounded-2xl border-2 border-dashed border-zinc-300 px-5 py-8 text-center text-base font-medium text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
          这一周还没排直播，先歇会儿
        </p>
      )}

      <div className="space-y-6">
        {days.map((day, dayIdx) => {
          const key = dayKey(day);
          const dayItems = items.filter(
            (i) => dayKey(new Date(i.startAtMs)) === key,
          );
          // 每天独立分配配色，保证同一天内颜色互不相同
          const palettes = assignPalettes(dayItems);
          const rel = relativeDayName(day, now);
          const isToday = rel === "今天";

          return (
            <section key={key}>
              <div className="mb-2.5">
                <h2 className="flex items-baseline gap-2">
                  <span
                    className={`text-xl ${
                      isToday ? "" : "text-zinc-500 dark:text-zinc-400"
                    }`}
                    style={{ fontFamily: "var(--font-hand)" }}
                  >
                    {rel ?? formatDayLabel(day)}
                  </span>
                  {rel && (
                    <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">
                      {formatDayLabel(day)}
                    </span>
                  )}
                </h2>
                {isToday && (
                  <div className="-mt-0.5 text-zinc-800 dark:text-zinc-200">
                    <SketchyUnderline
                      color="currentColor"
                      seed={dayIdx * 31 + 5}
                      width={96}
                    />
                  </div>
                )}
              </div>

              {dayItems.length === 0 ? (
                <p className="pl-1 text-base text-zinc-400 dark:text-zinc-500">
                  休息 ☕
                </p>
              ) : (
                <ul className="space-y-3.5">
                  {dayItems.map((item) => (
                    <StreamCard
                      key={item.id}
                      item={item}
                      palette={palettes.get(item.id) ?? PALETTES[0]}
                      now={now}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
