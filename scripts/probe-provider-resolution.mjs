/**
 * Probe SKY MJ / Banana high-resolution passthrough.
 *
 * Resolution here means provider clarity tier, not canvas width/height.
 *
 * Usage:
 *   node --env-file=.env scripts/probe-provider-resolution.mjs
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const env = (key, fallback = undefined) => {
  const value = process.env[key];
  if (value !== undefined && value !== "") return value;
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
const OUTPUT_DIR = path.resolve("public/provider-resolution-probes");
const PUBLIC_PREFIX = "/provider-resolution-probes";

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

const collectCandidate = (values, candidate) => {
  if (typeof candidate === "string") {
    values.push(candidate);
    return;
  }
  if (!isRecord(candidate)) return;
  values.push(candidate.url, candidate.image_url, candidate.imageUrl, candidate.base64, candidate.b64_json);
};

const extractImageSources = (payload) => {
  const values = [];
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
    payload?.data?.image,
    payload?.data?.image_url,
    payload?.data?.imageUrl,
    payload?.data?.images,
    payload?.data?.image_urls,
    payload?.data?.imageUrls,
    payload?.data?.urls,
    payload?.data?.output,
    payload?.data?.result?.images,
    payload?.result?.images,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) collectCandidate(values, item);
    } else {
      collectCandidate(values, candidate);
    }
  }

  for (const parts of [payload?.parts, payload?.data?.parts, payload?.candidates?.[0]?.content?.parts]) {
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      values.push(part?.inline_data?.data, part?.inlineData?.data);
    }
  }

  return values.filter((value) => typeof value === "string" && value.length > 0);
};

const sourceToBytes = async (source) => {
  if (source.startsWith("data:image/")) {
    return Buffer.from(source.split(",")[1] ?? "", "base64");
  }
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`download failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  return Buffer.from(source.replace(/\s+/g, ""), "base64");
};

const readPng = (bytes) => {
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

const readJpeg = (bytes) => {
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
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3), format: "jpg" };
    }
    offset += length;
  }
  return null;
};

const readWebp = (bytes) => {
  if (
    bytes.length < 30 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3), format: "webp" };
  }
  if (chunk === "VP8 ") {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff, format: "webp" };
  }
  return null;
};

const readImage = (bytes) => readPng(bytes) ?? readJpeg(bytes) ?? readWebp(bytes);

const formatMb = (bytes) => Number((bytes / 1024 / 1024).toFixed(2));

const inspectSource = async (source) => {
  const bytes = await sourceToBytes(source);
  const image = readImage(bytes);
  return {
    sourceKind: /^https?:\/\//i.test(source) ? "url" : source.startsWith("data:image/") ? "data-uri" : "base64",
    ...(image ?? { error: "unknown image format" }),
    bytes: bytes.length,
    bytesMb: formatMb(bytes.length),
    imageBytes: image ? bytes : null,
  };
};

const buildPrompt = (resolution) =>
  [
    "a simple studio product photo of a matte white ceramic cube on a plain gray background",
    "no text, no watermark",
    `${resolution} ultra high resolution, ${resolution} clarity, export-quality detail`,
    "sharp fine texture, crisp edges, high fidelity image",
  ].join(", ");

const buildBody = (provider, resolution) => {
  const common = {
    type: "text_to_image",
    is_stream: false,
    is_async: false,
    prompt: buildPrompt(resolution),
    config: {
      aspect_ratio: "1:1",
      image_size: resolution,
      resolution,
      count: 1,
    },
  };
  if (provider === "mj") {
    return { ...common, channel: MJ_CHANNEL, model: MJ_MODEL };
  }
  return { ...common, channel: NB_CHANNEL, model: NB_MODEL };
};

const saveInspection = async ({ provider, resolution, index, inspection }) => {
  if (!inspection.imageBytes || !inspection.format) {
    return inspection;
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const fileName = `${provider}-${resolution.toLowerCase()}-${index}.${inspection.format}`;
  const filePath = path.join(OUTPUT_DIR, fileName);
  await fs.writeFile(filePath, inspection.imageBytes);

  const { imageBytes: _imageBytes, ...rest } = inspection;
  void _imageBytes;
  return {
    ...rest,
    savedPath: filePath,
    publicPath: `${PUBLIC_PREFIX}/${fileName}`,
  };
};

const runCase = async (testCase) => {
  const requestId = `res_${crypto.randomBytes(6).toString("hex")}`;
  const startedAt = performance.now();
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort("client-timeout"), TIMEOUT_MS);

  try {
    const response = await fetch(new URL(testCase.path, SKY_URL), {
      method: "POST",
      headers: buildAuthHeaders(requestId),
      body: JSON.stringify(testCase.body),
      signal: abortController.signal,
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }

    const imageSources = isRecord(payload) ? extractImageSources(payload) : [];
    const dimensions = [];
    const maxImages = testCase.provider === "mj" ? 4 : 4;
    for (const [sourceIndex, source] of imageSources.slice(0, maxImages).entries()) {
      try {
        const inspection = await inspectSource(source);
        dimensions.push(
          await saveInspection({
            provider: testCase.provider,
            resolution: testCase.resolution,
            index: sourceIndex + 1,
            inspection,
          }),
        );
      } catch (error) {
        dimensions.push({ error: error instanceof Error ? error.message : String(error) });
      }
    }

    return {
      name: testCase.name,
      requestId,
      status: response.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      ok: response.ok && isRecord(payload) && Number(payload.code ?? 0) === 0 && imageSources.length > 0,
      prompt: testCase.body.prompt,
      requestedConfig: testCase.body.config,
      imageCount: imageSources.length,
      dimensions,
      message: isRecord(payload) ? payload.message ?? payload.msg ?? payload.data?.message ?? null : String(payload).slice(0, 200),
    };
  } catch (error) {
    return {
      name: testCase.name,
      requestId,
      status: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      ok: false,
      prompt: testCase.body.prompt,
      requestedConfig: testCase.body.config,
      imageCount: 0,
      dimensions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
};

const cases = [
  { provider: "mj", resolution: "8K", name: "MJ clarity 8K", path: MJ_PATH, body: buildBody("mj", "8K") },
  { provider: "mj", resolution: "4K", name: "MJ clarity 4K", path: MJ_PATH, body: buildBody("mj", "4K") },
  { provider: "mj", resolution: "2K", name: "MJ clarity 2K", path: MJ_PATH, body: buildBody("mj", "2K") },
  {
    provider: "banana",
    resolution: "4K",
    name: "Banana clarity 4K",
    path: NB_PATH,
    body: buildBody("banana", "4K"),
  },
  {
    provider: "banana",
    resolution: "2K",
    name: "Banana clarity 2K",
    path: NB_PATH,
    body: buildBody("banana", "2K"),
  },
];

const results = [];
for (const testCase of cases) {
  console.log(`RUN ${testCase.name}`);
  const result = await runCase(testCase);
  results.push(result);
  const dimensions = result.dimensions
    .map((item) =>
      "width" in item
        ? `${item.width}x${item.height} ${item.format} ${item.bytes}B ${item.bytesMb}MB ${item.publicPath ?? "not-saved"}`
        : `unknown(${item.error})`,
    )
    .join(", ");
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}: ${dimensions || "no image"} (${result.elapsedMs}ms)`);
}

console.log("");
console.log("========== Saved Images ==========");
for (const result of results) {
  for (const item of result.dimensions) {
    if ("savedPath" in item) {
      console.log(
        `${result.name} requestId=${result.requestId} ${item.width}x${item.height} ${item.format} ${item.bytes}B ${item.bytesMb}MB ${item.publicPath} -> ${item.savedPath}`,
      );
    }
  }
}

const highResolutionMisses = results.flatMap((result) =>
  result.dimensions
    .filter((item) => "width" in item && (item.width < 2000 || item.height < 2000))
    .map((item) => `${result.name}: returned ${item.width}x${item.height}`),
);
if (highResolutionMisses.length > 0) {
  console.log("");
  console.log("服务商接受高分辨率档位参数，但未返回高分辨率产物:");
  for (const miss of highResolutionMisses) {
    console.log(`- ${miss}`);
  }
}

console.log("");
console.log(JSON.stringify(results, null, 2));
