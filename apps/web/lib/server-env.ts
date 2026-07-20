import { loadEnv, type Env } from "@petal/core";

/**
 * Parses `process.env` through the core loader (plan §5.5) without throwing,
 * so route handlers can degrade to safe rejections instead of crashing —
 * `next build` imports route modules before the runtime environment exists.
 */
export function tryLoadServerEnv(): Env | null {
  try {
    return loadEnv(process.env);
  } catch {
    return null;
  }
}
