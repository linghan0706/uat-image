import { NextRequest } from "next/server";

import type { Capability } from "@/lib/db/types";
import { withErrorHandling } from "@/lib/http/handler";
import { getClientIp } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { applyRateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import type { ModelCapability } from "@/lib/model-providers/types";
import { ensureBootstrapped } from "@/services/bootstrap.service";
import { listFrontSelectableModels } from "@/services/model-config.service";

export const runtime = "nodejs";

const providerCapabilityFor = (capability: Capability): ModelCapability | undefined => {
  if (capability === "THREE_VIEW") return "IMAGE_TO_IMAGE";
  if (capability === "PORTRAIT") return "TEXT_TO_IMAGE";
  return undefined;
};

export async function GET(req: NextRequest) {
  return withErrorHandling(req, async () => {
    const ip = getClientIp(req);
    applyRateLimit(`model-options:${ip}`, 120, 60_000);
    await ensureBootstrapped();

    const capability = req.nextUrl.searchParams.get("capability");
    if (!capability || !["PORTRAIT", "THREE_VIEW", "SCENE_CONCEPT"].includes(capability)) {
      throw new AppError("E_INVALID_PARAM", "Invalid capability.", 400);
    }
    const cap = capability as Capability;
    const models = await listFrontSelectableModels(cap, providerCapabilityFor(cap));
    return ok({ capability, models });
  });
}
