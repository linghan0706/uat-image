import type { ModelCapability, ModelProvider, GenerateImageInput, GenerateImageOutput } from "@/lib/model-providers/types";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5fN6kAAAAASUVORK5CYII=",
  "base64",
);

const parseCount = (input: GenerateImageInput) => {
  const raw = input.params.count;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return 1;
  }
  return Math.max(1, Math.min(4, Math.floor(n)));
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

export class MockModelProvider implements ModelProvider {
  name = "mock";

  supportsCapability(_modelKey: string, _capability: ModelCapability): boolean {
    void _modelKey;
    void _capability;
    return true;
  }

  async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
    const size = parseSizeParam(input.params);

    if (input.capability === "THREE_VIEW") {
      return {
        artifacts: [{
          format: "png",
          width: size.width,
          height: size.height,
          bytes: Buffer.from(TINY_PNG),
        }],
        providerRequestId: `mock_${Date.now()}`,
      };
    }

    const count = parseCount(input);
    return {
      artifacts: Array.from({ length: count }, () => ({
        format: "png",
        width: size.width,
        height: size.height,
        bytes: Buffer.from(TINY_PNG),
      })),
      providerRequestId: `mock_${Date.now()}`,
    };
  }
}

