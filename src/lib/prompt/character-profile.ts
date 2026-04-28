/**
 * 结构化角色档案
 *
 * 承载「单一角色」的视觉设定，取代旧 PromptBlocks.part3 的绘图角色描述职责。
 * part3 在重构后仅保留 character_name 镜像用途，不再进最终 prompt 参与绘图。
 *
 * 所有字段为可选时允许空字符串；gender 为结构化枚举，避免自由文本导致误判。
 */

export type Gender = "male" | "female" | "nonbinary" | "unknown";

export type CharacterProfile = {
  name: string;
  gender: Gender;
  age_band?: string;      // "少年" | "青年" | "中年" | "老年" 等
  build?: string;         // 身高体型
  complexion?: string;    // 肤色
  face?: string;          // 脸型五官
  hair?: string;          // 发型发色
  outfit?: string;        // 服装造型
  accessories?: string;   // 配饰道具
  extra_visual?: string;  // 兜底自由文本（疤/胎记/纹身等；不含风格/构图/指令）
};

type CharacterProfileInput = Partial<Record<keyof CharacterProfile, unknown>>;

const GENDER_DISPLAY_ZH: Record<Gender, string> = {
  male: "男性",
  female: "女性",
  nonbinary: "非二元性别",
  unknown: "未明确性别",
};

const GENDER_DISPLAY_EN: Record<Gender, string> = {
  male: "male",
  female: "female",
  nonbinary: "nonbinary",
  unknown: "unspecified gender",
};

export const normalizeGender = (value: unknown): Gender => {
  if (typeof value !== "string") return "unknown";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "unknown";
  if (["nonbinary", "non-binary", "nb", "enby", "非二元", "非二元性别", "中性"].includes(trimmed)) {
    return "nonbinary";
  }
  if (["male", "男", "男性", "boy", "man", "m"].includes(trimmed)) return "male";
  if (["female", "女", "女性", "girl", "woman", "f"].includes(trimmed)) return "female";

  const femaleHit =
    /(女性|女|少女|女孩|姑娘|女子|女人|女士|小姐|夫人|母亲|母后|女儿|姐妹|姐姐|妹妹|公主|女王|皇后|她|girl|woman|female|lady|princess|queen|actress|mother|daughter|sister)/i.test(
      trimmed,
    );
  const maleHit =
    /(男性|男|少年|男孩|男子|男人|男士|先生|父亲|父王|儿子|兄弟|哥哥|弟弟|王子|国王|皇帝|他|boy|man|male|gentleman|prince|king|actor|father|son|brother)/i.test(
      trimmed,
    );

  if (femaleHit && !maleHit) return "female";
  if (maleHit && !femaleHit) return "male";
  return "unknown";
};

export const isExplicitGender = (gender: Gender | null | undefined): gender is Exclude<Gender, "unknown"> =>
  gender === "male" || gender === "female" || gender === "nonbinary";

const renderGenderLock = (gender: Gender): string => {
  if (gender === "male") {
    return [
      "- 性别硬约束：男性（male）。必须生成明确男性角色；即使角色是长发、长袍、华服、披风、清秀五官，也必须保持男性面部骨相、男性肩颈胸腰比例与男性气质，不得女性化，不得生成女性胸部、女性腰臀比例、女性妆容或女性化脸型。",
      "- Gender lock: male character only. Do not gender-swap. Do not create a woman, girl, feminine body, breasts, female waist-hip ratio, female makeup, or female-coded face when male is specified.",
    ].join("\n");
  }

  if (gender === "female") {
    return [
      "- 性别硬约束：女性（female）。必须生成明确女性角色；即使角色是短发、铠甲、中性服装、战斗职业，也必须保持女性面部骨相、女性身体比例与女性气质，不得男性化，不得生成胡须、男性下颌、男性胸肩比例、男性躯干或男性化脸型。",
      "- Gender lock: female character only. Do not gender-swap. Do not create a man, boy, beard, mustache, masculine jaw, broad male torso, male chest, or male-coded body when female is specified.",
    ].join("\n");
  }

  if (gender === "nonbinary") {
    return [
      "- 性别硬约束：非二元性别（nonbinary）。保持中性/雌雄同体式呈现，不要强行改成传统男性或传统女性。",
      "- Gender lock: nonbinary androgynous presentation. Do not force the character into a conventional male or female presentation.",
    ].join("\n");
  }

  return "- 性别硬约束：性别未明确。";
};

/**
 * 把档案渲染为中文带标签段落，直接拼入最终 prompt。
 *
 * 性别作为硬约束放在首行，并附英文镜像，便于 MJ / 英文优先扩散模型双重识别。
 */
export const renderCharacterProfile = (profile: CharacterProfile): string => {
  const lines: string[] = ["角色设定（不可更改）："];

  const genderZh = GENDER_DISPLAY_ZH[profile.gender] ?? GENDER_DISPLAY_ZH.unknown;
  const genderEn = GENDER_DISPLAY_EN[profile.gender] ?? GENDER_DISPLAY_EN.unknown;
  lines.push(`- 性别：${genderZh}（${genderEn}）`);
  lines.push(renderGenderLock(profile.gender));

  if (profile.age_band?.trim()) lines.push(`- 年龄段：${profile.age_band.trim()}`);
  if (profile.build?.trim()) lines.push(`- 身高体型：${profile.build.trim()}`);
  if (profile.complexion?.trim()) lines.push(`- 肤色：${profile.complexion.trim()}`);
  if (profile.face?.trim()) lines.push(`- 面部五官：${profile.face.trim()}`);
  if (profile.hair?.trim()) lines.push(`- 发型发色：${profile.hair.trim()}`);
  if (profile.outfit?.trim()) lines.push(`- 服装造型：${profile.outfit.trim()}`);
  if (profile.accessories?.trim()) lines.push(`- 配饰道具：${profile.accessories.trim()}`);
  if (profile.extra_visual?.trim()) lines.push(`- 其它可见特征：${profile.extra_visual.trim()}`);

  return lines.join("\n");
};

/**
 * 档案最小合法性校验：name + gender 必填；其它字段允许缺省但不允许字符串 "null"/"undefined"/"未知"。
 */
export const isValidCharacterProfile = (profile: Partial<CharacterProfile> | null | undefined): profile is CharacterProfile => {
  if (!profile) return false;
  if (typeof profile.name !== "string" || !profile.name.trim()) return false;
  if (profile.gender !== "male" && profile.gender !== "female" && profile.gender !== "nonbinary" && profile.gender !== "unknown") {
    return false;
  }
  return true;
};

/**
 * 占位符姓名识别：LLM 在无法命名角色时，常回退到 "角色1" "人物A" "NPC-3" "未命名"
 * 之类偷懒名字。这些名字无法作为生图角色代号，必须在 sanitize 阶段直接拒收，
 * 迫使调用方重新解析或由 UI 提示用户手动补名，而不是让占位符落库污染后续批处理。
 */
const PLACEHOLDER_NAME_PATTERNS: RegExp[] = [
  // 角色1 / 角色 2 / 人物3 / 人物-A / 未命名A / 未命名_01 / 主角1 / 配角2
  /^(角色|人物|未命名|无名|主角|配角|路人|群演|龙套)[\s\-_]*[0-9a-zA-Z]+$/u,
  // character1 / char_2 / unnamed / unnamed-a / npc / npc-1 / npc a
  /^(character|char|unnamed|npc|person|people|role)[\s\-_]*[0-9a-zA-Z]*$/i,
  // 纯字母 / 纯数字 / 甲乙丙丁 之类单字代号
  /^[A-Za-z]$/,
  /^[0-9]+$/,
  /^[甲乙丙丁戊己庚辛壬癸]$/,
  // "未知" "待定" "无" 等占位语（虽然 clean() 对其它字段已过滤，但 name 单独再挡一道）
  /^(未知|待定|无|待填|null|undefined|none|n\/a|tbd|tba)$/i,
];

const ROLE_LABEL_PATTERNS: RegExp[] = [
  /^(主角|配角|男主|女主|男一|女一|男二|女二|反派|反派角色)$/u,
  /^[\p{Script=Han}]{1,12}(代表|首领|领袖|队长|成员|学生|老师|导师|长老|使者|护卫|侍卫|士兵|将军|谋士)$/u,
  /^(穿越者|转生者|冒险者|挑战者|参赛者|旁白|路人|群演|龙套)$/u,
  /^(protagonist|maincharacter|maincharacter|hero|heroine|villain|supportingcharacter|representative)$/i,
];

const FULL_LATIN_NAME_ZH: Record<string, string> = {
  luguan: "陆观",
  andre: "安德烈",
  andrew: "安德鲁",
  amir: "阿米尔",
  chidaorin: "赤道凛",
};

const LATIN_NAME_TOKEN_ZH: Record<string, string> = {
  ai: "艾",
  an: "安",
  bai: "白",
  bei: "北",
  chen: "陈",
  chi: "赤",
  dao: "道",
  de: "德",
  guan: "观",
  han: "韩",
  hao: "昊",
  he: "赫",
  jiang: "江",
  jin: "金",
  kai: "凯",
  lan: "兰",
  li: "李",
  lin: "林",
  ling: "凌",
  lu: "陆",
  ming: "明",
  mo: "默",
  mu: "穆",
  nan: "南",
  ning: "宁",
  qin: "秦",
  qing: "青",
  ren: "仁",
  rin: "凛",
  shen: "沈",
  shi: "石",
  shu: "舒",
  su: "苏",
  tang: "唐",
  wei: "维",
  wen: "温",
  wu: "吴",
  xia: "夏",
  xiao: "萧",
  yan: "晏",
  yao: "瑶",
  ye: "叶",
  yi: "逸",
  yin: "银",
  yu: "羽",
  yue: "月",
  yun: "云",
  zhang: "张",
  zhao: "赵",
  zhou: "周",
};

const hasHan = (value: string): boolean => /\p{Script=Han}/u.test(value);
const hasLatin = (value: string): boolean => /[A-Za-z]/.test(value);

const splitLatinNameTokens = (value: string): string[] =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());

export const toChineseCharacterName = (name: string): string | null => {
  const trimmed = name.trim();
  if (!trimmed || hasHan(trimmed)) return trimmed || null;

  const condensed = trimmed.replace(/[^A-Za-z]/g, "").toLowerCase();
  if (!condensed) return null;
  if (FULL_LATIN_NAME_ZH[condensed]) return FULL_LATIN_NAME_ZH[condensed];

  const tokens = splitLatinNameTokens(trimmed);
  if (tokens.length > 0 && tokens.every((token) => LATIN_NAME_TOKEN_ZH[token])) {
    return tokens.map((token) => LATIN_NAME_TOKEN_ZH[token]).join("");
  }

  return null;
};

const replaceKnownNames = (value: string): string =>
  value.replace(/[A-Za-z]+(?:\s+[A-Za-z]+)?/g, (match) => toChineseCharacterName(match) ?? match);

const phraseReplacements: Array<[RegExp, string]> = [
  [/\b(\d+)[-\s]?year[-\s]?old\b/gi, "$1岁"],
  [/\bmale\b/gi, "男性"],
  [/\bfemale\b/gi, "女性"],
  [/\bgeography student\b/gi, "地理系学生"],
  [/\bprotagonist\b/gi, "主角"],
  [/\bdiplomat\b/gi, "外交官"],
  [/\bsage\b/gi, "智者"],
  [/\brepresenting the Tianzhu Federation\b/gi, "天竺联邦代表"],
  [/\bTianzhu Federation\b/gi, "天竺联邦"],
  [/\bdetermined and resolute demeanor\b/gi, "神情坚定果断"],
  [/\bwarm and wise aura\b/gi, "气质温和睿智"],
  [/\b(\d+)cm tall\b/gi, "身高$1cm"],
  [/\bslender build\b/gi, "身形消瘦"],
  [/\bwell-proportioned steady build\b/gi, "体态匀称稳重"],
  [/\bhandsome and refined face\b/gi, "面容清俊"],
  [/\bgentle smiling face\b/gi, "面带温和笑容"],
  [/\bblack eyes\b/gi, "黑色眼睛"],
  [/\bwise brown eyes\b/gi, "睿智的棕色眼睛"],
  [/\bbrown eyes\b/gi, "棕色眼睛"],
  [/\bblack short hair\b/gi, "黑色短发"],
  [/\bblack curly hair\b/gi, "黑色卷发"],
  [/\bstreaked with a few silver-white strands\b/gi, "夹杂几缕银白色发丝"],
  [/\bwith a few silver streaks\b/gi, "夹杂几缕银发"],
  [/\bwearing a\b/gi, "身穿"],
  [/\bwhite linen long robe\b/gi, "白色亚麻长袍"],
  [/\bhead wrapped in a gold-embroidered turban\b/gi, "头缠金线刺绣头巾"],
  [/\bslightly worn but clean\b/gi, "略显破旧但干净"],
  [/\bdark gray mandarin-collar jacket\b/gi, "深灰色立领外套"],
  [/\bminimalist and practical style\b/gi, "简约实用风格"],
  [/\band\b/gi, "，"],
  [/\bwith\b/gi, "带有"],
];

export const toChineseCharacterText = (text?: string | null): string | null => {
  if (!text) return text ?? null;
  const trimmed = text.trim();
  if (!trimmed || !hasLatin(trimmed)) return trimmed;

  let translated = replaceKnownNames(trimmed);
  for (const [pattern, replacement] of phraseReplacements) {
    translated = translated.replace(pattern, replacement);
  }

  translated = translated
    .replace(/\s*,\s*/g, "，")
    .replace(/\s+/g, "")
    .replace(/，{2,}/g, "，")
    .replace(/^，|，$/g, "");

  return translated || trimmed;
};

export const isPlaceholderName = (name: string): boolean => {
  const trimmed = name.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_NAME_PATTERNS.some((re) => re.test(trimmed));
};

const isRoleLabelName = (name: string): boolean => {
  const trimmed = name.trim();
  if (!trimmed) return true;
  const compact = trimmed.replace(/[\s\-_]+/g, "");
  return ROLE_LABEL_PATTERNS.some((re) => re.test(trimmed) || re.test(compact));
};

const stripRolePrefix = (value: string): string =>
  value.replace(
    /^(角色|人物|主角|配角|路人|群演|龙套|character|char|person|role|npc)[\s\-_]*[0-9a-zA-Z一二三四五六七八九十]*[\s:：\-—–]+/iu,
    "",
  );

const normalizeNameCandidate = (value: string): string => {
  const trimmed = stripRolePrefix(value)
    .replace(/^[\s"'“”‘’「」『』《》【】（）()]+|[\s"'“”‘’「」『』《》【】（）()]+$/gu, "")
    .replace(/^(姓名|名字|角色名|代号|称号)[:：\s]*/u, "")
    .trim();

  return trimmed.replace(/\s+/g, "");
};

const isUsableDerivedName = (value: string): boolean => {
  if (!value) return false;
  if (isPlaceholderName(value)) return false;
  if (isRoleLabelName(value)) return false;
  if (/[0-9]/.test(value)) return false;
  if (value.length < 2 || value.length > 20) return false;
  return /^[\p{Script=Han}A-Za-z·.-]+$/u.test(value);
};

const toDisplayName = (candidate: string): string => toChineseCharacterName(candidate) ?? candidate;

const ROLE_NOUN_PATTERN =
  /(?:一名|一位|一个|该|这位|这名)?([\p{Script=Han}]{0,6}(?:少年|少女|青年|女子|男子|女性|男性|女人|男人|老人|老者|将军|谋士|士兵|剑士|骑士|修士|道士|仙子|侦探|工程师|医生|黑客|佣兵|猎人|贵族|驯兽师|伙伴|生物|怪兽|机械龙|龙|兽))/u;

export const deriveCharacterNameFromText = (text?: string | null): string | null => {
  if (!text) return null;
  const normalized = text.trim();
  if (!normalized) return null;

  const withoutRolePrefix = stripRolePrefix(normalized);
  const explicitMatch = withoutRolePrefix.match(
    /(?:姓名|名字|角色名|名为|叫做|叫|代号|称为)[:：\s]*([\p{Script=Han}A-Za-z·.-]{2,20})/u,
  );
  if (explicitMatch?.[1]) {
    const candidate = normalizeNameCandidate(explicitMatch[1]);
    if (isUsableDerivedName(candidate)) return toDisplayName(candidate);
  }

  const segments = withoutRolePrefix
    .split(/[，,。；;、\n\r]/)
    .map((segment) => normalizeNameCandidate(segment))
    .filter(Boolean);
  const [firstSegment, secondSegment] = segments;
  if (firstSegment && isRoleLabelName(firstSegment) && secondSegment && isUsableDerivedName(secondSegment)) {
    return toDisplayName(secondSegment);
  }

  const head = firstSegment ?? "";
  const headCandidate = normalizeNameCandidate(head);
  if (isUsableDerivedName(headCandidate) && !/(一名|一位|一个|约|岁|身穿|身着|有着)/u.test(headCandidate)) {
    return toDisplayName(headCandidate);
  }

  const roleMatch = withoutRolePrefix.match(ROLE_NOUN_PATTERN);
  if (roleMatch?.[1]) {
    const candidate = normalizeNameCandidate(roleMatch[1]);
    if (isUsableDerivedName(candidate)) return toDisplayName(candidate);
  }

  return null;
};

export const deriveCharacterNameFromProfileInput = (
  input: CharacterProfileInput | null | undefined,
  sourceText?: string | null,
): string | null => {
  const rawName = typeof input?.name === "string" ? input.name.trim() : "";
  if (rawName && !isPlaceholderName(rawName) && !isRoleLabelName(rawName)) return toDisplayName(rawName);

  const sourceName = deriveCharacterNameFromText(sourceText);
  if (sourceName) return sourceName;

  const fields: Array<unknown> = [
    input?.extra_visual,
    input?.face,
    input?.hair,
    input?.outfit,
    input?.accessories,
    input?.build,
    input?.age_band,
  ];

  for (const field of fields) {
    if (typeof field !== "string") continue;
    const derived = deriveCharacterNameFromText(field);
    if (derived) return derived;
  }

  return null;
};

export const sanitizeCharacterProfile = (input: CharacterProfileInput | null | undefined): CharacterProfile | null => {
  if (!input) return null;
  const name = deriveCharacterNameFromProfileInput(input) ?? "";
  if (!name) return null;
  if (isPlaceholderName(name)) return null;

  const clean = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (/^(未知|待定|无|null|undefined|none|n\/a)$/i.test(trimmed)) return undefined;
    return toChineseCharacterText(trimmed) ?? trimmed;
  };

  return {
    name,
    gender: normalizeGender(input.gender),
    age_band: clean(input.age_band),
    build: clean(input.build),
    complexion: clean(input.complexion),
    face: clean(input.face),
    hair: clean(input.hair),
    outfit: clean(input.outfit),
    accessories: clean(input.accessories),
    extra_visual: clean(input.extra_visual),
  };
};
