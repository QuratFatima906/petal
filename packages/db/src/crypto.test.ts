import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, parseEncryptionKey, type TokenEncryptionKey } from "./crypto";

const hexKey = randomBytes(32).toString("hex");

function mustKey(material: string): TokenEncryptionKey {
  const parsed = parseEncryptionKey(material);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
}

describe("parseEncryptionKey", () => {
  it("accepts 64 hex chars", () => {
    expect(parseEncryptionKey(hexKey).ok).toBe(true);
  });

  it("accepts base64 for 32 bytes", () => {
    expect(parseEncryptionKey(randomBytes(32).toString("base64")).ok).toBe(true);
  });

  it("rejects wrong-length material", () => {
    for (const bad of ["", "abc", randomBytes(16).toString("hex"), randomBytes(48).toString("base64")]) {
      expect(parseEncryptionKey(bad).ok).toBe(false);
    }
  });
});

describe("encryptToken / decryptToken", () => {
  it("round trips", () => {
    const key = mustKey(hexKey);
    const encrypted = encryptToken("EAAG-very-secret-token", key);
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(encrypted).not.toContain("EAAG");
    const decrypted = decryptToken(encrypted, key);
    expect(decrypted).toEqual({ ok: true, value: "EAAG-very-secret-token" });
  });

  it("produces a different ciphertext per call (fresh IV)", () => {
    const key = mustKey(hexKey);
    expect(encryptToken("same", key)).not.toBe(encryptToken("same", key));
  });

  it("fails closed on the wrong key", () => {
    const encrypted = encryptToken("secret", mustKey(hexKey));
    const wrong = decryptToken(encrypted, mustKey(randomBytes(32).toString("hex")));
    expect(wrong.ok).toBe(false);
  });

  it("fails closed on tampered ciphertext and malformed input", () => {
    const key = mustKey(hexKey);
    const encrypted = encryptToken("secret", key);
    const parts = encrypted.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${Buffer.from("tampered").toString("base64url")}`;
    expect(decryptToken(tampered, key).ok).toBe(false);
    expect(decryptToken("not-an-encrypted-token", key).ok).toBe(false);
    expect(decryptToken("v2.a.b.c", key).ok).toBe(false);
  });
});
