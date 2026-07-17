"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UploadStatementFormProps {
  bankAccounts: { id: string; accountName: string }[];
}

export function UploadStatementForm({ bankAccounts }: UploadStatementFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    if (!(formData.get("file") instanceof File) || (formData.get("file") as File).size === 0) {
      setError("Choose a statement file first");
      return;
    }

    setIsSubmitting(true);
    const response = await fetch("/api/imports/upload", { method: "POST", body: formData });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Upload failed");
      return;
    }

    const { importId } = await response.json();
    router.push(`/import/${importId}/review`);
  }

  if (bankAccounts.length === 0) {
    return (
      <p className="text-sm text-(--color-ink-secondary)">
        Add a bank account under Settings before importing a statement.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Bank account</label>
        <select
          name="bankAccountId"
          required
          className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2.5 text-(--color-ink-primary)"
        >
          {bankAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.accountName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Statement file (PDF or CSV)</label>
        <input
          name="file"
          type="file"
          accept=".pdf,.csv"
          required
          className="mt-1.5 w-full rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2.5 text-(--color-ink-primary) file:mr-4 file:rounded-full file:border-0 file:bg-(--color-surface-raised) file:px-3 file:py-1.5 file:text-(--color-ink-primary)"
        />
      </div>

      {error ? <p className="text-sm text-(--color-status-critical)">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-2xl px-5 py-2.5 font-medium text-(--color-plane) disabled:opacity-50"
        style={{ background: "var(--gradient-hero)" }}
      >
        {isSubmitting ? "Extracting transactions..." : "Upload & extract"}
      </button>
    </form>
  );
}
