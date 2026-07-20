import { pino, type Logger } from "pino";

/**
 * Structured pino logger for the worker service (plan §5.6). Every line
 * carries `service`; job processors add `jobId` and `accountId` via child
 * bindings. Never log tokens or full comment text above debug — at info,
 * log IDs and lengths, not content.
 */
export const createLogger = (level: string): Logger => pino({ level, base: { service: "worker" } });

export type { Logger };
