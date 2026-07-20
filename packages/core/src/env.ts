import { z } from "zod";

/**
 * Parsed once at process startup; nothing else reads process.env (plan §5.5).
 * Fails fast with a readable list of missing/invalid keys.
 */

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  IG_APP_ID: z.string().min(1).optional(),
  IG_APP_SECRET: z.string().min(1).optional(),
  IG_ACCESS_TOKEN: z.string().min(1).optional(),
  IG_ACCOUNT_ID: z.string().min(1).optional(),
  IG_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ENRICH_DAILY_BUDGET_USD: z.coerce.number().positive().default(2),
  SLACK_WEBHOOK_URL: z.url().optional(),
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  APP_URL: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  return parsed.data;
}
