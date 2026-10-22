"use client";

import Link from "next/link";
import { FileMinus, FilePlus, Printer, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataSheet, SheetDetails, type SheetColumn } from "@/components/common/data-sheet";
import { EmptyState } from "@/components/common/empty-state";
import { Pill } from "@/components/common/status-badge";
import { NewEntryButton } from "@/components/entry/quick-entry";
import { DeleteButton } from "@/components/forms/delete-button";
import { formatDay, formatINR } from "@/lib/format";
import { NOTE_REASONS } from "@/lib/validators";
import { deleteNote } from "@/server/actions/money";

export type NoteRow = {
  id: number;
  noteNo: string;
  type: "credit" | "debit";
  noteDate: string;
  customerId: number;
  customerName: string;
  firmName: string | null;
  invoiceId: number | null;
  invoiceNo: string | null;
  amount: number;
  reason: string;
  description: string | null;
  createdByName: string;
};

const reasonLabel = (r: string) => NOTE_REASONS[r as keyof typeof NOTE_REASONS] ?? r;
const signed = (rows: NoteRow[], type: NoteRow["type"]) => rows.filter((r) => r.type === type).reduce((a, r) => a + r.amount, 0);

export function NoteTable({ rows, today }: { rows: NoteRow[]; today: string }) {
  const columns: SheetColumn<NoteRow>[] = [
    { id: "date", header: "Date", className: "min-w-24", sortValue: (n) => n.noteDate, cell: (n) => formatDay(n.noteDate, today) },
    { id: "no", header: "Note no", sortValue: (n) => n.noteNo, cell: (n) => <span className="font-mono text-xs">{n.noteNo}</span> },
    {
      id: "type",
      header: "Type",
      sortValue: (n) => n.type,
      cell: (n) => <Pill tone={n.type === "credit" ? "success" : "warning"}>{n.type === "credit" ? "Credit" : "Debit"}</Pill>,
    },
    {
      id: "customer",
      header: "Customer",
      className: "max-w-44 md:max-w-60",
      sortValue: (n) => (n.firmName ?? n.customerName).toLowerCase(),
      cell: (n) => (
        <Link href={`/customers/${n.customerId}`} className="block truncate font-medium hover:text-primary hover:underline">
          {n.firmName ?? n.customerName}
        </Link>
      ),
    },
    {
      id: "order",
      header: "Order",
      sortValue: (n) => n.invoiceNo,
      cell: (n) =>
        n.invoiceId ? (
          <Link href={`/orders/${n.invoiceId}`} className="font-mono text-xs hover:text-primary hover:underline">
            {n.invoiceNo}
          </Link>
        ) : (
          <Pill>General</Pill>
        ),
    },
    { id: "reason", header: "Reason", sortValue: (n) => reasonLabel(n.reason), cell: (n) => reasonLabel(n.reason) },
    {
      id: "description",
      header: "Description",
      className: "max-w-64",
      cell: (n) => (n.description ? <span className="block truncate text-muted-foreground">{n.description}</span> : <span className="text-muted-foreground/60">—</span>),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      sortValue: (n) => (n.type === "credit" ? -n.amount : n.amount),
      cell: (n) => (
        <span className={n.type === "credit" ? "font-semibold text-success" : "font-semibold text-warning-foreground dark:text-warning"}>
          {n.type === "credit" ? "−" : "+"}
          {formatINR(n.amount, { decimals: false })}
        </span>
      ),
      total: (rs) => {
        const net = signed(rs, "debit") - signed(rs, "credit");
        return `${net < 0 ? "−" : "+"}${formatINR(Math.abs(net), { decimals: false })}`;
      },
    },
  ];

  return (
    <DataSheet
      rows={rows}
      columns={columns}
      rowKey={(n) => n.id}
      noun={["note", "notes"]}
      searchText={(n) => [n.noteNo, n.customerName, n.firmName, n.invoiceNo, reasonLabel(n.reason), n.description, n.type].filter(Boolean).join(" ")}
      searchPlaceholder="Search note no, customer, order or reason"
      toolbar={
        <>
          <NewEntryButton kind="debit" variant="outline">
            <FilePlus aria-hidden /> Debit note
          </NewEntryButton>
          <NewEntryButton kind="credit">
            <FileMinus aria-hidden /> Credit note
          </NewEntryButton>
        </>
      }
      empty={<EmptyState icon={ReceiptText} title="No notes in this period" />}
      expand={(n) => (
        <SheetDetails
          items={[
            ["Note", <span key="n" className="font-mono">{n.noteNo}</span>],
            ["Type", n.type === "credit" ? "Credit note — reduces what the customer owes" : "Debit note — adds to what the customer owes"],
            ["Customer", n.firmName ? `${n.firmName} (${n.customerName})` : n.customerName],
            ["Order", n.invoiceNo ?? "General (no order)"],
            ["Reason", reasonLabel(n.reason)],
            ["Amount", formatINR(n.amount)],
            ["Description", n.description],
            ["Entered by", n.createdByName],
          ]}
          actions={
            <>
              <Button asChild size="sm" variant="outline">
                <a href={`/print/note/${n.id}`} target="_blank" rel="noopener">
                  <Printer aria-hidden /> Print note
                </a>
              </Button>
              <DeleteButton id={n.id} action={deleteNote} variant="button" title={`Delete ${n.noteNo}?`} />
            </>
          }
        />
      )}
    />
  );
}
