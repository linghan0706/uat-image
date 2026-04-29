/**
 * 端到端测试图生图链路。
 *
 * 用法:
 *   npx tsx scripts/test-image-to-image.ts
 *
 * 测试内容:
 *   1. 文生图 (TEXT_TO_IMAGE) — 基础链路
 *   2. 图生图 (IMAGE_TO_IMAGE, 用 reference_image_url 形式)
 *
 * 退出码:
 *   0 = 全部成功
 *   1 = 任一失败
 */

/**
 * 端到端测试 SKY 服务商图生图链路（直接 fetch，不走 Next.js）。
 *
 * 用法:
 *   node --env-file=.env scripts/test-image-to-image.mjs
 *
 * 测试内容:
 *   1. TCP/TLS 基础连通性
 *   2. 文生图 (TEXT_TO_IMAGE / mj 通道) — 验证 RSA 鉴权 + 接口可用
 *   3. 图生图 (IMAGE_TO_IMAGE / nano_banana + reference_image_url) — 用户报错的链路
 */

import crypto from "node:crypto";
import { performance } from "node:perf_hooks";

const env = (key, fallback = undefined) => {
  const v = process.env[key];
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing env: ${key}`);
};

const SKY_URL = env("SKY_MODEL_URL");
const API_KEY = env("SKY_MODEL_API_KEY");
const PUBLIC_PEM = env("SKY_MODEL_PUBLIC_KEY_PEM").replace(/\\n/g, "\n");
const PRIVATE_PEM = env("SKY_MODEL_PRIVATE_KEY_PEM", "").replace(/\\n/g, "\n");
const AUTH_HEADER = env("SKY_MODEL_AUTH_HEADER", "Authorization");
const TS_HEADER = env("SKY_MODEL_TIMESTAMP_HEADER", "X-SKY-TIMESTAMP");
const SIG_HEADER = env("SKY_MODEL_SIGNATURE_HEADER", "X-SKY-SIGNATURE");
const REQID_HEADER = env("SKY_MODEL_REQ_ID_HEADER", "X-REQUEST-ID");
const MJ_PATH = env("SKY_MODEL_GENERATE_PATH_MJ", "/api/v1/generate_images");
const NB_PATH = env("SKY_MODEL_GENERATE_PATH_NANO_BANANA", "/api/v1/gemini/generate_images");
const MJ_CHANNEL = env("SKY_TEXT_TO_IMAGE_CHANNEL_MJ", "mj");
const NB_CHANNEL = env("SKY_TEXT_TO_IMAGE_CHANNEL_NANO_BANANA", "gemini");
const TIMEOUT_MS = Number(env("SKY_MODEL_TIMEOUT_MS", "120000"));

const buildAuthHeaders = (requestId) => {
  const ts = Math.floor(Date.now() / 1000).toString();
  const plain = `${ts}.${API_KEY}`;
  const encrypted = crypto
    .publicEncrypt({ key: PUBLIC_PEM, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(plain, "utf-8"))
    .toString("base64");
  const headers = {
    [AUTH_HEADER]: `Bearer ${encrypted}`,
    [TS_HEADER]: ts,
    [REQID_HEADER]: requestId,
    "Content-Type": "application/json",
  };
  if (PRIVATE_PEM) {
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(plain, "utf-8");
    sign.end();
    headers[SIG_HEADER] = sign.sign(PRIVATE_PEM, "base64");
  }
  return headers;
};

const REF_IMAGE_URL =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png";

const callSky = async (name, path, body) => {
  const requestId = `test_${crypto.randomBytes(6).toString("hex")}`;
  const url = new URL(path, SKY_URL).toString();
  const startedAt = performance.now();

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort("client-timeout"), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: buildAuthHeaders(requestId),
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    const elapsed = (performance.now() - startedAt).toFixed(0);

    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 300); }

    return {
      name,
      ok: res.ok && (typeof parsed === "object" ? Number(parsed?.code ?? 0) === 0 : true),
      status: res.status,
      elapsedMs: Number(elapsed),
      requestId,
      payload: parsed,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 0,
      elapsedMs: Number((performance.now() - startedAt).toFixed(0)),
      requestId,
      error: `${error?.name ?? "Error"}: ${error?.message ?? String(error)} [code=${error?.code ?? "?"} cause=${error?.cause?.code ?? "-"}]`,
    };
  } finally {
    clearTimeout(timer);
  }
};

const summarize = (r) => {
  if (r.ok) {
    const p = r.payload;
    const imgs = p?.data?.images?.length ?? p?.images?.length ?? "?";
    return `images=${imgs}`;
  }
  if (r.error) return `error=${r.error}`;
  const msg = r.payload?.msg ?? r.payload?.message ?? r.payload?.code;
  return `http=${r.status} msg=${typeof msg === "string" ? msg.slice(0, 120) : JSON.stringify(msg).slice(0, 120)}`;
};

const main = async () => {
  console.log("========== SKY 图生图链路测试 ==========");
  console.log("SKY_MODEL_URL :", SKY_URL);
  console.log("MJ path       :", MJ_PATH);
  console.log("NB path       :", NB_PATH);
  console.log("timeout (ms)  :", TIMEOUT_MS);
  console.log("");

  const results = [];
  const MJ_MODEL = process.env.SKY_TEXT_TO_IMAGE_MODEL_MJ || "midj_default";
  const NB_MODEL = process.env.SKY_TEXT_TO_IMAGE_MODEL_NANO_BANANA || "Nano Banana Pro";

  // 1. TEXT_TO_IMAGE / mj —— 验证基础链路 + 鉴权
  results.push(
    await callSky("TEXT_TO_IMAGE / mj", MJ_PATH, {
      type: "text_to_image",
      channel: MJ_CHANNEL,
      model: MJ_MODEL,
      is_stream: false,
      is_async: false,
      prompt: "a calm portrait of a young woman, studio lighting, plain background",
      config: { aspect_ratio: "1:1", count: 1 },
    }),
  );

  // 2. TEXT_TO_IMAGE / nano_banana
  results.push(
    await callSky("TEXT_TO_IMAGE / nano_banana", NB_PATH, {
      type: "text_to_image",
      channel: NB_CHANNEL,
      model: NB_MODEL,
      is_stream: false,
      is_async: false,
      prompt: "a calm portrait of a young man, studio lighting, plain background",
      config: { size: "1024x1024", count: 1 },
    }),
  );

  // 3. IMAGE_TO_IMAGE / nano_banana + reference URL —— 用户实际报错的链路
  results.push(
    await callSky("IMAGE_TO_IMAGE / nano_banana + ref URL", NB_PATH, {
      type: "image_to_image",
      channel: NB_CHANNEL,
      model: NB_MODEL,
      is_stream: false,
      prompt: [
        {
          role: "user",
          parts: [
            { text: "transform the reference into a 3-view character sheet" },
            {
              inline_data: {
                data: REF_IMAGE_URL,
                mime_type: "image/png",
                display_name: "source_portrait",
              },
            },
          ],
        },
      ],
      config: { count: 1 },
    }),
  );

  console.log("========== 结果 ==========");
  for (const r of results) {
    const tag = r.ok ? "✅ PASS" : "❌ FAIL";
    console.log(`${tag}  ${r.name.padEnd(42)}  ${String(r.elapsedMs).padStart(6)}ms  status=${r.status}  ${summarize(r)}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log("");
  if (failed.length) {
    console.log(`${failed.length}/${results.length} 失败 ❌`);
    console.log("");
    console.log("失败详情:");
    for (const r of failed) console.log("  -", r.name, "→", JSON.stringify(r, null, 2).slice(0, 500));
    process.exit(1);
  }
  console.log(`${results.length}/${results.length} 全部通过 ✅`);
};

main().catch((error) => {
  console.error("致命错误:", error);
  process.exit(1);
});
