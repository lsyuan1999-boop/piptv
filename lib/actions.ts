"use server";

import { and, eq, gte, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "./auth";
import { db } from "./db";
import { settings, streams, type NewStream } from "./schema";
import { addZonedDays, formatTime, parseDateTimeInput } from "./time";
import { findConflict, overlaps, type Busy } from "./slots";

/** 每个写操作都要独立校验，不能只靠 middleware。 */
async function requireAdmin(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) {
    redirect("/admin/login");
  }
}

function refresh(): void {
  revalidatePath("/");
  revalidatePath("/admin");
}

export type ActionResult = { ok: boolean; message: string };

const WEEKS_AHEAD = 8;

/** 一场直播最长 12 小时，和选择器里的上限一致。 */
const MAX_DURATION_MIN = 12 * 60;

/**
 * 服务端再查一遍时间冲突。
 *
 * 前端已经把占用的槽位置灰了，但那份数据是打开表单那一刻的快照 ——
 * 开着两个标签页、或者页面挂了半天再提交，都能绕过去。数据库这层必须自己拦。
 */
async function conflictMessage(
  rows: { startAt: Date; durationMin: number }[],
  excludeId?: number,
): Promise<string | null> {
  const starts = rows.map((r) => r.startAt.getTime());
  const from = new Date(Math.min(...starts) - MAX_DURATION_MIN * 60_000);
  const to = new Date(Math.max(...starts) + MAX_DURATION_MIN * 60_000);

  const existing = await db
    .select()
    .from(streams)
    .where(and(gte(streams.startAt, from), lt(streams.startAt, to)));

  const busy: Busy[] = existing
    .filter((r) => !r.cancelled && r.id !== excludeId)
    .map((r) => ({
      startMs: r.startAt.getTime(),
      endMs: r.startAt.getTime() + r.durationMin * 60_000,
      title: r.title,
    }));

  for (const row of rows) {
    const s = row.startAt.getTime();
    const hit = findConflict(s, s + row.durationMin * 60_000, busy);
    if (hit) {
      return `和「${hit.title}」时间撞了（${formatTime(
        new Date(hit.startMs),
      )}–${formatTime(new Date(hit.endMs))}），换个时段吧`;
    }
  }

  // 批量生成的每周场次之间也要互不重叠 —— 时长超过 7 天才可能，
  // 但真填出来的话，静悄悄插进去更糟
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      const aStart = a.startAt.getTime();
      const bStart = b.startAt.getTime();
      if (
        overlaps(
          aStart,
          aStart + a.durationMin * 60_000,
          bStart,
          bStart + b.durationMin * 60_000,
        )
      ) {
        return "每周重复的场次之间自己就撞上了，把时长改短一些";
      }
    }
  }

  return null;
}

export async function createStream(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const durationMin = Number(formData.get("durationMin") ?? 120);
  const description = String(formData.get("description") ?? "").trim();
  const repeatWeekly = formData.get("repeatWeekly") === "on";

  if (!title) return { ok: false, message: "请填写直播标题" };
  if (!date) return { ok: false, message: "请选择直播日期" };
  if (!time) return { ok: false, message: "请选择开始时间" };
  if (!Number.isFinite(durationMin) || durationMin <= 0) {
    return { ok: false, message: "请选择结束时间" };
  }
  if (durationMin > MAX_DURATION_MIN) {
    return { ok: false, message: "一场直播最长 12 小时" };
  }

  let startAt: Date;
  try {
    startAt = parseDateTimeInput(date, time);
  } catch {
    return { ok: false, message: "日期或时间格式不正确" };
  }

  const base: Omit<NewStream, "startAt"> = {
    title,
    description: description || null,
    durationMin,
    colorKey: String(formData.get("colorKey") ?? "") || null,
    coverUrl: String(formData.get("coverUrl") ?? "").trim() || null,
  };

  const rows: NewStream[] = repeatWeekly
    ? Array.from({ length: WEEKS_AHEAD }, (_, i) => ({
        ...base,
        startAt: addZonedDays(startAt, i * 7),
      }))
    : [{ ...base, startAt }];

  const clash = await conflictMessage(
    rows.map((r) => ({ startAt: r.startAt, durationMin })),
  );
  if (clash) return { ok: false, message: clash };

  await db.insert(streams).values(rows);
  refresh();

  return {
    ok: true,
    message: repeatWeekly
      ? `已添加，接下来 ${WEEKS_AHEAD} 周每周都排好了`
      : "已添加，观众现在就能看到了",
  };
}

export async function updateStream(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const durationMin = Number(formData.get("durationMin") ?? 120);
  const description = String(formData.get("description") ?? "").trim();

  if (!Number.isFinite(id)) return { ok: false, message: "找不到这场直播" };
  if (!title) return { ok: false, message: "请填写直播标题" };
  if (!date || !time) return { ok: false, message: "请填写日期和时间" };

  let startAt: Date;
  try {
    startAt = parseDateTimeInput(date, time);
  } catch {
    return { ok: false, message: "日期或时间格式不正确" };
  }

  if (!Number.isFinite(durationMin) || durationMin <= 0) {
    return { ok: false, message: "请选择结束时间" };
  }
  if (durationMin > MAX_DURATION_MIN) {
    return { ok: false, message: "一场直播最长 12 小时" };
  }

  const clash = await conflictMessage([{ startAt, durationMin }], id);
  if (clash) return { ok: false, message: clash };

  await db
    .update(streams)
    .set({
      title,
      description: description || null,
      startAt,
      durationMin,
      colorKey: String(formData.get("colorKey") ?? "") || null,
      coverUrl: String(formData.get("coverUrl") ?? "").trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(streams.id, id));

  refresh();
  return { ok: true, message: "已保存修改" };
}

/**
 * 把管理员填的东西整成一个能用的直播间地址。
 *
 * 只填房间号（后台提示里就是这么说的）最省事，所以数字直接补全成完整地址。
 * 但复制粘贴整条链接是更自然的动作，所以也接住：带 http 的原样保留，
 * 漏了 http 的补上。宁可存一条不太规整的地址，也别让人对着报错发呆。
 */
function normalizeLiveUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return `https://live.bilibili.com/${v}`;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

/** 保存站点外观设置。表里没有行时插入，有则更新。 */
export async function saveAppearance(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const background = String(formData.get("background") ?? "paper");
  const backgroundUrl = String(formData.get("backgroundUrl") ?? "").trim();
  const siteTitle = String(formData.get("siteTitle") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const liveUrl = normalizeLiveUrl(String(formData.get("liveUrl") ?? ""));

  const values = {
    background,
    backgroundUrl: backgroundUrl || null,
    siteTitle: siteTitle || null,
    tagline: tagline || null,
    liveUrl,
    updatedAt: new Date(),
  };

  await db
    .insert(settings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: settings.id, set: values });

  refresh();
  return { ok: true, message: "外观已更新，去首页看看" };
}

export async function setCancelled(
  id: number,
  cancelled: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  await db
    .update(streams)
    .set({ cancelled, updatedAt: new Date() })
    .where(eq(streams.id, id));
  refresh();
  return {
    ok: true,
    message: cancelled ? "已标记为取消，观众会看到" : "已恢复这场直播",
  };
}

export async function deleteStream(id: number): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(streams).where(eq(streams.id, id));
  refresh();
  return { ok: true, message: "已彻底删除" };
}

/** 顺延指定分钟数，默认 30。 */
export async function postponeStream(
  id: number,
  minutes = 30,
): Promise<ActionResult> {
  await requireAdmin();
  const [row] = await db.select().from(streams).where(eq(streams.id, id));
  if (!row) return { ok: false, message: "找不到这场直播" };

  const startAt = new Date(row.startAt.getTime() + minutes * 60_000);
  // 推迟半小时可能正好撞上后面那场，得拦
  const clash = await conflictMessage(
    [{ startAt, durationMin: row.durationMin }],
    id,
  );
  if (clash) return { ok: false, message: clash };

  await db
    .update(streams)
    .set({ startAt, updatedAt: new Date() })
    .where(eq(streams.id, id));

  refresh();
  return { ok: true, message: `已推迟 ${minutes} 分钟` };
}

/** 复制到下周同一天同一时间。 */
export async function copyToNextWeek(id: number): Promise<ActionResult> {
  await requireAdmin();
  const [row] = await db.select().from(streams).where(eq(streams.id, id));
  if (!row) return { ok: false, message: "找不到这场直播" };

  const startAt = addZonedDays(row.startAt, 7);
  const clash = await conflictMessage([
    { startAt, durationMin: row.durationMin },
  ]);
  if (clash) return { ok: false, message: clash };

  await db.insert(streams).values({
    title: row.title,
    description: row.description,
    startAt,
    durationMin: row.durationMin,
    colorKey: row.colorKey,
    coverUrl: row.coverUrl,
  });

  refresh();
  return { ok: true, message: "已复制到下周同一时间" };
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin/login");
}
