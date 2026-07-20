import { NextResponse } from "next/server";
import { enqueueIngestJob, type IngestJobPayload } from "../../../../lib/ingest-queue";
import { webhookDeliverySchema } from "../../../../lib/instagram-webhook";
import { logger } from "../../../../lib/logger";
import { tryLoadServerEnv } from "../../../../lib/server-env";
import { constantTimeEquals, verifyHubSignature } from "../../../../lib/webhook-signature";

// Signature verification needs node:crypto; deliveries must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Meta redelivers on non-2xx; anything above this is rejected before HMAC work. */
const MAX_BODY_BYTES = 1_048_576;
/** The route must ack within 2s regardless of downstream state (plan WP4). */
const ENQUEUE_BUDGET_MS = 1_500;

const ack = (): NextResponse => NextResponse.json({ data: { received: true } });

const failure = (status: number, code: string, message: string): NextResponse =>
  NextResponse.json({ error: { code, message } }, { status });

/**
 * Meta subscription verification (docs/meta-api-verify.md §2): echo
 * `hub.challenge` when `hub.verify_token` matches `IG_WEBHOOK_VERIFY_TOKEN`,
 * 403 otherwise.
 */
export function GET(request: Request): Response {
  const verifyToken = tryLoadServerEnv()?.IG_WEBHOOK_VERIFY_TOKEN;
  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (
    verifyToken !== undefined &&
    mode === "subscribe" &&
    token !== null &&
    challenge !== null &&
    constantTimeEquals(token, verifyToken)
  ) {
    logger.info("webhook subscription verified");
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Never log the tokens themselves (plan §5.6).
  logger.warn(
    { mode, tokenConfigured: verifyToken !== undefined, tokenPresent: token !== null },
    "webhook subscription verification rejected",
  );
  return failure(403, "verification_failed", "Webhook verification failed.");
}

/**
 * Meta delivery endpoint: verify `X-Hub-Signature-256` over the raw body,
 * enqueue one `ingest` job per change entry, and ack 200 regardless of
 * downstream state — the poll lane reconciles missed deliveries (plan §2).
 */
export async function POST(request: Request): Promise<Response> {
  const receivedAt = new Date().toISOString();

  const env = tryLoadServerEnv();
  if (env === null || env.IG_APP_SECRET === undefined) {
    logger.error("IG_APP_SECRET unavailable; cannot verify webhook deliveries");
    return failure(401, "invalid_signature", "Signature verification failed.");
  }

  const declaredBytes = Number(request.headers.get("content-length") ?? "0");
  if (declaredBytes > MAX_BODY_BYTES) {
    logger.warn({ declaredBytes }, "webhook body over size limit; rejected");
    return failure(413, "payload_too_large", "Request body exceeds the size limit.");
  }

  let raw: Buffer;
  try {
    raw = Buffer.from(await request.arrayBuffer());
  } catch (error) {
    logger.warn({ err: error }, "failed to read webhook body");
    return failure(400, "unreadable_body", "Request body could not be read.");
  }
  if (raw.byteLength > MAX_BODY_BYTES) {
    logger.warn({ bodyBytes: raw.byteLength }, "webhook body over size limit; rejected");
    return failure(413, "payload_too_large", "Request body exceeds the size limit.");
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyHubSignature(raw, signature, env.IG_APP_SECRET)) {
    // Log presence and length only, never the signature value (plan §5.6).
    logger.warn(
      { signaturePresent: signature !== null, bodyBytes: raw.byteLength },
      "webhook signature rejected",
    );
    return failure(401, "invalid_signature", "Signature verification failed.");
  }

  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    // Authenticated but unparseable: ack so Meta stops redelivering garbage.
    logger.warn({ bodyBytes: raw.byteLength }, "signed webhook body is not JSON; acked without enqueue");
    return ack();
  }

  const parsed = webhookDeliverySchema.safeParse(body);
  if (!parsed.success) {
    logger.warn({ issueCount: parsed.error.issues.length }, "unrecognized webhook shape; acked without enqueue");
    return ack();
  }

  if (parsed.data.object !== "instagram") {
    logger.info({ object: parsed.data.object }, "webhook for unhandled topic; acked without enqueue");
    return ack();
  }

  const jobs: IngestJobPayload[] = parsed.data.entry.flatMap((entry) =>
    (entry.changes ?? []).map((change) => ({
      accountId: entry.id,
      lane: "webhook" as const,
      receivedAt,
      // The change's field/value pair is forwarded verbatim; the worker parses it.
      payload: { kind: "webhook_change" as const, field: change.field, value: change.value },
    })),
  );

  if (jobs.length === 0) {
    logger.info({ entryCount: parsed.data.entry.length }, "webhook delivery had no change entries; acked");
    return ack();
  }

  try {
    // Bounded by the delivery's own change count — Meta batches are small.
    await withTimeout(
      Promise.all(jobs.map((job) => enqueueIngestJob(env.REDIS_URL, job))),
      ENQUEUE_BUDGET_MS,
    );
    logger.info({ jobCount: jobs.length }, "webhook changes enqueued for ingest");
  } catch (error) {
    // Still ack: Meta must not redeliver, and the poll lane reconciles the gap.
    logger.error({ err: error, jobCount: jobs.length }, "ingest enqueue failed; acked anyway");
  }
  return ack();
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  // Keep a rejection observer so a late enqueue failure after the timeout
  // fires never surfaces as an unhandled rejection.
  void promise.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`enqueue exceeded ${String(ms)}ms budget`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
