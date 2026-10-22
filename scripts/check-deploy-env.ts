/**
 * First step of the Netlify build (see netlify.toml): stop early, with a plain explanation,
 * when the site's environment variables aren't set up yet.
 *
 *   npm run deploy:check
 */
import { databaseUrl, isLocalDatabase } from "../src/db/script-db";

const problems: string[] = [];
const url = databaseUrl();

if (!url) {
  problems.push(
    "No database. Create one in Data & Storage → Database → Create a database manually, or set DATABASE_URL to a hosted Postgres URL (…?sslmode=require).",
  );
} else if (isLocalDatabase(url)) {
  problems.push("DATABASE_URL points at localhost, which doesn't exist on Netlify. Use a hosted Postgres URL.");
}

for (const name of ["SEED_OWNER_PASSWORD", "SEED_EMPLOYEE_PASSWORD"]) {
  const value = process.env[name];
  if (!value || value.startsWith("change-me")) problems.push(`${name} is not set to a real password (it creates the first login).`);
}

if (problems.length) {
  console.error("\n✗ The site isn't configured yet. In Netlify → Site configuration → Environment variables:\n");
  for (const p of problems) console.error(`  • ${p}`);
  console.error("\nThen trigger the deploy again. Details: README → Deploying → Netlify.\n");
  process.exit(1);
}
console.log("✓ Deploy settings look good.");
