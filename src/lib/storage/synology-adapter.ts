import path from "node:path";

import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { requestBytes, requestText, type ServerHttpResponse } from "@/lib/http/client";
import type { StorageAdapter, UploadInput, UploadResult } from "@/lib/storage/types";
import { sleep } from "@/lib/utils";

type SynologySuccess<T = unknown> = {
  success: true;
  data: T;
};

type SynologyFailure = {
  success: false;
  error: {
    code: number;
  };
};

type SynologyResponse<T = unknown> = SynologySuccess<T> | SynologyFailure;

const synologyRetryCodes = new Set([105, 106, 107, 119]);
const synologyFolderExistsCodes = new Set([407, 408, 414]);
const transientHttpCodes = new Set([502, 503, 504]);
const HTTP_MAX_RETRIES = 3;
const HTTP_BASE_DELAY_MS = 1000;

export class SynologyStorageAdapter implements StorageAdapter {
  provider = "synology";
  container = env.nasBucket;

  private sid: string | null = null;
  private sidCreatedAt = 0;

  private get baseUrl() {
    if (!env.synologyBaseUrl) {
      throw new AppError("E_NAS_UNAVAILABLE", "Missing SYNOLOGY_BASE_URL.", 503);
    }
    return env.synologyBaseUrl;
  }

  private get shareRoot() {
    return env.synologyShareRoot || "/";
  }

  private resolvePath(objectKey: string) {
    return path.posix.join(this.shareRoot, this.container, objectKey);
  }

  private async authLogin(): Promise<string> {
    const url = new URL("/webapi/auth.cgi", this.baseUrl);
    url.searchParams.set("api", "SYNO.API.Auth");
    url.searchParams.set("version", "6");
    url.searchParams.set("method", "login");
    url.searchParams.set("account", env.synologyUsername);
    url.searchParams.set("passwd", env.synologyPassword);
    url.searchParams.set("session", env.synologySession);
    url.searchParams.set("format", "sid");

    const response = await this.requestTextWithRetry(url, { method: "GET" });
    if (!response.ok) {
      throw new AppError("E_NAS_UNAVAILABLE", `Synology login failed (${response.status}).`, 503);
    }
    const body = this.parseJsonBody<{ sid: string }>(response.data);
    if (!body.success) {
      throw new AppError("E_NAS_UNAVAILABLE", `Synology login failed (${body.error.code}).`, 503);
    }
    this.sid = body.data.sid;
    this.sidCreatedAt = Date.now();
    return body.data.sid;
  }

  private async getSid(): Promise<string> {
    if (this.sid && Date.now() - this.sidCreatedAt < 25 * 60 * 1000) {
      return this.sid;
    }
    return this.authLogin();
  }

  private parseJsonBody<T>(raw: string): SynologyResponse<T> {
    let text = raw.trim();

    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    try {
      return JSON.parse(text) as SynologyResponse<T>;
    } catch {
      // continue
    }

    const textareaMatch = text.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i);
    if (textareaMatch?.[1]) {
      try {
        return JSON.parse(textareaMatch[1].trim()) as SynologyResponse<T>;
      } catch {
        // continue
      }
    }

    const braceStart = text.indexOf("{");
    const braceEnd = text.lastIndexOf("}");
    if (braceStart !== -1 && braceEnd > braceStart) {
      try {
        return JSON.parse(text.slice(braceStart, braceEnd + 1)) as SynologyResponse<T>;
      } catch {
        // give up
      }
    }

    throw new AppError(
      "E_NAS_UNAVAILABLE",
      `Synology response is not valid JSON. Body preview: ${raw.slice(0, 200)}`,
      503,
    );
  }

  private async requestTextWithRetry(
    url: URL,
    options?: { method?: "GET" | "POST"; data?: FormData },
  ): Promise<ServerHttpResponse<string>> {
    let lastResponse: ServerHttpResponse<string> | null = null;
    for (let attempt = 0; attempt <= HTTP_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await sleep(HTTP_BASE_DELAY_MS * Math.pow(2, attempt - 1));
      }
      const response = await requestText({
        url,
        method: options?.method,
        data: options?.data,
      });
      if (response.ok || !transientHttpCodes.has(response.status)) {
        return response;
      }
      lastResponse = response;
    }
    return lastResponse!;
  }

  private async requestBytesWithRetry(url: URL): Promise<ServerHttpResponse<Buffer>> {
    let lastResponse: ServerHttpResponse<Buffer> | null = null;
    for (let attempt = 0; attempt <= HTTP_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await sleep(HTTP_BASE_DELAY_MS * Math.pow(2, attempt - 1));
      }
      const response = await requestBytes({
        url,
        method: "GET",
      });
      if (response.ok || !transientHttpCodes.has(response.status)) {
        return response;
      }
      lastResponse = response;
    }
    return lastResponse!;
  }

  private async requestEntry<T = unknown>(
    params: Record<string, string>,
    options?: { method?: "GET" | "POST"; data?: FormData },
    retry = true,
  ): Promise<SynologyResponse<T>> {
    const sid = await this.getSid();
    const url = new URL("/webapi/entry.cgi", this.baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    url.searchParams.set("_sid", sid);

    const response = await this.requestTextWithRetry(url, {
      method: options?.method ?? "GET",
      data: options?.data,
    });

    if (!response.ok) {
      throw new AppError("E_NAS_UNAVAILABLE", `Synology request failed (${response.status}).`, 503);
    }

    const body = this.parseJsonBody<T>(response.data);
    if (!body.success && retry && synologyRetryCodes.has(body.error.code)) {
      this.sid = null;
      return this.requestEntry(params, options, false);
    }
    return body;
  }

  private async ensureFolder(folderPath: string) {
    if (!folderPath || folderPath === "/" || folderPath === ".") {
      return;
    }

    const parent = path.posix.dirname(folderPath);
    const name = path.posix.basename(folderPath);
    const response = await this.requestEntry({
      api: "SYNO.FileStation.CreateFolder",
      version: "2",
      method: "create",
      folder_path: parent,
      name,
      force_parent: "true",
    });

    if (!response.success && !synologyFolderExistsCodes.has(response.error.code)) {
      throw new AppError("E_NAS_UNAVAILABLE", `Create folder failed (${response.error.code}).`, 503);
    }
  }

  async uploadBuffer(input: UploadInput): Promise<UploadResult> {
    const fullPath = this.resolvePath(input.objectKey);
    const folderPath = path.posix.dirname(fullPath);

    await this.ensureFolder(folderPath);

    const form = new FormData();
    form.append("api", "SYNO.FileStation.Upload");
    form.append("version", "2");
    form.append("method", "upload");
    form.append("path", folderPath);
    form.append("create_parents", "true");
    form.append("overwrite", "true");
    form.append("file", new Blob([new Uint8Array(input.data)], { type: input.contentType }), path.posix.basename(fullPath));

    const response = await this.requestEntry(
      {},
      {
        method: "POST",
        data: form,
      },
    );
    if (!response.success) {
      throw new AppError("E_NAS_UNAVAILABLE", `Upload failed (${response.error.code}).`, 503);
    }

    return {
      provider: this.provider,
      container: this.container,
      objectKey: input.objectKey,
      fileSize: input.data.byteLength,
    };
  }

  async downloadBuffer(objectKey: string, authRetry = true): Promise<Buffer> {
    const fullPath = this.resolvePath(objectKey);
    const sid = await this.getSid();
    const url = new URL("/webapi/entry.cgi", this.baseUrl);
    url.searchParams.set("api", "SYNO.FileStation.Download");
    url.searchParams.set("version", "2");
    url.searchParams.set("method", "download");
    url.searchParams.set("path", fullPath);
    url.searchParams.set("mode", "download");
    url.searchParams.set("_sid", sid);

    const response = await this.requestBytesWithRetry(url);
    if (!response.ok) {
      if (authRetry) {
        this.sid = null;
        return this.downloadBuffer(objectKey, false);
      }
      throw new AppError("E_NAS_UNAVAILABLE", `Download failed (${response.status}).`, 503);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("json") || contentType.includes("text/html")) {
      const raw = response.data.toString("utf-8");
      const body = this.parseJsonBody(raw);
      if (!body.success) {
        if (authRetry && synologyRetryCodes.has(body.error.code)) {
          this.sid = null;
          return this.downloadBuffer(objectKey, false);
        }
        throw new AppError("E_NAS_UNAVAILABLE", `Download failed (synology error ${body.error.code}).`, 503);
      }
      return Buffer.from(raw, "utf-8");
    }

    return response.data;
  }
}
