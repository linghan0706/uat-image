import { NextRequest, NextResponse } from "next/server";

import { query } from "@/lib/db/pg";
import { AppError } from "@/lib/errors";
import { withErrorHandling } from "@/lib/http/handler";
import { getStorageAdapter } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withErrorHandling(req, async () => {
    const { id } = await context.params;
    const exportFile = await query<{ fileName: string; nasObjectKey: string }>(
      `
        SELECT
          file_name AS "fileName",
          nas_object_key AS "nasObjectKey"
        FROM export_files
        WHERE id = $1
        LIMIT 1
      `,
      [BigInt(id)],
    ).then((result) => result.rows[0] ?? null);
    if (!exportFile) {
      throw new AppError("E_JOB_NOT_FOUND", "Export file not found.", 404);
    }

    const storage = getStorageAdapter();
    const buffer = await storage.downloadBuffer(exportFile.nasObjectKey);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${exportFile.fileName}"`,
      },
    });
  });
}
