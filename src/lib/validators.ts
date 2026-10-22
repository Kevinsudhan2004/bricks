import { z } from "zod";
import { isValidIsoDate } from "@/domain/dates";

/* Shared zod schemas: used by client forms for instant feedback and re-checked by Server Actions. */

const blankToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : v;

const toNumber = (v: unknown) => {
  const b = blankToUndefined(v);
  if (b === undefined) return undefined;
  if (typeof b === "number") return b;
  const n = Number(String(b).replace(/[,\s₹]/g, ""));
  return Number.isNaN(n) ? b : n;
};

export const isoDate = z
  .string({ error: "Pick a date" })
  .refine((v) => isValidIsoDate(v), { message: "Pick a valid date" });

export const optionalText = (max = 500) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Keep it under ${max} characters`).optional());

export const requiredText = (label: string, max = 200) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `Keep it under ${max} characters`);

export const optionalNumber = (opts: { min?: number; max?: number; label?: string } = {}) =>
  z.preprocess(
    toNumber,
    z
      .number({ error: `${opts.label ?? "Value"} must be a number` })
      .min(opts.min ?? 0, `${opts.label ?? "Value"} can't be less than ${opts.min ?? 0}`)
      .max(opts.max ?? 1e12, `${opts.label ?? "Value"} is too large`)
      .optional(),
  );

export const requiredNumber = (label: string, opts: { min?: number; max?: number; positive?: boolean } = {}) =>
  z.preprocess(
    toNumber,
    z
      .number({ error: `Enter ${label.toLowerCase()}` })
      .min(opts.min ?? 0, `${label} can't be less than ${opts.min ?? 0}`)
      .max(opts.max ?? 1e12, `${label} is too large`)
      .refine((n) => !opts.positive || n > 0, `${label} must be more than 0`),
  );

export const wholeNumber = (label: string, opts: { min?: number; max?: number } = {}) =>
  z.preprocess(
    (v) => toNumber(v) ?? 0,
    z
      .number({ error: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .min(opts.min ?? 0, `${label} can't be less than ${opts.min ?? 0}`)
      .max(opts.max ?? 10_000_000, `${label} is too large`),
  );

export const id = z.coerce.number().int().positive();
export const optionalId = z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional());

export const vehicleNo = z.preprocess(
  (v) => {
    const b = blankToUndefined(v);
    return typeof b === "string" ? b.toUpperCase().replace(/\s+/g, " ").trim() : b;
  },
  z.string().max(20, "Vehicle number is too long").optional(),
);

export const phone = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{6,18}$/, "Enter a valid phone number")
    .optional(),
);

export const gstin = z.preprocess(
  (v) => {
    const b = blankToUndefined(v);
    return typeof b === "string" ? b.toUpperCase().trim() : b;
  },
  z
    .string()
    .regex(/^\d{2}[A-Z0-9]{10}\d[A-Z0-9]Z[A-Z0-9]$/, "GSTIN should be 15 characters, e.g. 33ABCDE1234F1Z5")
    .optional(),
);

/* ------------------------------------------------------------------ */
/* Inbound                                                             */
/* ------------------------------------------------------------------ */

/** Inbound is deliberately minimal: date, material, supplier (pick or type a new one) and weight. */
export const inboundSchema = z.object({
  entryDate: isoDate,
  materialId: z.coerce.number({ error: "Pick a material" }).int().positive("Pick a material"),
  supplierId: optionalId,
  newSupplierName: optionalText(120),
  netKg: requiredNumber("Weight", { positive: true, max: 200_000 }),
});
export type InboundInput = z.input<typeof inboundSchema>;
export type InboundData = z.output<typeof inboundSchema>;

/* ------------------------------------------------------------------ */
/* Production                                                          */
/* ------------------------------------------------------------------ */

/** One product per entry: date, product, bricks made, broken. */
export const productionSchema = z
  .object({
    entryDate: isoDate,
    productId: z.coerce.number({ error: "Pick a product" }).int().positive("Pick a product"),
    quantityProduced: z.preprocess(
      toNumber,
      z.number({ error: "Enter how many bricks were made" }).int("Whole number only").min(1, "Enter how many bricks were made").max(1_000_000, "Too large"),
    ),
    quantityRejected: wholeNumber("Broken", { max: 1_000_000 }),
  })
  .refine((v) => v.quantityRejected <= v.quantityProduced, {
    path: ["quantityRejected"],
    message: "Can't be more than bricks made",
  });
export type ProductionInput = z.input<typeof productionSchema>;
export type ProductionData = z.output<typeof productionSchema>;

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

export const dispatchSchema = z.object({
  dispatchDate: isoDate,
  customerId: id,
  invoiceId: id,
  vehicleNo,
  driverName: optionalText(80),
  driverPhone: phone,
  remarks: optionalText(500),
  lines: z.array(z.object({ productId: id, quantity: wholeNumber("Quantity", { max: 1_000_000 }) })).min(1),
});
export type DispatchInput = z.input<typeof dispatchSchema>;

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

export const customerSchema = z.object({
  name: requiredText("Customer name", 120),
  firmName: optionalText(160),
  phone,
  altPhone: phone,
  gstin,
  billingAddress: optionalText(400),
  siteAddress: optionalText(400),
  stateName: optionalText(60),
  openingBalance: optionalNumber({ label: "Opening balance", min: -1e10 }),
  notes: optionalText(1000),
});
export type CustomerInput = z.input<typeof customerSchema>;

/* ------------------------------------------------------------------ */
/* Invoices                                                            */
/* ------------------------------------------------------------------ */

export const invoiceSchema = z.object({
  customerId: id,
  invoiceDate: isoDate,
  dueDate: z.preprocess(blankToUndefined, isoDate.optional()),
  deliveryAddress: optionalText(400),
  taxType: z.enum(["intra", "inter"]),
  transportCharges: optionalNumber({ label: "Transport charges", max: 10_000_000 }),
  notes: optionalText(1000),
  items: z
    .array(
      z.object({
        productId: id,
        quantity: z.preprocess(
          toNumber,
          z.number({ error: "Enter the quantity" }).int("Whole number only").min(1, "Enter the quantity").max(10_000_000, "Too large"),
        ),
        // Owners set rate & GST; for employees the server fills them from the product settings.
        rate: optionalNumber({ label: "Rate", max: 1_000_000 }),
        gstRate: optionalNumber({ label: "GST %", max: 28 }),
      }),
    )
    .min(1, "Add at least one product"),
});
export type InvoiceInput = z.input<typeof invoiceSchema>;
export type InvoiceData = z.output<typeof invoiceSchema>;

/* ------------------------------------------------------------------ */
/* Payments & notes                                                    */
/* ------------------------------------------------------------------ */

export const paymentSchema = z.object({
  customerId: id,
  invoiceId: optionalId,
  paymentDate: isoDate,
  amount: requiredNumber("Amount", { positive: true, max: 1e10 }),
  mode: z.enum(["cash", "upi", "bank", "cheque", "other"]),
  reference: optionalText(80),
  remarks: optionalText(500),
});
export type PaymentInput = z.input<typeof paymentSchema>;

export const NOTE_REASONS = {
  damaged: "Damaged / broken bricks",
  return: "Bricks returned",
  rate_difference: "Rate difference",
  discount: "Discount",
  transport: "Extra transport / unloading",
  shortage: "Short supply",
  other: "Other",
} as const;

export const noteSchema = z.object({
  type: z.enum(["credit", "debit"]),
  customerId: id,
  invoiceId: optionalId,
  noteDate: isoDate,
  amount: requiredNumber("Amount", { positive: true, max: 1e10 }),
  reason: z.enum(Object.keys(NOTE_REASONS) as [keyof typeof NOTE_REASONS, ...(keyof typeof NOTE_REASONS)[]]),
  description: optionalText(500),
});
export type NoteInput = z.input<typeof noteSchema>;

/* ------------------------------------------------------------------ */
/* Stock adjustment                                                    */
/* ------------------------------------------------------------------ */

export const stockAdjustmentSchema = z
  .object({
    adjDate: isoDate,
    itemType: z.enum(["material", "product"]),
    materialId: optionalId,
    productId: optionalId,
    direction: z.enum(["add", "remove"]),
    quantity: requiredNumber("Quantity", { positive: true, max: 100_000_000 }),
    reason: requiredText("Reason", 300),
  })
  .superRefine((v, ctx) => {
    if (v.itemType === "material" && !v.materialId) ctx.addIssue({ code: "custom", path: ["materialId"], message: "Pick a material" });
    if (v.itemType === "product" && !v.productId) ctx.addIssue({ code: "custom", path: ["productId"], message: "Pick a product" });
  });
export type StockAdjustmentInput = z.input<typeof stockAdjustmentSchema>;

export const deleteSchema = z.object({ id, reason: requiredText("Reason", 300) });

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export const companySchema = z.object({
  name: requiredText("Company name", 160),
  tagline: optionalText(160),
  address: optionalText(400),
  phone: optionalText(40),
  email: z.preprocess(blankToUndefined, z.email("Enter a valid email").optional()),
  gstin,
  stateName: optionalText(60),
  stateCode: z.preprocess(blankToUndefined, z.string().regex(/^\d{2}$/, "Two digits, e.g. 33").optional()),
  bankName: optionalText(120),
  bankAccount: optionalText(40),
  bankIfsc: z.preprocess(
    (v) => (typeof v === "string" ? v.toUpperCase().trim() || undefined : v),
    z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC looks like SBIN0001234").optional(),
  ),
  upiId: optionalText(80),
  invoiceTerms: optionalText(2000),
  defaultDueDays: wholeNumber("Due days", { max: 365 }),
});
export type CompanyInput = z.input<typeof companySchema>;

export const productSchema = z.object({
  name: requiredText("Name", 80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,30}$/, "2–30 letters/numbers, no spaces"),
  size: optionalText(120),
  dailyCapacity: wholeNumber("Daily capacity", { min: 1, max: 10_000_000 }),
  defaultRate: requiredNumber("Rate", { max: 1_000_000 }),
  hsnCode: optionalText(10),
  gstRate: requiredNumber("GST %", { max: 28 }),
  sortOrder: wholeNumber("Order", { max: 1000 }),
  active: z.boolean(),
});
export type ProductInput = z.input<typeof productSchema>;

export const materialSchema = z.object({
  name: requiredText("Name", 80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,30}$/, "2–30 letters/numbers, no spaces"),
  lowStockKg: requiredNumber("Reorder level", { max: 100_000_000 }),
  sortOrder: wholeNumber("Order", { max: 1000 }),
  active: z.boolean(),
});
export type MaterialInput = z.input<typeof materialSchema>;

export const recipeSchema = z.object({
  productId: id,
  lines: z.array(z.object({ materialId: id, kgPerUnit: requiredNumber("Kg per unit", { max: 1000 }) })),
});

export const supplierSchema = z.object({
  name: requiredText("Supplier name", 120),
  phone,
  gstin,
  address: optionalText(400),
  active: z.boolean(),
});
export type SupplierInput = z.input<typeof supplierSchema>;

export const truckSchema = z.object({
  name: requiredText("Truck name", 60),
  plateNo: z.preprocess(
    (v) => (typeof v === "string" ? v.toUpperCase().replace(/\s+/g, " ") : v),
    optionalText(20),
  ),
  driverName: optionalText(80),
  driverPhone: phone,
  active: z.boolean(),
});
export type TruckInput = z.input<typeof truckSchema>;

export const password = z.string().min(8, "At least 8 characters").max(128);

export const userCreateSchema = z.object({
  name: requiredText("Name", 80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,30}$/, "3–30 lowercase letters, numbers, dot or dash"),
  phone,
  role: z.enum(["owner", "employee"]),
  password,
});
export type UserCreateInput = z.input<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  name: requiredText("Name", 80),
  phone,
  role: z.enum(["owner", "employee"]),
  active: z.boolean(),
});

export const changePasswordSchema = z
  .object({ current: z.string().min(1, "Enter your current password"), next: password, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "Passwords don't match" });
