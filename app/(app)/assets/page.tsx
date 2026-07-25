import Link from "next/link";
import {
  getNetWorthSummary,
  getLatestAssetValues,
  getAssetValueHistory,
  type LatestAssetValue,
  type AssetValueHistoryPoint,
} from "@/lib/finance/aggregates";
import { ASSET_CLASS_COLOR } from "@/lib/finance/hierarchy";
import { formatMoney } from "@/lib/format/money";
import { formatShortDate } from "@/lib/format/date";
import { GlassCard } from "@/components/ui/GlassCard";
import { CategorySummaryCard } from "@/components/ui/CategorySummaryCard";
import { EditCurrentValueModal } from "@/components/EditCurrentValueModal";

export const dynamic = "force-dynamic";

function AccountCard({
  name,
  subcategory,
  value,
  assetId,
  lastUpdated,
  history,
}: {
  name: string;
  subcategory: string;
  value: number;
  /** When provided, the card is directly editable (Cash / Receivables / Vehicle) — omit for Capital Market / Business, which are managed on their own pages. */
  assetId?: string;
  lastUpdated?: string;
  history?: AssetValueHistoryPoint[];
}) {
  return (
    <GlassCard>
      <p className="text-xs text-(--color-ink-muted)">{subcategory}</p>
      <p className="mt-1 text-base text-(--color-ink-primary)">{name}</p>
      <p className="tabular mt-2 font-(family-name:--font-display) text-xl leading-tight whitespace-nowrap text-(--color-ink-primary)">
        {formatMoney(value)}
      </p>
      {assetId ? (
        <EditCurrentValueModal
          assetId={assetId}
          assetName={name}
          currentValueLabel="Current Value"
          currentValue={value}
          lastUpdated={lastUpdated}
          history={history}
        />
      ) : null}
    </GlassCard>
  );
}

function SectionHeader({ title, total, manageHref }: { title: string; total: number; manageHref?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div className="flex items-baseline gap-3">
        <h2 className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">{title}</h2>
        {manageHref ? (
          <Link href={manageHref} className="text-xs font-medium text-(--color-cat-purple) hover:underline">
            Manage →
          </Link>
        ) : null}
      </div>
      <p className="tabular font-(family-name:--font-display) text-lg whitespace-nowrap text-(--color-ink-primary)">
        {formatMoney(total)}
      </p>
    </div>
  );
}

function sum(rows: LatestAssetValue[]) {
  return rows.reduce((total, row) => total + row.currentValue, 0);
}

/** Per-asset history for every row, keyed by assetId — small account counts (cash/other assets), fine to fetch individually. */
async function historyByAssetId(rows: LatestAssetValue[]): Promise<Map<string, AssetValueHistoryPoint[]>> {
  const entries = await Promise.all(rows.map(async (row) => [row.assetId, await getAssetValueHistory(row.assetId)] as const));
  return new Map(entries);
}

export default async function AssetsPage() {
  const netWorth = await getNetWorthSummary();

  const [cashAccounts, capitalMarketAccounts, businessAccounts, receivableAccounts, vehicleAccounts, otherAccounts] =
    await Promise.all([
      getLatestAssetValues("cash"),
      getLatestAssetValues("investment"),
      getLatestAssetValues("business"),
      getLatestAssetValues("receivable"),
      getLatestAssetValues("vehicle"),
      getLatestAssetValues("other"),
    ]);

  if (netWorth.netWorth === 0 && cashAccounts.length === 0) {
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

  const otherAssetsAccounts = [...receivableAccounts, ...vehicleAccounts, ...otherAccounts];
  const [cashHistory, otherAssetsHistory] = await Promise.all([historyByAssetId(cashAccounts), historyByAssetId(otherAssetsAccounts)]);

  const otherAssetsTotal = netWorth.otherAssetsValue;
  const liquidPct = netWorth.netWorth > 0 ? netWorth.liquidAssets / netWorth.netWorth : null;
  const nonLiquidPct = netWorth.netWorth > 0 ? netWorth.nonLiquidAssets / netWorth.netWorth : null;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Assets</h1>
        {netWorth.cashAsOfDate ? (
          <p className="mt-1 text-sm text-(--color-ink-muted)">Cash last updated {formatShortDate(netWorth.cashAsOfDate)}</p>
        ) : null}
      </div>

      <GlassCard>
        <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Net Worth</p>
        <p className="kpi-figure-lg mt-2 font-(family-name:--font-display) text-(--color-ink-primary)">
          {formatMoney(netWorth.netWorth)}
        </p>
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CategorySummaryCard
          title="Liquid Assets"
          total={netWorth.liquidAssets}
          percentOfNetWorth={liquidPct}
          breakdown={[
            { label: "Cash", value: netWorth.cashPosition, color: ASSET_CLASS_COLOR.CASH },
            { label: "Capital Market", value: netWorth.capitalMarketValue, color: ASSET_CLASS_COLOR.CAPITAL_MARKET },
          ]}
        />
        <CategorySummaryCard
          title="Non-Liquid Assets"
          total={netWorth.nonLiquidAssets}
          percentOfNetWorth={nonLiquidPct}
          breakdown={[
            { label: "Business", value: netWorth.businessValue, color: ASSET_CLASS_COLOR.BUSINESS },
            {
              label: "Other Assets",
              value: otherAssetsTotal,
              color: ASSET_CLASS_COLOR.OTHER_ASSET,
              secondary: [
                { label: "Receivables", value: netWorth.receivableValue },
                { label: "Vehicle", value: netWorth.vehicleValue },
              ].filter((item) => item.value > 0),
            },
          ]}
        />
      </div>

      {/* --- Liquid Assets detail ------------------------------------------- */}
      <div className="space-y-6">
        <h2 className="font-(family-name:--font-display) text-2xl text-(--color-ink-primary)">Liquid Assets</h2>

        <div className="space-y-3">
          <SectionHeader title="Cash" total={netWorth.cashPosition} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cashAccounts.map((account) => (
              <AccountCard
                key={account.assetId}
                assetId={account.assetId}
                name={account.name}
                subcategory={account.subcategory}
                value={account.currentValue}
                lastUpdated={account.snapshotDate}
                history={cashHistory.get(account.assetId)}
              />
            ))}
            {cashAccounts.length === 0 ? (
              <GlassCard className="sm:col-span-2 lg:col-span-4">
                <p className="text-sm text-(--color-ink-muted)">No cash balances reported yet.</p>
              </GlassCard>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <SectionHeader title="Capital Market" total={netWorth.capitalMarketValue} manageHref="/capital-market" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {capitalMarketAccounts.map((account) => (
              <AccountCard key={account.assetId} name={account.name} subcategory={account.subcategory} value={account.currentValue} />
            ))}
            {capitalMarketAccounts.length === 0 ? (
              <GlassCard className="sm:col-span-2 lg:col-span-4">
                <p className="text-sm text-(--color-ink-muted)">No Capital Market accounts yet.</p>
              </GlassCard>
            ) : null}
          </div>
        </div>
      </div>

      {/* --- Non-Liquid Assets detail ---------------------------------------- */}
      <div className="space-y-6">
        <h2 className="font-(family-name:--font-display) text-2xl text-(--color-ink-primary)">Non-Liquid Assets</h2>

        <div className="space-y-3">
          <SectionHeader title="Business" total={netWorth.businessValue} manageHref="/business" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {businessAccounts.map((account) => (
              <AccountCard key={account.assetId} name={account.name} subcategory={account.subcategory} value={account.currentValue} />
            ))}
            {businessAccounts.length === 0 ? (
              <GlassCard className="sm:col-span-2 lg:col-span-3">
                <p className="text-sm text-(--color-ink-muted)">No business assets reported yet.</p>
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
                  <AccountCard
                    key={account.assetId}
                    assetId={account.assetId}
                    name={account.name}
                    subcategory={account.subcategory}
                    value={account.currentValue}
                    lastUpdated={account.snapshotDate}
                    history={otherAssetsHistory.get(account.assetId)}
                  />
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
                  <AccountCard
                    key={account.assetId}
                    assetId={account.assetId}
                    name={account.name}
                    subcategory={account.subcategory}
                    value={account.currentValue}
                    lastUpdated={account.snapshotDate}
                    history={otherAssetsHistory.get(account.assetId)}
                  />
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
                  <AccountCard
                    key={account.assetId}
                    assetId={account.assetId}
                    name={account.name}
                    subcategory={account.subcategory}
                    value={account.currentValue}
                    lastUpdated={account.snapshotDate}
                    history={otherAssetsHistory.get(account.assetId)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {receivableAccounts.length === 0 && vehicleAccounts.length === 0 && otherAccounts.length === 0 ? (
            <GlassCard>
              <p className="text-sm text-(--color-ink-muted)">No other assets reported yet.</p>
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
