import { expect, test, type Page } from "@playwright/test";

const ok = (data: unknown) => ({
  code: "OK",
  message: "success",
  data,
});

const portraitJob = {
  id: "job-portrait",
  job_no: "BJ_TEST_PORTRAIT",
  task_name: "定妆照审核测试",
  folder_name: "test-output",
  capability: "PORTRAIT",
  status: "SUCCESS",
  total_count: 1,
  success_count: 1,
  failed_count: 0,
  source_type: "text",
  created_at: "2026/4/27 12:00:00",
  finished_at: "2026/4/27 12:01:00",
};

const threeViewJob = {
  ...portraitJob,
  id: "job-three-view",
  job_no: "BJ_TEST_THREE_VIEW",
  task_name: "三视图创建结果",
  capability: "THREE_VIEW",
};

const jobItem = {
  id: "item-1",
  item_no: "IT_TEST_1",
  line_no: 1,
  prompt: "角色设定",
  source_mode: "template",
  prompt_blocks: {
    part1: "定妆照指令",
    part2: "冷峻写实",
    part3: "银发角色",
    part4: "电影感",
  },
  character_name: "银发角色",
  model_key: "midj_default",
  status: "SUCCESS",
  retry_count: 0,
  max_retry: 3,
  error_code: null,
  error_message: null,
  source_portrait_id: null,
  started_at: null,
  finished_at: null,
};

const makePortraitImage = (selected: boolean) => ({
  id: "101",
  batch_job_id: "job-portrait",
  job_item_id: "item-1",
  capability: "PORTRAIT",
  variant_index: 1,
  format: "png",
  width: 1024,
  height: 1536,
  file_size: "1024",
  access_url: "/mock/portrait.png",
  download_url: "/api/v1/files/image-results/101",
  is_selected_portrait: selected,
  selected_at: selected ? "2026/4/27 12:02:00" : null,
  created_at: "2026/4/27 12:01:00",
});

async function mockApi(page: Page) {
  let selected = false;
  let createBatchBody: unknown = null;
  const apiRequests: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/v1/")) {
      apiRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.context().route("**/mock/portrait.png", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5fN6kAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  });

  await page.context().route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/v1/batch-jobs" && request.method() === "POST") {
      createBatchBody = request.postDataJSON();
      await route.fulfill({ json: ok({ id: threeViewJob.id }) });
      return;
    }
    if (path === "/api/v1/batch-jobs") {
      await route.fulfill({ json: ok({ list: [portraitJob], page: 1, page_size: 20, total: 1 }) });
      return;
    }
    if (path === "/api/v1/batch-jobs/job-portrait") {
      await route.fulfill({ json: ok(portraitJob) });
      return;
    }
    if (path === "/api/v1/batch-jobs/job-three-view") {
      await route.fulfill({ json: ok(threeViewJob) });
      return;
    }
    if (path === "/api/v1/batch-jobs/job-portrait/items") {
      await route.fulfill({ json: ok({ list: [jobItem], page: 1, page_size: 100, total: 1 }) });
      return;
    }
    if (path === "/api/v1/batch-jobs/job-three-view/items") {
      await route.fulfill({ json: ok({ list: [], page: 1, page_size: 100, total: 0 }) });
      return;
    }
    if (path === "/api/v1/batch-jobs/job-portrait/images") {
      await route.fulfill({ json: ok({ list: [makePortraitImage(selected)], page: 1, page_size: 100, total: 1 }) });
      return;
    }
    if (path === "/api/v1/batch-jobs/job-three-view/images") {
      await route.fulfill({ json: ok({ list: [], page: 1, page_size: 100, total: 0 }) });
      return;
    }
    if (path === "/api/v1/image-results/101/portrait-selection") {
      const body = request.postDataJSON() as { selected: boolean };
      selected = body.selected;
      await route.fulfill({
        json: ok({
          id: "101",
          batch_job_id: "job-portrait",
          job_item_id: "item-1",
          capability: "PORTRAIT",
          is_selected_portrait: selected,
          selected_at: selected ? "2026/4/27 12:02:00" : null,
        }),
      });
      return;
    }
    if (path === "/api/v1/model-options") {
      await route.fulfill({ json: ok({ models: [{ modelKey: "three_model", isDefault: true }] }) });
      return;
    }

    await route.fulfill({ status: 404, json: { code: "E_NOT_MOCKED", message: path } });
  });

  return {
    getCreateBatchBody: () => createBatchBody,
    getApiRequests: () => apiRequests,
  };
}

test("selects a portrait and creates a three-view job from selected portraits", async ({ page }) => {
  const api = await mockApi(page);

  await page.goto("/");
  await expect.poll(() => api.getApiRequests().join("\n")).toContain("/api/v1/batch-jobs");
  await page.getByRole("button", { name: /定妆照审核测试/ }).click();
  await expect(page.getByRole("button", { name: "选为定妆照" })).toBeVisible();

  await page.getByRole("button", { name: "选为定妆照" }).click();
  await expect(page.getByRole("button", { name: "取消选择定妆照" })).toBeVisible();
  await expect(page.getByText("已审核入库")).toBeVisible();

  await page.getByRole("tab", { name: "创建任务" }).click();
  await page.getByRole("button", { name: /三视图/ }).click();
  await expect(page.getByText("将基于")).toBeVisible();
  await expect(page.getByText("银发角色").first()).toBeVisible();

  await page.getByRole("button", { name: /创建三视图/ }).click();
  await expect.poll(() => api.getCreateBatchBody()).toMatchObject({
    capability: "THREE_VIEW",
    prompts: [],
    source_portrait_ids: ["101"],
  });
});

test("removing a selected portrait from the create panel does not cancel database selection", async ({ page }) => {
  const api = await mockApi(page);

  await page.goto("/");
  await expect.poll(() => api.getApiRequests().join("\n")).toContain("/api/v1/batch-jobs");
  await page.getByRole("button", { name: /定妆照审核测试/ }).click();
  await page.getByRole("button", { name: "选为定妆照" }).click();
  await page.getByRole("tab", { name: "创建任务" }).click();
  await page.getByRole("button", { name: /三视图/ }).click();

  await page.getByRole("button", { name: /从本次三视图创建移除/ }).click();
  await expect(page.getByText("本次创建来源已全部移除")).toBeVisible();
  await page.getByRole("tab", { name: "任务详情" }).click();
  await expect(page.getByRole("button", { name: "取消选择定妆照" })).toBeVisible();
});
