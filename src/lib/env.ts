const must = (key: string, fallback?: string) => {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  appEnv: process.env.APP_ENV ?? "dev",
  nasProvider: process.env.NAS_PROVIDER ?? "synology",
  nasBucket: process.env.NAS_BUCKET ?? "images",
  nasPrefix: process.env.NAS_PREFIX ?? "app",
  localNasRoot: process.env.LOCAL_NAS_ROOT ?? ".local-nas",
  localTempRoot: process.env.LOCAL_TEMP_ROOT ?? ".tmp",
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
  workerPollMs: Number(process.env.WORKER_POLL_MS ?? 1000),
  recoverStaleAfterSec: Number(process.env.RECOVER_STALE_AFTER_SEC ?? 300),
  taskExpireAfterSec: Number(process.env.TASK_EXPIRE_AFTER_SEC ?? 86400),
  parseWorkerConcurrency: Number(process.env.PARSE_WORKER_CONCURRENCY ?? process.env.WORKER_CONCURRENCY ?? 2),
  parseWorkerPollMs: Number(process.env.PARSE_WORKER_POLL_MS ?? process.env.WORKER_POLL_MS ?? 1000),
  parseRecoverStaleAfterSec: Number(
    process.env.PARSE_RECOVER_STALE_AFTER_SEC ?? process.env.RECOVER_STALE_AFTER_SEC ?? 300,
  ),
  modelProvider: process.env.MODEL_PROVIDER ?? "mock",
  modelApiKey: process.env.MODEL_API_KEY ?? "",
  modelApiBase: process.env.MODEL_API_BASE ?? "",
  skyModelUrl: process.env.SKY_MODEL_URL ?? "",
  skyModelApiKey: process.env.SKY_MODEL_API_KEY ?? "",
  skyModelPublicKeyPath: process.env.SKY_MODEL_PUBLIC_KEY_PATH ?? "",
  skyModelPublicKeyPem: process.env.SKY_MODEL_PUBLIC_KEY_PEM ?? "",
  skyModelPrivateKeyPath: process.env.SKY_MODEL_PRIVATE_KEY_PATH ?? "",
  skyModelPrivateKeyPem: process.env.SKY_MODEL_PRIVATE_KEY_PEM ?? "",
  skyModelAuthHeader: process.env.SKY_MODEL_AUTH_HEADER ?? "Authorization",
  skyModelSignatureHeader: process.env.SKY_MODEL_SIGNATURE_HEADER ?? "X-SKY-SIGNATURE",
  skyModelTimestampHeader: process.env.SKY_MODEL_TIMESTAMP_HEADER ?? "X-SKY-TIMESTAMP",
  skyModelReqIdHeader: process.env.SKY_MODEL_REQ_ID_HEADER ?? "X-REQUEST-ID",
  skyModelGeneratePathPortrait:
    process.env.SKY_MODEL_GENERATE_PATH_PORTRAIT ?? process.env.SKY_COVER_GENERATE_PATH ?? "/api/v1/gemini/generate_images",
  skyModelGeneratePathThreeView:
    process.env.SKY_MODEL_GENERATE_PATH_THREE_VIEW ?? process.env.SKY_COVER_GENERATE_PATH ?? "/api/v1/gemini/generate_images",
  skyModelGeneratePathScene:
    process.env.SKY_MODEL_GENERATE_PATH_SCENE ?? process.env.SKY_COVER_GENERATE_PATH ?? "/api/v1/gemini/generate_images",
  // 文生图模型名（兼容用户习惯的 .env 小写 key）
  skyTextToImageModelMj: process.env.SKY_TEXT_TO_IMAGE_MODEL_MJ ?? process.env.mj ?? "midj_default",
  skyTextToImageModelNanoBanana:
    process.env.SKY_TEXT_TO_IMAGE_MODEL_NANO_BANANA ?? process.env.nanoBanana ?? "Nano Banana Pro",
  skyTextToImageChannelMj: process.env.SKY_TEXT_TO_IMAGE_CHANNEL_MJ ?? "mj",
  skyTextToImageChannelNanoBanana: process.env.SKY_TEXT_TO_IMAGE_CHANNEL_NANO_BANANA ?? "gemini",
  // 文生图模型专属请求路径
  skyModelGeneratePathMj: process.env.SKY_MODEL_GENERATE_PATH_MJ ?? "/api/v1/generate_images",
  skyModelGeneratePathNanoBanana:
    process.env.SKY_MODEL_GENERATE_PATH_NANO_BANANA ??
    process.env.SKY_COVER_GENERATE_PATH ??
    "/api/v1/gemini/generate_images",
  skyModelGeneratePathImageToImage: process.env.SKY_MODEL_GENERATE_PATH_IMAGE_TO_IMAGE ?? "/api/v1/generate_images",
  skyModelTimeoutMs: Number(process.env.SKY_MODEL_TIMEOUT_MS ?? 120000),
  structuredParseEnabled: (process.env.STRUCTURED_PARSE_ENABLED ?? "false") === "true",
  structuredParseProvider: process.env.STRUCTURED_PARSE_PROVIDER ?? "claude",
  structuredParseModel: process.env.STRUCTURED_PARSE_MODEL ?? "claude-4-6-opus",
  structuredParseChannel: process.env.STRUCTURED_PARSE_CHANNEL ?? "aws",
  structuredParsePath: process.env.STRUCTURED_PARSE_PATH ?? "/api/v1/generate_content",
  structuredParseTimeoutMs: Number(process.env.STRUCTURED_PARSE_TIMEOUT_MS ?? 300000),
  structuredParseMaxInputChars: Number(process.env.STRUCTURED_PARSE_MAX_INPUT_CHARS ?? 12000),
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3Region: process.env.S3_REGION ?? "us-east-1",
  s3AccessKey: process.env.S3_ACCESS_KEY ?? "",
  s3SecretKey: process.env.S3_SECRET_KEY ?? "",
  webdavEndpoint: process.env.WEBDAV_ENDPOINT ?? "",
  webdavUsername: process.env.WEBDAV_USERNAME ?? "",
  webdavPassword: process.env.WEBDAV_PASSWORD ?? "",
  synologyBaseUrl: process.env.SYNOLOGY_BASE_URL ?? "",
  synologyUsername: process.env.SYNOLOGY_USERNAME ?? "",
  synologyPassword: process.env.SYNOLOGY_PASSWORD ?? "",
  synologySession: process.env.SYNOLOGY_SESSION ?? "FileStation",
  synologyShareRoot: process.env.SYNOLOGY_SHARE_ROOT ?? "/",
  webBaseUrl: process.env.WEB_BASE_URL ?? "http://localhost:3000",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 15000),
  dbPoolMax: Number(process.env.DB_POOL_MAX ?? (process.env.NODE_ENV === "production" ? 5 : 10)),
  dbConnectTimeoutMs: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? process.env.REQUEST_TIMEOUT_MS ?? 15000),
  dbQueryTimeoutMs: Number(process.env.DB_QUERY_TIMEOUT_MS ?? process.env.REQUEST_TIMEOUT_MS ?? 15000),
  defaultModelTimeoutSec: Number(process.env.DEFAULT_MODEL_TIMEOUT_SEC ?? 90),
  rateLimitEnabled: (process.env.RATE_LIMIT_ENABLED ?? "true") === "true",
};

export const requireDatabaseUrl = () => must("DATABASE_URL");
