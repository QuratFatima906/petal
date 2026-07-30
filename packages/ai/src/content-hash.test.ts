import { describe, expect, it } from "vitest";
import { contentHash } from "./content-hash";

describe("contentHash", () => {
  it("is deterministic for the same text + version", () => {
    expect(contentHash("hello", "v1")).toBe(contentHash("hello", "v1"));
  });

  it("is a 64-char sha256 hex digest", () => {
    expect(contentHash("hello", "v1")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the prompt version bumps (cache invalidation)", () => {
    expect(contentHash("hello", "v1")).not.toBe(contentHash("hello", "v2"));
  });

  it("changes when the text changes", () => {
    expect(contentHash("hello", "v1")).not.toBe(contentHash("world", "v1"));
  });
});
