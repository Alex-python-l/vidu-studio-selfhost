# Project Agent Instructions

- 项目是独立的自托管版本；不要向任何上游或原始仓库提交修改。
- 生产架构以 `docs/DEPLOY.md` 为准：Node.js + MySQL + Garage，Nginx 负责 HTTPS 入口。
- 不得提交 `.env`、数据库导出、对象存储凭证、API Key、用户素材或构建产物。
- 数据库结构的权威初始化文件位于 `deploy/mysql/init/001-schema.sql`；只做可回滚、向前兼容的生产变更。
- `db/mysql-d1.ts` 是现有业务查询到 MySQL 的兼容边界，修改 SQL 行为时必须补充测试。
- 反向代理必须传递可信的 `Host`、`X-Forwarded-Host` 与 `X-Forwarded-Proto`，应用只应绑定回环地址。
- 修改 Vidu 或 Gemini API 参数前核对当前官方文档，不得在日志中记录密钥、完整媒体 URL 或上游原始响应。
- 完成前至少运行生产构建、渲染测试和相关 TypeScript 行为测试；部署变更还要运行 MySQL 与应用深度健康检查。
- Git 只使用 `https://github.com/Alex-python-l/vidu-studio-selfhost`，发布前核对 `git remote -v`。
