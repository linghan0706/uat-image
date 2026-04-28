import { nanoid } from "nanoid";

import { env } from "@/lib/env";
import { recoverStaleImportTasks, claimPendingImportTasks } from "@/lib/queue-pg/import-queue";
import { logger } from "@/lib/logger";
import { sleep } from "@/lib/utils";
import { executeImportTask } from "@/services/import-task.service";

export async function runLoop(signal: AbortSignal) {
  const workerId = `pw_${nanoid(6)}`;
  let lastRecoverAt = 0;

  logger.info({ worker_id: workerId }, "Parse worker started.");

  while (!signal.aborted) {
    try {
      const now = Date.now();
      if (now - lastRecoverAt > 60_000) {
        await recoverStaleImportTasks(env.parseRecoverStaleAfterSec);
        lastRecoverAt = now;
      }

      const tasks = await claimPendingImportTasks(workerId, env.parseWorkerConcurrency);
      if (tasks.length === 0) {
        await sleep(env.parseWorkerPollMs);
        continue;
      }

      await Promise.all(
        tasks.map(async (task) => {
          try {
            await executeImportTask(BigInt(task.id));
          } catch (error) {
            const message = error instanceof Error ? error.message : "unknown";
            logger.error(
              {
                worker_id: workerId,
                task_id: task.id.toString(),
              },
              `Import task failed: ${message}`,
            );
          }
        }),
      );
    } catch (error) {
      logger.error({ worker_id: workerId, err: error }, "Parse worker loop error.");
      await sleep(1000);
    }
  }

  logger.info({ worker_id: workerId }, "Parse worker stopped.");
}

if (!process.env._EMBEDDED_WORKERS) {
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  process.on("SIGTERM", () => controller.abort());

  runLoop(controller.signal).catch((error) => {
    logger.error({ err: error }, "Parse worker fatal error.");
    process.exit(1);
  });
}
