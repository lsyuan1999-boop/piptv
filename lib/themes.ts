/**
 * 卡片配色与背景预设。
 *
 * 配色的核心是「同一天多场直播必须一眼区分开」：
 * 每场直播按标题哈希稳定取色，同一个标题永远同一个颜色，
 * 同一天内如果撞色，渲染层会往后挪一格错开。
 */

export type Palette = {
  key: string;
  label: string;
  /** 本场配色：海报染色层、备注底色、进直播间按钮都用它 */
  gradient: [string, string];
  /** 手绘描边色 */
  ink: string;
  /** 卡片底色（浅色模式） */
  surface: string;
  /** 卡片底色（深色模式） */
  surfaceDark: string;
};

export const PALETTES: Palette[] = [
  {
    key: "peach",
    label: "蜜桃",
    gradient: ["#FF9A8B", "#FF6A88"],
    ink: "#C2410C",
    surface: "#FFF1EC",
    surfaceDark: "#3B1D16",
  },
  {
    key: "mint",
    label: "薄荷",
    gradient: ["#5EE7C2", "#3BB2B8"],
    ink: "#0F766E",
    surface: "#E9FBF5",
    surfaceDark: "#0F2E2A",
  },
  {
    key: "grape",
    label: "葡萄",
    gradient: ["#A78BFA", "#7C6BF0"],
    ink: "#6D28D9",
    surface: "#F2EEFE",
    surfaceDark: "#241C43",
  },
  {
    key: "lemon",
    label: "柠檬",
    gradient: ["#FFD86F", "#FC9E4F"],
    ink: "#B45309",
    surface: "#FFF8E6",
    surfaceDark: "#3A2C10",
  },
  {
    key: "sky",
    label: "晴空",
    gradient: ["#7DD3FC", "#4F92F7"],
    ink: "#0369A1",
    surface: "#EAF6FE",
    surfaceDark: "#12293F",
  },
  {
    key: "bubblegum",
    label: "泡泡糖",
    gradient: ["#FDA4E8", "#F472B6"],
    ink: "#BE185D",
    surface: "#FDEFF8",
    surfaceDark: "#3B1530",
  },
  {
    key: "matcha",
    label: "抹茶",
    gradient: ["#BEF264", "#84CC16"],
    ink: "#4D7C0F",
    surface: "#F4FCE3",
    surfaceDark: "#22320D",
  },
  {
    key: "cocoa",
    label: "可可",
    gradient: ["#D6BCFA", "#B08968"],
    ink: "#78350F",
    surface: "#FAF3EC",
    surfaceDark: "#2E2118",
  },
];

export function paletteByKey(key: string | null | undefined): Palette | null {
  if (!key) return null;
  return PALETTES.find((p) => p.key === key) ?? null;
}

/** 稳定字符串哈希，同一个标题永远得到同一个数。 */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * 给一天内的多场直播分配互不相同的配色。
 *
 * 先按标题哈希取首选色，撞色的往后顺延一格。
 * 这样「周四夜谈」每周都是同一个颜色，但同一天两场绝不同色。
 */
export function assignPalettes<T extends { id: number; title: string; colorKey?: string | null }>(
  items: T[],
): Map<number, Palette> {
  const out = new Map<number, Palette>();
  const used = new Set<string>();

  // 管理员手动指定的优先占位
  for (const item of items) {
    const manual = paletteByKey(item.colorKey);
    if (manual) {
      out.set(item.id, manual);
      used.add(manual.key);
    }
  }

  for (const item of items) {
    if (out.has(item.id)) continue;
    const start = hash(item.title) % PALETTES.length;
    let pick = PALETTES[start];
    for (let i = 0; i < PALETTES.length; i++) {
      const candidate = PALETTES[(start + i) % PALETTES.length];
      if (!used.has(candidate.key)) {
        pick = candidate;
        break;
      }
    }
    used.add(pick.key);
    out.set(item.id, pick);
  }

  return out;
}

export type BackgroundPreset = {
  key: string;
  label: string;
  /** 浅色模式的 CSS background 值 */
  css: string;
  /** 深色模式的 CSS background 值 */
  cssDark: string;
};

export const BACKGROUNDS: BackgroundPreset[] = [
  {
    key: "paper",
    label: "牛皮纸",
    css: "radial-gradient(circle at 20% 10%, #FFF9F0 0%, #F6EEE0 60%, #EFE4D2 100%)",
    cssDark:
      "radial-gradient(circle at 20% 10%, #23201C 0%, #1A1815 60%, #131110 100%)",
  },
  {
    key: "grid",
    label: "格子本",
    css: "linear-gradient(#FDFCF8, #FDFCF8), repeating-linear-gradient(0deg, #E6E0D0 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, #E6E0D0 0 1px, transparent 1px 24px)",
    cssDark:
      "linear-gradient(#17161A, #17161A), repeating-linear-gradient(0deg, #2C2A31 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, #2C2A31 0 1px, transparent 1px 24px)",
  },
  {
    key: "sunset",
    label: "黄昏",
    css: "linear-gradient(160deg, #FFE7D6 0%, #FFD3E0 45%, #E8DBFF 100%)",
    cssDark:
      "linear-gradient(160deg, #2E1D24 0%, #29192B 45%, #1D1930 100%)",
  },
  {
    key: "ocean",
    label: "海边",
    css: "linear-gradient(160deg, #E0F7FF 0%, #D7F0E8 50%, #FFF6DC 100%)",
    cssDark:
      "linear-gradient(160deg, #10242E 0%, #12291F 50%, #2A2517 100%)",
  },
  {
    key: "plain",
    label: "纯净白",
    css: "#FAFAF8",
    cssDark: "#111113",
  },
];

export function backgroundByKey(key: string): BackgroundPreset {
  return BACKGROUNDS.find((b) => b.key === key) ?? BACKGROUNDS[0];
}
