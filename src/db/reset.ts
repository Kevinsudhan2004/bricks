/**
 * DEV ONLY: wipe the database and re-apply migrations.
 * Usage: npm run db:reset   (runs this, then seeds demo data)
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connect } from "./script-db";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to reset a production database.");
  }
  if (!process.argv.includes("--yes")) {
    throw new Error("This deletes ALL data. Re-run with --yes to confirm.");
  }
  const { client, db } = connect();
  await client.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("Database reset and migrated.");
  await client.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
