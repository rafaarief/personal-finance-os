import { createAsset } from "@/lib/actions/assets";
import { AssetForm } from "@/components/AssetForm";
import type { AssetCategory } from "@/lib/finance/taxonomy";

const VALID_CATEGORIES = new Set<AssetCategory>(["cash", "investment", "business", "other", "receivable", "vehicle"]);

export default async function NewAssetPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const defaultCategory = VALID_CATEGORIES.has(category as AssetCategory) ? (category as AssetCategory) : undefined;

  return (
    <div className="space-y-6">
      <h1 className="font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Add asset</h1>
      <AssetForm action={createAsset} defaultCategory={defaultCategory} submitLabel="Add asset" />
    </div>
  );
}
