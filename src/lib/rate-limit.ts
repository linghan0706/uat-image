import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export const applyRateLimit = (key: string, limit: number, windowMs: number) => {
  if (!env.rateLimitEnabled) {
    return;
  }

  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (current.count >= limit) {
    throw new AppError("E_RATE_LIMITED", "Rate limit exceeded.", 429);
  }

  current.count += 1;
  buckets.set(key, current);
};

