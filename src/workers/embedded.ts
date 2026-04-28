import { logger } from "@/lib/logger";

export async function startEmbeddedWorkers() {
  // 标记嵌入模式，防止 worker 模块的自启动代码执行
  process.env._EMBEDDED_WORKERS = "1";

  const [
    { runLoop: runParseLoop },
    { runLoop: runGenerateLoop },
    { runLoop: runExportLoop },
  ] = await Promise.all([
    import("@/workers/parse-worker"),
    import("@/workers/generate-worker"),
    import("@/workers/export-worker"),
  ]);

  const controller = new AbortController();
  process.on("SIGTERM", () => controller.abort());
  process.on("SIGINT", () => controller.abort());

  logger.info("Starting embedded workers...");
  runParseLoop(controller.signal).catch(console.error);
  runGenerateLoop(controller.signal).catch(console.error);
  runExportLoop(controller.signal).catch(console.error);
}
