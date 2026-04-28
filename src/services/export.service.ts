import path from "node:path";

import { query, withTransaction } from "@/lib/db/pg";
import type { BatchJobRecord, ExportFileRecord, ExportStatus } from "@/lib/db/types";
import { AppError } from "@/lib/errors";
import { getStorageAdapter } from "@/lib/storage";
import { makeExportObjectKey, toCST } from "@/lib/utils";

export const createExportTask = async (jobId: string) => {
  const id = BigInt(jobId);
  const job = await query<
    BatchJobRecord & {
      exportFileId_join: bigint | null;
      exportFileStatus: ExportStatus | null;
      exportFileName: string | null;
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
        ef.file_name AS "exportFileName"
      FROM batch_jobs bj
      LEFT JOIN export_files ef ON ef.id = bj.export_file_id
      WHERE bj.id = $1
      LIMIT 1
    `,
    [id],
  ).then((result) => result.rows[0] ?? null);
  if (!job) {
    throw new AppError("E_JOB_NOT_FOUND", "Batch job not found.", 404);
  }
  if (job.exportFileId_join && job.exportFileStatus && ["PENDING", "RUNNING"].includes(job.exportFileStatus)) {
    return {
      export_id: job.exportFileId_join.toString(),
      status: job.exportFileStatus,
      file_name: job.exportFileName,
    };
  }

  const adapter = getStorageAdapter();
  const nasObjectKey = makeExportObjectKey(job.folderName, job.jobNo);
  const fileName = path.posix.basename(nasObjectKey);

  const exportFile = await query<ExportFileRecord>(
    `
      INSERT INTO export_files (
        status,
        file_name,
        nas_provider,
        nas_container,
        nas_object_key,
        updated_at
      )
      VALUES ('PENDING', $1, $2, $3, $4, NOW())
      RETURNING
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
    `,
    [fileName, adapter.provider, adapter.container, nasObjectKey],
  ).then((result) => result.rows[0]);

  await query(
    `
      UPDATE batch_jobs
      SET
        export_status = 'PENDING',
        status = 'EXPORTING',
        export_file_id = $2
      WHERE id = $1
    `,
    [id, exportFile.id],
  );

  return {
    export_id: exportFile.id.toString(),
    status: exportFile.status,
    file_name: exportFile.fileName,
  };
};

export const getExportById = async (exportId: string) => {
  const id = BigInt(exportId);
  const exportFile = await query<ExportFileRecord>(
    `
      SELECT
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
      FROM export_files
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  ).then((result) => result.rows[0] ?? null);
  if (!exportFile) {
    throw new AppError("E_JOB_NOT_FOUND", "Export file not found.", 404);
  }

  const batchJob = await query<{ id: bigint; jobNo: string }>(
    `
      SELECT id, job_no AS "jobNo"
      FROM batch_jobs
      WHERE export_file_id = $1
      LIMIT 1
    `,
    [id],
  ).then((result) => result.rows[0] ?? null);

  return {
    id: exportFile.id.toString(),
    status: exportFile.status,
    file_name: exportFile.fileName,
    file_size: exportFile.fileSize ? exportFile.fileSize.toString() : null,
    access_url: exportFile.accessUrl,
    error_message: exportFile.errorMessage,
    batch_job_id: batchJob?.id.toString() ?? null,
    batch_job_no: batchJob?.jobNo ?? null,
    download_url: `/api/v1/files/exports/${exportFile.id.toString()}`,
    created_at: toCST(exportFile.createdAt),
    updated_at: toCST(exportFile.updatedAt),
  };
};

export const markExportSuccess = async (exportFileId: bigint, fileSize: bigint, accessUrl: string | null) => {
  await withTransaction(async (tx) => {
    await tx.query(
      `
        UPDATE export_files
        SET
          status = $2,
          file_size = $3,
          access_url = $4,
          error_message = NULL,
          updated_at = NOW()
        WHERE id = $1
      `,
      [exportFileId, "SUCCESS", fileSize, accessUrl],
    );

    await tx.query(
      `
        UPDATE batch_jobs
        SET
          export_status = $2,
          status = 'EXPORTED'
        WHERE export_file_id = $1
      `,
      [exportFileId, "SUCCESS"],
    );
  });
};

export const markExportFailed = async (exportFileId: bigint, message: string) => {
  await withTransaction(async (tx) => {
    await tx.query(
      `
        UPDATE export_files
        SET
          status = $2,
          error_message = $3,
          updated_at = NOW()
        WHERE id = $1
      `,
      [exportFileId, "FAILED", message],
    );

    await tx.query(
      `
        UPDATE batch_jobs
        SET export_status = $2
        WHERE export_file_id = $1
      `,
      [exportFileId, "FAILED"],
    );
  });
};
