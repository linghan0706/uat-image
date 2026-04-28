import "@/lib/load-env";
import { nanoid } from "nanoid";

import { env } from "@/lib/env";
import { claimPendingExportFiles } from "@/lib/queue-pg/export-queue";
import { logger } from "@/lib/logger";
import { sleep } from "@/lib/utils";
import { executeExportFile } from "@/services/export-runner.service";

export async function runLoop(signal: AbortSignal) {
  const workerId = `ew_${nanoid(6)}`;

  logger.info({ worker_id: workerId }, "Export worker started.");

  while (!signal.aborted) {
    try {
      const exportFiles = await claimPendingExportFiles(2);
      if (exportFiles.length === 0) {
        await sleep(env.workerPollMs);
        continue;
      }

      for (const exportFile of exportFiles) {
        await executeExportFile(BigInt(exportFile.id));
      }
    } catch (error) {
      logger.error({ worker_id: workerId, err: error }, "Export worker loop error.");
      await sleep(1000);
    }
  }

  logger.info({ worker_id: workerId }, "Export worker stopped.");
}

if (!process.env._EMBEDDED_WORKERS) {
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  process.on("SIGTERM", () => controller.abort());

  runLoop(controller.signal).catch((error) => {
    logger.error({ err: error }, "Export worker fatal error.");
    process.exit(1);
  });
}
