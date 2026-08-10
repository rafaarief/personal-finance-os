import { formatMoney } from "@/lib/format/money";
import { formatDateTime } from "@/lib/format/date";
import { GlassCard } from "@/components/ui/GlassCard";
import type { ChangeLogEntry } from "@/lib/actions/changeLog";

const MONEY_FIELDS = new Set([
  "currentValue",
  "purchaseValue",
  "capitalContributed",
  "marginAmount",
  "buyPrice",
  "sellPrice",
  "amount",
  "gap",
]);

const FIELD_LABELS: Record<string, string> = {
  currentValue: "Current Value",
  purchaseValue: "Purchase Value",
  capitalContributed: "Capital",
  notes: "Notes",
  name: "Name",
  category: "Category",
  subcategory: "Subcategory",
  currency: "Currency",
  isActive: "Active",
  categoryId: "Category",
  subcategoryId: "Subcategory",
  isBusiness: "Business",
  isInvestment: "Investment",
  isInternalTransfer: "Internal Transfer",
  valuationMethod: "Valuation Method",
  ticker: "Ticker",
  market: "Market",
  marginAmount: "Margin",
  buyPrice: "Buy Price",
  sellPrice: "Sell Price",
  quantity: "Quantity",
  buyDate: "Buy Date",
  sellDate: "Sell Date",
  status: "Status",
  strategy: "Strategy",
  bankCode: "Bank",
  accountName: "Account Name",
  accountNumberMasked: "Account Number",
  linkedAssetId: "Linked Asset",
  gap: "Gap",
  amount: "Amount",
};

const ACTION_LABEL: Record<string, string> = { create: "Created", update: "Updated", delete: "Deleted" };
const ACTION_COLOR: Record<string, string> = {
  create: "var(--color-delta-positive-strong)",
  update: "var(--color-ink-secondary)",
  delete: "var(--color-delta-negative-strong)",
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function fmtValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (MONEY_FIELDS.has(field)) {
    const num = Number(value);
    return Number.isFinite(num) ? formatMoney(num) : String(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

interface ChangeHistoryTableProps {
  entries: ChangeLogEntry[];
}

/** Read-only audit trail — every tracked create/update/delete for a category or record, newest first. */
export function ChangeHistoryTable({ entries }: ChangeHistoryTableProps) {
  if (entries.length === 0) {
    return (
      <GlassCard>
        <h3 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">History</h3>
        <p className="mt-3 text-sm text-(--color-ink-muted)">No changes recorded yet.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard padded={false} className="overflow-x-auto p-0">
      <div className="p-5 pb-0">
        <h3 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">History</h3>
      </div>
      <table className="mt-3 w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-(--color-border-hairline) text-left text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">
            <th className="px-5 py-3 font-normal">When</th>
            <th className="px-5 py-3 font-normal">Record</th>
            <th className="px-5 py-3 font-normal">Action</th>
            <th className="px-5 py-3 font-normal">Changes</th>
            <th className="px-5 py-3 font-normal">By</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-(--color-border-hairline) align-top last:border-0">
              <td className="px-5 py-3 whitespace-nowrap text-(--color-ink-muted)">{formatDateTime(entry.changedAt)}</td>
              <td className="px-5 py-3 text-(--color-ink-primary)">{entry.label}</td>
              <td className="px-5 py-3 whitespace-nowrap" style={{ color: ACTION_COLOR[entry.action] }}>
                {ACTION_LABEL[entry.action]}
              </td>
              <td className="px-5 py-3 text-(--color-ink-secondary)">
                <ul className="space-y-0.5">
                  {Object.entries(entry.changes).map(([field, change]) => (
                    <li key={field}>
                      <span className="text-(--color-ink-muted)">{fieldLabel(field)}:</span>{" "}
                      {entry.action === "delete"
                        ? fmtValue(field, change.before)
                        : `${fmtValue(field, change.before)} → ${fmtValue(field, change.after)}`}
                    </li>
                  ))}
                </ul>
              </td>
              <td className="px-5 py-3 whitespace-nowrap text-(--color-ink-muted)">{entry.changedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}
