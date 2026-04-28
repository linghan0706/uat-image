import type { NextRequest } from "next/server";

import { toAppError } from "@/lib/errors";
import { getRequestId } from "@/lib/http/request";
import { fail } from "@/lib/http/response";
import { logger } from "@/lib/logger";

export const withErrorHandling = async <T>(
  req: NextRequest,
  fn: (requestId: string) => Promise<T>,
) => {
  const requestId = getRequestId(req);
  try {
    return await fn(requestId);
  } catch (error) {
    const appError = toAppError(error);
    logger.error(
      {
        request_id: requestId,
        code: appError.code,
        details: appError.details,
      },
      appError.message,
    );
    return fail(appError.code, appError.message, requestId, appError.status, appError.details);
  }
};

