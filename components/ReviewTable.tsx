"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format/money";
import { commitStatementImport, type CommitRowInput } from "@/lib/actions/imports";
import { AI_CONFIDENCE_REVIEW_THRESHOLD, UNCATEGORIZED_KEY } from "@/lib/finance/taxonomy";

type ReviewRow = CommitRowInput;

interface ReviewTableProps {
  importId: string;
  initialRows: ReviewRow[];
  categories: { key: string; label: string; kind: string }[];
}

export function ReviewTable({ importId, initialRows, categories }: ReviewTableProps) {
  const router = useRouter();
  const [rows, setRows] = useState<ReviewRow[]>(initialRows);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<ReviewRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleCommit() {
    setIsSubmitting(true);
    setError(null);
    try {
      await commitStatementImport(importId, rows);
      router.push("/transactions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
      setIsSubmitting(false);
    }
  }

  const newCount = rows.filter((row) => !row.skip && !row.isDuplicate).length;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-(--color-border-hairline)">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-(--color-border-hairline) text-left text-xs tracking-wide text-(--color-ink-muted) uppercase">
              <th className="p-3">Date</th>
              <th className="p-3">Description</th>
              <th className="p-3 text-right">Money in</th>
              <th className="p-3 text-right">Money out</th>
              <th className="p-3">Category</th>
              <th className="p-3">Flags</th>
              <th className="p-3">Include</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const lowConfidence = row.aiConfidence < AI_CONFIDENCE_REVIEW_THRESHOLD;
              return (
                <tr
                  key={index}
                  className={`border-b border-(--color-border-hairline) last:border-0 ${
                    row.isDuplicate ? "opacity-40" : ""
                  }`}
                >
                  <td className="tabular p-3 whitespace-nowrap text-(--color-ink-secondary)">{row.date}</td>
                  <td className="p-3 text-(--color-ink-primary)">
                    {row.description}
                    {row.isDuplicate ? (
                      <span className="ml-2 rounded-full bg-(--color-surface-raised) px-2 py-0.5 text-xs text-(--color-ink-muted)">
                        duplicate
                      </span>
                    ) : null}
                  </td>
                  <td className="tabular p-3 text-right text-(--color-delta-positive-strong)">
                    {row.moneyIn ? formatMoney(row.moneyIn) : ""}
                  </td>
                  <td className="tabular p-3 text-right text-(--color-delta-negative-strong)">
                    {row.moneyOut ? formatMoney(row.moneyOut) : ""}
                  </td>
                  <td className="p-3">
                    <select
                      value={row.categoryKey}
                      onChange={(event) => updateRow(index, { categoryKey: event.target.value })}
                      className={`rounded-lg border bg-(--color-surface) px-2 py-1.5 text-(--color-ink-primary) ${
                        lowConfidence ? "border-(--color-status-warning)" : "border-(--color-border-hairline)"
                      }`}
                    >
                      {categories.map((category) => (
                        <option key={category.key} value={category.key}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                    {row.isLikelyInternalTransfer ? (
                      <p className="mt-1 text-xs text-(--color-cat-blue)">likely transfer</p>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <label className="flex items-center gap-1.5 text-xs text-(--color-ink-secondary)">
                      <input
                        type="checkbox"
                        checked={row.isBusiness}
                        onChange={(event) => updateRow(index, { isBusiness: event.target.checked })}
                      />
                      Business
                    </label>
                    <label className="mt-1 flex items-center gap-1.5 text-xs text-(--color-ink-secondary)">
                      <input
                        type="checkbox"
                        checked={row.isInvestment}
                        onChange={(event) => updateRow(index, { isInvestment: event.target.checked })}
                      />
                      Investment
                    </label>
                  </td>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={!row.skip}
                      disabled={row.isDuplicate}
                      onChange={(event) => updateRow(index, { skip: !event.target.checked })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error ? <p className="text-sm text-(--color-delta-negative-strong)">{error}</p> : null}

      <div className="flex items-center gap-4">
        <button
          onClick={handleCommit}
          disabled={isSubmitting || newCount === 0}
          className="rounded-2xl px-5 py-2.5 font-medium text-(--color-on-accent) disabled:opacity-50"
          style={{ background: "var(--gradient-hero)" }}
        >
          {isSubmitting ? "Committing..." : `Commit ${newCount} transaction${newCount === 1 ? "" : "s"}`}
        </button>
        <p className="text-sm text-(--color-ink-muted)">Uncategorized rows default to “{UNCATEGORIZED_KEY}”.</p>
      </div>
    </div>
  );
}
