import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "./db";
import { settings, streams, type Settings, type Stream } from "./schema";
import { addZonedDays, startOfZonedDay } from "./time";

/** 站点外观设置。表里没有行时返回默认值，不用先手动初始化。 */
export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return (
    row ?? {
      id: 1,
      background: "paper",
      backgroundUrl: null,
      siteTitle: null,
      tagline: null,
      liveUrl: null,
      updatedAt: new Date(),
    }
  );
}

/** 观众端：今天起 days 天内的全部场次（含已取消，观众需要知道被取消了）。 */
export async function getUpcomingWeek(
  now: Date,
  days = 7,
): Promise<Stream[]> {
  const from = startOfZonedDay(now);
  const to = addZonedDays(from, days);
  return db
    .select()
    .from(streams)
    .where(and(gte(streams.startAt, from), lt(streams.startAt, to)))
    .orderBy(asc(streams.startAt));
}

/**
 * 管理端：今天起 days 天内的场次，用于一屏管理视图。
 *
 * 往前多取一天：昨晚 23:00 开播、跨过零点的那种场次，今天早上的槽位也被它占着，
 * 时间选择器要能把那几格置灰，就必须看得见它。
 */
export async function getAdminWindow(
  now: Date,
  days = 14,
): Promise<Stream[]> {
  const from = addZonedDays(startOfZonedDay(now), -1);
  const to = addZonedDays(from, days + 1);
  return db
    .select()
    .from(streams)
    .where(and(gte(streams.startAt, from), lt(streams.startAt, to)))
    .orderBy(asc(streams.startAt));
}
