import { NextRequest } from "next/server";

import { createBatchJobSchema, listBatchJobsQuerySchema } from "@/lib/validators/batch-job";
import { AppError } from "@/lib/errors";
import { withErrorHandling } from "@/lib/http/handler";
import { getClientIp } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { applyRateLimit } from "@/lib/rate-limit";
import { parsePromptText } from "@/lib/import-parsers";
import { createBatchJob, listBatchJobs } from "@/services/batch-job.service";
import { ensureBootstrapped } from "@/services/bootstrap.service";

export const runtime = "nodejs";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toOptionalString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const toOptionalBoolean = (value: unknown) =>
  typeof value === "boolean" ? value : undefined;

const toParams = (value: unknown) =>
  isRecord(value) ? value : {};

const readCreatePayload = async (req: NextRequest) => {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("text/plain")) {
    return req.text();
  }

  return req.json().catch(() => {
    throw new AppError("E_INVALID_PARAM", "Invalid JSON body. Send raw text as text/plain so it can be parsed.", 400);
  });
};

const createPortraitBatchFromText = async (req: NextRequest, sourceText: string, options: Record<string, unknown>) => {
  const trimmedText = sourceText.trim();
  if (!trimmedText) {
    throw new AppError("E_INVALID_PARAM", "Text input is empty.", 400);
  }

  const dedupe = toOptionalBoolean(options.dedupe) ?? false;
  const styleKey = toOptionalString(options.style_key) ?? null;
  const parseResult = await parsePromptText(trimmedText, dedupe, {
    parseMode: "auto",
    capability: "PORTRAIT",
    styleKey,
  });

  const parsed = createBatchJobSchema.parse({
    task_name: toOptionalString(options.task_name),
    folder_name:
      toOptionalString(options.folder_name) ??
      toOptionalString(req.nextUrl.searchParams.get("folder_name")) ??
      "batch-output",
    capability: "PORTRAIT",
    source_type: parseResult.source_type,
    dedupe,
    prompts: parseResult.prompts,
    params: toParams(options.params),
    idempotency_key: toOptionalString(options.idempotency_key),
    style_key: styleKey,
  });

  return createBatchJob(parsed);
};

export async function POST(req: NextRequest) {
  return withErrorHandling(req, async () => {
    const ip = getClientIp(req);
    applyRateLimit(`batch-jobs:create:${ip}`, 10, 60_000);
    await ensureBootstrapped();

    const payload = await readCreatePayload(req);
    if (typeof payload === "string") {
      const created = await createPortraitBatchFromText(req, payload, {});
      return ok(created, 201);
    }
    if (isRecord(payload)) {
      const textInput = toOptionalString(payload.text) ?? toOptionalString(payload.source_text);
      if (textInput) {
        const created = await createPortraitBatchFromText(req, textInput, payload);
        return ok(created, 201);
      }
    }

    const parsed = createBatchJobSchema.parse(payload);
    const created = await createBatchJob(parsed);
    return ok(created, 201);
  });
}

export async function GET(req: NextRequest) {
  return withErrorHandling(req, async () => {
    const ip = getClientIp(req);
    applyRateLimit(`batch-jobs:list:${ip}`, 120, 60_000);
    await ensureBootstrapped();

    const parsed = listBatchJobsQuerySchema.parse({
      status: req.nextUrl.searchParams.get("status") ?? undefined,
      capability: req.nextUrl.searchParams.get("capability") ?? undefined,
      page: req.nextUrl.searchParams.get("page") ?? "1",
      page_size: req.nextUrl.searchParams.get("page_size") ?? "20",
    });
    const data = await listBatchJobs(parsed);
    return ok(data);
  });
}
