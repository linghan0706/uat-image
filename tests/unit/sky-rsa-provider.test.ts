/**
 * Sky RSA provider request-body unit tests.
 *
 * 运行：npx tsx tests/unit/sky-rsa-provider.test.ts
 */

import { strict as assert } from "node:assert";

import { env } from "../../src/lib/env";
import { AppError } from "../../src/lib/errors";
import {
  buildSkyRsaRequestBodyPreview,
  resolveSkyRsaPath,
} from "../../src/lib/model-providers/sky-rsa-request";

const referenceImageUrl = "https://cdn.example.com/source-portrait.png";

const body = buildSkyRsaRequestBodyPreview({
  capability: "THREE_VIEW",
  modelKey: env.skyTextToImageModelNanoBanana,
  prompt: "make a three-view sheet",
  negativePrompt: "text, watermark",
  params: {
    size: "1920x1080",
    aspect_ratio: "16:9",
    count: 3,
    reference_image_url: referenceImageUrl,
    reference_images: [referenceImageUrl],
    view_set: "front,side,back",
  },
}) as Record<string, unknown>;

assert.equal(body.type, "image_to_image");
assert.equal(body.channel, env.skyTextToImageChannelNanoBanana);
assert.equal(body.model, env.skyTextToImageModelNanoBanana);
assert.equal(body.is_stream, false);
assert.equal(body.is_async, false);
assert.equal(body.first_image_url, referenceImageUrl);
assert.equal(body.prompt, "make a three-view sheet");
assert.equal(
  resolveSkyRsaPath({
    capability: "THREE_VIEW",
    modelKey: env.skyTextToImageModelNanoBanana,
    prompt: "make a three-view sheet",
    negativePrompt: "text, watermark",
    params: {
      reference_image_url: referenceImageUrl,
    },
  }),
  env.skyModelGeneratePathImageToImage,
);

assert.ok(!Object.hasOwn(body, "image"));
assert.ok(!Object.hasOwn(body, "image_urls"));

const config = body.config as Record<string, unknown>;
assert.deepEqual(
  config,
  {
    size: "1920x1080",
    aspect_ratio: "16:9",
    count: 3,
    negative_prompt: "text, watermark",
  },
  "Gemini image-to-image config should keep model params and negative prompt",
);
assert.ok(!Object.hasOwn(config, "first_image_url"));
assert.ok(!Object.hasOwn(config, "reference_image_url"));
assert.ok(!Object.hasOwn(config, "reference_images"));
assert.ok(!Object.hasOwn(config, "view_set"));

assert.throws(
  () =>
    buildSkyRsaRequestBodyPreview({
      capability: "THREE_VIEW",
      modelKey: env.skyTextToImageModelNanoBanana,
      prompt: "make a three-view sheet",
      negativePrompt: null,
      params: {
        count: 1,
        reference_image_url: "abc123",
      },
    }),
  (error: unknown) =>
    error instanceof AppError &&
    error.code === "E_INVALID_PARAM" &&
    error.message.includes("first_image_url only supports http(s) URLs or data:image/*;base64"),
);

const dataUri = "data:image/png;base64,abc123==";
const dataUriBody = buildSkyRsaRequestBodyPreview({
  capability: "THREE_VIEW",
  modelKey: env.skyTextToImageModelNanoBanana,
  prompt: "make a three-view sheet",
  negativePrompt: null,
  params: {
    count: 1,
    reference_image_url: dataUri,
  },
}) as Record<string, unknown>;
assert.equal(dataUriBody.first_image_url, dataUri);

assert.throws(
  () =>
    buildSkyRsaRequestBodyPreview({
      capability: "THREE_VIEW",
      modelKey: env.skyTextToImageModelNanoBanana,
      prompt: "make a three-view sheet",
      negativePrompt: null,
      params: {
        count: 1,
        first_image_url: "data:image/PNG;base64,abc123==",
      },
    }),
  (error: unknown) => error instanceof AppError && error.code === "E_INVALID_PARAM",
  "data URI image format must be lowercase, for example data:image/png;base64,...",
);

const mjBody = buildSkyRsaRequestBodyPreview({
  capability: "PORTRAIT",
  modelKey: env.skyTextToImageModelMj,
  prompt: "make a portrait",
  negativePrompt: "text, watermark",
  params: {
    size: "1024x1536",
    count: 1,
    steps: 30,
    cfg: 7,
  },
}) as Record<string, unknown>;
assert.equal(mjBody.type, "text_to_image");
assert.equal(mjBody.channel, env.skyTextToImageChannelMj);
assert.deepEqual(
  mjBody.config,
  {
    count: 1,
    aspect_ratio: "2:3",
  },
  "MJ should pass resolution choice as aspect_ratio and strip unsupported diffusion params",
);
assert.equal(mjBody.prompt, "make a portrait --no text, watermark");

const bananaTextBody = buildSkyRsaRequestBodyPreview({
  capability: "PORTRAIT",
  modelKey: env.skyTextToImageModelNanoBanana,
  prompt: "make a portrait",
  negativePrompt: null,
  params: {
    size: "1344x768",
    aspect_ratio: "16:9",
    count: 1,
  },
}) as Record<string, unknown>;
assert.equal(bananaTextBody.type, "text_to_image");
assert.deepEqual(
  bananaTextBody.config,
  {
    size: "1344x768",
    aspect_ratio: "16:9",
    count: 1,
  },
  "Banana should preserve explicit size and aspect_ratio for provider passthrough",
);

console.log("6 passed, 0 failed, 6 total");
