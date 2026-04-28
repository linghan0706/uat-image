import { NextRequest } from "next/server";

import { withErrorHandling } from "@/lib/http/handler";
import { getClientIp } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { applyRateLimit } from "@/lib/rate-limit";
import { listImageResultsQuerySchema } from "@/lib/validators/batch-job";
import { listImageResultsByBatch } from "@/services/batch-job.service";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  return withErrorHandling(req, async () => {
    const ip = getClientIp(req);
    applyRateLimit(`batch-jobs:images:${ip}`, 120, 60_000);

    const query = listImageResultsQuerySchema.parse({
      page: req.nextUrl.searchParams.get("page") ?? "1",
      page_size: req.nextUrl.searchParams.get("page_size") ?? "30",
    });
    const { jobId } = await context.params;
    const data = await listImageResultsByBatch(jobId, query);
    return ok(data);
  });
}

