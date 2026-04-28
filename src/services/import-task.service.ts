import { z } from "zod";

import { query } from "@/lib/db/pg";
import type { ImportFileRecord, JsonValue } from "@/lib/db/types";
import {
  MAX_DOCX_XLSX_FILE_SIZE,
  MAX_TXT_LIKE_FILE_SIZE,
} from "@/lib/constants";
import { AppError, toAppError } from "@/lib/errors";
import { parsePromptFile, parsePromptText, type ParseResult } from "@/lib/import-parsers";
import { createBatchJobSchema } from "@/lib/validators/batch-job";
import { submitImportTaskSchema } from "@/lib/validators/import";
import { createBatchJob } from "@/services/batch-job.service";
import { ensureBootstrapped } from "@/services/bootstrap.service";
import { toCST } from "@/lib/utils";

type SubmitImportTaskInput = z.infer<typeof submitImportTaskSchema>;

const SUPPORTED_FILE_TYPES = new Set(["csv", "xlsx", "docx", "md", "txt"]);
const TXT_LIKE_FILE_TYPES = new Set(["csv", "md", "txt"]);
const MAX_IMPORT_TASK_RETRY = 3;
const IMPORT_TASK_STATUS = {
  QUEUED: "QUEUED",
  PARSE_FAILED: "PARSE_FAILED",
  PARSE_SUCCESS: "PARSE_SUCCESS",
  BATCH_CREATING: "BATCH_CREATING",
  BATCH_CREATED: "BATCH_CREATED",
  BATCH_CREATE_FAILED: "BATCH_CREATE_FAILED",
} as const;

const IMPORT_FILE_COLUMNS = `
  id,
  batch_job_id AS "batchJobId",
  file_name AS "fileName",
  file_type AS "fileType",
  file_size AS "fileSize",
  parse_status AS status,
  submit_mode AS "submitMode",
  result_payload AS "resultPayload",
  batch_payload AS "batchPayload",
  source_text AS "sourceText",
  source_file_bytes AS "sourceFileBytes",
  retry_count AS "retryCount",
  max_retry AS "maxRetry",
  next_retry_at AS "nextRetryAt",
  error_code AS "errorCode",
  parse_error AS "errorMessage",
  worker_id AS "workerId",
  created_at AS "createdAt",
  started_at AS "startedAt",
  finished_at AS "finishedAt",
  locked_at AS "lockedAt"
`;

const normalizeBatchPayload = (input: SubmitImportTaskInput) =>
  ({
    dedupe: input.dedupe,
    parse_mode: input.parse_mode,
    submit_mode: input.submit_mode,
    style_key: input.style_key ?? null,
    task_name: input.task_name ?? null,
    folder_name: input.folder_name ?? null,
    capability: input.capability ?? null,
    params: input.params ?? {},
    idempotency_key: input.idempotency_key ?? null,
  }) satisfies Record<string, unknown>;

const parseStoredBatchPayload = (value: JsonValue | null) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const resolveFileType = (fileName: string) => fileName.split(".").pop()?.trim().toLowerCase() ?? "";

const assertStoredTextSize = (sourceText: string) => {
  const size = Buffer.byteLength(sourceText, "utf8");
  if (size > MAX_TXT_LIKE_FILE_SIZE) {
    throw new AppError("E_INVALID_PARAM", "Text size exceeds 5MB.", 400);
  }
  return size;
};

const assertStoredFileMeta = (fileName: string, fileSize: number) => {
  const fileType = resolveFileType(fileName);
  if (!SUPPORTED_FILE_TYPES.has(fileType)) {
    throw new AppError("E_UNSUPPORTED_FILE_TYPE", `Unsupported file type: ${fileType || "unknown"}.`, 400);
  }

  const limit = TXT_LIKE_FILE_TYPES.has(fileType) ? MAX_TXT_LIKE_FILE_SIZE : MAX_DOCX_XLSX_FILE_SIZE;
  if (fileSize > limit) {
    throw new AppError(
      "E_INVALID_PARAM",
      `File size exceeds ${limit === MAX_TXT_LIKE_FILE_SIZE ? "5MB" : "10MB"}.`,
      400,
    );
  }

  return fileType;
};

const toImportTaskErrorCode = (error: AppError) => {
  if (error.code) {
    return error.code;
  }
  return error.message.toLowerCase().includes("timeout") ? "E_PROVIDER_TIMEOUT" : "E_INTERNAL";
};

const buildRetryState = (task: Pick<ImportFileRecord, "retryCount" | "maxRetry">) => {
  const canRetry = task.retryCount < task.maxRetry;
  const delaySec = canRetry ? Math.pow(2, task.retryCount + 1) * 15 : 0;
  return {
    canRetry,
    nextRetryAt: canRetry ? new Date(Date.now() + delaySec * 1000) : null,
  };
};

const getImportFileById = async (id: bigint) => {
  const result = await query<ImportFileRecord>(
    `
      SELECT ${IMPORT_FILE_COLUMNS}
      FROM import_files
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  return result.rows[0] ?? null;
};

const markParseFailure = async (task: Pick<ImportFileRecord, "id" | "retryCount" | "maxRetry">, error: AppError) => {
  const { canRetry, nextRetryAt } = buildRetryState(task);
  await query(
    `
      UPDATE import_files
      SET
        parse_status = $2,
        retry_count = retry_count + $3,
        next_retry_at = $4,
        error_code = $5,
        parse_error = $6,
        worker_id = NULL,
        locked_at = NULL,
        finished_at = $7
      WHERE id = $1
    `,
    [
      task.id,
      canRetry ? IMPORT_TASK_STATUS.QUEUED : IMPORT_TASK_STATUS.PARSE_FAILED,
      canRetry ? 1 : 0,
      nextRetryAt,
      toImportTaskErrorCode(error),
      error.message,
      canRetry ? null : new Date(),
    ],
  );
};

const buildCreateBatchInput = (
  task: Pick<ImportFileRecord, "id" | "submitMode"> & { batchPayload: JsonValue | null },
  parseResult: ParseResult,
) => {
  const batchPayload = parseStoredBatchPayload(task.batchPayload);
  if (!batchPayload) {
    throw new AppError("E_INVALID_PARAM", `Import task ${task.id.toString()} missing batch payload.`, 500);
  }

  return createBatchJobSchema.parse({
    task_name: batchPayload.task_name ?? undefined,
    folder_name: batchPayload.folder_name ?? undefined,
    capability: batchPayload.capability ?? undefined,
    source_type: parseResult.source_type,
    dedupe: Boolean(batchPayload.dedupe),
    prompts: parseResult.prompts,
    params: batchPayload.params ?? {},
    idempotency_key: batchPayload.idempotency_key ?? undefined,
    style_key: batchPayload.style_key ?? undefined,
  });
};

const parseImportTaskContent = async (
  task: Pick<ImportFileRecord, "fileName" | "sourceText" | "sourceFileBytes"> & {
    batchPayload: JsonValue | null;
  },
) => {
  const batchPayload = parseStoredBatchPayload(task.batchPayload) ?? {};
  const dedupe = Boolean(batchPayload.dedupe);
  const parseMode =
    batchPayload.parse_mode === "auto" || batchPayload.parse_mode === "local" || batchPayload.parse_mode === "claude"
      ? batchPayload.parse_mode
      : "auto";
  const capability =
    batchPayload.capability === "PORTRAIT" || batchPayload.capability === "THREE_VIEW"
      ? batchPayload.capability
      : undefined;
  const styleKey = typeof batchPayload.style_key === "string" ? batchPayload.style_key : null;

  if (task.sourceText) {
    return parsePromptText(task.sourceText, dedupe, {
      parseMode,
      capability,
      styleKey,
    });
  }

  if (!task.sourceFileBytes) {
    throw new AppError("E_INVALID_PARAM", "Import task missing source content.", 500);
  }

  const file = new File([Buffer.from(task.sourceFileBytes)], task.fileName);
  return parsePromptFile(file, dedupe, {
    parseMode,
    capability,
    styleKey,
  });
};

export const submitImportTask = async ({
  text,
  file,
  input,
}: {
  text?: string;
  file?: File | null;
  input: SubmitImportTaskInput;
}) => {
  const batchPayload = normalizeBatchPayload(input);

  if (typeof text === "string" && text.trim().length > 0) {
    const sourceText = text.trim();
    const size = assertStoredTextSize(sourceText);
    const result = await query<{ id: bigint; status: string; submitMode: string }>(
      `
        INSERT INTO import_files (
          file_name,
          file_type,
          file_size,
          parse_status,
          submit_mode,
          source_text,
          batch_payload,
          max_retry
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, parse_status AS status, submit_mode AS "submitMode"
      `,
      [
        "inline-text.txt",
        "text",
        BigInt(size),
        IMPORT_TASK_STATUS.QUEUED,
        input.submit_mode,
        sourceText,
        batchPayload,
        MAX_IMPORT_TASK_RETRY,
      ],
    );
    const created = result.rows[0];

    return {
      import_task_id: created.id.toString(),
      status: created.status,
      submit_mode: created.submitMode,
    };
  }

  if (!(file instanceof File)) {
    throw new AppError("E_INVALID_PARAM", "Missing file or text.", 400);
  }

  const fileType = assertStoredFileMeta(file.name, file.size);
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await query<{ id: bigint; status: string; submitMode: string }>(
    `
      INSERT INTO import_files (
        file_name,
        file_type,
        file_size,
        parse_status,
        submit_mode,
        source_file_bytes,
        batch_payload,
        max_retry
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, parse_status AS status, submit_mode AS "submitMode"
    `,
    [
      file.name,
      fileType,
      BigInt(file.size),
      IMPORT_TASK_STATUS.QUEUED,
      input.submit_mode,
      bytes,
      batchPayload,
      MAX_IMPORT_TASK_RETRY,
    ],
  );
  const created = result.rows[0];

  return {
    import_task_id: created.id.toString(),
    status: created.status,
    submit_mode: created.submitMode,
  };
};

export const getImportTaskDetail = async (taskId: string) => {
  const id = BigInt(taskId);
  const task = await getImportFileById(id);
  if (!task) {
    throw new AppError("E_JOB_NOT_FOUND", "Import task not found.", 404);
  }

  const resultPayload =
    task.resultPayload && typeof task.resultPayload === "object" && !Array.isArray(task.resultPayload)
      ? task.resultPayload
      : null;

  return {
    id: task.id.toString(),
    status: task.status,
    submit_mode: task.submitMode,
    file_name: task.fileName,
    file_type: task.fileType,
    file_size: task.fileSize.toString(),
    batch_job_id: task.batchJobId ? task.batchJobId.toString() : null,
    result_payload: resultPayload,
    error_code: task.errorCode,
    error_message: task.errorMessage,
    retry_count: task.retryCount,
    max_retry: task.maxRetry,
    created_at: toCST(task.createdAt),
    started_at: toCST(task.startedAt),
    finished_at: toCST(task.finishedAt),
  };
};

export const executeImportTask = async (taskId: bigint) => {
  const task = await getImportFileById(taskId);
  if (!task) {
    throw new AppError("E_JOB_NOT_FOUND", "Import task not found.", 404);
  }

  try {
    const parseResult = await parseImportTaskContent(task);
    await query(
      `
        UPDATE import_files
        SET
          parse_status = $2,
          result_payload = $3,
          error_code = NULL,
          parse_error = NULL,
          next_retry_at = NULL,
          worker_id = $4,
          locked_at = $5,
          finished_at = $6
        WHERE id = $1
      `,
      [
        task.id,
        task.submitMode === "CREATE_BATCH"
          ? IMPORT_TASK_STATUS.BATCH_CREATING
          : IMPORT_TASK_STATUS.PARSE_SUCCESS,
        parseResult as JsonValue,
        task.submitMode === "CREATE_BATCH" ? task.workerId : null,
        task.submitMode === "CREATE_BATCH" ? task.lockedAt : null,
        task.submitMode === "CREATE_BATCH" ? null : new Date(),
      ],
    );

    if (task.submitMode !== "CREATE_BATCH") {
      return;
    }

    await ensureBootstrapped();
    const batchInput = buildCreateBatchInput(task, parseResult);
    const createdBatchJob = await createBatchJob(batchInput);

    await query(
      `
        UPDATE import_files
        SET
          parse_status = $2,
          batch_job_id = $3,
          error_code = NULL,
          parse_error = NULL,
          worker_id = NULL,
          locked_at = NULL,
          finished_at = $4
        WHERE id = $1
      `,
      [task.id, IMPORT_TASK_STATUS.BATCH_CREATED, BigInt(createdBatchJob.id), new Date()],
    );
  } catch (error) {
    const appError = toAppError(error);

    const currentTask = await query<Pick<ImportFileRecord, "id" | "retryCount" | "maxRetry" | "status">>(
      `
        SELECT
          id,
          retry_count AS "retryCount",
          max_retry AS "maxRetry",
          parse_status AS status
        FROM import_files
        WHERE id = $1
        LIMIT 1
      `,
      [task.id],
    ).then((result) => result.rows[0] ?? null);
    if (!currentTask) {
      throw appError;
    }

    if (currentTask.status === IMPORT_TASK_STATUS.BATCH_CREATING) {
      await query(
        `
          UPDATE import_files
          SET
            parse_status = $2,
            error_code = $3,
            parse_error = $4,
            worker_id = NULL,
            locked_at = NULL,
            finished_at = $5
          WHERE id = $1
        `,
        [task.id, IMPORT_TASK_STATUS.BATCH_CREATE_FAILED, toImportTaskErrorCode(appError), appError.message, new Date()],
      );
      throw appError;
    }

    await markParseFailure(currentTask, appError);
    throw appError;
  }
};
