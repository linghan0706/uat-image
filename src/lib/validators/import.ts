import { z } from "zod";

export const parseImportOptionsSchema = z.object({
  dedupe: z.coerce.boolean().optional().default(false),
  parse_mode: z.enum(["auto", "local", "claude"]).optional().default("auto"),
  style_key: z.string().trim().max(64).optional().nullable(),
});

export const importSubmitModeSchema = z.enum(["PARSE_ONLY", "CREATE_BATCH"]);

export const submitImportTaskSchema = z
  .object({
    dedupe: z.coerce.boolean().optional().default(false),
    parse_mode: z.enum(["auto", "local", "claude"]).optional().default("auto"),
    submit_mode: importSubmitModeSchema.optional().default("PARSE_ONLY"),
    task_name: z.string().trim().max(120).optional(),
    folder_name: z.string().trim().min(1, "子文件夹名称不能为空").max(120).optional(),
    capability: z.enum(["PORTRAIT", "THREE_VIEW", "SCENE_CONCEPT"]).optional(),
    params: z.record(z.string(), z.unknown()).optional().default({}),
    idempotency_key: z.string().trim().max(64).optional(),
    style_key: z.string().trim().max(64).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.submit_mode === "CREATE_BATCH") {
      if (!value.folder_name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "folder_name is required when submit_mode=CREATE_BATCH.",
          path: ["folder_name"],
        });
      }
      if (!value.capability) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "capability is required when submit_mode=CREATE_BATCH.",
          path: ["capability"],
        });
      }
    }

    if (!Object.hasOwn(value.params, "model_key")) {
      return;
    }
    if (typeof value.params.model_key !== "string" || value.params.model_key.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "params.model_key must be a non-empty string when provided.",
        path: ["params", "model_key"],
      });
    }
  });
