"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  copyToNextWeek,
  deleteStream,
  logout,
  postponeStream,
  setCancelled,
} from "@/lib/actions";
import type { StreamItem } from "@/lib/view-types";
import {
  addZonedDays,
  dayKey,
  formatDayLabel,
  formatDuration,
  formatTimeRange,
  relativeDayName,
} from "@/lib/time";
import StreamForm from "./stream-form";
import AppearancePanel from "./appearance-panel";
import ConfirmDialog, { type ConfirmSpec } from "./confirm-dialog";
import type { Settings } from "@/lib/schema";

const DAYS_SHOWN = 21;

export default function AdminBoard({
  items,
  config,
  serverNowMs,
  todayKey,
  timeZoneLabel,
}: {
  items: StreamItem[];
  config: Settings;
  serverNowMs: number;
  todayKey: string;
  timeZoneLabel: string;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState<
    { mode: "create" } | { mode: "edit"; item: StreamItem } | null
  >(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [pending, startTransition] = useTransition();

  const now = new Date(serverNowMs);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const res = await fn();
      setToast(res.message);
      router.refresh();
    });
  }

  const days = Array.from({ length: DAYS_SHOWN }, (_, i) =>
    addZonedDays(now, i),
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-5">
      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-50 mx-auto max-w-2xl px-4 pt-3"
        >
          <div className="rounded-xl bg-emerald-600 px-4 py-3 text-base font-medium text-white shadow-lg">
            ✓ {toast}
          </div>
        </div>
      )}

      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">直播日程管理</h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            时间都按{timeZoneLabel}算
          </p>
        </div>
        <form action={logout}>
          <button className="rounded-lg border border-zinc-300 px-3 py-2 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            退出
          </button>
        </form>
      </header>

      {sheet === null && (
        <>
          <button
            onClick={() => setSheet({ mode: "create" })}
            className="mb-3 w-full rounded-2xl bg-emerald-600 px-5 py-5 text-lg font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            ＋ 添加日程
          </button>
          <AppearancePanel
            config={config}
            onDone={(msg) => {
              setToast(msg);
              router.refresh();
            }}
          />
        </>
      )}

      {sheet !== null && (
        <div className="mb-6 rounded-2xl border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
          <StreamForm
            mode={sheet.mode}
            baseDate={now}
            existing={sheet.mode === "edit" ? sheet.item : undefined}
            allItems={items}
            onDone={(msg) => {
              setSheet(null);
              setToast(msg);
              router.refresh();
            }}
            onCancel={() => setSheet(null)}
          />
        </div>
      )}

      <div className="space-y-5">
        {days.map((day) => {
          const key = dayKey(day);
          const dayItems = items.filter(
            (i) => dayKey(new Date(i.startAtMs)) === key,
          );
          if (dayItems.length === 0 && key !== todayKey) return null;
          const rel = relativeDayName(day, now);
          return (
            <section key={key}>
              <h2 className="mb-2 text-base font-medium">
                {rel && <span className="mr-1.5">{rel}</span>}
                <span className="text-zinc-500 dark:text-zinc-400">
                  {formatDayLabel(day)}
                </span>
              </h2>
              {dayItems.length === 0 ? (
                <p className="px-1 text-base text-zinc-400 dark:text-zinc-500">
                  这天还没安排
                </p>
              ) : (
                <ul className="space-y-3">
                  {dayItems.map((item) => (
                    <AdminCard
                      key={item.id}
                      item={item}
                      pending={pending}
                      onEdit={() => setSheet({ mode: "edit", item })}
                      onPostpone={() =>
                        run(() => postponeStream(item.id, 30))
                      }
                      onCopy={() => run(() => copyToNextWeek(item.id))}
                      onToggleCancel={() =>
                        item.cancelled
                          ? run(() => setCancelled(item.id, false))
                          : setConfirm({
                              title: `要取消「${item.title}」这场直播吗？`,
                              body: "观众会看到这场标记为已取消。如果之后又要播，可以再点一下恢复。",
                              confirmText: "是的，取消这场",
                              danger: false,
                              onConfirm: () =>
                                run(() => setCancelled(item.id, true)),
                            })
                      }
                      onDelete={() =>
                        setConfirm({
                          title: `要彻底删掉「${item.title}」吗？`,
                          body: "删掉就找不回来了。如果只是这次不播，建议用「本场取消」，观众能看到你的说明。",
                          confirmText: "确定删掉",
                          danger: true,
                          onConfirm: () => run(() => deleteStream(item.id)),
                        })
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {confirm && (
        <ConfirmDialog
          spec={confirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </main>
  );
}

function AdminCard({
  item,
  pending,
  onEdit,
  onPostpone,
  onCopy,
  onToggleCancel,
  onDelete,
}: {
  item: StreamItem;
  pending: boolean;
  onEdit: () => void;
  onPostpone: () => void;
  onCopy: () => void;
  onToggleCancel: () => void;
  onDelete: () => void;
}) {
  const btn =
    "rounded-lg border border-zinc-300 px-3 py-2.5 text-base transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-baseline gap-3">
        <span className="whitespace-nowrap text-lg font-semibold tabular-nums">
          {formatTimeRange(new Date(item.startAtMs), item.durationMin)}
        </span>
        <span
          className={`text-lg font-medium ${
            item.cancelled
              ? "text-zinc-400 line-through dark:text-zinc-500"
              : ""
          }`}
        >
          {item.title}
        </span>
      </div>
      <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        播 {formatDuration(item.durationMin)}
        {item.cancelled && (
          <span className="ml-2 font-medium text-red-600 dark:text-red-400">
            已取消
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onEdit} disabled={pending} className={btn}>
          ✏️ 改内容
        </button>
        <button onClick={onPostpone} disabled={pending} className={btn}>
          ⏰ 晚半小时
        </button>
        <button onClick={onCopy} disabled={pending} className={btn}>
          📋 复制到下周
        </button>
        <button onClick={onToggleCancel} disabled={pending} className={btn}>
          {item.cancelled ? "↩️ 恢复这场" : "🚫 本场取消"}
        </button>
        <button
          onClick={onDelete}
          disabled={pending}
          className="rounded-lg border border-red-300 px-3 py-2.5 text-base text-red-600 transition hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          🗑 删掉
        </button>
      </div>
    </li>
  );
}
