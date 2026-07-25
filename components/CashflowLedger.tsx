"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format/money";
import { updateTransaction, createManualTransferLink } from "@/lib/actions/transactions";
import type { CashflowTransactionRow } from "@/lib/finance/aggregates";

type TransactionType = "Income" | "Expense" | "Transfer" | "Investment Transfer" | "Business Transfer";

function deriveType(row: CashflowTransactionRow): TransactionType {
  if (row.isInternalTransfer) {
    if (row.isInvestment) return "Investment Transfer";
    if (row.isBusiness) return "Business Transfer";
    return "Transfer";
  }
  if (row.categoryKind === "income") return "Income";
  if (row.categoryKind === "expense") return "Expense";
  return "Transfer";
}

const TYPE_FILTERS = ["All", "Income", "Expense", "Transfer"] as const;

interface CashflowLedgerProps {
  rows: CashflowTransactionRow[];
  categories: { id: string; key: string; label: string }[];
}

export function CashflowLedger({ rows, categories }: CashflowLedgerProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>("All");

  const accounts = useMemo(() => Array.from(new Set(rows.map((row) => row.bankAccountName))).sort(), [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const type = deriveType(row);
      if (typeFilter !== "All") {
        const bucket = type === "Income" ? "Income" : type === "Expense" ? "Expense" : "Transfer";
        if (bucket !== typeFilter) return false;
      }
      if (accountFilter !== "all" && row.bankAccountName !== accountFilter) return false;
      if (categoryFilter !== "all" && row.categoryId !== categoryFilter) return false;
      if (term) {
        const haystack = `${row.description} ${row.counterparty ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [rows, search, accountFilter, categoryFilter, typeFilter]);

  function toggleSelect(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((rowId) => rowId !== id) : current.length < 2 ? [...current, id] : current
    );
  }

  async function handleCategoryChange(transactionId: string, categoryId: string) {
    const row = rows.find((r) => r.id === transactionId);
    await updateTransaction(transactionId, {
      categoryId: categoryId || null,
      subcategoryId: null,
      isBusiness: row?.isBusiness ?? false,
      isInvestment: row?.isInvestment ?? false,
    });
  }

  async function handleBusinessToggle(transactionId: string, isBusiness: boolean) {
    const row = rows.find((r) => r.id === transactionId);
    await updateTransaction(transactionId, {
      categoryId: row?.categoryId ?? null,
      subcategoryId: null,
      isBusiness,
      isInvestment: row?.isInvestment ?? false,
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
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search description or counterparty…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="min-w-[220px] flex-1 rounded-lg border border-(--color-border-hairline) bg-(--color-surface) px-3 py-1.5 text-sm text-(--color-ink-primary)"
        />
        <select
          value={accountFilter}
          onChange={(event) => setAccountFilter(event.target.value)}
          className="rounded-lg border border-(--color-border-hairline) bg-(--color-surface) px-2 py-1.5 text-sm text-(--color-ink-primary)"
        >
          <option value="all">All accounts</option>
          {accounts.map((account) => (
            <option key={account} value={account}>
              {account}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="rounded-lg border border-(--color-border-hairline) bg-(--color-surface) px-2 py-1.5 text-sm text-(--color-ink-primary)"
        >
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        <div className="flex gap-1 rounded-full bg-(--color-surface-raised) p-1">
          {TYPE_FILTERS.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                typeFilter === type ? "bg-(--color-surface) text-(--color-ink-primary) shadow-sm" : "text-(--color-ink-muted)"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {selected.length === 2 ? (
        <div className="glass-card flex items-center justify-between p-4">
          <p className="text-sm text-(--color-ink-secondary)">Link these two transactions as an internal transfer?</p>
          <div className="flex items-center gap-3">
            {linkError ? <span className="text-sm text-(--color-delta-negative-strong)">{linkError}</span> : null}
            <button
              onClick={handleLinkTransfer}
              disabled={isLinking}
              className="rounded-full px-4 py-1.5 text-sm font-medium text-(--color-on-accent)"
              style={{ background: "var(--gradient-hero)" }}
            >
              {isLinking ? "Linking..." : "Link as transfer"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-(--color-border-hairline)">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-(--color-border-hairline) text-left text-xs tracking-wide text-(--color-ink-muted) uppercase">
              <th className="p-3"> </th>
              <th className="p-3">Date</th>
              <th className="p-3">Description</th>
              <th className="p-3">Account</th>
              <th className="p-3">Type</th>
              <th className="p-3">Category</th>
              <th className="p-3 text-right">Cash In</th>
              <th className="p-3 text-right">Cash Out</th>
              <th className="p-3">Notes</th>
              <th className="p-3">Biz</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const type = deriveType(row);
              return (
                <tr key={row.id} className="border-b border-(--color-border-hairline) last:border-0">
                  <td className="p-3">
                    <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleSelect(row.id)} />
                  </td>
                  <td className="tabular p-3 whitespace-nowrap text-(--color-ink-secondary)">{row.transactionDate}</td>
                  <td className="p-3 text-(--color-ink-primary)">{row.description}</td>
                  <td className="p-3 whitespace-nowrap text-(--color-ink-muted)">{row.bankAccountName}</td>
                  <td className="p-3 whitespace-nowrap">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        background: "var(--color-surface-raised)",
                        color:
                          type === "Income"
                            ? "var(--color-delta-positive-strong)"
                            : type === "Expense"
                              ? "var(--color-delta-negative-strong)"
                              : "var(--color-cat-blue)",
                      }}
                    >
                      {type}
                    </span>
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
                  <td className="tabular p-3 text-right whitespace-nowrap text-(--color-delta-positive-strong)">
                    {row.moneyIn ? formatMoney(row.moneyIn) : ""}
                  </td>
                  <td className="tabular p-3 text-right whitespace-nowrap text-(--color-delta-negative-strong)">
                    {row.moneyOut ? formatMoney(row.moneyOut) : ""}
                  </td>
                  <td className="p-3 text-(--color-ink-muted)">{row.counterparty ?? "—"}</td>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={row.isBusiness}
                      onChange={(event) => handleBusinessToggle(row.id, event.target.checked)}
                      title="Mark as business"
                    />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-6 text-center text-(--color-ink-muted)">
                  No transactions match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
