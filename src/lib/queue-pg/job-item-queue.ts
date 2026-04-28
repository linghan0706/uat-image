import { query, withTransaction } from "@/lib/db/pg";
import type { JobItemRecord } from "@/lib/db/types";

type MinimalJobItem = Pick<
  JobItemRecord,
  | "id"
  | "batchJobId"
  | "itemNo"
  | "prompt"
  | "negativePrompt"
  | "modelKey"
  | "runParams"
  | "retryCount"
  | "maxRetry"
  | "status"
>;

export const claimPendingJobItems = async (workerId: string, limit: number): Promise<MinimalJobItem[]> => {
  const rows = await withTransaction(async (tx) => {
    const result = await tx.query<MinimalJobItem>(
      `
        WITH candidates AS (
          SELECT id
          FROM job_items
          WHERE status IN ('PENDING', 'RETRYING')
            AND (next_retry_at IS NULL OR next_retry_at <= NOW())
          ORDER BY id
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        UPDATE job_items AS j
        SET
          status = 'RUNNING',
          worker_id = $2,
          locked_at = NOW(),
          started_at = COALESCE(j.started_at, NOW()),
          error_code = NULL,
          error_message = NULL
        FROM candidates
        WHERE j.id = candidates.id
        RETURNING
          j.id,
          j.batch_job_id AS "batchJobId",
          j.item_no AS "itemNo",
          j.prompt,
          j.negative_prompt AS "negativePrompt",
          j.model_key AS "modelKey",
          j.run_params AS "runParams",
          j.retry_count AS "retryCount",
          j.max_retry AS "maxRetry",
          j.status;
      `,
      [limit, workerId],
    );
    return result.rows;
  });

  return rows;
};

export const recoverStaleRunningItems = async (staleAfterSec: number) => {
  const staleSeconds = Math.max(staleAfterSec, 30);
  const result = await query<{ id: bigint; batchJobId: bigint; status: string }>(
    `
      UPDATE job_items
      SET
        status = CASE WHEN retry_count < max_retry THEN 'RETRYING'::"JobItemStatus" ELSE 'FAILED'::"JobItemStatus" END,
        retry_count = CASE WHEN retry_count < max_retry THEN retry_count + 1 ELSE retry_count END,
        next_retry_at = CASE WHEN retry_count < max_retry THEN NOW() + ($1 * INTERVAL '1 second') ELSE NULL END,
        error_code = COALESCE(error_code, 'E_WORKER_STALE'),
        error_message = COALESCE(error_message, 'Worker lock stale recovered.'),
        worker_id = NULL,
        locked_at = NULL
      WHERE status = 'RUNNING'
        AND locked_at IS NOT NULL
        AND locked_at < NOW() - ($1 * INTERVAL '1 second')
      RETURNING id, batch_job_id AS "batchJobId", status::text;
    `,
    [staleSeconds],
  );
  return result.rows;
};

export const expireTimedOutJobItems = async (expireAfterSec: number): Promise<bigint[]> => {
  const seconds = Math.max(expireAfterSec, 60);

  // 1) RUNNING 状态且 started_at 超时 → FAILED
  const runningResult = await query<{ batchJobId: bigint }>(
    `
      UPDATE job_items
      SET
        status = 'FAILED'::"JobItemStatus",
        error_code = 'E_TASK_EXPIRED',
        error_message = 'Task expired after exceeding maximum allowed duration.',
        worker_id = NULL,
        locked_at = NULL,
        finished_at = NOW()
      WHERE status = 'RUNNING'
        AND started_at IS NOT NULL
        AND started_at < NOW() - ($1 * INTERVAL '1 second')
      RETURNING batch_job_id AS "batchJobId";
    `,
    [seconds],
  );

  // 2) PENDING/RETRYING 状态且所属 batch_job 的 created_at 超时 → FAILED
  const pendingResult = await query<{ batchJobId: bigint }>(
    `
      UPDATE job_items ji
      SET
        status = 'FAILED'::"JobItemStatus",
        error_code = 'E_TASK_EXPIRED',
        error_message = 'Task expired: batch job exceeded maximum allowed duration.',
        worker_id = NULL,
        locked_at = NULL,
        finished_at = NOW()
      FROM batch_jobs bj
      WHERE ji.batch_job_id = bj.id
        AND ji.status IN ('PENDING', 'RETRYING')
        AND bj.status IN ('QUEUED', 'RUNNING')
        AND bj.created_at < NOW() - ($1 * INTERVAL '1 second')
      RETURNING ji.batch_job_id AS "batchJobId";
    `,
    [seconds],
  );

  const affectedIds = new Set<bigint>();
  for (const row of runningResult.rows) {
    affectedIds.add(row.batchJobId);
  }
  for (const row of pendingResult.rows) {
    affectedIds.add(row.batchJobId);
  }

  return [...affectedIds];
};
