"use client";

import { useState, useTransition } from "react";
import { recordAssetTransfer } from "@/lib/actions/transfers";
import { ASSET_CATEGORY_LABELS, type AssetCategory } from "@/lib/finance/taxonomy";
import type { AssetPickerOption } from "@/lib/finance/aggregates";

const EXTERNAL_VALUE = "__external__";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function groupByCategory(accounts: AssetPickerOption[]): Record<string, AssetPickerOption[]> {
  const groups: Record<string, AssetPickerOption[]> = {};
  for (const account of accounts) {
    (groups[account.category] ??= []).push(account);
  }
  return groups;
}

const inputClass = "mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)";
const labelClass = "text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase";

export function RecordTransferModal({ accounts }: { accounts: AssetPickerOption[] }) {
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState(EXTERNAL_VALUE);
  const [toId, setToId] = useState(EXTERNAL_VALUE);
  const [externalLabel, setExternalLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso);
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const groupedAccounts = groupByCategory(accounts);
  const hasExternalSide = fromId === EXTERNAL_VALUE || toId === EXTERNAL_VALUE;

  function openModal() {
    setFromId(EXTERNAL_VALUE);
    setToId(EXTERNAL_VALUE);
    setExternalLabel("");
    setAmount("");
    setDate(todayIso());
    setNotes("");
    setError(null);
    setOpen(true);
  }

  function handleSave() {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    const fromAssetId = fromId === EXTERNAL_VALUE ? null : fromId;
    const toAssetId = toId === EXTERNAL_VALUE ? null : toId;
    if (!fromAssetId && !toAssetId) {
      setError("Pick at least one account — both sides can't be External.");
      return;
    }
    if (fromAssetId && toAssetId && fromAssetId === toAssetId) {
      setError("From and To must be different accounts.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await recordAssetTransfer({
          fromAssetId,
          toAssetId,
          externalLabel: externalLabel.trim() || null,
          amount: parsedAmount,
          transferDate: date,
          notes: notes.trim() || null,
        });
        setOpen(false);
        setToast("Transfer recorded.");
        setTimeout(() => setToast(null), 2500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded-full border border-(--color-border-hairline) px-4 py-2 text-sm font-medium whitespace-nowrap text-(--color-ink-primary) hover:bg-(--color-surface-raised)"
      >
        ↔ Record Transfer
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !isPending && setOpen(false)}>
          <div className="glass-card w-full max-w-sm space-y-4 bg-(--color-surface-raised) p-6" onClick={(event) => event.stopPropagation()}>
            <div>
              <h3 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">Record Transfer</h3>
              <p className="mt-0.5 text-xs text-(--color-ink-muted)">
                Tag money moving between accounts — e.g. Business down 10jt because it went to Cash, or Cash down 20jt to fund a new
                business asset.
              </p>
            </div>

            <div>
              <label className={labelClass}>From</label>
              <select value={fromId} onChange={(event) => setFromId(event.target.value)} className={inputClass}>
                <option value={EXTERNAL_VALUE}>External (money entering the system)</option>
                {Object.entries(groupedAccounts).map(([category, items]) => (
                  <optgroup key={category} label={ASSET_CATEGORY_LABELS[category as AssetCategory] ?? category}>
                    {items.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>To</label>
              <select value={toId} onChange={(event) => setToId(event.target.value)} className={inputClass}>
                <option value={EXTERNAL_VALUE}>External (money leaving the system)</option>
                {Object.entries(groupedAccounts).map(([category, items]) => (
                  <optgroup key={category} label={ASSET_CATEGORY_LABELS[category as AssetCategory] ?? category}>
                    {items.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {hasExternalSide ? (
              <div>
                <label className={labelClass}>External label</label>
                <input
                  value={externalLabel}
                  onChange={(event) => setExternalLabel(event.target.value)}
                  placeholder="e.g. Client payment, Living expenses"
                  className={inputClass}
                />
              </div>
            ) : null}

            <div>
              <label className={labelClass}>Amount</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={`tabular ${inputClass}`}
              />
            </div>

            <div>
              <label className={labelClass}>Date</label>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="e.g. Project Nabil"
                className={inputClass}
              />
            </div>

            {error ? <p className="text-sm text-(--color-status-critical)">{error}</p> : null}

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="px-4 py-2 text-sm text-(--color-ink-muted)">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="rounded-full px-4 py-2 text-sm font-medium text-(--color-on-accent) disabled:opacity-60"
                style={{ background: "var(--gradient-hero)" }}
              >
                {isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-(--color-ink-primary) px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </>
  );
}
