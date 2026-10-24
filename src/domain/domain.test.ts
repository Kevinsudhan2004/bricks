import { describe, expect, it } from "vitest";
import { ageingBuckets } from "./ageing";
import { addDays, daysBetween, financialYear, isValidIsoDate, lastMonths, todayIn } from "./dates";
import { validateDispatch } from "./dispatch";
import { formatDocNo } from "./doc-numbers";
import {
  computeInvoiceTotals,
  deliveryProgress,
  deliveryStatus,
  invoiceBalance,
  paymentStatus,
} from "./invoice";
import { buildLedger, ledgerTotals } from "./ledger";
import { billCloseBlocker, docState, isSettled, orderCloseBlocker } from "./settlement";
import { round2 } from "./money";
import { daysOfStockLeft, finishedGoodsStock, materialConsumption, rawMaterialStock } from "./stock";

const FLY_ASH = 1;
const SOLID = 2;

describe("money", () => {
  it("rounds to paise without float drift", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe("dates", () => {
  it("computes the Indian financial year", () => {
    expect(financialYear("2026-10-09")).toBe("26-27");
    expect(financialYear("2027-03-31")).toBe("26-27");
    expect(financialYear("2027-04-01")).toBe("27-28");
    expect(financialYear("2026-01-15")).toBe("25-26");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-01-01", "2026-03-01")).toBe(59);
  });

  it("returns today in the business timezone, not UTC", () => {
    // 20:00 UTC on 9 Oct is already 10 Oct in India (UTC+5:30)
    expect(todayIn("Asia/Kolkata", new Date("2026-10-09T20:00:00Z"))).toBe("2026-10-10");
    expect(todayIn("UTC", new Date("2026-10-09T20:00:00Z"))).toBe("2026-10-09");
  });

  it("validates ISO dates and lists months", () => {
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(lastMonths("2026-02-10", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

describe("document numbers", () => {
  it("pads and includes the financial year", () => {
    expect(formatDocNo("INV", "26-27", 7)).toBe("INV/26-27/0007");
    expect(formatDocNo("DC", "26-27", 12345)).toBe("DC/26-27/12345");
  });
});

describe("invoice totals", () => {
  it("splits intra-state GST into CGST and SGST and rounds the total", () => {
    const t = computeInvoiceTotals({
      items: [{ productId: FLY_ASH, quantity: 20000, rate: 7.5, gstRate: 5 }],
      transportCharges: 2500,
      taxType: "intra",
    });
    expect(t.subtotal).toBe(150000);
    // transport is taxed at the principal supply's 5%
    expect(t.transportTax).toBe(125);
    expect(t.taxTotal).toBe(7625);
    expect(t.cgst).toBe(3812.5);
    expect(t.sgst).toBe(3812.5);
    expect(t.igst).toBe(0);
    expect(t.total).toBe(160125);
    expect(t.roundOff).toBe(0);
  });

  it("uses IGST for inter-state and applies round-off", () => {
    const t = computeInvoiceTotals({
      items: [
        { productId: FLY_ASH, quantity: 1001, rate: 7.33, gstRate: 5 },
        { productId: SOLID, quantity: 333, rate: 45.5, gstRate: 18 },
      ],
      taxType: "inter",
    });
    // 7337.33 + 15151.50
    expect(t.subtotal).toBe(22488.83);
    expect(t.igst).toBe(round2(366.87 + 2727.27));
    expect(t.cgst).toBe(0);
    expect(Number.isInteger(t.total)).toBe(true);
    expect(round2(t.total - (t.subtotal + t.taxTotal))).toBe(t.roundOff);
    expect(Math.abs(t.roundOff)).toBeLessThanOrEqual(0.5);
  });

  it("produces a plain bill when GST is 0%", () => {
    const t = computeInvoiceTotals({
      items: [{ productId: FLY_ASH, quantity: 8000, rate: 8, gstRate: 0 }],
      transportCharges: 1000,
      taxType: "intra",
    });
    expect(t.taxTotal).toBe(0);
    expect(t.total).toBe(65000);
  });
});

describe("delivery progress", () => {
  it("tracks pending bricks per product (user's example: 8,000 pending)", () => {
    const p = deliveryProgress(
      [{ productId: FLY_ASH, quantity: 20000 }],
      [
        { productId: FLY_ASH, quantity: 7000 },
        { productId: FLY_ASH, quantity: 5000 },
      ],
    );
    expect(p.ordered).toBe(20000);
    expect(p.delivered).toBe(12000);
    expect(p.pending).toBe(8000);
    expect(deliveryStatus(p.ordered, p.delivered)).toBe("partial");
  });

  it("shows the full quantity pending when nothing is delivered yet", () => {
    const p = deliveryProgress([{ productId: FLY_ASH, quantity: 20000 }], []);
    expect(p.pending).toBe(20000);
    expect(deliveryStatus(p.ordered, p.delivered)).toBe("not_started");
  });

  it("handles multiple products and completion", () => {
    const p = deliveryProgress(
      [
        { productId: FLY_ASH, quantity: 5000 },
        { productId: SOLID, quantity: 1000 },
      ],
      [
        { productId: FLY_ASH, quantity: 5000 },
        { productId: SOLID, quantity: 1000 },
      ],
    );
    expect(p.pending).toBe(0);
    expect(deliveryStatus(p.ordered, p.delivered)).toBe("completed");
    expect(deliveryStatus(p.ordered, p.delivered, true)).toBe("cancelled");
  });
});

describe("payments", () => {
  const base = { total: 100000, paid: 0, credits: 0, debits: 0, dueDate: "2026-10-20", today: "2026-10-09" };

  it("computes balance with payments and credit/debit notes", () => {
    expect(invoiceBalance({ total: 100000, paid: 40000, credits: 5000, debits: 2000 })).toBe(57000);
  });

  it("derives payment status", () => {
    expect(paymentStatus(base)).toBe("unpaid");
    expect(paymentStatus({ ...base, paid: 10000 })).toBe("partial");
    expect(paymentStatus({ ...base, paid: 95000, credits: 5000 })).toBe("paid");
    expect(paymentStatus({ ...base, today: "2026-10-21" })).toBe("overdue");
    expect(paymentStatus({ ...base, cancelled: true })).toBe("cancelled");
  });
});

describe("ledger", () => {
  it("runs a Dr/Cr balance in date order", () => {
    const rows = buildLedger(5000, [
      { date: "2026-10-02", kind: "payment", ref: "RC/26-27/0001", description: "Payment", debit: 0, credit: 30000 },
      { date: "2026-10-01", kind: "invoice", ref: "INV/26-27/0001", description: "Invoice", debit: 50000, credit: 0 },
      { date: "2026-10-03", kind: "credit_note", ref: "CN/26-27/0001", description: "Damaged", debit: 0, credit: 2000 },
      { date: "2026-10-03", kind: "debit_note", ref: "DN/26-27/0001", description: "Extra transport", debit: 1500, credit: 0 },
    ]);
    expect(rows.map((r) => r.balance)).toEqual([5000, 55000, 25000, 26500, 24500]);
    expect(ledgerTotals(rows)).toEqual({ debit: 56500, credit: 32000 });
  });

  it("shows an advance as a negative (Cr) balance", () => {
    const rows = buildLedger(0, [
      { date: "2026-10-01", kind: "payment", ref: "RC1", description: "Advance", debit: 0, credit: 10000 },
    ]);
    expect(rows.at(-1)?.balance).toBe(-10000);
  });
});

describe("stock", () => {
  it("computes finished goods", () => {
    expect(finishedGoodsStock({ produced: 25000, rejected: 300, dispatched: 20000, adjustment: -200 })).toBe(4500);
  });

  it("estimates raw material consumption from the mix", () => {
    const used = materialConsumption(
      [
        { productId: FLY_ASH, quantity: 10000 },
        { productId: SOLID, quantity: 1000 },
      ],
      [
        { productId: FLY_ASH, kgPerUnit: 1.5 },
        { productId: SOLID, kgPerUnit: 4 },
      ],
    );
    expect(used).toBe(19000);
    expect(rawMaterialStock({ inbound: 50000, consumed: used, adjustment: 0 })).toBe(31000);
    expect(daysOfStockLeft(31000, 10000)).toBe(3);
    expect(daysOfStockLeft(31000, 0)).toBeNull();
  });
});

describe("dispatch validation", () => {
  const pending = new Map([
    [FLY_ASH, 8000],
    [SOLID, 0],
  ]);
  const name = (id: number) => (id === FLY_ASH ? "Fly Ash Bricks" : "Solid Blocks");

  it("blocks dispatching more than pending", () => {
    const r = validateDispatch(pending, [{ productId: FLY_ASH, quantity: 9000 }], name);
    expect(r.errors.get(FLY_ASH)).toBe("Only 8,000 pending for Fly Ash Bricks.");
  });

  it("allows up to the pending quantity", () => {
    const r = validateDispatch(pending, [{ productId: FLY_ASH, quantity: 8000 }], name);
    expect(r.errors.size).toBe(0);
    expect(r.formError).toBeNull();
  });

  it("requires at least one quantity and whole numbers", () => {
    expect(validateDispatch(pending, [{ productId: FLY_ASH, quantity: 0 }]).formError).not.toBeNull();
    expect(validateDispatch(pending, [{ productId: FLY_ASH, quantity: 10.5 }]).errors.size).toBe(1);
    expect(validateDispatch(pending, [{ productId: 99, quantity: 5 }]).errors.size).toBe(1);
  });
});

describe("ageing", () => {
  it("buckets outstanding balances by invoice age", () => {
    const buckets = ageingBuckets(
      [
        { invoiceDate: "2026-10-01", balance: 1000 },
        { invoiceDate: "2026-08-20", balance: 2000 },
        { invoiceDate: "2026-07-25", balance: 3000 },
        { invoiceDate: "2026-01-01", balance: 4000 },
        { invoiceDate: "2026-01-01", balance: 0 },
      ],
      "2026-10-09",
    );
    expect(buckets.map((b) => b.amount)).toEqual([1000, 2000, 3000, 4000]);
  });
});

describe("closing orders and supplier bills", () => {
  const order = { cancelled: false, closed: false, pending: 0, balance: 0 };

  it("treats a balance within a paisa as settled", () => {
    expect(isSettled(0)).toBe(true);
    expect(isSettled(0.004)).toBe(true);
    expect(isSettled(-0.001)).toBe(true);
    expect(isSettled(0.01)).toBe(false);
    expect(isSettled(-5)).toBe(false);
  });

  it("derives the state from cancelled / closed", () => {
    expect(docState({ cancelled: false, closedAt: null })).toBe("ongoing");
    expect(docState({ cancelled: false, closedAt: "2026-10-01T10:00:00Z" })).toBe("closed");
    expect(docState({ cancelled: true, closedAt: null })).toBe("cancelled");
  });

  it("completes an order only when fully delivered and debit = credit", () => {
    expect(orderCloseBlocker(order)).toBeNull();
    // Paid in full but bricks still owed
    expect(orderCloseBlocker({ ...order, pending: 2000 })).toMatch(/2,000 bricks are still to be delivered/);
    // Delivered but money still due
    expect(orderCloseBlocker({ ...order, balance: 1500 })).toMatch(/₹1,500 is still due/);
    // Customer paid more than billed: debit and credit still don't match
    expect(orderCloseBlocker({ ...order, balance: -250 })).toMatch(/₹250 more was received/);
    expect(orderCloseBlocker({ ...order, cancelled: true })).toMatch(/cancelled/);
    expect(orderCloseBlocker({ ...order, closed: true })).toMatch(/already completed/);
  });

  it("closes a supplier bill only when what we owe is zero", () => {
    const bill = { cancelled: false, closed: false, balance: 0 };
    expect(billCloseBlocker(bill)).toBeNull();
    expect(billCloseBlocker({ ...bill, balance: 12000.5 })).toMatch(/₹12,000.5 is still to be paid/);
    expect(billCloseBlocker({ ...bill, balance: -100 })).toMatch(/more was paid than billed/);
    expect(billCloseBlocker({ ...bill, closed: true })).toMatch(/already closed/);
  });

  it("uses the same balance formula for bills: total + debits − credits − paid", () => {
    // ₹1,00,000 bill, supplier adds ₹2,000 transport, gives ₹3,000 short-weight credit, we paid ₹99,000
    expect(invoiceBalance({ total: 100000, debits: 2000, credits: 3000, paid: 99000 })).toBe(0);
  });
});
