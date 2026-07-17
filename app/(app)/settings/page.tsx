import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { createBankAccount } from "@/lib/actions/bankAccounts";
import { GlassCard } from "@/components/ui/GlassCard";
import { CATEGORY_SEED } from "@/lib/finance/taxonomy";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = getDb();
  const [bankAccounts, cashAssets] = await Promise.all([
    db.select().from(schema.bankAccounts),
    db.select().from(schema.assets).where(eq(schema.assets.category, "cash")),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Settings</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassCard>
          <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">Add bank account</h2>
          <form action={createBankAccount} className="mt-4 space-y-4">
            <div>
              <label className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Bank</label>
              <select
                name="bankCode"
                className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2.5 text-(--color-ink-primary)"
              >
                <option value="bca">BCA</option>
                <option value="jago">Bank Jago</option>
                <option value="bni">BNI</option>
                <option value="mandiri">Mandiri</option>
              </select>
            </div>
            <div>
              <label className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Account name</label>
              <input
                name="accountName"
                required
                placeholder="e.g. BCA Checking"
                className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2.5 text-(--color-ink-primary)"
              />
            </div>
            <div>
              <label className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">
                Masked account number
              </label>
              <input
                name="accountNumberMasked"
                placeholder="e.g. ****1234"
                className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2.5 text-(--color-ink-primary)"
              />
            </div>
            <div>
              <label className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">
                Linked cash asset (auto-updates net worth on import)
              </label>
              <select
                name="linkedAssetId"
                className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2.5 text-(--color-ink-primary)"
              >
                <option value="">None</option>
                {cashAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-2xl px-5 py-2.5 font-medium text-(--color-plane)"
              style={{ background: "var(--gradient-hero)" }}
            >
              Add bank account
            </button>
          </form>
        </GlassCard>

        <GlassCard>
          <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">Bank accounts</h2>
          <div className="mt-4 space-y-2 text-sm">
            {bankAccounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between border-b border-(--color-border-hairline) py-2 last:border-0">
                <div>
                  <p className="text-(--color-ink-primary)">{account.accountName}</p>
                  <p className="text-xs text-(--color-ink-muted)">{account.bankCode.toUpperCase()}</p>
                </div>
                {account.accountNumberMasked ? (
                  <p className="text-(--color-ink-muted)">{account.accountNumberMasked}</p>
                ) : null}
              </div>
            ))}
            {bankAccounts.length === 0 ? <p className="text-(--color-ink-muted)">None yet.</p> : null}
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">Transaction categories</h2>
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-(--color-ink-secondary) sm:grid-cols-3">
          {CATEGORY_SEED.map((category) => (
            <p key={category.key}>{category.label}</p>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
