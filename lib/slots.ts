/**
 * 时间槽位计算：管理端在一张时间表上点两下选出起止时间，这里负责算出
 * 哪些格子能点、一段范围最远能拉到哪。
 *
 * 全部是纯函数，不碰数据库、不碰 React —— 这样能在 scripts/verify.ts 里直接断言，
 * 重叠判断这种一步错步步错的逻辑，得能离线测。
 */

import { addZonedDays, formatTime, parseDateTimeInput } from "./time";

/** 槽位粒度：30 分钟。一天 48 格，一屏放得下，也够贴合「整点/半点开播」的习惯。 */
export const SLOT_MIN = 30;
const SLOT_MS = SLOT_MIN * 60_000;
const DAY_SLOTS = (24 * 60) / SLOT_MIN;

/** 一场直播最长 12 小时，再长基本是填错了。 */
export const MAX_HOURS = 12;

/** 一场直播占用的时间区间，[start, end)。 */
export type Busy = { startMs: number; endMs: number; title: string };

/** 时间表上的一格，代表 [ms, ms+30min) 这半小时。 */
export type Slot = {
  ms: number;
  /** 「20:00」。跨到次日的格子由调用方加前缀。 */
  label: string;
  /** 被别的场次占着，不能选。 */
  taken: boolean;
  /** 占着这一格的场次标题，用来告诉管理员为什么点不了。 */
  takenBy: string | null;
};

/**
 * 把场次列表整成占用区间。
 *
 * 已取消的场次不算占用 —— 那个时间实际是空的，本来就该能重新安排。
 * excludeId 用于编辑：改一场直播时，它自己不该挡住自己。
 */
export function busyRanges(
  items: {
    id: number;
    title: string;
    startAtMs: number;
    durationMin: number;
    cancelled: boolean;
  }[],
  excludeId?: number,
): Busy[] {
  return items
    .filter((i) => !i.cancelled && i.id !== excludeId)
    .map((i) => ({
      startMs: i.startAtMs,
      endMs: i.startAtMs + i.durationMin * 60_000,
      title: i.title,
    }));
}

/** [aStart, aEnd) 和 [bStart, bEnd) 是否相交。首尾相接不算冲突。 */
export function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** 找出第一个和 [startMs, endMs) 冲突的区间，没有则返回 null。 */
export function findConflict(
  startMs: number,
  endMs: number,
  busy: Busy[],
): Busy | null {
  return busy.find((b) => overlaps(startMs, endMs, b.startMs, b.endMs)) ?? null;
}

/** 向上取整到下一个槽位边界。14:10 → 14:30。 */
export function ceilToSlot(ms: number): number {
  return Math.ceil(ms / SLOT_MS) * SLOT_MS;
}

function slot(ms: number, busy: Busy[]): Slot {
  const hit = findConflict(ms, ms + SLOT_MS, busy);
  return {
    ms,
    label: formatTime(new Date(ms)),
    taken: hit !== null,
    takenBy: hit?.title ?? null,
  };
}

/**
 * 某一天（展示时区）的时间表格子。
 *
 * nowMs 之前的格子直接不返回 —— 过去的时间点排不了直播，列出来只是让人多看一眼。
 * 判断「占用」看的是这半小时本身有没有落在别人区间里：只看格子起点不够，
 * 20:30 起点虽然自由，但 20:00-22:00 有场直播时它其实被占着。
 */
export function dayBlocks(
  dateStr: string,
  busy: Busy[],
  nowMs?: number,
): Slot[] {
  const base = parseDateTimeInput(dateStr, "00:00").getTime();
  const floor = nowMs === undefined ? -Infinity : ceilToSlot(nowMs);
  const out: Slot[] = [];
  for (let i = 0; i < DAY_SLOTS; i++) {
    const ms = base + i * SLOT_MS;
    if (ms < floor) continue;
    out.push(slot(ms, busy));
  }
  return out;
}

/**
 * 从 startMs 起，结束时间最远能到哪个瞬间（不含）。
 *
 * 撞上后面第一场直播就停：再往后拉这场必然跨过别人，那些格子给出来也只是
 * 等着被拒绝。另外封顶 12 小时。
 */
export function reachableEnd(startMs: number, busy: Busy[]): number {
  const cap = startMs + MAX_HOURS * 3_600_000;
  let limit = cap;
  for (const b of busy) {
    if (b.startMs > startMs && b.startMs < limit) limit = b.startMs;
  }
  return limit;
}

/**
 * 跨零点用的次日格子。
 *
 * 只在选好开始时间、而且这段真能拉过零点时才有内容 —— 凌晨收播的场次得填得进去，
 * 但没选开始时间就摆一排次日格子只是噪音。
 */
export function tailBlocks(
  dateStr: string,
  startMs: number,
  busy: Busy[],
): Slot[] {
  const nextMidnight = addZonedDays(
    parseDateTimeInput(dateStr, "00:00"),
    1,
  ).getTime();
  const limit = reachableEnd(startMs, busy);
  const out: Slot[] = [];
  for (let ms = nextMidnight; ms + SLOT_MS <= limit; ms += SLOT_MS) {
    out.push(slot(ms, busy));
  }
  return out;
}

/** 这一格能不能当结束时间：整格都得落在可达范围内。 */
export function canEndAt(slotMs: number, startMs: number, limit: number): boolean {
  return slotMs >= startMs && slotMs + SLOT_MS <= limit;
}

/** 点某一格当结束时，实际的结束瞬间是这一格的末尾。 */
export function endInstant(slotMs: number): number {
  return slotMs + SLOT_MS;
}
