import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

/**
 * Constant-time string equality. A length mismatch returns false immediately,
 * which leaks only the length — never the content.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Verifies Meta's `X-Hub-Signature-256` header: `sha256=<hex digest>` where the
 * digest is HMAC-SHA256 keyed with the app secret over the RAW request body
 * (verified against Meta webhook docs, see docs/meta-api-verify.md §2).
 */
export function verifyHubSignature(
  rawBody: Buffer,
  header: string | null,
  appSecret: string,
): boolean {
  if (header === null || !header.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return constantTimeEquals(header.slice(SIGNATURE_PREFIX.length), expected);
}
