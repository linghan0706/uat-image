import { NextRequest } from "next/server";

import { withErrorHandling } from "@/lib/http/handler";
import { getClientIp } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { applyRateLimit } from "@/lib/rate-limit";
import { createExportTask } from "@/services/export.service";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  return withErrorHandling(req, async () => {
    const ip = getClientIp(req);
    applyRateLimit(`batch-jobs:export:${ip}`, 10, 60_000);

    const { jobId } = await context.params;
    const data = await createExportTask(jobId);
    return ok(data, 201);
  });
}

