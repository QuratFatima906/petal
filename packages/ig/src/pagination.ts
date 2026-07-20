import { ok, type Result } from "@petal/core";

/**
 * Cursor pagination helper. Graph list edges page with `after` cursors (and
 * `/tags` has no `next` links at all — verify doc §4), so everything reduces
 * to "call again with the last `after`".
 */

export type Page<T> = {
  readonly items: readonly T[];
  /** Cursor for the next page; absent on the last page. */
  readonly after?: string;
};

export type FetchPage<T, E> = (after?: string) => Promise<Result<Page<T>, E>>;

export type PaginateOptions = {
  /** Hard bound on pages fetched — unbounded pagination over API calls is a review blocker (plan §5.4). */
  readonly maxPages?: number;
};

export const DEFAULT_MAX_PAGES = 20;

/** Yields one Result per page; stops after the first error, the last cursor, or `maxPages`. */
export async function* paginate<T, E>(
  fetchPage: FetchPage<T, E>,
  options: PaginateOptions = {},
): AsyncGenerator<Result<Page<T>, E>, void, undefined> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await (after === undefined ? fetchPage() : fetchPage(after));
    yield page;
    if (!page.ok) return;
    after = page.value.after;
    if (after === undefined) return;
  }
}

/** Drains `paginate` into a flat item list; an error mid-way discards nothing silently — it is returned. */
export const collectAllPages = async <T, E>(
  fetchPage: FetchPage<T, E>,
  options: PaginateOptions = {},
): Promise<Result<readonly T[], E>> => {
  const items: T[] = [];
  for await (const page of paginate(fetchPage, options)) {
    if (!page.ok) return page;
    items.push(...page.value.items);
  }
  return ok(items);
};
