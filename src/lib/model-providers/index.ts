import { env } from "@/lib/env";
import { MockModelProvider } from "@/lib/model-providers/mock-provider";
import { SkyRsaModelProvider } from "@/lib/model-providers/sky-rsa-provider";
import type { ModelProvider } from "@/lib/model-providers/types";

let provider: ModelProvider | null = null;

export const getModelProvider = (): ModelProvider => {
  if (provider) {
    return provider;
  }

  switch (env.modelProvider) {
    case "sky_rsa":
      provider = new SkyRsaModelProvider();
      return provider;
    case "mock":
    default:
      provider = new MockModelProvider();
      return provider;
  }
};
