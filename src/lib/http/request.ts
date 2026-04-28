import { nanoid } from "nanoid";
import type { NextRequest } from "next/server";

export const getRequestId = (req: NextRequest) => req.headers.get("x-request-id") ?? nanoid(12);

export const getClientIp = (req: NextRequest) => {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.headers.get("x-real-ip") ?? "unknown";
};

