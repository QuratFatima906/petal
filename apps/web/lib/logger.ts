import pino from "pino";
import { tryLoadServerEnv } from "./server-env";

/**
 * Structured logger for the web service (plan §5.6). At `info` log IDs and
 * lengths only — never tokens, signatures, or full comment text.
 */
export const logger = pino({
  level: tryLoadServerEnv()?.LOG_LEVEL ?? "info",
  base: { service: "web" },
});
