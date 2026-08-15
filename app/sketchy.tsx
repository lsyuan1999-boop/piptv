"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import rough from "roughjs";

/**
 * 手绘风格边框，基于 Rough.js。
 *
 * 用 `rough.generator()` 而不是 `rough.svg()`：generator 返回纯 path 字符串，
 * 交给 React 渲染成 JSX，不需要命令式地往 SVG 里 appendChild。
 *
 * 关键是用 `rc.rectangle()`（直角），不是 `rc.path()` 喂圆角矩形 path。
 * 圆角那条路走不通：Rough.js 把每段圆弧分别随机化，接缝对不齐，
 * 拐角处会出现豁口 —— 也就是之前"像强行多段拼接"的来源。
 * 直角矩形反而是它最擅长的：两笔分岔、拐角出头交叉，正是手绘的样子。
 *
 * 另一条也别走：沿周长插点喂 `rc.polygon()`。抖动是变明显了，
 * 但每小段独立随机化，叠起来整圈毛边，比原来还糟。
 */

/** 单例 generator，不用每次渲染都新建。 */
const gen = rough.generator();

export function SketchyBox({
  stroke,
  fill,
  seed,
  roughness = 1,
  bowing = 1.6,
  strokeWidth = 2,
  className = "",
}: {
  stroke: string;
  fill?: string;
  seed: number;
  roughness?: number;
  bowing?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ w: Math.round(box.width), h: Math.round(box.height) });
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const paths = useMemo(() => {
    if (size.w === 0 || size.h === 0) return [];
    // 留出余量：手绘线会在拐角处出头，贴边画会被裁掉
    const pad = strokeWidth + 3;
    const drawable = gen.rectangle(
      pad,
      pad,
      size.w - pad * 2,
      size.h - pad * 2,
      {
        stroke,
        strokeWidth,
        roughness,
        bowing,
        // seed 固定 → 同一张卡片每次渲染轨迹一致，不会闪
        seed: Math.abs(Math.trunc(seed)) % 2 ** 31 || 1,
        fill,
        fillStyle: "solid",
      },
    );
    return gen.toPaths(drawable);
  }, [size, stroke, fill, seed, roughness, bowing, strokeWidth]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
    >
      {paths.length > 0 ? (
        <svg
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          className="overflow-visible"
        >
          {paths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              stroke={p.stroke}
              strokeWidth={p.strokeWidth}
              /* fill 走 style：SVG 的 fill 属性不认 var()，
                 而卡片底色需要用变量才能跟着深色模式切换 */
              style={{ fill: p.fill ?? "none" }}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      ) : (
        /* 量到尺寸之前（服务端渲染、客户端首帧）先用普通边框顶着。
           服务端和客户端首帧渲染同一份，不会有 hydration 不一致；
           JS 挂了也还剩个规规矩矩的卡片。 */
        <div
          className="absolute inset-0"
          style={{
            border: `${strokeWidth}px solid ${stroke}`,
            borderRadius: 4,
            background: fill,
          }}
          data-sketchy-fallback
        />
      )}
    </div>
  );
}

/**
 * 手绘分隔线，用在日期标题下面。
 * 这里可以放心用 rc.line —— 单段直线没有接缝问题。
 * bowing 别给大：120px 短线上弯太狠，两笔会糊成一坨黑。
 */
export function SketchyUnderline({
  color,
  seed,
  width = 120,
}: {
  color: string;
  seed: number;
  width?: number;
}) {
  const paths = useMemo(() => {
    const drawable = gen.line(2, 5, width - 2, 5, {
      stroke: color,
      strokeWidth: 2,
      roughness: 1.1,
      bowing: 1.2,
      seed: Math.abs(Math.trunc(seed)) % 2 ** 31 || 1,
    });
    return gen.toPaths(drawable);
  }, [color, seed, width]);

  return (
    <svg
      aria-hidden="true"
      width={width}
      height={10}
      viewBox={`0 0 ${width} 10`}
      className="overflow-visible"
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={p.stroke}
          strokeWidth={p.strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
