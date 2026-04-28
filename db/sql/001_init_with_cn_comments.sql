-- ============================================================
-- 文件名: 001_init_with_cn_comments.sql
-- 目标库: PostgreSQL 14+
-- 用途  : 初始化批量图片生成系统数据库结构（含中文注释）
--
-- 执行方式:
--   psql "postgresql://user:password@host:5432/dbname" -f db/sql/001_init_with_cn_comments.sql
--
-- 回滚建议:
--   1) 在测试/开发环境优先执行。
--   2) 若需整库回滚，可使用:
--      DROP SCHEMA public CASCADE;
--      CREATE SCHEMA public;
-- ============================================================

BEGIN;

SET search_path TO public;

-- ============================================================
-- 1) 枚举类型
-- ============================================================

-- 枚举类型: Capability（图片能力类型）
-- 枚举值字典:
--   PORTRAIT      = 定妆照
--   THREE_VIEW    = 三视图
--   SCENE_CONCEPT = 场景概念图
CREATE TYPE "Capability" AS ENUM (
  'PORTRAIT',
  'THREE_VIEW',
  'SCENE_CONCEPT'
);
COMMENT ON TYPE "Capability" IS '图片能力类型枚举。';

-- 枚举类型: BatchJobStatus（批量任务状态）
-- 枚举值字典:
--   PENDING         = 待创建/待处理
--   QUEUED          = 已入队等待执行
--   RUNNING         = 执行中
--   PARTIAL_SUCCESS = 部分成功
--   SUCCESS         = 全部成功
--   FAILED          = 全部失败
--   EXPORTING       = 导出中
--   EXPORTED        = 已导出
CREATE TYPE "BatchJobStatus" AS ENUM (
  'PENDING',
  'QUEUED',
  'RUNNING',
  'PARTIAL_SUCCESS',
  'SUCCESS',
  'FAILED',
  'EXPORTING',
  'EXPORTED'
);
COMMENT ON TYPE "BatchJobStatus" IS '批量任务状态枚举。';

-- 枚举类型: JobItemStatus（子任务状态）
-- 枚举值字典:
--   PENDING  = 待执行
--   RUNNING  = 执行中
--   SUCCESS  = 成功
--   FAILED   = 失败
--   RETRYING = 重试中
CREATE TYPE "JobItemStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'RETRYING'
);
COMMENT ON TYPE "JobItemStatus" IS '子任务状态枚举。';

-- 枚举类型: ExportStatus（导出状态）
-- 枚举值字典:
--   IDLE    = 空闲/未导出
--   PENDING = 待导出
--   RUNNING = 导出中
--   SUCCESS = 导出成功
--   FAILED  = 导出失败
CREATE TYPE "ExportStatus" AS ENUM (
  'IDLE',
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED'
);
COMMENT ON TYPE "ExportStatus" IS '导出状态枚举。';

-- 枚举类型: ImportTaskStatus（导入解析任务状态）
CREATE TYPE "ImportTaskStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'PARSE_SUCCESS',
  'PARSE_FAILED',
  'BATCH_CREATING',
  'BATCH_CREATED',
  'BATCH_CREATE_FAILED'
);
COMMENT ON TYPE "ImportTaskStatus" IS '导入解析任务状态枚举。';

-- 枚举类型: ImportSubmitMode（导入提交模式）
CREATE TYPE "ImportSubmitMode" AS ENUM (
  'PARSE_ONLY',
  'CREATE_BATCH'
);
COMMENT ON TYPE "ImportSubmitMode" IS '导入任务提交模式枚举。';

-- ============================================================
-- 2) 数据表
-- ============================================================

CREATE TABLE export_files (
  id            BIGSERIAL PRIMARY KEY,
  status        "ExportStatus" NOT NULL DEFAULT 'PENDING',
  file_name     TEXT NOT NULL,
  file_size     BIGINT,
  nas_provider  TEXT NOT NULL,
  nas_container TEXT NOT NULL,
  nas_object_key TEXT NOT NULL,
  access_url    TEXT,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE batch_jobs (
  id              BIGSERIAL PRIMARY KEY,
  job_no          TEXT NOT NULL,
  task_name       TEXT,
  capability      "Capability" NOT NULL,
  status          "BatchJobStatus" NOT NULL DEFAULT 'PENDING',
  source_type     TEXT NOT NULL,
  total_count     INTEGER NOT NULL DEFAULT 0,
  success_count   INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  params_snapshot JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  export_status   "ExportStatus" NOT NULL DEFAULT 'IDLE',
  export_file_id  BIGINT
);

CREATE TABLE job_items (
  id              BIGSERIAL PRIMARY KEY,
  batch_job_id    BIGINT NOT NULL,
  item_no         TEXT NOT NULL,
  line_no         INTEGER NOT NULL,
  prompt          TEXT NOT NULL,
  negative_prompt TEXT,
  model_key       TEXT NOT NULL,
  status          "JobItemStatus" NOT NULL DEFAULT 'PENDING',
  retry_count     INTEGER NOT NULL DEFAULT 0,
  max_retry       INTEGER NOT NULL DEFAULT 3,
  next_retry_at   TIMESTAMPTZ,
  error_code      TEXT,
  error_message   TEXT,
  run_params      JSONB NOT NULL,
  worker_id       TEXT,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  locked_at       TIMESTAMPTZ
);

CREATE TABLE image_results (
  id             BIGSERIAL PRIMARY KEY,
  batch_job_id   BIGINT NOT NULL,
  job_item_id    BIGINT NOT NULL,
  capability     "Capability" NOT NULL,
  view_type      TEXT,
  variant_index  INTEGER NOT NULL,
  format         TEXT NOT NULL,
  width          INTEGER NOT NULL,
  height         INTEGER NOT NULL,
  file_size      BIGINT NOT NULL,
  sha256         TEXT NOT NULL,
  nas_provider   TEXT NOT NULL,
  nas_container  TEXT NOT NULL,
  nas_object_key TEXT NOT NULL,
  access_url     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE model_configs (
  id                 BIGSERIAL PRIMARY KEY,
  model_key          TEXT NOT NULL,
  capability         "Capability" NOT NULL,
  provider           TEXT NOT NULL,
  endpoint           TEXT NOT NULL,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  is_default         BOOLEAN NOT NULL DEFAULT FALSE,
  allow_front_select BOOLEAN NOT NULL DEFAULT FALSE,
  default_params     JSONB NOT NULL,
  timeout_sec        INTEGER NOT NULL DEFAULT 90,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMPTZ NOT NULL
);

CREATE TABLE system_configs (
  config_key   TEXT PRIMARY KEY,
  config_value JSONB NOT NULL,
  description  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL
);

CREATE TABLE import_files (
  id                BIGSERIAL PRIMARY KEY,
  batch_job_id      BIGINT,
  file_name         TEXT NOT NULL,
  file_type         TEXT NOT NULL,
  file_size         BIGINT NOT NULL,
  parse_status      "ImportTaskStatus" NOT NULL DEFAULT 'QUEUED',
  submit_mode       "ImportSubmitMode" NOT NULL DEFAULT 'PARSE_ONLY',
  result_payload    JSONB,
  batch_payload     JSONB,
  source_text       TEXT,
  source_file_bytes BYTEA,
  retry_count       INTEGER NOT NULL DEFAULT 0,
  max_retry         INTEGER NOT NULL DEFAULT 3,
  next_retry_at     TIMESTAMPTZ,
  error_code        TEXT,
  parse_error       TEXT,
  worker_id         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  locked_at         TIMESTAMPTZ
);

-- ============================================================
-- 3) 约束（唯一键 / 外键）
-- ============================================================

ALTER TABLE export_files
  ADD CONSTRAINT uk_export_files_nas_object_key UNIQUE (nas_object_key);

ALTER TABLE batch_jobs
  ADD CONSTRAINT uk_batch_jobs_job_no UNIQUE (job_no);

ALTER TABLE batch_jobs
  ADD CONSTRAINT uk_batch_jobs_export_file_id UNIQUE (export_file_id);

ALTER TABLE batch_jobs
  ADD CONSTRAINT fk_batch_jobs_export_file
  FOREIGN KEY (export_file_id) REFERENCES export_files(id);

ALTER TABLE job_items
  ADD CONSTRAINT uk_job_items_item_no UNIQUE (item_no);

ALTER TABLE job_items
  ADD CONSTRAINT fk_job_items_batch_job
  FOREIGN KEY (batch_job_id) REFERENCES batch_jobs(id) ON DELETE CASCADE;

ALTER TABLE image_results
  ADD CONSTRAINT uk_image_results_nas_object_key UNIQUE (nas_object_key);

ALTER TABLE image_results
  ADD CONSTRAINT uk_image_results_job_item_variant UNIQUE (job_item_id, variant_index);

ALTER TABLE image_results
  ADD CONSTRAINT fk_image_results_batch_job
  FOREIGN KEY (batch_job_id) REFERENCES batch_jobs(id) ON DELETE CASCADE;

ALTER TABLE image_results
  ADD CONSTRAINT fk_image_results_job_item
  FOREIGN KEY (job_item_id) REFERENCES job_items(id) ON DELETE CASCADE;

ALTER TABLE model_configs
  ADD CONSTRAINT uk_model_configs_model_key UNIQUE (model_key);

ALTER TABLE import_files
  ADD CONSTRAINT fk_import_files_batch_job
  FOREIGN KEY (batch_job_id) REFERENCES batch_jobs(id) ON DELETE SET NULL;

-- ============================================================
-- 4) 索引
-- ============================================================

CREATE INDEX idx_batch_jobs_status_created_at_desc
  ON batch_jobs (status, created_at DESC);

CREATE INDEX idx_batch_jobs_capability_status
  ON batch_jobs (capability, status);

CREATE INDEX idx_job_items_batch_job_status
  ON job_items (batch_job_id, status);

CREATE INDEX idx_job_items_status_next_retry_at
  ON job_items (status, next_retry_at);

CREATE INDEX idx_job_items_model_key_status
  ON job_items (model_key, status);

CREATE INDEX idx_image_results_batch_job_created_at_desc
  ON image_results (batch_job_id, created_at DESC);

CREATE INDEX idx_image_results_capability
  ON image_results (capability);

CREATE INDEX idx_image_results_view_type
  ON image_results (view_type);

CREATE INDEX idx_model_configs_capability_enabled
  ON model_configs (capability, enabled);

CREATE INDEX idx_model_configs_capability_is_default
  ON model_configs (capability, is_default);

CREATE INDEX idx_import_files_batch_job_id
  ON import_files (batch_job_id);

CREATE INDEX idx_import_files_status_next_retry_at
  ON import_files (parse_status, next_retry_at);

CREATE INDEX idx_import_files_created_at_desc
  ON import_files (created_at DESC);

-- ============================================================
-- 5) 中文注释（表）
-- ============================================================

COMMENT ON TABLE export_files  IS '导出文件表：记录批任务导出的 ZIP 文件信息。';
COMMENT ON TABLE batch_jobs    IS '批量任务表：记录一次批量图片生成任务的汇总状态。';
COMMENT ON TABLE job_items     IS '子任务表：记录批任务中每条提示词对应的执行单元。';
COMMENT ON TABLE image_results IS '图片结果表：记录子任务产出的图片文件及 NAS 存储信息。';
COMMENT ON TABLE model_configs IS '模型配置表：记录各能力可用模型、默认参数和开关。';
COMMENT ON TABLE system_configs IS '系统配置表：记录全局配置项（NAS、限流、阈值等）。';
COMMENT ON TABLE import_files  IS '导入文件表：记录导入文件解析过程与状态。';

-- ============================================================
-- 6) 中文注释（字段）
-- ============================================================

-- export_files
COMMENT ON COLUMN export_files.id             IS '主键ID。';
COMMENT ON COLUMN export_files.status         IS '导出状态。';
COMMENT ON COLUMN export_files.file_name      IS '导出文件名。';
COMMENT ON COLUMN export_files.file_size      IS '导出文件大小（字节）。';
COMMENT ON COLUMN export_files.nas_provider   IS 'NAS 存储提供方（如 synology/s3/webdav/local）。';
COMMENT ON COLUMN export_files.nas_container  IS 'NAS 存储容器（桶名/共享目录）。';
COMMENT ON COLUMN export_files.nas_object_key IS 'NAS 对象键或相对路径。';
COMMENT ON COLUMN export_files.access_url     IS '导出文件访问地址（可为空）。';
COMMENT ON COLUMN export_files.error_message  IS '导出失败错误信息。';
COMMENT ON COLUMN export_files.created_at     IS '导出记录创建时间。';
COMMENT ON COLUMN export_files.updated_at     IS '导出记录更新时间（由应用层维护）。';

-- batch_jobs
COMMENT ON COLUMN batch_jobs.id              IS '主键ID。';
COMMENT ON COLUMN batch_jobs.job_no          IS '批任务编号（业务唯一）。';
COMMENT ON COLUMN batch_jobs.task_name       IS '任务名称（可选）。';
COMMENT ON COLUMN batch_jobs.capability      IS '图片能力类型。';
COMMENT ON COLUMN batch_jobs.status          IS '批任务执行状态。';
COMMENT ON COLUMN batch_jobs.source_type     IS '提示词来源类型（text/csv/xlsx/docx/md/txt）。';
COMMENT ON COLUMN batch_jobs.total_count     IS '子任务总数。';
COMMENT ON COLUMN batch_jobs.success_count   IS '成功子任务数量。';
COMMENT ON COLUMN batch_jobs.failed_count    IS '失败子任务数量。';
COMMENT ON COLUMN batch_jobs.params_snapshot IS '任务参数快照（JSON）。';
COMMENT ON COLUMN batch_jobs.created_at      IS '创建时间。';
COMMENT ON COLUMN batch_jobs.started_at      IS '开始执行时间。';
COMMENT ON COLUMN batch_jobs.finished_at     IS '结束时间。';
COMMENT ON COLUMN batch_jobs.export_status   IS '导出状态。';
COMMENT ON COLUMN batch_jobs.export_file_id  IS '关联导出文件ID（唯一，可空）。';

-- job_items
COMMENT ON COLUMN job_items.id              IS '主键ID。';
COMMENT ON COLUMN job_items.batch_job_id    IS '所属批任务ID。';
COMMENT ON COLUMN job_items.item_no         IS '子任务编号（业务唯一）。';
COMMENT ON COLUMN job_items.line_no         IS '来源行号。';
COMMENT ON COLUMN job_items.prompt          IS '正向提示词。';
COMMENT ON COLUMN job_items.negative_prompt IS '反向提示词。';
COMMENT ON COLUMN job_items.model_key       IS '执行模型标识。';
COMMENT ON COLUMN job_items.status          IS '子任务状态。';
COMMENT ON COLUMN job_items.retry_count     IS '当前重试次数。';
COMMENT ON COLUMN job_items.max_retry       IS '最大允许重试次数。';
COMMENT ON COLUMN job_items.next_retry_at   IS '下次重试时间。';
COMMENT ON COLUMN job_items.error_code      IS '失败错误码。';
COMMENT ON COLUMN job_items.error_message   IS '失败错误信息。';
COMMENT ON COLUMN job_items.run_params      IS '运行参数快照（JSON）。';
COMMENT ON COLUMN job_items.worker_id       IS '处理该任务的 worker 标识。';
COMMENT ON COLUMN job_items.started_at      IS '开始处理时间。';
COMMENT ON COLUMN job_items.finished_at     IS '完成时间。';
COMMENT ON COLUMN job_items.locked_at       IS '任务锁定时间。';

-- image_results
COMMENT ON COLUMN image_results.id             IS '主键ID。';
COMMENT ON COLUMN image_results.batch_job_id   IS '所属批任务ID。';
COMMENT ON COLUMN image_results.job_item_id    IS '所属子任务ID。';
COMMENT ON COLUMN image_results.capability     IS '图片能力类型。';
COMMENT ON COLUMN image_results.view_type      IS '三视图视角类型（front/side/back，可空）。';
COMMENT ON COLUMN image_results.variant_index  IS '同一子任务下的结果序号。';
COMMENT ON COLUMN image_results.format         IS '图片格式（png/jpg/webp）。';
COMMENT ON COLUMN image_results.width          IS '图片宽度。';
COMMENT ON COLUMN image_results.height         IS '图片高度。';
COMMENT ON COLUMN image_results.file_size      IS '图片大小（字节）。';
COMMENT ON COLUMN image_results.sha256         IS '图片内容哈希（SHA-256）。';
COMMENT ON COLUMN image_results.nas_provider   IS 'NAS 存储提供方。';
COMMENT ON COLUMN image_results.nas_container  IS 'NAS 存储容器（桶名/共享目录）。';
COMMENT ON COLUMN image_results.nas_object_key IS 'NAS 对象键或相对路径（唯一）。';
COMMENT ON COLUMN image_results.access_url     IS '图片访问地址（可空）。';
COMMENT ON COLUMN image_results.created_at     IS '记录创建时间。';

-- model_configs
COMMENT ON COLUMN model_configs.id                 IS '主键ID。';
COMMENT ON COLUMN model_configs.model_key          IS '模型唯一标识。';
COMMENT ON COLUMN model_configs.capability         IS '所属图片能力类型。';
COMMENT ON COLUMN model_configs.provider           IS '模型提供方。';
COMMENT ON COLUMN model_configs.endpoint           IS '模型调用地址。';
COMMENT ON COLUMN model_configs.enabled            IS '是否启用。';
COMMENT ON COLUMN model_configs.is_default         IS '是否默认模型。';
COMMENT ON COLUMN model_configs.allow_front_select IS '是否允许前端手动选择。';
COMMENT ON COLUMN model_configs.default_params     IS '模型默认参数（JSON）。';
COMMENT ON COLUMN model_configs.timeout_sec        IS '模型调用超时时间（秒）。';
COMMENT ON COLUMN model_configs.created_at         IS '创建时间。';
COMMENT ON COLUMN model_configs.updated_at         IS '更新时间（由应用层维护）。';

-- system_configs
COMMENT ON COLUMN system_configs.config_key   IS '配置键。';
COMMENT ON COLUMN system_configs.config_value IS '配置值（JSON）。';
COMMENT ON COLUMN system_configs.description  IS '配置说明。';
COMMENT ON COLUMN system_configs.updated_at   IS '更新时间（由应用层维护）。';

-- import_files
COMMENT ON COLUMN import_files.id           IS '主键ID。';
COMMENT ON COLUMN import_files.batch_job_id IS '关联批任务ID（可空）。';
COMMENT ON COLUMN import_files.file_name    IS '导入文件名。';
COMMENT ON COLUMN import_files.file_type    IS '文件类型（csv/xlsx/docx/md/txt 等）。';
COMMENT ON COLUMN import_files.file_size    IS '文件大小（字节）。';
COMMENT ON COLUMN import_files.parse_status IS '导入任务状态。';
COMMENT ON COLUMN import_files.submit_mode  IS '提交模式：仅解析或解析后自动创建批任务。';
COMMENT ON COLUMN import_files.result_payload IS '解析结果快照（JSON）。';
COMMENT ON COLUMN import_files.batch_payload IS '自动建批所需参数快照（JSON）。';
COMMENT ON COLUMN import_files.source_text IS '文本导入时保存的原始文本。';
COMMENT ON COLUMN import_files.source_file_bytes IS '文件导入时保存的原始文件字节。';
COMMENT ON COLUMN import_files.retry_count IS '当前重试次数。';
COMMENT ON COLUMN import_files.max_retry IS '最大允许重试次数。';
COMMENT ON COLUMN import_files.next_retry_at IS '下次可重试时间。';
COMMENT ON COLUMN import_files.error_code IS '错误码。';
COMMENT ON COLUMN import_files.parse_error  IS '错误信息。';
COMMENT ON COLUMN import_files.worker_id IS '处理该任务的 worker 标识。';
COMMENT ON COLUMN import_files.created_at   IS '导入记录创建时间。';
COMMENT ON COLUMN import_files.started_at IS '开始处理时间。';
COMMENT ON COLUMN import_files.finished_at IS '结束处理时间。';
COMMENT ON COLUMN import_files.locked_at IS '任务锁定时间。';

COMMIT;

-- ============================================================
-- 附: 可选校验 SQL（按需手动执行）
-- ============================================================
-- 1) 查看所有业务字段注释覆盖情况
-- SELECT c.table_name, c.column_name, col_description((quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass::oid, c.ordinal_position) AS column_comment
-- FROM information_schema.columns c
-- WHERE c.table_schema = 'public'
--   AND c.table_name IN ('batch_jobs','job_items','image_results','model_configs','system_configs','import_files','export_files')
-- ORDER BY c.table_name, c.ordinal_position;
--
-- 2) 查看表注释
-- SELECT c.relname AS table_name, obj_description(c.oid) AS table_comment
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relkind = 'r'
--   AND c.relname IN ('batch_jobs','job_items','image_results','model_configs','system_configs','import_files','export_files');
--
-- 3) 查看枚举类型注释
-- SELECT t.typname AS enum_type, obj_description(t.oid, 'pg_type') AS enum_comment
-- FROM pg_type t
-- JOIN pg_namespace n ON n.oid = t.typnamespace
-- WHERE n.nspname = 'public'
--   AND t.typname IN ('Capability','BatchJobStatus','JobItemStatus','ExportStatus');
