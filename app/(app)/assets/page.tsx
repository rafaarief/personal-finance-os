import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { ASSET_CATEGORY_LABELS, type AssetCategory } from "@/lib/finance/taxonomy";
import { formatMoney, formatPercent } from "@/lib/format/money";
import { GlassCard } from "@/components/ui/GlassCard";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const db = getDb();
  const assets = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.isActive, true))
    .orderBy(schema.assets.category, schema.assets.name);

  const grouped = new Map<AssetCategory, typeof assets>();
  for (const asset of assets) {
    const list = grouped.get(asset.category as AssetCategory) ?? [];
    list.push(asset);
    grouped.set(asset.category as AssetCategory, list);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Assets</h1>
        <Link
          href="/assets/new"
          className="rounded-full px-4 py-2 text-sm font-medium text-(--color-on-accent)"
          style={{ background: "var(--gradient-hero)" }}
        >
          + Add asset
        </Link>
      </div>

      {assets.length === 0 ? (
        <GlassCard>
          <p className="text-(--color-ink-secondary)">No assets yet. Add your first one to start tracking net worth.</p>
        </GlassCard>
      ) : (
        (Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[]).map((category) => {
          const items = grouped.get(category);
          if (!items || items.length === 0) return null;

          return (
            <div key={category} className="space-y-3">
              <h2 className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">
                {ASSET_CATEGORY_LABELS[category]}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((asset) => {
                  const currentValue = parseFloat(asset.currentValue);
                  const purchaseValue = asset.purchaseValue ? parseFloat(asset.purchaseValue) : null;
                  const roi = purchaseValue && purchaseValue !== 0 ? (currentValue - purchaseValue) / purchaseValue : null;

                  return (
                    <Link key={asset.id} href={`/assets/${asset.id}`}>
                      <GlassCard className="transition hover:border-(--color-cat-purple)">
                        <p className="text-xs text-(--color-ink-muted)">{asset.subcategory}</p>
                        <p className="mt-1 text-lg text-(--color-ink-primary)">{asset.name}</p>
                        <p className="tabular mt-3 font-(family-name:--font-display) text-2xl leading-tight break-words text-(--color-ink-primary)">
                          {formatMoney(currentValue, asset.currency)}
                        </p>
                        {roi !== null ? (
                          <p
                            className="mt-1 text-sm"
                            style={{ color: roi >= 0 ? "var(--color-delta-positive-strong)" : "var(--color-delta-negative-strong)" }}
                          >
                            {roi >= 0 ? "▲" : "▼"} {formatPercent(roi)} ROI
                          </p>
                        ) : null}
                      </GlassCard>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
