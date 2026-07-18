"use client";

import { useState } from "react";
import { ASSET_CATEGORY_LABELS, ASSET_SUBCATEGORY_SUGGESTIONS, type AssetCategory } from "@/lib/finance/taxonomy";

interface AssetFormProps {
  action: (formData: FormData) => Promise<void>;
  defaultValues?: {
    category: AssetCategory;
    subcategory: string;
    name: string;
    currentValue: string;
    purchaseValue: string | null;
    currency: string;
    notes: string | null;
  };
  submitLabel: string;
}

export function AssetForm({ action, defaultValues, submitLabel }: AssetFormProps) {
  const [category, setCategory] = useState<AssetCategory>(defaultValues?.category ?? "cash");

  return (
    <form action={action} className="glass-card max-w-lg space-y-5 p-6">
      <div>
        <label className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Category</label>
        <select
          name="category"
          value={category}
          onChange={(event) => setCategory(event.target.value as AssetCategory)}
          className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2.5 text-(--color-ink-primary)"
        >
          {(Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[]).map((value) => (
            <option key={value} value={value}>
              {ASSET_CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Subcategory</label>
        <input
          name="subcategory"
          list="subcategory-suggestions"
          defaultValue={defaultValues?.subcategory}
          placeholder="e.g. BCA, Stockbit, BoothyCall"
          required
          className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2.5 text-(--color-ink-primary)"
        />
        <datalist id="subcategory-suggestions">
          {ASSET_SUBCATEGORY_SUGGESTIONS[category].map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      </div>

      <div>
        <label className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Name</label>
        <input
          name="name"
          defaultValue={defaultValues?.name}
          placeholder="e.g. BCA Checking"
          required
          className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2.5 text-(--color-ink-primary)"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Current value</label>
          <input
            name="currentValue"
            type="number"
            step="0.01"
            defaultValue={defaultValues?.currentValue}
            required
            className="tabular mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2.5 text-(--color-ink-primary)"
          />
        </div>
        <div>
          <label className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Purchase value</label>
          <input
            name="purchaseValue"
            type="number"
            step="0.01"
            defaultValue={defaultValues?.purchaseValue ?? ""}
            className="tabular mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2.5 text-(--color-ink-primary)"
          />
        </div>
      </div>

      <div>
        <label className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Currency</label>
        <input
          name="currency"
          defaultValue={defaultValues?.currency ?? "IDR"}
          className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2.5 text-(--color-ink-primary)"
        />
      </div>

      <div>
        <label className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Notes</label>
        <textarea
          name="notes"
          defaultValue={defaultValues?.notes ?? ""}
          rows={3}
          className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2.5 text-(--color-ink-primary)"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-2xl px-4 py-3 font-medium text-(--color-on-accent)"
        style={{ background: "var(--gradient-hero)" }}
      >
        {submitLabel}
      </button>
    </form>
  );
}
