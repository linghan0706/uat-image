BEGIN;

SET search_path TO public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImportTaskStatus') THEN
    CREATE TYPE "ImportTaskStatus" AS ENUM (
      'QUEUED',
      'RUNNING',
      'PARSE_SUCCESS',
      'PARSE_FAILED',
      'BATCH_CREATING',
      'BATCH_CREATED',
      'BATCH_CREATE_FAILED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImportSubmitMode') THEN
    CREATE TYPE "ImportSubmitMode" AS ENUM (
      'PARSE_ONLY',
      'CREATE_BATCH'
    );
  END IF;
END $$;

ALTER TABLE import_files
  ALTER COLUMN parse_status DROP DEFAULT;

ALTER TABLE import_files
  ALTER COLUMN parse_status TYPE "ImportTaskStatus"
  USING (
    CASE parse_status
      WHEN 'SUCCESS' THEN 'PARSE_SUCCESS'
      WHEN 'FAILED' THEN 'PARSE_FAILED'
      WHEN 'RUNNING' THEN 'RUNNING'
      WHEN 'QUEUED' THEN 'QUEUED'
      ELSE 'QUEUED'
    END
  )::"ImportTaskStatus";

ALTER TABLE import_files
  ALTER COLUMN parse_status SET DEFAULT 'QUEUED';

ALTER TABLE import_files
  ADD COLUMN IF NOT EXISTS submit_mode "ImportSubmitMode" NOT NULL DEFAULT 'PARSE_ONLY',
  ADD COLUMN IF NOT EXISTS result_payload JSONB,
  ADD COLUMN IF NOT EXISTS batch_payload JSONB,
  ADD COLUMN IF NOT EXISTS source_text TEXT,
  ADD COLUMN IF NOT EXISTS source_file_bytes BYTEA,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retry INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS worker_id TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_import_files_status_next_retry_at
  ON import_files (parse_status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_import_files_created_at_desc
  ON import_files (created_at DESC);

COMMENT ON TYPE "ImportTaskStatus" IS '导入解析任务状态枚举。';
COMMENT ON TYPE "ImportSubmitMode" IS '导入任务提交模式枚举。';
COMMENT ON COLUMN import_files.parse_status IS '导入任务状态。';
COMMENT ON COLUMN import_files.submit_mode IS '提交模式：仅解析或解析后自动创建批任务。';
COMMENT ON COLUMN import_files.result_payload IS '解析结果快照（JSON）。';
COMMENT ON COLUMN import_files.batch_payload IS '自动建批所需参数快照（JSON）。';
COMMENT ON COLUMN import_files.source_text IS '文本导入时保存的原始文本。';
COMMENT ON COLUMN import_files.source_file_bytes IS '文件导入时保存的原始文件字节。';
COMMENT ON COLUMN import_files.retry_count IS '当前重试次数。';
COMMENT ON COLUMN import_files.max_retry IS '最大允许重试次数。';
COMMENT ON COLUMN import_files.next_retry_at IS '下次可重试时间。';
COMMENT ON COLUMN import_files.error_code IS '错误码。';
COMMENT ON COLUMN import_files.parse_error IS '错误信息。';
COMMENT ON COLUMN import_files.worker_id IS '处理该任务的 worker 标识。';
COMMENT ON COLUMN import_files.started_at IS '开始处理时间。';
COMMENT ON COLUMN import_files.finished_at IS '结束处理时间。';
COMMENT ON COLUMN import_files.locked_at IS '任务锁定时间。';

COMMIT;
