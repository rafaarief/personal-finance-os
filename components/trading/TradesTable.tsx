"use client";

import { formatMoney } from "@/lib/format/money";
import { formatShortDate } from "@/lib/format/date";
import type { TradeRow } from "@/lib/trading/aggregates";

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

interface TradesTableProps {
  trades: TradeRow[];
  onSelect: (trade: TradeRow) => void;
}

export function TradesTable({ trades, onSelect }: TradesTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-(--color-border-hairline)">
      <table className="w-full min-w-[920px] text-sm">
        <thead>
          <tr className="border-b border-(--color-border-hairline) text-left text-xs tracking-wide text-(--color-ink-muted) uppercase">
            <th className="p-3">Date</th>
            <th className="p-3">Ticker</th>
            <th className="p-3">Market</th>
            <th className="p-3">Currency</th>
            <th className="p-3 text-right">Margin</th>
            <th className="p-3 text-right">Buy</th>
            <th className="p-3 text-right">Sell</th>
            <th className="p-3 text-right">Qty</th>
            <th className="p-3 text-right">P&amp;L</th>
            <th className="p-3 text-right">Return</th>
            <th className="p-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr
              key={trade.id}
              onClick={() => onSelect(trade)}
              className="cursor-pointer border-b border-(--color-border-hairline) transition last:border-0 hover:bg-(--color-surface-raised)"
            >
              <td className="tabular p-3 whitespace-nowrap text-(--color-ink-secondary)">{formatShortDate(trade.buyDate)}</td>
              <td className="p-3 font-medium whitespace-nowrap text-(--color-ink-primary)">{trade.ticker}</td>
              <td className="p-3 whitespace-nowrap text-(--color-ink-muted)">
                {trade.market === "INDONESIA" ? "Indonesia" : trade.market === "US" ? "US" : "Other"}
              </td>
              <td className="p-3 whitespace-nowrap text-(--color-ink-muted)">{trade.currency}</td>
              <td className="tabular p-3 text-right whitespace-nowrap text-(--color-ink-primary)">
                {formatMoney(trade.marginAmount, trade.currency)}
              </td>
              <td className="tabular p-3 text-right whitespace-nowrap text-(--color-ink-secondary)">
                {trade.buyPrice.toLocaleString("id-ID")}
              </td>
              <td className="tabular p-3 text-right whitespace-nowrap text-(--color-ink-secondary)">
                {trade.sellPrice !== null ? trade.sellPrice.toLocaleString("id-ID") : "—"}
              </td>
              <td className="tabular p-3 text-right whitespace-nowrap text-(--color-ink-secondary)">
                {trade.quantity !== null ? trade.quantity.toLocaleString("id-ID") : "—"}
              </td>
              <td className="tabular p-3 text-right whitespace-nowrap" style={{ color: deltaColor(trade.realizedPnl) }}>
                {fmtSigned(trade.realizedPnl, trade.currency)}
              </td>
              <td className="tabular p-3 text-right whitespace-nowrap" style={{ color: deltaColor(trade.returnOnTradePct) }}>
                {fmtSignedPct(trade.returnOnTradePct)}
              </td>
              <td className="p-3 whitespace-nowrap">
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{
                    background: "var(--color-surface-raised)",
                    color: trade.status === "CLOSED" ? "var(--color-ink-secondary)" : "var(--color-cat-purple)",
                  }}
                >
                  {trade.status}
                </span>
              </td>
            </tr>
          ))}
          {trades.length === 0 ? (
            <tr>
              <td colSpan={11} className="p-6 text-center text-(--color-ink-muted)">
                No trades in this period.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
