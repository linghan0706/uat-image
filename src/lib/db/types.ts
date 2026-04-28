export const CAPABILITIES = ["PORTRAIT", "THREE_VIEW", "SCENE_CONCEPT"] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const BATCH_JOB_STATUSES = [
  "PENDING",
  "QUEUED",
  "RUNNING",
  "PARTIAL_SUCCESS",
  "SUCCESS",
  "FAILED",
  "EXPORTING",
  "EXPORTED",
] as const;
export type BatchJobStatus = (typeof BATCH_JOB_STATUSES)[number];

export const JOB_ITEM_STATUSES = ["PENDING", "RUNNING", "SUCCESS", "FAILED", "RETRYING"] as const;
export type JobItemStatus = (typeof JOB_ITEM_STATUSES)[number];

export const EXPORT_STATUSES = ["IDLE", "PENDING", "RUNNING", "SUCCESS", "FAILED"] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export const IMPORT_TASK_STATUSES = [
  "QUEUED",
  "RUNNING",
  "PARSE_SUCCESS",
  "PARSE_FAILED",
  "BATCH_CREATING",
  "BATCH_CREATED",
  "BATCH_CREATE_FAILED",
] as const;
export type ImportTaskStatus = (typeof IMPORT_TASK_STATUSES)[number];

export const IMPORT_SUBMIT_MODES = ["PARSE_ONLY", "CREATE_BATCH"] as const;
export type ImportSubmitMode = (typeof IMPORT_SUBMIT_MODES)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export type BatchJobRecord = {
  id: bigint;
  jobNo: string;
  taskName: string | null;
  folderName: string;
  capability: Capability;
  status: BatchJobStatus;
  sourceType: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  paramsSnapshot: JsonValue;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  exportStatus: ExportStatus;
  exportFileId: bigint | null;
  styleKey: string | null;
};

export type JobItemRecord = {
  id: bigint;
  batchJobId: bigint;
  itemNo: string;
  lineNo: number;
  prompt: string;
  promptBlocks: JsonValue | null;
  negativePrompt: string | null;
  modelKey: string;
  status: JobItemStatus;
  retryCount: number;
  maxRetry: number;
  nextRetryAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  runParams: JsonValue;
  sourcePortraitId: bigint | null;
  workerId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  lockedAt: Date | null;
  characterName: string | null;
  characterProfile: JsonValue | null;
  styleKey: string | null;
  sceneDescription: string | null;
};

export type ImageResultRecord = {
  id: bigint;
  batchJobId: bigint;
  jobItemId: bigint;
  capability: Capability;
  variantIndex: number;
  format: string;
  width: number;
  height: number;
  fileSize: bigint;
  sha256: string;
  nasProvider: string;
  nasContainer: string;
  nasObjectKey: string;
  accessUrl: string | null;
  isSelectedPortrait: boolean;
  selectedAt: Date | null;
  createdAt: Date;
};

export type ModelConfigRecord = {
  id: bigint;
  modelKey: string;
  capability: Capability;
  provider: string;
  endpoint: string;
  enabled: boolean;
  isDefault: boolean;
  allowFrontSelect: boolean;
  defaultParams: JsonValue;
  timeoutSec: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SystemConfigRecord = {
  configKey: string;
  configValue: JsonValue;
  description: string | null;
  updatedAt: Date;
};

export type ImportFileRecord = {
  id: bigint;
  batchJobId: bigint | null;
  fileName: string;
  fileType: string;
  fileSize: bigint;
  status: ImportTaskStatus;
  submitMode: ImportSubmitMode;
  resultPayload: JsonValue | null;
  batchPayload: JsonValue | null;
  sourceText: string | null;
  sourceFileBytes: Buffer | null;
  retryCount: number;
  maxRetry: number;
  nextRetryAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  workerId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  lockedAt: Date | null;
};

export type ExportFileRecord = {
  id: bigint;
  status: ExportStatus;
  fileName: string;
  fileSize: bigint | null;
  nasProvider: string;
  nasContainer: string;
  nasObjectKey: string;
  accessUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};
