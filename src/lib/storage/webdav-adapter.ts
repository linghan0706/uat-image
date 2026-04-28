import { createClient, type WebDAVClient } from "webdav";

import { env } from "@/lib/env";
import type { StorageAdapter, UploadInput, UploadResult } from "@/lib/storage/types";

const ensureDir = async (client: WebDAVClient, folder: string) => {
  const parts = folder.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    const exists = await client.exists(current);
    if (!exists) {
      await client.createDirectory(current);
    }
  }
};

export class WebDavStorageAdapter implements StorageAdapter {
  provider = "webdav";
  container = env.nasBucket;

  private client = createClient(env.webdavEndpoint, {
    username: env.webdavUsername,
    password: env.webdavPassword,
  });

  async uploadBuffer(input: UploadInput): Promise<UploadResult> {
    const fullPath = `/${this.container}/${input.objectKey}`.replaceAll("//", "/");
    const folder = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await ensureDir(this.client, folder);
    await this.client.putFileContents(fullPath, input.data, { overwrite: true });
    return {
      provider: this.provider,
      container: this.container,
      objectKey: input.objectKey,
      fileSize: input.data.byteLength,
    };
  }

  async downloadBuffer(objectKey: string): Promise<Buffer> {
    const fullPath = `/${this.container}/${objectKey}`.replaceAll("//", "/");
    const content = await this.client.getFileContents(fullPath, { format: "binary" });
    return Buffer.from(content as ArrayBuffer);
  }
}
