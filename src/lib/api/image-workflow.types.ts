export type Capability = "PORTRAIT" | "THREE_VIEW" | "SCENE_CONCEPT";
export type FunctionalCapability = "PORTRAIT" | "THREE_VIEW";
export type PortraitBackgroundMode = "studio" | "scene";
export type ImportTaskSubmitMode = "PARSE_ONLY" | "CREATE_BATCH";

export type PromptSourceMode = "template";

export type PromptBlocks = {
  source_mode?: PromptSourceMode;
  /** Snapshot-only: ignored when submitted by clients. */
  part1?: string | null;
  /** Snapshot-only: ignored when submitted by clients. */
  part2?: string | null;
  /** Snapshot-only: ignored when submitted by clients. */
  part3?: string | null;
  /** User-provided low-priority reference words for PORTRAIT only. */
  part4?: string | null;
  /** Snapshot-only: concrete scene background used by PORTRAIT scene mode. */
  scene_description?: string | null;
  style_key?: string | null;
};

export type CharacterProfile = {
  name: string;
  gender: "male" | "female" | "nonbinary" | "unknown";
  age_band?: string | null;
  build?: string | null;
  complexion?: string | null;
  face?: string | null;
  hair?: string | null;
  outfit?: string | null;
  accessories?: string | null;
  extra_visual?: string | null;
};

export type PromptRow = {
  line_no: number;
  prompt: string;
  negative_prompt?: string | null;
  character_name?: string | null;
  ext_params?: Record<string, unknown>;
  prompt_blocks?: PromptBlocks;
  character_profile?: CharacterProfile | null;
  style_key?: string | null;
  scene_description?: string | null;
};

export type BatchJob = {
  id: string;
  job_no: string;
  task_name: string | null;
  folder_name?: string | null;
  capability: Capability;
  status: string;
  total_count: number;
  success_count: number;
  failed_count: number;
  created_at: string;
  finished_at: string | null;
};

export type JobItem = {
  id: string;
  item_no: string;
  line_no: number;
  prompt: string;
  source_mode: PromptSourceMode;
  prompt_blocks: PromptBlocks | null;
  character_name: string | null;
  character_profile?: CharacterProfile | null;
  style_key?: string | null;
  scene_description?: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  source_portrait_id: string | null;
};

export type ImageResult = {
  id: string;
  job_item_id: string;
  capability: Capability;
  variant_index: number;
  format: string;
  width: number;
  height: number;
  file_size: string;
  access_url: string | null;
  download_url: string;
  is_selected_portrait: boolean;
  selected_at: string | null;
  created_at: string;
};

export type JobDetail = {
  id: string;
  job_no: string;
  task_name: string | null;
  folder_name?: string | null;
  capability: Capability;
  status: string;
  source_type: string;
  total_count: number;
  success_count: number;
  failed_count: number;
  params_snapshot: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  export_status: string;
  export_file: {
    id: string;
    status: string;
    file_name: string;
    access_url: string | null;
    download_url: string;
    error_message: string | null;
  } | null;
};

export type ParseResult = {
  source_type: "text" | "csv" | "xlsx" | "docx" | "md" | "txt";
  raw_count: number;
  valid_count: number;
  invalid_count: number;
  prompts: PromptRow[];
  errors: Array<{ line_no: number; reason: string; raw: string }>;
};

export type ImportTaskDetail = {
  id: string;
  status: string;
  submit_mode: ImportTaskSubmitMode;
  file_name: string;
  file_type: string;
  file_size: string;
  batch_job_id: string | null;
  result_payload: ParseResult | null;
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
  max_retry: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type ModelOption = {
  modelKey: string;
  isDefault: boolean;
};

type BaseCreateBatchJobPayload = {
  task_name?: string;
  folder_name: string;
  source_type: ParseResult["source_type"];
  dedupe: boolean;
  params: Record<string, unknown>;
  style_key?: string | null;
};

export type CreatePortraitBatchJobPayload = BaseCreateBatchJobPayload & {
  capability: "PORTRAIT";
  prompts: PromptRow[];
  source_portrait_ids?: never;
};

export type CreateThreeViewBatchJobPayload = BaseCreateBatchJobPayload & {
  capability: "THREE_VIEW";
  prompts?: [];
  source_portrait_ids: string[];
};

export type CreateBatchJobPayload = CreatePortraitBatchJobPayload | CreateThreeViewBatchJobPayload;

export type CreateImportTaskResponse = {
  import_task_id: string;
  status: string;
  submit_mode: ImportTaskSubmitMode;
};
