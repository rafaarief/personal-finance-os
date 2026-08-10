import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";

export type ChangeEntityType = "asset" | "transaction" | "trade" | "bank_account" | "cash_adjustment";
export type ChangeAction = "create" | "update" | "delete";
export type FieldChanges = Record<string, { before: unknown; after: unknown }>;

interface RecordChangeParams {
  entityType: ChangeEntityType;
  entityId: string;
  /** Asset category, when entityType is "asset" — omit for every other entity type. */
  category?: string | null;
  action: ChangeAction;
  changes: FieldChanges;
  label: string;
  changedBy: string;
}

/** Inserts one change_logs row — call after the mutation it describes has already committed. */
export async function recordChange(params: RecordChangeParams): Promise<void> {
  const db = getDb();
  await db.insert(schema.changeLogs).values({
    entityType: params.entityType,
    entityId: params.entityId,
    category: params.category ?? null,
    action: params.action,
    changes: params.changes,
    label: params.label,
    changedBy: params.changedBy,
  });
}

/**
 * Field-level diff between two flat records — only fields present in `after`
 * are considered, and only where the value actually differs (loose string
 * comparison so e.g. numeric "100.00" vs "100" from Postgres numeric columns
 * doesn't register as a change when nothing really moved).
 */
export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>): FieldChanges {
  const changes: FieldChanges = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    const beforeValue = before[key] ?? null;
    const afterValue = after[key] ?? null;
    const same =
      beforeValue === afterValue ||
      (beforeValue !== null && afterValue !== null && String(beforeValue) === String(afterValue));
    if (!same) {
      changes[key as string] = { before: beforeValue, after: afterValue };
    }
  }
  return changes;
}

/** Every field of a row-about-to-be-deleted, mapped to {before: value, after: null} — for logging a delete without a separate "after" shape to diff against. */
export function deletedFields<T extends Record<string, unknown>>(row: T): FieldChanges {
  const changes: FieldChanges = {};
  for (const key of Object.keys(row)) {
    changes[key] = { before: row[key] ?? null, after: null };
  }
  return changes;
}

/** Every field of a brand-new row, mapped to {before: null, after: value} — for logging a create. */
export function createdFields<T extends Record<string, unknown>>(row: T): FieldChanges {
  const changes: FieldChanges = {};
  for (const key of Object.keys(row)) {
    changes[key] = { before: null, after: row[key] ?? null };
  }
  return changes;
}

export interface ChangeLogEntry {
  id: string;
  entityType: ChangeEntityType;
  entityId: string;
  action: ChangeAction;
  changes: FieldChanges;
  label: string;
  changedBy: string;
  changedAt: string;
}

/** Every change recorded for one asset category (Cash/Capital Market/Business/...), newest first — powers each category page's History table. */
export async function getChangeLogForCategory(category: string, limit = 50): Promise<ChangeLogEntry[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.changeLogs)
    .where(and(eq(schema.changeLogs.entityType, "asset"), eq(schema.changeLogs.category, category)))
    .orderBy(desc(schema.changeLogs.changedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    changes: row.changes as FieldChanges,
    label: row.label,
    changedBy: row.changedBy,
    changedAt: row.changedAt.toISOString(),
  }));
}

/** Every change recorded for one entity (e.g. a single trade or transaction), newest first. */
export async function getChangeLogForEntity(entityType: ChangeEntityType, entityId: string, limit = 50): Promise<ChangeLogEntry[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.changeLogs)
    .where(and(eq(schema.changeLogs.entityType, entityType), eq(schema.changeLogs.entityId, entityId)))
    .orderBy(desc(schema.changeLogs.changedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    changes: row.changes as FieldChanges,
    label: row.label,
    changedBy: row.changedBy,
    changedAt: row.changedAt.toISOString(),
  }));
}
