export function PetalMark({ size = 15, muted = false }: { size?: number; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className="-mt-0.5 inline-block flex-none -rotate-25"
      style={{
        width: size,
        height: size,
        background: muted ? "var(--color-line)" : "var(--color-accent)",
        borderRadius: "999px 999px 999px 0",
      }}
    />
  );
}
