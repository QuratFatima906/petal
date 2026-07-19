"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PetalMark } from "./petal-mark";

const NAV = [
  { label: "Overview", href: "/" },
  { label: "Mentions", href: "/mentions" },
  { label: "Hashtags", href: "/hashtags" },
  { label: "Alerts", href: "/alerts" },
  { label: "Settings", href: "/settings" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <div className="flex w-[232px] flex-none flex-col border-r border-line px-3 pt-6 pb-4">
      <div className="flex items-center gap-2 px-3 pb-6">
        <PetalMark />
        <span className="font-display text-[22px] font-semibold text-ink">petal</span>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ label, href }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex w-full items-center gap-2.5 rounded-control px-[9px] py-[9px] text-[15px] no-underline hover:bg-surface2 hover:text-ink hover:no-underline ${
                active ? "bg-surface2 font-medium text-ink" : "font-normal text-ink2"
              }`}
            >
              <span
                className="h-4 w-[3px] flex-none rounded-full"
                style={{ background: active ? "var(--color-accent)" : "transparent" }}
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-2.5 rounded-card border border-line bg-surface px-3 py-2.5">
        <div className="grid h-7 w-7 flex-none place-items-center rounded-full border border-line bg-surface2 font-display text-[13px] font-semibold text-accent">
          O
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-ink">@omahi.app</div>
          <div className="flex items-center gap-[5px] text-[11px] text-ink2">
            <span className="h-1.5 w-1.5 rounded-full bg-pos" />
            Active
          </div>
        </div>
      </div>
    </div>
  );
}
