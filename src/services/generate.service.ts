import { query } from "@/lib/db/pg";
import type { Capability } from "@/lib/db/types";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getModelProvider } from "@/lib/model-providers";
import { getStorageAdapter } from "@/lib/storage";
import { makeImageObjectKey, sha256Hex } from "@/lib/utils";
import {
  getJobItemWithBatch,
  markBatchJobRunning,
  updateJobItemOnFailure,
  updateJobItemOnSuccess,
} from "@/services/batch-job.service";

const toCapability = (value: string): Capability => value as Capability;

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

const toAbsoluteUrl = (urlOrPath: string) => {
  if (/^https?:\/\//i.test(urlOrPath)) {
    return urlOrPath;
  }
  return new URL(urlOrPath, env.webBaseUrl).toString();
};

const getSourcePortraitReferenceUrl = async (sourcePortraitId: bigint) => {
  const source = await query<{
    id: bigint;
    capability: Capability;
    isSelectedPortrait: boolean;
    accessUrl: string | null;
  }>(
    `
      SELECT
        id,
        capability,
        is_selected_portrait AS "isSelectedPortrait",
        access_url AS "accessUrl"
      FROM image_results
      WHERE id = $1
      LIMIT 1
    `,
    [sourcePortraitId],
  ).then((result) => result.rows[0] ?? null);

  if (!source || source.capability !== "PORTRAIT" || source.isSelectedPortrait !== true) {
    throw new AppError("E_INVALID_PARAM", "Source portrait must be a selected PORTRAIT image_result.", 400);
  }

  return toAbsoluteUrl(source.accessUrl ?? `/api/v1/files/image-results/${source.id.toString()}`);
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

  if (
    capability === "THREE_VIEW" &&
    provider.supportsCapability &&
    !provider.supportsCapability(item.modelKey, "IMAGE_TO_IMAGE")
  ) {
    throw new AppError(
      "E_INVALID_PARAM",
      `Model "${item.modelKey}" does not support image-to-image; THREE_VIEW item ${item.id.toString()} cannot execute.`,
      400,
    );
  }

  const referenceImageUrl =
    capability === "THREE_VIEW" && item.sourcePortraitId
      ? await getSourcePortraitReferenceUrl(item.sourcePortraitId)
      : null;
  const providerParams = referenceImageUrl
    ? {
        ...runParams,
        reference_image_url: referenceImageUrl,
        reference_images: [referenceImageUrl],
      }
    : runParams;

  try {
    const output = await provider.generateImage({
      capability,
      modelKey: item.modelKey,
      prompt: item.prompt,
      negativePrompt: item.negativePrompt,
      params: providerParams,
    });

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
    const code = err.message.toLowerCase().includes("timeout") ? "E_PROVIDER_TIMEOUT" : "E_INTERNAL";
    await updateJobItemOnFailure(item, code, err.message);
    if (code === "E_PROVIDER_TIMEOUT") {
      throw new AppError("E_PROVIDER_TIMEOUT", err.message, 504);
    }
    throw error;
  }
};
