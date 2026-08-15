/**
 * 写入几条示例数据，方便本地看效果。
 * 运行：npm run seed
 * 清空：npm run seed -- --clear
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { db } = await import("../lib/db");
  const { streams } = await import("../lib/schema");
  const { addZonedDays, parseDateTimeInput, dayKey } = await import(
    "../lib/time"
  );

  if (process.argv.includes("--clear")) {
    await db.delete(streams);
    console.log("已清空 streams 表");
    return;
  }

  const now = new Date();
  const on = (offsetDays: number, time: string) =>
    parseDateTimeInput(dayKey(addZonedDays(now, offsetDays)), time);

  await db.insert(streams).values([
    {
      title: "周四夜谈",
      description: "聊聊最近的事，随缘唱歌",
      startAt: on(0, "20:00"),
      durationMin: 180,
    },
    // 同一天两场，用来验证自动配色会不会撞色
    {
      title: "午间杂谈",
      description: "边吃边聊，半小时结束",
      startAt: on(0, "12:00"),
      durationMin: 60,
    },
    {
      title: "新游首播",
      description: "第一次玩，请多包容",
      startAt: on(1, "19:00"),
      durationMin: 120,
    },
    {
      title: "周末杂谈",
      startAt: on(3, "21:00"),
      durationMin: 120,
      note: "本场比平时晚一小时开始",
    },
    {
      title: "临时鸽了的一场",
      startAt: on(4, "20:00"),
      durationMin: 120,
      cancelled: true,
    },
  ]);

  console.log("已写入 5 条示例数据");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
