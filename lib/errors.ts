import { NextResponse } from "next/server";
import type { ErrorCode } from "./schemas";

export type ApiErrorBody = { error: { code: ErrorCode; message: string; fallback?: unknown } };

const STATUS: Record<ErrorCode, number> = {
  timeout: 504, malformed: 502, rate_limited: 429, upstream_down: 503,
  bad_input: 400, not_found: 404, forbidden: 403, conflict: 409,
};

export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string, public fallback?: unknown) { super(message); }
}

export function errorBody(code: ErrorCode, message: string, fallback?: unknown): ApiErrorBody {
  return { error: { code, message, ...(fallback !== undefined ? { fallback } : {}) } };
}

export function errorResponse(code: ErrorCode, message: string, fallback?: unknown, headers?: HeadersInit) {
  return NextResponse.json(errorBody(code, message, fallback), { status: STATUS[code], headers });
}

/** Wrap a route handler so ApiError / unexpected errors always use the shared error shape. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e.code, e.message, e.fallback);
      console.error("[api] unhandled", e);
      return errorResponse("upstream_down", "Something went wrong on our side. Try again.");
    }
  };
}
