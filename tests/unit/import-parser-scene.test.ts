/**
 * CSV/XLSX 场景描述导入单元测试（不依赖框架）
 *
 * 运行：npx tsx tests/unit/import-parser-scene.test.ts
 */

import { strict as assert } from "node:assert";

import { parsePromptFile } from "../../src/lib/import-parsers";

type Case = {
  name: string;
  run: () => void | Promise<void>;
};

const cases: Case[] = [];
const register = (name: string, run: Case["run"]) => cases.push({ name, run });

const toCsvFile = (csv: string) =>
  new File([Buffer.from(csv, "utf8")], "scene.csv", { type: "text/csv" });

register("CSV 中文场景描述列写入 scene_description", async () => {
  const csv = [
    "角色名,性别,年龄段,身高体型,场景描述",
    "林婉,female,青年,中等偏瘦,新闻编辑部外的玻璃走廊",
  ].join("\n");
  const result = await parsePromptFile(toCsvFile(csv), false, { parseMode: "local" });
  assert.equal(result.valid_count, 1);
  assert.equal(result.prompts[0]?.scene_description, "新闻编辑部外的玻璃走廊");
});

register("CSV dedupe 会保留同角色不同场景", async () => {
  const csv = [
    "角色名,性别,年龄段,身高体型,场景描述",
    "林婉,female,青年,中等偏瘦,新闻编辑部外的玻璃走廊",
    "林婉,female,青年,中等偏瘦,雨夜街角的报刊亭前",
  ].join("\n");
  const result = await parsePromptFile(toCsvFile(csv), true, { parseMode: "local" });
  assert.equal(result.valid_count, 2);
  assert.deepEqual(
    result.prompts.map((prompt) => prompt.scene_description),
    ["新闻编辑部外的玻璃走廊", "雨夜街角的报刊亭前"],
  );
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
