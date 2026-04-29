import { nanoid } from "nanoid";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { isHttpTimeoutError, requestBytes, requestText, type ServerHttpResponse } from "@/lib/http/client";
import { logger } from "@/lib/logger";
import { buildSkyRsaAuthHeaders } from "@/lib/model-providers/sky-rsa-auth";
import {
  buildSkyRsaRequestBodyPreview,
  modelSupportsCapability,
  parseSkySizeParam,
  resolveSkyRsaPath,
} from "@/lib/model-providers/sky-rsa-request";
import type {
  GeneratedArtifact,
  GenerateImageInput,
  GenerateImageOutput,
  ModelCapability,
  ModelProvider,
} from "@/lib/model-providers/types";

type PlainRecord = Record<string, unknown>;

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

const truncate = (value: string, max = 800) => (value.length > max ? `${value.slice(0, max)}...` : value);

const extractProviderMessage = (payload: PlainRecord): string => {
  const candidates = [
    payload.message,
    payload.msg,
    payload.error,
    (payload.data as PlainRecord | undefined)?.message,
    (payload.data as PlainRecord | undefined)?.msg,
    (payload.data as PlainRecord | undefined)?.error,
    (payload.result as PlainRecord | undefined)?.message,
    (payload.result as PlainRecord | undefined)?.msg,
    (payload.result as PlainRecord | undefined)?.error,
  ];
  const hit = candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const data = typeof payload.data === "string" && payload.data.trim().length > 0 ? payload.data : null;
  if (hit && data) return `${hit}: ${truncate(data, 600)}`;
  if (hit) return hit;
  if (data) return truncate(data, 600);
  return "Model returned business error.";
};

const getUrlHost = (value: unknown) => {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
};

const summarizePrompt = (prompt: unknown) => {
  if (typeof prompt === "string") {
    return {
      prompt_type: "text",
      prompt_len: prompt.length,
      prompt_head: truncate(prompt, 240),
      has_reference_image: false,
      reference_image_host: null,
    };
  }

  if (!Array.isArray(prompt)) {
    return {
      prompt_type: typeof prompt,
      prompt_len: null,
      prompt_head: null,
      has_reference_image: false,
      reference_image_host: null,
    };
  }

  let textLength = 0;
  let imageData: unknown = null;
  for (const message of prompt) {
    if (!message || typeof message !== "object") continue;
    const parts = (message as PlainRecord).parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const partRecord = part as PlainRecord;
      if (typeof partRecord.text === "string") {
        textLength += partRecord.text.length;
      }
      const inlineData = partRecord.inline_data as PlainRecord | undefined;
      if (typeof inlineData?.data === "string") {
        imageData = inlineData.data;
      }
    }
  }

  return {
    prompt_type: "parts",
    prompt_len: textLength,
    prompt_head: null,
    has_reference_image: typeof imageData === "string" && imageData.length > 0,
    reference_image_host: getUrlHost(imageData),
  };
};

const summarizeRequestBody = (body: unknown) => {
  if (!body || typeof body !== "object") return body;
  const record = body as PlainRecord;
  const promptSummary = summarizePrompt(record.prompt);
  const imageUrlsHost = getUrlHost(record.image_urls);
  const hasImageUrls = typeof record.image_urls === "string" && record.image_urls.length > 0;
  return {
    type: record.type,
    channel: record.channel,
    model: record.model,
    is_stream: record.is_stream,
    is_async: record.is_async,
    ...promptSummary,
    has_reference_image: promptSummary.has_reference_image || hasImageUrls,
    reference_image_host: promptSummary.reference_image_host ?? imageUrlsHost,
    has_image: typeof record.image === "string" && record.image.length > 0,
    image_host: getUrlHost(record.image),
    config: record.config,
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
    const targetPath = resolveSkyRsaPath(input);
    const targetUrl = new URL(targetPath, env.skyModelUrl).toString();

    const requestedSize = parseSkySizeParam(input.params);
    const body = buildSkyRsaRequestBodyPreview(input);

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
      const message = extractProviderMessage(payload) || `HTTP ${response.status}`;
      logger.warn(
        {
          providerRequestId: requestId,
          status: response.status,
          targetPath,
          modelKey: input.modelKey,
          payload,
          request: summarizeRequestBody(body),
        },
        "Model request failed",
      );
      throw new AppError("E_INTERNAL", `Model request failed: ${message}`, response.status);
    }
    if (code !== undefined && Number(code) !== 0) {
      const message = extractProviderMessage(payload);
      logger.warn(
        {
          providerRequestId: requestId,
          code,
          targetPath,
          modelKey: input.modelKey,
          payload,
          request: summarizeRequestBody(body),
        },
        "Model returned business error",
      );
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
