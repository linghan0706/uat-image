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

export const isHttpTimeoutError = (error: unknown) => axios.isAxiosError(error) && error.code === "ECONNABORTED";

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
