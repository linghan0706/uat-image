-- ============================================================
-- 文件名: 008_complete_server_required_fields.sql
-- 用途  : 基于最新 public.sql 导出结果，补齐当前服务端运行所需字段。
--         1) 补齐 batch_jobs / job_items / image_results 的新增列；
--         2) 补齐“选中定妆照 -> 三视图”所需约束、索引与触发器；
--         3) 为历史定妆照数据做保守 character_profile 回填，避免旧选中图
--            因 character_profile 为空而无法生成三视图。
-- 兼容性: 幂等；非破坏；不会删除旧字段和旧数据。
-- ============================================================

BEGIN;

SET search_path TO public;

-- ------------------------------------------------------------
-- 1) batch_jobs: 服务端创建任务时依赖 folder_name / style_key
-- ------------------------------------------------------------
ALTER TABLE "public"."batch_jobs"
  ADD COLUMN IF NOT EXISTS "folder_name" TEXT;

UPDATE "public"."batch_jobs"
   SET "folder_name" = COALESCE(NULLIF("folder_name", ''), NULLIF("task_name", ''), "job_no", 'batch-output')
 WHERE "folder_name" IS NULL
    OR "folder_name" = '';

ALTER TABLE "public"."batch_jobs"
  ALTER COLUMN "folder_name" SET NOT NULL;

ALTER TABLE "public"."batch_jobs"
  ADD COLUMN IF NOT EXISTS "style_key" TEXT;

COMMENT ON COLUMN "public"."batch_jobs"."folder_name"
  IS '任务输出文件夹名称。';
COMMENT ON COLUMN "public"."batch_jobs"."style_key"
  IS '批次默认风格预设键，作为 job_items.style_key 的兜底来源。';

-- 历史 params_snapshot 里若已经带有 style_key，则补回批次默认值。
UPDATE "public"."batch_jobs"
   SET "style_key" = NULLIF("params_snapshot" ->> 'style_key', '')
 WHERE "style_key" IS NULL
   AND "params_snapshot" ? 'style_key'
   AND NULLIF("params_snapshot" ->> 'style_key', '') IS NOT NULL;

-- ------------------------------------------------------------
-- 2) job_items: 结构化 prompt 快照、角色名、来源定妆照、角色档案、风格键
-- ------------------------------------------------------------
ALTER TABLE "public"."job_items"
  ADD COLUMN IF NOT EXISTS "prompt_blocks" JSONB;

ALTER TABLE "public"."job_items"
  ADD COLUMN IF NOT EXISTS "character_name" TEXT;

ALTER TABLE "public"."job_items"
  ADD COLUMN IF NOT EXISTS "source_portrait_id" BIGINT;

ALTER TABLE "public"."job_items"
  ADD COLUMN IF NOT EXISTS "character_profile" JSONB;

ALTER TABLE "public"."job_items"
  ADD COLUMN IF NOT EXISTS "style_key" TEXT;

COMMENT ON COLUMN "public"."job_items"."prompt_blocks"
  IS '结构化提示词块快照（含 source_mode 与 PART1~PART4）。';
COMMENT ON COLUMN "public"."job_items"."character_name"
  IS '角色名称，用于图片文件按角色命名（可空）。';
COMMENT ON COLUMN "public"."job_items"."source_portrait_id"
  IS '三视图来源定妆照 image_results.id（仅在所属 batch_jobs.capability=THREE_VIEW 时填充）。';
COMMENT ON COLUMN "public"."job_items"."character_profile"
  IS '结构化角色档案 JSON：{name, gender, age_band, build, complexion, face, hair, outfit, accessories, extra_visual}。';
COMMENT ON COLUMN "public"."job_items"."style_key"
  IS '引用服务端 StyleRegistry 的风格预设键。';

-- 若已有结构化档案但 character_name 缺失，先从档案名镜像回来。
UPDATE "public"."job_items"
   SET "character_name" = NULLIF(BTRIM("character_profile" ->> 'name'), '')
 WHERE ("character_name" IS NULL OR BTRIM("character_name") = '')
   AND "character_profile" IS NOT NULL
   AND NULLIF(BTRIM("character_profile" ->> 'name'), '') IS NOT NULL;

-- 历史数据保守回填：只用可信角色名生成最小合法档案。
-- gender 使用 unknown；extra_visual 尽量来自旧 prompt_blocks，后续仍以定妆照图像作为强参考。
UPDATE "public"."job_items" AS ji
   SET "character_profile" = JSONB_STRIP_NULLS(JSONB_BUILD_OBJECT(
         'name', BTRIM(ji."character_name"),
         'gender', 'unknown',
         'extra_visual', NULLIF(BTRIM(CONCAT_WS(E'\n\n',
           NULLIF(ji."prompt_blocks" ->> 'part2', ''),
           NULLIF(ji."prompt_blocks" ->> 'part3', ''),
           NULLIF(ji."prompt_blocks" ->> 'part4', '')
         )), '')
       ))
 WHERE ji."character_name" IS NOT NULL
   AND BTRIM(ji."character_name") <> ''
   AND BTRIM(ji."character_name") !~ '^(角色|人物|未命名|无名|主角|配角|路人|群演|龙套)[[:space:]_-]*[0-9A-Za-z]+$'
   AND BTRIM(ji."character_name") !~* '^(character|char|unnamed|npc|person|people|role)[[:space:]_-]*[0-9A-Za-z]*$'
   AND BTRIM(ji."character_name") !~ '^[0-9A-Za-z]$'
   AND BTRIM(ji."character_name") !~ '^[0-9]+$'
   AND BTRIM(ji."character_name") !~* '^(未知|待定|无|待填|null|undefined|none|n/a|tbd|tba)$'
   AND (
     ji."character_profile" IS NULL
     OR NOT (
       NULLIF(BTRIM(ji."character_profile" ->> 'name'), '') IS NOT NULL
       AND (ji."character_profile" ->> 'gender') IN ('male', 'female', 'nonbinary', 'unknown')
     )
   );

-- job_items.style_key 缺失时继承批次默认值。
UPDATE "public"."job_items" AS ji
   SET "style_key" = bj."style_key"
  FROM "public"."batch_jobs" AS bj
 WHERE ji."batch_job_id" = bj."id"
   AND ji."style_key" IS NULL
   AND bj."style_key" IS NOT NULL;

-- ------------------------------------------------------------
-- 3) image_results: 选中定妆照标记与选中时间
-- ------------------------------------------------------------
ALTER TABLE "public"."image_results"
  ADD COLUMN IF NOT EXISTS "is_selected_portrait" BOOLEAN;

ALTER TABLE "public"."image_results"
  ADD COLUMN IF NOT EXISTS "selected_at" TIMESTAMPTZ;

UPDATE "public"."image_results"
   SET "is_selected_portrait" = FALSE
 WHERE "is_selected_portrait" IS NULL;

-- 非 PORTRAIT 结果不能作为定妆照来源；若历史数据误标，降级为未选中。
UPDATE "public"."image_results"
   SET "is_selected_portrait" = FALSE,
       "selected_at" = NULL
 WHERE "is_selected_portrait" = TRUE
   AND "capability" <> 'PORTRAIT'::"public"."Capability";

UPDATE "public"."image_results"
   SET "selected_at" = NOW()
 WHERE "is_selected_portrait" = TRUE
   AND "selected_at" IS NULL;

UPDATE "public"."image_results"
   SET "selected_at" = NULL
 WHERE "is_selected_portrait" = FALSE
   AND "selected_at" IS NOT NULL;

ALTER TABLE "public"."image_results"
  ALTER COLUMN "is_selected_portrait" SET DEFAULT FALSE;

ALTER TABLE "public"."image_results"
  ALTER COLUMN "is_selected_portrait" SET NOT NULL;

COMMENT ON COLUMN "public"."image_results"."is_selected_portrait"
  IS '是否被选中作为定妆照（仅 capability=PORTRAIT 的图片有意义）。';
COMMENT ON COLUMN "public"."image_results"."selected_at"
  IS '该图片被选中作为定妆照的时间。is_selected_portrait=false 时应为 NULL。';

-- ------------------------------------------------------------
-- 4) 约束：选中态、来源图合法性
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_image_results_selected_portrait_time'
       AND conrelid = 'public.image_results'::regclass
  ) THEN
    ALTER TABLE "public"."image_results"
      ADD CONSTRAINT "chk_image_results_selected_portrait_time"
      CHECK (
        (
          "is_selected_portrait" = TRUE
          AND "selected_at" IS NOT NULL
        )
        OR (
          "is_selected_portrait" = FALSE
          AND "selected_at" IS NULL
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_image_results_selected_portrait_capability'
       AND conrelid = 'public.image_results'::regclass
  ) THEN
    ALTER TABLE "public"."image_results"
      ADD CONSTRAINT "chk_image_results_selected_portrait_capability"
      CHECK (
        "is_selected_portrait" = FALSE
        OR "capability" = 'PORTRAIT'::"public"."Capability"
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fk_job_items_source_portrait'
       AND conrelid = 'public.job_items'::regclass
  ) THEN
    ALTER TABLE "public"."job_items"
      ADD CONSTRAINT "fk_job_items_source_portrait"
      FOREIGN KEY ("source_portrait_id")
      REFERENCES "public"."image_results" ("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE
      NOT VALID;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 5) 触发器：保证三视图 source_portrait_id 指向已选中的 PORTRAIT
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."check_source_portrait_valid"()
RETURNS TRIGGER AS $$
DECLARE
  v_is_selected BOOLEAN;
  v_capability  "public"."Capability";
BEGIN
  IF NEW."source_portrait_id" IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD."source_portrait_id" IS NOT DISTINCT FROM NEW."source_portrait_id" THEN
    RETURN NEW;
  END IF;

  SELECT "is_selected_portrait", "capability"
    INTO v_is_selected, v_capability
    FROM "public"."image_results"
   WHERE "id" = NEW."source_portrait_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'source_portrait_id=% 不存在于 image_results',
      NEW."source_portrait_id";
  END IF;

  IF v_capability <> 'PORTRAIT'::"public"."Capability" THEN
    RAISE EXCEPTION
      'source_portrait_id=% 引用的图片 capability=%，必须是 PORTRAIT',
      NEW."source_portrait_id", v_capability;
  END IF;

  IF v_is_selected IS NOT TRUE THEN
    RAISE EXCEPTION
      'source_portrait_id=% 引用的图片尚未被选中（is_selected_portrait=false）',
      NEW."source_portrait_id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION "public"."check_source_portrait_valid"()
  IS '校验 job_items.source_portrait_id 必须引用 capability=PORTRAIT 且 is_selected_portrait=TRUE 的 image_results 行。';

CREATE OR REPLACE FUNCTION "public"."prevent_invalid_referenced_portrait"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."is_selected_portrait" IS TRUE
     AND NEW."capability" = 'PORTRAIT'::"public"."Capability" THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "public"."job_items"
     WHERE "source_portrait_id" = OLD."id"
     LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'image_results.id=% 已被 job_items.source_portrait_id 引用，不能取消选中或改为非 PORTRAIT',
      OLD."id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION "public"."prevent_invalid_referenced_portrait"()
  IS '禁止已被 job_items.source_portrait_id 引用的 image_results 行被更新成非已选 PORTRAIT。';

DROP TRIGGER IF EXISTS "trg_job_items_check_source_portrait" ON "public"."job_items";
CREATE TRIGGER "trg_job_items_check_source_portrait"
  BEFORE INSERT OR UPDATE OF "source_portrait_id" ON "public"."job_items"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."check_source_portrait_valid"();

DROP TRIGGER IF EXISTS "trg_image_results_prevent_invalid_referenced_portrait" ON "public"."image_results";
CREATE TRIGGER "trg_image_results_prevent_invalid_referenced_portrait"
  BEFORE UPDATE OF "is_selected_portrait", "capability" ON "public"."image_results"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."prevent_invalid_referenced_portrait"();

-- ------------------------------------------------------------
-- 6) 索引：服务端列表、定妆照来源反查、风格筛选
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "idx_batch_jobs_style_key"
  ON "public"."batch_jobs" ("style_key")
  WHERE "style_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_job_items_style_key"
  ON "public"."job_items" ("style_key")
  WHERE "style_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_job_items_source_portrait"
  ON "public"."job_items" ("source_portrait_id")
  WHERE "source_portrait_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_image_results_batch_selected_portrait"
  ON "public"."image_results" ("batch_job_id")
  WHERE "is_selected_portrait" = TRUE;

COMMIT;

-- 可选检查：
-- SELECT ji.id, ji.character_name, ji.character_profile
--   FROM public.image_results ir
--   JOIN public.job_items ji ON ji.id = ir.job_item_id
--  WHERE ir.is_selected_portrait = TRUE
--    AND (
--      ji.character_profile IS NULL
--      OR NULLIF(BTRIM(ji.character_profile ->> 'name'), '') IS NULL
--      OR (ji.character_profile ->> 'gender') NOT IN ('male', 'female', 'nonbinary', 'unknown')
--    );
