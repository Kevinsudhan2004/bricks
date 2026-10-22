/**
 * Add the demo trucks (with a week of GPS history) to an existing database.
 *   npm run db:seed:trucks            → only if there are no trucks yet
 *   npm run db:seed:trucks -- --fresh → DEV ONLY: delete ALL trucks and their history first
 */
import { sql } from "drizzle-orm";
import { seedDemoTrucks } from "./demo-trucks";
import * as s from "./schema";
import { connect } from "./script-db";

async function main() {
  const { client, db } = connect();
  try {
    if (process.argv.includes("--fresh")) {
      if (process.env.NODE_ENV === "production") throw new Error("Refusing to delete trucks in production.");
      await db.delete(s.trucks);
    }
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.trucks);
    if (n > 0) {
      console.log(`There are already ${n} trucks. Use --fresh to replace them with the demo trucks.`);
      return;
    }
    const r = await seedDemoTrucks(db);
    console.log(`✓ Demo trucks: ${r.trucks} trucks, ${r.points.toLocaleString("en-IN")} GPS points.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
