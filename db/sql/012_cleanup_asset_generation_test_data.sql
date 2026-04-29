-- ============================================================================
-- 012_cleanup_asset_generation_test_data.sql
--
-- 清理所有"资产生成任务"相关的测试数据。
--
-- 涉及的表（按依赖顺序）:
--   1. job_items          (子任务) —— 引用 image_results.source_portrait_id (ON DELETE RESTRICT)
--   2. image_results      (生成结果) —— 引用 batch_jobs.id, job_items.id (ON DELETE CASCADE)
--   3. import_files       (导入文件) —— 引用 batch_jobs.id (ON DELETE SET NULL)
--   4. export_files       (导出文件) —— 被 batch_jobs.export_file_id 引用 (ON DELETE SET NULL)
--   5. batch_jobs         (批量任务)
--
-- 删除策略:
--   - 先解除 batch_jobs.export_file_id 的外键引用，方便清空 export_files
--   - 先删 job_items（解开 source_portrait_id RESTRICT 约束）
--   - 再删 image_results、import_files、export_files
--   - 最后删 batch_jobs
--   - 重置所有相关 id 序列到 1
--
-- 注意:
--   - 该脚本会清空上述 5 张表的全部数据，不区分环境
--   - 仅清理表数据，不删除磁盘上对应的图片/文件（NAS 文件需要单独清理）
--   - model_configs 与 system_configs 是配置数据，不在清理范围
--   - 生产环境执行前请务必备份
--
-- 时区: Asia/Shanghai (UTC+8)
-- ============================================================================

BEGIN;

SET LOCAL TIME ZONE 'Asia/Shanghai';

-- 1. 解除 batch_jobs 对 export_files 的外键引用，避免后续删除 export_files 受阻
UPDATE "public"."batch_jobs"
SET "export_file_id" = NULL
WHERE "export_file_id" IS NOT NULL;

-- 2. 删除子任务（必须先于 image_results，因 source_portrait_id 是 RESTRICT）
DELETE FROM "public"."job_items";

-- 3. 删除生成结果（CASCADE 已无引用，可安全清空）
DELETE FROM "public"."image_results";

-- 4. 解绑 import_files 与 batch_jobs 的关联（再彻底清空导入文件记录）
DELETE FROM "public"."import_files";

-- 5. 删除导出文件
DELETE FROM "public"."export_files";

-- 6. 删除批量任务
DELETE FROM "public"."batch_jobs";

-- 7. 重置序列，让新任务的 ID 从 1 开始
ALTER SEQUENCE "public"."batch_jobs_id_seq"    RESTART WITH 1;
ALTER SEQUENCE "public"."job_items_id_seq"     RESTART WITH 1;
ALTER SEQUENCE "public"."image_results_id_seq" RESTART WITH 1;
ALTER SEQUENCE "public"."import_files_id_seq"  RESTART WITH 1;
ALTER SEQUENCE "public"."export_files_id_seq"  RESTART WITH 1;

-- 8. 验证（可选）：以下查询应均返回 0 行
-- SELECT COUNT(*) AS batch_jobs_count    FROM "public"."batch_jobs";
-- SELECT COUNT(*) AS job_items_count     FROM "public"."job_items";
-- SELECT COUNT(*) AS image_results_count FROM "public"."image_results";
-- SELECT COUNT(*) AS import_files_count  FROM "public"."import_files";
-- SELECT COUNT(*) AS export_files_count  FROM "public"."export_files";

COMMIT;
