import { env } from "@/lib/env";
import { LocalStorageAdapter } from "@/lib/storage/local-adapter";
import { S3StorageAdapter } from "@/lib/storage/s3-adapter";
import { SynologyStorageAdapter } from "@/lib/storage/synology-adapter";
import type { StorageAdapter } from "@/lib/storage/types";
import { WebDavStorageAdapter } from "@/lib/storage/webdav-adapter";

let adapter: StorageAdapter | null = null;

export const getStorageAdapter = (): StorageAdapter => {
  if (adapter) {
    return adapter;
  }

  switch (env.nasProvider) {
    case "s3":
      adapter = new S3StorageAdapter();
      return adapter;
    case "webdav":
      adapter = new WebDavStorageAdapter();
      return adapter;
    case "synology":
      adapter = new SynologyStorageAdapter();
      return adapter;
    case "local":
    default:
      adapter = new LocalStorageAdapter();
      return adapter;
  }
};
