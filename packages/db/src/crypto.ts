import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ValidationError, err, ok, type Result } from "@petal/core";

/**
 * aes-256-gcm token encryption at rest (plan WP2). The key is supplied by the
 * caller: the frozen core env schema has no key variable yet, so wiring key
 * material into env is a contract decision that cannot be made here.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;

declare const keyBrand: unique symbol;
export type TokenEncryptionKey = Buffer & { readonly [keyBrand]: "TokenEncryptionKey" };

/** Accepts 64 hex chars or base64 for exactly 32 bytes of key material. */
export function parseEncryptionKey(material: string): Result<TokenEncryptionKey, ValidationError> {
  const trimmed = material.trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
  if (buf.length !== KEY_BYTES) {
    return err(new ValidationError("encryption key must decode to exactly 32 bytes (hex or base64)"));
  }
  return ok(buf as TokenEncryptionKey);
}

/** Output format: `v1.<iv>.<tag>.<ciphertext>`, each part base64url. */
export function encryptToken(plaintext: string, key: TokenEncryptionKey): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptToken(encrypted: string, key: TokenEncryptionKey): Result<string, ValidationError> {
  const parts = encrypted.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    return err(new ValidationError("malformed encrypted token: expected v1.<iv>.<tag>.<ciphertext>"));
  }
  const [, ivPart, tagPart, ctPart] = parts;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart ?? "", "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart ?? "", "base64url"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ctPart ?? "", "base64url")), decipher.final()]);
    return ok(plaintext.toString("utf8"));
  } catch {
    return err(new ValidationError("token decryption failed: wrong key or corrupted ciphertext"));
  }
}
