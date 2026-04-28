-- 004_remove_view_type.sql
-- 移除 image_results.view_type 列及相关索引。
-- 三视图不再按 front/side/back 分次生成，改为单次生成一张完整三视图图片。

-- 删除 view_type 索引
DROP INDEX IF EXISTS "public"."image_results_view_type_idx";

-- 删除 view_type 列
ALTER TABLE "public"."image_results" DROP COLUMN IF EXISTS "view_type";
