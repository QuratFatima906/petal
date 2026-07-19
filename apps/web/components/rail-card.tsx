/** Card used in the sticky insights rail on Mentions, Hashtags and Alerts. */
export function RailCard({
  title,
  children,
  gap = 14,
  header,
}: {
  title: string;
  children: React.ReactNode;
  gap?: number;
  header?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-card border border-line bg-surface p-[18px]" style={{ gap }}>
      {header ?? <div className="text-[11px] tracking-[0.08em] text-ink3 uppercase">{title}</div>}
      {children}
    </div>
  );
}
