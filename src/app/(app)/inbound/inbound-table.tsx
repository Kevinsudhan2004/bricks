"use client";

import Link from "next/link";
import { Download, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataSheet, SheetDetails, type SheetColumn } from "@/components/common/data-sheet";
import { EmptyState } from "@/components/common/empty-state";
import { Pill } from "@/components/common/status-badge";
import { DeleteButton } from "@/components/forms/delete-button";
import { materialColor } from "@/lib/colors";
import { formatDay, formatINR, formatNumber, formatTime, formatTonnes } from "@/lib/format";
import { deleteInbound } from "@/server/actions/inbound";
import type { getInboundList } from "@/server/queries/inbound";
import { InboundEditButton } from "./inbound-entry";

type Row = Awaited<ReturnType<typeof getInboundList>>["rows"][number] & { canEdit: boolean };
type EntryProps = Omit<React.ComponentProps<typeof InboundEditButton>, "entryId" | "initial">;

const kgTotal = (rows: Row[]) => rows.reduce((a, r) => a + r.netKg, 0);

export function InboundTable({
  rows,
  today,
  entryProps,
  showMoney,
  exportHref,
  emptyHint,
}: {
  rows: Row[];
  today: string;
  entryProps: EntryProps;
  showMoney: boolean;
  exportHref?: string;
  emptyHint: string;
}) {
  const columns: SheetColumn<Row>[] = [
    { id: "date", header: "Date", className: "min-w-24", sortValue: (r) => r.entryDate, cell: (r) => formatDay(r.entryDate, today) },
    {
      id: "material",
      header: "Material",
      sortValue: (r) => r.materialName,
      cell: (r) => (
        <span className="flex items-center gap-1.5 font-medium">
          <span className="size-2 rounded-full" style={{ background: materialColor(r.materialCode) }} aria-hidden />
          {r.materialName}
        </span>
      ),
    },
    {
      id: "supplier",
      header: "Supplier",
      className: "max-w-48",
      sortValue: (r) => r.supplierName,
      cell: (r) => (r.supplierName ? <span className="block truncate">{r.supplierName}</span> : <Dash />),
    },
    {
      id: "vehicle",
      header: "Vehicle",
      sortValue: (r) => r.vehicleNo,
      cell: (r) => (r.vehicleNo ? <span className="font-mono text-xs">{r.vehicleNo}</span> : <Dash />),
    },
    {
      id: "net",
      header: "Net weight",
      align: "right",
      sortValue: (r) => r.netKg,
      cell: (r) => <span className="font-semibold">{formatNumber(r.netKg)} kg</span>,
      total: (rs) => `${formatNumber(kgTotal(rs))} kg`,
    },
    {
      id: "tonnes",
      header: "Tonnes",
      align: "right",
      sortValue: (r) => r.netKg,
      cell: (r) => <span className="text-muted-foreground">{formatTonnes(r.netKg)}</span>,
      total: (rs) => formatTonnes(kgTotal(rs)),
    },
    ...(showMoney
      ? ([
          {
            id: "amount",
            header: "Amount",
            align: "right",
            sortValue: (r) => r.amount ?? 0,
            cell: (r) => (r.amount ? formatINR(r.amount, { decimals: false }) : <Dash />),
            total: (rs) => formatINR(rs.reduce((a, r) => a + (r.amount ?? 0), 0), { decimals: false }),
          },
          {
            id: "bill",
            header: "Supplier bill",
            sortValue: (r) => r.billNo ?? "",
            cell: (r) =>
              r.purchaseBillId ? (
                <Link href={`/purchases/${r.purchaseBillId}`} className="font-mono text-xs hover:text-primary hover:underline">
                  {r.billNo}
                </Link>
              ) : r.supplierId ? (
                <Pill tone="info">Not billed</Pill>
              ) : (
                <Dash />
              ),
          },
        ] satisfies SheetColumn<Row>[])
      : []),
    {
      id: "by",
      header: "Entered by",
      sortValue: (r) => r.createdByName,
      cell: (r) => (
        <span className="text-muted-foreground">
          {r.createdByName} · {formatTime(r.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      className: "w-20",
      cell: (r) =>
        r.canEdit && (
          <span className="flex justify-end">
            <InboundEditButton
              {...entryProps}
              entryId={r.id}
              initial={{ entryDate: r.entryDate, materialId: r.materialId, supplierId: r.supplierId ?? undefined, netKg: r.netKg }}
            />
            <DeleteButton id={r.id} action={deleteInbound} />
          </span>
        ),
    },
  ];

  return (
    <DataSheet
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      noun={["load", "loads"]}
      searchText={(r) => [r.materialName, r.supplierName, r.vehicleNo, r.challanNo, r.remarks, r.createdByName].filter(Boolean).join(" ")}
      searchPlaceholder="Search material, supplier or vehicle"
      toolbar={
        exportHref &&
        rows.length > 0 && (
          <Button asChild variant="outline">
            <a href={exportHref} download>
              <Download aria-hidden /> CSV
            </a>
          </Button>
        )
      }
      empty={<EmptyState icon={Warehouse} title="No loads recorded" description={emptyHint} />}
      expand={(r) => (
        <SheetDetails
          items={[
            ["Supplier challan", r.challanNo],
            ["Vehicle", r.vehicleNo],
            ["Gross weight", r.grossKg ? `${formatNumber(r.grossKg)} kg` : null],
            ["Tare weight", r.tareKg ? `${formatNumber(r.tareKg)} kg` : null],
            ["Net weight", `${formatNumber(r.netKg)} kg (${formatTonnes(r.netKg)})`],
            ...(showMoney
              ? ([
                  ["Rate / tonne", r.ratePerTon ? formatINR(r.ratePerTon) : null],
                  ["Amount", r.amount ? formatINR(r.amount) : null],
                  ["Supplier bill", r.billNo ?? (r.supplierId ? "Not billed yet" : null)],
                ] satisfies [string, React.ReactNode][])
              : []),
            ["Remarks", r.remarks],
            ["Entered by", `${r.createdByName} · ${formatTime(r.createdAt)}`],
          ]}
        />
      )}
    />
  );
}

function Dash() {
  return <span className="text-muted-foreground/60">—</span>;
}
