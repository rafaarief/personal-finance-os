import { createAsset } from "@/lib/actions/assets";
import { AssetForm } from "@/components/AssetForm";

export default function NewAssetPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Add asset</h1>
      <AssetForm action={createAsset} submitLabel="Add asset" />
    </div>
  );
}
