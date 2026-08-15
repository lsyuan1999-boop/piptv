"use client";

import { useEffect, useRef } from "react";

export type ConfirmSpec = {
  title: string;
  body: string;
  confirmText: string;
  danger: boolean;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  spec,
  onClose,
}: {
  spec: ConfirmSpec;
  onClose: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900"
      >
        <h2 id="confirm-title" className="text-lg font-semibold">
          {spec.title}
        </h2>
        <p
          id="confirm-body"
          className="mt-2 text-base text-zinc-600 dark:text-zinc-300"
        >
          {spec.body}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-300 px-4 py-3.5 text-base transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            不用了
          </button>
          <button
            ref={confirmRef}
            onClick={() => {
              spec.onConfirm();
              onClose();
            }}
            className={`flex-1 rounded-xl px-4 py-3.5 text-base font-medium text-white transition ${
              spec.danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-zinc-900 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            }`}
          >
            {spec.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
