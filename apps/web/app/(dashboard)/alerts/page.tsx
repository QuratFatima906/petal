"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FIRED_ALERTS, INITIAL_RULES, type AlertRule } from "@/lib/demo-data";
import { Toggle } from "@/components/toggle";

export default function AlertsPage() {
  const router = useRouter();
  const [rules, setRules] = useState<readonly AlertRule[]>(INITIAL_RULES);

  const setParam = (ruleIdx: number, paramIdx: number, v: string) => {
    setRules((prev) =>
      prev.map((r, i) =>
        i === ruleIdx ? { ...r, params: r.params.map((p, j) => (j === paramIdx ? { ...p, v } : p)) } : r,
      ),
    );
  };

  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-card border border-line bg-surface p-5">
        <div className="mb-2 text-[15px] font-medium">Rules</div>
        {rules.map((r, i) => (
          <div key={r.id} className="flex items-start gap-4 border-t border-line py-3.5">
            <div className="mt-1">
              <Toggle
                on={r.enabled}
                label={`Toggle ${r.name}`}
                onToggle={() => setRules((prev) => prev.map((x, j) => (j === i ? { ...x, enabled: !x.enabled } : x)))}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-medium" style={{ color: r.enabled ? "var(--color-ink)" : "var(--color-ink3)" }}>
                {r.name}
              </div>
              <div className="text-[13px] text-ink2">{r.desc}</div>
            </div>
            <div className="flex flex-none gap-2.5">
              {r.params.map((p, pi) => (
                <label key={p.k} className="flex flex-col gap-[3px]">
                  <span className="text-[11px] text-ink3">{p.label}</span>
                  <input
                    value={p.v}
                    onChange={(e) => setParam(i, pi, e.target.value)}
                    className="w-16 rounded-control border border-line bg-surface2 px-2 py-[5px] font-mono text-[13px] text-ink"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-card border border-line bg-surface p-5">
        <div className="mb-2 text-[15px] font-medium">Fired alerts</div>
        {FIRED_ALERTS.length === 0 ? (
          <div className="py-8 text-center text-ink2">No alerts yet. That&apos;s usually good news.</div>
        ) : (
          <div className="flex flex-col">
            {FIRED_ALERTS.map((a) => (
              <div
                key={`${a.when}-${a.rule}`}
                onClick={() => router.push(a.filter === "all" ? "/mentions" : `/mentions?sentiment=${a.filter}`)}
                className="flex cursor-pointer items-center gap-3.5 rounded-control border-t border-line px-1 py-3 hover:bg-surface2"
              >
                <span className="w-[110px] flex-none font-mono text-[13px] text-ink3">{a.when}</span>
                <span className="w-[120px] flex-none text-[13px] font-medium">{a.rule}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink2">{a.summary}</span>
                <span
                  title={a.delivered ? "Delivered to Slack" : "Slack delivery failed — alert recorded"}
                  className="h-2 w-2 flex-none rounded-full"
                  style={{ background: a.delivered ? "var(--color-pos)" : "var(--color-neg)" }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
