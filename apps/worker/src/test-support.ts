import { pino } from "pino";
import type { MentionSource } from "@petal/core";
import type { Logger } from "./logger";
import type { PollStore } from "./store";

/** Shared fakes for the worker's deterministic unit tests (no Redis, no Postgres). */

export const silentLogger: Logger = pino({ level: "silent" });

export type MemoryStoreState = {
  readonly known: Map<MentionSource, Set<string>>;
  readonly captionMentionMediaIds: string[];
  readonly commentMentionIds: string[];
  readonly hashtags: { id: string; name: string }[];
  readonly polledHashtags: { id: string; at: Date }[];
  readonly deletions: { source: MentionSource; ids: readonly string[] }[];
};

export const makeMemoryStore = (
  seed: Partial<Omit<MemoryStoreState, "polledHashtags" | "deletions">> = {},
): { store: PollStore; state: MemoryStoreState } => {
  const state: MemoryStoreState = {
    known: seed.known ?? new Map(),
    captionMentionMediaIds: seed.captionMentionMediaIds ?? [],
    commentMentionIds: seed.commentMentionIds ?? [],
    hashtags: seed.hashtags ?? [],
    polledHashtags: [],
    deletions: [],
  };
  const store: PollStore = {
    knownIgObjectIds: (source, ids) => {
      const forSource = state.known.get(source) ?? new Set<string>();
      return Promise.resolve(new Set(ids.filter((id) => forSource.has(id))));
    },
    listKnownMentionRefs: (limit) =>
      Promise.resolve({
        captionMentionMediaIds: state.captionMentionMediaIds.slice(0, limit),
        commentMentionIds: state.commentMentionIds.slice(0, limit),
      }),
    listActiveHashtags: () => Promise.resolve(state.hashtags),
    markHashtagPolled: (id, at) => {
      state.polledHashtags.push({ id, at });
      return Promise.resolve();
    },
    deleteMirrored: (source, igObjectIds) => {
      state.deletions.push({ source, ids: igObjectIds });
      return Promise.resolve(igObjectIds.length);
    },
  };
  return { store, state };
};
