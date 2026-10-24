/**
 * Cache tags. Every cached read is tagged with the tables it depends on and every
 * mutation expires those tags (via `updateTag`) so screens never show stale numbers.
 */
export const TAG = {
  settings: "settings",
  masters: "masters", // products, materials, mix, suppliers
  users: "users",
  customers: "customers",
  inbound: "inbound",
  production: "production",
  dispatch: "dispatch",
  invoices: "invoices",
  payments: "payments",
  notes: "notes",
  purchases: "purchases", // supplier bills, payments made to suppliers, supplier notes
  stockAdj: "stock-adj",
  audit: "audit",
  trucks: "trucks", // truck list (names, plates, drivers)
  tracking: "tracking", // past days of GPS history
} as const;

export type Tag = (typeof TAG)[keyof typeof TAG];
