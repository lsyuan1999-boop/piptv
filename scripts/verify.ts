/** 本地验证：时区往返、批量生成、顺延、状态推导、自动配色。 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const t = await import("../lib/time");
  const { assignPalettes, PALETTES } = await import("../lib/themes");

  let failed = 0;
  const check = (label: string, cond: boolean) => {
    console.log(`${cond ? "✓" : "✗"} ${label}`);
    if (!cond) failed++;
  };

  // 时区
  const utc = t.parseDateTimeInput("2026-08-13", "20:00");
  check(
    `时区往返 北京20:00 → ${utc.toISOString()}`,
    utc.toISOString() === "2026-08-13T12:00:00.000Z",
  );

  const cross = t.addZonedDays(t.parseDateTimeInput("2026-08-28", "20:00"), 7);
  check(
    `跨月+7天 → ${t.dayKey(cross)} ${t.formatTime(cross)}`,
    t.dayKey(cross) === "2026-09-04" && t.formatTime(cross) === "20:00",
  );

  // 起止时间显示。卡片和管理端列表都用它，跨零点是最容易看错的一种
  check(
    `起止时间 → ${t.formatTimeRange(utc, 180)}`,
    t.formatTimeRange(utc, 180) === "20:00–23:00",
  );
  check(
    `跨零点加「次日」 → ${t.formatTimeRange(utc, 300)}`,
    t.formatTimeRange(utc, 300) === "20:00–次日 01:00",
  );
  // 正好停在零点算次日，24:00 这种写法不用
  check(
    `正好到零点 → ${t.formatTimeRange(utc, 240)}`,
    t.formatTimeRange(utc, 240) === "20:00–次日 00:00",
  );

  // 批量生成 8 周不漂移
  const weeks = Array.from({ length: 8 }, (_, i) => t.addZonedDays(utc, i * 7));
  check(
    `批量8周时间不漂移`,
    weeks.length === 8 && weeks.every((w) => t.formatTime(w) === "20:00"),
  );

  // 状态推导
  const base = new Date("2026-08-13T12:00:00Z");
  check("开播前=upcoming", t.liveState(base, 90, new Date(base.getTime() - 60_000)) === "upcoming");
  check("播到一半=live", t.liveState(base, 90, new Date(base.getTime() + 30 * 60_000)) === "live");
  check("结束后=ended", t.liveState(base, 90, new Date(base.getTime() + 100 * 60_000)) === "ended");

  // 自动配色：同一天多场必须不同色
  const sameDay = [
    { id: 1, title: "午间杂谈" },
    { id: 2, title: "周四夜谈" },
    { id: 3, title: "新游首播" },
    { id: 4, title: "深夜聊天" },
  ];
  const assigned = assignPalettes(sameDay);
  const keys = sameDay.map((s) => assigned.get(s.id)!.key);
  check(`同一天4场配色互不相同 → ${keys.join(", ")}`, new Set(keys).size === 4);

  // 同一标题跨天稳定同色
  const a = assignPalettes([{ id: 10, title: "周四夜谈" }]).get(10)!.key;
  const b = assignPalettes([{ id: 99, title: "周四夜谈" }]).get(99)!.key;
  check(`同标题跨天同色 → ${a}`, a === b);

  // 手动指定的颜色优先
  const manual = assignPalettes([
    { id: 1, title: "甲", colorKey: "mint" },
    { id: 2, title: "乙" },
  ]);
  check("手动指定颜色生效", manual.get(1)!.key === "mint");
  check("其他场次不撞手动色", manual.get(2)!.key !== "mint");

  // 撞色超过色板数量时不崩
  const many = Array.from({ length: PALETTES.length + 3 }, (_, i) => ({
    id: i + 1,
    title: `场次${i}`,
  }));
  check(`场次多于色板(${many.length}场)不崩溃`, assignPalettes(many).size === many.length);

  // 手绘边框（Rough.js generator，浏览器外也能跑）
  const rough = (await import("roughjs")).default;
  const gen = rough.generator();
  const rect = (seed: number, w = 588, h = 106) =>
    gen.toPaths(
      gen.rectangle(5, 5, w - 10, h - 10, {
        stroke: "#000",
        strokeWidth: 2,
        roughness: 1,
        bowing: 1.6,
        seed,
        fill: "#fff",
        fillStyle: "solid",
      }),
    );

  const paths = rect(42);
  check("toPaths 返回填充 + 描边两条", paths.length === 2);
  check(
    "描边路径非空且无 NaN",
    paths.every((p) => p.d.length > 0 && !/NaN/.test(p.d)),
  );
  // seed 固定是"卡片不闪"的前提：同一张卡每次渲染必须画出同样的轨迹
  check(
    "同 seed 轨迹一致（不闪）",
    rect(42).map((p) => p.d).join() === paths.map((p) => p.d).join(),
  );
  check(
    "不同 seed 轨迹不同",
    rect(43).map((p) => p.d).join() !== paths.map((p) => p.d).join(),
  );

  // 手绘特征来自"两笔分岔 + 拐角出头"，靠的是描边路径里有多个 M 段。
  // 若哪天升级 Rough.js 后只剩一段，说明退化成了普通矩形。
  const strokePath = paths.find((p) => p.fill === "none" || !p.fill)!;
  const subpaths = (strokePath.d.match(/M/g) || []).length;
  check(`描边是多笔叠加（${subpaths} 段 > 1）`, subpaths > 1);

  // 出头量要留在 pad 里，否则拐角会被 overflow 裁掉。
  // pad = strokeWidth + 3 = 5，这里验证坐标没跑到负值太多。
  const coords = strokePath.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const minCoord = Math.min(...coords);
  check(`出头量在 pad 内（最小坐标 ${minCoord.toFixed(1)} > -1）`, minCoord > -1);

  // 直播间地址解析。只测纯函数，不发网络请求 ——
  // 依赖 B 站接口的断言会让这套验证变得时好时坏，失去意义
  const { parseRoomId } = await import("../lib/bilibili");
  check("房间号：纯数字", parseRoomId("21452505") === "21452505");
  check(
    "房间号：整条网址",
    parseRoomId("https://live.bilibili.com/1") === "1",
  );
  check(
    "房间号：带参数和空格",
    parseRoomId(" https://live.bilibili.com/7734200?spm=x ") === "7734200",
  );
  // 后台填错域名时不能把请求发到别处去
  check("房间号：拒绝站外域名", parseRoomId("https://evil.com/123") === null);
  check("房间号：拒绝非数字", parseRoomId("abc") === null);
  check("房间号：拒绝空值", parseRoomId("") === null);

  // 时段占用。管理端靠这套逻辑把选不了的时间置灰，算错就会排出两场撞车的直播
  const {
    busyRanges,
    overlaps,
    findConflict,
    dayBlocks,
    reachableEnd,
    tailBlocks,
    canEndAt,
    endInstant,
    ceilToSlot,
  } = await import("../lib/slots");
  const { parseDateTimeInput } = await import("../lib/time");

  const ts = (hhmm: string) =>
    parseDateTimeInput("2026-08-20", hhmm).getTime();
  const H = 3_600_000;

  check("重叠：相交算冲突", overlaps(ts("20:00"), ts("22:00"), ts("21:00"), ts("23:00")));
  // 首尾相接不算冲突，否则 22:00 结束的下一场没法从 22:00 开始
  check("重叠：首尾相接不算", !overlaps(ts("20:00"), ts("22:00"), ts("22:00"), ts("23:00")));
  check("重叠：完全包含算冲突", overlaps(ts("20:30"), ts("21:00"), ts("20:00"), ts("22:00")));

  const items = [
    { id: 1, title: "占位场", startAtMs: ts("20:00"), durationMin: 120, cancelled: false },
    { id: 2, title: "取消场", startAtMs: ts("14:00"), durationMin: 60, cancelled: true },
  ];
  const busy = busyRanges(items);
  // 已取消的场次不占时间：那个时段实际是空的，本来就该能重新安排
  check("占用：已取消的不算", busy.length === 1);
  // 编辑自己时不能被自己挡住
  check("占用：排除自己", busyRanges(items, 1).length === 0);

  const slots = dayBlocks("2026-08-20", busy);
  check("时间表：一天 48 格", slots.length === 48);
  const at = (hhmm: string) => slots.find((s) => s.ms === ts(hhmm))!;
  check("时间表：20:00 被占", at("20:00").taken);
  // 只看格子起点不够 —— 20:30 起点自由，但它落在 20:00-22:00 里面
  check("时间表：20:30 也被占", at("20:30").taken);
  check("时间表：21:30 被占", at("21:30").taken);
  check("时间表：22:00 空着", !at("22:00").taken);
  check("时间表：19:30 空着", !at("19:30").taken);
  check("时间表：说得出被谁占了", at("20:00").takenBy === "占位场");

  // 过去的时间点不列出来
  check("时间表：藏起过去的格子", dayBlocks("2026-08-20", [], ts("18:00")).length === 12);
  check(
    "时间表：第一格就是当前时间",
    dayBlocks("2026-08-20", [], ts("18:00"))[0].ms === ts("18:00"),
  );
  // 18:10 这种零散时刻要向上取整到 18:30，不能给出一个已经过去的 18:00
  check("时间表：向上取整到半点", ceilToSlot(ts("18:00") + 10 * 60_000) === ts("18:30"));
  check(
    "时间表：不给已过去的那一格",
    dayBlocks("2026-08-20", [], ts("18:00") + 10 * 60_000)[0].ms === ts("18:30"),
  );

  // 18:00 开始的话最远只能拉到 20:00，再往后就撞上占位场了
  check("可达上限：撞上就停", reachableEnd(ts("18:00"), busy) === ts("20:00"));
  check("可达上限：空日子封顶 12 小时", reachableEnd(ts("06:00"), []) === ts("06:00") + 12 * H);
  // 结束时间要整格落在可达范围内：19:30 这格末尾正好 20:00，可以
  check("能否作结束：贴着上限可以", canEndAt(ts("19:30"), ts("18:00"), ts("20:00")));
  // 20:00 这格末尾是 20:30，越界了
  check("能否作结束：越界不行", !canEndAt(ts("20:00"), ts("18:00"), ts("20:00")));
  // 点开始那一格本身 = 只播半小时
  check("结束瞬间：这一格的末尾", endInstant(ts("18:00")) === ts("18:30"));

  // 跨零点要能选出来，不然凌晨收播的场次填不进去
  const tail = tailBlocks("2026-08-20", ts("23:00"), []);
  check("次日格子：从零点开始", tail[0].ms === ts("23:00") + 1 * H);
  check("次日格子：拉到 12 小时上限", tail.at(-1)!.ms === ts("23:00") + 11.5 * H);
  // 没到零点就够不着次日，不该给格子
  check("次日格子：够不着就不给", tailBlocks("2026-08-20", ts("06:00"), []).length === 0);
  check(
    "冲突查找：命中时报出场次名",
    findConflict(ts("19:00"), ts("21:00"), busy)?.title === "占位场",
  );
  check("冲突查找：无冲突返回 null", findConflict(ts("06:00"), ts("08:00"), busy) === null);

  console.log(failed === 0 ? "\n全部通过" : `\n${failed} 项失败`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
