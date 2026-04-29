/**
 * 文本导入本地解析单元测试（不依赖框架）
 *
 * 运行：npx tsx tests/unit/import-parser-text.test.ts
 */

import { strict as assert } from "node:assert";

import { parsePromptText } from "../../src/lib/import-parsers";

type Case = {
  name: string;
  run: () => void | Promise<void>;
};

const cases: Case[] = [];
const register = (name: string, run: Case["run"]) => cases.push({ name, run });

register("本地文本解析支持多段键值角色档案", async () => {
  const text = [
    "角色名：林婉",
    "性别：女性",
    "年龄段：青年",
    "身高体型：中等偏瘦",
    "发型：黑色齐肩短发",
    "服装：深灰色风衣",
    "场景描述：新闻编辑部外的玻璃走廊",
    "",
    "角色名：陈默",
    "性别：男性",
    "年龄段：中年",
    "发型：褐色短卷发",
    "服装：深棕旧皮夹克",
    "场景描述：老城区清晨的修车铺门口",
  ].join("\n");

  const result = await parsePromptText(text, false, { parseMode: "local" });
  assert.equal(result.source_type, "text");
  assert.equal(result.valid_count, 2);
  assert.equal(result.invalid_count, 0);
  assert.deepEqual(
    result.prompts.map((prompt) => prompt.character_profile?.name),
    ["林婉", "陈默"],
  );
  assert.deepEqual(
    result.prompts.map((prompt) => prompt.character_profile?.gender),
    ["female", "male"],
  );
  assert.equal(result.prompts[0]?.scene_description, "新闻编辑部外的玻璃走廊");
});

register("本地文本解析支持粘贴 CSV 表格", async () => {
  const text = [
    "角色名,性别,年龄段,身高体型,场景描述",
    "林婉,女性,青年,中等偏瘦,新闻编辑部外的玻璃走廊",
  ].join("\n");

  const result = await parsePromptText(text, false, { parseMode: "local" });
  assert.equal(result.valid_count, 1);
  assert.equal(result.prompts[0]?.line_no, 2);
  assert.equal(result.prompts[0]?.character_profile?.gender, "female");
  assert.equal(result.prompts[0]?.scene_description, "新闻编辑部外的玻璃走廊");
});

register("本地文本解析支持无表头分隔行", async () => {
  const text = "银翼｜非二元性别｜青年｜修长挺拔｜及肩银白色直发｜哑光黑色机能长外套｜未来城市高层停机坪边缘";

  const result = await parsePromptText(text, false, { parseMode: "local" });
  assert.equal(result.valid_count, 1);
  assert.equal(result.invalid_count, 0);
  assert.equal(result.prompts[0]?.character_profile?.name, "银翼");
  assert.equal(result.prompts[0]?.character_profile?.gender, "nonbinary");
  assert.equal(result.prompts[0]?.character_profile?.hair, "及肩银白色直发");
  assert.equal(result.prompts[0]?.scene_description, "未来城市高层停机坪边缘");
});

register("本地文本解析支持结构化 JSON", async () => {
  const text = JSON.stringify({
    prompts: [
      {
        character_profile: {
          name: "苏清辞",
          gender: "女性",
          age_band: "少年",
          hair: "乌黑长发",
          outfit: "月白色交领广袖长裙",
        },
        scene_description: "竹林深处的青石小径",
        part4: "wuxia cdrama still",
      },
    ],
  });

  const result = await parsePromptText(text, false, { parseMode: "local" });
  assert.equal(result.valid_count, 1);
  assert.equal(result.prompts[0]?.character_profile?.name, "苏清辞");
  assert.equal(result.prompts[0]?.prompt_blocks?.part4, "wuxia cdrama still");
  assert.equal(result.prompts[0]?.scene_description, "竹林深处的青石小径");
});

register("auto 模式在 Claude 不可用时回退到本地解析", async () => {
  process.env.STRUCTURED_PARSE_ENABLED = "false";
  const text = "林婉｜女性｜青年｜中等偏瘦｜黑色齐肩短发｜深灰色风衣｜新闻编辑部外的玻璃走廊";

  const result = await parsePromptText(text, false, { parseMode: "auto" });
  assert.equal(result.valid_count, 1);
  assert.equal(result.prompts[0]?.character_profile?.name, "林婉");
  assert.equal(result.prompts[0]?.character_profile?.gender, "female");
});

(async () => {
  let failed = 0;
  for (const item of cases) {
    try {
      await item.run();
      console.log(`PASS  ${item.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL  ${item.name}`);
      console.error(error);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
  }
  console.log(`\n${cases.length} test(s) passed.`);
})();
