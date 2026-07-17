"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format/money";
import { updateTransaction, createManualTransferLink } from "@/lib/actions/transactions";

export interface LedgerRow {
  id: string;
  transactionDate: string;
  description: string;
  bankAccountName: string;
  moneyIn: number | null;
  moneyOut: number | null;
  categoryId: string | null;
  categoryKey: string | null;
  isBusiness: boolean;
  isInternalTransfer: boolean;
}

interface TransactionsLedgerProps {
  rows: LedgerRow[];
  categories: { id: string; key: string; label: string }[];
}

export function TransactionsLedger({ rows, categories }: TransactionsLedgerProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  function toggleSelect(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((rowId) => rowId !== id) : current.length < 2 ? [...current, id] : current
    );
  }

  async function handleCategoryChange(transactionId: string, categoryId: string) {
    await updateTransaction(transactionId, {
      categoryId: categoryId || null,
      subcategoryId: null,
      isBusiness: rows.find((row) => row.id === transactionId)?.isBusiness ?? false,
      isInvestment: false,
    });
  }

  async function handleLinkTransfer() {
    if (selected.length !== 2) return;
    setIsLinking(true);
    setLinkError(null);
    try {
      await createManualTransferLink({ fromTransactionId: selected[0], toTransactionId: selected[1] });
      setSelected([]);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Failed to link");
    } finally {
      setIsLinking(false);
    }
  }

  return (
    <div className="space-y-3">
      {selected.length === 2 ? (
        <div className="glass-card flex items-center justify-between p-4">
          <p className="text-sm text-(--color-ink-secondary)">Link these two transactions as an internal transfer?</p>
          <div className="flex items-center gap-3">
            {linkError ? <span className="text-sm text-(--color-status-critical)">{linkError}</span> : null}
            <button
              onClick={handleLinkTransfer}
              disabled={isLinking}
              className="rounded-full px-4 py-1.5 text-sm font-medium text-(--color-plane)"
              style={{ background: "var(--gradient-hero)" }}
            >
              {isLinking ? "Linking..." : "Link as transfer"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-(--color-border-hairline)">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-(--color-border-hairline) text-left text-xs tracking-wide text-(--color-ink-muted) uppercase">
              <th className="p-3"> </th>
              <th className="p-3">Date</th>
              <th className="p-3">Description</th>
              <th className="p-3">Account</th>
              <th className="p-3 text-right">In</th>
              <th className="p-3 text-right">Out</th>
              <th className="p-3">Category</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-(--color-border-hairline) last:border-0">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onChange={() => toggleSelect(row.id)}
                  />
                </td>
                <td className="tabular p-3 whitespace-nowrap text-(--color-ink-secondary)">{row.transactionDate}</td>
                <td className="p-3 text-(--color-ink-primary)">
                  {row.description}
                  {row.isInternalTransfer ? (
                    <span className="ml-2 rounded-full bg-(--color-surface-raised) px-2 py-0.5 text-xs text-(--color-cat-blue)">
                      transfer
                    </span>
                  ) : null}
                </td>
                <td className="p-3 text-(--color-ink-muted)">{row.bankAccountName}</td>
                <td className="tabular p-3 text-right text-(--color-status-good)">
                  {row.moneyIn ? formatMoney(row.moneyIn) : ""}
                </td>
                <td className="tabular p-3 text-right text-(--color-status-critical)">
                  {row.moneyOut ? formatMoney(row.moneyOut) : ""}
                </td>
                <td className="p-3">
                  <select
                    defaultValue={row.categoryId ?? ""}
                    onChange={(event) => handleCategoryChange(row.id, event.target.value)}
                    className="rounded-lg border border-(--color-border-hairline) bg-(--color-surface) px-2 py-1.5 text-(--color-ink-primary)"
                  >
                    <option value="">—</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
