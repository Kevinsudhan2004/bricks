"use client";

import Link from "next/link";
import { FileMinus, HandCoins, Plus } from "lucide-react";
import { DataSheet, SheetDetails, type SheetColumn } from "@/components/common/data-sheet";
import { EmptyState } from "@/components/common/empty-state";
import { Pill } from "@/components/common/status-badge";
import { NewEntryButton } from "@/components/entry/quick-entry";
import { DeleteButton } from "@/components/forms/delete-button";
import { formatDateTime, formatDay, formatINR } from "@/lib/format";
import { SUPPLIER_NOTE_REASONS } from "@/lib/validators";
import { deleteSupplierNote, deleteSupplierPayment } from "@/server/actions/purchases";
import type { SupplierNoteRow, SupplierPaymentRow } from "@/server/queries/purchases";
import { MODE } from "../../payments/modes";

export function SupplierPaymentTable({ rows, today }: { rows: SupplierPaymentRow[]; today: string }) {
  const columns: SheetColumn<SupplierPaymentRow>[] = [
    { id: "date", header: "Date", className: "min-w-24", sortValue: (r) => r.paymentDate, cell: (r) => formatDay(r.paymentDate, today) },
    { id: "voucher", header: "Voucher", sortValue: (r) => r.voucherNo, cell: (r) => <span className="font-mono text-xs">{r.voucherNo}</span> },
    {
      id: "supplier",
      header: "Supplier",
      className: "max-w-44 md:max-w-60",
      sortValue: (r) => r.supplierName.toLowerCase(),
      cell: (r) => (
        <Link href={`/suppliers/${r.supplierId}`} className="block truncate font-medium hover:text-primary hover:underline">
          {r.supplierName}
        </Link>
      ),
    },
    {
      id: "bill",
      header: "Bill",
      sortValue: (r) => r.billNo,
      cell: (r) =>
        r.billId ? (
          <Link href={`/purchases/${r.billId}`} className="font-mono text-xs hover:text-primary hover:underline">
            {r.billNo}
          </Link>
        ) : (
          <Pill>On account</Pill>
        ),
    },
    {
      id: "mode",
      header: "Mode",
      sortValue: (r) => r.mode,
      cell: (r) => {
        const M = MODE[r.mode];
        return (
          <span className="inline-flex items-center gap-1.5">
            <M.icon className="size-3.5 text-muted-foreground" aria-hidden /> {M.label}
          </span>
        );
      },
    },
    {
      id: "reference",
      header: "Reference",
      className: "max-w-40",
      cell: (r) => (r.reference ? <span className="block truncate font-mono text-xs">{r.reference}</span> : <Dash />),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      sortValue: (r) => r.amount,
      cell: (r) => <span className="font-semibold">{formatINR(r.amount)}</span>,
      total: (rs) => formatINR(rs.reduce((a, r) => a + r.amount, 0)),
    },
    {
      id: "remarks",
      header: "Remarks",
      className: "max-w-56",
      cell: (r) => (r.remarks ? <span className="block truncate text-muted-foreground">{r.remarks}</span> : <Dash />),
    },
  ];

  return (
    <DataSheet
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      noun={["payment", "payments"]}
      searchText={(r) => [r.voucherNo, r.supplierName, r.billNo, r.reference, r.remarks, MODE[r.mode].label].filter(Boolean).join(" ")}
      searchPlaceholder="Search voucher, supplier, bill or UTR"
      toolbar={
        <NewEntryButton kind="supplierPayment">
          <Plus aria-hidden /> Pay supplier
        </NewEntryButton>
      }
      empty={<EmptyState icon={HandCoins} title="No payments to suppliers in this period" />}
      expand={(r) => (
        <SheetDetails
          items={[
            ["Voucher", <span key="v" className="font-mono">{r.voucherNo}</span>],
            ["Supplier", r.supplierName],
            ["Against bill", r.billNo ?? "Advance / on account"],
            ["Mode", MODE[r.mode].label],
            ["Reference / UTR", r.reference],
            ["Amount", formatINR(r.amount)],
            ["Remarks", r.remarks],
            ["Entered by", `${r.createdByName} · ${formatDateTime(r.createdAt)}`],
          ]}
          actions={
            r.billClosed ? (
              <p className="text-xs text-muted-foreground">Its bill is closed. Reopen the bill to change this payment.</p>
            ) : (
              <DeleteButton
                id={r.id}
                action={deleteSupplierPayment}
                variant="button"
                title={`Delete ${r.voucherNo}?`}
                description="What you owe this supplier goes back up by this amount."
              />
            )
          }
        />
      )}
    />
  );
}

export function SupplierNoteTable({ rows, today }: { rows: SupplierNoteRow[]; today: string }) {
  const columns: SheetColumn<SupplierNoteRow>[] = [
    { id: "date", header: "Date", className: "min-w-24", sortValue: (r) => r.noteDate, cell: (r) => formatDay(r.noteDate, today) },
    {
      id: "type",
      header: "Type",
      sortValue: (r) => r.type,
      cell: (r) => <Pill tone={r.type === "credit" ? "success" : "warning"}>{r.type === "credit" ? "Credit from supplier" : "Extra charge"}</Pill>,
    },
    { id: "no", header: "Note", sortValue: (r) => r.noteNo, cell: (r) => <span className="font-mono text-xs">{r.noteNo}</span> },
    {
      id: "supplier",
      header: "Supplier",
      className: "max-w-44 md:max-w-60",
      sortValue: (r) => r.supplierName.toLowerCase(),
      cell: (r) => (
        <Link href={`/suppliers/${r.supplierId}`} className="block truncate font-medium hover:text-primary hover:underline">
          {r.supplierName}
        </Link>
      ),
    },
    {
      id: "bill",
      header: "Bill",
      cell: (r) =>
        r.billId ? (
          <Link href={`/purchases/${r.billId}`} className="font-mono text-xs hover:text-primary hover:underline">
            {r.billNo}
          </Link>
        ) : (
          <Dash />
        ),
    },
    { id: "reason", header: "Reason", cell: (r) => SUPPLIER_NOTE_REASONS[r.reason as keyof typeof SUPPLIER_NOTE_REASONS] ?? r.reason },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      sortValue: (r) => (r.type === "credit" ? -r.amount : r.amount),
      cell: (r) => (
        <span className="font-semibold">
          {r.type === "credit" ? "−" : "+"}
          {formatINR(r.amount, { decimals: false })}
        </span>
      ),
    },
  ];

  return (
    <DataSheet
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      noun={["note", "notes"]}
      searchText={(r) => [r.noteNo, r.supplierName, r.billNo, r.description].filter(Boolean).join(" ")}
      searchPlaceholder="Search note, supplier or bill"
      toolbar={
        <NewEntryButton kind="supplierCredit" variant="outline">
          <FileMinus aria-hidden /> Credit / extra charge
        </NewEntryButton>
      }
      empty={<EmptyState icon={FileMinus} title="No supplier credits or extra charges in this period" />}
      expand={(r) => (
        <SheetDetails
          items={[
            ["Note", <span key="n" className="font-mono">{r.noteNo}</span>],
            ["Supplier", r.supplierName],
            ["Bill", r.billNo ?? "General (no bill)"],
            ["Reason", SUPPLIER_NOTE_REASONS[r.reason as keyof typeof SUPPLIER_NOTE_REASONS] ?? r.reason],
            ["Amount", formatINR(r.amount)],
            ["Description", r.description],
            ["Entered by", r.createdByName],
          ]}
          actions={
            r.billClosed ? (
              <p className="text-xs text-muted-foreground">Its bill is closed. Reopen the bill to change this note.</p>
            ) : (
              <DeleteButton id={r.id} action={deleteSupplierNote} variant="button" title={`Delete ${r.noteNo}?`} description="The supplier's balance changes back." />
            )
          }
        />
      )}
    />
  );
}

function Dash() {
  return <span className="text-muted-foreground/60">—</span>;
}
