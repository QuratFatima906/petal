"use client";

import { useDemo } from "@/lib/demo-state";
import { PetalMark } from "./petal-mark";

/** S7 — first-run screen shown while no account is connected. */
export function ConnectCard() {
  const { seed } = useDemo();
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex w-[440px] flex-col gap-4 rounded-card border border-line bg-surface p-8">
        <div className="flex items-center gap-2">
          <PetalMark />
          <span className="font-display text-[22px] font-semibold">petal</span>
        </div>
        <p className="m-0 text-ink2">
          Connect your Instagram professional account and Petal listens to every comment, mention and tracked hashtag —
          scored for sentiment and intent, rolled into a live view of how your brand is doing.
        </p>
        <div className="flex gap-2.5">
          <button
            type="button"
            title="Live mode arrives with the Meta app setup"
            className="cursor-pointer rounded-control border-none bg-accent px-4 py-2.5 text-[15px] font-medium text-accent-ink hover:bg-accent-hover"
          >
            Connect Instagram
          </button>
          <button
            type="button"
            onClick={seed}
            className="cursor-pointer rounded-control border border-line bg-transparent px-4 py-2.5 text-[15px] text-ink hover:bg-surface2"
          >
            Explore with demo data
          </button>
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <div className="text-[13px] text-ink3">1 · You approve access on Instagram</div>
          <div className="text-[13px] text-ink3">2 · Petal backfills recent comments and mentions</div>
          <div className="text-[13px] text-ink3">3 · New activity appears here within about a minute</div>
        </div>
      </div>
    </div>
  );
}
