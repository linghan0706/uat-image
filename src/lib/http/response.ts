import { NextResponse } from "next/server";

export const ok = <T>(data: T, status = 200) =>
  NextResponse.json(
    {
      code: "OK",
      message: "success",
      data,
    },
    { status },
  );

export const fail = (code: string, message: string, requestId: string, status = 400, details?: unknown) =>
  NextResponse.json(
    {
      code,
      message,
      request_id: requestId,
      details: details ?? undefined,
    },
    { status },
  );

