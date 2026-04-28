import { NextRequest } from "next/server";

import { withErrorHandling } from "@/lib/http/handler";
import { getClientIp } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { applyRateLimit } from "@/lib/rate-limit";
import { getImportTaskDetail } from "@/services/import-task.service";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  return withErrorHandling(req, async () => {
    const ip = getClientIp(req);
    applyRateLimit(`import:parse:detail:${ip}`, 120, 60_000);

    const { taskId } = await context.params;
    const data = await getImportTaskDetail(taskId);
    return ok(data);
  });
}
