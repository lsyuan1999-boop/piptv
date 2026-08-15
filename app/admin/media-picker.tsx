"use client";

import { useEffect, useRef, useState } from "react";
import type { Media } from "@/lib/schema";

export function MediaPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [library, setLibrary] = useState<Media[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    fetch("/api/media")
      .then((res) => {
        if (!res.ok) throw new Error("加载失败");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setLibrary(data.media);
      })
      .catch(() => {
        if (!cancelled) setError("加载图片库失败");
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);

    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "上传失败");
      }

      const data = await res.json();
      setLibrary((prev) => [data.media, ...prev]);
      onChange(data.media.url);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function select(url: string) {
    onChange(url);
    setOpen(false);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200 mb-1.5">
        海报图
      </label>

      {value && (
        <div className="mb-3 relative w-40 h-24 rounded-lg overflow-hidden border border-zinc-300 dark:border-zinc-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="当前海报"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-1 right-1 rounded-full bg-red-600 text-white w-6 h-6 text-xs font-bold hover:bg-red-700"
          >
            ✕
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      >
        {value ? "换一张" : "选择海报图"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl border border-zinc-300 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold">选择海报图</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-2xl leading-none text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                ✕
              </button>
            </div>

            <div className="mb-4">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
                id="media-upload"
              />
              <label
                htmlFor="media-upload"
                className={`block w-full cursor-pointer rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-base transition hover:border-emerald-500 hover:bg-emerald-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/30 ${
                  uploading ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                {uploading ? "上传中…" : "➕ 上传新图片（JPG / PNG / WebP，最大 4MB）"}
              </label>
            </div>

            {error && (
              <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-base text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}

            {library.length === 0 ? (
              <p className="py-8 text-center text-base text-zinc-400 dark:text-zinc-500">
                图片库是空的，先上传一张吧
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {library.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => select(item.url)}
                    className="group relative aspect-[4/3] overflow-hidden rounded-lg border-2 border-transparent transition hover:border-emerald-500 focus:border-emerald-600"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.filename}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-xs text-white opacity-0 transition group-hover:opacity-100">
                      {item.filename}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
