import type { FunctionalCapability } from "@/lib/api/image-workflow.types";

export const MAX_PROMPTS_PER_BATCH = 1000;
export const MAX_PROMPT_LENGTH = 4000;
export const MAX_SCENE_DESCRIPTION_LENGTH = 800;
export const MAX_TXT_LIKE_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_DOCX_XLSX_FILE_SIZE = 10 * 1024 * 1024;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const JOB_ITEM_MAX_RETRY = 3;

export const STATUS_TERMINAL = ["SUCCESS", "FAILED", "PARTIAL_SUCCESS", "EXPORTED"] as const;
export const ACTIVE_BATCH_STATUSES = new Set(["PENDING", "QUEUED", "RUNNING", "EXPORTING"]);
export const COMPLETED_BATCH_STATUSES = new Set(["SUCCESS", "PARTIAL_SUCCESS", "EXPORTED"]);
export const FAILED_BATCH_STATUSES = new Set(["FAILED"]);

export const CAPABILITY_DISPLAY: Record<string, string> = {
  PORTRAIT: "定妆照",
  THREE_VIEW: "三视图",
  SCENE_CONCEPT: "场景概念图",
};

export const CAPABILITY_OPTIONS: Array<{ value: FunctionalCapability; label: string; desc: string }> = [
  { value: "PORTRAIT", label: "定妆照", desc: "生成角色定妆照" },
  { value: "THREE_VIEW", label: "三视图", desc: "生成角色三视图" },
];

export const TERMINAL_BATCH_STATUSES = new Set([...COMPLETED_BATCH_STATUSES, ...FAILED_BATCH_STATUSES]);
export const TERMINAL_IMPORT_STATUSES = new Set(["PARSE_SUCCESS", "PARSE_FAILED", "BATCH_CREATED", "BATCH_CREATE_FAILED"]);
