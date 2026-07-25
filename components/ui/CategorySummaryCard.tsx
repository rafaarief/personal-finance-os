import { formatMoney } from "@/lib/format/money";
import { GlassCard } from "./GlassCard";

interface SecondaryBreakdownItem {
  label: string;
  value: number;
}

interface BreakdownItem {
  label: string;
  value: number;
  color: string;
  /** Rendered smaller/indented underneath, e.g. Receivables + Vehicle under Other Assets — never as prominent as the primary rows. */
  secondary?: SecondaryBreakdownItem[];
}

interface CategorySummaryCardProps {
  title: string;
  total: number;
  percentOfNetWorth: number | null;
  breakdown: BreakdownItem[];
}

export function CategorySummaryCard({ title, total, percentOfNetWorth, breakdown }: CategorySummaryCardProps) {
  return (
    <GlassCard className="flex flex-col">
      <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">{title}</p>
      <p className="kpi-figure mt-2 font-(family-name:--font-display) text-(--color-ink-primary)">{formatMoney(total)}</p>
      {percentOfNetWorth !== null ? (
        <p className="mt-1 text-sm text-(--color-ink-secondary)">{(percentOfNetWorth * 100).toFixed(1)}% of Net Worth</p>
      ) : null}

      <div className="mt-5 space-y-4">
        {breakdown.map((item) => {
          const share = total > 0 ? item.value / total : 0;
          return (
            <div key={item.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-sm text-(--color-ink-primary)">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
                  {item.label}
                </span>
                <span className="tabular shrink-0 text-sm whitespace-nowrap text-(--color-ink-primary)">
                  {formatMoney(item.value)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--color-border-hairline)">
                  <div className="h-full rounded-full" style={{ width: `${(share * 100).toFixed(1)}%`, background: item.color }} />
                </div>
                <span className="tabular w-12 shrink-0 text-right text-xs text-(--color-ink-muted)">
                  {(share * 100).toFixed(1)}%
                </span>
              </div>

              {item.secondary && item.secondary.length > 0 ? (
                <div className="mt-2 ml-4 space-y-1 border-l border-(--color-border-hairline) pl-3">
                  {item.secondary.map((sub) => (
                    <div key={sub.label} className="flex items-baseline justify-between gap-3 text-xs text-(--color-ink-muted)">
                      <span>{sub.label}</span>
                      <span className="tabular whitespace-nowrap">{formatMoney(sub.value)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
