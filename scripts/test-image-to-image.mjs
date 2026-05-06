/**
 * SKY 第三方模型 API 回归测试：MJ / Banana 分辨率参数穿透。
 *
 * 用法:
 *   node --env-file=.env scripts/test-image-to-image.mjs
 *
 * 覆盖:
 *   1. TEXT_TO_IMAGE / mj: 验证 aspect_ratio 穿透。
 *   2. TEXT_TO_IMAGE / nano_banana: 验证 size + aspect_ratio 穿透。
 *   3. IMAGE_TO_IMAGE / nano_banana: 验证 first_image_url + size + aspect_ratio 穿透。
 *   4. 解析服务商返回图片真实宽高，并输出分辨率列表。
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
const MJ_MODEL = env("SKY_TEXT_TO_IMAGE_MODEL_MJ", "midj_default");
const NB_MODEL = env("SKY_TEXT_TO_IMAGE_MODEL_NANO_BANANA", "Nano Banana Pro");
const TIMEOUT_MS = Number(env("SKY_MODEL_TIMEOUT_MS", "120000"));

const REF_IMAGE_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

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

const isRecord = (value) => value && typeof value === "object" && !Array.isArray(value);

const extractImageSources = (payload) => {
  const candidates = [
    payload?.data,
    payload?.image,
    payload?.image_url,
    payload?.imageUrl,
    payload?.images,
    payload?.image_urls,
    payload?.imageUrls,
    payload?.urls,
    payload?.output,
    payload?.data?.images,
    payload?.data?.image,
    payload?.data?.image_url,
    payload?.data?.imageUrl,
    payload?.data?.image_urls,
    payload?.data?.imageUrls,
    payload?.data?.urls,
    payload?.data?.output,
    payload?.data?.result?.images,
    payload?.result?.images,
  ];

  const values = [];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      values.push(candidate);
      continue;
    }
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) {
      if (typeof item === "string") {
        values.push(item);
      } else if (isRecord(item)) {
        values.push(item.url, item.image_url, item.imageUrl, item.base64, item.b64_json);
      }
    }
  }

  const partsCandidates = [payload?.parts, payload?.data?.parts, payload?.candidates?.[0]?.content?.parts];
  for (const parts of partsCandidates) {
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!isRecord(part)) continue;
      values.push(part?.inline_data?.data, part?.inlineData?.data);
    }
  }

  return values.filter((value) => typeof value === "string" && value.length > 0);
};

const readPngDimensions = (bytes) => {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: "png" };
  }
  return null;
};

const readJpegDimensions = (bytes) => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = bytes.readUInt16BE(offset);
    if (length < 2) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        width: bytes.readUInt16BE(offset + 5),
        height: bytes.readUInt16BE(offset + 3),
        format: "jpg",
      };
    }
    offset += length;
  }
  return null;
};

const readWebpDimensions = (bytes) => {
  if (
    bytes.length < 30 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
      format: "webp",
    };
  }
  if (chunk === "VP8 ") {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
      format: "webp",
    };
  }
  return null;
};

const readImageDimensions = (bytes) => readPngDimensions(bytes) ?? readJpegDimensions(bytes) ?? readWebpDimensions(bytes);

const imageSourceToBytes = async (source) => {
  if (source.startsWith("data:image/")) {
    const [, data = ""] = source.split(",");
    return Buffer.from(data, "base64");
  }
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return Buffer.from(source.replace(/\s+/g, ""), "base64");
};

const collectReturnedDimensions = async (payload) => {
  const sources = extractImageSources(payload);
  const dimensions = [];
  for (const source of sources.slice(0, 3)) {
    try {
      const bytes = await imageSourceToBytes(source);
      const size = readImageDimensions(bytes);
      dimensions.push(size ?? { error: "unsupported image bytes" });
    } catch (error) {
      dimensions.push({ error: error?.message ?? String(error) });
    }
  }
  return { imageCount: sources.length, dimensions };
};

const callSky = async ({ name, path, body }) => {
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
    const elapsedMs = Number((performance.now() - startedAt).toFixed(0));

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text.slice(0, 300);
    }

    const returned = isRecord(payload) ? await collectReturnedDimensions(payload) : { imageCount: 0, dimensions: [] };
    const ok = res.ok && (isRecord(payload) ? Number(payload?.code ?? 0) === 0 : true) && returned.imageCount > 0;

    return {
      name,
      ok,
      status: res.status,
      elapsedMs,
      requestId,
      requestedConfig: body.config,
      returned,
      payload,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 0,
      elapsedMs: Number((performance.now() - startedAt).toFixed(0)),
      requestId,
      requestedConfig: body.config,
      returned: { imageCount: 0, dimensions: [] },
      error: `${error?.name ?? "Error"}: ${error?.message ?? String(error)} [code=${error?.code ?? "?"} cause=${error?.cause?.code ?? "-"}]`,
    };
  } finally {
    clearTimeout(timer);
  }
};

const dimensionsText = (dimensions) =>
  dimensions
    .map((item) => ("width" in item ? `${item.width}x${item.height}` : `unknown(${item.error})`))
    .join(", ");

const summarizeFailure = (result) => {
  if (result.error) return result.error;
  const msg =
    result.payload?.msg ??
    result.payload?.message ??
    result.payload?.error ??
    result.payload?.data?.message ??
    result.payload?.data?.msg ??
    result.payload?.data ??
    result.payload?.code;
  return typeof msg === "string" ? msg.slice(0, 180) : JSON.stringify(msg).slice(0, 180);
};

const main = async () => {
  console.log("========== SKY MJ / Banana 分辨率穿透回归测试 ==========");
  console.log("SKY_MODEL_URL :", SKY_URL);
  console.log("MJ path       :", MJ_PATH);
  console.log("NB path       :", NB_PATH);
  console.log("timeout (ms)  :", TIMEOUT_MS);
  console.log("");

  const cases = [
    {
      name: "TEXT_TO_IMAGE / mj / 1:1",
      path: MJ_PATH,
      body: {
        type: "text_to_image",
        channel: MJ_CHANNEL,
        model: MJ_MODEL,
        is_stream: false,
        is_async: false,
        prompt: "a calm portrait of a young woman, studio lighting, plain background",
        config: { aspect_ratio: "1:1", count: 1 },
      },
    },
    {
      name: "TEXT_TO_IMAGE / nano_banana / 1024x1024",
      path: NB_PATH,
      body: {
        type: "text_to_image",
        channel: NB_CHANNEL,
        model: NB_MODEL,
        is_stream: false,
        is_async: false,
        prompt: "a calm portrait of a young man, studio lighting, plain background",
        config: { size: "1024x1024", aspect_ratio: "1:1", count: 1 },
      },
    },
    {
      name: "TEXT_TO_IMAGE / nano_banana / 1344x768",
      path: NB_PATH,
      body: {
        type: "text_to_image",
        channel: NB_CHANNEL,
        model: NB_MODEL,
        is_stream: false,
        is_async: false,
        prompt: "a clean cinematic landscape, simple composition, no text",
        config: { size: "1344x768", aspect_ratio: "16:9", count: 1 },
      },
    },
    {
      name: "IMAGE_TO_IMAGE / nano_banana / first_image_url / 1024x1024",
      path: NB_PATH,
      body: {
        type: "image_to_image",
        channel: NB_CHANNEL,
        model: NB_MODEL,
        is_stream: false,
        is_async: false,
        first_image_url: REF_IMAGE_DATA_URI,
        prompt: "transform the reference into a clean character portrait, plain background",
        config: { size: "1024x1024", aspect_ratio: "1:1", count: 1 },
      },
    },
  ];

  const results = [];
  for (const testCase of cases) {
    results.push(await callSky(testCase));
  }

  console.log("========== 结果 ==========");
  for (const result of results) {
    const tag = result.ok ? "PASS" : "FAIL";
    const dims = dimensionsText(result.returned.dimensions) || "unparsed";
    const details = result.ok
      ? `requested=${JSON.stringify(result.requestedConfig)} images=${result.returned.imageCount} returned=${dims}`
      : `http=${result.status} msg=${summarizeFailure(result)}`;
    console.log(`${tag.padEnd(4)}  ${result.name.padEnd(58)}  ${String(result.elapsedMs).padStart(6)}ms  ${details}`);
  }

  console.log("");
  console.log("========== 第三方服务商返回图片分辨率列表 ==========");
  for (const result of results.filter((item) => item.ok)) {
    console.log(`- ${result.name}: ${dimensionsText(result.returned.dimensions) || "未能解析图片尺寸"}`);
  }

  const failed = results.filter((result) => !result.ok);
  console.log("");
  if (failed.length) {
    console.log(`${failed.length}/${results.length} 失败`);
    console.log("");
    console.log("失败详情:");
    for (const result of failed) {
      console.log(`  - ${result.name} -> ${JSON.stringify(result, null, 2).slice(0, 800)}`);
    }
    process.exit(1);
  }

  console.log(`${results.length}/${results.length} 全部通过`);
};

main().catch((error) => {
  console.error("致命错误:", error);
  process.exit(1);
});
