-- ============================================================
-- 文件名: 007_character_profile_and_style.sql
-- 用途  : 提示词工程化重构
--           1) 在 job_items 上新增 character_profile JSONB（结构化角色档案：姓名/性别/年龄/外形/服饰…），
--              取代旧 prompt_blocks.part3 承载角色视觉描述的职责；
--           2) 在 job_items 与 batch_jobs 上新增 style_key TEXT（引用服务端 StyleRegistry 的某个风格预设键）。
--         本次迁移不删除 prompt_blocks 列，旧批次的 part3 快照继续保留，
--         新生成链路改为 character_profile + style_key 驱动（详见 src/lib/prompt/engine.ts）。
-- 兼容性: 幂等（IF NOT EXISTS）；非破坏（不删除任何已有列/数据）。
-- ============================================================

BEGIN;

SET search_path TO public;

-- ------------------------------------------------------------
-- 1) job_items: 新增 character_profile + style_key
-- ------------------------------------------------------------
ALTER TABLE "public"."job_items"
  ADD COLUMN IF NOT EXISTS "character_profile" JSONB;

ALTER TABLE "public"."job_items"
  ADD COLUMN IF NOT EXISTS "style_key" TEXT;

COMMENT ON COLUMN "public"."job_items"."character_profile"
  IS '结构化角色档案 JSON：{name, gender, age_band, build, complexion, face, hair, outfit, accessories, extra_visual}。取代旧 prompt_blocks.part3 承载角色视觉设定；prompt 组装时按档案渲染，part3 仅作元数据/文件命名不参与绘图。';

COMMENT ON COLUMN "public"."job_items"."style_key"
  IS '引用服务端 StyleRegistry 的风格预设键（如 cinematic_realism / cdrama_wuxia / japanese_anime / concept_art）。为空时按批次默认或系统兜底。';

-- ------------------------------------------------------------
-- 2) batch_jobs: 新增 style_key（批次默认风格）
-- ------------------------------------------------------------
ALTER TABLE "public"."batch_jobs"
  ADD COLUMN IF NOT EXISTS "style_key" TEXT;

COMMENT ON COLUMN "public"."batch_jobs"."style_key"
  IS '批次默认风格预设键，作为 job_items.style_key 的兜底来源。';

-- ------------------------------------------------------------
-- 3) 索引：支持按风格键的批次筛选/统计
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "idx_batch_jobs_style_key"
  ON "public"."batch_jobs" ("style_key")
  WHERE "style_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_job_items_style_key"
  ON "public"."job_items" ("style_key")
  WHERE "style_key" IS NOT NULL;

COMMIT;
