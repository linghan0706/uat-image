import { apiRequest } from "@/lib/api/http-client";

export type StylePresetOption = {
  key: string;
  label: string;
  category: "realistic" | "anime" | "cdrama" | "concept";
  brief: string;
};

type StylePresetsResponse = {
  default_key: string;
  presets: StylePresetOption[];
};

export const getStylePresets = async (): Promise<StylePresetsResponse> => {
  return apiRequest<StylePresetsResponse>({
    url: "/api/v1/style-presets",
    method: "GET",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
};
