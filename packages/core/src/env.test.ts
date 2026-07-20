import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

const baseEnv = { DATABASE_URL: "postgres://x", REDIS_URL: "redis://y" };

describe("TOKEN_ENCRYPTION_KEY", () => {
  it("is optional; absent is fine (demo mode)", () => {
    const env = loadEnv(baseEnv);
    expect(env.TOKEN_ENCRYPTION_KEY).toBeUndefined();
  });

  it("accepts a 64-char hex key", () => {
    const key = "ab".repeat(32);
    const env = loadEnv({ ...baseEnv, TOKEN_ENCRYPTION_KEY: key });
    expect(env.TOKEN_ENCRYPTION_KEY).toBe(key);
  });

  it("accepts a padded base64 key decoding to exactly 32 bytes", () => {
    // 43 base64 chars + "=" padding = 44 chars = 32 decoded bytes.
    const key = `${"Bwc".repeat(14)}B=`;
    const env = loadEnv({ ...baseEnv, TOKEN_ENCRYPTION_KEY: key });
    expect(env.TOKEN_ENCRYPTION_KEY).toBe(key);
  });

  it("accepts an unpadded base64 key decoding to exactly 32 bytes", () => {
    const key = `${"Bwc".repeat(14)}B`;
    const env = loadEnv({ ...baseEnv, TOKEN_ENCRYPTION_KEY: key });
    expect(env.TOKEN_ENCRYPTION_KEY).toBe(key);
  });

  it.each([
    ["empty string", ""],
    ["63-char hex", "a".repeat(63)],
    ["65-char hex", "a".repeat(65)],
    ["non-hex, non-base64 64 chars", "z!".repeat(32)],
    ["base64 of 16 bytes", `${"Bwc".repeat(7)}B==`],
    ["base64 of 48 bytes", "+".repeat(64)],
    ["not base64 at all", "!".repeat(44)],
  ])("rejects %s with a readable message", (_label, key) => {
    expect(() => loadEnv({ ...baseEnv, TOKEN_ENCRYPTION_KEY: key })).toThrow(
      /TOKEN_ENCRYPTION_KEY: must be 64 hex chars or base64/,
    );
  });
});
