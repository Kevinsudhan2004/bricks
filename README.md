# Brick CRM

The internal web app for the brick factory. It covers the daily register (raw material coming in, bricks made, trucks going out) and the sales side: invoices, what each customer still has to receive and still has to pay, and payments with credit/debit notes. Charts summarise it all for the owner. It works on phones, iPads and desktops, and can be installed on a phone's home screen.

## Who uses it

| Role | Can do | Can't see |
|---|---|---|
| **Owner** | Everything: dashboard, customers, invoices, payments, credit/debit notes, supplier bills and payments, stock, reports, settings, users, activity log | — |
| **Employee** | Record **inbound** loads, **production**, customer **orders** and **dispatch**, and add or edit **customers** and **suppliers**. Edit or delete their own entries on the same day. Print delivery challans. | Any money: rates, amounts, balances, payments. Also the dashboard, reports, stock and settings. |

Permissions are checked on the server in every page, Server Action and API route. Hiding things in the UI is not relied on.

## Features

- **Inbound**: one row at the top of the Inbound page: **Date** (today by default) · **Material ▼** · **Supplier ▼** · **Weight (kg)** · **Save**. Loads appear in the list below instantly, and editing happens in a pop-up on the same page. The supplier dropdown is searchable; type a new name to add a supplier on the spot.
- **Suppliers**: a page for both owner and employee to add or edit suppliers, showing each supplier's loads and tonnes for the last 30 days.
- **Production**: both products on one screen, a live "% of daily capacity" bar (Fly Ash 25,000/day, Solid 8,000/day), broken/rejected count, and a warning when above capacity.
- **Dispatch**: pick the **order number** (search by number, customer or phone) and type the bricks on the truck. A truck can't carry more than is pending; the invoice row is locked in a transaction so this holds even with simultaneous entries. The form also warns when the yard stock looks too low. Prints a delivery challan.
- **Orders**: every customer order is noted with an order number (`ORD/26-27/0001`), customer, products and quantities, plus delivered vs pending. Both roles can add orders. When an employee adds one, rates and GST come from Settings automatically and they never see amounts. The owner sees the money side of the same order (rates, GST, total, payments, balance) and can print it as the **GST tax invoice**: CGST+SGST or IGST, transport taxed at the main product's rate, round-off and amount in words. Quantities can't be cut below what's already delivered.
- **Order states — Ongoing / Completed**: every order is Ongoing until the owner marks it **Completed**, which is only allowed when every brick is delivered *and* debit = credit (order total + debit notes = payments + credit notes, to the paisa). The Orders page has Ongoing · Completed · Cancelled tabs, a "Ready to complete" filter and a "Complete all ready" button. A completed order is locked: no deliveries, payments, notes or edits until the owner reopens it (with a reason, kept in the activity log). Every such write locks the order row, so a payment saved at the same moment as "complete" can't slip in.
- **Purchases — raw material bills (owner)**: enter a supplier's bill by ticking the inbound loads it covers (tonnes fill in from the weighbridge, rate and GST from that supplier's last bill), plus transport and GST. Pay suppliers against a bill or on account, and record the supplier's **credits** (short weight, quality, discount) or **extra charges**. Each bill shows billed, paid and *to pay*; it stays **Ongoing** until debit = credit, then can be **Closed** (locked until reopened). Billed loads can't be edited or deleted. Pages: *Raw material bills* (Ongoing · Closed tabs), *Payments to suppliers*, and a supplier account page with a running statement and loads not billed yet. Suppliers can carry an opening balance.
- **Accounts (owner)**: every customer and supplier in one spreadsheet — billed, received/paid, *They owe you* and *You owe them* (advances counted on the right side), overdue, ongoing orders/bills and last activity. Search by name or phone, filter (customers, suppliers, they owe you, you owe them, overdue), totals row, expand a row for the breakdown and quick actions, CSV download.
- **Customers**: a page for both roles. "New customer" opens a pop-up form. Employees see contact details and pending bricks; the owner also sees balances.
- **Spreadsheet-style lists**: customers, orders, payments, notes, inbound, production, dispatch and suppliers are tables with one row per record, sortable columns, search, a totals row and a frozen first column. A ▸ on a row unfolds the rest of that record. Every "New …" button (order, payment, customer, credit/debit note) opens the form in a sheet over the page instead of a new page.
- **Customer dashboard (owner)**: ordered, delivered and pending bricks, plus billed, received and balance. Each open order shows bars like *"8,000 of 20,000 pending"* with how much is paid. Also: delivery and payment charts, a full statement (debit/credit/running balance), call and WhatsApp buttons, and a printable statement.
- **Payments**: against an invoice or as an advance; UPI, bank, cash or cheque. Printable receipt.
- **Credit / debit notes**: damaged bricks, returns, rate difference, discount, extra transport. Printable.
- **Owner dashboard**:
  - Today's KPIs, plus alerts for low raw material and overdue invoices.
  - Capacity gauges and the bricks-in-yard trend.
  - Production vs capacity per product.
  - Raw material received, and stock in days left.
  - Sales vs collections, receivables ageing, who owes the most, who is waiting for bricks.
  - Every chart has a *Table* view.
- **Stock**: bricks in yard = made − broken − dispatched ± adjustments. Raw material = received − (bricks made × mix in Settings) ± adjustments.
- **Reports**: daily factory register, monthly GST summary, CSV downloads for Excel.
- **Settings**: company profile (printed on documents); products with capacity, rate, HSN and GST; the brick mix; reorder levels; logins; activity log.
- **Search** (Ctrl/⌘ + K) across customers, invoice numbers, challan numbers and vehicle numbers.
- **Light/dark mode**, Indian number format (₹1,23,456 · 2.4 L · 1.2 Cr), big touch targets, numeric keypads on phones.

## Run it locally

Requirements: Node 22+, Docker Desktop (for PostgreSQL).

```bash
cp .env.example .env.local        # then change the seed passwords
npm install
npm run db:up                     # starts PostgreSQL 16 on port 5433
npm run db:migrate                # creates the tables
npm run db:seed:demo              # base data + ~75 days of demo activity
npm run dev                       # http://localhost:3000
```

Sign in with the usernames and passwords from `.env.local` (`SEED_OWNER_*` / `SEED_EMPLOYEE_*`). Change them after the first login (avatar menu → *Change password*).

For a real factory, use `npm run db:seed` instead of `db:seed:demo`. It creates only the company, the products, the materials, the mix and the two logins. `npm run db:reset` wipes the database and reloads the demo (dev only).

Before going live, set these in **Settings**:

- Company name, GSTIN, state code and bank details.
- GST % and HSN for each product (confirm with your accountant).
- **The real mix**: kg of fly ash, cement and M sand per brick and per block. Raw-material stock is only as accurate as this mix.
- Reorder levels for each material.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm test` | Unit tests for the business rules (invoice GST maths, pending deliveries, balances, ledger, stock, FY numbering, dispatch limits) |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database |

## How it's built

- **Next.js 16** (App Router, React 19, Cache Components + Partial Prefetching), **Tailwind CSS 4**, **shadcn/ui** (Radix), **Recharts**.
- **PostgreSQL** with **Drizzle ORM**. Money is `numeric(14,2)`. Business dates are plain `YYYY-MM-DD` in the factory timezone (`APP_TIMEZONE`, default `Asia/Kolkata`).
- **Auth**: username and password (bcrypt), with a random session token stored as a SHA-256 hash in Postgres and sent as an HttpOnly cookie. Sessions last 30 days. 5 wrong passwords lock the username for 15 minutes.
- **Audit log**: every create, edit, delete and sign-in, with before/after values. Deletes are soft deletes and need a reason.

```
src/
  app/(auth)/login           sign-in
  app/(app)/…                 the app (shell with sidebar / phone tab bar)
  app/(print)/print/…         A4 documents: invoice, challan, receipt, note, statement
  app/api/search, api/export  Ctrl+K search, CSV downloads
  components/                 UI, charts, forms, layout
  db/                         schema, migrations, seed
  domain/                     pure business rules + unit tests
  server/queries              cached reads (Data Access Layer)
  server/actions              Server Actions (validated writes)
```

### Caching & preloading

- **Server cache**: every read lives in a `"use cache"` function tagged with the tables it depends on (`cacheTag`). Every save calls `updateTag(...)` for those tags, so pages are served from cache yet never show stale numbers after an entry. Master data uses the `max` profile. Transactional data uses the custom `live` profile: browsers keep it for 60 s and the server refreshes in the background after 5 min, which covers changes made by other people.
- **Per-user cache**: the signed-in user is resolved with `"use cache: private"`, so authenticated pages can be prefetched.
- **Preloading**:
  - Links prefetch each page's static shell as soon as they're on screen (Partial Prefetching).
  - Customer and invoice rows prefetch their full page on hover, touch or focus (`IntentLink`).
  - The employee home prefetches the three entry forms.
  - The dispatch, payment and note forms preload every open invoice up front, so picking a customer is instant with no extra request.
- **Streaming**: each page sends its header immediately and streams data into skeletons. Charts (Recharts) load lazily and only on pages that show them; data-entry screens never download them.
- **Offline**: `experimental.useOffline` keeps navigations and saves pending while a phone loses signal and retries them when it's back, with a banner shown meanwhile. A service worker (`public/sw.js`, production only) caches static assets and icons and shows an offline page instead of a browser error.

## Deploying

The app is standard Next.js plus PostgreSQL. You can run it on a VPS with Docker or `npm run build && npm start` behind a reverse proxy, or on Vercel with a managed Postgres (Neon, Supabase, RDS…). Set `DATABASE_URL` and `APP_TIMEZONE`, then run `npm run db:migrate` and `npm run db:seed` once. Serve it over HTTPS: the session cookie is `Secure` in production, and the PWA install needs HTTPS.

### Netlify

`netlify.toml` is already set up. Netlify builds Next.js on its own, and every deploy also runs `db:migrate` and `db:seed`. Both are safe to re-run: they add what's missing and never change existing rows or passwords.

1. **Add a database.** In the project, open **Data & Storage → Database → Create a database manually**. Netlify Database provides `NETLIFY_DB_URL`, which the app picks up, and gives each deploy preview its own copy. Or create a Postgres elsewhere (Neon, Supabase…) and set its URL as `DATABASE_URL`.
2. **Set the environment variables** in Site configuration → Environment variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Postgres URL with `?sslmode=require` (skip if you created a Netlify Database) |
   | `SEED_OWNER_USERNAME` / `SEED_OWNER_PASSWORD` | First owner login. The build stops if the password is still the `change-me-…` default |
   | `SEED_EMPLOYEE_USERNAME` / `SEED_EMPLOYEE_PASSWORD` | First employee login |
   | `DATABASE_POOL_MAX` | `3`, so each serverless function keeps only a few connections |
   | `APP_TIMEZONE` | Optional, defaults to `Asia/Kolkata` |

3. **Import the repo** in Netlify (Add new project → Import from GitHub) and deploy. Leave the build settings as they are; they come from `netlify.toml`.
4. Sign in with the seed logins and change both passwords (avatar menu → *Change password*).

Demo data is never loaded on Netlify. To try it with demo data, run `npm run db:seed:demo` from your machine with `DATABASE_URL` pointing at the hosted database.
