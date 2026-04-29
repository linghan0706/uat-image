import { query } from "@/lib/db/pg";
import type { Capability, JsonValue } from "@/lib/db/types";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getModelProvider } from "@/lib/model-providers";
import {
  type CharacterProfile,
  isValidCharacterProfile,
} from "@/lib/prompt/character-profile";
import { assemble as assemblePromptWithEngine } from "@/lib/prompt/engine";
import { getStorageAdapter } from "@/lib/storage";
import { makeImageObjectKey, sha256Hex } from "@/lib/utils";
import {
  getJobItemWithBatch,
  markBatchJobRunning,
  updateJobItemOnFailure,
  updateJobItemOnSuccess,
} from "@/services/batch-job.service";

const toCapability = (value: string): Capability => value as Capability;

type PortraitReference = {
  nasObjectKey: string;
  format: string;
};

const mimeFromFormat = (format: string) => {
  const lower = format.toLowerCase();
  switch (lower) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "png":
    default:
      return "image/png";
  }
};

const getCharacterImageCount = async (batchJobId: bigint, characterName: string): Promise<number> => {
  const result = await query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS "count"
      FROM image_results ir
      JOIN job_items ji ON ji.id = ir.job_item_id
      WHERE ir.batch_job_id = $1 AND ji.character_name = $2
    `,
    [batchJobId, characterName],
  );
  return result.rows[0]?.count ?? 0;
};

const getSourcePortraitReference = async (sourcePortraitId: bigint): Promise<PortraitReference> => {
  const source = await query<{
    id: bigint;
    capability: Capability;
    isSelectedPortrait: boolean;
    nasObjectKey: string;
    format: string;
  }>(
    `
      SELECT
        id,
        capability,
        is_selected_portrait AS "isSelectedPortrait",
        nas_object_key AS "nasObjectKey",
        format
      FROM image_results
      WHERE id = $1
      LIMIT 1
    `,
    [sourcePortraitId],
  ).then((result) => result.rows[0] ?? null);

  if (!source || source.capability !== "PORTRAIT" || source.isSelectedPortrait !== true) {
    throw new AppError("E_INVALID_PARAM", "Source portrait must be a selected PORTRAIT image_result.", 400);
  }

  return {
    nasObjectKey: source.nasObjectKey,
    format: source.format,
  };
};

const downloadPortraitAsDataUri = async (ref: PortraitReference): Promise<string> => {
  const storage = getStorageAdapter();
  const buffer = await storage.downloadBuffer(ref.nasObjectKey);
  return `data:${mimeFromFormat(ref.format)};base64,${buffer.toString("base64")}`;
};

const buildProviderParams = (
  runParams: Record<string, unknown>,
  referenceImageValue: string,
): Record<string, unknown> => ({
  ...runParams,
  reference_image_url: referenceImageValue,
  reference_images: [referenceImageValue],
});

type ThreeViewPromptBlocksSnapshot = {
  source_mode: "template";
  part1: string | null;
  part2: string | null;
  part3: null;
  part4: string | null;
  scene_description: string | null;
  style_key: string | null;
};

type ThreeViewPromptRefreshItem = {
  id: bigint;
  prompt: string;
  negativePrompt: string | null;
  modelKey: string;
  characterProfile: JsonValue | null;
  styleKey: string | null;
};

const toCharacterProfile = (value: JsonValue | null): CharacterProfile | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const profile = value as Partial<CharacterProfile>;
  return isValidCharacterProfile(profile) ? profile : null;
};

const buildThreeViewPromptForExecution = (item: ThreeViewPromptRefreshItem) => {
  const assembled = assemblePromptWithEngine({
    preset: "THREE_VIEW",
    style_key: item.styleKey,
    profile: toCharacterProfile(item.characterProfile),
    modelKey: item.modelKey,
  });

  return {
    prompt: assembled.prompt,
    negativePrompt: assembled.negative_prompt,
    promptBlocks: {
      source_mode: "template",
      part1: assembled.prompt_snapshot.part1,
      part2: assembled.prompt_snapshot.part2,
      part3: null,
      part4: assembled.prompt_snapshot.part4,
      scene_description: assembled.prompt_snapshot.scene_description,
      style_key: assembled.prompt_snapshot.style_key,
    } satisfies ThreeViewPromptBlocksSnapshot,
  };
};

const refreshThreeViewPromptForExecution = async (item: ThreeViewPromptRefreshItem) => {
  const refreshed = buildThreeViewPromptForExecution(item);
  if (refreshed.prompt === item.prompt && refreshed.negativePrompt === item.negativePrompt) {
    return refreshed;
  }

  await query(
    `
      UPDATE job_items
      SET
        prompt = $2,
        prompt_blocks = $3,
        negative_prompt = $4
      WHERE id = $1
    `,
    [item.id, refreshed.prompt, refreshed.promptBlocks as JsonValue, refreshed.negativePrompt],
  );

  logger.info(
    {
      itemId: item.id.toString(),
      promptLength: refreshed.prompt.length,
      negativePromptLength: refreshed.negativePrompt.length,
    },
    "Refreshed THREE_VIEW prompt before generation",
  );

  return refreshed;
};

export const executeJobItem = async (itemId: bigint) => {
  const item = await getJobItemWithBatch(itemId);
  if (item.batchJob.status === "QUEUED") {
    await markBatchJobRunning(item.batchJobId);
  }

  // Clean up stale image_results from a previous (failed) attempt to avoid
  // unique-constraint violations on (job_item_id, variant_index) and nas_object_key.
  await query(`DELETE FROM image_results WHERE job_item_id = $1`, [itemId]);

  const provider = getModelProvider();
  const storage = getStorageAdapter();

  const runParams = (item.runParams as Record<string, unknown>) ?? {};
  const capability = toCapability(item.batchJob.capability);
  const characterName = item.characterName || null;

  let portraitRef: PortraitReference | null = null;

  let baseInput = {
    capability,
    modelKey: item.modelKey,
    prompt: item.prompt,
    negativePrompt: item.negativePrompt,
  };

  const callProviderWithReference = async () => {
    if (!portraitRef) {
      return provider.generateImage({ ...baseInput, params: runParams });
    }

    const dataUri = await downloadPortraitAsDataUri(portraitRef);
    const urlParams = buildProviderParams(runParams, dataUri);
    return provider.generateImage({ ...baseInput, params: urlParams });
  };

  try {
    if (capability === "THREE_VIEW") {
      if (!item.sourcePortraitId) {
        throw new AppError(
          "E_INVALID_PARAM",
          `THREE_VIEW item ${item.id.toString()} is missing source_portrait_id; it must be generated from a selected portrait.`,
          400,
        );
      }
      if (provider.supportsCapability && !provider.supportsCapability(item.modelKey, "IMAGE_TO_IMAGE")) {
        throw new AppError(
          "E_INVALID_PARAM",
          `Model "${item.modelKey}" does not support image-to-image; THREE_VIEW item ${item.id.toString()} cannot execute.`,
          400,
        );
      }
      portraitRef = await getSourcePortraitReference(item.sourcePortraitId);
      const refreshedPrompt = await refreshThreeViewPromptForExecution(item);
      baseInput = {
        ...baseInput,
        prompt: refreshedPrompt.prompt,
        negativePrompt: refreshedPrompt.negativePrompt,
      };
    }

    const output = await callProviderWithReference();

    let charSeqOffset = 0;
    if (characterName) {
      charSeqOffset = await getCharacterImageCount(item.batchJobId, characterName);
    }

    for (let i = 0; i < output.artifacts.length; i += 1) {
      const artifact = output.artifacts[i];
      const variantIndex = i + 1;
      const objectKey = makeImageObjectKey({
        folderName: item.batchJob.folderName,
        capability,
        jobNo: item.batchJob.jobNo,
        itemNo: item.itemNo,
        variantIndex,
        extension: artifact.format,
        characterName,
        characterSeq: characterName ? charSeqOffset + variantIndex : undefined,
      });

      const upload = await storage.uploadBuffer({
        objectKey,
        contentType: mimeFromFormat(artifact.format),
        data: artifact.bytes,
      });

      const sha256 = sha256Hex(artifact.bytes);
      const created = await query<{ id: bigint }>(
        `
          INSERT INTO image_results (
            batch_job_id,
            job_item_id,
            capability,
            variant_index,
            format,
            width,
            height,
            file_size,
            sha256,
            nas_provider,
            nas_container,
            nas_object_key,
            access_url
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL)
          RETURNING id
        `,
        [
          item.batchJobId,
          item.id,
          capability,
          variantIndex,
          artifact.format,
          artifact.width,
          artifact.height,
          BigInt(upload.fileSize),
          sha256,
          upload.provider,
          upload.container,
          upload.objectKey,
        ],
      ).then((result) => result.rows[0]);

      await query(
        `
          UPDATE image_results
          SET access_url = $2
          WHERE id = $1
        `,
        [created.id, `/api/v1/files/image-results/${created.id.toString()}`],
      );
    }

    await updateJobItemOnSuccess(item.id);
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown generate error.");
    const code =
      error instanceof AppError && error.code
        ? error.code
        : err.message.toLowerCase().includes("timeout")
          ? "E_PROVIDER_TIMEOUT"
          : "E_INTERNAL";
    await updateJobItemOnFailure(item, code, err.message);
    if (code === "E_PROVIDER_TIMEOUT") {
      throw new AppError("E_PROVIDER_TIMEOUT", err.message, 504);
    }
    throw error;
  }
};
