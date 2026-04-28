import { NextRequest, NextResponse } from "next/server";

import { query } from "@/lib/db/pg";
import { AppError } from "@/lib/errors";
import { withErrorHandling } from "@/lib/http/handler";
import { getStorageAdapter } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withErrorHandling(req, async () => {
    const { id } = await context.params;
    const image = await query<{ id: bigint; format: string; nasObjectKey: string; sha256: string }>(
      `
        SELECT
          id,
          format,
          nas_object_key AS "nasObjectKey",
          sha256
        FROM image_results
        WHERE id = $1
        LIMIT 1
      `,
      [BigInt(id)],
    ).then((result) => result.rows[0] ?? null);
    if (!image) {
      throw new AppError("E_JOB_NOT_FOUND", "Image result not found.", 404);
    }

    const etag = `"${image.sha256}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    const storage = getStorageAdapter();
    const buffer = await storage.downloadBuffer(image.nasObjectKey);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": `image/${image.format}`,
        "Content-Disposition": `inline; filename="image_${image.id.toString()}.${image.format}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: etag,
      },
    });
  });
}
