# Next.js 批量图片生成系统（无 Redis）

基于 Next.js + PostgreSQL 原生连接（`pg`）的批量图片生成系统，支持：
- 文本/CSV/XLSX/DOCX/Markdown 导入提示词
- 原始 prompt 与 PART1/PART2/PART3/PART4 结构化模板双模式导入
- 三类图像能力（定妆照、三视图、场景概念图）
- PostgreSQL `SKIP LOCKED` 队列调度（不依赖 Redis）
- 结果落盘到 NAS（默认群晖 DSM SDK，兼容 S3 / WebDAV）
- 失败重试、任务轮询、批量导出 ZIP

## 1. 环境准备

1. Node.js 20+
2. PostgreSQL 14+
3. 复制环境变量：

```bash
cp .env.example .env
```

4. 修改 `.env` 的 `DATABASE_URL` 与群晖 NAS 配置（`NAS_PROVIDER=synology` 及 `SYNOLOGY_*`）。

## 2. 安装与初始化

```bash
npm install
psql "$DATABASE_URL" -f db/sql/001_init_with_cn_comments.sql
psql "$DATABASE_URL" -f db/sql/002_async_import_queue_upgrade.sql
psql "$DATABASE_URL" -f db/sql/002_complete_structured_prompt_schema.sql
```

## 3. 启动方式

启动 Web：

```bash
npm run dev
```

启动生成 Worker（新终端）：

```bash
npm run worker:generate
```

启动解析 Worker（新终端）：

```bash
npm run worker:parse
```

启动导出 Worker（新终端）：

```bash
npm run worker:export
```

访问：`http://localhost:3000`

## 4. 主要目录

- `src/app/page.tsx`：单页前端（导入、配置、任务、结果）
- `src/app/api/v1/**`：核心 API
- `src/lib/import-parsers`：txt/csv/xlsx/docx/md 解析
- `src/lib/queue-pg`：PostgreSQL 队列 claim/recover
- `src/lib/model-providers`：模型适配器（内置 mock）
- `src/lib/storage`：NAS 适配器（synology/s3/webdav/local）
- `src/services`：任务编排与业务逻辑
- `src/workers`：生成与导出消费者
- `db/sql/*.sql`：数据库初始化与升级脚本

## 5. API 一览

- `POST /api/v1/import/parse`
- `GET /api/v1/import/parse/{taskId}`
- `POST /api/v1/batch-jobs`
- `GET /api/v1/batch-jobs`
- `GET /api/v1/batch-jobs/{jobId}`
- `GET /api/v1/batch-jobs/{jobId}/items`
- `GET /api/v1/batch-jobs/{jobId}/images`
- `POST /api/v1/batch-jobs/{jobId}/retry-failed`
- `POST /api/v1/batch-jobs/{jobId}/export`
- `GET /api/v1/exports/{exportId}`
- `GET /api/v1/model-options?capability=THREE_VIEW`

## 6. 说明

- 结构化导入支持 `part1/part2/part3/part4/reference_prompt`，兼容别名 `PART1~PART4`、`指令`、`全局提示词`、`人设`、`参考提示词`。
- 模板模式下，系统会按 `PART1 + PART2 + PART3 + PART4` 组装最终 prompt；文本逐行导入时，每行默认映射为 `PART3`。
- 当 `STRUCTURED_PARSE_ENABLED=true` 时，文本/Markdown/TXT/DOCX 的模板模式可走 Claude 4.6 `text_to_text` 结构化解析，默认通过 SKY 网关 `/api/v1/generate_content` 调用。
- `POST /api/v1/import/parse` 现在为异步提交接口，需结合 `GET /api/v1/import/parse/{taskId}` 轮询任务状态；自动建批任务模式会在解析成功后直接返回 `batch_job_id`。
- 示例文件见 `public/examples/batch-template-example.csv`，页面内也提供下载链接。
- 默认模型提供器为 `mock`，用于联调流程。
- 默认存储后端为 `synology`，生成图与导出 ZIP 都会上传到群晖 NAS。
- 生产接入真实模型时，实现 `src/lib/model-providers` 即可。
- 无鉴权模式已启用基础限流与参数校验，建议部署时结合网关/IP 白名单。
