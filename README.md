# 直播日程表

移动端 / 网页端都能打开的直播日程，外加一个给非技术用户设计的管理界面。

- 观众端 `/` — 从今天起 7 天的安排，正在直播会高亮，没直播显示倒计时
- 管理端 `/admin` — 全部操作在一屏内完成，填表基本靠点按
- 日历订阅 `/api/ics` — 观众在手机自带日历订阅一次，之后自动同步

技术栈：Next.js 16 + Neon Postgres + Drizzle ORM + Tailwind CSS 4。

## 本地运行

```bash
npm install
cp .env.local.example .env.local   # 然后填写下面几个变量
npm run db:push                    # 在数据库里建表
npm run dev                        # http://localhost:3000
npm run seed                       # 可选：写入几条示例数据
npm run seed -- --clear            # 清空全部数据
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | Neon 连接串，形如 `postgresql://user:pass@host/db?sslmode=require` |
| `ADMIN_PASSWORD` | 管理员登录密码，请用强密码 |
| `AUTH_SECRET` | 给登录 Cookie 签名，至少 32 位随机字符 |
| `NEXT_PUBLIC_TIMEZONE` | 展示时区，默认 `Asia/Shanghai` |
| `NEXT_PUBLIC_TIMEZONE_LABEL` | 时区的中文名，默认 `北京时间` |
| `NEXT_PUBLIC_SITE_TITLE` | 页面标题，默认 `直播日程` |

生成一个随机 `AUTH_SECRET`：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 部署到 Vercel

1. 把代码推到 GitHub 仓库
2. Vercel 里 New Project，导入这个仓库
3. 在 Settings → Environment Variables 里填上面那张表里的全部变量
4. Deploy

注意 Vercel Hobby（免费版）条款限定个人非商业用途。若用于商业项目需升级 Pro，或改用 Cloudflare Pages / Netlify（代码基本不用改）。

## 设计说明

**时间一律存 UTC，展示时转成 `NEXT_PUBLIC_TIMEZONE`。** 所有时区转换集中在 `lib/time.ts`，
加减日期用 `addZonedDays` 而不是加 `n * 24h`，这样换到有夏令时的时区也不会偏移一小时。

**不存「直播中 / 已结束」状态。** 这三种状态由当前时间和 `startAt + durationMin` 实时推导。
存成字段的话需要人工维护，实际运营中一定会忘记改，页面就会永远显示"直播中"。
只有 `cancelled`（本场取消）是机器推不出来的，所以是唯一的人工状态字段。

**用 `durationMin`（时长）而不是 `endAt`（结束时间）。** 管理员填表时想的是"播两小时"，
不是"22:00 结束"，少一次心算。

**取消和删除是两件事。** 取消 = 观众看到划掉的标题，知道原本有这场但鸽了；
删除 = 彻底消失，用于填错的情况。管理端把两者分开，删除要二次确认。

**管理端为不熟电脑的用户设计。** 日期、时间、时长、平台全部是点按选择，只有标题需要打字；
按钮都带文字不只有图标；确认弹窗用日常语言而不是"确认删除此记录"；每次操作后顶部飘绿条明确反馈。

## 安全性

- 管理端用单一密码 + HttpOnly 签名 Cookie（30 天有效），`proxy.ts` 拦截 `/admin/*`
- 每个写操作在 server action 内独立校验身份，不只靠 proxy 层
- 登录失败限流：同 IP 每分钟 5 次。serverless 下各实例计数独立，只能阻挡简单的暴力尝试
- 密码比较用定时比较，避免通过响应时间推测
- 安全上限就是密码强度本身，不要用弱密码

## 文件结构

```
app/
  page.tsx                观众端页面（ISR，缓存 60 秒）
  schedule-view.tsx       日程列表，客户端走时钟算直播状态
  admin/
    page.tsx              管理端入口
    admin-board.tsx       一屏管理视图：列表 + 快捷操作 + 提示条
    stream-form.tsx       添加 / 修改表单
    pickers.tsx           日期、时间、时长、平台的点按选择器
    confirm-dialog.tsx    说人话的确认弹窗
    login/                密码登录
  api/ics/route.ts        日历订阅源 + 单场 .ics 下载
lib/
  schema.ts               数据库表结构
  db.ts                   Neon + Drizzle 连接
  queries.ts              读操作
  actions.ts              写操作（server actions）
  time.ts                 全部时区逻辑
  auth.ts                 会话签名、限流、定时比较
  use-clock.ts            hydration 安全的时钟
proxy.ts                  保护 /admin/*
scripts/
  seed.ts                 示例数据
  verify.ts               验证时区往返、批量生成、顺延、状态推导
```
