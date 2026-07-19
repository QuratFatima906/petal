"use client";

import { usePathname } from "next/navigation";
import { useDemo } from "@/lib/demo-state";

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/mentions": "Mentions",
  "/hashtags": "Hashtags",
  "/alerts": "Alerts",
  "/settings": "Settings",
};

export function TopBar() {
  const pathname = usePathname();
  const { status } = useDemo();
  const title = TITLES[pathname] ?? "Overview";
  return (
    <div className="flex flex-none items-center justify-between border-b border-line px-8 py-5">
      <div className="flex items-baseline gap-3">
        <h1 className="font-display text-[28px] leading-[1.15] font-semibold">{title}</h1>
        {status === "ready" ? (
          <span className="rounded-full border border-ai px-[9px] py-0.5 text-[11px] tracking-[0.08em] text-ai uppercase">
            Demo data
          </span>
        ) : null}
      </div>
      <div className="text-[13px] text-ink2">Last 7 days</div>
    </div>
  );
}
