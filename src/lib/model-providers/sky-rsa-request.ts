import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { GenerateImageInput, ModelCapability } from "@/lib/model-providers/types";

type PlainRecord = Record<string, unknown>;

type ModelSpec = {
  id: string;
  match: (modelKey: string) => boolean;
  capabilities: ModelCapability[];
  path: string;
  channel: string;
  buildBody: (input: GenerateImageInput, params: PlainRecord) => unknown;
};

export const parseSkySizeParam = (params: Record<string, unknown>): { width: number; height: number } => {
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

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

const sizeToAspectRatio = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
};

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

const stripModelInternalFields = (params: PlainRecord): PlainRecord => {
  const {
    reference_image_url: _referenceImageUrl,
    reference_images: _referenceImages,
    view_set: _viewSet,
    ...rest
  } = params;
  void _referenceImageUrl;
  void _referenceImages;
  void _viewSet;
  return rest;
};

const isSupportedReferenceImage = (imageRef: string): boolean =>
  /^https?:\/\//i.test(imageRef) || /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(imageRef);

const positiveIntegerOrDefault = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
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

const buildMjTextToImageBody = (input: GenerateImageInput, params: PlainRecord, channel: string) => {
  const config = { ...params };
  const aspectRatio = typeof config.aspect_ratio === "string" ? config.aspect_ratio : sizeToAspectRatio(config.size);
  delete config.negative_prompt;
  delete config.cfg;
  delete config.steps;
  delete config.size;
  if (aspectRatio) {
    config.aspect_ratio = aspectRatio;
  }

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
  imageRef: string,
) => {
  if (!isSupportedReferenceImage(imageRef)) {
    throw new AppError(
      "E_INVALID_PARAM",
      "SKY image-to-image only supports http(s) URLs or data:image/*;base64 reference images.",
      400,
    );
  }

  const config = stripModelInternalFields(params);
  config.count = positiveIntegerOrDefault(config.count, 1);
  if (input.negativePrompt) {
    config.negative_prompt = input.negativePrompt;
  }
  return {
    type: "image_to_image",
    channel,
    model: input.modelKey,
    is_stream: false,
    is_async: false,
    image_urls: imageRef,
    prompt: input.prompt,
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

export const resolveSkyRsaPath = (input: GenerateImageInput) => {
  const spec = findModelSpec(input.modelKey);
  if (spec?.capabilities.includes("IMAGE_TO_IMAGE") && extractReferenceImageUrl(input.params)) {
    return env.skyModelGeneratePathImageToImage;
  }
  if (spec) return spec.path;
  return resolveCapabilityFallbackPath(input);
};

const buildRequestBody = (input: GenerateImageInput, spec: ModelSpec | null) => {
  const params = { ...input.params };
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

export const buildSkyRsaRequestBodyPreview = (input: GenerateImageInput) =>
  buildRequestBody(input, findModelSpec(input.modelKey));
