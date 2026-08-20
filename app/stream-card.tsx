"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import type { Palette } from "@/lib/themes";
import type { StreamItem } from "@/lib/view-types";
import { formatDuration, formatTimeRange, liveState } from "@/lib/time";
import { SketchyBox } from "./sketchy";

/**
 * 浮动卡片：默认微微抬起，点击展开放大。
 *
 * 海报贴在卡片右侧，左下角起一道斜线渐隐过渡到卡片底色。
 * 海报位的宽度取两者的较小值：按图的宽高比算出来的宽度（上下略裁一点
 * 换宽度，见 CROP），和卡片宽度的一个上限比例（见 MAX_POSTER）。
 * 左边不留需要额外填充的空白。
 *
 * 展开时卡片变高，图等比变宽，斜线跟着往左走，露出更多图 ——
 * 不需要单独给斜线做动画：渐变的色标位置本身不能 transition，
 * 但 mask 相对盒子定位，盒子一宽斜线就自然左移。碰到宽度上限后
 * 就不再变宽了，改为从图上多裁掉一点两侧。
 *
 * 没配海报的场次不画这一层，文字直接占满整卡。
 */

/**
 * 海报位比图本身宽多少倍。
 *
 * 1 = 一点不裁，但海报位只有卡片高度 × 宽高比那么宽（16:9 的图在收起状态
 * 约 168px），搁在整张卡上偏小。放宽到 1.2 换回三成宽度，代价是上下各裁
 * 掉约 8%（总共 1 - 1/1.2 ≈ 17%），横图裁这点看不出少了东西。
 * 想再宽就往上调，但裁掉的比例是 1 - 1/CROP，涨得比宽度快。
 */
const CROP = 1.2;

/**
 * 海报位最宽能占卡片宽度的百分之多少（收起 / 展开）。
 *
 * 只按宽高比算宽度会在窄屏上失控：海报宽度 = 卡片高度 × 宽高比，跟卡片
 * 宽度无关，所以同一张 16:9 的图在 588px 宽的卡上占三成，在 358px 的手机
 * 卡上就占到六成；展开后卡片变高，还会继续往左长，把标题和简介挤成竖条。
 *
 * 这两个数和文字区的 pr-[38%] / pr-[50%] 是同一套预算 —— 文字区靠 padding
 * 让位，海报靠这里封顶，两边对齐才不会重叠。改一个就得改另一个。
 */
const MAX_POSTER = { closed: 0.38, open: 0.5 } as const;

/**
 * 海报四边内缩多少像素躲开手绘描边。规整的直角图片压住抖动的线很难看。
 * 文字区的 padding 也要带上这个量 —— 海报左缘在 100% - 5px - 宽度上限处，
 * 只按百分比留白的话文字右缘会正好探进去 5px。
 */
const POSTER_INSET = 5;

/** 文字区要给海报让出的右边距。 */
function textInset(open: boolean): string {
  const pct = (open ? MAX_POSTER.open : MAX_POSTER.closed) * 100;
  return `calc(${pct}% + ${POSTER_INSET}px)`;
}

/**
 * 海报左缘的斜切遮罩，起点正好落在海报位的左下角。
 *
 * 角度先定死 135deg：卡片很扁，角度不够大的话整个高度上只带来二三十 px
 * 横移，会被上百 px 宽的渐隐带糊成竖线，看不出是斜的。
 *
 * 起始色标必须精确等于左下角的位置，这是关键。135deg 下点 (x,y) 在渐变上
 * 的位置是 (x+y)/(W+H)，所以左下角 (0,H) 落在 H/(W+H)，也就是
 * 1/(1+宽高比) 处：
 *   - 比它小 → 左下角带着不透明度，图规整的左边缘整条露出来，一道锐利竖边
 *   - 比它大 → 切口跑到下边缘里侧去了，左边空出一块得拿东西去填
 * 取等号，斜线就从左下角那个点起步，两个毛病都没有。
 *
 * 传进来的必须是**海报位**的宽高比，不是图的原始宽高比。图用 object-cover
 * 填满海报位，所以海报位的左下角就是图可见部分的左下角 —— 裁多少都对得上。
 */
function posterMask(boxAspect: number) {
  const corner = 100 / (1 + boxAspect);
  // 14 个百分点的渐隐带：这个尺寸下约 26px，再宽就把图吃掉太多了
  return `linear-gradient(135deg, transparent ${corner.toFixed(1)}%, #000 ${(
    corner + 14
  ).toFixed(1)}%)`;
}

export default function StreamCard({
  item,
  palette,
  now,
}: {
  item: StreamItem;
  palette: Palette;
  now: Date;
}) {
  const [open, setOpen] = useState(false);
  // 海报图的宽高比，用来算海报位想要多宽。图加载完才知道真值，
  // 先按 16:9 垫着 —— 海报基本都是横图，猜错也只是第一帧的宽度偏一点
  const [aspect, setAspect] = useState(16 / 9);
  /**
   * 海报位**实际**渲染出来的宽高比，斜线起点要用它算。
   *
   * 不能直接用 aspect × CROP：宽度被 MAX_POSTER 封顶后，盒子的真实比例
   * 就不再等于那个值了，拿旧数算出来的斜线会偏离左下角 —— 要么露出一条
   * 锐利竖边，要么切口跑进下边缘里侧、左边空一块。
   */
  const [boxAspect, setBoxAspect] = useState(16 / 9 * CROP);
  const posterRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const startAt = new Date(item.startAtMs);
  const state = liveState(startAt, item.durationMin, now);
  // 只表示「按日程这一场正在进行」，不代表真的在播 ——
  // 真实开播状态只有顶部横幅说得准（那块只认 B 站），
  // 所以这里的措辞不能是「正在直播」，否则两处会互相打脸
  const isCurrent = state === "live" && !item.cancelled;
  const dim = state === "ended" || item.cancelled;

  // 每张卡都可展开：即使没简介，展开也会放大标题、露出更多海报
  const hasText = Boolean(item.description || item.note);

  /**
   * 量出海报位真实的宽高比喂给遮罩。
   *
   * 用 ResizeObserver 而不是在 render 里算：封顶之后宽度由卡片宽度决定，
   * 而卡片宽度取决于视口、展开状态、字体加载完没有 —— 这些都不是渲染时
   * 能提前知道的。转屏和展开动画也会连续触发，观察者刚好都能覆盖到。
   */
  useEffect(() => {
    const el = posterRef.current;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      const { inlineSize, blockSize } = entry.contentBoxSize[0];
      if (blockSize <= 0) return;
      const next = inlineSize / blockSize;
      // 阈值防抖：动画每一帧都会回调，差一点点就重渲染不值得
      setBoxAspect((prev) => (Math.abs(prev - next) > 0.01 ? next : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [item.coverUrl]);

  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={hasText ? panelId : undefined}
        className={`group relative block w-full text-left transition-transform duration-200 ease-out ${
          open ? "scale-[1.03]" : "hover:scale-[1.015] active:scale-[0.99]"
        } cursor-pointer`}
        data-card-surface
        style={
          {
            transformOrigin: "center",
            "--surface-light": palette.surface,
            "--surface-dark": palette.surfaceDark,
          } as CSSProperties
        }
      >
        {/* 手绘描边 + 卡片底色。底色走 CSS 变量，深色模式才能跟着切 */}
        <SketchyBox
          seed={item.id * 7 + 13}
          stroke={palette.ink}
          fill="var(--card-surface)"
          strokeWidth={open || isCurrent ? 2.6 : 2}
        />

        {/* 浮动阴影，展开时加深 */}
        <div
          aria-hidden="true"
          className={`absolute inset-x-1 -bottom-0.5 -z-10 h-full rounded-md transition-all duration-200 ${
            open
              ? "translate-y-2 blur-lg opacity-40"
              : "translate-y-1 blur-md opacity-25 group-hover:translate-y-1.5 group-hover:opacity-35"
          }`}
          style={{ background: palette.ink }}
        />

        {/* 海报层：贴右缘，左边缘用 mask 斜切渐隐。
            挂在按钮上而不是文字区里 —— 要占满整张卡的高度，
            否则展开后海报只盖住上半截，卡片中间会横着一道切口。
            内缩 5px 躲开手绘描边：规整的直角图片压住抖动的线很难看。 */}
        {item.coverUrl && (
          <div
            ref={posterRef}
            aria-hidden="true"
            data-poster
            className={`absolute isolate w-auto overflow-hidden transition-[max-width] duration-200 ease-out ${
              dim ? "opacity-55" : ""
            }`}
            style={{
              top: POSTER_INSET,
              bottom: POSTER_INSET,
              right: POSTER_INSET,
              // 高度由 top/bottom 定死。宽度想要「高度 × 宽高比」，但 CSS 里
              // 拿不到父元素高度来算，所以交给一个撑高度的内层去顶出来（见下），
              // 这里只负责封顶：超过这个比例就裁，不许再宽
              maxWidth: `${(open ? MAX_POSTER.open : MAX_POSTER.closed) * 100}%`,
              // 遮罩用实测比例算，封顶后斜线才还落在左下角
              maskImage: posterMask(boxAspect),
              WebkitMaskImage: posterMask(boxAspect),
            }}
          >
            {/* 撑宽度用的垫片：高度撑满海报位，再用 aspect-ratio 换算出
                「高度 × 宽高比」的宽度，把外层顶到这个宽度为止。
                外层的 max-width 会在窄屏上截断它 —— 那时候垫片被压窄，
                图靠 object-cover 从两侧裁掉多出来的部分。
                这样高度永远填满，不会在下边缘留空。 */}
            <div
              className="h-full"
              style={{ aspectRatio: `${(aspect * CROP).toFixed(4)}` }}
            />

            {/* 图铺满整个海报位，多余的部分左右裁掉（object-cover + 居中）。
                走 next/image 而不是原生 <img>：图存在 Blob 的独立域名上，
                不套一层代理的话请求绕过我们自己的 CDN，国内加载会很慢。
                代理之后顺带压缩尺寸、转 WebP/AVIF。
                已结束的场次只去掉三成饱和度，不是整张拉灰：
                海报层本身已经压到 55% 不透明度，再叠满格灰度就彻底没色了。 */}
            <Image
              src={item.coverUrl}
              alt=""
              fill
              // 海报最宽占卡片一半，卡片封顶 672px —— 别让浏览器按整屏宽度选图
              sizes="(max-width: 672px) 50vw, 336px"
              onLoad={(e) => {
                const el = e.currentTarget;
                if (el.naturalHeight > 0) {
                  setAspect(el.naturalWidth / el.naturalHeight);
                }
              }}
              className={`object-cover object-center transition-[filter] duration-200 ${
                dim ? "grayscale-[0.35]" : ""
              }`}
              loading="lazy"
            />
            {/* 染色层：游戏海报大多偏灰，叠一层本场配色让它跟卡片是一伙的。
                用 color 混色而不是 soft-light —— 只换色相饱和度、保留明度，
                海报的明暗层次不会被压平。
                55% 是实测的甜点：再往上（75%）整张糊成单色，海报自己的
                颜色全丢了；再往下（40%）又看不出染过。 */}
            <div
              className="absolute inset-0 opacity-55 mix-blend-color"
              style={{
                background: `linear-gradient(135deg, ${palette.gradient[0]}, ${palette.gradient[1]})`,
              }}
            />
          </div>
        )}

        <div className={`relative transition-opacity ${dim ? "opacity-55" : ""}`}>
          {/* 文字区：右侧留出海报的宽度，两者不重叠。
              海报宽度 = 卡片高度 × 宽高比 × CROP，按横图（16:9~2:1）调的，
              竖图海报会多留一点白，不影响可读性。
              没海报就不留，标题占满整卡 */}
          <div
            className="relative min-w-0 p-3.5 transition-[padding] duration-200 ease-out"
            style={
              item.coverUrl ? { paddingRight: textInset(open) } : undefined
            }
          >
            <div className="flex items-baseline gap-2">
              {/* 起止时间连写，whitespace-nowrap 防止窄屏在中间断成两行 */}
              <span
                className="whitespace-nowrap text-lg tabular-nums"
                style={{ color: palette.ink, fontFamily: "var(--font-hand)" }}
              >
                {formatTimeRange(startAt, item.durationMin)}
              </span>
              {isCurrent && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                  style={{ backgroundColor: palette.ink }}
                >
                  现在这场
                </span>
              )}
              {item.cancelled && (
                <span className="rounded-full bg-zinc-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  本场取消
                </span>
              )}
            </div>

            {/* 展开时字号变大：这时候不能再 truncate，
                否则字大了单行装得更少，长标题展开后反而看得更少。 */}
            <h3
              className={`mt-0.5 leading-snug transition-[font-size] duration-200 ease-out ${
                open
                  ? "line-clamp-2 text-xl sm:text-2xl"
                  : "truncate text-base"
              } ${item.cancelled ? "line-through decoration-2" : ""}`}
            >
              {item.title}
            </h3>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <span>播 {formatDuration(item.durationMin)}</span>
              {/* 不用 ml-auto 推到最右：那会正好落在海报的渐隐带上，糊成一团 */}
              <span className="text-zinc-400 dark:text-zinc-500">
                {open ? "收起 ▲" : "详情 ▼"}
              </span>
            </div>
          </div>
        </div>

        {/* 展开区 */}
        {hasText && (
          <div
            id={panelId}
            className={`relative overflow-hidden transition-all duration-200 ease-out ${
              open ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            {/* 海报占满整卡高度，所以简介也要给右边留出同样的空。
                展开区只在展开时可见，固定用 open 那一档 */}
            <div
              className={`space-y-2 pb-3.5 pl-3.5 ${
                item.coverUrl ? "" : "pr-3.5"
              }`}
              style={
                item.coverUrl ? { paddingRight: textInset(true) } : undefined
              }
            >
              {item.description && (
                <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                  {item.description}
                </p>
              )}
              {item.note && (
                <p
                  className="rounded-lg px-2.5 py-1.5 text-sm font-medium"
                  style={{
                    background: `${palette.gradient[0]}33`,
                    color: palette.ink,
                  }}
                >
                  {item.note}
                </p>
              )}
            </div>
          </div>
        )}
      </button>
    </li>
  );
}
