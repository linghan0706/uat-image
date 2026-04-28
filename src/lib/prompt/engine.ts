/**
 * PromptEngine —— 定妆照/三视图最终生图 prompt 的组装器。
 *
 * 职责边界：
 *   输入：{ preset, style_key, portraitBackgroundMode?, sceneDescription?, profile, part4?, extra_user_text? }
 *   输出：{ prompt, negative_prompt, prompt_snapshot }
 *
 * 不感知：Sky 网关 body 结构、模型 provider、数据库、HTTP。
 * 以便于单测、以及在 provider/网关变化时隔离影响面。
 *
 * 最终 prompt 结构（关键：首尾夹击「无文字」）：
 *   L0 [NO_TEXT_LEAD]
 *   L1 [part1 模板指令（影棚定妆照 / 场景背景定妆照 / 三视图）]
 *   L1.5 [CSV 导入的具体场景背景（仅 PORTRAIT 场景背景模式）]
 *   L2 风格：[style_preset.part2_content]（仅 PORTRAIT）
 *   L3 [渲染后的 CharacterProfile]（仅 PORTRAIT）
 *   L4 参考风格：[part4 或 style_preset.part4_reference]（仅 PORTRAIT）
 *   L0 [NO_TEXT_TAIL]
 */

import type {
  FunctionalCapability,
  PortraitBackgroundMode,
} from "@/lib/api/image-workflow.types";
import {
  type CharacterProfile,
  isExplicitGender,
  isValidCharacterProfile,
  renderCharacterProfile,
} from "@/lib/prompt/character-profile";
import {
  DEFAULT_STYLE_KEY,
  resolveStyle,
  type StylePreset,
} from "@/lib/prompt/layers/style-registry";
import {
  assertNoPromptIsolationViolations,
  findCharacterProfileIsolationViolations,
  sanitizeReferencePrompt,
} from "@/lib/prompt/isolation";
import { resolveNegativePrompt } from "@/lib/prompt/negative";
import {
  PORTRAIT_NO_TEXT_LEAD,
  PORTRAIT_NO_TEXT_TAIL,
  PORTRAIT_PART1,
  PORTRAIT_SCENE_NO_TEXT_LEAD,
  PORTRAIT_SCENE_NO_TEXT_TAIL,
  PORTRAIT_SCENE_PART1,
  normalizePortraitBackgroundMode,
} from "@/lib/prompt/presets/portrait";
import {
  THREE_VIEW_NO_TEXT_LEAD,
  THREE_VIEW_NO_TEXT_TAIL,
  THREE_VIEW_PART1,
} from "@/lib/prompt/presets/three-view";

export type AssembleInput = {
  preset: FunctionalCapability;
  style_key?: string | null;
  portraitBackgroundMode?: PortraitBackgroundMode;
  profile: CharacterProfile | null;
  modelKey: string;
  part4?: string | null;
  sceneDescription?: string | null;
  extra_user_text?: string | null;
  userNegative?: string | null;
};

export type PromptLayerId =
  | "L0_NO_TEXT_LOCK"
  | "L1_CAPABILITY_LAYOUT"
  | "L2_STYLE_GUARDED"
  | "L3_CHARACTER_PROFILE"
  | "L4_REFERENCE_STYLE";

export type PromptLayerSnapshot = {
  id: PromptLayerId;
  priority: number;
  label: string;
  applicable: boolean;
  included: boolean;
};

export type PromptSnapshot = {
  schema_version: 2;
  preset: FunctionalCapability;
  portrait_background_mode: PortraitBackgroundMode;
  style_key: string;
  style_key_is_fallback: boolean;
  part1: string;
  part2: string;
  part2_applicable: boolean;
  profile: CharacterProfile | null;
  profile_rendered: string;
  profile_applicable: boolean;
  part4: string;
  part4_applicable: boolean;
  scene_description: string | null;
  scene_description_applicable: boolean;
  no_text_lead: string;
  no_text_tail: string;
  layers: PromptLayerSnapshot[];
};

export type AssembleOutput = {
  prompt: string;
  negative_prompt: string;
  prompt_snapshot: PromptSnapshot;
};

const resolvePreset = (
  preset: FunctionalCapability,
  portraitBackgroundMode: PortraitBackgroundMode,
): { part1: string; lead: string; tail: string } => {
  if (preset === "THREE_VIEW") {
    return {
      part1: THREE_VIEW_PART1,
      lead: THREE_VIEW_NO_TEXT_LEAD,
      tail: THREE_VIEW_NO_TEXT_TAIL,
    };
  }
  if (portraitBackgroundMode === "scene") {
    return {
      part1: PORTRAIT_SCENE_PART1,
      lead: PORTRAIT_SCENE_NO_TEXT_LEAD,
      tail: PORTRAIT_SCENE_NO_TEXT_TAIL,
    };
  }
  return {
    part1: PORTRAIT_PART1,
    lead: PORTRAIT_NO_TEXT_LEAD,
    tail: PORTRAIT_NO_TEXT_TAIL,
  };
};

const resolvePart4 = (style: StylePreset, userPart4?: string | null): string => {
  const user = sanitizeReferencePrompt(userPart4);
  if (user) return user;
  return style.part4_reference;
};

const buildStyleLine = (style: StylePreset): string => `风格：${style.part2_content.trim()}`;
const buildPart4Line = (part4: string): string => `参考风格：\n${part4}`;
const buildSceneDescriptionLine = (sceneDescription: string): string =>
  [
    "场景背景（CSV导入，不可更改）：",
    sceneDescription,
    "要求：该场景只作为背景环境服务于角色身份与世界观；不得加入第二个人物，不得遮挡角色全身轮廓，不得改变角色正面静态定妆照构图。",
  ].join("\n");

const buildGenderPriorityLock = (profile: CharacterProfile): string => {
  if (profile.gender === "male") {
    return [
      "性别最高优先级 / Gender priority lock:",
      "只生成明确男性角色。长发、华服、清秀五官、披风或长袍都不能改变男性身份；必须保持男性面部骨相、肩颈胸腰比例与整体气质。",
      "Male character only: no gender swap, no female-coded face, no breasts, no feminine waist-hip ratio, no female makeup.",
    ].join("\n");
  }

  if (profile.gender === "female") {
    return [
      "性别最高优先级 / Gender priority lock:",
      "只生成明确女性角色。短发、铠甲、中性服装、战斗职业都不能改变女性身份；必须保持女性面部骨相、身体比例与整体气质。",
      "Female character only: no gender swap, no beard, no masculine jaw, no male-coded body, no broad male torso.",
    ].join("\n");
  }

  if (profile.gender === "nonbinary") {
    return [
      "性别最高优先级 / Gender priority lock:",
      "只生成非二元/中性呈现角色，不要强行改成传统男性或传统女性。",
      "Nonbinary androgynous character only: do not force conventional male or conventional female presentation.",
    ].join("\n");
  }

  return "";
};

const appendPortraitGenderNegative = (
  baseNegative: string,
  profile: CharacterProfile | null,
): string => {
  if (!profile) return baseNegative;

  const genderNegative =
    profile.gender === "male"
      ? "female, woman, girl, feminine face, female-coded body, breasts, female waist-hip ratio, female makeup"
      : profile.gender === "female"
        ? "male, man, boy, beard, mustache, masculine jaw, male-coded body, broad male torso, male chest"
        : profile.gender === "nonbinary"
          ? "forced male, forced female, gender swap"
          : "";

  if (!genderNegative) return baseNegative;
  return `${baseNegative}, ${genderNegative}`;
};

export const assemble = (input: AssembleInput): AssembleOutput => {
  const isThreeView = input.preset === "THREE_VIEW";
  const requestedPortraitBackgroundMode = isThreeView
    ? "studio"
    : normalizePortraitBackgroundMode(input.portraitBackgroundMode);
  const requestedSceneDescription = !isThreeView ? input.sceneDescription?.trim() || null : null;
  const portraitBackgroundMode =
    requestedPortraitBackgroundMode === "scene" && requestedSceneDescription ? "scene" : "studio";

  // THREE_VIEW 的视觉一致性由定妆照参考图（i2i）保证，不再依赖 CharacterProfile。
  // PORTRAIT/SCENE_CONCEPT 仍要求完整的结构化 profile。
  if (!isThreeView && (!isValidCharacterProfile(input.profile) || !isExplicitGender(input.profile.gender))) {
    throw new Error("PromptEngine.assemble: invalid CharacterProfile (name + explicit gender required).");
  }
  if (!isThreeView) {
    assertNoPromptIsolationViolations(
      findCharacterProfileIsolationViolations(input.profile),
      "PromptEngine.assemble",
    );
  }

  const { part1, lead, tail } = resolvePreset(input.preset, portraitBackgroundMode);

  const normalizedStyleKey = (input.style_key ?? "").trim().toLowerCase();
  const resolvedStyle = resolveStyle(normalizedStyleKey);
  const styleKeyIsFallback =
    normalizedStyleKey.length > 0 && resolvedStyle.key !== normalizedStyleKey;

  const profileApplicable = !isThreeView && isValidCharacterProfile(input.profile) && isExplicitGender(input.profile.gender);
  const profileRendered = profileApplicable ? renderCharacterProfile(input.profile!) : "";
  const part4 = isThreeView ? "" : resolvePart4(resolvedStyle, input.part4);
  const sceneDescription =
    !isThreeView && portraitBackgroundMode === "scene"
      ? requestedSceneDescription
      : null;

  const genderPriorityLock = profileApplicable ? buildGenderPriorityLock(input.profile!) : "";

  const sections = isThreeView
    ? [lead, part1, tail]
    : [
        lead,
        genderPriorityLock,
        part1,
        sceneDescription ? buildSceneDescriptionLine(sceneDescription) : "",
        buildStyleLine(resolvedStyle),
        profileRendered,
        buildPart4Line(part4),
        tail,
      ];

  const prompt = sections
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");

  const negative_prompt = appendPortraitGenderNegative(resolveNegativePrompt({
    preset: input.preset,
    modelKey: input.modelKey,
    userNegative: input.userNegative,
    portraitBackgroundMode,
  }), !isThreeView && profileApplicable ? input.profile : null);
  const layers: PromptLayerSnapshot[] = [
    {
      id: "L0_NO_TEXT_LOCK",
      priority: 0,
      label: "首尾禁文字硬约束",
      applicable: true,
      included: Boolean(lead && tail),
    },
    {
      id: "L1_CAPABILITY_LAYOUT",
      priority: 1,
      label: isThreeView
        ? "三视图固定模板"
        : portraitBackgroundMode === "scene"
          ? "定妆照场景背景模板"
          : "定妆照固定模板",
      applicable: true,
      included: Boolean(part1),
    },
    {
      id: "L2_STYLE_GUARDED",
      priority: 2,
      label: "受控风格层",
      applicable: !isThreeView,
      included: !isThreeView && Boolean(resolvedStyle.part2_content.trim()),
    },
    {
      id: "L3_CHARACTER_PROFILE",
      priority: 3,
      label: "结构化角色档案",
      applicable: !isThreeView,
      included: profileApplicable && Boolean(profileRendered),
    },
    {
      id: "L4_REFERENCE_STYLE",
      priority: 4,
      label: "低优先级参考词",
      applicable: !isThreeView,
      included: !isThreeView && Boolean(part4.trim()),
    },
  ];

  const prompt_snapshot: PromptSnapshot = {
    schema_version: 2,
    preset: input.preset,
    portrait_background_mode: portraitBackgroundMode,
    style_key: resolvedStyle.key,
    style_key_is_fallback: styleKeyIsFallback,
    part1,
    part2: isThreeView ? "" : resolvedStyle.part2_content,
    part2_applicable: !isThreeView,
    profile: profileApplicable ? input.profile : null,
    profile_rendered: profileRendered,
    profile_applicable: profileApplicable,
    part4,
    part4_applicable: !isThreeView,
    scene_description: sceneDescription,
    scene_description_applicable: !isThreeView && portraitBackgroundMode === "scene",
    no_text_lead: lead,
    no_text_tail: tail,
    layers,
  };

  return { prompt, negative_prompt, prompt_snapshot };
};

export { DEFAULT_STYLE_KEY };
