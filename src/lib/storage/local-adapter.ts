import fs from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";
import type { StorageAdapter, UploadInput, UploadResult } from "@/lib/storage/types";

export class LocalStorageAdapter implements StorageAdapter {
  provider = "local";
  container = env.localNasRoot;

  private resolvePath(objectKey: string) {
    const normalized = objectKey.replaceAll("/", path.sep);
    return path.resolve(this.container, normalized);
  }

  async uploadBuffer(input: UploadInput): Promise<UploadResult> {
    const filePath = this.resolvePath(input.objectKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.data);
    return {
      provider: this.provider,
      container: this.container,
      objectKey: input.objectKey,
      fileSize: input.data.byteLength,
    };
  }

  async downloadBuffer(objectKey: string): Promise<Buffer> {
    const filePath = this.resolvePath(objectKey);
    return fs.readFile(filePath);
  }
}
