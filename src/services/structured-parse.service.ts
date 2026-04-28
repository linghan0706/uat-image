import { nanoid } from "nanoid";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { isHttpTimeoutError, requestText, type ServerHttpResponse } from "@/lib/http/client";
import { buildSkyRsaAuthHeaders } from "@/lib/model-providers/sky-rsa-auth";
import {
  deriveCharacterNameFromProfileInput,
  normalizeGender,
  sanitizeCharacterProfile,
  type CharacterProfile,
  type Gender,
} from "@/lib/prompt/character-profile";
import { ART_DIRECTOR_SYSTEM_INSTRUCTION } from "@/lib/prompt/layers/system-instruction";
import { listStylePresets, resolveStyle } from "@/lib/prompt/layers/style-registry";

type StructuredParsePreset = "PORTRAIT" | "THREE_VIEW";

/**
 * Claude 结构化解析候选项（新 schema，v2）。
 *
 * 与 v1 的差异：
 * - 废弃 part1 / part2 / part3 自由文本字段（part2/part4 的风格现由 style_key 驱动）；
 * - 新增 character_profile 结构化角色档案，承载原 part3 的角色视觉信息；
 * - character_name 由 character_profile.name 派生，不再单独字段。
 *
 * 保留 part4 作为可选的英文参考词（用户可在 UI/CSV 覆盖）。
 */
export type StructuredPromptCandidate = {
  character_profile: CharacterProfile;
  scene_description?: string | null;
  part4?: string | null;
  negative_prompt?: string | null;
  ext_params?: Record<string, unknown>;
};

const PROVIDER_ERROR_SUMMARY_MAX_CHARS = 500;

const truncateText = (value: string, maxChars = PROVIDER_ERROR_SUMMARY_MAX_CHARS) =>
  value.length > maxChars ? `${value.slice(0, maxChars)}...` : value;

const safeJsonStringify = (value: unknown) => {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, currentValue) => {
    if (currentValue && typeof currentValue === "object") {
      if (seen.has(currentValue)) {
        return "[Circular]";
      }
      seen.add(currentValue);
    }
    return currentValue;
  });
};

const extractProviderErrorText = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? truncateText(trimmed) : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractProviderErrorText(item);
      if (nested) {
        return nested;
      }
    }
    const serialized = safeJsonStringify(value);
    return serialized && serialized !== "[]" ? truncateText(serialized) : null;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["message", "msg", "error", "detail"] as const) {
      const nested = extractProviderErrorText(record[key]);
      if (nested) {
        return nested;
      }
    }
    const serialized = safeJsonStringify(value);
    return serialized && serialized !== "{}" ? truncateText(serialized) : null;
  }

  return null;
};

const buildProviderBusinessErrorDetails = (payload: Record<string, unknown>) => {
  const code = payload.code;
  const details = payload.message ?? payload.error ?? payload.detail ?? payload;
  const normalizedMessage =
    extractProviderErrorText(payload.message) ??
    extractProviderErrorText(payload.error) ??
    extractProviderErrorText(payload.detail) ??
    extractProviderErrorText(code) ??
    "Claude returned business error.";

  return {
    details,
    message: `Claude structured parse business error${code !== undefined ? `(${String(code)})` : ""}: ${normalizedMessage}`,
  };
};

const extractJsonText = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError("E_PARSE_FAILED", "Claude returned empty parse response.", 502);
  }

  // 1. Try ALL fenced code blocks — Claude may return one block per character
  const fencedBlocks = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
    .map((m) => m[1]?.trim())
    .filter((t): t is string => !!t);

  if (fencedBlocks.length > 1) {
    // Multiple fenced blocks: each should be a single JSON object, wrap them into an array
    return `[${fencedBlocks.join(",")}]`;
  }

  if (fencedBlocks.length === 1) {
    return fencedBlocks[0];
  }

  // 2. If starts with '{' or '[', treat as raw JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  // 3. Extract the outermost JSON object/array from mixed text
  const jsonStart = trimmed.search(/[{[]/);
  if (jsonStart >= 0) {
    const openChar = trimmed[jsonStart]!;
    const closeChar = openChar === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = jsonStart; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === openChar) depth++;
      if (ch === closeChar) depth--;
      if (depth === 0) {
        return trimmed.slice(jsonStart, i + 1);
      }
    }
  }

  throw new AppError(
    "E_PARSE_FAILED",
    "Claude response does not contain valid JSON.",
    502,
  );
};

const extractTextFromProviderPayload = (payload: Record<string, unknown>) => {
  const data = payload.data;
  if (data && typeof data === "object") {
    const dataRecord = data as Record<string, unknown>;
    if (typeof dataRecord.text === "string" && dataRecord.text.trim()) {
      return dataRecord.text;
    }
    if (Array.isArray(dataRecord.parts)) {
      const text = dataRecord.parts
        .map((part) => {
          if (!part || typeof part !== "object") {
            return "";
          }
          return typeof (part as Record<string, unknown>).text === "string"
            ? String((part as Record<string, unknown>).text)
            : "";
        })
        .join("")
        .trim();
      if (text) {
        return text;
      }
    }
  }

  throw new AppError("E_PARSE_FAILED", "Claude parse response has no text content.", 502);
};

const normalizeCandidateList = (payload: unknown) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.prompts)) {
      return record.prompts;
    }
    // Single object with profile fields — wrap in array
    if (record.character_profile !== undefined) {
      return [record];
    }
  }

  throw new AppError("E_PARSE_FAILED", "Claude parse response must be a prompt array.", 502);
};

const buildStyleCatalog = () => {
  const lines = listStylePresets().map(
    (preset) => `- key=${preset.key}｜label=${preset.label}｜${preset.art_director_brief}`,
  );
  return lines.join("\n");
};

const buildSystemInstruction = (preset: StructuredParsePreset, styleKey?: string | null) => {
  const resolvedStyle = resolveStyle(styleKey);

  return [
    ART_DIRECTOR_SYSTEM_INSTRUCTION,
    "",
    "【解析任务】",
    "你现在要把用户提供的原始文本（剧本/小说/人设文档）解析为严格 JSON，供批量生图管线使用。",
    "只允许输出 JSON，不要输出 Markdown、解释、标题、代码块或多余文本。",
    "",
    "【输出 Schema（必须严格遵守字段名）】",
    '{"prompts":[{"character_profile":{"name":"","gender":"male|female|nonbinary|unknown","age_band":"","build":"","complexion":"","face":"","hair":"","outfit":"","accessories":"","extra_visual":""},"scene_description":"","part4":"","negative_prompt":"","ext_params":{}}]}',
    "",
    "【字段规则】",
    "1. 一个独立角色 = 一个 prompts item；禁止合并多个角色，也禁止复制同一角色凑数。若无法为某个角色生成非占位符姓名，则将该角色整体从 prompts 中剔除，而不是用占位符填充。",
    "2. character_profile.name 必填，严禁为空字符串。必须是 2~8 个汉字的简短姓名或中文标签式代号（如 '林婉' '陈默' '陆观' '安德烈' '红衣少女' '银甲骑士' '青袍道士' '老管家'），不是长描述，不得含数字，不得含英文字母。若原文是英文名/拼音名，必须音译或意译为中文名，例如 Lu Guan → 陆观，Andre → 安德烈，Amir → 阿米尔，Chidao Rin → 赤道凛。若原文未给出角色名，根据最显著外观特征简短中文命名。",
    "   反例（严禁输出，视为违规，必须改写或丢弃该条）：'LuGuan' 'Lu Guan' 'Andre' 'Amir' 'ChidaoRin' '角色1' '角色2' '人物 3' 'NPC-A' 'NPC-1' '未命名' '未命名A' 'character1' 'unnamed' '未知' '待定' '无名' 'A' 'B' '甲' '乙'。",
    "   正例：'林婉' '陈默' '红衣少女' '银甲骑士' '青袍道士' '老管家' '持剑青年' '戴面具的女人'。",
    "3. character_profile.gender 必填，仅允许取值 male / female / nonbinary / unknown 四者之一：",
    "   a) 若原文明确描述性别（男/女/少男/少女/他/她/先生/女士等）→ male 或 female；",
    "   b) 若原文未直接描述，可根据姓名、代词、服饰、称谓、职业等强线索进行判断；没有可靠线索时输出 unknown，不要硬猜；",
    "   c) 长发、长袍、华服、清秀、俊美不能把男性改成女性；短发、铠甲、战斗职业、中性服饰不能把女性改成男性；",
    "   d) unknown 会被导入结果标为需要用户补全，不能为了通过校验而编造性别。",
    "4. character_profile 其它维度分别填入对应子字段：",
    "   - age_band：年龄段描述（如 '青年' '中年' '少年' '老年'）；",
    "   - build：身高体型（如 '中等偏瘦' '魁梧' '纤细'）；",
    "   - complexion：肤色；",
    "   - face：脸型五官（含疤痕/胎记/纹身等面部特征）；",
    "   - hair：发型发色（长短/造型/发色/刘海/扎发/发饰）；",
    "   - outfit：服装造型（上装/下装/外套/鞋履的款式/材质/颜色/图案）；",
    "   - accessories：配饰道具（头饰/耳饰/项链/手环/腰带/武器/背包等）；",
    "   - extra_visual：兜底的其它可见特征（疤/胎记/纹身/义肢等），禁止写入风格/构图/指令。",
    "5. scene_description 对齐 CSV 的“场景描述/背景描述/环境描述/定妆场景”列：只填写原文明确给出的角色所处背景环境，例如房间、街道、战场、办公室、建筑、自然环境等；如果原文没有明确场景或只有画风/镜头/构图要求，必须留空字符串，不要硬编。",
    "6. part4 只用于可选的英文参考词或用户指定的参考风格文案；没有就留空字符串。",
    "7. negative_prompt 只有在原文明确出现反向提示词时才填写；否则留空。",
    "8. ext_params 不要虚构，没有就空对象。",
    "9. 语言要求（硬约束，优先级高于任何其它要求）：无论原始文本是中文、英文还是其它语种，character_profile 的所有字段（name / age_band / build / complexion / face / hair / outfit / accessories / extra_visual）、scene_description 以及 negative_prompt 必须输出为简体中文。若原文为英文或其它语种，请做意译/归纳后再填写中文描述，不得直接照抄原文英文。name 字段绝对不能出现 A-Z/a-z。仅 part4 字段允许英文参考词。",
    "",
    "【严格禁止（合规）】",
    "- 严禁把构图、镜头、分辨率、背景、光影、三视图布局、角色居中站立这类生图指令写入 character_profile 的任何字段（这些由调用侧模板 part1 固定注入）。",
    "- 严禁把 '纯色背景' '浅灰背景' '16:9' '85mm焦距' 等技术约束写入 extra_visual。",
    "- scene_description 可以写具体环境本身，但严禁写镜头、构图、比例、光圈、分辨率、人物站位、风格词；这些由调用侧模板控制。",
    "- 严禁把风格词（电影级写实/赛璐璐/古风等）写入 character_profile 的任何字段；风格由 style_key 机制后置注入（当前 style_key = '" +
      resolvedStyle.key +
      "'，含义：" +
      resolvedStyle.art_director_brief +
      "）。",
    "- 严禁把服装/道具上的可辨识文字图案写进 outfit/accessories；若原文提到文字，请改写为无文字的等价描述（如 '胸前有繁复花纹' 而非 '胸前印有某某字样'）。这是为了避免下游生图模型把文字具象化。",
    "",
    "【风格注册表参考（已注册）】",
    buildStyleCatalog(),
    "",
    `【当前任务预设：${preset}｜当前 style_key：${resolvedStyle.key}（${resolvedStyle.label}）】`,
    preset === "THREE_VIEW"
      ? "三视图预设：part1 为固定三视图指令，由调用侧注入；你不要尝试填写 part1 字段。"
      : "定妆照预设：part1 为固定定妆照指令，由调用侧注入；你不要尝试填写 part1 字段。",
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
};

const buildUserPrompt = (inputText: string) => {
  return [
    "请解析下面的原始文本。",
    "如果内容本身已经是多个独立条目或多个角色设定，请拆成多个 prompts item。",
    "如果内容只是连续文本，也要尽量按角色维度切分；只有确认全文只描述一个角色时，才输出 1 条。",
    "禁止为了凑条数而复制同一角色，也禁止把多个角色揉成一条。",
    "最终目标是把每个角色变成一条可直接批量生图的结构化档案（character_profile）。",
    "原始文本开始：",
    inputText,
    "原始文本结束。",
  ].join("\n\n");
};

const extractCandidateSourceSections = (sourceText: string): string[] => {
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headedSections: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    const startsSection =
      /^(角色|人物|主角|配角|character|char|person|role|npc)[\s\-_]*[0-9a-zA-Z一二三四五六七八九十]*[\s:：\-—–]+/iu.test(line) ||
      /^[0-9一二三四五六七八九十]+[.、)\s]+/.test(line);

    if (startsSection && current.length > 0) {
      headedSections.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) {
    headedSections.push(current.join("\n"));
  }

  return headedSections.length > 1 ? headedSections : lines;
};

export const parseStructuredPromptsWithClaude = async ({
  sourceText,
  capability,
  styleKey,
}: {
  sourceText: string;
  capability?: StructuredParsePreset | null;
  styleKey?: string | null;
}): Promise<StructuredPromptCandidate[]> => {
  if (!env.structuredParseEnabled) {
    throw new AppError("E_INVALID_PARAM", "Claude structured parse is disabled.", 400);
  }
  if (!env.skyModelUrl) {
    throw new AppError("E_INVALID_PARAM", "Missing SKY_MODEL_URL.", 500);
  }

  const clippedText = sourceText.trim().slice(0, env.structuredParseMaxInputChars);
  if (!clippedText) {
    return [];
  }

  const requestId = `sp_${nanoid(12)}`;
  const authHeaders = buildSkyRsaAuthHeaders(requestId);
  const targetUrl = new URL(env.structuredParsePath, env.skyModelUrl).toString();

  const isClaudeModel = env.structuredParseModel.toLowerCase().startsWith("claude");

  const payload = {
    channel: env.structuredParseChannel,
    model: env.structuredParseModel,
    is_stream: false,
    config: {
      ...(isClaudeModel ? {} : { temperature: 0 }),
      responseMimeType: "application/json",
    },
    system_instruction: {
      parts: [{ text: buildSystemInstruction(capability ?? "PORTRAIT", styleKey) }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: buildUserPrompt(clippedText) }],
      },
    ],
  };

  let response: ServerHttpResponse<string>;
  try {
    response = await requestText({
      url: targetUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      data: JSON.stringify(payload),
      timeout: env.structuredParseTimeoutMs,
    });
  } catch (error) {
    if (isHttpTimeoutError(error)) {
      throw new AppError("E_PROVIDER_TIMEOUT", "Claude structured parse timeout.", 504);
    }
    throw error;
  }

  const responseBody = (() => {
    try {
      return JSON.parse(response.data) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  if (!response.ok || !responseBody) {
    throw new AppError("E_PARSE_FAILED", `Claude structured parse failed: HTTP ${response.status}.`, 502);
  }
  if (responseBody.code !== undefined && Number(responseBody.code) !== 0) {
    const providerError = buildProviderBusinessErrorDetails(responseBody);
    throw new AppError(
      "E_PARSE_FAILED",
      providerError.message,
      502,
      providerError.details,
    );
  }

  const rawText = extractTextFromProviderPayload(responseBody);
  const jsonText = extractJsonText(rawText);
  const parsedJson = JSON.parse(jsonText);
  const candidates = normalizeCandidateList(parsedJson);
  const sourceSections = extractCandidateSourceSections(clippedText);

  return candidates
    .map((item, index): StructuredPromptCandidate | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;

      const rawProfile =
        record.character_profile && typeof record.character_profile === "object"
          ? (record.character_profile as Record<string, unknown>)
          : null;
      if (!rawProfile) return null;

      const repairedName = deriveCharacterNameFromProfileInput(rawProfile, sourceSections[index] ?? clippedText);
      const sanitized = sanitizeCharacterProfile({
        name: repairedName ?? (typeof rawProfile.name === "string" ? rawProfile.name : ""),
        gender: normalizeGender(rawProfile.gender) as Gender,
        age_band: typeof rawProfile.age_band === "string" ? rawProfile.age_band : undefined,
        build: typeof rawProfile.build === "string" ? rawProfile.build : undefined,
        complexion: typeof rawProfile.complexion === "string" ? rawProfile.complexion : undefined,
        face: typeof rawProfile.face === "string" ? rawProfile.face : undefined,
        hair: typeof rawProfile.hair === "string" ? rawProfile.hair : undefined,
        outfit: typeof rawProfile.outfit === "string" ? rawProfile.outfit : undefined,
        accessories: typeof rawProfile.accessories === "string" ? rawProfile.accessories : undefined,
        extra_visual: typeof rawProfile.extra_visual === "string" ? rawProfile.extra_visual : undefined,
      });
      if (!sanitized) return null;

      return {
        character_profile: sanitized,
        scene_description: typeof record.scene_description === "string" ? record.scene_description : null,
        part4: typeof record.part4 === "string" ? record.part4 : null,
        negative_prompt: typeof record.negative_prompt === "string" ? record.negative_prompt : null,
        ext_params:
          record.ext_params && typeof record.ext_params === "object"
            ? (record.ext_params as Record<string, unknown>)
            : {},
      } satisfies StructuredPromptCandidate;
    })
    .filter((item): item is StructuredPromptCandidate => item !== null);
};
