import { NextRequest } from "next/server";

import { withErrorHandling } from "@/lib/http/handler";
import { getClientIp } from "@/lib/http/request";
import { ok } from "@/lib/http/response";
import { applyRateLimit } from "@/lib/rate-limit";
import { DEFAULT_STYLE_KEY, listStylePresets } from "@/lib/prompt/layers/style-registry";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withErrorHandling(req, async () => {
    const ip = getClientIp(req);
    applyRateLimit(`style-presets:${ip}`, 120, 60_000);

    const presets = listStylePresets().map((preset) => ({
      key: preset.key,
      label: preset.label,
      category: preset.category,
      brief: preset.art_director_brief,
    }));
    return ok({ default_key: DEFAULT_STYLE_KEY, presets });
  });
}
