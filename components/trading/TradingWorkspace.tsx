"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format/money";
import { GlassCard } from "@/components/ui/GlassCard";
import { MetricGrid } from "@/components/ui/MetricGrid";
import { CumulativePnlChart } from "@/components/charts/CumulativePnlChart";
import { TradesTable } from "./TradesTable";
import { TradeFormModal } from "./TradeFormModal";
import { TradeDetailModal } from "./TradeDetailModal";
import type { TradeRow } from "@/lib/trading/aggregates";
import { summarizeTrades, cumulativePnlSeries, performanceByTicker, monthlyPerformance } from "@/lib/trading/derive";
import { PERIOD_FILTERS, filterTradesByPeriod, type PeriodFilter } from "@/lib/trading/period";

function deltaColor(value: number | null): string {
  if (value === null) return "var(--color-ink-muted)";
  if (value > 0) return "var(--color-delta-positive-strong)";
  if (value < 0) return "var(--color-delta-negative-strong)";
  return "var(--color-ink-muted)";
}

function fmtSigned(value: number | null, currency: "IDR" | "USD"): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatMoney(Math.abs(value), currency)}`;
}

function fmtSignedPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function fmtPct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export function TradingWorkspace({ trades }: { trades: TradeRow[] }) {
  const [period, setPeriod] = useState<PeriodFilter>("All Time");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [pnlCurrency, setPnlCurrency] = useState<"IDR" | "USD">("IDR");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<TradeRow | null>(null);

  const filtered = useMemo(() => filterTradesByPeriod(trades, period, customFrom, customTo), [trades, period, customFrom, customTo]);
  const summary = useMemo(() => summarizeTrades(filtered), [filtered]);
  const cumulativePnl = useMemo(() => cumulativePnlSeries(filtered, pnlCurrency), [filtered, pnlCurrency]);
  const byTicker = useMemo(() => performanceByTicker(filtered), [filtered]);
  const monthly = useMemo(() => monthlyPerformance(filtered), [filtered]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Trading Recap</h1>
          <p className="mt-1 text-sm text-(--color-ink-muted)">Track entries, exits, capital and realized performance.</p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-full px-4 py-2 text-sm font-medium text-(--color-on-accent)"
          style={{ background: "var(--gradient-hero)" }}
        >
          + Add Trade
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-(--color-surface-raised) p-1">
          {PERIOD_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPeriod(option)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                period === option ? "bg-(--color-surface) text-(--color-ink-primary) shadow-sm" : "text-(--color-ink-muted)"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        {period === "Custom" ? (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
              className="rounded-lg border border-(--color-border-hairline) bg-(--color-surface) px-2 py-1.5 text-sm text-(--color-ink-primary)"
            />
            <span className="text-(--color-ink-muted)">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
              className="rounded-lg border border-(--color-border-hairline) bg-(--color-surface) px-2 py-1.5 text-sm text-(--color-ink-primary)"
            />
          </div>
        ) : null}
      </div>

      <GlassCard>
        <MetricGrid
          items={[
            { label: "Total Trades", value: String(summary.totalTrades) },
            { label: "Win Rate", value: fmtPct(summary.winRate) },
            { label: "Winning Trades", value: String(summary.winningTrades), color: "var(--color-delta-positive-strong)" },
            { label: "Losing Trades", value: String(summary.losingTrades), color: "var(--color-delta-negative-strong)" },
          ]}
        />
      </GlassCard>

      <GlassCard>
        <MetricGrid
          maxCols={3}
          items={[
            { label: "Average Return", value: fmtSignedPct(summary.averageReturnPct), color: deltaColor(summary.averageReturnPct) },
            {
              label: "Best Trade",
              value: summary.bestTrade ? `${summary.bestTrade.ticker} ${fmtSignedPct(summary.bestTrade.returnOnTradePct)}` : "—",
              color: "var(--color-delta-positive-strong)",
            },
            {
              label: "Worst Trade",
              value: summary.worstTrade ? `${summary.worstTrade.ticker} ${fmtSignedPct(summary.worstTrade.returnOnTradePct)}` : "—",
              color: "var(--color-delta-negative-strong)",
            },
          ]}
        />
      </GlassCard>

      {/* Currency summaries are always shown separately — nominal IDR and USD amounts are never combined into one total. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(["IDR", "USD"] as const).map((currency) => {
          const currencySummary = summary.byCurrency.find((c) => c.currency === currency);
          return (
            <GlassCard key={currency}>
              <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">{currency}</p>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-(--color-ink-muted)">Capital Traded</p>
                  <p className="kpi-figure mt-1 font-(family-name:--font-display) text-(--color-ink-primary)">
                    {formatMoney(currencySummary?.capitalTraded ?? 0, currency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-(--color-ink-muted)">Realized P&amp;L</p>
                  <p
                    className="kpi-figure mt-1 font-(family-name:--font-display)"
                    style={{ color: deltaColor(currencySummary?.realizedPnl ?? null) }}
                  >
                    {fmtSigned(currencySummary?.realizedPnl ?? null, currency)}
                  </p>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">Trades</h2>
        <TradesTable trades={filtered} onSelect={setSelectedTrade} />
      </div>

      <div className="space-y-6">
        <h2 className="font-(family-name:--font-display) text-2xl text-(--color-ink-primary)">Analytics</h2>

        <GlassCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">Cumulative Realized P&amp;L</h3>
            <div className="flex gap-1 rounded-full bg-(--color-surface-raised) p-1">
              {(["IDR", "USD"] as const).map((currency) => (
                <button
                  key={currency}
                  type="button"
                  onClick={() => setPnlCurrency(currency)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    pnlCurrency === currency ? "bg-(--color-surface) text-(--color-ink-primary) shadow-sm" : "text-(--color-ink-muted)"
                  }`}
                >
                  {currency}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <CumulativePnlChart data={cumulativePnl} currency={pnlCurrency} />
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">Win / Loss</h3>
          <div className="mt-4 flex items-center gap-4">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-(--color-border-hairline)">
              <div className="flex h-full">
                <div
                  className="h-full"
                  style={{
                    width: `${summary.winningTrades + summary.losingTrades > 0 ? (summary.winningTrades / (summary.winningTrades + summary.losingTrades)) * 100 : 0}%`,
                    background: "var(--color-delta-positive-strong)",
                  }}
                />
                <div
                  className="h-full"
                  style={{
                    width: `${summary.winningTrades + summary.losingTrades > 0 ? (summary.losingTrades / (summary.winningTrades + summary.losingTrades)) * 100 : 0}%`,
                    background: "var(--color-delta-negative-strong)",
                  }}
                />
              </div>
            </div>
            <span className="text-sm whitespace-nowrap text-(--color-delta-positive-strong)">{summary.winningTrades} won</span>
            <span className="text-sm whitespace-nowrap text-(--color-delta-negative-strong)">{summary.losingTrades} lost</span>
          </div>
        </GlassCard>

        <GlassCard padded={false} className="overflow-x-auto p-0">
          <div className="p-6 pb-0">
            <h3 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">Performance by Ticker</h3>
          </div>
          <table className="mt-4 w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-(--color-border-hairline) text-left text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">
                <th className="px-6 py-3 font-normal">Ticker</th>
                <th className="px-6 py-3 text-right font-normal">Trades</th>
                <th className="px-6 py-3 text-right font-normal">Win Rate</th>
                <th className="px-6 py-3 text-right font-normal">Avg Return</th>
                <th className="px-6 py-3 text-right font-normal">Realized P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {byTicker.map((row) => (
                <tr key={row.ticker} className="border-b border-(--color-border-hairline) last:border-0">
                  <td className="px-6 py-3 font-medium text-(--color-ink-primary)">{row.ticker}</td>
                  <td className="tabular px-6 py-3 text-right text-(--color-ink-secondary)">{row.trades}</td>
                  <td className="tabular px-6 py-3 text-right text-(--color-ink-secondary)">{fmtPct(row.winRate)}</td>
                  <td className="tabular px-6 py-3 text-right" style={{ color: deltaColor(row.averageReturnPct) }}>
                    {fmtSignedPct(row.averageReturnPct)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {row.pnlByCurrency.length > 0 ? (
                      <div className="flex flex-col items-end gap-0.5">
                        {row.pnlByCurrency.map((p) => (
                          <span key={p.currency} className="tabular whitespace-nowrap" style={{ color: deltaColor(p.total) }}>
                            {fmtSigned(p.total, p.currency)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-(--color-ink-muted)">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {byTicker.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-(--color-ink-muted)">
                    No trades yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </GlassCard>

        <GlassCard padded={false} className="overflow-x-auto p-0">
          <div className="p-6 pb-0">
            <h3 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">Monthly Performance</h3>
          </div>
          <table className="mt-4 w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-(--color-border-hairline) text-left text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">
                <th className="px-6 py-3 font-normal">Month</th>
                <th className="px-6 py-3 text-right font-normal">Trades</th>
                <th className="px-6 py-3 text-right font-normal">Win Rate</th>
                <th className="px-6 py-3 text-right font-normal">Avg Return</th>
                <th className="px-6 py-3 text-right font-normal">Realized P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((row) => (
                <tr key={row.month} className="border-b border-(--color-border-hairline) last:border-0">
                  <td className="px-6 py-3 text-(--color-ink-primary)">{row.month}</td>
                  <td className="tabular px-6 py-3 text-right text-(--color-ink-secondary)">{row.trades}</td>
                  <td className="tabular px-6 py-3 text-right text-(--color-ink-secondary)">{fmtPct(row.winRate)}</td>
                  <td className="tabular px-6 py-3 text-right" style={{ color: deltaColor(row.averageReturnPct) }}>
                    {fmtSignedPct(row.averageReturnPct)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {row.pnlByCurrency.length > 0 ? (
                      <div className="flex flex-col items-end gap-0.5">
                        {row.pnlByCurrency.map((p) => (
                          <span key={p.currency} className="tabular whitespace-nowrap" style={{ color: deltaColor(p.total) }}>
                            {fmtSigned(p.total, p.currency)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-(--color-ink-muted)">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {monthly.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-(--color-ink-muted)">
                    No closed trades yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </GlassCard>
      </div>

      {addOpen ? <TradeFormModal open onClose={() => setAddOpen(false)} /> : null}
      {selectedTrade ? <TradeDetailModal trade={selectedTrade} onClose={() => setSelectedTrade(null)} /> : null}
    </div>
  );
}
