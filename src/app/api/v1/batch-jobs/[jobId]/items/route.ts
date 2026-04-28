import { NextRequest } from "next/server";

import { withErrorHandling } from "@/lib/http/handler";
import { getClientIp } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { applyRateLimit } from "@/lib/rate-limit";
import { listJobItemsQuerySchema } from "@/lib/validators/batch-job";
import { listJobItemsByBatch } from "@/services/batch-job.service";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  return withErrorHandling(req, async () => {
    const ip = getClientIp(req);
    applyRateLimit(`batch-jobs:items:${ip}`, 120, 60_000);

    const query = listJobItemsQuerySchema.parse({
      status: req.nextUrl.searchParams.get("status") ?? undefined,
      keyword: req.nextUrl.searchParams.get("keyword") ?? undefined,
      page: req.nextUrl.searchParams.get("page") ?? "1",
      page_size: req.nextUrl.searchParams.get("page_size") ?? "20",
    });
    const { jobId } = await context.params;
    const data = await listJobItemsByBatch(jobId, query);
    return ok(data);
  });
}

