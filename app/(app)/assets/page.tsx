import Link from "next/link";
import {
  getLatestSnapshotDates,
  getWealthSummaryAsOf,
  getAssetBreakdownAsOf,
  getCapitalMarketSummary,
  getCapitalMarketHistory,
  type AssetBreakdownRow,
} from "@/lib/finance/aggregates";
import { ASSET_CLASS_COLOR } from "@/lib/finance/hierarchy";
import { formatMoney } from "@/lib/format/money";
import { formatShortDate } from "@/lib/format/date";
import { GlassCard } from "@/components/ui/GlassCard";
import { CategorySummaryCard } from "@/components/ui/CategorySummaryCard";
import { CapitalMarketSection } from "@/components/CapitalMarketSection";

export const dynamic = "force-dynamic";

function AccountCard({ name, subcategory, value }: { name: string; subcategory: string; value: number }) {
  return (
    <Link href="/assets">
      <GlassCard>
        <p className="text-xs text-(--color-ink-muted)">{subcategory}</p>
        <p className="mt-1 text-base text-(--color-ink-primary)">{name}</p>
        <p className="tabular mt-2 font-(family-name:--font-display) text-xl leading-tight whitespace-nowrap text-(--color-ink-primary)">
          {formatMoney(value)}
        </p>
      </GlassCard>
    </Link>
  );
}

function SectionHeader({ title, total }: { title: string; total: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">{title}</h2>
      <p className="tabular font-(family-name:--font-display) text-lg whitespace-nowrap text-(--color-ink-primary)">
        {formatMoney(total)}
      </p>
    </div>
  );
}

function byCategory(rows: AssetBreakdownRow[], category: string) {
  return rows.filter((row) => row.category === category);
}

function sum(rows: AssetBreakdownRow[]) {
  return rows.reduce((total, row) => total + row.currentValue, 0);
}

export default async function AssetsPage() {
  const { latest } = await getLatestSnapshotDates();

  if (!latest) {
    return (
      <div className="space-y-8">
        <h1 className="font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Assets</h1>
        <GlassCard>
          <p className="text-(--color-ink-secondary)">
            No statement snapshot yet. Import a statement or add an asset to start tracking net worth.
          </p>
        </GlassCard>
      </div>
    );
  }

  const [wealth, breakdown, capitalMarketSummary, capitalMarketHistory] = await Promise.all([
    getWealthSummaryAsOf(latest),
    getAssetBreakdownAsOf(latest),
    getCapitalMarketSummary(),
    getCapitalMarketHistory(),
  ]);

  const cashAccounts = byCategory(breakdown, "cash");
  const businessAccounts = byCategory(breakdown, "business");
  const receivableAccounts = byCategory(breakdown, "receivable");
  const vehicleAccounts = byCategory(breakdown, "vehicle");
  const otherAccounts = byCategory(breakdown, "other");

  const otherAssetsTotal = wealth.otherValue + wealth.receivableValue + wealth.vehicleValue;
  const liquidPct = wealth.netWorth > 0 ? wealth.liquidAssets / wealth.netWorth : null;
  const nonLiquidPct = wealth.netWorth > 0 ? wealth.nonLiquidAssets / wealth.netWorth : null;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Assets</h1>
        <p className="mt-1 text-sm text-(--color-ink-muted)">As of {formatShortDate(latest)}</p>
      </div>

      <GlassCard>
        <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Net Worth</p>
        <p className="kpi-figure-lg mt-2 font-(family-name:--font-display) text-(--color-ink-primary)">
          {formatMoney(wealth.netWorth)}
        </p>
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CategorySummaryCard
          title="Liquid Assets"
          total={wealth.liquidAssets}
          percentOfNetWorth={liquidPct}
          breakdown={[
            { label: "Cash", value: wealth.cashPosition, color: ASSET_CLASS_COLOR.CASH },
            { label: "Capital Market", value: wealth.investmentValue, color: ASSET_CLASS_COLOR.CAPITAL_MARKET },
          ]}
        />
        <CategorySummaryCard
          title="Non-Liquid Assets"
          total={wealth.nonLiquidAssets}
          percentOfNetWorth={nonLiquidPct}
          breakdown={[
            { label: "Business", value: wealth.businessValue, color: ASSET_CLASS_COLOR.BUSINESS },
            {
              label: "Other Assets",
              value: otherAssetsTotal,
              color: ASSET_CLASS_COLOR.OTHER_ASSET,
              secondary: [
                { label: "Receivables", value: wealth.receivableValue },
                { label: "Vehicle", value: wealth.vehicleValue },
              ].filter((item) => item.value > 0),
            },
          ]}
        />
      </div>

      {/* --- Liquid Assets detail ------------------------------------------- */}
      <div className="space-y-6">
        <h2 className="font-(family-name:--font-display) text-2xl text-(--color-ink-primary)">Liquid Assets</h2>

        <div className="space-y-3">
          <SectionHeader title="Cash" total={wealth.cashPosition} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cashAccounts.map((account) => (
              <AccountCard key={account.id} name={account.name} subcategory={account.subcategory} value={account.currentValue} />
            ))}
            {cashAccounts.length === 0 ? (
              <GlassCard className="sm:col-span-2 lg:col-span-4">
                <p className="text-sm text-(--color-ink-muted)">No cash balances reported for this statement.</p>
              </GlassCard>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <SectionHeader title="Capital Market" total={wealth.investmentValue} />
          <CapitalMarketSection summary={capitalMarketSummary} history={capitalMarketHistory} />
        </div>
      </div>

      {/* --- Non-Liquid Assets detail ---------------------------------------- */}
      <div className="space-y-6">
        <h2 className="font-(family-name:--font-display) text-2xl text-(--color-ink-primary)">Non-Liquid Assets</h2>

        <div className="space-y-3">
          <SectionHeader title="Business" total={wealth.businessValue} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {businessAccounts.map((account) => (
              <AccountCard key={account.id} name={account.name} subcategory={account.subcategory} value={account.currentValue} />
            ))}
            {businessAccounts.length === 0 ? (
              <GlassCard className="sm:col-span-2 lg:col-span-3">
                <p className="text-sm text-(--color-ink-muted)">No business assets reported for this statement.</p>
              </GlassCard>
            ) : null}
          </div>
        </div>

        <div className="space-y-5">
          <SectionHeader title="Other Assets" total={otherAssetsTotal} />

          {receivableAccounts.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Receivables</h3>
                <p className="tabular text-sm whitespace-nowrap text-(--color-ink-secondary)">{formatMoney(sum(receivableAccounts))}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {receivableAccounts.map((account) => (
                  <AccountCard key={account.id} name={account.name} subcategory={account.subcategory} value={account.currentValue} />
                ))}
              </div>
            </div>
          ) : null}

          {vehicleAccounts.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Vehicle</h3>
                <p className="tabular text-sm whitespace-nowrap text-(--color-ink-secondary)">{formatMoney(sum(vehicleAccounts))}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {vehicleAccounts.map((account) => (
                  <AccountCard key={account.id} name={account.name} subcategory={account.subcategory} value={account.currentValue} />
                ))}
              </div>
            </div>
          ) : null}

          {otherAccounts.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">Other</h3>
                <p className="tabular text-sm whitespace-nowrap text-(--color-ink-secondary)">{formatMoney(sum(otherAccounts))}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {otherAccounts.map((account) => (
                  <AccountCard key={account.id} name={account.name} subcategory={account.subcategory} value={account.currentValue} />
                ))}
              </div>
            </div>
          ) : null}

          {receivableAccounts.length === 0 && vehicleAccounts.length === 0 && otherAccounts.length === 0 ? (
            <GlassCard>
              <p className="text-sm text-(--color-ink-muted)">No other assets reported for this statement.</p>
            </GlassCard>
          ) : null}
        </div>
      </div>

      <div className="flex justify-end">
        <Link
          href="/assets/new"
          className="rounded-full px-4 py-2 text-sm font-medium text-(--color-on-accent)"
          style={{ background: "var(--gradient-hero)" }}
        >
          + Add asset
        </Link>
      </div>
    </div>
  );
}
