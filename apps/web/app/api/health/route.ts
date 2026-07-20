import { NextResponse } from "next/server";
import pkg from "../../../package.json";

// Evaluated per request so DEMO_MODE reflects the runtime environment, not the build.
export const dynamic = "force-dynamic";

// WP10-lite liveness probe. The full health contract from plan section 7
// (`db: boolean; redis: boolean; queueDepths: Record<string, number>`) arrives
// with WP7, once Postgres, Redis and the BullMQ queues are wired in.
export function GET(): NextResponse {
  return NextResponse.json({
    data: {
      status: "ok",
      version: pkg.version,
      demoMode: process.env.DEMO_MODE === "true",
    },
  });
}
