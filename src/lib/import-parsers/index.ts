import { parse as parseCsvSync } from "csv-parse/sync";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

import {
  MAX_DOCX_XLSX_FILE_SIZE,
  MAX_PROMPTS_PER_BATCH,
  MAX_TXT_LIKE_FILE_SIZE,
} from "@/lib/constants";
import { AppError } from "@/lib/errors";
import {
  isExplicitGender,
  normalizeGender,
  sanitizeCharacterProfile,
  type CharacterProfile,
} from "@/lib/prompt/character-profile";
import { parseStructuredPromptsWithClaude } from "@/services/structured-parse.service";

export type ParsedPrompt = {
  line_no: number;
  prompt: string;
  negative_prompt?: string | null;
  character_name?: string | null;
  ext_params?: Record<string, unknown>;
  prompt_blocks?: { part4?: string | null };
  character_profile?: CharacterProfile | null;
  style_key?: string | null;
};

export type ParseResult = {
  source_type: "text" | "csv" | "xlsx" | "docx" | "md" | "txt";
  raw_count: number;
  valid_count: number;
  invalid_count: number;
  prompts: ParsedPrompt[];
  errors: Array<{ line_no: number; reason: string; raw: string }>;
};

type ParseOptions = {
  parseMode?: "auto" | "local" | "claude";
  capability?: "PORTRAIT" | "THREE_VIEW";
  styleKey?: string | null;
};

type ParsedRowFields = {
  name?: string;
  gender?: string;
  age_band?: string;
  build?: string;
  complexion?: string;
  face?: string;
  hair?: string;
  outfit?: string;
  accessories?: string;
  extra_visual?: string;
  negative_prompt?: string;
  character_name?: string;
  ext_params_json?: string;
  reference_prompt?: string;
  part4?: string;
};

const normalizeMultiline = (value?: string | null) =>
  typeof value === "string"
    ? value
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim() || undefined
    : undefined;

const pushPromptWithDedupe = (
  prompts: ParsedPrompt[],
  existed: Set<string>,
  dedupe: boolean,
  prompt: ParsedPrompt,
) => {
  const dedupeKey = prompt.character_profile?.name ?? prompt.prompt;
  if (dedupe && existed.has(dedupeKey)) {
    return;
  }

  existed.add(dedupeKey);
  prompts.push(prompt);
};

const finalizePromptItems = (
  items: ParsedPrompt[],
  sourceType: ParseResult["source_type"],
  rawCount: number,
  errors: ParseResult["errors"],
): ParseResult => {
  if (items.length > MAX_PROMPTS_PER_BATCH) {
    throw new AppError("E_TOO_MANY_PROMPTS", `Prompt count exceeds ${MAX_PROMPTS_PER_BATCH}.`, 400);
  }

  return {
    source_type: sourceType,
    raw_count: rawCount,
    valid_count: items.length,
    invalid_count: errors.length,
    prompts: items,
    errors,
  };
};

const buildPromptItemsFromCandidates = (
  candidates: Array<{
    character_profile: CharacterProfile;
    part4?: string | null;
    negative_prompt?: string | null;
    ext_params?: Record<string, unknown>;
  }>,
  sourceType: ParseResult["source_type"],
  rawCount: number,
  dedupe: boolean,
  options?: ParseOptions,
): ParseResult => {
  const prompts: ParsedPrompt[] = [];
  const errors: ParseResult["errors"] = [];
  const existed = new Set<string>();

  candidates.forEach((candidate, idx) => {
    const lineNo = idx + 1;
    const profile = candidate.character_profile;
    if (!profile || !profile.name) {
      errors.push({
        line_no: lineNo,
        reason: "missing_character_profile",
        raw: JSON.stringify(candidate),
      });
      return;
    }
    if (!isExplicitGender(profile.gender)) {
      errors.push({
        line_no: lineNo,
        reason: "missing_explicit_gender",
        raw: JSON.stringify(candidate),
      });
      return;
    }

    pushPromptWithDedupe(prompts, existed, dedupe, {
      line_no: lineNo,
      prompt: "", // 最终 prompt 由 PromptEngine 在下游 batch-job.service 组装
      negative_prompt: normalizeMultiline(candidate.negative_prompt) ?? null,
      character_name: profile.name,
      ext_params: candidate.ext_params ?? {},
      prompt_blocks: candidate.part4 ? { part4: candidate.part4 } : undefined,
      character_profile: profile,
      style_key: options?.styleKey ?? null,
    });
  });

  return finalizePromptItems(prompts, sourceType, rawCount, errors);
};

const resolveColumnAlias = (key: string): keyof ParsedRowFields | null => {
  const trimmed = key.replace(/^\ufeff/, "").trim();
  const lowered = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  const condensed = lowered.replace(/_/g, "");

  const aliasMap: Record<string, keyof ParsedRowFields> = {
    name: "name",
    character_name: "character_name",
    charactername: "character_name",
    "角色名": "character_name",
    "角色": "character_name",
    "姓名": "name",
    gender: "gender",
    "性别": "gender",
    age_band: "age_band",
    ageband: "age_band",
    "年龄": "age_band",
    "年龄段": "age_band",
    build: "build",
    "身形": "build",
    "身高体型": "build",
    complexion: "complexion",
    "肤色": "complexion",
    face: "face",
    "面部": "face",
    "脸型": "face",
    hair: "hair",
    "发型": "hair",
    "发色": "hair",
    outfit: "outfit",
    "服装": "outfit",
    "服饰": "outfit",
    accessories: "accessories",
    "配饰": "accessories",
    "道具": "accessories",
    extra_visual: "extra_visual",
    extravisual: "extra_visual",
    "其它特征": "extra_visual",
    "其他特征": "extra_visual",
    negative_prompt: "negative_prompt",
    negativeprompt: "negative_prompt",
    "负向提示词": "negative_prompt",
    "反向提示词": "negative_prompt",
    ext_params_json: "ext_params_json",
    extparamsjson: "ext_params_json",
    "扩展参数": "ext_params_json",
    "扩展参数json": "ext_params_json",
    reference_prompt: "reference_prompt",
    referenceprompt: "reference_prompt",
    "参考提示词": "reference_prompt",
    "参考风格": "reference_prompt",
    part4: "part4",
  };

  return aliasMap[trimmed] ?? aliasMap[lowered] ?? aliasMap[condensed] ?? null;
};

const normalizeRecord = (record: Record<string, unknown>): ParsedRowFields => {
  const normalized: ParsedRowFields = {};

  for (const [key, value] of Object.entries(record)) {
    const alias = resolveColumnAlias(key);
    if (!alias) {
      continue;
    }

    normalized[alias] = typeof value === "string" ? value : String(value ?? "");
  }

  return normalized;
};

const parseRecordRows = (
  rows: Array<Record<string, unknown>>,
  sourceType: "csv" | "xlsx",
  dedupe: boolean,
  options?: ParseOptions,
): ParseResult => {
  const prompts: ParsedPrompt[] = [];
  const errors: ParseResult["errors"] = [];
  const existed = new Set<string>();

  rows.forEach((row, idx) => {
    const lineNo = idx + 2;
    const normalizedRow = normalizeRecord(row);
    const raw = JSON.stringify(row);

    const rawName = normalizedRow.name?.trim() || normalizedRow.character_name?.trim() || "";
    if (!rawName) {
      errors.push({ line_no: lineNo, reason: "missing_character_name", raw });
      return;
    }

    const profile = sanitizeCharacterProfile({
      name: rawName,
      gender: normalizeGender(normalizedRow.gender),
      age_band: normalizedRow.age_band,
      build: normalizedRow.build,
      complexion: normalizedRow.complexion,
      face: normalizedRow.face,
      hair: normalizedRow.hair,
      outfit: normalizedRow.outfit,
      accessories: normalizedRow.accessories,
      extra_visual: normalizedRow.extra_visual,
    });
    if (!profile) {
      errors.push({ line_no: lineNo, reason: "invalid_character_profile", raw });
      return;
    }
    if (!isExplicitGender(profile.gender)) {
      errors.push({ line_no: lineNo, reason: "missing_explicit_gender", raw });
      return;
    }

    let extParams: Record<string, unknown> = {};
    if (normalizedRow.ext_params_json?.trim()) {
      try {
        extParams = JSON.parse(normalizedRow.ext_params_json);
      } catch {
        errors.push({
          line_no: lineNo,
          reason: "invalid_ext_params_json",
          raw: normalizedRow.ext_params_json,
        });
        return;
      }
    }

    const part4 =
      normalizeMultiline(normalizedRow.part4) ?? normalizeMultiline(normalizedRow.reference_prompt);

    pushPromptWithDedupe(prompts, existed, dedupe, {
      line_no: lineNo,
      prompt: "",
      negative_prompt: normalizeMultiline(normalizedRow.negative_prompt) ?? null,
      character_name: profile.name,
      ext_params: extParams,
      prompt_blocks: part4 ? { part4 } : undefined,
      character_profile: profile,
      style_key: options?.styleKey ?? null,
    });
  });

  return finalizePromptItems(prompts, sourceType, rows.length, errors);
};

const parseCsv = (rawText: string, dedupe: boolean, options?: ParseOptions): ParseResult => {
  const records = parseCsvSync(rawText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, unknown>>;

  return parseRecordRows(records, "csv", dedupe, options);
};

const parseXlsx = (buffer: Buffer, dedupe: boolean, options?: ParseOptions): ParseResult => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new AppError("E_PARSE_FAILED", "No worksheet found in xlsx.", 400);
  }

  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  return parseRecordRows(rows, "xlsx", dedupe, options);
};

const shouldUseClaude = (options?: ParseOptions) => options?.parseMode !== "local";

const parseViaClaude = async (
  sourceText: string,
  sourceType: ParseResult["source_type"],
  dedupe: boolean,
  options?: ParseOptions,
): Promise<ParseResult> => {
  const candidates = await parseStructuredPromptsWithClaude({
    sourceText,
    capability: options?.capability ?? "PORTRAIT",
    styleKey: options?.styleKey,
  });
  return buildPromptItemsFromCandidates(
    candidates,
    sourceType,
    sourceText.split(/\r?\n/).length,
    dedupe,
    options,
  );
};

/**
 * 从一行原始文本中派生中文标签式角色名（兜底命名）。
 *
 * 规则：
 * 1. 优先取冒号/破折号前的短片段（常见格式 "林婉：红衣少女"）
 * 2. 只保留中文/字母/数字，去掉所有标点与空格
 * 3. 截取前 8 个字符；若候选为空或剩余长度不足 2，则返回空串由上游判为不可命名
 *
 * 返回空串意味着该行无法派生合理名字，上游应剔除该行而不是用 "角色N" 兜底。
 */
const deriveFallbackName = (line: string): string => {
  const head = line.split(/[:：\-—–]/)[0]?.trim() ?? "";
  const candidate = head || line.trim();
  const cleaned = candidate.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "");
  if (cleaned.length < 2) return "";
  return cleaned.slice(0, 8);
};

const parseFreeTextLocalFallback = (
  rawText: string,
  sourceType: ParseResult["source_type"],
  dedupe: boolean,
  options?: ParseOptions,
): ParseResult => {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const prompts: ParsedPrompt[] = [];
  const errors: ParseResult["errors"] = [];
  const existed = new Set<string>();
  lines.forEach((line, idx) => {
    const name = deriveFallbackName(line);
    if (!name) {
      errors.push({ line_no: idx + 1, reason: "unnameable_line", raw: line });
      return;
    }
    const profile = sanitizeCharacterProfile({
      name,
      gender: normalizeGender(line),
      extra_visual: line,
    });
    // sanitizeCharacterProfile 内部会调用 isPlaceholderName；
    // 若候选名命中占位符模式（如 "角色1"、"NPC1"），profile 为 null，直接剔除该行。
    if (!profile) {
      errors.push({ line_no: idx + 1, reason: "placeholder_name_rejected", raw: line });
      return;
    }
    if (!isExplicitGender(profile.gender)) {
      errors.push({ line_no: idx + 1, reason: "missing_explicit_gender", raw: line });
      return;
    }
    pushPromptWithDedupe(prompts, existed, dedupe, {
      line_no: idx + 1,
      prompt: "",
      character_name: profile.name,
      ext_params: {},
      character_profile: profile,
      style_key: options?.styleKey ?? null,
    });
  });

  return finalizePromptItems(prompts, sourceType, lines.length, errors);
};

const assertFileSize = (size: number, sourceType: ParseResult["source_type"]) => {
  if (["docx", "xlsx"].includes(sourceType) && size > MAX_DOCX_XLSX_FILE_SIZE) {
    throw new AppError("E_INVALID_PARAM", "File size exceeds 10MB.", 400);
  }
  if (["md", "csv", "txt"].includes(sourceType) && size > MAX_TXT_LIKE_FILE_SIZE) {
    throw new AppError("E_INVALID_PARAM", "Text size exceeds 5MB.", 400);
  }
};

export const parsePromptText = async (text: string, dedupe = false, options?: ParseOptions): Promise<ParseResult> => {
  if (shouldUseClaude(options)) {
    return parseViaClaude(text, "text", dedupe, options);
  }
  return parseFreeTextLocalFallback(text, "text", dedupe, options);
};

export const parsePromptFile = async (file: File, dedupe = false, options?: ParseOptions): Promise<ParseResult> => {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !["csv", "xlsx", "docx", "md", "txt"].includes(ext)) {
    throw new AppError("E_UNSUPPORTED_FILE_TYPE", `Unsupported file type: ${ext ?? "unknown"}.`, 400);
  }

  const sourceType = ext as ParseResult["source_type"];
  assertFileSize(file.size, sourceType);

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const text = buffer.toString("utf-8");

  switch (sourceType) {
    case "csv":
      return parseCsv(text, dedupe, options);
    case "xlsx":
      return parseXlsx(buffer, dedupe, options);
    case "md":
    case "txt":
      if (shouldUseClaude(options)) {
        return parseViaClaude(text, sourceType, dedupe, options);
      }
      return parseFreeTextLocalFallback(text, sourceType, dedupe, options);
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      if (shouldUseClaude(options)) {
        return parseViaClaude(result.value, "docx", dedupe, options);
      }
      return parseFreeTextLocalFallback(result.value, "docx", dedupe, options);
    }
    default:
      throw new AppError("E_UNSUPPORTED_FILE_TYPE", `Unsupported file type: ${ext}.`, 400);
  }
};
