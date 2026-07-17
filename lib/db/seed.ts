import { config } from "dotenv";
import { getDb, schema } from "./client";
import { CATEGORY_SEED } from "../finance/taxonomy";

config({ path: ".env.local" });

async function main() {
  const db = getDb();

  console.log("Seeding categories...");
  for (const [index, category] of CATEGORY_SEED.entries()) {
    await db
      .insert(schema.categories)
      .values({
        key: category.key,
        label: category.label,
        kind: category.kind,
        sortOrder: index,
      })
      .onConflictDoUpdate({
        target: schema.categories.key,
        set: { label: category.label, kind: category.kind, sortOrder: index },
      });
  }

  console.log(`Seed complete: ${CATEGORY_SEED.length} categories.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
