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
  deriveCharacterNameFromText,
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

type ParsedFieldEntry = {
  lineNo: number;
  fields: ParsedRowFields;
  raw: string;
  extParams?: Record<string, unknown>;
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

const hasKnownField = (fields: ParsedRowFields) =>
  Object.values(fields).some((value) => typeof value === "string" && value.trim().length > 0);

const appendFieldValue = (
  target: ParsedRowFields,
  field: keyof ParsedRowFields,
  value: string | undefined | null,
) => {
  const normalized = normalizeMultiline(value);
  if (!normalized) {
    return;
  }

  const current = target[field];
  target[field] = current ? `${current}\n${normalized}` : normalized;
};

const parseFieldEntries = (
  entries: ParsedFieldEntry[],
  sourceType: ParseResult["source_type"],
  dedupe: boolean,
  options?: ParseOptions,
  rawCount = entries.length,
): ParseResult => {
  const prompts: ParsedPrompt[] = [];
  const errors: ParseResult["errors"] = [];
  const existed = new Set<string>();

  entries.forEach((entry) => {
    const lineNo = entry.lineNo;
    const normalizedRow = entry.fields;
    const raw = entry.raw;

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

    let extParams: Record<string, unknown> = entry.extParams ?? {};
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

  return finalizePromptItems(prompts, sourceType, rawCount, errors);
};

const parseRecordRows = (
  rows: Array<Record<string, unknown>>,
  sourceType: ParseResult["source_type"],
  dedupe: boolean,
  options?: ParseOptions,
): ParseResult => {
  const entries = rows.map((row, idx): ParsedFieldEntry => ({
    lineNo: idx + 2,
    fields: normalizeRecord(row),
    raw: JSON.stringify(row),
  }));

  return parseFieldEntries(entries, sourceType, dedupe, options, rows.length);
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

const stripMarkdownPrefix = (line: string) =>
  line
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^>\s*/, "")
    .replace(/^(?:[-*+]\s+|\d+[.)、]\s*)/, "")
    .trim();

const parseKeyValueLine = (line: string): { field: keyof ParsedRowFields; value: string } | null => {
  const cleaned = stripMarkdownPrefix(line);
  const match = cleaned.match(/^([^:：=]+?)\s*[:：=]\s*([\s\S]*)$/u);
  if (!match?.[1]) {
    return null;
  }

  const field = resolveColumnAlias(match[1]);
  if (!field) {
    return null;
  }

  return { field, value: match[2]?.trim() ?? "" };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const objectToOptionalString = (value: unknown) =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : undefined;

const buildEntryFromJsonRecord = (
  record: Record<string, unknown>,
  index: number,
): ParsedFieldEntry | null => {
  const fields = normalizeRecord(record);
  const profile = isRecord(record.character_profile) ? record.character_profile : null;

  if (profile) {
    appendFieldValue(fields, "name", objectToOptionalString(profile.name));
    appendFieldValue(fields, "gender", objectToOptionalString(profile.gender));
    appendFieldValue(fields, "age_band", objectToOptionalString(profile.age_band));
    appendFieldValue(fields, "build", objectToOptionalString(profile.build));
    appendFieldValue(fields, "complexion", objectToOptionalString(profile.complexion));
    appendFieldValue(fields, "face", objectToOptionalString(profile.face));
    appendFieldValue(fields, "hair", objectToOptionalString(profile.hair));
    appendFieldValue(fields, "outfit", objectToOptionalString(profile.outfit));
    appendFieldValue(fields, "accessories", objectToOptionalString(profile.accessories));
    appendFieldValue(fields, "extra_visual", objectToOptionalString(profile.extra_visual));
  }

  if (isRecord(record.prompt_blocks)) {
    appendFieldValue(fields, "part4", objectToOptionalString(record.prompt_blocks.part4));
    appendFieldValue(
      fields,
      "scene_description",
      objectToOptionalString(record.prompt_blocks.scene_description),
    );
  }

  if (!hasKnownField(fields)) {
    appendFieldValue(fields, "extra_visual", objectToOptionalString(record.prompt));
  }

  const extParams = isRecord(record.ext_params) ? record.ext_params : undefined;
  if (!hasKnownField(fields) && !extParams) {
    return null;
  }

  return {
    lineNo: index + 1,
    fields,
    raw: JSON.stringify(record),
    extParams,
  };
};

const parseJsonTextLocally = (
  text: string,
  sourceType: ParseResult["source_type"],
  dedupe: boolean,
  options?: ParseOptions,
): ParseResult | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.prompts)
      ? parsed.prompts
      : [parsed];

  const entries = list
    .map((item, index) => (isRecord(item) ? buildEntryFromJsonRecord(item, index) : null))
    .filter((entry): entry is ParsedFieldEntry => entry !== null);

  return entries.length > 0 ? parseFieldEntries(entries, sourceType, dedupe, options, entries.length) : null;
};

type TextDelimiter = "," | "\t" | "|" | "｜" | "，";

const splitDelimitedLine = (line: string, delimiter: TextDelimiter) => {
  const cleaned = line.trim();
  if (delimiter === ",") {
    try {
      const rows = parseCsvSync(cleaned, {
        delimiter,
        relax_column_count: true,
        relax_quotes: true,
        skip_empty_lines: false,
        trim: true,
      }) as string[][];
      return rows[0] ?? [];
    } catch {
      return cleaned.split(delimiter).map((cell) => cell.trim());
    }
  }

  const source =
    delimiter === "|" || delimiter === "｜"
      ? cleaned.replace(/^[|｜]/, "").replace(/[|｜]$/, "")
      : cleaned;
  return source.split(delimiter).map((cell) => cell.trim());
};

const isMarkdownTableSeparator = (line: string) =>
  /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);

const findDelimitedHeader = (
  lines: Array<{ line: string; lineNo: number }>,
): { index: number; delimiter: TextDelimiter; headers: string[] } | null => {
  const delimiters = ["\t", "|", "｜", ",", "，"] as const;

  for (const [index, item] of lines.entries()) {
    if (!item.line.trim() || isMarkdownTableSeparator(item.line)) {
      continue;
    }

    for (const delimiter of delimiters) {
      const headers = splitDelimitedLine(item.line, delimiter);
      const aliases = headers.map((header) => resolveColumnAlias(header)).filter(Boolean);
      const hasName = headers.some((header) => {
        const alias = resolveColumnAlias(header);
        return alias === "name" || alias === "character_name";
      });
      if (headers.length >= 2 && aliases.length >= 2 && hasName) {
        return { index, delimiter, headers };
      }
    }
  }

  return null;
};

const parseHeaderDelimitedTextLocally = (
  text: string,
  sourceType: ParseResult["source_type"],
  dedupe: boolean,
  options?: ParseOptions,
): ParseResult | null => {
  const lines = text.split(/\r?\n/).map((line, index) => ({ line, lineNo: index + 1 }));
  const header = findDelimitedHeader(lines);
  if (!header) {
    return null;
  }

  const entries: ParsedFieldEntry[] = [];
  for (let index = header.index + 1; index < lines.length; index++) {
    const item = lines[index];
    if (!item || !item.line.trim() || isMarkdownTableSeparator(item.line)) {
      continue;
    }

    const cells = splitDelimitedLine(item.line, header.delimiter);
    if (cells.every((cell) => !cell.trim())) {
      continue;
    }

    const record = Object.fromEntries(
      header.headers.map((headerName, cellIndex) => [headerName, cells[cellIndex] ?? ""]),
    );
    entries.push({
      lineNo: item.lineNo,
      fields: normalizeRecord(record),
      raw: item.line,
    });
  }

  return entries.length > 0 ? parseFieldEntries(entries, sourceType, dedupe, options, entries.length) : null;
};

const looksLikeSceneSegment = (value: string) =>
  /^(场景|背景|环境|地点|定妆场景)\b/u.test(value) ||
  /(走廊|街角|街道|房间|办公室|店门口|铺门口|内景|外景|竹林|山门|停机坪|战场|森林|城市|酒馆|教室|庭院|码头)/u.test(
    value,
  );

const appendLooseSegment = (fields: ParsedRowFields, segment: string) => {
  const cleaned = stripMarkdownPrefix(segment)
    .replace(/^(场景|背景|环境|地点|定妆场景)\s*[:：=]?\s*/u, "")
    .trim();
  if (!cleaned) {
    return;
  }

  if (!fields.gender) {
    const gender = normalizeGender(cleaned);
    if (isExplicitGender(gender)) {
      fields.gender = gender;
      return;
    }
  }

  if (!fields.age_band && /(儿童|少年|少女|青年|中年|老年|老人|成人|\d+\s*岁)/u.test(cleaned)) {
    appendFieldValue(fields, "age_band", cleaned);
    return;
  }
  if (
    !fields.build &&
    /(身高|体型|身形|肩宽|高挑|修长|挺拔|魁梧|结实|纤细|瘦|胖|矮|中等)/u.test(cleaned)
  ) {
    appendFieldValue(fields, "build", cleaned);
    return;
  }
  if (!fields.complexion && /(肤色|白皙|冷白|小麦色|古铜色|黝黑|自然肤色)/u.test(cleaned)) {
    appendFieldValue(fields, "complexion", cleaned);
    return;
  }
  if (!fields.hair && /(发|头发|刘海|辫|髻|卷发|短发|长发)/u.test(cleaned)) {
    appendFieldValue(fields, "hair", cleaned);
    return;
  }
  if (!fields.outfit && /(身穿|穿着|服装|服饰|外套|风衣|长袍|裙|裤|靴|鞋|铠甲|夹克|卫衣|衬衫)/u.test(cleaned)) {
    appendFieldValue(fields, "outfit", cleaned);
    return;
  }
  if (!fields.accessories && /(配饰|佩戴|耳钉|耳环|项链|戒指|手表|腰带|头饰|武器|长剑|刀|背包|道具)/u.test(cleaned)) {
    appendFieldValue(fields, "accessories", cleaned);
    return;
  }
  if (!fields.face && /(脸|眉|眼|鼻|唇|胡|五官|疤|痣|瞳)/u.test(cleaned)) {
    appendFieldValue(fields, "face", cleaned);
    return;
  }
  if (!fields.scene_description && looksLikeSceneSegment(cleaned)) {
    appendFieldValue(fields, "scene_description", cleaned);
    return;
  }

  appendFieldValue(fields, "extra_visual", cleaned);
};

const extractInlineNamedDescription = (
  line: string,
): { name: string; gender?: string; rest?: string } | null => {
  const cleaned = stripMarkdownPrefix(line);
  const match = cleaned.match(
    /^([\p{Script=Han}A-Za-z·.-]{2,20})(?:[（(]([^）)]{1,12})[）)])?\s*[:：\-—–]\s*([\s\S]+)$/u,
  );
  if (!match?.[1] || resolveColumnAlias(match[1])) {
    return null;
  }

  return {
    name: match[1].trim(),
    gender: match[2]?.trim(),
    rest: match[3]?.trim(),
  };
};

const isGenericDerivedName = (name: string) =>
  /^(男性|女性|男人|女人|男子|女子|少年|少女|青年|中年|老人|老者|角色|人物)$/u.test(name.trim());

const buildEntryFromTextBlock = (
  lines: string[],
  startLineNo: number,
): ParsedFieldEntry | null => {
  const fields: ParsedRowFields = {};
  const raw = lines.join("\n").trim();
  if (!raw) {
    return null;
  }

  for (const line of lines) {
    const cleaned = stripMarkdownPrefix(line);
    if (!cleaned) {
      continue;
    }

    const keyValue = parseKeyValueLine(cleaned);
    if (keyValue) {
      appendFieldValue(fields, keyValue.field, keyValue.value);
      continue;
    }

    const named = extractInlineNamedDescription(cleaned);
    if (named) {
      if (!fields.name && !fields.character_name) {
        appendFieldValue(fields, "name", named.name);
      }
      if (!fields.gender && named.gender) {
        appendFieldValue(fields, "gender", named.gender);
      }
      appendLooseSegment(fields, named.rest ?? "");
      continue;
    }

    appendLooseSegment(fields, cleaned);
  }

  if (!fields.name && !fields.character_name) {
    const derivedName = deriveCharacterNameFromText(raw);
    if (derivedName && !isGenericDerivedName(derivedName)) {
      fields.name = derivedName;
    }
  }

  if (!fields.gender) {
    const gender = normalizeGender(raw);
    if (isExplicitGender(gender)) {
      fields.gender = gender;
    }
  }

  if (!hasKnownField(fields)) {
    return null;
  }

  return {
    lineNo: startLineNo,
    fields,
    raw,
  };
};

const isBlockSeparatorLine = (line: string) => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);

const startsNewLooseSection = (line: string) => {
  const stripped = stripMarkdownPrefix(line);
  if (!stripped) {
    return false;
  }
  if (parseKeyValueLine(stripped)) {
    return false;
  }
  return (
    /^(角色|人物|主角|配角|character|char|person|role|npc)[\s\-_]*[0-9a-zA-Z一二三四五六七八九十]*[\s:：\-—–]+/iu.test(
      stripped,
    ) ||
    /^[0-9一二三四五六七八九十]+[.、)\s]+/.test(line.trim()) ||
    extractInlineNamedDescription(stripped) !== null
  );
};

const parseBlockTextLocally = (
  text: string,
  sourceType: ParseResult["source_type"],
  dedupe: boolean,
  options?: ParseOptions,
): ParseResult | null => {
  const entries: ParsedFieldEntry[] = [];
  const lines = text.split(/\r?\n/);
  let current: string[] = [];
  let currentStartLine = 1;
  let currentHasIdentity = false;

  const flush = () => {
    const entry = buildEntryFromTextBlock(current, currentStartLine);
    if (entry) {
      entries.push(entry);
    }
    current = [];
    currentHasIdentity = false;
  };

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const cleaned = stripMarkdownPrefix(line);
    if (!cleaned || isBlockSeparatorLine(cleaned)) {
      flush();
      return;
    }

    const keyValue = parseKeyValueLine(cleaned);
    const startsIdentity =
      keyValue?.field === "name" ||
      keyValue?.field === "character_name" ||
      extractInlineNamedDescription(cleaned) !== null;
    if (current.length > 0 && ((startsIdentity && currentHasIdentity) || startsNewLooseSection(line))) {
      flush();
    }

    if (current.length === 0) {
      currentStartLine = lineNo;
    }
    current.push(line);
    currentHasIdentity = currentHasIdentity || startsIdentity;
  });
  flush();

  return entries.length > 0 ? parseFieldEntries(entries, sourceType, dedupe, options, entries.length) : null;
};

const buildEntryFromLooseDelimitedLine = (line: string, lineNo: number): ParsedFieldEntry | null => {
  if (parseKeyValueLine(line)) {
    return null;
  }

  const delimiters = ["|", "｜", "\t", "，", ","] as const;
  const delimiter = delimiters
    .map((item) => ({ item, cells: splitDelimitedLine(stripMarkdownPrefix(line), item) }))
    .filter(({ cells }) => cells.length >= 2)
    .sort((a, b) => b.cells.length - a.cells.length)[0];
  if (!delimiter) {
    return null;
  }

  const cells = delimiter.cells.map((cell) => cell.trim()).filter(Boolean);
  if (cells.length < 2) {
    return null;
  }

  const fields: ParsedRowFields = {};
  const firstCell = cells.shift() ?? "";
  const firstCellGender = normalizeGender(firstCell);
  if (!isExplicitGender(firstCellGender)) {
    const name = deriveCharacterNameFromText(firstCell) ?? firstCell.replace(/^(姓名|名字|角色名)\s*[:：]?\s*/u, "");
    appendFieldValue(fields, "name", name);
  }

  for (const cell of cells) {
    const keyValue = parseKeyValueLine(cell);
    if (keyValue) {
      appendFieldValue(fields, keyValue.field, keyValue.value);
      continue;
    }
    appendLooseSegment(fields, cell);
  }

  return hasKnownField(fields)
    ? {
        lineNo,
        fields,
        raw: line,
      }
    : null;
};

const parseLooseDelimitedTextLocally = (
  text: string,
  sourceType: ParseResult["source_type"],
  dedupe: boolean,
  options?: ParseOptions,
): ParseResult | null => {
  const entries = text
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNo: index + 1 }))
    .filter((item) => item.line.trim() && !isMarkdownTableSeparator(item.line))
    .map((item) => buildEntryFromLooseDelimitedLine(item.line, item.lineNo))
    .filter((entry): entry is ParsedFieldEntry => entry !== null);

  return entries.length > 0 ? parseFieldEntries(entries, sourceType, dedupe, options, entries.length) : null;
};

const parseTextLocally = (
  text: string,
  sourceType: ParseResult["source_type"],
  dedupe: boolean,
  options?: ParseOptions,
): ParseResult => {
  const normalizedText = text.replace(/\r\n?/g, "\n").trim();
  if (!normalizedText) {
    return finalizePromptItems([], sourceType, 0, []);
  }

  const parsed =
    parseJsonTextLocally(normalizedText, sourceType, dedupe, options) ??
    parseHeaderDelimitedTextLocally(normalizedText, sourceType, dedupe, options) ??
    parseLooseDelimitedTextLocally(normalizedText, sourceType, dedupe, options) ??
    parseBlockTextLocally(normalizedText, sourceType, dedupe, options);

  if (parsed) {
    return parsed;
  }

  return finalizePromptItems([], sourceType, 1, [
    {
      line_no: 1,
      reason: "unrecognized_text_format",
      raw: normalizedText.slice(0, 1000),
    },
  ]);
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

const parseTextLike = async (
  text: string,
  sourceType: ParseResult["source_type"],
  dedupe: boolean,
  options?: ParseOptions,
): Promise<ParseResult> => {
  const mode = options?.parseMode ?? "auto";
  if (mode === "local") {
    return parseTextLocally(text, sourceType, dedupe, options);
  }
  if (mode === "claude") {
    return parseViaClaude(text, sourceType, dedupe, options);
  }

  try {
    return await parseViaClaude(text, sourceType, dedupe, options);
  } catch {
    return parseTextLocally(text, sourceType, dedupe, options);
  }
};

export const parsePromptText = async (text: string, dedupe = false, options?: ParseOptions): Promise<ParseResult> => {
  return parseTextLike(text, "text", dedupe, options);
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
      return parseTextLike(text, sourceType, dedupe, options);
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return parseTextLike(result.value, "docx", dedupe, options);
    }
    default:
      throw new AppError("E_UNSUPPORTED_FILE_TYPE", `Unsupported file type: ${ext}.`, 400);
  }
};
