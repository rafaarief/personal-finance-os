"use client";

import { useTransition } from "react";
import { archiveAsset } from "@/lib/actions/assets";

/** Soft-deletes an asset (isActive=false) — used when an account's been liquidated/closed. History (snapshots, change log) is kept so past net worth stays accurate; it just stops counting toward active totals going forward. */
export function ArchiveAssetButton({ assetId, assetName }: { assetId: string; assetName: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Archive ${assetName}? It'll stop counting toward your active totals — past history is kept.`)) return;
    startTransition(() => {
      archiveAsset(assetId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs font-medium text-(--color-status-critical) hover:underline disabled:opacity-60"
    >
      {isPending ? "Archiving…" : "Archive"}
    </button>
  );
}
