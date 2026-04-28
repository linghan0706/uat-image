import type { CharacterProfile } from "@/lib/prompt/character-profile";

export type PromptIsolationDomain = "style" | "profile" | "reference";

export type PromptIsolationViolation = {
  domain: PromptIsolationDomain;
  field: string;
  token: string;
};

type ForbiddenPattern = {
  token: string;
  pattern: RegExp;
};

const overridePatterns: ForbiddenPattern[] = [
  { token: "特写", pattern: /特写/u },
  { token: "半身", pattern: /半身/u },
  { token: "剧照", pattern: /剧照/u },
  { token: "海报", pattern: /海报/u },
  { token: "浅景深", pattern: /浅景深|景深/u },
  { token: "雨夜", pattern: /雨夜/u },
  { token: "霓虹", pattern: /霓虹/u },
  { token: "三视图", pattern: /三视图|三视/u },
  { token: "分镜", pattern: /分镜/u },
  { token: "拼贴", pattern: /拼贴/u },
  { token: "16:9", pattern: /16\s*:\s*9/u },
  { token: "85mm", pattern: /85\s*mm/iu },
  { token: "背景", pattern: /背景/u },
  { token: "镜头", pattern: /镜头|焦距|光圈/u },
  { token: "构图", pattern: /构图/u },
  { token: "close-up", pattern: /\bclose[-\s]?up\b/i },
  { token: "half-body", pattern: /\bhalf[-\s]?body\b/i },
  { token: "poster", pattern: /\bposter\b/i },
  { token: "shallow depth", pattern: /\bshallow\s+depth\b|\bdepth\s+of\s+field\b/i },
  { token: "rainy night", pattern: /\brainy\s+night\b/i },
  { token: "neon", pattern: /\bneon\b/i },
  { token: "three-view", pattern: /\bthree[-\s]?view\b/i },
  { token: "storyboard", pattern: /\bstoryboard\b/i },
  { token: "collage", pattern: /\bcollage\b/i },
  { token: "background", pattern: /\bbackground\b/i },
  { token: "camera/lens", pattern: /\bcamera\b|\blens\b|\bfocal\s+length\b/i },
  { token: "composition", pattern: /\bcomposition\b/i },
];

const profileOnlyPatterns: ForbiddenPattern[] = [
  { token: "风格", pattern: /风格|画风/u },
  { token: "电影级写实", pattern: /电影级写实|赛璐璐|古风|玄幻真人|二次元|动漫感|水彩|油画/u },
  { token: "cinematic", pattern: /\bcinematic\b|\bphotorealistic\b|\banime\s+style\b|\bstyle\b/i },
  { token: "resolution", pattern: /\bresolution\b|\b4k\b|\b8k\b|分辨率/u },
];

const patternsForDomain = (domain: PromptIsolationDomain): ForbiddenPattern[] => {
  if (domain === "profile") {
    return [...overridePatterns, ...profileOnlyPatterns];
  }
  return overridePatterns;
};

export const findPromptIsolationViolations = ({
  domain,
  field,
  text,
}: {
  domain: PromptIsolationDomain;
  field: string;
  text?: string | null;
}): PromptIsolationViolation[] => {
  const value = text?.trim();
  if (!value) return [];

  return patternsForDomain(domain)
    .filter(({ pattern }) => pattern.test(value))
    .map(({ token }) => ({ domain, field, token }));
};

export const assertNoPromptIsolationViolations = (
  violations: PromptIsolationViolation[],
  context: string,
) => {
  if (violations.length === 0) return;
  const summary = violations
    .map((item) => `${item.domain}.${item.field}:${item.token}`)
    .join(", ");
  throw new Error(`${context}: prompt isolation violation (${summary}).`);
};

export const findCharacterProfileIsolationViolations = (
  profile: CharacterProfile | null | undefined,
): PromptIsolationViolation[] => {
  if (!profile) return [];
  const fields: Array<keyof CharacterProfile> = [
    "age_band",
    "build",
    "complexion",
    "face",
    "hair",
    "outfit",
    "accessories",
    "extra_visual",
  ];

  return fields.flatMap((field) =>
    findPromptIsolationViolations({
      domain: "profile",
      field,
      text: profile[field],
    }),
  );
};

export const sanitizeReferencePrompt = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const violations = findPromptIsolationViolations({
    domain: "reference",
    field: "part4",
    text: trimmed,
  });
  return violations.length > 0 ? null : trimmed;
};
