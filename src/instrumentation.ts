export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.DISABLE_EMBEDDED_WORKERS === "true") return;

  // 动态 import 避免 Edge Runtime 静态分析报错
  const { startEmbeddedWorkers } = await import("@/workers/embedded");
  await startEmbeddedWorkers();
}
