import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { env } from "@/lib/env";
import type { StorageAdapter, UploadInput, UploadResult } from "@/lib/storage/types";

export class S3StorageAdapter implements StorageAdapter {
  provider = "s3";
  container = env.nasBucket;

  private client = new S3Client({
    region: env.s3Region,
    endpoint: env.s3Endpoint || undefined,
    forcePathStyle: Boolean(env.s3Endpoint),
    credentials:
      env.s3AccessKey && env.s3SecretKey
        ? {
            accessKeyId: env.s3AccessKey,
            secretAccessKey: env.s3SecretKey,
          }
        : undefined,
  });

  async uploadBuffer(input: UploadInput): Promise<UploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.container,
        Key: input.objectKey,
        Body: input.data,
        ContentType: input.contentType,
      }),
    );

    return {
      provider: this.provider,
      container: this.container,
      objectKey: input.objectKey,
      fileSize: input.data.byteLength,
    };
  }

  async downloadBuffer(objectKey: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.container,
        Key: objectKey,
      }),
    );

    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error("S3 body is empty.");
    }
    return Buffer.from(bytes);
  }
}
