import { NextRequest } from "next/server";

import { withErrorHandling } from "@/lib/http/handler";
import { getClientIp } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { applyRateLimit } from "@/lib/rate-limit";
import { getBatchJobDetail } from "@/services/batch-job.service";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  return withErrorHandling(req, async () => {
    const ip = getClientIp(req);
    applyRateLimit(`batch-jobs:detail:${ip}`, 120, 60_000);

    const { jobId } = await context.params;
    const data = await getBatchJobDetail(jobId);
    return ok(data);
  });
}

