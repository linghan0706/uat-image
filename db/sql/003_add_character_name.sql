-- ============================================================
-- 文件名: 003_add_character_name.sql
-- 目标库: PostgreSQL 14+
-- 用途  : job_items 新增 character_name 字段，用于按角色名命名存储图片
--
-- 执行方式:
--   psql "postgresql://user:password@host:5432/dbname" -f db/sql/003_add_character_name.sql
-- ============================================================

BEGIN;

SET search_path TO public;

-- ============================================================
-- 1) job_items 新增 character_name
-- ============================================================

ALTER TABLE job_items
  ADD COLUMN IF NOT EXISTS character_name TEXT;

COMMENT ON COLUMN job_items.character_name IS '角色名称，用于图片文件按角色命名（可空）。';

-- ============================================================
-- 2) 索引：用于同批次内按角色名计数
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_job_items_batch_job_character_name
  ON job_items (batch_job_id, character_name)
  WHERE character_name IS NOT NULL;

COMMIT;
