/**
 * createBatchJobSchema 单元测试（不依赖框架）
 *
 * 运行：npx tsx tests/unit/batch-job-validator.test.ts
 *
 * 覆盖:
 *   - PORTRAIT 场景下 prompt 缺 character_profile 时应当 400
 *   - THREE_VIEW 必须通过 source_portrait_ids 创建
 *   - 合法 PORTRAIT prompt 能通过校验
 */

import { strict as assert } from "node:assert";

import { createBatchJobSchema } from "../../src/lib/validators/batch-job";

type Case = {
  name: string;
  run: () => void | Promise<void>;
};

const cases: Case[] = [];
const register = (name: string, run: Case["run"]) => cases.push({ name, run });

const basePromptWithProfile = {
  line_no: 1,
  prompt: "",
  character_profile: {
    name: "陆观",
    gender: "male" as const,
  },
};

const basePromptWithoutProfile = {
  line_no: 1,
  prompt: "",
  character_name: "陆观",
  // character_profile 缺省
};

register("PORTRAIT + prompt 缺 character_profile → 应失败", () => {
  const result = createBatchJobSchema.safeParse({
    folder_name: "test-folder",
    capability: "PORTRAIT",
    source_type: "text",
    prompts: [basePromptWithoutProfile],
  });
  assert.equal(result.success, false, "缺档案应当被 schema 拒绝");
  if (!result.success) {
    const hit = result.error.issues.some(
      (issue) =>
        issue.path.join(".") === "prompts.0.character_profile" &&
        String(issue.message).includes("character_profile is required"),
    );
    assert.ok(hit, `未命中预期 issue，实际 issues=${JSON.stringify(result.error.issues)}`);
  }
});

register("THREE_VIEW + prompts → 应失败，必须使用 source_portrait_ids", () => {
  const result = createBatchJobSchema.safeParse({
    folder_name: "test-folder",
    capability: "THREE_VIEW",
    source_type: "text",
    prompts: [basePromptWithProfile],
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const promptHit = result.error.issues.some(
      (issue) =>
        issue.path.join(".") === "prompts" &&
        String(issue.message).includes("prompts must be empty"),
    );
    const sourceHit = result.error.issues.some(
      (issue) =>
        issue.path.join(".") === "source_portrait_ids" &&
        String(issue.message).includes("source_portrait_ids"),
    );
    assert.ok(promptHit, `应拒绝 THREE_VIEW prompts，实际=${JSON.stringify(result.error.issues)}`);
    assert.ok(sourceHit, `应要求 source_portrait_ids，实际=${JSON.stringify(result.error.issues)}`);
  }
});

register("THREE_VIEW + source_portrait_ids 场景 → 无需 prompts，豁免", () => {
  const result = createBatchJobSchema.safeParse({
    folder_name: "test-folder",
    capability: "THREE_VIEW",
    source_type: "text",
    prompts: [],
    source_portrait_ids: ["570"],
  });
  assert.equal(result.success, true, `应通过，实际 issues=${result.success ? "" : JSON.stringify(result.error.issues)}`);
});

register("THREE_VIEW + 合法 character_profile 但无 source_portrait_ids → 仍失败", () => {
  const result = createBatchJobSchema.safeParse({
    folder_name: "test-folder",
    capability: "THREE_VIEW",
    source_type: "text",
    prompts: [basePromptWithProfile],
  });
  assert.equal(result.success, false, "三视图不允许文本/档案直出");
});

register("PORTRAIT + 合法 character_profile → 应通过", () => {
  const result = createBatchJobSchema.safeParse({
    folder_name: "test-folder",
    capability: "PORTRAIT",
    source_type: "text",
    prompts: [basePromptWithProfile],
  });
  assert.equal(result.success, true, `应通过，实际 issues=${result.success ? "" : JSON.stringify(result.error.issues)}`);
});

register("PORTRAIT 场景模式 + CSV 缺 scene_description → 应失败", () => {
  const result = createBatchJobSchema.safeParse({
    folder_name: "test-folder",
    capability: "PORTRAIT",
    source_type: "csv",
    params: { background_mode: "scene" },
    prompts: [basePromptWithProfile],
  });
  assert.equal(result.success, false, "CSV 场景模式缺场景描述应当被 schema 拒绝");
  if (!result.success) {
    const hit = result.error.issues.some(
      (issue) => issue.path.join(".") === "prompts.0.scene_description",
    );
    assert.ok(hit, `未命中 scene_description issue，实际=${JSON.stringify(result.error.issues)}`);
  }
});

register("PORTRAIT 场景模式 + 文本来源缺 scene_description → 允许 Claude 落空", () => {
  const result = createBatchJobSchema.safeParse({
    folder_name: "test-folder",
    capability: "PORTRAIT",
    source_type: "text",
    params: { background_mode: "scene" },
    prompts: [basePromptWithProfile],
  });
  assert.equal(result.success, true, `文本来源允许为空，实际 issues=${result.success ? "" : JSON.stringify(result.error.issues)}`);
});

register("PORTRAIT 场景模式 + CSV 有 scene_description → 应通过", () => {
  const result = createBatchJobSchema.safeParse({
    folder_name: "test-folder",
    capability: "PORTRAIT",
    source_type: "csv",
    params: { background_mode: "scene" },
    prompts: [
      {
        ...basePromptWithProfile,
        scene_description: "古旧书房，木质书架和窗边暖光作为背景层",
      },
    ],
  });
  assert.equal(result.success, true, `应通过，实际 issues=${result.success ? "" : JSON.stringify(result.error.issues)}`);
});

register("PORTRAIT + unknown gender → 应失败，避免生成时随机性别", () => {
  const result = createBatchJobSchema.safeParse({
    folder_name: "test-folder",
    capability: "PORTRAIT",
    source_type: "text",
    prompts: [
      {
        ...basePromptWithProfile,
        character_profile: {
          ...basePromptWithProfile.character_profile,
          gender: "unknown" as const,
        },
      },
    ],
  });
  assert.equal(result.success, false, "unknown gender 应当被 schema 拒绝");
  if (!result.success) {
    const hit = result.error.issues.some(
      (issue) => issue.path.join(".") === "prompts.0.character_profile.gender",
    );
    assert.ok(hit, `未命中 gender issue，实际=${JSON.stringify(result.error.issues)}`);
  }
});

register("多条 prompts 中一条缺档案 → 精确定位到该下标", () => {
  const result = createBatchJobSchema.safeParse({
    folder_name: "test-folder",
    capability: "PORTRAIT",
    source_type: "text",
    prompts: [basePromptWithProfile, { ...basePromptWithoutProfile, line_no: 2 }],
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const hit = result.error.issues.some(
      (issue) => issue.path.join(".") === "prompts.1.character_profile",
    );
    assert.ok(hit, `应定位到 prompts.1.character_profile，实际=${JSON.stringify(result.error.issues)}`);
  }
});

(async () => {
  let failed = 0;
  for (const c of cases) {
    try {
      await c.run();
      console.log(`PASS  ${c.name}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL  ${c.name}`);
      console.error(err);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
  }
  console.log(`\n${cases.length} test(s) passed.`);
})();
