"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDemo } from "@/lib/demo-state";
import { ConnectCard } from "./connect-card";
import { PetalLoader } from "./petal-loader";
import { PetalMark } from "./petal-mark";

const EMPTY_COPY: Record<string, string> = {
  "/": "Nothing yet. Mentions appear here within about a minute of someone talking about you.",
  "/mentions": "Nothing yet. Mentions appear here within about a minute of someone talking about you.",
  "/hashtags": "No hashtags tracked yet. Add one and public posts under it show up in your feed.",
};

/**
 * Wraps every dashboard screen: first run shows the Connect screen, seeding
 * shows the loader, and a ?state=loading|empty|error param demos those states
 * on the seeded app (Alerts and Settings render normally in the empty state,
 * matching the mockup).
 */
export function ScreenStateGate({ children }: { children: React.ReactNode }) {
  const { status } = useDemo();
  const pathname = usePathname();
  const router = useRouter();
  const override = useSearchParams().get("state");

  if (status === "loading") return <PetalLoader />;
  if (status === "not_connected") return <ConnectCard />;
  if (override === "loading") return <PetalLoader />;

  if (override === "error") {
    return (
      <div className="flex items-center justify-between gap-4 rounded-card border border-accent bg-warn-bg px-5 py-3.5">
        <div className="text-[15px] text-accent">
          Couldn&apos;t load this week&apos;s numbers. The data is safe — the connection to the server dropped.
        </div>
        <button
          type="button"
          onClick={() => router.replace(pathname)}
          className="flex-none cursor-pointer rounded-control border-none bg-accent px-3.5 py-[7px] text-[13px] font-medium text-surface hover:bg-accent-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  const emptyCopy = EMPTY_COPY[pathname];
  if (override === "empty" && emptyCopy) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <PetalMark size={20} muted />
          <div className="max-w-[380px] text-ink2">{emptyCopy}</div>
          {pathname === "/" ? (
            <button
              type="button"
              onClick={() => router.replace(pathname)}
              className="cursor-pointer rounded-control border border-line bg-transparent px-3.5 py-2 text-[13px] font-medium text-accent hover:bg-surface2"
            >
              Seed demo data
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
