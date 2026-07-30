/**
 * Text normalization for cache-keying and scoring (plan §9). Deterministic:
 * the same comment always yields the same normalized string, so identical
 * texts share a cache entry regardless of surrounding whitespace.
 */
export const normalizeText = (text: string): string =>
  text
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
