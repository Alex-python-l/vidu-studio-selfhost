# GitHub Flow

- 长期分支为 `main`，功能使用短分支。
- 分支名使用 `feat/`、`fix/`、`docs/` 或 `chore/` 前缀。
- 提交前先检查 `git status` 与 diff，按逻辑范围暂存，不使用 `git add .`。
- PR 至少说明用户可见变化、数据库迁移、环境变量和验证结果。
- 合并前要求 `npm run build` 与渲染测试通过。
- 合并后删除已完成短分支；禁止提交 `.env`、真实 API Key、用户素材或构建产物。
