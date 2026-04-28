import { NextRequest } from "next/server";

import { AppError } from "@/lib/errors";
import { withErrorHandling } from "@/lib/http/handler";
import { getClientIp } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { applyRateLimit } from "@/lib/rate-limit";
import { submitImportTaskSchema } from "@/lib/validators/import";
import { submitImportTask } from "@/services/import-task.service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return withErrorHandling(req, async () => {
    const ip = getClientIp(req);
    applyRateLimit(`import:parse:${ip}`, 20, 60_000);

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      throw new AppError("E_INVALID_PARAM", "Expected multipart/form-data.", 400);
    }

    const form = await req.formData();
    const dedupeRaw = form.get("dedupe");
    const styleKeyRaw = form.get("style_key");
    const parseModeRaw = form.get("parse_mode");
    const submitModeRaw = form.get("submit_mode");
    const taskNameRaw = form.get("task_name");
    const folderNameRaw = form.get("folder_name");
    const capabilityRaw = form.get("capability");
    const paramsRaw = form.get("params");
    const idempotencyKeyRaw = form.get("idempotency_key");
    const text = form.get("text");
    const file = form.get("file");
    let parsedParams: unknown = undefined;

    if (typeof paramsRaw === "string" && paramsRaw.trim().length > 0) {
      try {
        parsedParams = JSON.parse(paramsRaw);
      } catch {
        throw new AppError("E_INVALID_PARAM", "Invalid params JSON.", 400);
      }
    }

    const input = submitImportTaskSchema.parse({
      dedupe: typeof dedupeRaw === "string" ? dedupeRaw : undefined,
      style_key: typeof styleKeyRaw === "string" ? styleKeyRaw : undefined,
      parse_mode: typeof parseModeRaw === "string" ? parseModeRaw : undefined,
      submit_mode: typeof submitModeRaw === "string" ? submitModeRaw : undefined,
      task_name: typeof taskNameRaw === "string" ? taskNameRaw : undefined,
      folder_name: typeof folderNameRaw === "string" ? folderNameRaw : undefined,
      capability: typeof capabilityRaw === "string" ? capabilityRaw : undefined,
      params: parsedParams,
      idempotency_key: typeof idempotencyKeyRaw === "string" ? idempotencyKeyRaw : undefined,
    });

    const created = await submitImportTask({
      text: typeof text === "string" ? text : undefined,
      file: file instanceof File ? file : null,
      input,
    });
    return ok(created, 202);
  });
}
