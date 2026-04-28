import path from "node:path";
import { PassThrough } from "node:stream";

import archiver from "archiver";

import { query } from "@/lib/db/pg";
import { getStorageAdapter } from "@/lib/storage";
import { markExportFailed, markExportSuccess } from "@/services/export.service";

const toZipBuffer = async (entries: Array<{ name: string; content: Buffer }>) => {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];

  stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

  const completion = new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(stream);
  for (const entry of entries) {
    archive.append(entry.content, { name: entry.name });
  }

  await archive.finalize();
  await completion;

  return Buffer.concat(chunks);
};

export const executeExportFile = async (exportFileId: bigint) => {
  const exportFile = await query<{ id: bigint; nasObjectKey: string }>(
    `
      SELECT
        id,
        nas_object_key AS "nasObjectKey"
      FROM export_files
      WHERE id = $1
      LIMIT 1
    `,
    [exportFileId],
  ).then((result) => result.rows[0] ?? null);
  if (!exportFile) {
    return;
  }

  const batchJob = await query<{ id: bigint; jobNo: string }>(
    `
      SELECT id, job_no AS "jobNo"
      FROM batch_jobs
      WHERE export_file_id = $1
      LIMIT 1
    `,
    [exportFileId],
  ).then((result) => result.rows[0] ?? null);

  if (!batchJob) {
    await markExportFailed(exportFileId, "No batch job linked to export file.");
    return;
  }

  const imageResults = await query<{
    id: bigint;
    itemNo: string;
    variantIndex: number;
    nasObjectKey: string;
    format: string;
    characterName: string | null;
  }>(
    `
      SELECT
        ir.id,
        ji.item_no AS "itemNo",
        ir.variant_index AS "variantIndex",
        ir.nas_object_key AS "nasObjectKey",
        ir.format,
        ji.character_name AS "characterName"
      FROM image_results ir
      JOIN job_items ji ON ji.id = ir.job_item_id
      WHERE ir.batch_job_id = $1
      ORDER BY ir.id ASC
    `,
    [batchJob.id],
  ).then((result) => result.rows);

  try {
    const storage = getStorageAdapter();
    const entries: Array<{ name: string; content: Buffer }> = [];
    const characterSeqMap = new Map<string, number>();

    for (const image of imageResults) {
      const content = await storage.downloadBuffer(image.nasObjectKey);
      let filename: string;

      if (image.characterName) {
        const currentSeq = (characterSeqMap.get(image.characterName) ?? 0) + 1;
        characterSeqMap.set(image.characterName, currentSeq);
        filename = `${image.characterName}-${currentSeq}.${image.format}`;
      } else {
        const base = `${batchJob.jobNo}_${image.itemNo}_v${image.variantIndex}`;
        filename = `${base}.${image.format}`;
      }

      entries.push({
        name: path.posix.join(batchJob.jobNo, filename),
        content,
      });
    }

    const zip = await toZipBuffer(entries);
    const uploaded = await storage.uploadBuffer({
      objectKey: exportFile.nasObjectKey,
      contentType: "application/zip",
      data: zip,
    });

    await markExportSuccess(exportFileId, BigInt(uploaded.fileSize), `/api/v1/files/exports/${exportFileId.toString()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown export error";
    await markExportFailed(exportFileId, message);
  }
};
