import {
  pgTable,
  pgEnum,
  serial,
  bigserial,
  integer,
  text,
  varchar,
  numeric,
  date,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  doublePrecision,
  real,
  smallint,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const userRole = pgEnum("user_role", ["owner", "employee"]);
export const paymentMode = pgEnum("payment_mode", ["cash", "upi", "bank", "cheque", "other"]);
export const noteType = pgEnum("note_type", ["credit", "debit"]);
export const taxType = pgEnum("tax_type", ["intra", "inter"]);
export const invoiceStatus = pgEnum("invoice_status", ["active", "cancelled"]);
export const stockItemType = pgEnum("stock_item_type", ["material", "product"]);

/* Shared column helpers */
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};
const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deleteReason: text("delete_reason"),
};
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const kg = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const businessDate = (name: string) => date(name, { mode: "string" });

/* ------------------------------------------------------------------ */
/* Users & sessions                                                    */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("employee"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 hex of the random token stored in the cookie. */
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    username: varchar("username", { length: 50 }).notNull(),
    success: boolean("success").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("login_attempts_user_time_idx").on(t.username, t.attemptedAt)],
);

/* ------------------------------------------------------------------ */
/* Masters                                                             */
/* ------------------------------------------------------------------ */

/** Single-row table (id = 1) holding the company profile printed on documents. */
export const companySettings = pgTable("company_settings", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull(),
  tagline: text("tagline"),
  address: text("address"),
  phone: varchar("phone", { length: 30 }),
  email: text("email"),
  gstin: varchar("gstin", { length: 15 }),
  stateName: text("state_name"),
  stateCode: varchar("state_code", { length: 2 }),
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  bankIfsc: varchar("bank_ifsc", { length: 11 }),
  upiId: text("upi_id"),
  invoiceTerms: text("invoice_terms"),
  defaultDueDays: integer("default_due_days").notNull().default(15),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  size: text("size"),
  unit: varchar("unit", { length: 10 }).notNull().default("nos"),
  dailyCapacity: integer("daily_capacity").notNull(),
  defaultRate: numeric("default_rate", { precision: 10, scale: 2, mode: "number" }).notNull().default(0),
  hsnCode: varchar("hsn_code", { length: 10 }),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const materials = pgTable("materials", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  unit: varchar("unit", { length: 10 }).notNull().default("kg"),
  lowStockKg: kg("low_stock_kg").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** Mix design: kg of each raw material used per unit of product. */
export const productRecipes = pgTable(
  "product_recipes",
  {
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    materialId: integer("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    kgPerUnit: numeric("kg_per_unit", { precision: 10, scale: 3, mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.materialId] })],
);

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: varchar("phone", { length: 20 }),
  gstin: varchar("gstin", { length: 15 }),
  address: text("address"),
  /** What we already owed this supplier before using the app (positive = we owe them). */
  openingBalance: money("opening_balance").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    firmName: text("firm_name"),
    phone: varchar("phone", { length: 20 }),
    altPhone: varchar("alt_phone", { length: 20 }),
    gstin: varchar("gstin", { length: 15 }),
    billingAddress: text("billing_address"),
    siteAddress: text("site_address"),
    stateName: text("state_name"),
    openingBalance: money("opening_balance").notNull().default(0),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdBy: integer("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("customers_name_idx").on(t.name)],
);

/* ------------------------------------------------------------------ */
/* Inbound (raw materials weighed at the gate)                         */
/* ------------------------------------------------------------------ */

export const inboundEntries = pgTable(
  "inbound_entries",
  {
    id: serial("id").primaryKey(),
    entryDate: businessDate("entry_date").notNull(),
    materialId: integer("material_id")
      .notNull()
      .references(() => materials.id),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    vehicleNo: varchar("vehicle_no", { length: 20 }),
    challanNo: varchar("challan_no", { length: 40 }),
    grossKg: kg("gross_kg"),
    tareKg: kg("tare_kg"),
    netKg: kg("net_kg").notNull(),
    /** Filled from the supplier bill this load is on (null until it is billed). */
    ratePerTon: money("rate_per_ton"),
    amount: money("amount"),
    /** The supplier bill that charges for this load. Billed loads can't be edited or deleted. */
    purchaseBillId: integer("purchase_bill_id").references(() => purchaseBills.id),
    remarks: text("remarks"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("inbound_date_idx").on(t.entryDate),
    index("inbound_material_idx").on(t.materialId, t.entryDate),
    index("inbound_bill_idx").on(t.purchaseBillId),
  ],
);

/* ------------------------------------------------------------------ */
/* Production                                                          */
/* ------------------------------------------------------------------ */

export const productionEntries = pgTable(
  "production_entries",
  {
    id: serial("id").primaryKey(),
    entryDate: businessDate("entry_date").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    shift: varchar("shift", { length: 10 }),
    quantityProduced: integer("quantity_produced").notNull(),
    quantityRejected: integer("quantity_rejected").notNull().default(0),
    remarks: text("remarks"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("production_date_idx").on(t.entryDate),
    index("production_product_idx").on(t.productId, t.entryDate),
  ],
);

/* ------------------------------------------------------------------ */
/* Invoices (orders billed to customers)                               */
/* ------------------------------------------------------------------ */

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    invoiceNo: varchar("invoice_no", { length: 30 }).notNull().unique(),
    invoiceDate: businessDate("invoice_date").notNull(),
    dueDate: businessDate("due_date"),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    deliveryAddress: text("delivery_address"),
    taxType: taxType("tax_type").notNull().default("intra"),
    subtotal: money("subtotal").notNull(),
    transportCharges: money("transport_charges").notNull().default(0),
    cgst: money("cgst").notNull().default(0),
    sgst: money("sgst").notNull().default(0),
    igst: money("igst").notNull().default(0),
    roundOff: money("round_off").notNull().default(0),
    total: money("total").notNull(),
    notes: text("notes"),
    status: invoiceStatus("status").notNull().default("active"),
    cancelReason: text("cancel_reason"),
    /** Set when the owner marks the order completed (all delivered, debit = credit). Null = ongoing. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: integer("closed_by").references(() => users.id),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("invoices_customer_idx").on(t.customerId, t.invoiceDate),
    index("invoices_date_idx").on(t.invoiceDate),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    rate: numeric("rate", { precision: 10, scale: 2, mode: "number" }).notNull(),
    gstRate: numeric("gst_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    /** Taxable value = quantity × rate. */
    amount: money("amount").notNull(),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId)],
);

/* ------------------------------------------------------------------ */
/* Dispatch (outward delivery challans)                                */
/* ------------------------------------------------------------------ */

export const dispatches = pgTable(
  "dispatches",
  {
    id: serial("id").primaryKey(),
    dispatchNo: varchar("dispatch_no", { length: 30 }).notNull().unique(),
    dispatchDate: businessDate("dispatch_date").notNull(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id),
    vehicleNo: varchar("vehicle_no", { length: 20 }),
    driverName: text("driver_name"),
    driverPhone: varchar("driver_phone", { length: 20 }),
    remarks: text("remarks"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("dispatches_date_idx").on(t.dispatchDate),
    index("dispatches_invoice_idx").on(t.invoiceId),
    index("dispatches_customer_idx").on(t.customerId, t.dispatchDate),
  ],
);

export const dispatchItems = pgTable(
  "dispatch_items",
  {
    id: serial("id").primaryKey(),
    dispatchId: integer("dispatch_id")
      .notNull()
      .references(() => dispatches.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("dispatch_items_dispatch_idx").on(t.dispatchId)],
);

/* ------------------------------------------------------------------ */
/* Money: payments and credit / debit notes                            */
/* ------------------------------------------------------------------ */

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    receiptNo: varchar("receipt_no", { length: 30 }).notNull().unique(),
    paymentDate: businessDate("payment_date").notNull(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    /** Null = advance / on-account payment not tied to one invoice. */
    invoiceId: integer("invoice_id").references(() => invoices.id),
    amount: money("amount").notNull(),
    mode: paymentMode("mode").notNull().default("cash"),
    reference: text("reference"),
    remarks: text("remarks"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("payments_customer_idx").on(t.customerId, t.paymentDate),
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_date_idx").on(t.paymentDate),
  ],
);

export const adjustmentNotes = pgTable(
  "adjustment_notes",
  {
    id: serial("id").primaryKey(),
    noteNo: varchar("note_no", { length: 30 }).notNull().unique(),
    type: noteType("type").notNull(),
    noteDate: businessDate("note_date").notNull(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    invoiceId: integer("invoice_id").references(() => invoices.id),
    amount: money("amount").notNull(),
    reason: varchar("reason", { length: 30 }).notNull(),
    description: text("description"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("notes_customer_idx").on(t.customerId, t.noteDate),
    index("notes_invoice_idx").on(t.invoiceId),
  ],
);

/* ------------------------------------------------------------------ */
/* Purchases: raw material bills from suppliers, payments made to      */
/* suppliers and the supplier's credit / debit notes                   */
/* ------------------------------------------------------------------ */

export const purchaseBills = pgTable(
  "purchase_bills",
  {
    id: serial("id").primaryKey(),
    /** Our own running number, e.g. PB/26-27/0007. */
    billNo: varchar("bill_no", { length: 30 }).notNull().unique(),
    /** The invoice number printed on the supplier's bill. */
    supplierBillNo: varchar("supplier_bill_no", { length: 40 }),
    billDate: businessDate("bill_date").notNull(),
    dueDate: businessDate("due_date"),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    taxType: taxType("tax_type").notNull().default("intra"),
    subtotal: money("subtotal").notNull(),
    transportCharges: money("transport_charges").notNull().default(0),
    cgst: money("cgst").notNull().default(0),
    sgst: money("sgst").notNull().default(0),
    igst: money("igst").notNull().default(0),
    roundOff: money("round_off").notNull().default(0),
    total: money("total").notNull(),
    notes: text("notes"),
    status: invoiceStatus("status").notNull().default("active"),
    cancelReason: text("cancel_reason"),
    /** Set when the owner closes the bill (paid in full, debit = credit). Null = ongoing. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: integer("closed_by").references(() => users.id),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("purchase_bills_supplier_idx").on(t.supplierId, t.billDate),
    index("purchase_bills_date_idx").on(t.billDate),
  ],
);

export const purchaseBillItems = pgTable(
  "purchase_bill_items",
  {
    id: serial("id").primaryKey(),
    billId: integer("bill_id")
      .notNull()
      .references(() => purchaseBills.id, { onDelete: "cascade" }),
    materialId: integer("material_id")
      .notNull()
      .references(() => materials.id),
    quantityKg: kg("quantity_kg").notNull(),
    ratePerTon: numeric("rate_per_ton", { precision: 10, scale: 2, mode: "number" }).notNull(),
    gstRate: numeric("gst_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    /** Taxable value = tonnes × rate per tonne. */
    amount: money("amount").notNull(),
  },
  (t) => [index("purchase_bill_items_bill_idx").on(t.billId)],
);

export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: serial("id").primaryKey(),
    voucherNo: varchar("voucher_no", { length: 30 }).notNull().unique(),
    paymentDate: businessDate("payment_date").notNull(),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    /** Null = advance / on-account payment not tied to one bill. */
    billId: integer("bill_id").references(() => purchaseBills.id),
    amount: money("amount").notNull(),
    mode: paymentMode("mode").notNull().default("bank"),
    reference: text("reference"),
    remarks: text("remarks"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("supplier_payments_supplier_idx").on(t.supplierId, t.paymentDate),
    index("supplier_payments_bill_idx").on(t.billId),
    index("supplier_payments_date_idx").on(t.paymentDate),
  ],
);

/** Credit = the supplier reduced what we owe (short weight, quality, discount); debit = they added a charge. */
export const supplierNotes = pgTable(
  "supplier_notes",
  {
    id: serial("id").primaryKey(),
    noteNo: varchar("note_no", { length: 30 }).notNull().unique(),
    type: noteType("type").notNull(),
    noteDate: businessDate("note_date").notNull(),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    billId: integer("bill_id").references(() => purchaseBills.id),
    amount: money("amount").notNull(),
    reason: varchar("reason", { length: 30 }).notNull(),
    description: text("description"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("supplier_notes_supplier_idx").on(t.supplierId, t.noteDate),
    index("supplier_notes_bill_idx").on(t.billId),
  ],
);

/* ------------------------------------------------------------------ */
/* Stock adjustments (physical count corrections, yard breakage)       */
/* ------------------------------------------------------------------ */

export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    id: serial("id").primaryKey(),
    adjDate: businessDate("adj_date").notNull(),
    itemType: stockItemType("item_type").notNull(),
    materialId: integer("material_id").references(() => materials.id),
    productId: integer("product_id").references(() => products.id),
    /** Signed: positive adds stock, negative removes it. kg for materials, nos for products. */
    quantity: numeric("quantity", { precision: 14, scale: 2, mode: "number" }).notNull(),
    reason: text("reason").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("stock_adj_date_idx").on(t.adjDate)],
);

/* ------------------------------------------------------------------ */
/* Document numbering & audit                                          */
/* ------------------------------------------------------------------ */

export const docCounters = pgTable(
  "doc_counters",
  {
    prefix: varchar("prefix", { length: 10 }).notNull(),
    fy: varchar("fy", { length: 5 }).notNull(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.prefix, t.fy] })],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: integer("user_id").references(() => users.id),
    action: varchar("action", { length: 20 }).notNull(),
    entity: varchar("entity", { length: 30 }).notNull(),
    entityId: integer("entity_id"),
    summary: text("summary").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_entity_idx").on(t.entity, t.entityId)],
);

/* ------------------------------------------------------------------ */
/* Truck tracking (driver phone app → owner's "Truck location")        */
/* ------------------------------------------------------------------ */

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const trucks = pgTable("trucks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  plateNo: varchar("plate_no", { length: 20 }),
  driverName: text("driver_name"),
  driverPhone: varchar("driver_phone", { length: 20 }),
  active: boolean("active").notNull().default(true),
  /** One-time 8-digit code the driver types into the phone app. Cleared once used. */
  pairCode: varchar("pair_code", { length: 8 }).unique(),
  pairCodeExpiresAt: ts("pair_code_expires_at"),
  /* Latest known position, kept here so the live map is a single cheap query. */
  lastLat: doublePrecision("last_lat"),
  lastLng: doublePrecision("last_lng"),
  lastSpeedKmh: real("last_speed_kmh"),
  lastHeading: real("last_heading"),
  lastAccuracyM: real("last_accuracy_m"),
  lastBattery: smallint("last_battery"),
  lastCharging: boolean("last_charging"),
  lastPointAt: ts("last_point_at"),
  /** Last time the truck was seen moving (for "Stopped for 12 min"). */
  lastMovingAt: ts("last_moving_at"),
  /** Last time the phone talked to the server, with or without new points. */
  lastSeenAt: ts("last_seen_at"),
  /** The trip in progress; null when the driver has stopped tracking. */
  currentTripId: integer("current_trip_id"),
  createdBy: integer("created_by").references(() => users.id),
  ...timestamps,
});

/** A driver phone linked to a truck. Only one un-revoked device per truck. */
export const truckDevices = pgTable(
  "truck_devices",
  {
    id: serial("id").primaryKey(),
    truckId: integer("truck_id")
      .notNull()
      .references(() => trucks.id, { onDelete: "cascade" }),
    /** SHA-256 hex of the bearer token the app sends. */
    tokenHash: text("token_hash").notNull().unique(),
    model: text("model"),
    androidVersion: varchar("android_version", { length: 20 }),
    appVersion: varchar("app_version", { length: 20 }),
    pairedAt: ts("paired_at").defaultNow().notNull(),
    lastSeenAt: ts("last_seen_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("truck_devices_truck_idx").on(t.truckId)],
);

/** One Start → Stop on the driver app. Totals are recalculated from the points on every upload. */
export const truckTrips = pgTable(
  "truck_trips",
  {
    id: serial("id").primaryKey(),
    truckId: integer("truck_id")
      .notNull()
      .references(() => trucks.id, { onDelete: "cascade" }),
    deviceId: integer("device_id").references(() => truckDevices.id, { onDelete: "set null" }),
    /** Id generated on the phone, so retried uploads never create duplicate trips. */
    clientId: varchar("client_id", { length: 40 }).notNull(),
    startedAt: ts("started_at").notNull(),
    endedAt: ts("ended_at"),
    distanceM: doublePrecision("distance_m").notNull().default(0),
    movingSeconds: integer("moving_seconds").notNull().default(0),
    maxSpeedKmh: real("max_speed_kmh").notNull().default(0),
    pointCount: integer("point_count").notNull().default(0),
    lastPointAt: ts("last_point_at"),
  },
  (t) => [uniqueIndex("truck_trips_client_idx").on(t.truckId, t.clientId), index("truck_trips_started_idx").on(t.truckId, t.startedAt)],
);

export const truckPoints = pgTable(
  "truck_points",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    truckId: integer("truck_id")
      .notNull()
      .references(() => trucks.id, { onDelete: "cascade" }),
    tripId: integer("trip_id").references(() => truckTrips.id, { onDelete: "cascade" }),
    recordedAt: ts("recorded_at").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    speedKmh: real("speed_kmh"),
    heading: real("heading"),
    accuracyM: real("accuracy_m"),
    altitudeM: real("altitude_m"),
    battery: smallint("battery"),
    receivedAt: ts("received_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("truck_points_time_idx").on(t.truckId, t.recordedAt), index("truck_points_trip_idx").on(t.tripId, t.recordedAt)],
);

export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Material = typeof materials.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type PurchaseBill = typeof purchaseBills.$inferSelect;
export type CompanySettings = typeof companySettings.$inferSelect;
export type Truck = typeof trucks.$inferSelect;
