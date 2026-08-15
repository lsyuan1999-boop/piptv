"use client";

import { useState, useTransition } from "react";
import { saveAppearance } from "@/lib/actions";
import { BACKGROUNDS } from "@/lib/themes";
import type { Settings } from "@/lib/schema";
import { FieldLabel } from "./pickers";

/**
 * 管理员改站点设置：背景、标题、副标题、直播间地址。
 *
 * 直播间地址严格说不算「外观」，但只有一个直播间、一辈子填一次，
 * 单独开一个面板反而让人多找一个地方，就并到这里了。
 */
export default function AppearancePanel({
  config,
  onDone,
}: {
  config: Settings;
  onDone: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [background, setBackground] = useState(config.background);
  const [backgroundUrl, setBackgroundUrl] = useState(
    config.backgroundUrl ?? "",
  );
  const [siteTitle, setSiteTitle] = useState(config.siteTitle ?? "");
  const [tagline, setTagline] = useState(config.tagline ?? "");
  const [liveUrl, setLiveUrl] = useState(config.liveUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("background", background);
    fd.set("backgroundUrl", backgroundUrl);
    fd.set("siteTitle", siteTitle);
    fd.set("tagline", tagline);
    fd.set("liveUrl", liveUrl);
    startTransition(async () => {
      const res = await saveAppearance(fd);
      if (res.ok) {
        setOpen(false);
        onDone(res.message);
      } else {
        setError(res.message);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-6 w-full rounded-2xl border-2 border-dashed border-zinc-300 px-5 py-3.5 text-base font-medium transition hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
      >
        🎨 改页面设置
      </button>
    );
  }

  return (
    <div className="mb-6 space-y-5 rounded-2xl border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
      <h2 className="text-xl font-semibold">改页面设置</h2>

      <div>
        <FieldLabel>你的哔哩哔哩直播间</FieldLabel>
        <input
          value={liveUrl}
          onChange={(e) => setLiveUrl(e.target.value)}
          placeholder="直接填房间号，比如 21452505"
          inputMode="url"
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          填一次就行，页面最上方的「进直播间」按钮会用它。
          房间号就是直播间网址最后那串数字，整条网址粘进来也认。留空则不显示按钮
        </p>
      </div>

      <div>
        <FieldLabel>背景</FieldLabel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBackground(b.key)}
              className={`overflow-hidden rounded-xl border-2 text-left transition ${
                background === b.key
                  ? "border-zinc-900 dark:border-zinc-100"
                  : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700"
              }`}
            >
              <span
                aria-hidden="true"
                className="block h-14 w-full"
                style={{ background: b.css }}
              />
              <span className="block px-2.5 py-2 text-base font-medium">
                {b.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>或者用自己的背景图</FieldLabel>
        <input
          value={backgroundUrl}
          onChange={(e) => setBackgroundUrl(e.target.value)}
          placeholder="https://... 图片网址，留空就用上面选的"
          inputMode="url"
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          填了会盖过上面的选择。图片建议用浅色或加过暗的，不然文字看不清
        </p>
      </div>

      <div>
        <FieldLabel>页面大标题</FieldLabel>
        <input
          value={siteTitle}
          onChange={(e) => setSiteTitle(e.target.value)}
          placeholder="留空用默认的「直播日程」"
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div>
        <FieldLabel>标题下面那行小字</FieldLabel>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="留空显示「接下来 7 天的安排」"
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-base text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="flex-1 rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? "正在保存…" : "保存外观"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-xl border border-zinc-300 px-5 py-3.5 text-base transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          不用了
        </button>
      </div>
    </div>
  );
}
