import { describe, expect, it } from "vitest";
import { err, ok, IgApiError, type Result } from "@petal/core";
import { collectAllPages, paginate, type Page } from "./pagination";

type E = IgApiError;

const pagedFetcher = (pages: readonly Page<string>[]) => {
  const calls: (string | undefined)[] = [];
  const fetchPage = (after?: string): Promise<Result<Page<string>, E>> => {
    calls.push(after);
    const index = after === undefined ? 0 : Number(after);
    const page = pages[index];
    return Promise.resolve(page === undefined ? err(new IgApiError("no such page", 404)) : ok(page));
  };
  return { fetchPage, calls };
};

describe("paginate", () => {
  it("follows after cursors until the last page", async () => {
    const { fetchPage, calls } = pagedFetcher([
      { items: ["a", "b"], after: "1" },
      { items: ["c"], after: "2" },
      { items: ["d"] },
    ]);
    const seen: string[][] = [];
    for await (const page of paginate(fetchPage)) {
      expect(page.ok).toBe(true);
      if (page.ok) seen.push([...page.value.items]);
    }
    expect(seen).toEqual([["a", "b"], ["c"], ["d"]]);
    expect(calls).toEqual([undefined, "1", "2"]);
  });

  it("stops at maxPages even when cursors continue", async () => {
    const endless = (after?: string): Promise<Result<Page<string>, E>> =>
      Promise.resolve(ok({ items: [after ?? "start"], after: "again" }));
    let count = 0;
    for await (const page of paginate(endless, { maxPages: 3 })) {
      expect(page.ok).toBe(true);
      count++;
    }
    expect(count).toBe(3);
  });

  it("yields the error and stops", async () => {
    const failing = (): Promise<Result<Page<string>, E>> => Promise.resolve(err(new IgApiError("boom", 500)));
    const results = [];
    for await (const page of paginate(failing)) results.push(page);
    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(false);
  });
});

describe("collectAllPages", () => {
  it("flattens all pages into one item list", async () => {
    const { fetchPage } = pagedFetcher([
      { items: ["a"], after: "1" },
      { items: ["b", "c"] },
    ]);
    const result = await collectAllPages(fetchPage);
    expect(result).toEqual(ok(["a", "b", "c"]));
  });

  it("propagates a mid-pagination error instead of returning partial data", async () => {
    const pages: Page<string>[] = [{ items: ["a"], after: "5" }];
    const { fetchPage } = pagedFetcher(pages);
    const result = await collectAllPages(fetchPage);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(IgApiError);
  });
});
