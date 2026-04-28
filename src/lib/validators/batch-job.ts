import { z } from "zod";

import { MAX_PROMPTS_PER_BATCH, MAX_PROMPT_LENGTH } from "@/lib/constants";

const capabilityEnum = z.enum(["PORTRAIT", "THREE_VIEW", "SCENE_CONCEPT"]);
const sourceTypeEnum = z.enum(["text", "csv", "xlsx", "docx", "md", "txt"]);
const genderEnum = z.enum(["male", "female", "nonbinary", "unknown"]);
const promptBlocksSchema = z.object({
  part1: z.string().trim().max(MAX_PROMPT_LENGTH).optional().nullable(),
  part2: z.string().trim().max(MAX_PROMPT_LENGTH).optional().nullable(),
  part3: z.string().trim().max(MAX_PROMPT_LENGTH).optional().nullable(),
  part4: z.string().trim().max(MAX_PROMPT_LENGTH).optional().nullable(),
});

export const characterProfileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  gender: genderEnum,
  age_band: z.string().trim().max(60).optional().nullable(),
  build: z.string().trim().max(200).optional().nullable(),
  complexion: z.string().trim().max(120).optional().nullable(),
  face: z.string().trim().max(300).optional().nullable(),
  hair: z.string().trim().max(300).optional().nullable(),
  outfit: z.string().trim().max(500).optional().nullable(),
  accessories: z.string().trim().max(300).optional().nullable(),
  extra_visual: z.string().trim().max(500).optional().nullable(),
});

export const promptItemSchema = z.object({
  line_no: z.number().int().positive(),
  prompt: z.string().trim().max(MAX_PROMPT_LENGTH).optional().default(""),
  negative_prompt: z.string().trim().max(MAX_PROMPT_LENGTH).optional().nullable(),
  character_name: z.string().trim().max(60).optional().nullable(),
  ext_params: z.record(z.string(), z.unknown()).optional().default({}),
  prompt_blocks: promptBlocksSchema.optional().default({}),
  character_profile: characterProfileSchema.optional().nullable(),
  style_key: z.string().trim().max(64).optional().nullable(),
});

export const createBatchJobSchema = z
  .object({
    task_name: z.string().trim().max(120).optional(),
    folder_name: z.string().trim().min(1, "子文件夹名称不能为空").max(120),
    capability: capabilityEnum,
    source_type: sourceTypeEnum,
    dedupe: z.boolean().optional().default(false),
    prompts: z.array(promptItemSchema).max(MAX_PROMPTS_PER_BATCH).optional().default([]),
    source_portrait_ids: z.array(z.string().regex(/^\d+$/)).optional().default([]),
    params: z.record(z.string(), z.unknown()).optional().default({}),
    idempotency_key: z.string().trim().max(64).optional(),
    style_key: z.string().trim().max(64).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    const hasSourcePortraits = val.source_portrait_ids.length > 0;
    if (val.capability === "THREE_VIEW" && !hasSourcePortraits) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "THREE_VIEW jobs must be created from source_portrait_ids.",
        path: ["source_portrait_ids"],
      });
    }
    if (val.capability === "THREE_VIEW" && val.prompts.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "prompts must be empty for THREE_VIEW jobs; use source_portrait_ids instead.",
        path: ["prompts"],
      });
    }
    if (hasSourcePortraits) {
      if (val.capability !== "THREE_VIEW") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "source_portrait_ids is only supported for THREE_VIEW.",
          path: ["source_portrait_ids"],
        });
      }
      if (val.prompts.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "prompts must be empty when source_portrait_ids is provided.",
          path: ["prompts"],
        });
      }
      const uniqueIds = new Set(val.source_portrait_ids);
      if (uniqueIds.size !== val.source_portrait_ids.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "source_portrait_ids must not contain duplicates.",
          path: ["source_portrait_ids"],
        });
      }
    } else if (val.capability !== "THREE_VIEW" && val.prompts.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "prompts is required unless source_portrait_ids is provided.",
        path: ["prompts"],
      });
    }

    // PORTRAIT 绘图链路强依赖结构化角色档案（见 resolvePromptItemForCreate）。
    // THREE_VIEW 只能从 source_portrait_ids 创建，由来源定妆照作为 i2i 参考图约束身份。
    // 这里在 schema 层把 character_profile 缺失拦在 400 阶段，避免协议允许 null 但服务层又拒收
    // 导致半成功记录落库。
    if (
      !hasSourcePortraits &&
      val.capability === "PORTRAIT"
    ) {
      val.prompts.forEach((prompt, index) => {
        if (!prompt.character_profile) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "character_profile is required for PORTRAIT prompts.",
            path: ["prompts", index, "character_profile"],
          });
          return;
        }
        if (prompt.character_profile.gender === "unknown") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "character_profile.gender must be explicit (male, female, or nonbinary) for PORTRAIT prompts.",
            path: ["prompts", index, "character_profile", "gender"],
          });
        }
      });
    }

    if (!Object.hasOwn(val.params, "model_key")) {
      return;
    }
    if (typeof val.params.model_key !== "string" || val.params.model_key.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "params.model_key must be a non-empty string when provided.",
        path: ["params", "model_key"],
      });
    }
  });

export const retryFailedSchema = z.object({
  item_ids: z.array(z.string().regex(/^\d+$/)).optional(),
});

export const listBatchJobsQuerySchema = z.object({
  status: z.string().optional(),
  capability: capabilityEnum.optional(),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
});

export const listJobItemsQuerySchema = z.object({
  status: z.string().optional(),
  keyword: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
});

export const listImageResultsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(30),
});

export const updatePortraitSelectionSchema = z.object({
  selected: z.boolean(),
});
