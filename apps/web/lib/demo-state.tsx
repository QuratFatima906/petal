"use client";

import { createContext, useContext, useEffect, useState } from "react";

type DemoStatus = "loading" | "not_connected" | "ready";

type DemoState = {
  readonly status: DemoStatus;
  readonly seed: () => void;
  readonly reset: () => void;
};

const STORAGE_KEY = "petal.demo";
const SEED_DELAY_MS = 900;

const DemoContext = createContext<DemoState | null>(null);

/**
 * Demo-mode connection state, persisted in localStorage. Stands in for the
 * accounts table until live mode exists: first run shows the Connect screen,
 * seeding switches to the dashboard, Settings "Delete all data" resets.
 */
export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<DemoStatus>("loading");

  useEffect(() => {
    setStatus(window.localStorage.getItem(STORAGE_KEY) === "seeded" ? "ready" : "not_connected");
  }, []);

  const seed = () => {
    setStatus("loading");
    window.localStorage.setItem(STORAGE_KEY, "seeded");
    window.setTimeout(() => setStatus("ready"), SEED_DELAY_MS);
  };

  const reset = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setStatus("not_connected");
  };

  return <DemoContext.Provider value={{ status, seed, reset }}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoState {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside DemoProvider");
  return ctx;
}
