"use client";

import { useState, useTransition } from "react";
import { updateAssetCurrentValue } from "@/lib/actions/valuations";
import { formatMoney } from "@/lib/format/money";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface EditCurrentValueModalProps {
  assetId: string;
  assetName: string;
  capitalLabel: string;
  currentValueLabel: string;
  capital: number | null;
  currentValue: number;
  /** When provided, shows the Valuation Method dropdown — Business only. */
  valuationMethods?: readonly string[];
}

export function EditCurrentValueModal({
  assetId,
  assetName,
  capitalLabel,
  currentValueLabel,
  capital,
  currentValue,
  valuationMethods,
}: EditCurrentValueModalProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(currentValue));
  const [date, setDate] = useState(todayIso);
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState("");
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

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
      <button
        type="button"
        onClick={openModal}
        className="mt-3 text-xs font-medium text-(--color-cat-purple) hover:underline"
      >
        Edit Current Value
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            className="glass-card w-full max-w-sm space-y-4 bg-(--color-surface-raised) p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">Edit {assetName}</h3>

            <div>
              <label className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">{capitalLabel}</label>
              <p className="tabular mt-1 whitespace-nowrap text-(--color-ink-secondary)">
                {capital !== null ? formatMoney(capital) : "Not provided"}{" "}
                <span className="text-xs text-(--color-ink-muted)">(locked)</span>
              </p>
            </div>

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
