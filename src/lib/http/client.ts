import "server-only";

import axios, { type AxiosRequestConfig, type AxiosResponseHeaders, type RawAxiosResponseHeaders } from "axios";

type HeaderValue = string | string[] | undefined;

export type ServerHttpResponse<T> = {
  status: number;
  ok: boolean;
  data: T;
  headers: {
    get(name: string): string | null;
  };
};

type ServerHttpRequestConfig = Omit<AxiosRequestConfig, "url"> & {
  url: string | URL;
};

const serverHttpClient = axios.create({
  validateStatus: () => true,
});

const getHeaderValue = (headers: AxiosResponseHeaders | RawAxiosResponseHeaders, name: string): HeaderValue => {
  const normalizedName = name.toLowerCase();
  return (headers[normalizedName] ?? headers[name]) as HeaderValue;
};

const createHeaderReader = (headers: AxiosResponseHeaders | RawAxiosResponseHeaders) => ({
  get(name: string) {
    const value = getHeaderValue(headers, name);
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    return value ?? null;
  },
});

const toResponse = <T,>(status: number, headers: AxiosResponseHeaders | RawAxiosResponseHeaders, data: T): ServerHttpResponse<T> => ({
  status,
  ok: status >= 200 && status < 300,
  data,
  headers: createHeaderReader(headers),
});

// Codes that indicate the request never completed at the network layer:
// connect timeout, DNS failure, refused/reset connections, socket hangups, etc.
// All are retried/labelled as provider timeouts because there is no upstream
// response to interpret.
const NETWORK_FAILURE_CODES = new Set([
  "ECONNABORTED", // axios read/overall timeout
  "ETIMEDOUT", // OS-level connect/read timeout
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND", // DNS failure
  "EAI_AGAIN", // transient DNS failure
  "EPIPE",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
  "ERR_NETWORK",
]);

export const isHttpTimeoutError = (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return false;
  }
  if (error.code && NETWORK_FAILURE_CODES.has(error.code)) {
    return true;
  }
  // Some Node/undici versions surface connect failures only via the message.
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("network")
  );
};

export const requestText = async (config: ServerHttpRequestConfig): Promise<ServerHttpResponse<string>> => {
  const response = await serverHttpClient.request<string>({
    ...config,
    url: config.url.toString(),
    responseType: "text",
  });

  return toResponse(response.status, response.headers, response.data);
};

export const requestBytes = async (config: ServerHttpRequestConfig): Promise<ServerHttpResponse<Buffer>> => {
  const response = await serverHttpClient.request<ArrayBuffer>({
    ...config,
    url: config.url.toString(),
    responseType: "arraybuffer",
  });

  return toResponse(response.status, response.headers, Buffer.from(response.data));
};
