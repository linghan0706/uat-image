-- ============================================================
-- 文件名: 006_portrait_selection_for_three_view.sql
-- 用途  : 支持"定妆照 → 三视图"业务流程
--           1) 在 image_results 上标记某张定妆照已被选中作为后续三视图的输入；
--           2) 在 job_items 上记录三视图任务所引用的定妆照来源；
--           3) 通过外键 + 触发器保证引用的合法性（必须是已选中的 PORTRAIT）。
--         不冗余 NAS 路径，三视图任务通过 JOIN image_results 取 nas_* / access_url。
-- 兼容性: 幂等（IF NOT EXISTS / DO 块）；非破坏（不删任何已有列/数据）。
-- ============================================================

BEGIN;

SET search_path TO public;

-- ------------------------------------------------------------
-- 1) image_results: 新增"是否选中为定妆照"标记 + 选中时间
-- ------------------------------------------------------------
ALTER TABLE "public"."image_results"
  ADD COLUMN IF NOT EXISTS "is_selected_portrait" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "public"."image_results"
  ADD COLUMN IF NOT EXISTS "selected_at" TIMESTAMPTZ;

COMMENT ON COLUMN "public"."image_results"."is_selected_portrait"
  IS '是否被选中作为定妆照（仅 capability=PORTRAIT 的图片有意义）。被选中后可作为三视图任务的来源。';
COMMENT ON COLUMN "public"."image_results"."selected_at"
  IS '该图片被选中作为定妆照的时间。is_selected_portrait=false 时应为 NULL。';

-- 约束：选中态与选中时间必须一致
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

-- 约束：只有 PORTRAIT 结果可被标记为已选定妆照
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

-- 部分索引：加速"列出某批任务已选中的定妆照"
CREATE INDEX IF NOT EXISTS "idx_image_results_batch_selected_portrait"
  ON "public"."image_results" ("batch_job_id")
  WHERE "is_selected_portrait" = TRUE;

-- ------------------------------------------------------------
-- 2) job_items: 新增 source_portrait_id（仅三视图 job_item 使用）
-- ------------------------------------------------------------
ALTER TABLE "public"."job_items"
  ADD COLUMN IF NOT EXISTS "source_portrait_id" BIGINT;

COMMENT ON COLUMN "public"."job_items"."source_portrait_id"
  IS '三视图来源定妆照 image_results.id（仅在所属 batch_jobs.capability=THREE_VIEW 时填充；其它 capability 必须为 NULL，由应用层保证）。';

-- 外键：禁止删除被三视图引用的定妆照（RESTRICT），id 变化级联（UPDATE CASCADE，惯例）
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
      ON UPDATE CASCADE;
  END IF;
END;
$$;

-- 部分索引：反查"这张定妆照衍生了哪些三视图 job_item"
CREATE INDEX IF NOT EXISTS "idx_job_items_source_portrait"
  ON "public"."job_items" ("source_portrait_id")
  WHERE "source_portrait_id" IS NOT NULL;

-- ------------------------------------------------------------
-- 3) 触发器：保证 source_portrait_id 引用的 image_results 行
--            is_selected_portrait=TRUE 且 capability='PORTRAIT'
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."check_source_portrait_valid"()
RETURNS TRIGGER AS $$
DECLARE
  v_is_selected BOOLEAN;
  v_capability  "public"."Capability";
BEGIN
  -- 为空时不校验
  IF NEW."source_portrait_id" IS NULL THEN
    RETURN NEW;
  END IF;

  -- UPDATE 场景下 source_portrait_id 未变化则跳过
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

  IF v_capability <> 'PORTRAIT' THEN
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

-- 反向保护：禁止把已被三视图任务引用的定妆照改成无效来源
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

-- 幂等重建触发器
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

COMMIT;
