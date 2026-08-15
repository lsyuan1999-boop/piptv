import { TZDate } from "@date-fns/tz";

/** 全站展示时区，可在环境变量里改。 */
export const TIME_ZONE = process.env.NEXT_PUBLIC_TIMEZONE || "Asia/Shanghai";
export const TIME_ZONE_LABEL =
  process.env.NEXT_PUBLIC_TIMEZONE_LABEL || "北京时间";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 把某个瞬间转成展示时区下的 TZDate。 */
export function inZone(date: Date): TZDate {
  return new TZDate(date, TIME_ZONE);
}

/**
 * 把「展示时区下的墙上时间」转成真正的 UTC 瞬间。
 * 例如传 2026-08-13 20:00（北京时间），得到 2026-08-13T12:00:00Z。
 */
export function zonedWallClockToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
): Date {
  const zoned = new TZDate(year, month - 1, day, hour, minute, 0, 0, TIME_ZONE);
  return new Date(zoned.getTime());
}

/** 解析 "2026-08-13" + "20:00" 形式的输入，返回 UTC 时间。 */
export function parseDateTimeInput(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) {
    throw new Error("日期或时间格式不正确");
  }
  return zonedWallClockToUtc(y, m, d, hh, mm);
}

/** 展示时区下的 YYYY-MM-DD，用作按天分组的 key。 */
export function dayKey(date: Date): string {
  const z = inZone(date);
  const mm = String(z.getMonth() + 1).padStart(2, "0");
  const dd = String(z.getDate()).padStart(2, "0");
  return `${z.getFullYear()}-${mm}-${dd}`;
}

/** 展示时区下的 HH:mm。 */
export function formatTime(date: Date): string {
  const z = inZone(date);
  return `${String(z.getHours()).padStart(2, "0")}:${String(
    z.getMinutes(),
  ).padStart(2, "0")}`;
}

/** 例如「8月13日 周四」。 */
export function formatDayLabel(date: Date): string {
  const z = inZone(date);
  return `${z.getMonth() + 1}月${z.getDate()}日 ${WEEKDAYS[z.getDay()]}`;
}

/** 例如「8/13」。 */
export function formatShortDate(date: Date): string {
  const z = inZone(date);
  return `${z.getMonth() + 1}/${z.getDate()}`;
}

export function weekdayLabel(date: Date): string {
  return WEEKDAYS[inZone(date).getDay()];
}

/** 展示时区下当天 00:00 对应的 UTC 瞬间。 */
export function startOfZonedDay(date: Date): Date {
  const z = inZone(date);
  return zonedWallClockToUtc(
    z.getFullYear(),
    z.getMonth() + 1,
    z.getDate(),
    0,
    0,
  );
}

/** 从今天（展示时区）起连续 days 天的每日起点。 */
export function zonedDayRange(from: Date, days: number): Date[] {
  const start = startOfZonedDay(from);
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    const z = inZone(start);
    out.push(
      zonedWallClockToUtc(
        z.getFullYear(),
        z.getMonth() + 1,
        z.getDate() + i,
        0,
        0,
      ),
    );
  }
  return out;
}

/**
 * 在展示时区的日历上加若干天，保持墙上时钟时间不变。
 * 不能简单加 n*24h —— 那样在有夏令时的时区会偏移一小时。
 */
export function addZonedDays(date: Date, days: number): Date {
  const z = inZone(date);
  return zonedWallClockToUtc(
    z.getFullYear(),
    z.getMonth() + 1,
    z.getDate() + days,
    z.getHours(),
    z.getMinutes(),
  );
}

/** 今天 / 明天 / 后天，否则返回 null。 */
export function relativeDayName(date: Date, now: Date): string | null {
  const target = dayKey(date);
  const names = ["今天", "明天", "后天"];
  for (let i = 0; i < names.length; i++) {
    const z = inZone(now);
    const d = zonedWallClockToUtc(
      z.getFullYear(),
      z.getMonth() + 1,
      z.getDate() + i,
      0,
      0,
    );
    if (dayKey(d) === target) return names[i];
  }
  return null;
}

export function endOf(startAt: Date, durationMin: number): Date {
  return new Date(startAt.getTime() + durationMin * 60_000);
}

/**
 * 起止时间，形如「20:00–23:00」。
 * 跨零点的场次结束时间前面加「次日」，否则 23:00–01:00 看着像倒着播。
 * 比较的是展示时区里的日期，不能直接比 UTC 日期。
 */
export function formatTimeRange(startAt: Date, durationMin: number): string {
  const end = endOf(startAt, durationMin);
  const nextDay = dayKey(end) !== dayKey(startAt);
  return `${formatTime(startAt)}–${nextDay ? "次日 " : ""}${formatTime(end)}`;
}

export type LiveState = "upcoming" | "live" | "ended";

export function liveState(
  startAt: Date,
  durationMin: number,
  now: Date,
): LiveState {
  if (now < startAt) return "upcoming";
  if (now < endOf(startAt, durationMin)) return "live";
  return "ended";
}

/** 把毫秒差转成「2天3小时」「15分钟」这样的中文倒计时。 */
export function humanizeCountdown(ms: number): string {
  if (ms <= 0) return "即将开始";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时${mins}分`;
  return `${mins}分钟`;
}

export function formatDuration(min: number): string {
  if (min % 60 === 0) return `${min / 60}小时`;
  if (min < 60) return `${min}分钟`;
  return `${Math.floor(min / 60)}小时${min % 60}分`;
}
