import "@/lib/load-env";
import { nanoid } from "nanoid";

import { env } from "@/lib/env";
import { claimPendingJobItems, recoverStaleRunningItems, expireTimedOutJobItems } from "@/lib/queue-pg/job-item-queue";
import { logger } from "@/lib/logger";
import { sleep } from "@/lib/utils";
import { executeJobItem } from "@/services/generate.service";
import { refreshBatchJobAggregate } from "@/services/batch-job.service";

export async function runLoop(signal: AbortSignal) {
  const workerId = `gw_${nanoid(6)}`;
  let lastRecoverAt = 0;
  let lastExpireAt = 0;

  logger.info({ worker_id: workerId }, "Generate worker started.");

  while (!signal.aborted) {
    try {
      const now = Date.now();
      if (now - lastRecoverAt > 60_000) {
        await recoverStaleRunningItems(env.recoverStaleAfterSec);
        lastRecoverAt = now;
      }

      if (now - lastExpireAt > 300_000) {
        try {
          const expiredBatchIds = await expireTimedOutJobItems(env.taskExpireAfterSec);
          for (const batchJobId of expiredBatchIds) {
            await refreshBatchJobAggregate(batchJobId);
          }
          if (expiredBatchIds.length > 0) {
            logger.info(
              { worker_id: workerId, expired_batch_count: expiredBatchIds.length },
              "Expired timed-out job items.",
            );
          }
        } catch (error) {
          logger.error({ worker_id: workerId, err: error }, "Expire timed-out items error.");
        }
        lastExpireAt = now;
      }

      const items = await claimPendingJobItems(workerId, env.workerConcurrency);
      if (items.length === 0) {
        await sleep(env.workerPollMs);
        continue;
      }

      await Promise.all(
        items.map(async (item) => {
          try {
            await executeJobItem(BigInt(item.id));
          } catch (error) {
            const message = error instanceof Error ? error.message : "unknown";
            logger.error(
              {
                worker_id: workerId,
                item_id: item.id.toString(),
              },
              `Job item failed: ${message}`,
            );
          }
        }),
      );
    } catch (error) {
      logger.error({ worker_id: workerId, err: error }, "Generate worker loop error.");
      await sleep(1000);
    }
  }

  logger.info({ worker_id: workerId }, "Generate worker stopped.");
}

if (!process.env._EMBEDDED_WORKERS) {
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  process.on("SIGTERM", () => controller.abort());

  runLoop(controller.signal).catch((error) => {
    logger.error({ err: error }, "Generate worker fatal error.");
    process.exit(1);
  });
}
