import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { updateAssetValue, archiveAsset } from "@/lib/actions/assets";
import { AssetForm } from "@/components/AssetForm";
import type { AssetCategory } from "@/lib/finance/taxonomy";

export const dynamic = "force-dynamic";

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [asset] = await db.select().from(schema.assets).where(eq(schema.assets.id, id)).limit(1);

  if (!asset) notFound();

  const boundUpdate = updateAssetValue.bind(null, id);
  const boundArchive = archiveAsset.bind(null, id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">{asset.name}</h1>
        <form action={boundArchive}>
          <button type="submit" className="text-sm text-(--color-status-critical)">
            Archive
          </button>
        </form>
      </div>

      <AssetForm
        action={boundUpdate}
        submitLabel="Save changes"
        defaultValues={{
          category: asset.category as AssetCategory,
          subcategory: asset.subcategory,
          name: asset.name,
          currentValue: asset.currentValue,
          purchaseValue: asset.purchaseValue,
          currency: asset.currency,
          notes: asset.notes,
        }}
      />
    </div>
  );
}
