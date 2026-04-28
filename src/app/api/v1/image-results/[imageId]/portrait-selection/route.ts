import { NextRequest } from "next/server";

import { AppError } from "@/lib/errors";
import { withErrorHandling } from "@/lib/http/handler";
import { getClientIp } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { applyRateLimit } from "@/lib/rate-limit";
import { updatePortraitSelectionSchema } from "@/lib/validators/batch-job";
import { updatePortraitSelection } from "@/services/batch-job.service";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, context: { params: Promise<{ imageId: string }> }) {
  return withErrorHandling(req, async () => {
    const ip = getClientIp(req);
    applyRateLimit(`image-results:portrait-selection:${ip}`, 60, 60_000);

    const payload = await req.json().catch(() => {
      throw new AppError("E_INVALID_PARAM", "Invalid JSON body.", 400);
    });
    const parsed = updatePortraitSelectionSchema.parse(payload);
    const { imageId } = await context.params;
    const data = await updatePortraitSelection(imageId, parsed.selected);
    return ok(data);
  });
}
