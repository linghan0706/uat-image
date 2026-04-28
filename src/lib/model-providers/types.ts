import type { Capability } from "@/lib/db/types";

export type GenerateImageInput = {
  capability: Capability;
  modelKey: string;
  prompt: string;
  negativePrompt?: string | null;
  params: Record<string, unknown>;
};

export type GeneratedArtifact = {
  format: "png" | "jpg" | "jpeg" | "webp";
  width: number;
  height: number;
  bytes: Buffer;
};

export type GenerateImageOutput = {
  artifacts: GeneratedArtifact[];
  providerRequestId?: string;
};

export interface ModelProvider {
  name: string;
  generateImage(input: GenerateImageInput): Promise<GenerateImageOutput>;
  supportsCapability?(modelKey: string, capability: ModelCapability): boolean;
}

export type ModelCapability = "TEXT_TO_IMAGE" | "IMAGE_TO_IMAGE";
