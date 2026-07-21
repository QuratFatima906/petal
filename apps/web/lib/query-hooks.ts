"use client";

import {
  alertsResponseSchema,
  apiErrorSchema,
  mentionDetailResponseSchema,
  mentionsResponseSchema,
  statsOverviewResponseSchema,
  type AlertsResponse,
  type MentionDetailResponse,
  type MentionsQuery,
  type MentionsResponse,
  type StatsOverviewResponse,
} from "@petal/core";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

/**
 * Dashboard query hooks (plan §7), typed by the frozen core response schemas.
 * The feed and overview refetch every 30s for a near-live view; each fetch
 * parses the `{ data }` envelope and surfaces `{ error }` envelopes as thrown
 * errors. Requires <QueryProvider> (query-provider.tsx) above in the tree.
 */
const REFETCH_MS = 30_000;

type OverviewData = StatsOverviewResponse["data"];
type MentionsData = MentionsResponse["data"];
type MentionDetailData = MentionDetailResponse["data"];
type AlertsData = AlertsResponse["data"];

/** Filters for the mentions feed; `cursor` is supplied by pagination, not callers. */
export type MentionsFilters = Partial<Pick<MentionsQuery, "sentiment" | "intent" | "source" | "q" | "limit">>;

function toError(json: unknown, status: number): Error {
  const parsed = apiErrorSchema.safeParse(json);
  return new Error(parsed.success ? parsed.data.error.message : `Request failed (${String(status)})`);
}

async function fetchOverview(days: number): Promise<OverviewData> {
  const res = await fetch(`/api/stats/overview?days=${String(days)}`);
  const json: unknown = await res.json();
  if (!res.ok) throw toError(json, res.status);
  return statsOverviewResponseSchema.parse(json).data;
}

function mentionsUrl(filters: MentionsFilters, cursor: string | null): string {
  const p = new URLSearchParams();
  if (filters.sentiment !== undefined) p.set("sentiment", filters.sentiment);
  if (filters.intent !== undefined) p.set("intent", filters.intent);
  if (filters.source !== undefined) p.set("source", filters.source);
  if (filters.q !== undefined && filters.q !== "") p.set("q", filters.q);
  if (filters.limit !== undefined) p.set("limit", String(filters.limit));
  if (cursor !== null) p.set("cursor", cursor);
  const qs = p.toString();
  return qs === "" ? "/api/mentions" : `/api/mentions?${qs}`;
}

async function fetchMentions(filters: MentionsFilters, cursor: string | null): Promise<MentionsData> {
  const res = await fetch(mentionsUrl(filters, cursor));
  const json: unknown = await res.json();
  if (!res.ok) throw toError(json, res.status);
  return mentionsResponseSchema.parse(json).data;
}

async function fetchMentionDetail(id: string): Promise<MentionDetailData> {
  const res = await fetch(`/api/mentions/${encodeURIComponent(id)}`);
  const json: unknown = await res.json();
  if (!res.ok) throw toError(json, res.status);
  return mentionDetailResponseSchema.parse(json).data;
}

async function fetchAlerts(): Promise<AlertsData> {
  const res = await fetch("/api/alerts");
  const json: unknown = await res.json();
  if (!res.ok) throw toError(json, res.status);
  return alertsResponseSchema.parse(json).data;
}

/** 7-day overview; refetches every 30s (plan §7). */
export function useOverview(days = 7) {
  return useQuery({
    queryKey: ["overview", days],
    queryFn: () => fetchOverview(days),
    refetchInterval: REFETCH_MS,
  });
}

/** Cursor-paginated mentions feed; refetches every 30s (plan §7). */
export function useMentionsFeed(filters: MentionsFilters = {}) {
  return useInfiniteQuery({
    queryKey: ["mentions", filters],
    queryFn: ({ pageParam }) => fetchMentions(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: MentionsData) => last.nextCursor,
    refetchInterval: REFETCH_MS,
  });
}

/** Full detail for one mention; fetched on demand when a card is opened. */
export function useMentionDetail(id: string | null) {
  return useQuery({
    queryKey: ["mention", id],
    queryFn: () => fetchMentionDetail(id as string),
    enabled: id !== null,
  });
}

/** Fired alerts + tunable rules. */
export function useAlerts() {
  return useQuery({ queryKey: ["alerts"], queryFn: fetchAlerts });
}
