import { GlassCard } from "./GlassCard";

interface StatTileProps {
  label: string;
  value: string;
  delta?: { value: string; direction: "up" | "down" | "flat" } | null;
  hint?: string;
}

export function StatTile({ label, value, delta, hint }: StatTileProps) {
  return (
    <GlassCard>
      <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">{label}</p>
      <p className="tabular mt-3 font-(family-name:--font-display) text-2xl leading-tight break-words text-(--color-ink-primary) sm:text-3xl">
        {value}
      </p>
      <div className="mt-3 flex items-center gap-2 text-sm">
        {delta ? (
          <span
            className="flex items-center gap-1 font-medium"
            style={{
              color:
                delta.direction === "up"
                  ? "var(--color-delta-positive-strong)"
                  : delta.direction === "down"
                    ? "var(--color-delta-negative-strong)"
                    : "var(--color-ink-muted)",
            }}
          >
            <span aria-hidden>{delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "•"}</span>
            {delta.value}
          </span>
        ) : null}
        {hint ? <span className="text-(--color-ink-muted)">{hint}</span> : null}
      </div>
    </GlassCard>
  );
}
