import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { constantTimeEquals, verifyHubSignature } from "./webhook-signature";

const SECRET = "unit-test-secret";
const body = Buffer.from(JSON.stringify({ object: "instagram", entry: [] }), "utf8");
const validHeader = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

describe("constantTimeEquals", () => {
  it.each([
    ["identical strings", "abc123", "abc123", true],
    ["different content, same length", "abc123", "abc124", false],
    ["different lengths", "abc", "abcd", false],
    ["empty vs empty", "", "", true],
    ["empty vs non-empty", "", "a", false],
  ])("%s", (_name, a, b, expected) => {
    expect(constantTimeEquals(a, b)).toBe(expected);
  });
});

describe("verifyHubSignature", () => {
  it.each([
    ["valid signature", body, validHeader, SECRET, true],
    ["null header", body, null, SECRET, false],
    ["missing sha256= prefix", body, validHeader.slice("sha256=".length), SECRET, false],
    ["sha1 prefix", body, validHeader.replace("sha256=", "sha1="), SECRET, false],
    ["wrong secret", body, validHeader, "another-secret", false],
    ["tampered body", Buffer.from("tampered", "utf8"), validHeader, SECRET, false],
    ["truncated digest", body, validHeader.slice(0, -2), SECRET, false],
  ])("%s", (_name, raw, header, secret, expected) => {
    expect(verifyHubSignature(raw, header, secret)).toBe(expected);
  });
});
