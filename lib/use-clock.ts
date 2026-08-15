"use client";

import { useSyncExternalStore } from "react";

/**
 * 一个每 intervalMs 走一格的时钟。
 *
 * 用 useSyncExternalStore 而不是 useState + useEffect：
 * 服务端渲染和 hydration 期间读 serverNow，保证首屏一致；
 * hydration 完成后自动切到客户端真实时间。
 */
function createClock(intervalMs: number) {
  let now = Date.now();
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    subscribe(onChange: () => void): () => void {
      listeners.add(onChange);
      if (timer === null) {
        timer = setInterval(() => {
          now = Date.now();
          for (const l of listeners) l();
        }, intervalMs);
      }
      // 挂载后立刻校准一次，不必等第一个 tick
      now = Date.now();
      onChange();

      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    getSnapshot: (): number => now,
  };
}

const clock30s = createClock(30_000);

export function useNowMs(serverNowMs: number): number {
  return useSyncExternalStore(
    clock30s.subscribe,
    clock30s.getSnapshot,
    () => serverNowMs,
  );
}
