-- 010_add_nano_banana_portrait_model.sql
-- NanoBanana Pro 同时支持 TEXT_TO_IMAGE 与 IMAGE_TO_IMAGE，
-- 原本只在 THREE_VIEW / SCENE_CONCEPT 能力下注册。现在把它也注册为 PORTRAIT 可选模型，
-- 供用户在定妆照批次下拉中选择。

INSERT INTO public.model_configs (
  model_key,
  capability,
  provider,
  endpoint,
  enabled,
  is_default,
  allow_front_select,
  default_params,
  timeout_sec,
  created_at,
  updated_at
)
VALUES (
  'Nano Banana Pro',
  'PORTRAIT',
  'sky_rsa',
  '/api/v1/gemini/generate_images',
  TRUE,
  FALSE,                  -- 保留 midj_default 为 PORTRAIT 默认
  TRUE,                   -- 允许前端选择
  '{"cfg": 7, "size": "1024x1536", "count": 1, "steps": 30}'::jsonb,
  120,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;
