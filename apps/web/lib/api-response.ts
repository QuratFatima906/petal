import { ValidationError } from "@petal/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "./logger";

/**
 * Shared `{ data }` / `{ error: { code, message } }` envelopes (plan §7). Route
 * handlers wrap their success payload in `dataResponse` and map thrown errors
 * through `mapError`, so every response matches the frozen core schemas.
 */

export const dataResponse = <T>(data: T): NextResponse => NextResponse.json({ data });

export const errorResponse = (status: number, code: string, message: string): NextResponse =>
  NextResponse.json({ error: { code, message } }, { status });

/** Env unavailable at runtime — routes cannot reach Postgres/Redis. */
export const unavailable = (): NextResponse =>
  errorResponse(503, "unavailable", "Service configuration is unavailable.");

export function mapError(error: unknown): NextResponse {
  if (error instanceof z.ZodError) {
    return errorResponse(400, "invalid_request", error.issues.map((i) => i.message).join("; "));
  }
  if (error instanceof ValidationError) {
    return errorResponse(400, "invalid_request", error.message);
  }
  logger.error({ err: error }, "unhandled route error");
  return errorResponse(500, "internal_error", "Something went wrong.");
}
