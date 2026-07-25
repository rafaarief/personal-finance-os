import type { CategorySummary, CategoryHistoryPoint } from "@/lib/finance/aggregates";
import { formatMoney, formatPercent } from "@/lib/format/money";
import { GlassCard } from "@/components/ui/GlassCard";
import { ValuationHistoryChart } from "@/components/charts/ValuationHistoryChart";
import { EditCurrentValueModal } from "@/components/EditCurrentValueModal";

function deltaColor(value: number | null): string {
  if (value === null) return "var(--color-ink-muted)";
  if (value > 0) return "var(--color-delta-positive-strong)";
  if (value < 0) return "var(--color-delta-negative-strong)";
  return "var(--color-ink-muted)";
}

function fmtSigned(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatMoney(Math.abs(value))}`;
}

function fmtSignedPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

interface ValuationSectionProps {
  summary: CategorySummary;
  history: CategoryHistoryPoint[];
  capitalLabel: string;
  currentValueLabel: string;
  gainLabel: string;
  /** Business only — enables the Valuation Method dropdown in the edit modal. */
  valuationMethods?: readonly string[];
}

export function ValuationSection({
  summary,
  history,
  capitalLabel,
  currentValueLabel,
  gainLabel,
  valuationMethods,
}: ValuationSectionProps) {
  const { accounts, currentValue, capitalContributed, gainLoss, returnPct, partialData } = summary;
  const noneKnown = capitalContributed === null;

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          <div>
            <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Total {capitalLabel}</p>
            <p className="kpi-figure mt-1.5 font-(family-name:--font-display) text-(--color-ink-primary)">
              {capitalContributed !== null ? formatMoney(capitalContributed) : "Not provided"}
            </p>
          </div>
          <div>
            <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Current Position</p>
            <p className="kpi-figure mt-1.5 font-(family-name:--font-display) text-(--color-ink-primary)">
              {formatMoney(currentValue)}
            </p>
          </div>
          <div>
            <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">{gainLabel}</p>
            <p className="kpi-figure mt-1.5 font-(family-name:--font-display)" style={{ color: deltaColor(gainLoss) }}>
              {fmtSigned(gainLoss)}
            </p>
          </div>
          <div>
            <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Return</p>
            <p className="kpi-figure mt-1.5 font-(family-name:--font-display)" style={{ color: deltaColor(returnPct) }}>
              {fmtSignedPct(returnPct)}
            </p>
          </div>
        </div>
        {noneKnown ? (
          <p className="mt-4 text-xs text-(--color-ink-muted)">
            {capitalLabel} data incomplete — hasn&apos;t been recorded for these accounts yet, so {gainLabel.toLowerCase()} isn&apos;t
            calculated from current value.
          </p>
        ) : partialData ? (
          <p className="mt-4 text-xs text-(--color-ink-muted)">
            Partial data — {capitalLabel.toLowerCase()} is known for some accounts only; total {gainLabel.toLowerCase()} isn&apos;t
            shown to avoid mixing known and unknown cost basis.
          </p>
        ) : null}
      </GlassCard>

      <GlassCard>
        <h3 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">
          {currentValueLabel} vs. {capitalLabel}
        </h3>
        <div className="mt-4">
          <ValuationHistoryChart data={history} capitalLabel={capitalLabel} currentValueLabel={currentValueLabel} />
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {accounts.map((account) => (
          <GlassCard key={account.assetId}>
            <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">{account.name}</p>
            <p className="tabular mt-2 font-(family-name:--font-display) text-xl leading-tight whitespace-nowrap text-(--color-ink-primary)">
              {formatMoney(account.currentValue)}
            </p>
            <div className="mt-3 space-y-1 text-xs text-(--color-ink-muted)">
              <div className="flex justify-between gap-2">
                <span>{capitalLabel}</span>
                <span className="tabular whitespace-nowrap text-(--color-ink-secondary)">
                  {account.capitalContributed !== null ? formatMoney(account.capitalContributed) : "Not provided"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>{gainLabel}</span>
                <span className="tabular whitespace-nowrap" style={{ color: deltaColor(account.gainLoss) }}>
                  {fmtSigned(account.gainLoss)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Return</span>
                <span className="tabular whitespace-nowrap" style={{ color: deltaColor(account.returnPct) }}>
                  {fmtSignedPct(account.returnPct)}
                </span>
              </div>
            </div>
            <EditCurrentValueModal
              assetId={account.assetId}
              assetName={account.name}
              capitalLabel={capitalLabel}
              currentValueLabel={currentValueLabel}
              capital={account.capitalContributed}
              currentValue={account.currentValue}
              valuationMethods={valuationMethods}
            />
          </GlassCard>
        ))}
        {accounts.length === 0 ? (
          <GlassCard className="sm:col-span-2 lg:col-span-4">
            <p className="text-sm text-(--color-ink-muted)">No accounts reported yet.</p>
          </GlassCard>
        ) : null}
      </div>

      {accounts.length > 0 ? (
        <GlassCard padded={false} className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-(--color-border-hairline) text-left text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">
                <th className="px-5 py-3 font-normal">Account</th>
                <th className="px-5 py-3 text-right font-normal">{capitalLabel}</th>
                <th className="px-5 py-3 text-right font-normal">Current Position</th>
                <th className="px-5 py-3 text-right font-normal">{gainLabel}</th>
                <th className="px-5 py-3 text-right font-normal">Return</th>
                <th className="px-5 py-3 text-right font-normal">Allocation</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.assetId} className="border-b border-(--color-border-hairline) last:border-0">
                  <td className="px-5 py-3 text-(--color-ink-primary)">{account.name}</td>
                  <td className="tabular px-5 py-3 text-right whitespace-nowrap text-(--color-ink-secondary)">
                    {account.capitalContributed !== null ? formatMoney(account.capitalContributed) : "Not provided"}
                  </td>
                  <td className="tabular px-5 py-3 text-right whitespace-nowrap text-(--color-ink-primary)">
                    {formatMoney(account.currentValue)}
                  </td>
                  <td className="tabular px-5 py-3 text-right whitespace-nowrap" style={{ color: deltaColor(account.gainLoss) }}>
                    {fmtSigned(account.gainLoss)}
                  </td>
                  <td className="tabular px-5 py-3 text-right whitespace-nowrap" style={{ color: deltaColor(account.returnPct) }}>
                    {fmtSignedPct(account.returnPct)}
                  </td>
                  <td className="tabular px-5 py-3 text-right whitespace-nowrap text-(--color-ink-muted)">
                    {currentValue > 0 ? formatPercent(account.currentValue / currentValue) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      ) : null}
    </div>
  );
}
