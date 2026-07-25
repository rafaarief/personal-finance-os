"use client";

import { useState, useTransition } from "react";
import { updateAssetCurrentValue } from "@/lib/actions/valuations";
import { formatMoney } from "@/lib/format/money";
import { formatShortDate } from "@/lib/format/date";
import { SingleValueHistoryChart } from "@/components/charts/SingleValueHistoryChart";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface EditCurrentValueModalProps {
  assetId: string;
  assetName: string;
  currentValueLabel: string;
  currentValue: number;
  /** Omit both when this asset has no capital/cost-basis concept (Cash, Receivables, Vehicle) — the field is hidden entirely rather than shown as "unknown". */
  capitalLabel?: string;
  capital?: number | null;
  /** When provided, shows the Valuation Method dropdown — Business only. */
  valuationMethods?: readonly string[];
  /** Most recent snapshot date for this asset, shown as "Last updated". */
  lastUpdated?: string | null;
  /** Full recorded history for this asset, oldest first — renders a small chart when there are at least 2 points. */
  history?: { snapshotDate: string; currentValue: number }[];
}

export function EditCurrentValueModal({
  assetId,
  assetName,
  currentValueLabel,
  currentValue,
  capitalLabel,
  capital,
  valuationMethods,
  lastUpdated,
  history,
}: EditCurrentValueModalProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(currentValue));
  const [date, setDate] = useState(todayIso);
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState("");
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const hasCapital = capitalLabel !== undefined;

  function openModal() {
    setValue(String(currentValue));
    setDate(todayIso());
    setNotes("");
    setMethod("");
    setOpen(true);
  }

  function handleSave() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;

    startTransition(async () => {
      await updateAssetCurrentValue(assetId, {
        snapshotDate: date,
        currentValue: parsed,
        notes: notes.trim() || null,
        valuationMethod: valuationMethods ? method || null : null,
      });
      setOpen(false);
      setToast(`${assetName} value updated.`);
      setTimeout(() => setToast(null), 2500);
    });
  }

  return (
    <>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button type="button" onClick={openModal} className="text-xs font-medium text-(--color-cat-purple) hover:underline">
          Edit Current Value
        </button>
        {lastUpdated ? (
          <span className="text-xs whitespace-nowrap text-(--color-ink-muted)">Updated {formatShortDate(lastUpdated)}</span>
        ) : null}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            className="glass-card w-full max-w-sm space-y-4 bg-(--color-surface-raised) p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <h3 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">Edit {assetName}</h3>
              {lastUpdated ? (
                <p className="mt-0.5 text-xs text-(--color-ink-muted)">Last updated {formatShortDate(lastUpdated)}</p>
              ) : null}
            </div>

            {hasCapital ? (
              <div>
                <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">{capitalLabel}</label>
                <p className="tabular mt-1 whitespace-nowrap text-(--color-ink-secondary)">
                  {capital !== null && capital !== undefined ? formatMoney(capital) : "Not provided"}{" "}
                  <span className="text-xs text-(--color-ink-muted)">(locked)</span>
                </p>
              </div>
            ) : null}

            <div>
              <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase" htmlFor={`value-${assetId}`}>
                {currentValueLabel}
              </label>
              <input
                id={`value-${assetId}`}
                type="number"
                step="0.01"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="tabular mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)"
              />
            </div>

            <div>
              <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase" htmlFor={`date-${assetId}`}>
                As of
              </label>
              <input
                id={`date-${assetId}`}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)"
              />
            </div>

            {valuationMethods ? (
              <div>
                <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase" htmlFor={`method-${assetId}`}>
                  Valuation Method
                </label>
                <select
                  id={`method-${assetId}`}
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)"
                >
                  <option value="">—</option>
                  {valuationMethods.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase" htmlFor={`notes-${assetId}`}>
                Notes
              </label>
              <textarea
                id={`notes-${assetId}`}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="Optional"
                className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2 text-(--color-ink-primary)"
              />
            </div>

            {history && history.length > 1 ? (
              <div>
                <p className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">History</p>
                <div className="mt-1.5">
                  <SingleValueHistoryChart data={history} label={currentValueLabel} />
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="px-4 py-2 text-sm text-(--color-ink-muted)"
              >
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
