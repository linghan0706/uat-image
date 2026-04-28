import { query, withTransaction } from "@/lib/db/pg";

export type ClaimedImportTask = {
  id: bigint;
  status: string;
};

export const claimPendingImportTasks = async (workerId: string, limit: number): Promise<ClaimedImportTask[]> =>
  withTransaction(async (tx) => {
    const result = await tx.query<ClaimedImportTask>(
      `
        WITH candidates AS (
          SELECT id
          FROM import_files
          WHERE parse_status = 'QUEUED'
            AND (next_retry_at IS NULL OR next_retry_at <= NOW())
          ORDER BY id
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        UPDATE import_files AS i
        SET
          parse_status = 'RUNNING',
          worker_id = $2,
          locked_at = NOW(),
          started_at = COALESCE(i.started_at, NOW()),
          error_code = NULL,
          parse_error = NULL
        FROM candidates
        WHERE i.id = candidates.id
        RETURNING i.id, i.parse_status::text AS status;
      `,
      [limit, workerId],
    );
    return result.rows;
  });

export const recoverStaleImportTasks = async (staleAfterSec: number) => {
  const staleSeconds = Math.max(staleAfterSec, 30);

  await query(
    `
      UPDATE import_files
      SET
        parse_status = CASE
          WHEN parse_status = 'RUNNING' AND retry_count < max_retry THEN 'QUEUED'::"ImportTaskStatus"
          WHEN parse_status = 'RUNNING' THEN 'PARSE_FAILED'::"ImportTaskStatus"
          ELSE 'BATCH_CREATE_FAILED'::"ImportTaskStatus"
        END,
        retry_count = CASE
          WHEN parse_status = 'RUNNING' AND retry_count < max_retry THEN retry_count + 1
          ELSE retry_count
        END,
        next_retry_at = CASE
          WHEN parse_status = 'RUNNING' AND retry_count < max_retry
            THEN NOW() + ($1 * INTERVAL '1 second')
          ELSE NULL
        END,
        error_code = COALESCE(error_code, 'E_WORKER_STALE'),
        parse_error = COALESCE(
          parse_error,
          CASE
            WHEN parse_status = 'RUNNING' THEN 'Import worker lock stale recovered.'
            ELSE 'Import worker became stale during batch creation.'
          END
        ),
        worker_id = NULL,
        locked_at = NULL,
        finished_at = CASE
          WHEN parse_status = 'RUNNING' AND retry_count < max_retry THEN NULL
          ELSE NOW()
        END
      WHERE parse_status IN ('RUNNING', 'BATCH_CREATING')
        AND locked_at IS NOT NULL
        AND locked_at < NOW() - ($1 * INTERVAL '1 second');
    `,
    [staleSeconds],
  );
};
