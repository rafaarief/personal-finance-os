interface MetricItem {
  label: string;
  value: string;
  /** CSS color for the value text — defaults to primary ink. */
  color?: string;
}

interface MetricGridProps {
  items: MetricItem[];
  /** Column cap at the desktop breakpoint — narrower desktop widths still wrap into fewer columns (e.g. 2x2). Default 4. */
  maxCols?: 3 | 4;
}

// Tailwind needs literal class strings (no dynamic template interpolation) to keep them in the JIT scan.
const DESKTOP_COLS: Record<NonNullable<MetricGridProps["maxCols"]>, string> = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

/**
 * Shared layout for financial summary metrics (Capital Market / Business
 * totals, Cashflow statement) — one grid so column width, gap, and figure
 * typography only need to be gotten right in one place. Mobile: 1 column.
 * Tablet: 2 columns. Desktop: up to `maxCols`, wrapping into fewer columns
 * first if the metric count doesn't divide evenly (e.g. 5 items at 3
 * columns wraps 3+2, not an awkward 4th column with one orphan).
 */
export function MetricGrid({ items, maxCols = 4 }: MetricGridProps) {
  return (
    <div className={`grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 ${DESKTOP_COLS[maxCols]}`}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">{item.label}</p>
          <p
            className="metric-figure mt-1.5 font-(family-name:--font-display)"
            style={{ color: item.color ?? "var(--color-ink-primary)" }}
            title={item.value}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
