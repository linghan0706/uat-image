/**
 * 模型选项单元测试（不依赖数据库）
 *
 * 运行：npx tsx tests/unit/model-options.test.ts
 *
 * 覆盖：
 *   - PORTRAIT 默认 MJ 文生图模型必须允许前端选择
 */

import { strict as assert } from "node:assert";

import { env } from "../../src/lib/env";
import { listDefaultBootstrapModels } from "../../src/services/bootstrap-models";

const models = listDefaultBootstrapModels();

const portraitMj = models.find(
  (model) =>
    model.capability === "PORTRAIT" &&
    model.modelKey === env.skyTextToImageModelMj,
);

assert.ok(portraitMj, "PORTRAIT MJ bootstrap model must exist");
assert.equal(
  portraitMj.allowFrontSelect,
  true,
  "PORTRAIT MJ text-to-image model must be visible in the frontend model list",
);

console.log("1 passed, 0 failed, 1 total");
