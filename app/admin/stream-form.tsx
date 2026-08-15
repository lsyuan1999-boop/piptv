"use client";

import { useMemo, useState, useTransition } from "react";
import { createStream, updateStream } from "@/lib/actions";
import type { StreamItem } from "@/lib/view-types";
import { dayKey, formatDuration, formatTime } from "@/lib/time";
import {
  busyRanges,
  canEndAt,
  dayBlocks,
  endInstant,
  reachableEnd,
  tailBlocks,
} from "@/lib/slots";
import {
  ColorPicker,
  DatePicker,
  FieldLabel,
  TimeRangePicker,
} from "./pickers";
import { MediaPicker } from "./media-picker";

export default function StreamForm({
  mode,
  baseDate,
  existing,
  allItems,
  onDone,
  onCancel,
}: {
  mode: "create" | "edit";
  baseDate: Date;
  existing?: StreamItem;
  /** 已排好的全部场次，用来把被占用的时段置灰。 */
  allItems: StreamItem[];
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const start = existing ? new Date(existing.startAtMs) : null;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(
    start ? dayKey(start) : dayKey(baseDate),
  );
  // 起止都存成绝对毫秒：跨零点的场次用「结束比开始小」的字符串没法表达
  const [startMs, setStartMs] = useState<number | null>(
    existing?.startAtMs ?? null,
  );
  const [endMs, setEndMs] = useState<number | null>(
    existing ? existing.startAtMs + existing.durationMin * 60_000 : null,
  );
  const [description, setDescription] = useState(existing?.description ?? "");
  const [colorKey, setColorKey] = useState(existing?.colorKey ?? "");
  const [coverUrl, setCoverUrl] = useState(existing?.coverUrl ?? "");
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [showMore, setShowMore] = useState(
    Boolean(existing?.coverUrl || existing?.description),
  );
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 编辑时要把自己排除掉，否则这场直播会挡住自己原来的时间
  const busy = useMemo(
    () => busyRanges(allItems, existing?.id),
    [allItems, existing?.id],
  );

  /**
   * 过去的时间点不给选。编辑已有场次时不设下限 ——
   * 改一场昨天的直播，把它自己的时间藏起来会让人以为数据丢了。
   */
  const floorMs = existing ? undefined : baseDate.getTime();
  const minDate = existing
    ? dayKey(new Date(Math.min(existing.startAtMs, baseDate.getTime())))
    : dayKey(baseDate);

  const blocks = useMemo(
    () => (date ? dayBlocks(date, busy, floorMs) : []),
    [date, busy, floorMs],
  );
  const limitMs = useMemo(
    () => (startMs === null ? 0 : reachableEnd(startMs, busy)),
    [startMs, busy],
  );
  const tail = useMemo(
    () =>
      startMs === null || !date ? [] : tailBlocks(date, startMs, busy),
    [date, startMs, busy],
  );

  const durationMin =
    startMs !== null && endMs !== null
      ? Math.round((endMs - startMs) / 60_000)
      : 0;

  /** 换日期后原来的选择就没意义了，得重选。 */
  function pickDate(next: string) {
    setDate(next);
    setStartMs(null);
    setEndMs(null);
    setHoverMs(null);
  }

  /**
   * 时间表上点一格：第一下定开始，第二下定结束。
   *
   * 选好一整段后再点任何一格都是重新开始 —— 想改时间的人下一步一定是重选开始，
   * 让他先去找个「清除」按钮是多一道手续。
   * 往开始时间之前点也当重选，比强迫他先取消再来一遍自然。
   */
  function pick(slotMs: number) {
    setError(null);
    if (startMs === null || endMs !== null || slotMs < startMs) {
      setStartMs(slotMs);
      setEndMs(null);
      return;
    }
    // 点开始那一格本身 = 只播半小时，这是最短的一段
    if (canEndAt(slotMs, startMs, limitMs)) setEndMs(endInstant(slotMs));
  }

  function submit() {
    setError(null);
    if (startMs === null) return setError("请选择开始时间");
    if (endMs === null) return setError("请选择结束时间");

    const fd = new FormData();
    if (existing) fd.set("id", String(existing.id));
    fd.set("title", title);
    fd.set("date", dayKey(new Date(startMs)));
    fd.set("time", formatTime(new Date(startMs)));
    fd.set("durationMin", String(durationMin));
    fd.set("description", description);
    fd.set("colorKey", colorKey);
    fd.set("coverUrl", coverUrl);
    if (repeatWeekly) fd.set("repeatWeekly", "on");

    startTransition(async () => {
      const res =
        mode === "create" ? await createStream(fd) : await updateStream(fd);
      if (res.ok) onDone(res.message);
      else setError(res.message);
    });
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">
        {mode === "create" ? "添加日程" : "修改这场直播"}
      </h2>

      <div>
        <FieldLabel>直播叫什么名字？</FieldLabel>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="比如：周四夜谈"
          autoFocus
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300"
        />
      </div>

      <DatePicker value={date} min={minDate} onChange={pickDate} />
      <TimeRangePicker
        blocks={blocks}
        tail={tail}
        startMs={startMs}
        endMs={endMs}
        limitMs={limitMs}
        hoverMs={hoverMs}
        dateStr={date}
        onPick={pick}
        onHover={setHoverMs}
        onClearHover={() => setHoverMs(null)}
      />

      {/* 选完了把结论用一句话说清楚 —— 48 格点来点去，容易记不住自己选了什么 */}
      {startMs !== null && endMs !== null && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-base text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          {formatTime(new Date(startMs))} 到 {formatTime(new Date(endMs))}
          {dayKey(new Date(endMs)) !== date && "（次日）"}，共{" "}
          {formatDuration(durationMin)}
        </p>
      )}

      <ColorPicker value={colorKey} onChange={setColorKey} />

      {!showMore ? (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          className="text-base text-blue-600 hover:underline dark:text-blue-400"
        >
          ＋ 填海报图和简介（可以不填）
        </button>
      ) : (
        <div className="space-y-4">
          <MediaPicker value={coverUrl} onChange={setCoverUrl} />
          <div>
            <FieldLabel>这场播什么？</FieldLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="比如：新游戏首播，聊聊最近的事"
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        </div>
      )}

      {mode === "create" && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <input
            type="checkbox"
            checked={repeatWeekly}
            onChange={(e) => setRepeatWeekly(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-zinc-900 dark:accent-zinc-100"
          />
          <span>
            <span className="text-base font-medium">以后每周都播</span>
            <span className="mt-0.5 block text-sm text-zinc-500 dark:text-zinc-400">
              勾上会自动排好接下来 8 周，之后每一场都能单独改
            </span>
          </span>
        </label>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-base text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={pending || startMs === null || endMs === null}
          className="flex-1 rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending
            ? "正在保存…"
            : mode === "create"
              ? "确定，添加这条日程"
              : "保存修改"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-xl border border-zinc-300 px-5 py-3.5 text-base transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          不用了
        </button>
      </div>
    </div>
  );
}
