"use client";

import Link from "next/link";
import { Printer, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataSheet, type SheetColumn } from "@/components/common/data-sheet";
import { EmptyState } from "@/components/common/empty-state";
import { DeleteButton } from "@/components/forms/delete-button";
import { productColor } from "@/lib/colors";
import { formatDay, formatNumber, formatTime } from "@/lib/format";
import { deleteDispatch } from "@/server/actions/dispatch";
import type { DispatchRow } from "@/server/queries/dispatch";

type Row = DispatchRow & { canDelete: boolean; edit: React.ReactNode };
type Product = { id: number; name: string; code: string };

const qty = (r: Row, productId: number) => r.items.find((i) => i.productId === productId)?.quantity ?? 0;
const bricks = (r: Row) => r.items.reduce((a, i) => a + i.quantity, 0);

/** One line per truck, with a column per product so loads read across like a register. */
export function DispatchTable({ rows, products, today, emptyHint }: { rows: Row[]; products: Product[]; today: string; emptyHint: string }) {
  const columns: SheetColumn<Row>[] = [
    {
      id: "challan",
      header: "Challan",
      className: "min-w-24",
      sortValue: (r) => r.dispatchNo,
      cell: (r) => (
        <Link href={`/dispatch/${r.id}`} className="font-mono text-xs font-semibold hover:text-primary hover:underline">
          {r.dispatchNo}
        </Link>
      ),
    },
    {
      id: "date",
      header: "Date",
      sortValue: (r) => `${r.dispatchDate} ${new Date(r.createdAt).toISOString()}`,
      cell: (r) => (
        <>
          {formatDay(r.dispatchDate, today)} <span className="text-xs text-muted-foreground">{formatTime(r.createdAt)}</span>
        </>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      className: "max-w-44 md:max-w-56",
      sortValue: (r) => (r.firmName ?? r.customerName).toLowerCase(),
      cell: (r) => <span className="block truncate font-medium">{r.firmName ?? r.customerName}</span>,
    },
    {
      id: "order",
      header: "Order",
      sortValue: (r) => r.invoiceNo,
      cell: (r) => (
        <Link href={`/orders/${r.invoiceId}`} className="font-mono text-xs text-muted-foreground hover:text-primary hover:underline">
          {r.invoiceNo}
        </Link>
      ),
    },
    ...products.map(
      (p, i): SheetColumn<Row> => ({
        id: `p${p.id}`,
        header: p.name,
        align: "right",
        sortValue: (r) => qty(r, p.id),
        cell: (r) => {
          const q = qty(r, p.id);
          return q ? (
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span className="size-1.5 rounded-full" style={{ background: productColor(p.code, i) }} aria-hidden />
              {formatNumber(q)}
            </span>
          ) : (
            <Dash />
          );
        },
        total: (rs) => formatNumber(rs.reduce((a, r) => a + qty(r, p.id), 0)),
      }),
    ),
    ...(products.length > 1
      ? [
          {
            id: "bricks",
            header: "Total",
            align: "right",
            sortValue: bricks,
            cell: (r) => formatNumber(bricks(r)),
            total: (rs) => formatNumber(rs.reduce((a, r) => a + bricks(r), 0)),
          } satisfies SheetColumn<Row>,
        ]
      : []),
    { id: "vehicle", header: "Vehicle", sortValue: (r) => r.vehicleNo, cell: (r) => (r.vehicleNo ? <span className="font-mono text-xs">{r.vehicleNo}</span> : <Dash />) },
    { id: "driver", header: "Driver", sortValue: (r) => r.driverName, cell: (r) => r.driverName ?? <Dash /> },
    {
      id: "driverPhone",
      header: "Driver phone",
      cell: (r) =>
        r.driverPhone ? (
          <a href={`tel:${r.driverPhone}`} className="num hover:text-primary">
            {r.driverPhone}
          </a>
        ) : (
          <Dash />
        ),
    },
    { id: "by", header: "Entered by", sortValue: (r) => r.createdByName, cell: (r) => <span className="text-muted-foreground">{r.createdByName}</span> },
    {
      id: "actions",
      header: "",
      className: "w-28",
      cell: (r) => (
        <span className="flex justify-end">
          <Button asChild variant="ghost" size="icon-sm" aria-label="Print challan">
            <a href={`/print/challan/${r.id}`} target="_blank" rel="noopener">
              <Printer aria-hidden />
            </a>
          </Button>
          {r.edit}
          {r.canDelete && <DeleteButton id={r.id} action={deleteDispatch} />}
        </span>
      ),
    },
  ];

  return (
    <DataSheet
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      noun={["truck", "trucks"]}
      searchText={(r) => [r.dispatchNo, r.customerName, r.firmName, r.invoiceNo, r.vehicleNo, r.driverName, r.driverPhone].filter(Boolean).join(" ")}
      searchPlaceholder="Search challan, customer, order or vehicle"
      empty={<EmptyState icon={Truck} title="No dispatches" description={emptyHint} />}
    />
  );
}

function Dash() {
  return <span className="text-muted-foreground/60">—</span>;
}
