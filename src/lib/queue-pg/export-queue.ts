import { withTransaction } from "@/lib/db/pg";

export type ClaimedExportFile = {
  id: bigint;
  fileName: string;
  nasObjectKey: string;
  nasProvider: string;
  nasContainer: string;
};

export const claimPendingExportFiles = async (limit: number): Promise<ClaimedExportFile[]> =>
  withTransaction(async (tx) => {
    const result = await tx.query<ClaimedExportFile>(
      `
        WITH candidates AS (
          SELECT id
          FROM export_files
          WHERE status = 'PENDING'
          ORDER BY id
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        UPDATE export_files AS e
        SET
          status = 'RUNNING',
          updated_at = NOW()
        FROM candidates
        WHERE e.id = candidates.id
        RETURNING
          e.id,
          e.file_name AS "fileName",
          e.nas_object_key AS "nasObjectKey",
          e.nas_provider AS "nasProvider",
          e.nas_container AS "nasContainer";
      `,
      [limit],
    );
    return result.rows;
  });
