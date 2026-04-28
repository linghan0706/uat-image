-- ============================================================
-- 文件名: 002_complete_structured_prompt_schema.sql
-- 目标库: PostgreSQL 14+
-- 用途  : 补全结构化提示词批量生成所需数据库结构
--
-- 执行方式:
--   psql "postgresql://user:password@host:5432/dbname" -f db/sql/002_complete_structured_prompt_schema.sql
-- ============================================================

BEGIN;

SET search_path TO public;

-- ============================================================
-- 1) batch_jobs 补充 folder_name
-- ============================================================

ALTER TABLE batch_jobs
  ADD COLUMN IF NOT EXISTS folder_name TEXT;

UPDATE batch_jobs
SET folder_name = COALESCE(NULLIF(task_name, ''), job_no)
WHERE folder_name IS NULL;

ALTER TABLE batch_jobs
  ALTER COLUMN folder_name SET NOT NULL;

COMMENT ON COLUMN batch_jobs.folder_name IS '任务输出文件夹名称。';
COMMENT ON COLUMN batch_jobs.params_snapshot IS '任务参数快照（JSON，含模型参数与 template_config）。';

-- ============================================================
-- 2) job_items 补充 prompt_blocks
-- ============================================================

ALTER TABLE job_items
  ADD COLUMN IF NOT EXISTS prompt_blocks JSONB;

COMMENT ON COLUMN job_items.prompt IS '最终发送给模型的正向提示词。';
COMMENT ON COLUMN job_items.prompt_blocks IS '结构化提示词块快照（含 source_mode 与 PART1~PART4）。';

-- ============================================================
-- 3) model_configs 唯一约束调整为 capability + model_key
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uk_model_configs_model_key'
      AND conrelid = 'model_configs'::regclass
  ) THEN
    ALTER TABLE model_configs
      DROP CONSTRAINT uk_model_configs_model_key;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uk_model_configs_capability_model_key'
      AND conrelid = 'model_configs'::regclass
  ) THEN
    ALTER TABLE model_configs
      ADD CONSTRAINT uk_model_configs_capability_model_key UNIQUE (capability, model_key);
  END IF;
END $$;

COMMENT ON COLUMN model_configs.model_key IS '模型标识（在同一能力下唯一）。';

COMMIT;
