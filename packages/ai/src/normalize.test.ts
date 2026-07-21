import { describe, expect, it } from "vitest";
import { normalizeText } from "./normalize";

describe("normalizeText", () => {
  it("collapses runs of whitespace and trims", () => {
    expect(normalizeText("  hello   world\n\tnow ")).toBe("hello world now");
  });

  it("is idempotent", () => {
    const once = normalizeText("a  b\tc");
    expect(normalizeText(once)).toBe(once);
  });

  it("applies NFKC so visually identical text hashes the same", () => {
    // Fullwidth digits normalize to ASCII under NFKC.
    expect(normalizeText("ｄａｙ 14")).toBe("day 14");
  });

  it("maps whitespace-only input to the empty string", () => {
    expect(normalizeText("   \n\t ")).toBe("");
  });
});
