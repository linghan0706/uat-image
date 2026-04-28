-- 009_allow_front_select_portrait_models.sql
-- 放开 PORTRAIT 能力下模型的前端可选标记。
-- 历史原因：早期定妆照链路硬编码使用 MJ，未给 PORTRAIT 模型开启 allow_front_select。
-- 新需求允许用户在前端下拉选择文生图模型，需要把这些行开起来。
-- THREE_VIEW / SCENE_CONCEPT 已开，不改动。

UPDATE public.model_configs
SET allow_front_select = TRUE,
    updated_at = NOW()
WHERE capability = 'PORTRAIT'
  AND enabled = TRUE
  AND allow_front_select = FALSE;
