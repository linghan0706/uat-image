export type UploadInput = {
  objectKey: string;
  contentType: string;
  data: Buffer;
};

export type UploadResult = {
  provider: string;
  container: string;
  objectKey: string;
  accessUrl?: string;
  fileSize: number;
};

export interface StorageAdapter {
  provider: string;
  container: string;
  uploadBuffer(input: UploadInput): Promise<UploadResult>;
  downloadBuffer(objectKey: string): Promise<Buffer>;
}
