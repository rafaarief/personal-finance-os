"use client";

import { useState, useTransition } from "react";
import { createTrade, updateTrade } from "@/lib/actions/trades";
import type { TradeRow } from "@/lib/trading/aggregates";

const MARKETS = ["INDONESIA", "US", "OTHER"] as const;
const CURRENCIES = ["IDR", "USD"] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface TradeFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Present when editing an existing trade; omit to create a new one. */
  trade?: TradeRow;
}

export function TradeFormModal({ open, onClose, trade }: TradeFormModalProps) {
  const isEditing = trade !== undefined;

  const [ticker, setTicker] = useState(trade?.ticker ?? "");
  const [market, setMarket] = useState<(typeof MARKETS)[number]>(trade?.market ?? "INDONESIA");
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>(trade?.currency ?? "IDR");
  const [marginAmount, setMarginAmount] = useState(trade ? String(trade.marginAmount) : "");
  const [buyPrice, setBuyPrice] = useState(trade ? String(trade.buyPrice) : "");
  const [sellPrice, setSellPrice] = useState(trade?.sellPrice !== null && trade?.sellPrice !== undefined ? String(trade.sellPrice) : "");
  const [quantity, setQuantity] = useState(trade?.quantity !== null && trade?.quantity !== undefined ? String(trade.quantity) : "");
  const [buyDate, setBuyDate] = useState(trade?.buyDate ?? todayIso());
  const [sellDate, setSellDate] = useState(trade?.sellDate ?? "");
  const [strategy, setStrategy] = useState(trade?.strategy ?? "");
  const [notes, setNotes] = useState(trade?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  function handleSave() {
    setError(null);

    const parsedBuy = Number(buyPrice);
    if (!ticker.trim() || !Number.isFinite(parsedBuy) || parsedBuy <= 0) {
      setError("Ticker and a valid Buy Price are required.");
      return;
    }

    const input = {
      ticker: ticker.trim(),
      market,
      currency,
      marginAmount: Number(marginAmount) || 0,
      buyPrice: parsedBuy,
      sellPrice: sellPrice.trim() ? Number(sellPrice) : null,
      quantity: quantity.trim() ? Number(quantity) : null,
      buyDate,
      sellDate: sellDate.trim() ? sellDate : null,
      strategy: strategy.trim() || null,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      try {
        if (isEditing) {
          await updateTrade(trade.id, input);
        } else {
          await createTrade(input);
        }
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save trade");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" onClick={() => !isPending && onClose()}>
      <div
        className="glass-card my-8 w-full max-w-lg space-y-4 bg-(--color-surface-raised) p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">
          {isEditing ? `Edit ${trade.ticker}` : "Add Trade"}
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Ticker</label>
            <input
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
              placeholder="BBCA"
              className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary) uppercase"
            />
          </div>
          <div>
            <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Market</label>
            <select
              value={market}
              onChange={(event) => setMarket(event.target.value as (typeof MARKETS)[number])}
              className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)"
            >
              {MARKETS.map((m) => (
                <option key={m} value={m}>
                  {m === "INDONESIA" ? "Indonesia" : m === "US" ? "US" : "Other"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Margin Currency</label>
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value as (typeof CURRENCIES)[number])}
              className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Margin / Capital</label>
            <input
              type="number"
              step="0.01"
              value={marginAmount}
              onChange={(event) => setMarginAmount(event.target.value)}
              className="tabular mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Buy Price</label>
            <input
              type="number"
              step="0.0001"
              value={buyPrice}
              onChange={(event) => setBuyPrice(event.target.value)}
              className="tabular mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)"
            />
          </div>
          <div>
            <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Sell Price</label>
            <input
              type="number"
              step="0.0001"
              value={sellPrice}
              onChange={(event) => setSellPrice(event.target.value)}
              placeholder="Optional"
              className="tabular mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)"
            />
          </div>
          <div>
            <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Qty / Shares</label>
            <input
              type="number"
              step="0.0001"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="Optional"
              className="tabular mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Buy Date</label>
            <input
              type="date"
              value={buyDate}
              onChange={(event) => setBuyDate(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)"
            />
          </div>
          <div>
            <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Sell Date</label>
            <input
              type="date"
              value={sellDate}
              onChange={(event) => setSellDate(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)"
            />
          </div>
        </div>

        <div>
          <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Strategy / Setup</label>
          <input
            value={strategy}
            onChange={(event) => setStrategy(event.target.value)}
            placeholder="Optional"
            className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)"
          />
        </div>

        <div>
          <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Notes</label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder="Optional"
            className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)"
          />
        </div>

        {error ? <p className="text-sm text-(--color-status-critical)">{error}</p> : null}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} disabled={isPending} className="px-4 py-2 text-sm text-(--color-ink-muted)">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded-full px-4 py-2 text-sm font-medium text-(--color-on-accent) disabled:opacity-60"
            style={{ background: "var(--gradient-hero)" }}
          >
            {isPending ? "Saving…" : isEditing ? "Save Changes" : "Add Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}
