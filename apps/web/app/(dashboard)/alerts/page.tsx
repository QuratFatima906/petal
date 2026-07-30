"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FIRED_ALERTS, INITIAL_RULES, type AlertRule as DemoAlertRule } from "@/lib/demo-data";
import { Toggle } from "@/components/toggle";
import { RailCard } from "@/components/rail-card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AlertsResponse } from "@petal/core";

/**
 * S5 Alerts screen (plan §11). Loads rules + fired alerts from the live API,
 * falling back to demo data when the API returns empty (no active account).
 */

async function fetchAlerts(): Promise<AlertsResponse["data"]> {
  const res = await fetch("/api/alerts");
  if (!res.ok) throw new Error(`Failed to fetch alerts (${res.status})`);
  const json: unknown = await res.json();
  const data = (json as { data: AlertsResponse["data"] }).data;
  return data;
}

type ApiRule = { id: string; kind: "volume_spike" | "negative_share"; params: Record<string, number>; enabled: boolean };

function apiRuleToDisplay(rule: ApiRule): {
  id: string;
  name: string;
  desc: string;
  enabled: boolean;
  params: { k: string; label: string; v: string }[];
} {
  const isVolume = rule.kind === "volume_spike";
  return {
    id: rule.id,
    name: isVolume ? "Volume spike" : "Negative share",
    desc: isVolume
      ? "Fires when 24h mentions reach a multiple of the 7 day daily average."
      : "Fires when negative mentions cross a share of the last 24 hours.",
    enabled: rule.enabled,
    params: isVolume
      ? [
          { k: "mult", label: "Multiplier", v: String(rule.params.mult ?? 2) },
          { k: "min", label: "Min events", v: String(rule.params.min ?? 10) },
          { k: "cool", label: "Cooldown (h)", v: String(rule.params.cool ?? 6) },
        ]
      : [
          { k: "share", label: "Share (%)", v: String(rule.params.share ?? 30) },
          { k: "min", label: "Min events", v: String(rule.params.min ?? 5) },
          { k: "cool", label: "Cooldown (h)", v: String(rule.params.cool ?? 6) },
        ],
  };
}

type DisplayRule = ReturnType<typeof apiRuleToDisplay>;

function apiAlertToDisplay(
  firedAt: string,
  summary: string,
  deliveredSlack: boolean,
): { when: string; rule: string; summary: string; delivered: boolean; filter: "negative" | "all" } {
  const d = new Date(firedAt);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getUTCMonth()] ?? "";
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return {
    when: `${month} ${day} · ${hh}:${mm}`,
    rule: summary.includes("negative") ? "Negative share" : "Volume spike",
    summary,
    delivered: deliveredSlack,
    filter: summary.toLowerCase().includes("negative") ? "negative" : "all",
  };
}

export default function AlertsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Local state for demo-mode rules (no API to write to).
  const [demoRules, setDemoRules] = useState<DisplayRule[]>(() =>
    INITIAL_RULES.map((r: DemoAlertRule) => ({
      id: r.id,
      name: r.name,
      desc: r.desc,
      enabled: r.enabled,
      params: r.params.map((p) => ({ k: p.k, label: p.label, v: p.v })),
    })),
  );

  const { data: apiData, isLoading, isError } = useQuery({
    queryKey: ["alerts"],
    queryFn: fetchAlerts,
    refetchInterval: 30_000,
  });

  const patchRule = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { enabled?: boolean; params?: Record<string, number> } }) => {
      const res = await fetch(`/api/alert-rules/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`Failed to update rule (${res.status})`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  // Use API data when available, otherwise fall back to demo data.
  const hasLiveData = apiData !== undefined && apiData.rules.length > 0;
  const displayRules: DisplayRule[] = useMemo(() => {
    if (hasLiveData) return apiData.rules.map(apiRuleToDisplay);
    return demoRules;
  }, [apiData, hasLiveData, demoRules]);

  const firedAlerts: typeof FIRED_ALERTS = useMemo(() => {
    if (hasLiveData)
      return apiData.fired.map((a) =>
        apiAlertToDisplay(a.firedAt, a.summary, a.deliveredSlack),
      );
    return FIRED_ALERTS;
  }, [apiData, hasLiveData]);

  const delivered = firedAlerts.filter((a) => a.delivered).length;
  const failed = firedAlerts.length - delivered;
  const deliveryRate = firedAlerts.length ? `${Math.round((delivered / firedAlerts.length) * 100)}%` : "—";
  const activeRuleCount = displayRules.filter((r) => r.enabled).length;

  const setToggle = (idx: number) => {
    if (hasLiveData) {
      const liveRule = apiData?.rules[idx];
      if (liveRule !== undefined) {
        patchRule.mutate({ id: liveRule.id, patch: { enabled: !liveRule.enabled } });
      }
    } else {
      setDemoRules((prev) => prev.map((r, i) => (i === idx ? { ...r, enabled: !r.enabled } : r)));
    }
  };

  // Loading state
  if (isLoading && !hasLiveData) {
    return (
      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
            <div className="skeleton h-5 w-20 rounded" />
            {[1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-3 border-t border-line py-3.5">
                <div className="skeleton h-4 w-32 rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-[90px] rounded-card border border-line bg-surface" />
          ))}
        </div>
      </div>
    );
  }

  // Error state (and no demo fallback — shouldn't happen since demo data is always there)
  if (isError && !displayRules.length) {
    return (
      <div className="py-16 text-center">
        <div className="text-[15px] text-ink2">Failed to load alerts.</div>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ["alerts"] })} className="mt-2 text-[13px] text-accent underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1 rounded-card border border-line bg-surface p-5">
          <div className="mb-2 text-[15px] font-medium">Rules</div>
          {displayRules.length === 0 ? (
            <div className="py-8 text-center text-ink2">No rules configured. Add one in Settings.</div>
          ) : (
            displayRules.map((r, i) => (
              <div key={r.id} className="flex flex-col gap-3 border-t border-line py-3.5">
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    <Toggle
                      on={r.enabled}
                      label={`Toggle ${r.name}`}
                      onToggle={() => setToggle(i)}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium" style={{ color: r.enabled ? "var(--color-ink)" : "var(--color-ink3)" }}>
                      {r.name}
                    </div>
                    <div className="text-[13px] text-ink2">{r.desc}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2.5 pl-[52px]">
                  {r.params.map((p) => (
                    <label key={p.k} className="flex flex-col gap-[3px]">
                      <span className="text-[11px] text-ink3">{p.label}</span>
                      <input
                        value={p.v}
                        readOnly
                        className="w-16 rounded-control border border-line bg-surface2 px-2 py-[5px] font-mono text-[13px] text-ink"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-card border border-line bg-surface p-5">
          <div className="mb-2 text-[15px] font-medium">Fired alerts</div>
          {firedAlerts.length === 0 ? (
            <div className="py-8 text-center text-ink2">No alerts yet. That&apos;s usually good news.</div>
          ) : (
            <div className="flex flex-col">
              {firedAlerts.map((a, i) => (
                <div
                  key={`${a.when}-${i}`}
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 min-[1100px]:sticky min-[1100px]:top-0 min-[1100px]:flex min-[1100px]:flex-col">
        <RailCard title="Last 7 days">
          <div className="flex gap-5">
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-[32px] leading-none font-semibold">{firedAlerts.length}</span>
              <span className="text-[13px] text-ink2">fired</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-[32px] leading-none font-semibold">{activeRuleCount}</span>
              <span className="text-[13px] text-ink2">rules on</span>
            </div>
          </div>
        </RailCard>

        <RailCard title="Slack delivery" gap={12}>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[22px] font-semibold">{deliveryRate}</span>
            <span className="text-[13px] text-ink2">delivered</span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[13px] text-ink2">
              <span className="h-2 w-2 flex-none rounded-full bg-pos" />
              {delivered} posted to Slack
            </div>
            <div className="flex items-center gap-2 text-[13px] text-ink2">
              <span className="h-2 w-2 flex-none rounded-full bg-neg" />
              {failed} failed — recorded here anyway
            </div>
          </div>
        </RailCard>

        <RailCard title="Next check" gap={6}>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 flex-none rounded-full bg-accent" style={{ animation: "livetick 2s ease-in-out infinite" }} />
            <span className="text-[15px] font-medium">every 10 min</span>
          </div>
          <div className="text-[13px] text-ink2">Petal evaluates rules every 10 minutes against daily aggregates.</div>
        </RailCard>
      </div>
    </div>
  );
}
