/**
 * DB connection for CLI scripts (seed/reset) that run outside Next.js,
 * where the `server-only` guard in ./index.ts would throw.
 */
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

loadEnvConfig(process.cwd());

/** Our own DATABASE_URL, or the one Netlify sets when a database is attached to the site. */
export function databaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.NETLIFY_DB_URL ||
    process.env.NETLIFY_DATABASE_URL_UNPOOLED ||
    process.env.NETLIFY_DATABASE_URL
  );
}

/** True for the Docker database on this machine (dev), false for anything hosted. */
export function isLocalDatabase(url = databaseUrl()) {
  return !!url && /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
}

export function connect() {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example).");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  return { client, db: drizzle(client, { schema }) };
}
