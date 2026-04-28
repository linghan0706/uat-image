import type { Capability } from "@/lib/db/types";
import { env } from "@/lib/env";

export type BootstrapModelConfig = {
  modelKey: string;
  capability: Capability;
  provider: string;
  endpoint: string;
  enabled: boolean;
  isDefault: boolean;
  allowFrontSelect: boolean;
  defaultParams: Record<string, unknown>;
  timeoutSec: number;
};

const defaultModels: BootstrapModelConfig[] = [
  {
    modelKey: "portrait_default_v1",
    capability: "PORTRAIT",
    provider: "mock",
    endpoint: "mock://portrait",
    enabled: true,
    isDefault: false,
    allowFrontSelect: false,
    defaultParams: { size: "1024x1536", steps: 30, cfg: 7, count: 1 },
    timeoutSec: 90,
  },
  {
    modelKey: env.skyTextToImageModelMj,
    capability: "PORTRAIT",
    provider: "sky_rsa",
    endpoint: env.skyModelGeneratePathMj,
    enabled: true,
    isDefault: true,
    allowFrontSelect: true,
    defaultParams: { size: "1024x1536", steps: 30, cfg: 7, count: 1 },
    timeoutSec: 120,
  },
  {
    modelKey: env.skyTextToImageModelMj,
    capability: "THREE_VIEW",
    provider: "sky_rsa",
    endpoint: env.skyModelGeneratePathMj,
    enabled: true,
    isDefault: true,
    allowFrontSelect: true,
    defaultParams: { size: "1920x1080", aspect_ratio: "16:9" },
    timeoutSec: 120,
  },
  {
    modelKey: env.skyTextToImageModelNanoBanana,
    capability: "THREE_VIEW",
    provider: "sky_rsa",
    endpoint: env.skyModelGeneratePathNanoBanana,
    enabled: true,
    isDefault: false,
    allowFrontSelect: true,
    defaultParams: { size: "1920x1080", aspect_ratio: "16:9" },
    timeoutSec: 120,
  },
  {
    modelKey: "threeview_base_v1",
    capability: "THREE_VIEW",
    provider: "mock",
    endpoint: "mock://threeview",
    enabled: false,
    isDefault: false,
    allowFrontSelect: true,
    defaultParams: { size: "1920x1080", aspect_ratio: "16:9" },
    timeoutSec: 90,
  },
  {
    modelKey: "scene_default_v1",
    capability: "SCENE_CONCEPT",
    provider: "mock",
    endpoint: "mock://scene",
    enabled: true,
    isDefault: false,
    allowFrontSelect: false,
    defaultParams: { style_preset: "cinematic", aspect_ratio: "16:9", count: 1 },
    timeoutSec: 90,
  },
  {
    modelKey: env.skyTextToImageModelNanoBanana,
    capability: "SCENE_CONCEPT",
    provider: "sky_rsa",
    endpoint: env.skyModelGeneratePathNanoBanana,
    enabled: true,
    isDefault: true,
    allowFrontSelect: true,
    defaultParams: { style_preset: "cinematic", aspect_ratio: "16:9", count: 1 },
    timeoutSec: 120,
  },
];

export const listDefaultBootstrapModels = (): ReadonlyArray<BootstrapModelConfig> => defaultModels;
