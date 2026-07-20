import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the Docker image (Dockerfile.web).
  output: "standalone",
  // Pin file tracing to the monorepo root so the standalone layout is always
  // <root>/apps/web/server.js, regardless of lockfiles above the checkout.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
