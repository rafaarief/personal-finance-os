import type { HealthStatus } from "@/lib/finance/insights";

const CONFIG: Record<HealthStatus, { dot: string; label: string; color: string }> = {
  excellent: { dot: "🟢", label: "Excellent", color: "var(--color-status-good)" },
  good: { dot: "🟡", label: "Good", color: "var(--color-status-warning)" },
  attention: { dot: "🔴", label: "Needs Attention", color: "var(--color-status-critical)" },
};

export function HealthBadge({ status }: { status: HealthStatus }) {
  const config = CONFIG[status];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-(--color-border-hairline) bg-(--color-surface) px-3 py-1 text-sm font-medium">
      <span aria-hidden>{config.dot}</span>
      <span style={{ color: config.color }}>Financial Health: {config.label}</span>
    </span>
  );
}
