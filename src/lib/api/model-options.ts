import { apiRequest } from "@/lib/api/http-client";
import type { FunctionalCapability, ModelOption } from "@/lib/api/image-workflow.types";

type RawModelOption = {
  modelKey?: string;
  model_key?: string;
  isDefault?: boolean;
  is_default?: boolean;
};

const normalizeModelOptions = (models: RawModelOption[]): ModelOption[] =>
  models
    .map((model) => ({
      modelKey: (model.modelKey ?? model.model_key ?? "").trim(),
      isDefault: Boolean(model.isDefault ?? model.is_default),
    }))
    .filter((model) => model.modelKey.length > 0);

export const getModelOptions = async (capability: FunctionalCapability): Promise<ModelOption[]> => {
  const data = await apiRequest<{ models: RawModelOption[] }>({
    url: "/api/v1/model-options",
    method: "GET",
    params: { capability },
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  return normalizeModelOptions(data.models);
};
