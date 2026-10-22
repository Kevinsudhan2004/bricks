import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/db/script-db";

loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  // Same lookup as src/db/script-db.ts; on Netlify an attached database supplies the URL.
  dbCredentials: { url: databaseUrl()! },
  strict: true,
  verbose: true,
});
