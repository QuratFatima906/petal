/** Exhaustiveness guard for switches over discriminated unions (plan §5.3). */
export function assertNever(x: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
}
