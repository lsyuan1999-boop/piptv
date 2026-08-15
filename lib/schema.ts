import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";


/**
 * 直播场次。
 *
 * 设计说明：
 * - startAt 一律存 UTC，展示时再转成 NEXT_PUBLIC_TIMEZONE 指定的时区。
 * - 用 durationMin（时长）而不是 endAt（结束时间），管理端填写时更直观。
 * - 不存「未开始 / 直播中 / 已结束」状态，这些全部由当前时间实时推导，
 *   避免需要人工维护而必然出现的状态过期问题。只有 cancelled 是人工字段。
 * - 不存直播间地址：只有一个哔哩哔哩直播间，地址是站点级设置，见 settings.liveUrl。
 */
export const streams = pgTable(
  "streams",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull().default(120),
    cancelled: boolean("cancelled").notNull().default(false),
    note: text("note"),
    /** 卡片配色。留空则按标题自动分配，保证同一天多场颜色不同。 */
    colorKey: text("color_key"),
    /** 海报图 URL，可留空 —— 留空时用渐变色块替代。 */
    coverUrl: text("cover_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("streams_start_at_idx").on(table.startAt)],
);

export type Stream = typeof streams.$inferSelect;
export type NewStream = typeof streams.$inferInsert;

/**
 * 站点外观设置，单行表（id 恒为 1）。
 * 管理员在后台改背景、主题色等，不用改代码。
 */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  /** 背景预设名，见 lib/themes.ts */
  background: text("background").notNull().default("paper"),
  /** 自定义背景图 URL，填了就盖过 background 预设 */
  backgroundUrl: text("background_url"),
  /** 顶部标题，留空用环境变量里的默认值 */
  siteTitle: text("site_title"),
  /** 副标题 / 一句话介绍 */
  tagline: text("tagline"),
  /**
   * 唯一的哔哩哔哩直播间地址，顶部「进直播间」按钮用它。
   * 留空则不显示按钮。每场直播不再各自存地址。
   */
  liveUrl: text("live_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Settings = typeof settings.$inferSelect;

/**
 * 图片库。上传到 Vercel Blob 的图片元数据。
 * 管理端选择海报图时从这里选，不再手填 URL。
 */
export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  /** 原始文件名（带扩展名） */
  filename: text("filename").notNull(),
  /** Vercel Blob 返回的 URL，永久可访问 */
  url: text("url").notNull(),
  /** 文件大小（字节） */
  size: integer("size").notNull(),
  /** MIME 类型，例如 image/jpeg */
  mimeType: text("mime_type").notNull(),
  /** 图片宽度（像素），用于计算宽高比 */
  width: integer("width"),
  /** 图片高度（像素） */
  height: integer("height"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
