import { NextRequest } from "next/server";

import { withErrorHandling } from "@/lib/http/handler";
import { getClientIp } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { applyRateLimit } from "@/lib/rate-limit";
import { retryFailedSchema } from "@/lib/validators/batch-job";
import { retryFailedJobItems } from "@/services/batch-job.service";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  return withErrorHandling(req, async () => {
    const ip = getClientIp(req);
    applyRateLimit(`batch-jobs:retry:${ip}`, 10, 60_000);

    const body = await req.json().catch(() => ({}));
    const parsed = retryFailedSchema.parse(body);
    const { jobId } = await context.params;
    const data = await retryFailedJobItems(jobId, parsed.item_ids);
    return ok(data);
  });
}

