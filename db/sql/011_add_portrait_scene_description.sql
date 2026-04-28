-- ============================================================
-- 文件名: 011_add_portrait_scene_description.sql
-- 用途  : 为定妆照场景背景模式增加逐行场景描述字段。
-- 兼容性: 幂等；非破坏；不会修改历史 prompt 文本。
-- ============================================================

BEGIN;

SET search_path TO public;

ALTER TABLE "public"."job_items"
  ADD COLUMN IF NOT EXISTS "scene_description" TEXT;

COMMENT ON COLUMN "public"."job_items"."scene_description"
  IS '定妆照场景背景模式的逐行具体场景描述，来源于 CSV/XLSX 导入；影棚模式可为空且不参与最终 prompt。';

COMMIT;
