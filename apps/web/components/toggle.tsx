"use client";

export function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className="relative h-5 w-9 flex-none cursor-pointer rounded-full border p-0 transition-colors duration-150 ease-out"
      style={{
        borderColor: on ? "var(--color-accent)" : "var(--color-line)",
        background: on ? "var(--color-warn-bg)" : "var(--color-surface2)",
      }}
    >
      <span
        className="absolute top-0.5 block h-3.5 w-3.5 rounded-full transition-all duration-150 ease-out"
        style={on ? { right: 2, background: "var(--color-accent)" } : { left: 2, background: "var(--color-ink3)" }}
      />
    </button>
  );
}
