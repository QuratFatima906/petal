const PETALS = [0, 1, 2, 3, 4] as const;

export function PetalLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-6">
        <div className="relative h-[72px] w-[72px]" style={{ animation: "spin 8s linear infinite" }}>
          {PETALS.map((i) => (
            <div key={i} className="absolute inset-0" style={{ transform: `rotate(${i * 72}deg)` }}>
              <span
                className="absolute top-0.5 left-1/2 -ml-2.5 h-5 w-5 bg-accent opacity-50"
                style={{
                  borderRadius: "999px 999px 999px 0",
                  transform: "rotate(45deg)",
                  animation: "bloom 1.8s ease-in-out infinite",
                  animationDelay: `${(i * 0.36).toFixed(2)}s`,
                }}
              />
            </div>
          ))}
          <span className="absolute top-1/2 left-1/2 -mt-[5px] -ml-[5px] h-2.5 w-2.5 rounded-full border border-accent bg-warn-bg" />
        </div>
        <div className="text-[13px] text-ink2">Listening for mentions…</div>
      </div>
    </div>
  );
}
