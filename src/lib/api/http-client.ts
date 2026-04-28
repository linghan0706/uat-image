import axios, { type AxiosRequestConfig } from "axios";

type ApiSuccessResponse<T> = {
  code: "OK";
  message: string;
  data: T;
};

type ApiErrorResponse = {
  code: string;
  message: string;
  request_id?: string;
  details?: unknown;
};

const httpClient = axios.create({
  timeout: 30_000,
  headers: {
    "X-Requested-With": "XMLHttpRequest",
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isApiSuccessResponse = <T,>(value: unknown): value is ApiSuccessResponse<T> =>
  isRecord(value) && value.code === "OK" && "data" in value;

const isApiErrorResponse = (value: unknown): value is ApiErrorResponse =>
  isRecord(value) && typeof value.code === "string" && typeof value.message === "string";

const toRequestError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data;
    if (isApiErrorResponse(responseData)) {
      return new Error(responseData.message);
    }
    if (typeof responseData === "string" && responseData.trim().length > 0) {
      return new Error(responseData);
    }
    return new Error(error.message || "Request failed.");
  }

  return error instanceof Error ? error : new Error("Request failed.");
};

export const apiRequest = async <T = unknown>(config: AxiosRequestConfig): Promise<T> => {
  try {
    const response = await httpClient.request<ApiSuccessResponse<T> | ApiErrorResponse>(config);
    if (isApiSuccessResponse<T>(response.data)) {
      return response.data.data;
    }
    if (isApiErrorResponse(response.data)) {
      throw new Error(response.data.message);
    }
    throw new Error("Invalid API response.");
  } catch (error) {
    throw toRequestError(error);
  }
};
