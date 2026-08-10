import { GlassCard } from "@/components/ui/GlassCard";
import { EditCurrentValueModal } from "@/components/EditCurrentValueModal";
import { ArchiveAssetButton } from "@/components/ArchiveAssetButton";
import { formatMoney } from "@/lib/format/money";
import type { AssetValueHistoryPoint } from "@/lib/finance/aggregates";

interface AccountCardProps {
  name: string;
  subcategory: string;
  value: number;
  /** When provided, the card is directly editable (Cash / Receivables / Vehicle) — omit for Capital Market / Business, which are managed on their own pages. */
  assetId?: string;
  lastUpdated?: string;
  history?: AssetValueHistoryPoint[];
}

/** Simple editable balance card — shared by the Assets overview and the standalone Cash page. */
export function AccountCard({ name, subcategory, value, assetId, lastUpdated, history }: AccountCardProps) {
  return (
    <GlassCard>
      <p className="text-xs text-(--color-ink-muted)">{subcategory}</p>
      <p className="mt-1 text-base text-(--color-ink-primary)">{name}</p>
      <p className="tabular mt-2 font-(family-name:--font-display) text-xl leading-tight whitespace-nowrap text-(--color-ink-primary)">
        {formatMoney(value)}
      </p>
      {assetId ? (
        <>
          <EditCurrentValueModal
            assetId={assetId}
            assetName={name}
            currentValueLabel="Current Value"
            currentValue={value}
            lastUpdated={lastUpdated}
            history={history}
          />
          <div className="mt-2">
            <ArchiveAssetButton assetId={assetId} assetName={name} />
          </div>
        </>
      ) : null}
    </GlassCard>
  );
}
