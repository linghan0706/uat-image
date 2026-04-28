export class AppError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const errorCatalog = {
  E_INVALID_PARAM: { status: 400, message: "Invalid request parameters." },
  E_UNSUPPORTED_FILE_TYPE: { status: 400, message: "Unsupported file type." },
  E_PARSE_FAILED: { status: 400, message: "File parse failed." },
  E_TOO_MANY_PROMPTS: { status: 400, message: "Too many prompts in one batch." },
  E_PROMPT_TOO_LONG: { status: 400, message: "Prompt is too long." },
  E_MODEL_NOT_ALLOWED: { status: 400, message: "Model is not allowed for this capability." },
  E_RATE_LIMITED: { status: 429, message: "Too many requests." },
  E_JOB_NOT_FOUND: { status: 404, message: "Job not found." },
  E_PROVIDER_TIMEOUT: { status: 504, message: "Model provider timeout." },
  E_NAS_UNAVAILABLE: { status: 503, message: "NAS is unavailable." },
  E_INTERNAL: { status: 500, message: "Internal server error." },
} as const;

export type ErrorCode = keyof typeof errorCatalog;

export const toAppError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError("E_INTERNAL", error.message, 500);
  }

  return new AppError("E_INTERNAL", "Unknown error", 500);
};

