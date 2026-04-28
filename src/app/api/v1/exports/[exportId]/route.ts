import { NextRequest } from "next/server";

import { withErrorHandling } from "@/lib/http/handler";
import { getClientIp } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { applyRateLimit } from "@/lib/rate-limit";
import { getExportById } from "@/services/export.service";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ exportId: string }> }) {
  return withErrorHandling(req, async () => {
    const ip = getClientIp(req);
    applyRateLimit(`exports:detail:${ip}`, 120, 60_000);

    const { exportId } = await context.params;
    const data = await getExportById(exportId);
    return ok(data);
  });
}

