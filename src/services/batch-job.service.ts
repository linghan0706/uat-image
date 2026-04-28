import { z } from "zod";

import { one, query, withTransaction } from "@/lib/db/pg";
import type {
  BatchJobRecord,
  BatchJobStatus,
  Capability,
  ExportFileRecord,
  ExportStatus,
  ImageResultRecord,
  JobItemRecord,
  JsonValue,
} from "@/lib/db/types";
import { MAX_PROMPT_LENGTH, MAX_PROMPTS_PER_BATCH } from "@/lib/constants";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import {
  deriveCharacterNameFromProfileInput,
  isExplicitGender,
  normalizeGender,
  sanitizeCharacterProfile,
  toChineseCharacterText,
  type CharacterProfile,
} from "@/lib/prompt/character-profile";
import { assemble as assemblePromptWithEngine } from "@/lib/prompt/engine";
import { resolveNegativePrompt } from "@/lib/prompt/negative";
import { getModelProvider } from "@/lib/model-providers";

// 最终 prompt 的结构化快照（仅用于 job_items.prompt_blocks JSONB 存档）。
// 新架构下 part3 永远为 null，source_mode 固定为 "template"。
type PromptBlocksSnapshot = {
  source_mode: "template";
  part1: string | null;
  part2: string | null;
  part3: null;
  part4: string | null;
  style_key: string | null;
};
import {
  createBatchJobSchema,
  listBatchJobsQuerySchema,
  listImageResultsQuerySchema,
  listJobItemsQuerySchema,
} from "@/lib/validators/batch-job";
import { makeBatchJobNo, makeJobItemNo, toCST } from "@/lib/utils";
import { getDefaultModelByCapability, getModelByKey } from "@/services/model-config.service";

type CreateBatchInput = z.infer<typeof createBatchJobSchema>;
type ListJobsInput = z.infer<typeof listBatchJobsQuerySchema>;
type ListItemsInput = z.infer<typeof listJobItemsQuerySchema>;
type ListImagesInput = z.infer<typeof listImageResultsQuerySchema>;
type CreatePromptItemInput = CreateBatchInput["prompts"][number];
type ResolvedPromptItem = Omit<ReturnType<typeof resolvePromptItemForCreate>, "character_profile"> & {
  character_profile: CharacterProfile | null;
  source_portrait_id?: bigint | null;
};
type SourcePortraitForCreate = {
  id: bigint;
  jobItemId: bigint;
  prompt: string;
  promptBlocks: JsonValue | null;
  negativePrompt: string | null;
  characterName: string | null;
  characterProfile: JsonValue | null;
  styleKey: string | null;
  lineNo: number;
  isSelectedPortrait: boolean;
  capability: Capability;
};
type JobItemWithBatch = JobItemRecord & { batchJob: BatchJobRecord };

const BATCH_JOB_COLUMNS = `
  id,
  job_no AS "jobNo",
  task_name AS "taskName",
  folder_name AS "folderName",
  capability,
  status,
  source_type AS "sourceType",
  total_count AS "totalCount",
  success_count AS "successCount",
  failed_count AS "failedCount",
  params_snapshot AS "paramsSnapshot",
  created_at AS "createdAt",
  started_at AS "startedAt",
  finished_at AS "finishedAt",
  export_status AS "exportStatus",
  export_file_id AS "exportFileId",
  style_key AS "styleKey"
`;

const JOB_ITEM_COLUMNS = `
  id,
  batch_job_id AS "batchJobId",
  item_no AS "itemNo",
  line_no AS "lineNo",
  prompt,
  prompt_blocks AS "promptBlocks",
  negative_prompt AS "negativePrompt",
  character_name AS "characterName",
  character_profile AS "characterProfile",
  style_key AS "styleKey",
  model_key AS "modelKey",
  status,
  retry_count AS "retryCount",
  max_retry AS "maxRetry",
  next_retry_at AS "nextRetryAt",
  error_code AS "errorCode",
  error_message AS "errorMessage",
  run_params AS "runParams",
  source_portrait_id AS "sourcePortraitId",
  worker_id AS "workerId",
  started_at AS "startedAt",
  finished_at AS "finishedAt",
  locked_at AS "lockedAt"
`;

const IMAGE_RESULT_COLUMNS = `
  id,
  batch_job_id AS "batchJobId",
  job_item_id AS "jobItemId",
  capability,
  variant_index AS "variantIndex",
  format,
  width,
  height,
  file_size AS "fileSize",
  sha256,
  nas_provider AS "nasProvider",
  nas_container AS "nasContainer",
  nas_object_key AS "nasObjectKey",
  access_url AS "accessUrl",
  is_selected_portrait AS "isSelectedPortrait",
  selected_at AS "selectedAt",
  created_at AS "createdAt"
`;

const EXPORT_FILE_COLUMNS = `
  id,
  status,
  file_name AS "fileName",
  file_size AS "fileSize",
  nas_provider AS "nasProvider",
  nas_container AS "nasContainer",
  nas_object_key AS "nasObjectKey",
  access_url AS "accessUrl",
  error_message AS "errorMessage",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const capabilityMap: Record<string, Capability> = {
  PORTRAIT: "PORTRAIT",
  THREE_VIEW: "THREE_VIEW",
  SCENE_CONCEPT: "SCENE_CONCEPT",
};

const portraitParamGuard = (params: Record<string, unknown>, modelKey: string) => {
  const rawCount = params.count;
  const parsedCount = rawCount === undefined || rawCount === null ? undefined : Number(rawCount);
  const count =
    parsedCount !== undefined && Number.isFinite(parsedCount) && parsedCount >= 1
      ? Math.floor(parsedCount)
      : undefined;
  const userNegative =
    typeof params.negative_prompt === "string" && params.negative_prompt.trim()
      ? params.negative_prompt.trim()
      : undefined;
  return {
    ...(count !== undefined ? { count } : {}),
    seed: params.seed ? Number(params.seed) : undefined,
    size: "1024x1536",
    steps: 30,
    cfg: 7,
    negative_prompt: resolveNegativePrompt({
      preset: "PORTRAIT",
      modelKey,
      userNegative,
    }),
  };
};

const THREE_VIEW_DEFAULT_SIZE = "1920x1080";

const parseAndValidateThreeViewSize = (raw: unknown): string => {
  const sizeStr = typeof raw === "string" ? raw.trim() : THREE_VIEW_DEFAULT_SIZE;
  const match = sizeStr.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
  if (!match) {
    return THREE_VIEW_DEFAULT_SIZE;
  }
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (w <= 0 || h <= 0) {
    return THREE_VIEW_DEFAULT_SIZE;
  }
  const ratio = w / h;
  // Allow ~16:9 (1.77...) with small tolerance; reject others
  if (Math.abs(ratio - 16 / 9) > 0.05) {
    return THREE_VIEW_DEFAULT_SIZE;
  }
  return `${w}x${h}`;
};

const threeViewParamGuard = (params: Record<string, unknown>, modelKey: string) => {
  const userNegative =
    typeof params.negative_prompt === "string" && params.negative_prompt.trim()
      ? params.negative_prompt.trim()
      : undefined;
  return {
    seed: params.seed ? Number(params.seed) : undefined,
    size: parseAndValidateThreeViewSize(params.size),
    aspect_ratio: "16:9",
    negative_prompt: resolveNegativePrompt({
      preset: "THREE_VIEW",
      modelKey,
      userNegative,
    }),
  };
};

const sceneParamGuard = (params: Record<string, unknown>) => {
  const count = Number(params.count ?? 1);
  if (!Number.isFinite(count) || count < 1 || count > 4) {
    throw new AppError("E_INVALID_PARAM", "SCENE_CONCEPT params.count must be 1~4.", 400);
  }

  const style = String(params.style_preset ?? "cinematic");
  if (!["cinematic", "realistic", "illustration"].includes(style)) {
    throw new AppError("E_INVALID_PARAM", "style_preset must be cinematic/realistic/illustration.", 400);
  }
  const aspect = String(params.aspect_ratio ?? "16:9");
  if (!["16:9", "4:3", "1:1", "9:16"].includes(aspect)) {
    throw new AppError("E_INVALID_PARAM", "aspect_ratio must be in 16:9/4:3/1:1/9:16.", 400);
  }

  return {
    style_preset: style,
    aspect_ratio: aspect,
    count: Math.floor(count),
    seed: params.seed ? Number(params.seed) : undefined,
    negative_prompt: typeof params.negative_prompt === "string" ? params.negative_prompt : undefined,
  };
};

const resolveModelAndRunParams = async (
  capability: Capability,
  params: Record<string, unknown>,
): Promise<{ modelKey: string; mergedParams: Record<string, unknown> }> => {
  const selectedModelKey = typeof params.model_key === "string" ? params.model_key.trim() : "";

  if (capability === "PORTRAIT") {
    const model = selectedModelKey
      ? await getModelByKey(selectedModelKey, capability)
      : (await getModelByKey(env.skyTextToImageModelMj, capability).catch(() => null)) ??
        (await getDefaultModelByCapability(capability));

    if (selectedModelKey && !model.allowFrontSelect) {
      throw new AppError(
        "E_MODEL_NOT_ALLOWED",
        `Model ${selectedModelKey} is not front-selectable for capability ${capability}.`,
        400,
      );
    }

    const provider = getModelProvider();
    if (provider.supportsCapability && !provider.supportsCapability(model.modelKey, "TEXT_TO_IMAGE")) {
      throw new AppError(
        "E_INVALID_PARAM",
        `Model "${model.modelKey}" does not support text-to-image; PORTRAIT requires a t2i-capable model.`,
        400,
      );
    }

    const guarded = portraitParamGuard(params, model.modelKey);
    return {
      modelKey: model.modelKey,
      mergedParams: { ...(model.defaultParams as Record<string, unknown>), ...guarded },
    };
  }

  const model = selectedModelKey
    ? await getModelByKey(selectedModelKey, capability)
    : await getDefaultModelByCapability(capability);

  if (selectedModelKey && !model.allowFrontSelect) {
    throw new AppError(
      "E_MODEL_NOT_ALLOWED",
      `Model ${selectedModelKey} is not front-selectable for capability ${capability}.`,
      400,
    );
  }

  if (capability === "THREE_VIEW") {
    const provider = getModelProvider();
    if (provider.supportsCapability && !provider.supportsCapability(model.modelKey, "IMAGE_TO_IMAGE")) {
      throw new AppError(
        "E_INVALID_PARAM",
        `Model "${model.modelKey}" does not support image-to-image; THREE_VIEW requires an i2i-capable model so that the source portrait can constrain the output.`,
        400,
      );
    }
    const guarded = threeViewParamGuard(params, model.modelKey);
    return {
      modelKey: model.modelKey,
      mergedParams: { ...(model.defaultParams as Record<string, unknown>), ...guarded },
    };
  }

  const guarded = sceneParamGuard(params);
  return {
    modelKey: model.modelKey,
    mergedParams: { ...(model.defaultParams as Record<string, unknown>), ...guarded },
  };
};

const assertPromptText = (prompt: string, lineNo: number) => {
  if (!prompt) {
    throw new AppError("E_INVALID_PARAM", `Prompt at line ${lineNo} cannot be empty.`, 400);
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new AppError("E_PROMPT_TOO_LONG", `Prompt at line ${lineNo} exceeds ${MAX_PROMPT_LENGTH} characters.`, 400);
  }
};

const coerceCharacterProfileFromInput = (
  raw: unknown,
  characterNameFallback?: string | null,
  sourceText?: string | null,
): CharacterProfile | null => {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const name = deriveCharacterNameFromProfileInput(
    {
      name: typeof record.name === "string" && record.name.trim()
        ? record.name.trim()
        : characterNameFallback?.trim() ?? "",
      age_band: typeof record.age_band === "string" ? record.age_band : undefined,
      build: typeof record.build === "string" ? record.build : undefined,
      complexion: typeof record.complexion === "string" ? record.complexion : undefined,
      face: typeof record.face === "string" ? record.face : undefined,
      hair: typeof record.hair === "string" ? record.hair : undefined,
      outfit: typeof record.outfit === "string" ? record.outfit : undefined,
      accessories: typeof record.accessories === "string" ? record.accessories : undefined,
      extra_visual: typeof record.extra_visual === "string" ? record.extra_visual : undefined,
    },
    sourceText,
  ) ?? "";
  if (!name) return null;

  return sanitizeCharacterProfile({
    name,
    gender: normalizeGender(record.gender),
    age_band: typeof record.age_band === "string" ? record.age_band : undefined,
    build: typeof record.build === "string" ? record.build : undefined,
    complexion: typeof record.complexion === "string" ? record.complexion : undefined,
    face: typeof record.face === "string" ? record.face : undefined,
    hair: typeof record.hair === "string" ? record.hair : undefined,
    outfit: typeof record.outfit === "string" ? record.outfit : undefined,
    accessories: typeof record.accessories === "string" ? record.accessories : undefined,
    extra_visual: typeof record.extra_visual === "string" ? record.extra_visual : undefined,
  });
};

const resolvePromptItemForCreate = (
  item: CreatePromptItemInput,
  batchStyleKey?: string | null,
  capability?: Capability,
  modelKey?: string,
) => {
  if (capability !== "PORTRAIT" && capability !== "THREE_VIEW") {
    throw new AppError(
      "E_INVALID_PARAM",
      `Capability ${capability ?? "unknown"} does not support prompt assembly.`,
      400,
    );
  }
  if (capability === "THREE_VIEW") {
    throw new AppError(
      "E_INVALID_PARAM",
      "THREE_VIEW jobs must be created from source_portrait_ids, not prompt rows.",
      400,
    );
  }

  const profile = coerceCharacterProfileFromInput(item.character_profile, item.character_name, item.prompt);
  if (!profile) {
    throw new AppError(
      "E_INVALID_PARAM",
      `Prompt at line ${item.line_no} is missing a valid character_profile (name + explicit gender required).`,
      400,
    );
  }
  if (!isExplicitGender(profile.gender)) {
    throw new AppError(
      "E_INVALID_PARAM",
      `Prompt at line ${item.line_no} must specify character_profile.gender as male, female, or nonbinary. Unknown gender would make portrait generation random.`,
      400,
    );
  }

  const effectiveStyleKey = item.style_key?.trim() || batchStyleKey?.trim() || null;
  const userNegative = item.negative_prompt?.trim() || undefined;
  const assembled = assemblePromptWithEngine({
    preset: capability,
    style_key: effectiveStyleKey,
    profile,
    modelKey: modelKey ?? "",
    part4: typeof item.prompt_blocks?.part4 === "string" ? item.prompt_blocks.part4 : null,
    userNegative,
  });
  assertPromptText(assembled.prompt, item.line_no);

  return {
    line_no: item.line_no,
    prompt: assembled.prompt,
    negative_prompt: userNegative ?? assembled.negative_prompt,
    character_name: profile.name,
    ext_params: item.ext_params ?? {},
    prompt_blocks: {
      source_mode: "template",
      part1: assembled.prompt_snapshot.part1,
      part2: assembled.prompt_snapshot.part2,
      part3: null,
      part4: assembled.prompt_snapshot.part4,
      style_key: assembled.prompt_snapshot.style_key,
    } satisfies PromptBlocksSnapshot,
    character_profile: profile,
    style_key: assembled.prompt_snapshot.style_key,
  };
};

const normalizeResponseText = (value: unknown) =>
  typeof value === "string" ? (toChineseCharacterText(value) ?? value) : null;

const toPromptBlocksResponse = (value: JsonValue | null) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const blocks = value as Record<string, unknown>;
  return {
    source_mode: typeof blocks.source_mode === "string" ? blocks.source_mode : "template",
    prompt_blocks: {
      part1: normalizeResponseText(blocks.part1),
      part2: normalizeResponseText(blocks.part2),
      part3: normalizeResponseText(blocks.part3),
      part4: normalizeResponseText(blocks.part4),
    },
  };
};

const buildThreeViewPromptFromPortrait = (
  source: SourcePortraitForCreate,
  index: number,
  modelKey: string,
  batchStyleKey?: string | null,
): ResolvedPromptItem => {
  // 三视图不再依赖 character_profile：视觉一致性由定妆照作为 i2i 参考图保证。
  // profile 有就复用、缺字段也不阻塞。
  const profile = coerceCharacterProfileFromInput(source.characterProfile, source.characterName, source.prompt);
  const characterName = profile?.name ?? source.characterName?.trim() ?? "";

  const effectiveStyleKey = batchStyleKey?.trim() || source.styleKey?.trim() || null;
  const assembled = assemblePromptWithEngine({
    preset: "THREE_VIEW",
    style_key: effectiveStyleKey,
    profile,
    modelKey,
  });
  assertPromptText(assembled.prompt, index + 1);

  return {
    line_no: index + 1,
    prompt: assembled.prompt,
    negative_prompt: assembled.negative_prompt,
    character_name: characterName,
    ext_params: {},
    prompt_blocks: {
      source_mode: "template",
      part1: assembled.prompt_snapshot.part1,
      part2: assembled.prompt_snapshot.part2,
      part3: null,
      part4: assembled.prompt_snapshot.part4,
      style_key: assembled.prompt_snapshot.style_key,
    } satisfies PromptBlocksSnapshot,
    character_profile: profile,
    style_key: assembled.prompt_snapshot.style_key,
    source_portrait_id: source.id,
  };
};

const loadSourcePortraitsForCreate = async (sourcePortraitIds: string[]) => {
  const ids = sourcePortraitIds.map((id) => BigInt(id));
  const result = await query<SourcePortraitForCreate>(
    `
      SELECT
        ir.id,
        ir.job_item_id AS "jobItemId",
        ir.capability,
        ir.is_selected_portrait AS "isSelectedPortrait",
        ji.prompt,
        ji.prompt_blocks AS "promptBlocks",
        ji.negative_prompt AS "negativePrompt",
        ji.character_name AS "characterName",
        ji.character_profile AS "characterProfile",
        ji.style_key AS "styleKey",
        ji.line_no AS "lineNo"
      FROM image_results ir
      JOIN job_items ji ON ji.id = ir.job_item_id
      WHERE ir.id = ANY($1::bigint[])
    `,
    [ids],
  );

  const byId = new Map(result.rows.map((row) => [row.id.toString(), row]));
  const missingIds = sourcePortraitIds.filter((id) => !byId.has(id));
  if (missingIds.length > 0) {
    throw new AppError("E_INVALID_PARAM", `source_portrait_ids contains unknown image ids: ${missingIds.join(", ")}.`, 400);
  }

  const invalidRows = result.rows.filter((row) => row.capability !== "PORTRAIT" || row.isSelectedPortrait !== true);
  if (invalidRows.length > 0) {
    throw new AppError(
      "E_INVALID_PARAM",
      `source_portrait_ids must reference selected PORTRAIT image_results: ${invalidRows.map((row) => row.id.toString()).join(", ")}.`,
      400,
    );
  }

  return sourcePortraitIds.map((id) => byId.get(id)!);
};

const getBatchJobById = async (id: bigint) => {
  const result = await query<BatchJobRecord>(
    `
      SELECT ${BATCH_JOB_COLUMNS}
      FROM batch_jobs
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  return result.rows[0] ?? null;
};

const getJobItemById = async (id: bigint) => {
  const result = await query<JobItemRecord>(
    `
      SELECT ${JOB_ITEM_COLUMNS}
      FROM job_items
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  return result.rows[0] ?? null;
};

export const createBatchJob = async (input: CreateBatchInput) => {
  if (input.prompts.length > MAX_PROMPTS_PER_BATCH) {
    throw new AppError("E_TOO_MANY_PROMPTS", `Too many prompts. Max ${MAX_PROMPTS_PER_BATCH}.`, 400);
  }
  const capability = capabilityMap[input.capability];
  if (!capability) {
    throw new AppError("E_INVALID_PARAM", "Unsupported capability.", 400);
  }

  const { modelKey, mergedParams } = await resolveModelAndRunParams(capability, input.params);
  const jobNo = makeBatchJobNo();
  const hasSourcePortraits = capability === "THREE_VIEW" && input.source_portrait_ids.length > 0;
  const sourcePortraits = hasSourcePortraits ? await loadSourcePortraitsForCreate(input.source_portrait_ids) : [];
  const batchStyleKey = input.style_key?.trim() || null;
  const resolvedPrompts: ResolvedPromptItem[] = hasSourcePortraits
    ? sourcePortraits.map((portrait, index) =>
        buildThreeViewPromptFromPortrait(portrait, index, modelKey, batchStyleKey),
      )
    : input.prompts.map((prompt) => ({
        ...resolvePromptItemForCreate(prompt, batchStyleKey, capability, modelKey),
        source_portrait_id: null,
      }));
  const paramsSnapshotObject: Record<string, unknown> = {
    capability,
    task_name: input.task_name || null,
    model_key: modelKey,
    params: mergedParams,
  };
  if (hasSourcePortraits) {
    paramsSnapshotObject.source_portrait_ids = input.source_portrait_ids;
  }
  if (batchStyleKey) {
    paramsSnapshotObject.style_key = batchStyleKey;
  }

  const created = await withTransaction(async (tx) => {
    const batch = await one<BatchJobRecord>(
      tx,
      `
        INSERT INTO batch_jobs (
          job_no,
          task_name,
          folder_name,
          capability,
          status,
          source_type,
          total_count,
          success_count,
          failed_count,
          params_snapshot,
          style_key
        )
        VALUES ($1, $2, $3, $4, 'QUEUED', $5, $6, 0, 0, $7, $8)
        RETURNING ${BATCH_JOB_COLUMNS}
      `,
      [
        jobNo,
        input.task_name || null,
        input.folder_name,
        capability,
        input.source_type,
        resolvedPrompts.length,
        paramsSnapshotObject as JsonValue,
        batchStyleKey,
      ],
    );

    if (resolvedPrompts.length > 0) {
      const values: unknown[] = [];
      const placeholders = resolvedPrompts.map((prompt, index) => {
        const offset = index * 14;
        values.push(
          batch.id,
          makeJobItemNo(),
          prompt.line_no,
          prompt.prompt,
          prompt.prompt_blocks as JsonValue,
          prompt.negative_prompt || null,
          prompt.character_name || null,
          modelKey,
          3,
          0,
          { ...mergedParams, ...(prompt.ext_params ?? {}) } as JsonValue,
          prompt.source_portrait_id ?? null,
          prompt.character_profile ? (prompt.character_profile as unknown as JsonValue) : null,
          prompt.style_key ?? batchStyleKey,
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, 'PENDING', $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14})`;
      });

      await tx.query(
        `
          INSERT INTO job_items (
            batch_job_id,
            item_no,
            line_no,
            prompt,
            prompt_blocks,
            negative_prompt,
            character_name,
            model_key,
            status,
            max_retry,
            retry_count,
            run_params,
            source_portrait_id,
            character_profile,
            style_key
          )
          VALUES ${placeholders.join(", ")}
        `,
        values,
      );
    }

    return batch;
  });

  return {
    id: created.id.toString(),
    job_no: created.jobNo,
    folder_name: created.folderName,
    status: created.status,
    capability: created.capability,
    total_count: created.totalCount,
  };
};

export const listBatchJobs = async (queryInput: ListJobsInput) => {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (queryInput.status) {
    values.push(queryInput.status);
    clauses.push(`status = $${values.length}`);
  }
  if (queryInput.capability) {
    values.push(queryInput.capability);
    clauses.push(`capability = $${values.length}`);
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const offset = (queryInput.page - 1) * queryInput.page_size;
  const listValues = [...values, queryInput.page_size, offset];

  const [itemsResult, totalResult] = await Promise.all([
    query<BatchJobRecord>(
      `
        SELECT ${BATCH_JOB_COLUMNS}
        FROM batch_jobs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2}
      `,
      listValues,
    ),
    query<{ total: number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM batch_jobs
        ${whereClause}
      `,
      values,
    ),
  ]);

  return {
    list: itemsResult.rows.map((item) => ({
      id: item.id.toString(),
      job_no: item.jobNo,
      task_name: item.taskName,
      folder_name: item.folderName,
      capability: item.capability,
      status: item.status,
      total_count: item.totalCount,
      success_count: item.successCount,
      failed_count: item.failedCount,
      source_type: item.sourceType,
      created_at: toCST(item.createdAt),
      finished_at: toCST(item.finishedAt),
    })),
    page: queryInput.page,
    page_size: queryInput.page_size,
    total: totalResult.rows[0]?.total ?? 0,
  };
};

export const getBatchJobDetail = async (jobId: string) => {
  const id = BigInt(jobId);
  const result = await query<
    BatchJobRecord & {
      exportFileId_join: bigint | null;
      exportFileStatus: ExportStatus | null;
      exportFileName: string | null;
      exportFileAccessUrl: string | null;
      exportFileErrorMessage: string | null;
    }
  >(
    `
      SELECT
        bj.id,
        bj.job_no AS "jobNo",
        bj.task_name AS "taskName",
        bj.folder_name AS "folderName",
        bj.capability,
        bj.status,
        bj.source_type AS "sourceType",
        bj.total_count AS "totalCount",
        bj.success_count AS "successCount",
        bj.failed_count AS "failedCount",
        bj.params_snapshot AS "paramsSnapshot",
        bj.created_at AS "createdAt",
        bj.started_at AS "startedAt",
        bj.finished_at AS "finishedAt",
        bj.export_status AS "exportStatus",
        bj.export_file_id AS "exportFileId",
        ef.id AS "exportFileId_join",
        ef.status AS "exportFileStatus",
        ef.file_name AS "exportFileName",
        ef.access_url AS "exportFileAccessUrl",
        ef.error_message AS "exportFileErrorMessage"
      FROM batch_jobs bj
      LEFT JOIN export_files ef ON ef.id = bj.export_file_id
      WHERE bj.id = $1
      LIMIT 1
    `,
    [id],
  );
  const job = result.rows[0];
  if (!job) {
    throw new AppError("E_JOB_NOT_FOUND", "Batch job not found.", 404);
  }

  return {
    id: job.id.toString(),
    job_no: job.jobNo,
    task_name: job.taskName,
    folder_name: job.folderName,
    capability: job.capability,
    status: job.status,
    source_type: job.sourceType,
    total_count: job.totalCount,
    success_count: job.successCount,
    failed_count: job.failedCount,
    params_snapshot: job.paramsSnapshot,
    created_at: toCST(job.createdAt),
    started_at: toCST(job.startedAt),
    finished_at: toCST(job.finishedAt),
    export_status: job.exportStatus,
    export_file:
      job.exportFileId_join === null
        ? null
        : {
            id: job.exportFileId_join.toString(),
            status: job.exportFileStatus,
            file_name: job.exportFileName,
            access_url: job.exportFileAccessUrl,
            download_url: `/api/v1/files/exports/${job.exportFileId_join.toString()}`,
            error_message: job.exportFileErrorMessage,
          },
  };
};

export const listJobItemsByBatch = async (jobId: string, queryInput: ListItemsInput) => {
  const id = BigInt(jobId);
  const job = await getBatchJobById(id);
  if (!job) {
    throw new AppError("E_JOB_NOT_FOUND", "Batch job not found.", 404);
  }

  const clauses = [`batch_job_id = $1`];
  const values: unknown[] = [id];

  if (queryInput.status) {
    values.push(queryInput.status);
    clauses.push(`status = $${values.length}`);
  }
  if (queryInput.keyword) {
    values.push(`%${queryInput.keyword}%`);
    clauses.push(`prompt ILIKE $${values.length}`);
  }

  const whereClause = `WHERE ${clauses.join(" AND ")}`;
  const offset = (queryInput.page - 1) * queryInput.page_size;
  const listValues = [...values, queryInput.page_size, offset];

  const [itemsResult, totalResult] = await Promise.all([
    query<JobItemRecord>(
      `
        SELECT ${JOB_ITEM_COLUMNS}
        FROM job_items
        ${whereClause}
        ORDER BY id ASC
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2}
      `,
      listValues,
    ),
    query<{ total: number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM job_items
        ${whereClause}
      `,
      values,
    ),
  ]);

  return {
    list: itemsResult.rows.map((item) => ({
      ...(toPromptBlocksResponse(item.promptBlocks) ?? {
        source_mode: "raw",
        prompt_blocks: null,
      }),
      id: item.id.toString(),
      item_no: item.itemNo,
      line_no: item.lineNo,
      prompt: toChineseCharacterText(item.prompt) ?? item.prompt,
      negative_prompt: item.negativePrompt,
      character_name: item.characterName,
      character_profile:
        item.characterProfile && typeof item.characterProfile === "object" && !Array.isArray(item.characterProfile)
          ? (item.characterProfile as Record<string, unknown>)
          : null,
      style_key: item.styleKey,
      model_key: item.modelKey,
      status: item.status,
      retry_count: item.retryCount,
      max_retry: item.maxRetry,
      error_code: item.errorCode,
      error_message: item.errorMessage,
      source_portrait_id: item.sourcePortraitId?.toString() ?? null,
      started_at: toCST(item.startedAt),
      finished_at: toCST(item.finishedAt),
    })),
    total: totalResult.rows[0]?.total ?? 0,
    page: queryInput.page,
    page_size: queryInput.page_size,
  };
};

export const listImageResultsByBatch = async (jobId: string, queryInput: ListImagesInput) => {
  const id = BigInt(jobId);
  const job = await getBatchJobById(id);
  if (!job) {
    throw new AppError("E_JOB_NOT_FOUND", "Batch job not found.", 404);
  }

  const offset = (queryInput.page - 1) * queryInput.page_size;
  const [itemsResult, totalResult] = await Promise.all([
    query<ImageResultRecord>(
      `
        SELECT ${IMAGE_RESULT_COLUMNS}
        FROM image_results
        WHERE batch_job_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        OFFSET $3
      `,
      [id, queryInput.page_size, offset],
    ),
    query<{ total: number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM image_results
        WHERE batch_job_id = $1
      `,
      [id],
    ),
  ]);

  return {
    list: itemsResult.rows.map((item) => ({
      id: item.id.toString(),
      batch_job_id: item.batchJobId.toString(),
      job_item_id: item.jobItemId.toString(),
      capability: item.capability,
      variant_index: item.variantIndex,
      format: item.format,
      width: item.width,
      height: item.height,
      file_size: item.fileSize.toString(),
      access_url: item.accessUrl,
      download_url: `/api/v1/files/image-results/${item.id.toString()}`,
      is_selected_portrait: item.isSelectedPortrait,
      selected_at: toCST(item.selectedAt),
      created_at: toCST(item.createdAt),
    })),
    total: totalResult.rows[0]?.total ?? 0,
    page: queryInput.page,
    page_size: queryInput.page_size,
  };
};

export const updatePortraitSelection = async (imageId: string, selected: boolean) => {
  const id = BigInt(imageId);
  const image = await query<ImageResultRecord>(
    `
      SELECT ${IMAGE_RESULT_COLUMNS}
      FROM image_results
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  ).then((result) => result.rows[0] ?? null);

  if (!image) {
    throw new AppError("E_JOB_NOT_FOUND", "Image result not found.", 404);
  }
  if (selected && image.capability !== "PORTRAIT") {
    throw new AppError("E_INVALID_PARAM", "Only PORTRAIT image_results can be selected as source portraits.", 400);
  }

  try {
    const updated = await query<ImageResultRecord>(
      `
        UPDATE image_results
        SET
          is_selected_portrait = $2,
          selected_at = CASE WHEN $2 THEN NOW() ELSE NULL END
        WHERE id = $1
        RETURNING ${IMAGE_RESULT_COLUMNS}
      `,
      [id, selected],
    ).then((result) => result.rows[0]);

    return {
      id: updated.id.toString(),
      batch_job_id: updated.batchJobId.toString(),
      job_item_id: updated.jobItemId.toString(),
      capability: updated.capability,
      is_selected_portrait: updated.isSelectedPortrait,
      selected_at: toCST(updated.selectedAt),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new AppError("E_INVALID_PARAM", error.message, 400);
    }
    throw error;
  }
};

export const retryFailedJobItems = async (jobId: string, itemIds?: string[]) => {
  const batchJobId = BigInt(jobId);
  const job = await getBatchJobById(batchJobId);
  if (!job) {
    throw new AppError("E_JOB_NOT_FOUND", "Batch job not found.", 404);
  }

  const targetIds = (itemIds ?? []).map((id) => BigInt(id));

  const retriedCount = await withTransaction(async (tx) => {
    const values: unknown[] = [batchJobId];
    let whereClause = `batch_job_id = $1 AND status = 'FAILED'`;

    if (targetIds.length > 0) {
      values.push(targetIds);
      whereClause += ` AND id = ANY($${values.length}::bigint[])`;
    }

    const updateResult = await tx.query(
      `
        UPDATE job_items
        SET
          status = 'RETRYING',
          error_code = NULL,
          error_message = NULL,
          next_retry_at = NOW(),
          worker_id = NULL,
          locked_at = NULL,
          finished_at = NULL
        WHERE ${whereClause}
      `,
      values,
    );

    await tx.query(
      `
        UPDATE batch_jobs
        SET
          status = 'RUNNING',
          finished_at = NULL
        WHERE id = $1
      `,
      [batchJobId],
    );

    return updateResult.rowCount ?? 0;
  });

  return { retried_count: retriedCount };
};

export const refreshBatchJobAggregate = async (batchJobId: bigint) => {
  const job = await getBatchJobById(batchJobId);
  if (!job) {
    return;
  }

  const counts = await query<{
    successCount: number;
    failedCount: number;
    runningCount: number;
    pendingCount: number;
  }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS "successCount",
        COUNT(*) FILTER (WHERE status = 'FAILED')::int AS "failedCount",
        COUNT(*) FILTER (WHERE status = 'RUNNING')::int AS "runningCount",
        COUNT(*) FILTER (WHERE status IN ('PENDING', 'RETRYING'))::int AS "pendingCount"
      FROM job_items
      WHERE batch_job_id = $1
    `,
    [batchJobId],
  ).then((result) => result.rows[0]);

  const done = counts.successCount + counts.failedCount;
  const total = job.totalCount;

  let status: BatchJobStatus = job.status;
  let finishedAt: Date | null = job.finishedAt;
  let startedAt: Date | null = job.startedAt;

  if (done === total) {
    finishedAt = new Date();
    if (successCountEqualsTotal(counts.successCount, total)) {
      status = "SUCCESS";
    } else if (failedCountEqualsTotal(counts.failedCount, total)) {
      status = "FAILED";
    } else {
      status = "PARTIAL_SUCCESS";
    }
  } else if (counts.runningCount > 0 || counts.pendingCount > 0) {
    status = "RUNNING";
    if (!startedAt) {
      startedAt = new Date();
    }
    finishedAt = null;
  } else {
    status = "QUEUED";
  }

  await query(
    `
      UPDATE batch_jobs
      SET
        success_count = $2,
        failed_count = $3,
        status = $4,
        started_at = $5,
        finished_at = $6
      WHERE id = $1
    `,
    [batchJobId, counts.successCount, counts.failedCount, status, startedAt, finishedAt],
  );
};

const successCountEqualsTotal = (successCount: number, total: number) => successCount === total;
const failedCountEqualsTotal = (failedCount: number, total: number) => failedCount === total;

export const updateJobItemOnSuccess = async (itemId: bigint) => {
  const item = await query<Pick<JobItemRecord, "batchJobId">>(
    `
      UPDATE job_items
      SET
        status = 'SUCCESS',
        error_code = NULL,
        error_message = NULL,
        worker_id = NULL,
        locked_at = NULL,
        finished_at = NOW()
      WHERE id = $1
      RETURNING batch_job_id AS "batchJobId"
    `,
    [itemId],
  ).then((result) => result.rows[0]);
  await refreshBatchJobAggregate(item.batchJobId);
};

export const updateJobItemOnFailure = async (
  item: Pick<JobItemRecord, "id" | "batchJobId" | "retryCount" | "maxRetry">,
  errorCode: string,
  errorMessage: string,
) => {
  const canRetry = item.retryCount < item.maxRetry;
  const delaySec = canRetry ? Math.pow(2, item.retryCount + 1) * 15 : 0;
  const nextRetryAt = canRetry ? new Date(Date.now() + delaySec * 1000) : null;

  await query(
    `
      UPDATE job_items
      SET
        status = $2,
        retry_count = retry_count + $3,
        next_retry_at = $4,
        error_code = $5,
        error_message = $6,
        worker_id = NULL,
        locked_at = NULL,
        finished_at = $7
      WHERE id = $1
    `,
    [
      item.id,
      canRetry ? "RETRYING" : "FAILED",
      canRetry ? 1 : 0,
      nextRetryAt,
      errorCode,
      errorMessage,
      canRetry ? null : new Date(),
    ],
  );
  await refreshBatchJobAggregate(item.batchJobId);
};

export const markBatchJobRunning = async (batchJobId: bigint) => {
  await query(
    `
      UPDATE batch_jobs
      SET
        status = 'RUNNING',
        started_at = NOW()
      WHERE id = $1
    `,
    [batchJobId],
  );
};

export const markBatchJobExportStatus = async (batchJobId: bigint, exportStatus: ExportStatus, exportFileId?: bigint) => {
  await query(
    `
      UPDATE batch_jobs
      SET
        export_status = $2,
        status = CASE WHEN $2 = 'SUCCESS' THEN 'EXPORTED' ELSE status END,
        export_file_id = COALESCE($3, export_file_id),
        finished_at = CASE WHEN $2 = 'SUCCESS' THEN NOW() ELSE finished_at END
      WHERE id = $1
    `,
    [batchJobId, exportStatus, exportFileId ?? null],
  );
};

export const getJobItemWithBatch = async (itemId: bigint): Promise<JobItemWithBatch> => {
  const item = await getJobItemById(itemId);
  if (!item) {
    throw new AppError("E_JOB_NOT_FOUND", "Job item not found.", 404);
  }

  const batchJob = await getBatchJobById(item.batchJobId);
  if (!batchJob) {
    throw new AppError("E_JOB_NOT_FOUND", "Batch job not found.", 404);
  }

  return {
    ...item,
    batchJob,
  };
};

export const getBatchJobByIdRaw = async (batchJobId: bigint): Promise<BatchJobRecord | null> =>
  getBatchJobById(batchJobId);

export const getExportFileById = async (id: bigint): Promise<ExportFileRecord | null> => {
  const result = await query<ExportFileRecord>(
    `
      SELECT ${EXPORT_FILE_COLUMNS}
      FROM export_files
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  return result.rows[0] ?? null;
};
