/**
 * 负向词解析器
 *
 * 按 preset × modelKey 分派：
 * - 用户显式提供 userNegative 时优先透传；
 * - Midjourney 走精简版（MJ 的 --no 长度敏感，由 sky-rsa-provider.ts 改写入 prompt）；
 * - 其它模型走通用扩散版。
 */

import type { FunctionalCapability } from "@/lib/api/image-workflow.types";
import {
  DIFFUSION_PORTRAIT_NEGATIVE,
  MJ_PORTRAIT_NEGATIVE,
} from "@/lib/prompt/negative/portrait";
import {
  DIFFUSION_THREE_VIEW_NEGATIVE,
  MJ_THREE_VIEW_NEGATIVE,
} from "@/lib/prompt/negative/three-view";

export type NegativeResolveInput = {
  preset: FunctionalCapability;
  modelKey: string;
  userNegative?: string | null;
};

const isMidjourneyModel = (modelKey: string): boolean => {
  const k = modelKey.toLowerCase();
  return k.includes("midjourney") || k.includes("mj") || k === "mj";
};

export const resolveNegativePrompt = ({
  preset,
  modelKey,
  userNegative,
}: NegativeResolveInput): string => {
  const userTrimmed = userNegative?.trim();
  if (userTrimmed) return userTrimmed;

  const mj = isMidjourneyModel(modelKey);
  if (preset === "THREE_VIEW") {
    return mj ? MJ_THREE_VIEW_NEGATIVE : DIFFUSION_THREE_VIEW_NEGATIVE;
  }
  return mj ? MJ_PORTRAIT_NEGATIVE : DIFFUSION_PORTRAIT_NEGATIVE;
};
