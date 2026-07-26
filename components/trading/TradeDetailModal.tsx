"use client";

import { useState, useTransition } from "react";
import { deleteTrade } from "@/lib/actions/trades";
import { formatMoney } from "@/lib/format/money";
import { formatShortDate } from "@/lib/format/date";
import type { TradeRow } from "@/lib/trading/aggregates";
import { TradeFormModal } from "./TradeFormModal";

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

function holdingPeriodDays(buyDate: string, sellDate: string | null): number | null {
  if (!sellDate) return null;
  const buy = new Date(`${buyDate}T00:00:00Z`).getTime();
  const sell = new Date(`${sellDate}T00:00:00Z`).getTime();
  return Math.round((sell - buy) / (1000 * 60 * 60 * 24));
}

interface DetailRowProps {
  label: string;
  value: string;
  color?: string;
}

function DetailRow({ label, value, color }: DetailRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-(--color-border-hairline) py-2 last:border-0">
      <span className="text-xs tracking-[0.05em] text-(--color-ink-muted) uppercase">{label}</span>
      <span className="tabular text-right whitespace-nowrap text-(--color-ink-primary)" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

interface TradeDetailModalProps {
  trade: TradeRow;
  onClose: () => void;
}

export function TradeDetailModal({ trade, onClose }: TradeDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteTrade(trade.id);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete trade");
      }
    });
  }

  if (editing) {
    return <TradeFormModal open trade={trade} onClose={onClose} />;
  }

  const holdingDays = holdingPeriodDays(trade.buyDate, trade.sellDate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div
        className="glass-card my-8 w-full max-w-md space-y-1 bg-(--color-surface-raised) p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-(family-name:--font-display) text-2xl text-(--color-ink-primary)">{trade.ticker}</h3>
            <p className="mt-1 text-xs text-(--color-ink-muted)">
              {trade.market === "INDONESIA" ? "Indonesia" : trade.market === "US" ? "US" : "Other"} · {trade.currency}
            </p>
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{
              background: "var(--color-surface)",
              color: trade.status === "CLOSED" ? "var(--color-ink-secondary)" : "var(--color-cat-purple)",
            }}
          >
            {trade.status}
          </span>
        </div>

        <div className="mt-4">
          <DetailRow label="Margin / Capital" value={formatMoney(trade.marginAmount, trade.currency)} />
          <DetailRow label="Buy Price" value={trade.buyPrice.toLocaleString("id-ID")} />
          <DetailRow label="Sell Price" value={trade.sellPrice !== null ? trade.sellPrice.toLocaleString("id-ID") : "—"} />
          <DetailRow label="Quantity" value={trade.quantity !== null ? trade.quantity.toLocaleString("id-ID") : "—"} />
          <DetailRow label="Buy Date" value={formatShortDate(trade.buyDate)} />
          <DetailRow label="Sell Date" value={trade.sellDate ? formatShortDate(trade.sellDate) : "—"} />
          <DetailRow label="Holding Period" value={holdingDays !== null ? `${holdingDays} days` : "—"} />
          <DetailRow label="Realized P&L" value={fmtSigned(trade.realizedPnl, trade.currency)} color={deltaColor(trade.realizedPnl)} />
          <DetailRow label="Return" value={fmtSignedPct(trade.returnOnTradePct)} color={deltaColor(trade.returnOnTradePct)} />
          <DetailRow label="Strategy" value={trade.strategy ?? "—"} />
          <DetailRow label="Created By" value={trade.createdBy} />
          <DetailRow label="Last Edited By" value={trade.lastEditedBy ?? "—"} />
          <DetailRow label="Created At" value={formatShortDate(trade.createdAt.slice(0, 10))} />
          <DetailRow label="Updated At" value={formatShortDate(trade.updatedAt.slice(0, 10))} />
        </div>

        {trade.notes ? (
          <div className="mt-3 rounded-xl bg-(--color-surface) p-3">
            <p className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Notes</p>
            <p className="mt-1 text-sm text-(--color-ink-secondary)">{trade.notes}</p>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-(--color-status-critical)">{error}</p> : null}

        {confirmingDelete ? (
          <div className="mt-4 rounded-xl bg-(--color-surface) p-3">
            <p className="text-sm text-(--color-ink-secondary)">Delete this trade? This can&apos;t be undone.</p>
            <div className="mt-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={isPending}
                className="px-3 py-1.5 text-sm text-(--color-ink-muted)"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="rounded-full bg-(--color-status-critical) px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {isPending ? "Deleting…" : "Delete Trade"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-(--color-ink-muted)">
              Close
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-full border border-(--color-status-critical) px-4 py-2 text-sm font-medium text-(--color-status-critical)"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full px-4 py-2 text-sm font-medium text-(--color-on-accent)"
              style={{ background: "var(--gradient-hero)" }}
            >
              Edit Trade
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
