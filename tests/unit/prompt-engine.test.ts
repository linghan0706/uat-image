/**
 * PromptEngine 单元测试（不依赖框架）
 *
 * 运行：npx tsx tests/unit/prompt-engine.test.ts
 *
 * 覆盖：
 *   - 首末句「无文字」硬约束
 *   - part3 不再参与 prompt（仅 character_profile 驱动绘图）
 *   - 未知 style_key 回落到 xuanhuan_live_action
 *   - MJ 模型 vs 扩散模型负向词分派
 *   - 性别硬约束（空 profile.name / gender 抛错）
 *   - 三视图 vs 定妆照 part1 切换
 */

import { strict as assert } from "node:assert";

import { MAX_PROMPT_LENGTH } from "../../src/lib/constants";
import { assemble } from "../../src/lib/prompt/engine";
import type { CharacterProfile } from "../../src/lib/prompt/character-profile";
import {
  deriveCharacterNameFromProfileInput,
  deriveCharacterNameFromText,
  isPlaceholderName,
  normalizeGender,
  sanitizeCharacterProfile,
  toChineseCharacterName,
  toChineseCharacterText,
} from "../../src/lib/prompt/character-profile";
import {
  DEFAULT_STYLE_KEY,
  findStylePresetIsolationViolations,
  resolveStyle,
} from "../../src/lib/prompt/layers/style-registry";
import { resolveNegativePrompt } from "../../src/lib/prompt/negative";
import {
  PORTRAIT_PART1,
  PORTRAIT_SCENE_PART1,
} from "../../src/lib/prompt/presets/portrait";
import { THREE_VIEW_PART1 } from "../../src/lib/prompt/presets/three-view";

type TestCase = { name: string; run: () => void };
const cases: TestCase[] = [];
const test = (name: string, run: () => void) => cases.push({ name, run });

const sampleProfile: CharacterProfile = {
  name: "林婉",
  gender: "female",
  age_band: "青年",
  build: "中等身高，纤细",
  complexion: "白皙",
  face: "鹅蛋脸，丹凤眼",
  hair: "乌黑及腰长发，半扎髻",
  outfit: "月白色对襟襦裙",
  accessories: "银簪，玉镯",
};

// ---------- 基础断言 ----------

test("PORTRAIT prompt 首句末句均为无文字硬约束", () => {
  const { prompt } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    profile: sampleProfile,
    modelKey: "sd3",
  });
  const firstSection = prompt.split("\n\n")[0] ?? "";
  const lastSection = prompt.split("\n\n").at(-1) ?? "";
  assert.match(firstSection, /严禁出现任何文字/, "首句必须含无文字硬约束");
  assert.match(lastSection, /再次强调/, "末句必须含再次强调");
  assert.match(lastSection, /没有任何文字/, "末句必须重复禁文字");
});

test("PORTRAIT prompt 包含 part1 模板指令", () => {
  const { prompt } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    profile: sampleProfile,
    modelKey: "sd3",
  });
  assert.ok(prompt.includes(PORTRAIT_PART1), "必须包含 PORTRAIT_PART1");
  assert.ok(!prompt.includes(THREE_VIEW_PART1), "定妆照不应包含三视图 part1");
});

test("PORTRAIT prompt 分层顺序稳定，包含 L0-L4", () => {
  const { prompt, prompt_snapshot } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    profile: sampleProfile,
    modelKey: "sd3",
  });
  assert.deepEqual(
    prompt_snapshot.layers.map((layer) => layer.id),
    [
      "L0_NO_TEXT_LOCK",
      "L1_CAPABILITY_LAYOUT",
      "L2_STYLE_GUARDED",
      "L3_CHARACTER_PROFILE",
      "L4_REFERENCE_STYLE",
    ],
  );
  assert.ok(prompt_snapshot.layers.every((layer) => layer.applicable && layer.included));
  assert.ok(
    prompt.indexOf(PORTRAIT_PART1) < prompt.indexOf("风格：") &&
      prompt.indexOf("风格：") < prompt.indexOf("角色设定（不可更改）：") &&
      prompt.indexOf("角色设定（不可更改）：") < prompt.indexOf("参考风格："),
    "PORTRAIT prompt 必须按 L1/L2/L3/L4 顺序组装",
  );
});

test("THREE_VIEW prompt 使用三视图 part1 和三视图硬约束", () => {
  const { prompt } = assemble({
    preset: "THREE_VIEW",
    style_key: "xuanhuan_live_action",
    profile: sampleProfile,
    modelKey: "nano_banana",
  });
  assert.ok(prompt.includes(THREE_VIEW_PART1), "必须包含 THREE_VIEW_PART1");
  assert.match(prompt, /无阴影/, "三视图硬约束必须包含无阴影");
});

test("THREE_VIEW prompt 注入风格锁和来源角色档案，但不注入 part4", () => {
  const { prompt, prompt_snapshot } = assemble({
    preset: "THREE_VIEW",
    style_key: "xuanhuan_live_action",
    profile: sampleProfile,
    modelKey: "nano_banana",
    part4: "cinematic close-up poster",
  });
  assert.ok(prompt.includes("风格："), "三视图应包含风格锁，防止模型把参考图改画风");
  assert.ok(!prompt.includes("参考风格："), "三视图不应包含 part4");
  assert.ok(prompt.includes("角色设定（不可更改）："), "三视图应包含来源角色档案");
  assert.equal(prompt_snapshot.part2_applicable, true);
  assert.equal(prompt_snapshot.profile_applicable, true);
  assert.equal(prompt_snapshot.part4_applicable, false);
  assert.equal(prompt_snapshot.layers.find((layer) => layer.id === "L2_STYLE_GUARDED")?.included, true);
  assert.equal(prompt_snapshot.layers.find((layer) => layer.id === "L3_CHARACTER_PROFILE")?.included, true);
  assert.equal(prompt_snapshot.layers.find((layer) => layer.id === "L4_REFERENCE_STYLE")?.included, false);
});

test("角色档案按结构化字段渲染，性别双语显式", () => {
  const { prompt } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    profile: sampleProfile,
    modelKey: "sd3",
  });
  assert.match(prompt, /性别：女性（female）/, "性别必须以中英双语呈现");
  assert.match(prompt, /性别硬约束：女性/, "女性必须提升为硬约束");
  assert.match(prompt, /Gender lock: female character only/, "必须提供英文性别锁定锚点");
  assert.match(prompt, /不得男性化/, "必须禁止女性角色男性化");
  assert.match(prompt, /姓名是隐含在设定首行：林婉|角色设定（不可更改）/);
  assert.match(prompt, /发型发色：乌黑及腰长发/);
});

test("PORTRAIT prompt 写成无字版单人试装照而非设定表剧照海报", () => {
  const { prompt } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    profile: sampleProfile,
    modelKey: "sd3",
  });
  assert.match(prompt, /full-body solo costume fitting photo/);
  assert.match(prompt, /无字版试装留档照片/);
  assert.match(prompt, /角色从头顶到脚底完整可见/);
  assert.match(prompt, /禁止电影剧照式构图/);
  assert.match(prompt, /禁止宣传海报式构图/);
  assert.match(prompt, /禁止多视图拼贴/);
  assert.match(prompt, /资料卡版式/);
  assert.ok(!prompt.includes("三视图参考"), "定妆照正向词不应诱导三视图参考版式");
  assert.ok(prompt.length <= MAX_PROMPT_LENGTH, `prompt length ${prompt.length} exceeds ${MAX_PROMPT_LENGTH}`);
});

test("PORTRAIT 场景背景模式缺少场景描述时回落影棚", () => {
  const { prompt, negative_prompt, prompt_snapshot } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    portraitBackgroundMode: "scene",
    profile: sampleProfile,
    modelKey: "sd3",
  });
  assert.ok(prompt.includes(PORTRAIT_PART1), "缺少场景描述时必须回落影棚模板");
  assert.ok(!prompt.includes(PORTRAIT_SCENE_PART1), "缺少场景描述时不应使用场景背景模板");
  assert.equal(prompt_snapshot.portrait_background_mode, "studio");
  assert.ok(negative_prompt.includes("scenic background"), "回落影棚后负向词应禁止场景背景");
});

test("PORTRAIT 场景背景模式有场景描述时要求人物居中且全身展示", () => {
  const { prompt, negative_prompt, prompt_snapshot } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    portraitBackgroundMode: "scene",
    sceneDescription: "古旧书房，木质书架和窗边暖光作为背景层",
    profile: sampleProfile,
    modelKey: "sd3",
  });
  assert.ok(prompt.includes(PORTRAIT_SCENE_PART1), "有场景描述时必须使用场景背景定妆照模板");
  assert.match(prompt, /人物站在场景背景图中央/);
  assert.match(prompt, /full body visible from head to toe/);
  assert.equal(prompt_snapshot.portrait_background_mode, "scene");
  assert.ok(!negative_prompt.includes("scene background"), "场景模式负向词不应禁止场景背景");
  assert.ok(!negative_prompt.includes("scenic background"), "场景模式负向词不应禁止风景背景");
  assert.match(negative_prompt, /strong foreground occlusion/, "场景模式仍需禁止前景遮挡人物");
});

test("PORTRAIT 场景背景模式注入 CSV 具体场景描述", () => {
  const sceneDescription = "古旧书房，木质书架和窗边暖光作为背景层";
  const { prompt, prompt_snapshot } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    portraitBackgroundMode: "scene",
    sceneDescription,
    profile: sampleProfile,
    modelKey: "sd3",
  });
  assert.match(prompt, /场景背景（CSV导入，不可更改）：/);
  assert.ok(prompt.includes(sceneDescription));
  assert.equal(prompt_snapshot.scene_description, sceneDescription);
  assert.equal(prompt_snapshot.scene_description_applicable, true);
});

test("PORTRAIT 影棚模式不注入 sceneDescription", () => {
  const sceneDescription = "古旧书房，木质书架和窗边暖光作为背景层";
  const { prompt, prompt_snapshot } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    portraitBackgroundMode: "studio",
    sceneDescription,
    profile: sampleProfile,
    modelKey: "sd3",
  });
  assert.ok(!prompt.includes(sceneDescription));
  assert.equal(prompt_snapshot.scene_description, null);
  assert.equal(prompt_snapshot.scene_description_applicable, false);
});

test("男性角色有明确禁止女性化的 gender lock", () => {
  const { prompt } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    profile: { ...sampleProfile, name: "陆观", gender: "male" },
    modelKey: "sd3",
  });
  assert.match(prompt, /性别：男性（male）/);
  assert.match(prompt, /性别硬约束：男性/);
  assert.match(prompt, /不得女性化/);
  assert.match(prompt, /Gender lock: male character only/);
  assert.match(prompt, /Male character only: no gender swap/);
});

test("PORTRAIT prompt 将性别锁提升到 part1 前", () => {
  const { prompt } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    profile: sampleProfile,
    modelKey: "sd3",
  });
  assert.match(prompt, /性别最高优先级/);
  assert.ok(
    prompt.indexOf("性别最高优先级") < prompt.indexOf(PORTRAIT_PART1),
    "性别锁必须先于定妆照模板，避免后续风格词稀释性别约束",
  );
});

// ---------- part3 不入 prompt ----------

test("即便用户传入 part3 内容，也不会进入最终 prompt（part3 已废弃）", () => {
  const { prompt, prompt_snapshot } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    profile: sampleProfile,
    modelKey: "sd3",
  });
  // engine 接口上已经没有 part3 入参，这里验证 snapshot 不含 part3 字段
  assert.ok(!("part3" in prompt_snapshot), "snapshot 不应含 part3");
  // prompt 中不应出现"人设："这个旧的 part3 前缀
  assert.ok(!prompt.includes("人设："), "prompt 不应包含旧 part3 前缀'人设：'");
});

test("part4 命中构图污染词时会被净化并回落到风格默认参考词", () => {
  const { prompt_snapshot } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    profile: sampleProfile,
    modelKey: "sd3",
    part4: "半身特写，电影剧照，三视图布局，16:9",
  });
  assert.ok(!prompt_snapshot.part4.includes("半身特写"));
  assert.ok(!prompt_snapshot.part4.includes("电影剧照"));
  assert.ok(!prompt_snapshot.part4.includes("三视图布局"));
  assert.equal(prompt_snapshot.part4, resolveStyle("xuanhuan_live_action").part4_reference);
});

test("character_profile 命中风格/构图污染词时抛错", () => {
  assert.throws(
    () =>
      assemble({
        preset: "PORTRAIT",
        style_key: "xuanhuan_live_action",
        profile: { ...sampleProfile, extra_visual: "电影级写实风格，浅景深背景" },
        modelKey: "sd3",
      }),
    /prompt isolation violation/,
  );
});

// ---------- style fallback ----------

test("未知 style_key 回落到默认风格且标记 fallback", () => {
  const { prompt_snapshot } = assemble({
    preset: "PORTRAIT",
    style_key: "no_such_style_key_xyz",
    profile: sampleProfile,
    modelKey: "sd3",
  });
  assert.equal(prompt_snapshot.style_key, DEFAULT_STYLE_KEY);
  assert.equal(prompt_snapshot.style_key_is_fallback, true);
});

test("已知 style_key 不触发 fallback", () => {
  const { prompt_snapshot } = assemble({
    preset: "PORTRAIT",
    style_key: "ancient_war_epic",
    profile: sampleProfile,
    modelKey: "sd3",
  });
  assert.equal(prompt_snapshot.style_key, "ancient_war_epic");
  assert.equal(prompt_snapshot.style_key_is_fallback, false);
});

test("空 style_key 返回默认风格且不标记 fallback", () => {
  const { prompt_snapshot } = assemble({
    preset: "PORTRAIT",
    style_key: "",
    profile: sampleProfile,
    modelKey: "sd3",
  });
  assert.equal(prompt_snapshot.style_key, DEFAULT_STYLE_KEY);
  assert.equal(prompt_snapshot.style_key_is_fallback, false);
});

// ---------- 负向词分派 ----------

test("MJ 模型走 MJ 精简负向词", () => {
  const { negative_prompt } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    profile: sampleProfile,
    modelKey: "midjourney-v6",
  });
  assert.ok(negative_prompt.includes("watermark"));
  assert.ok(negative_prompt.includes("wrong gender"));
  assert.ok(negative_prompt.includes("close-up"));
  // MJ 版不应含扩散版的冗长词如 pixelated
  assert.ok(!negative_prompt.includes("pixelated"), "MJ 负向词应为精简版");
});

test("非 MJ 模型走扩散完整负向词", () => {
  const { negative_prompt } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    profile: sampleProfile,
    modelKey: "nano_banana",
  });
  assert.ok(negative_prompt.includes("pixelated"), "扩散负向词应含详尽项");
});

test("用户自定义负向词保留在前，并追加性别防串约束", () => {
  const { negative_prompt } = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    profile: sampleProfile,
    modelKey: "midjourney-v6",
    userNegative: "only_my_words",
  });
  assert.match(negative_prompt, /^only_my_words/);
  assert.match(negative_prompt, /male-coded body/, "用户负向词后仍需追加性别防串约束");
});

test("PORTRAIT negative prompt 按男女追加反串性别负向词", () => {
  const male = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    profile: { ...sampleProfile, name: "陆观", gender: "male" },
    modelKey: "sd3",
  }).negative_prompt;
  assert.match(male, /female waist-hip ratio/);
  assert.match(male, /female-coded body/);

  const female = assemble({
    preset: "PORTRAIT",
    style_key: "xuanhuan_live_action",
    profile: sampleProfile,
    modelKey: "sd3",
  }).negative_prompt;
  assert.match(female, /masculine jaw/);
  assert.match(female, /broad male torso/);
});

test("resolveNegativePrompt: 三视图 MJ 走 MJ_THREE_VIEW_NEGATIVE", () => {
  const neg = resolveNegativePrompt({ preset: "THREE_VIEW", modelKey: "mj" });
  assert.ok(neg.includes("shadow"));
  assert.ok(!neg.includes("pixelated"));
});

// ---------- profile 合法性 ----------

test("空 name 抛错", () => {
  assert.throws(
    () =>
      assemble({
        preset: "PORTRAIT",
        style_key: "xuanhuan_live_action",
        profile: { ...sampleProfile, name: "" },
        modelKey: "sd3",
      }),
    /invalid CharacterProfile/,
  );
});

test("非法 gender 抛错", () => {
  assert.throws(
    () =>
      assemble({
        preset: "PORTRAIT",
        style_key: "xuanhuan_live_action",
        // @ts-expect-error 故意传错
        profile: { ...sampleProfile, gender: "男人" },
        modelKey: "sd3",
      }),
    /invalid CharacterProfile/,
  );
});

test("unknown gender 抛错，避免定妆照随机猜性别", () => {
  assert.throws(
    () =>
      assemble({
        preset: "PORTRAIT",
        style_key: "xuanhuan_live_action",
        profile: { ...sampleProfile, gender: "unknown" },
        modelKey: "sd3",
      }),
    /explicit gender required/,
  );
});

test("normalizeGender 兜底 unknown", () => {
  assert.equal(normalizeGender("男"), "male");
  assert.equal(normalizeGender("女性"), "female");
  assert.equal(normalizeGender("青年男性修士"), "male");
  assert.equal(normalizeGender("银发少女，手持长剑"), "female");
  assert.equal(normalizeGender("她是一名短发女将军"), "female");
  assert.equal(normalizeGender("他是长发修士"), "male");
  assert.equal(normalizeGender("FEMALE"), "female");
  assert.equal(normalizeGender("Woman"), "female");
  assert.equal(normalizeGender("不明"), "unknown");
  assert.equal(normalizeGender(undefined), "unknown");
});

test("sanitizeCharacterProfile 过滤掉占位词", () => {
  const p = sanitizeCharacterProfile({
    name: "张三",
    gender: "male",
    hair: "未知",
    outfit: "  ",
    face: "null",
    complexion: "白",
  });
  assert.ok(p);
  assert.equal(p!.hair, undefined);
  assert.equal(p!.outfit, undefined);
  assert.equal(p!.face, undefined);
  assert.equal(p!.complexion, "白");
});

test("占位角色名会被识别并可从原文修复", () => {
  assert.equal(isPlaceholderName("角色1"), true);
  assert.equal(toChineseCharacterName("LuGuan"), "陆观");
  assert.equal(toChineseCharacterName("Andre"), "安德烈");
  assert.equal(toChineseCharacterName("ChidaoRin"), "赤道凛");
  assert.equal(
    toChineseCharacterText("Amir, 40-year-old male diplomat and sage representing the Tianzhu Federation, warm and wise aura"),
    "阿米尔，40岁男性外交官，智者天竺联邦代表，气质温和睿智",
  );
  assert.equal(deriveCharacterNameFromText("角色1：林婉，女，乌黑长发"), "林婉");
  assert.equal(deriveCharacterNameFromText("主角，陆观，31岁男性，地理系学生，穿越者"), "陆观");
  assert.equal(deriveCharacterNameFromText("protagonist, Lu Guan, 31-year-old male"), "陆观");
  assert.equal(deriveCharacterNameFromText("北境同盟代表，沈霜，银发，披重甲"), "沈霜");
  assert.equal(
    deriveCharacterNameFromProfileInput(
      {
        name: "角色2",
        gender: "female",
        extra_visual: "一名红衣少女，手持长剑，神情冷峻",
      },
    ),
    "红衣少女",
  );
  const repaired = sanitizeCharacterProfile({
    name: "角色3",
    gender: "male",
    extra_visual: "一位银甲骑士，身形高大",
  });
  assert.equal(repaired?.name, "银甲骑士");
});

// ---------- style registry ----------

test("resolveStyle 默认值", () => {
  const s1 = resolveStyle(undefined);
  const s2 = resolveStyle("");
  const s3 = resolveStyle("not_exist");
  assert.equal(s1.key, DEFAULT_STYLE_KEY);
  assert.equal(s2.key, DEFAULT_STYLE_KEY);
  assert.equal(s3.key, DEFAULT_STYLE_KEY);
});

test("style preset 注册表不包含会覆盖模板的构图污染词", () => {
  assert.deepEqual(findStylePresetIsolationViolations(), []);
});

// ---------- 主入口 ----------

let passed = 0;
let failed = 0;
for (const { name, run } of cases) {
  try {
    run();
    console.log(`  ✔ ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  ✘ ${name}`);
    console.error((err as Error).stack ?? err);
    failed += 1;
  }
}

console.log(`\n${passed} passed, ${failed} failed, ${cases.length} total`);
if (failed > 0) {
  process.exit(1);
}
