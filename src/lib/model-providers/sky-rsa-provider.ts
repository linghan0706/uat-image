import { nanoid } from "nanoid";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { isHttpTimeoutError, requestBytes, requestText, type ServerHttpResponse } from "@/lib/http/client";
import { buildSkyRsaAuthHeaders } from "@/lib/model-providers/sky-rsa-auth";
import type {
  GeneratedArtifact,
  GenerateImageInput,
  GenerateImageOutput,
  ModelCapability,
  ModelProvider,
} from "@/lib/model-providers/types";

type PlainRecord = Record<string, unknown>;

type ModelSpec = {
  id: string;
  match: (modelKey: string) => boolean;
  capabilities: ModelCapability[];
  path: string;
  channel: string;
  buildBody: (input: GenerateImageInput, params: PlainRecord) => unknown;
};

const parseSizeParam = (params: Record<string, unknown>): { width: number; height: number } => {
  const raw = params.size;
  if (typeof raw === "string") {
    const match = raw.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
    if (match) {
      return { width: Number(match[1]), height: Number(match[2]) };
    }
  }
  return { width: 1024, height: 1024 };
};

const normalizeModelKey = (value: string) => value.trim().toLowerCase();

const extractReferenceImageUrl = (params: PlainRecord): string | null => {
  const direct = params.reference_image_url;
  if (typeof direct === "string" && direct) {
    return direct;
  }
  const list = params.reference_images;
  if (Array.isArray(list)) {
    const first = list.find((item): item is string => typeof item === "string" && item.length > 0);
    if (first) return first;
  }
  return null;
};

const stripReferenceFields = (params: PlainRecord): PlainRecord => {
  const { reference_image_url: _r, reference_images: _rs, ...rest } = params;
  void _r;
  void _rs;
  return rest;
};

const buildTextToImageBody = (input: GenerateImageInput, params: PlainRecord, channel: string) => {
  const config = { ...params };
  if (input.negativePrompt) {
    config.negative_prompt = input.negativePrompt;
  }
  return {
    type: "text_to_image",
    channel,
    model: input.modelKey,
    is_stream: false,
    is_async: false,
    prompt: input.prompt,
    config,
  };
};

/** MJ 使用原生 `--no a, b, c` 语法表达反向词，写入 prompt 末尾；不传 config.negative_prompt */
const buildMjTextToImageBody = (input: GenerateImageInput, params: PlainRecord, channel: string) => {
  const config = { ...params };
  // 防止 sky 网关把 negative_prompt 字段透传给 MJ 导致被忽略
  delete config.negative_prompt;

  const basePrompt = input.prompt.trim();
  const negativeTerms = (input.negativePrompt ?? "")
    .split(/[,，\n]/)
    .map((term) => term.trim())
    .filter(Boolean);
  const hasExistingNo = /(?:^|\s)--no\b/i.test(basePrompt);
  const finalPrompt =
    negativeTerms.length > 0 && !hasExistingNo
      ? `${basePrompt} --no ${negativeTerms.join(", ")}`
      : basePrompt;

  return {
    type: "text_to_image",
    channel,
    model: input.modelKey,
    is_stream: false,
    is_async: false,
    prompt: finalPrompt,
    config,
  };
};

const buildImageToImageBody = (
  input: GenerateImageInput,
  params: PlainRecord,
  channel: string,
  imageUrl: string,
) => {
  const config = stripReferenceFields(params);
  if (input.negativePrompt) {
    config.negative_prompt = input.negativePrompt;
  }
  return {
    type: "image_to_image",
    channel,
    model: input.modelKey,
    is_stream: false,
    is_async: false,
    prompt: input.prompt,
    image: imageUrl,
    config,
  };
};

const modelRegistry: ModelSpec[] = [
  {
    id: "mj",
    match: (modelKey) => normalizeModelKey(modelKey) === normalizeModelKey(env.skyTextToImageModelMj),
    capabilities: ["TEXT_TO_IMAGE"],
    path: env.skyModelGeneratePathMj,
    channel: env.skyTextToImageChannelMj,
    buildBody: (input, params) => buildMjTextToImageBody(input, params, env.skyTextToImageChannelMj),
  },
  {
    id: "nano_banana",
    match: (modelKey) =>
      normalizeModelKey(modelKey) === normalizeModelKey(env.skyTextToImageModelNanoBanana),
    capabilities: ["TEXT_TO_IMAGE", "IMAGE_TO_IMAGE"],
    path: env.skyModelGeneratePathNanoBanana,
    channel: env.skyTextToImageChannelNanoBanana,
    buildBody: (input, params) => {
      const refUrl = extractReferenceImageUrl(params);
      if (refUrl) {
        return buildImageToImageBody(input, params, env.skyTextToImageChannelNanoBanana, refUrl);
      }
      return buildTextToImageBody(input, params, env.skyTextToImageChannelNanoBanana);
    },
  },
];

const findModelSpec = (modelKey: string): ModelSpec | null =>
  modelRegistry.find((spec) => spec.match(modelKey)) ?? null;

export const modelSupportsCapability = (
  modelKey: string,
  capability: ModelCapability,
): boolean => {
  const spec = findModelSpec(modelKey);
  return spec?.capabilities.includes(capability) ?? false;
};

const resolveCapabilityFallbackPath = (input: GenerateImageInput) => {
  switch (input.capability) {
    case "PORTRAIT":
      return env.skyModelGeneratePathPortrait;
    case "THREE_VIEW":
      return env.skyModelGeneratePathThreeView;
    case "SCENE_CONCEPT":
      return env.skyModelGeneratePathScene;
    default:
      return env.skyModelGeneratePathScene;
  }
};

const resolvePath = (input: GenerateImageInput, spec: ModelSpec | null) => {
  if (spec) return spec.path;
  return resolveCapabilityFallbackPath(input);
};

const guessFormat = (source: string): GeneratedArtifact["format"] => {
  const lower = source.toLowerCase();
  if (lower.includes("image/webp") || lower.endsWith(".webp")) {
    return "webp";
  }
  if (lower.includes("image/jpeg") || lower.includes("image/jpg") || lower.endsWith(".jpeg") || lower.endsWith(".jpg")) {
    return "jpg";
  }
  return "png";
};

const isLikelyBase64 = (value: string) => /^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 64;

const toArtifact = async (
  imageSource: string,
  size: { width: number; height: number },
): Promise<GeneratedArtifact> => {
  if (!imageSource) {
    throw new AppError("E_INTERNAL", "Model returned empty image source.", 500);
  }

  if (imageSource.startsWith("data:image/")) {
    const [meta, data] = imageSource.split(",");
    if (!data) {
      throw new AppError("E_INTERNAL", "Invalid data URI from model response.", 500);
    }
    return {
      format: guessFormat(meta),
      width: size.width,
      height: size.height,
      bytes: Buffer.from(data, "base64"),
    };
  }

  if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
    const response = await requestBytes({
      url: imageSource,
      method: "GET",
    });
    if (!response.ok) {
      throw new AppError("E_INTERNAL", `Failed to download model image: ${response.status}`, 500);
    }
    return {
      format: guessFormat(response.headers.get("content-type") || imageSource),
      width: size.width,
      height: size.height,
      bytes: response.data,
    };
  }

  if (isLikelyBase64(imageSource)) {
    return {
      format: "png",
      width: size.width,
      height: size.height,
      bytes: Buffer.from(imageSource.replace(/\s+/g, ""), "base64"),
    };
  }

  throw new AppError("E_INTERNAL", "Unsupported image source format from model response.", 500);
};

const extractImageSources = (payload: PlainRecord): string[] => {
  const rootCandidates: unknown[] = [
    payload.images,
    (payload.data as PlainRecord | undefined)?.images,
    (payload.result as PlainRecord | undefined)?.images,
  ];

  for (const candidate of rootCandidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            const src = item as PlainRecord;
            return (
              (typeof src.url === "string" && src.url) ||
              (typeof src.image_url === "string" && src.image_url) ||
              (typeof src.base64 === "string" && src.base64) ||
              ""
            );
          }
          return "";
        })
        .filter(Boolean);
    }
  }

  const partsCandidates: unknown[] = [
    (payload.data as PlainRecord | undefined)?.parts,
    payload.parts,
  ];

  for (const parts of partsCandidates) {
    if (!Array.isArray(parts) || parts.length === 0) continue;
    const found = parts
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const partObj = part as PlainRecord;
        const inlineData = partObj.inline_data as PlainRecord | undefined;
        return (typeof inlineData?.data === "string" && inlineData.data) || "";
      })
      .filter(Boolean);
    if (found.length > 0) {
      return found;
    }
  }

  return [];
};

const parseResponseJson = (raw: string, contentType: string) => {
  if (!contentType.includes("application/json")) {
    throw new AppError("E_INTERNAL", `Model response is not JSON: ${raw.slice(0, 300)}`, 500);
  }
  return JSON.parse(raw) as PlainRecord;
};

const buildRequestBody = (input: GenerateImageInput, spec: ModelSpec | null) => {
  const params = { ...input.params };
  // Remove view_set from params sent to model — three-view is generated as a single image
  delete params.view_set;

  if (spec) {
    return spec.buildBody(input, params);
  }

  return {
    model: input.modelKey,
    capability: input.capability,
    prompt: input.prompt,
    negative_prompt: input.negativePrompt ?? undefined,
    params,
    stream: false,
  };
};

export class SkyRsaModelProvider implements ModelProvider {
  name = "sky_rsa";

  supportsCapability(modelKey: string, capability: ModelCapability): boolean {
    return modelSupportsCapability(modelKey, capability);
  }

  async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
    if (!env.skyModelUrl) {
      throw new AppError("E_INVALID_PARAM", "Missing SKY_MODEL_URL.", 500);
    }

    const requestId = `sky_${nanoid(12)}`;
    const authHeaders = buildSkyRsaAuthHeaders(requestId);
    const spec = findModelSpec(input.modelKey);
    const targetPath = resolvePath(input, spec);
    const targetUrl = new URL(targetPath, env.skyModelUrl).toString();

    const requestedSize = parseSizeParam(input.params);
    const body = buildRequestBody(input, spec);

    let response: ServerHttpResponse<string>;
    try {
      response = await requestText({
        url: targetUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        data: JSON.stringify(body),
        timeout: env.skyModelTimeoutMs,
      });
    } catch (error) {
      if (isHttpTimeoutError(error)) {
        throw new AppError("E_PROVIDER_TIMEOUT", "Model request timeout.", 504);
      }
      throw error;
    }

    const payload = parseResponseJson(response.data, response.headers.get("content-type") || "");
    const code = payload.code;
    if (!response.ok) {
      const message = typeof payload.message === "string" ? payload.message : `HTTP ${response.status}`;
      throw new AppError("E_INTERNAL", `Model request failed: ${message}`, response.status);
    }
    if (code !== undefined && Number(code) !== 0) {
      const message = typeof payload.message === "string" ? payload.message : "Model returned business error.";
      throw new AppError("E_INTERNAL", `Model business error(${code}): ${message}`, 502);
    }

    const imageSources = extractImageSources(payload);
    if (imageSources.length === 0) {
      throw new AppError("E_INTERNAL", "Model response has no image payload.", 500);
    }

    const allArtifacts: GeneratedArtifact[] = [];
    for (const source of imageSources) {
      const artifact = await toArtifact(source, requestedSize);
      allArtifacts.push(artifact);
    }

    return {
      artifacts: allArtifacts,
      providerRequestId: requestId,
    };
  }
}
