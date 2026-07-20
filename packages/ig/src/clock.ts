/** Injected time source (plan §5.9) — never `new Date()` inside domain logic. */
export type Clock = () => Date;

/** Real clock used outside tests. */
export const systemClock: Clock = () => new Date();
