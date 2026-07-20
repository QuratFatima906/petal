import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./cursor";

describe("cursor", () => {
  it("round trips", () => {
    const cursor = { occurredAt: "2026-07-01T10:00:00.000Z", id: "01J0EXAMPLE" };
    const decoded = decodeCursor(encodeCursor(cursor));
    expect(decoded).toEqual({ ok: true, value: cursor });
  });

  it("rejects garbage", () => {
    for (const bad of ["", "not-a-cursor", Buffer.from("{}").toString("base64url"), Buffer.from('{"id":""}').toString("base64url")]) {
      expect(decodeCursor(bad).ok).toBe(false);
    }
  });
});
