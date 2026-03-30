# Email Center

Email Center 是一个内部使用的邮件中心项目。

当前项目按以下结构推进：

- `backend/`：后端服务，负责 API、队列、发信、审批、日志
- `frontend/`：前端管理台，负责模板、审批、发件人、日志界面
- `docs/`：项目文档、实施计划、后续设计说明

开发必须遵循：

1. 先阅读 `docs/EMAIL_CENTER_IMPLEMENTATION.md`
2. 按当前阶段推进
3. 完成后更新文档中的状态标记

包管理器统一使用 `pnpm`。
常用命令：

- `pnpm install`
- `pnpm dev:backend`
- `pnpm dev:frontend`
- `pnpm build:frontend`
- `pnpm db:migrate`
- `pnpm worker:email`
- `pnpm redis:ping`
- `pnpm queue:test`