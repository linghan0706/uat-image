import { parse as parseCsvSync } from "csv-parse/sync";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

import {
  MAX_DOCX_XLSX_FILE_SIZE,
  MAX_PROMPTS_PER_BATCH,
  MAX_SCENE_DESCRIPTION_LENGTH,
  MAX_TXT_LIKE_FILE_SIZE,
} from "@/lib/constants";
import { AppError } from "@/lib/errors";
import {
  isExplicitGender,
  normalizeGender,
  sanitizeCharacterProfile,
  type CharacterProfile,
} from "@/lib/prompt/character-profile";

export type ParsedPrompt = {
  line_no: number;
  prompt: string;
  negative_prompt?: string | null;
  character_name?: string | null;
  ext_params?: Record<string, unknown>;
  prompt_blocks?: { part4?: string | null };
  character_profile?: CharacterProfile | null;
  style_key?: string | null;
  scene_description?: string | null;
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
  scene_description?: string;
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
  const dedupeKey = [
    prompt.character_profile?.name ?? prompt.prompt,
    prompt.scene_description?.trim() ?? "",
  ].join("\u001f");
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
    scene_description?: string | null;
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
      scene_description: normalizeMultiline(candidate.scene_description)?.slice(0, MAX_SCENE_DESCRIPTION_LENGTH) ?? null,
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
    scene_description: "scene_description",
    scenedescription: "scene_description",
    scene: "scene_description",
    background_description: "scene_description",
    backgrounddescription: "scene_description",
    "场景描述": "scene_description",
    "背景描述": "scene_description",
    "环境描述": "scene_description",
    "定妆场景": "scene_description",
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
    const sceneDescription = normalizeMultiline(normalizedRow.scene_description);
    if (sceneDescription && sceneDescription.length > MAX_SCENE_DESCRIPTION_LENGTH) {
      errors.push({
        line_no: lineNo,
        reason: "scene_description_too_long",
        raw: normalizedRow.scene_description ?? "",
      });
      return;
    }

    pushPromptWithDedupe(prompts, existed, dedupe, {
      line_no: lineNo,
      prompt: "",
      negative_prompt: normalizeMultiline(normalizedRow.negative_prompt) ?? null,
      character_name: profile.name,
      ext_params: extParams,
      prompt_blocks: part4 ? { part4 } : undefined,
      character_profile: profile,
      style_key: options?.styleKey ?? null,
      scene_description: sceneDescription ?? null,
    });
  });

  return finalizePromptItems(prompts, sourceType, rows.length, errors);
};

const parseCsv = (rawText: string, dedupe: boolean, options?: ParseOptions): ParseResult => {
  const records = parseCsvSync(rawText, {
    columns: true,
    relax_column_count_less: true,
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

const parseViaClaude = async (
  sourceText: string,
  sourceType: ParseResult["source_type"],
  dedupe: boolean,
  options?: ParseOptions,
): Promise<ParseResult> => {
  const { parseStructuredPromptsWithClaude } = await import("@/services/structured-parse.service");
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

const assertFileSize = (size: number, sourceType: ParseResult["source_type"]) => {
  if (["docx", "xlsx"].includes(sourceType) && size > MAX_DOCX_XLSX_FILE_SIZE) {
    throw new AppError("E_INVALID_PARAM", "File size exceeds 10MB.", 400);
  }
  if (["md", "csv", "txt"].includes(sourceType) && size > MAX_TXT_LIKE_FILE_SIZE) {
    throw new AppError("E_INVALID_PARAM", "Text size exceeds 5MB.", 400);
  }
};

export const parsePromptText = async (text: string, dedupe = false, options?: ParseOptions): Promise<ParseResult> => {
  return parseViaClaude(text, "text", dedupe, options);
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
      return parseViaClaude(text, sourceType, dedupe, options);
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return parseViaClaude(result.value, "docx", dedupe, options);
    }
    default:
      throw new AppError("E_UNSUPPORTED_FILE_TYPE", `Unsupported file type: ${ext}.`, 400);
  }
};
