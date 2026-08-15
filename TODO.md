# TODO

## ✅ 海报图 / 封面（已完成）
使用 Vercel Blob 实现了图片库功能：
- 管理端可上传 JPG/PNG/WebP 图片（最大 4MB）
- 图片存储在 Vercel Blob（免费额度 1 GB）
- 添加/编辑日程时从图片库选择，不再手填 URL
- 新增 `media` 表存储图片元数据
- 新增 `/api/media/upload` 上传接口和 `/api/media` 列表接口

部署时需要：
1. 在 Vercel 项目设置 → Storage → Connect Store → Blob 创建存储
2. 会自动添加 `BLOB_READ_WRITE_TOKEN` 环境变量
3. 本地开发需要从 Vercel 复制该环境变量到 `.env.local`

## 上线前必做
- [ ] `ADMIN_PASSWORD` 还是占位值 `change-me-please`，换成真密码
- [ ] `AUTH_SECRET` 还是开发用占位值，换成随机长串（`openssl rand -base64 32`）
- [ ] 轮换 Neon 数据库密码（曾在明文对话里出现过）：Neon 控制台 → Project → Roles → `neondb_owner` → Reset password
- [ ] 确认 Vercel Hobby 的非商业用途限制适用于本项目
- [ ] 在 Vercel 创建 Blob 存储并配置 `BLOB_READ_WRITE_TOKEN`
