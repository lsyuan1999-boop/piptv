"use client";

import { useId, useState, type CSSProperties } from "react";
import type { Palette } from "@/lib/themes";
import type { StreamItem } from "@/lib/view-types";
import { formatDuration, formatTimeRange, liveState } from "@/lib/time";
import { SketchyBox } from "./sketchy";

/**
 * 浮动卡片：默认微微抬起，点击展开放大。
 *
 * 海报贴在卡片右侧，左下角起一道斜线渐隐过渡到卡片底色。
 * 海报位的宽度由图的宽高比算出来（上下略裁一点换宽度，见 CROP），
 * 左边不留需要额外填充的空白。
 *
 * 展开时卡片变高，图等比变宽，斜线跟着往左走，露出更多图 ——
 * 不需要单独给斜线做动画：渐变的色标位置本身不能 transition，
 * 但 mask 相对盒子定位，盒子一宽斜线就自然左移。
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
  // 海报图的宽高比，斜线起点要用它算。图加载完才知道真值，
  // 先按 16:9 垫着 —— 海报基本都是横图，猜错也只是第一帧的斜线偏一点
  const [aspect, setAspect] = useState(16 / 9);
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
            aria-hidden="true"
            className={`absolute inset-y-[5px] right-[5px] isolate w-auto overflow-hidden ${
              dim ? "opacity-55" : ""
            }`}
            style={{
              // 高度由 inset-y 定死，宽度交给 aspect-ratio 按比例算出来。
              // 盒子宽度因此永远等于图可见部分的宽度，左边不会空出一块
              aspectRatio: `${aspect * CROP}`,
              // 遮罩挂在盒子上而不是 img 上，染色层才会跟着一起斜切
              maskImage: posterMask(aspect * CROP),
              WebkitMaskImage: posterMask(aspect * CROP),
            }}
          >
            {/* 图填满海报位，上下各裁掉约 8%（见 CROP）。
                展开时卡片变高，海报位等比变宽，斜线自然往左走。
                已结束的场次只去掉三成饱和度，不是整张拉灰：
                海报层本身已经压到 55% 不透明度，再叠满格灰度就彻底没色了。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.coverUrl}
              alt=""
              // 海报大多是从 B 站扒的，hdslb.com 带 Referer 会 403
              referrerPolicy="no-referrer"
              onLoad={(e) => {
                const el = e.currentTarget;
                if (el.naturalHeight > 0) {
                  setAspect(el.naturalWidth / el.naturalHeight);
                }
              }}
              className={`h-full w-full object-cover object-center transition-[filter] duration-200 ${
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
            className={`relative min-w-0 p-3.5 transition-[padding] duration-200 ease-out ${
              item.coverUrl ? (open ? "pr-[50%]" : "pr-[38%]") : ""
            }`}
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
            {/* 海报占满整卡高度，所以简介也要给右边留出同样的空 */}
            <div
              className={`space-y-2 pb-3.5 pl-3.5 ${
                item.coverUrl ? "pr-[50%]" : "pr-3.5"
              }`}
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
