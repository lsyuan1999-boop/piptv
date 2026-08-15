"use client";

import { PALETTES } from "@/lib/themes";
import { dayKey, formatDayLabel, parseDateTimeInput } from "@/lib/time";
import { SLOT_MIN, type Slot } from "@/lib/slots";

/** 统一的大按钮样式，手指点得到（最小 44px 高）。 */
function chip(active: boolean): string {
  return `rounded-xl border px-4 py-2.5 text-base transition ${
    active
      ? "border-zinc-900 bg-zinc-900 font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
      : "border-zinc-300 bg-white hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-500"
  }`;
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-base font-medium">{children}</div>
  );
}

/**
 * 日期选择：只有一个系统日期选择器。
 *
 * 原先有「今天/明天/后天」这类快捷按钮，去掉了 —— 那些词得靠人在心里换算成
 * 具体哪天，排下周的日程时反而更容易点错。日历里看到几号就是几号。
 */
export function DatePicker({
  value,
  min,
  onChange,
}: {
  value: string;
  /** 最早可选的日期，日历里更早的日子直接点不了。 */
  min: string;
  onChange: (v: string) => void;
}) {
  let label: string | null = null;
  try {
    label = value ? formatDayLabel(parseDateTimeInput(value, "00:00")) : null;
  } catch {
    label = null; // 日期框清空或半填状态，不显示就是了
  }

  return (
    <div>
      <FieldLabel>日期选择</FieldLabel>
      {/* min 让系统日历把今天之前的日子直接变灰。
          改一场已经过去的直播时，min 会退到那一天，否则表单一打开就是非法值 */}
      <input
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
      />
      {/* 星期几得算出来给人看一眼 —— 系统日期框在有些浏览器里只显示数字。
          用 parseDateTimeInput 而不是 new Date(值)：后者按浏览器本地时区解析，
          时区偏得多的地方会把日子算错一天 */}
      {label && (
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
      )}
    </div>
  );
}

/** 一格在选择过程中的样子。 */
type BlockState =
  | "taken" // 别人占着
  | "blocked" // 空着，但从当前开始时间拉不到这里
  | "selected" // 已选中的那一段
  | "preview" // 鼠标划过的预览段
  | "free";

function blockClass(state: BlockState): string {
  const base =
    "rounded-lg border px-1 py-2.5 text-sm tabular-nums transition text-center";
  switch (state) {
    case "taken":
      return `${base} cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 line-through dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-600`;
    case "blocked":
      return `${base} cursor-not-allowed border-zinc-200 bg-white text-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-700`;
    case "selected":
      return `${base} border-emerald-600 bg-emerald-600 font-semibold text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-white`;
    case "preview":
      return `${base} border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100`;
    default:
      return `${base} border-zinc-300 bg-white hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-500`;
  }
}

function TimeBlock({
  slot,
  state,
  nextDay,
  onPick,
  onHover,
}: {
  slot: Slot;
  state: BlockState;
  nextDay: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  const disabled = state === "taken" || state === "blocked";
  const title = slot.takenBy
    ? `已被「${slot.takenBy}」占用`
    : state === "blocked"
      ? "从选的开始时间拉不到这里"
      : undefined;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled}
      aria-pressed={state === "selected"}
      onClick={onPick}
      onMouseEnter={onHover}
      onFocus={onHover}
      title={title}
      className={blockClass(state)}
    >
      {nextDay && (
        <span className="mr-0.5 text-[10px] font-normal opacity-70">次</span>
      )}
      {slot.label}
    </button>
  );
}

/**
 * 起止时间选择：一张时间表上点两下。
 *
 * 第一下定开始，第二下定结束，中间那段高亮 —— 这是选时间段最常见的交互，
 * 不用先想清楚「播多久」，在表上比一下就知道占了多长。
 *
 * 不用系统的 <input type="time">：那东西没法把「这半小时已经有直播了」表达出来，
 * 管理员只会填完才被拒绝。这里直接把冲突画在脸上，点不动就是不能选。
 */
export function TimeRangePicker({
  blocks,
  tail,
  startMs,
  endMs,
  limitMs,
  hoverMs,
  dateStr,
  onPick,
  onHover,
  onClearHover,
}: {
  blocks: Slot[];
  tail: Slot[];
  startMs: number | null;
  endMs: number | null;
  /** 结束时间的上限（不含）。startMs 为 null 时无意义。 */
  limitMs: number;
  hoverMs: number | null;
  dateStr: string;
  onPick: (slotMs: number) => void;
  onHover: (slotMs: number) => void;
  onClearHover: () => void;
}) {
  const picking = startMs !== null && endMs === null;

  function stateOf(s: Slot): BlockState {
    if (s.taken) return "taken";
    if (startMs === null) return "free";
    // 已经选好一整段：范围内的格子高亮
    if (endMs !== null) {
      return s.ms >= startMs && s.ms < endMs ? "selected" : "free";
    }
    // 选了开始、还没选结束：开始那格算选中，往后到鼠标位置算预览
    if (s.ms === startMs) return "selected";
    if (s.ms < startMs) return "free"; // 往前点等于重选开始，得能点
    if (s.ms + SLOT_MIN * 60_000 > limitMs) return "blocked";
    if (hoverMs !== null && s.ms <= hoverMs) return "preview";
    return "free";
  }

  const hint = picking
    ? "再点一下结束的时间，中间就是这场直播的时长"
    : endMs !== null
      ? "想重新选就再点一下开始的时间"
      : blocks.some((b) => b.taken)
        ? "点一下开始时间，再点一下结束时间。划掉的时段已经有直播了"
        : "点一下开始时间，再点一下结束时间";

  return (
    <div>
      <FieldLabel>直播时间</FieldLabel>
      {blocks.length === 0 ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          这天已经过去了，换个日子吧
        </p>
      ) : (
        <div
          className="grid grid-cols-6 gap-1.5"
          onMouseLeave={onClearHover}
        >
          {blocks.map((s) => (
            <TimeBlock
              key={s.ms}
              slot={s}
              state={stateOf(s)}
              nextDay={false}
              onPick={() => onPick(s.ms)}
              onHover={() => onHover(s.ms)}
            />
          ))}
        </div>
      )}

      {/* 次日凌晨的格子只在选了开始、而且这段真能拉过零点时才出现 ——
          没选开始时就摆一排次日格子只是噪音 */}
      {tail.length > 0 && (
        <>
          <div className="mt-2 mb-1.5 flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            第二天凌晨
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="grid grid-cols-6 gap-1.5" onMouseLeave={onClearHover}>
            {tail.map((s) => (
              <TimeBlock
                key={s.ms}
                slot={s}
                state={stateOf(s)}
                nextDay={dayKey(new Date(s.ms)) !== dateStr}
                onPick={() => onPick(s.ms)}
                onHover={() => onHover(s.ms)}
              />
            ))}
          </div>
        </>
      )}

      {blocks.length > 0 && (
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          {hint}
        </p>
      )}
    </div>
  );
}

/** 卡片配色。默认「自动」，同一天多场会自动错开颜色。 */
export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel>卡片颜色</FieldLabel>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange("")}
          className={chip(value === "")}
        >
          🎲 自动配色
        </button>
        {PALETTES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key)}
            aria-label={p.label}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-base transition ${
              value === p.key
                ? "border-zinc-900 font-medium dark:border-zinc-100"
                : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700"
            }`}
          >
            <span
              aria-hidden="true"
              className="h-5 w-5 rounded-full"
              style={{
                background: `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})`,
              }}
            />
            {p.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
        选「自动配色」的话，同一天有几场直播会自动用不同颜色区分开
      </p>
    </div>
  );
}
