"use client";

import { useEffect, useRef, useState } from "react";

export default function SettingsPage() {
  const [slackTest, setSlackTest] = useState<"idle" | "sent">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const sendTest = () => {
    setSlackTest("sent");
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setSlackTest("idle"), 2000);
  };

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
        <div className="text-[15px] font-medium">Connection</div>
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface2 font-display text-[15px] font-semibold text-accent">
            O
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-medium">@omahi.app</div>
            <div className="flex items-center gap-[5px] text-[13px] text-ink2">
              <span className="h-1.5 w-1.5 rounded-full bg-pos" />
              Active · connected May 12, 2026
            </div>
          </div>
          <button
            type="button"
            className="cursor-pointer rounded-control border border-line bg-transparent px-3.5 py-[7px] text-[13px] text-ink hover:bg-surface2"
          >
            Reconnect
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-control border border-line bg-transparent px-3.5 py-[7px] text-[13px] text-ink2 hover:border-neg hover:text-neg"
          >
            Disconnect
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-5">
        <div className="flex-1">
          <div className="text-[15px] font-medium">Slack</div>
          <div className="flex items-center gap-[5px] text-[13px] text-ink2">
            <span className="h-1.5 w-1.5 rounded-full bg-pos" />
            Webhook set · alerts post to #omahi-listening
          </div>
        </div>
        <button
          type="button"
          onClick={sendTest}
          className="cursor-pointer rounded-control border border-line bg-transparent px-3.5 py-[7px] text-[13px] text-ink hover:bg-surface2"
        >
          {slackTest === "sent" ? "Sent ✓" : "Send test message"}
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
        <div className="text-[15px] font-medium">Data</div>
        <div className="flex items-center gap-3">
          <div className="flex-1 text-[13px] text-ink2">
            Mentions and scores are kept for <span className="font-mono text-ink">90 days</span>, then deleted
            automatically.
          </div>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-neg">Everything, permanently?</span>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="cursor-pointer rounded-control border-none bg-neg px-3.5 py-[7px] text-[13px] font-medium text-surface"
              >
                Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="cursor-pointer rounded-control border border-line bg-transparent px-3.5 py-[7px] text-[13px] text-ink2 hover:bg-surface2"
              >
                Keep it
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="cursor-pointer rounded-control border border-line bg-transparent px-3.5 py-[7px] text-[13px] text-neg hover:border-neg"
            >
              Delete all data
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-5">
        <div className="text-[15px] font-medium">About</div>
        <div className="font-mono text-[13px] text-ink2">petal 0.4.0 · Instagram Graph API v23.0</div>
        <a href="#" onClick={(e) => e.preventDefault()} className="text-[13px]">
          What Petal can and can&apos;t see
        </a>
      </div>
    </div>
  );
}
