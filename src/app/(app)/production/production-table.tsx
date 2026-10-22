"use client";

import { Factory } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataSheet, type SheetColumn } from "@/components/common/data-sheet";
import { EmptyState } from "@/components/common/empty-state";
import { DeleteButton } from "@/components/forms/delete-button";
import { productColor } from "@/lib/colors";
import { formatDay, formatNumber, formatTime } from "@/lib/format";
import { deleteProduction } from "@/server/actions/production";
import type { getProductionList } from "@/server/queries/production";
import { ProductionEditButton } from "./production-entry";

type Row = Awaited<ReturnType<typeof getProductionList>>["rows"][number] & { canEdit: boolean };
type EntryProps = Omit<React.ComponentProps<typeof ProductionEditButton>, "entryId" | "initial">;

const sum = (rows: Row[], f: (r: Row) => number) => formatNumber(rows.reduce((a, r) => a + f(r), 0));

export function ProductionTable({
  rows,
  today,
  entryProps,
  emptyHint,
}: {
  rows: Row[];
  today: string;
  entryProps: EntryProps;
  emptyHint: string;
}) {
  const columns: SheetColumn<Row>[] = [
    { id: "date", header: "Date", className: "min-w-24", sortValue: (r) => r.entryDate, cell: (r) => formatDay(r.entryDate, today) },
    {
      id: "product",
      header: "Product",
      sortValue: (r) => r.productName,
      cell: (r) => (
        <span className="flex items-center gap-1.5 font-medium">
          <span className="size-2 rounded-full" style={{ background: productColor(r.productCode) }} aria-hidden />
          {r.productName}
        </span>
      ),
    },
    {
      id: "made",
      header: "Made",
      align: "right",
      sortValue: (r) => r.quantityProduced,
      cell: (r) => <span className="font-semibold">{formatNumber(r.quantityProduced)}</span>,
      total: (rs) => sum(rs, (r) => r.quantityProduced),
    },
    {
      id: "broken",
      header: "Broken",
      align: "right",
      sortValue: (r) => r.quantityRejected,
      cell: (r) => <span className={cn(r.quantityRejected > 0 && "text-destructive")}>{formatNumber(r.quantityRejected)}</span>,
      total: (rs) => sum(rs, (r) => r.quantityRejected),
    },
    {
      id: "good",
      header: "Good",
      align: "right",
      sortValue: (r) => r.quantityProduced - r.quantityRejected,
      cell: (r) => formatNumber(r.quantityProduced - r.quantityRejected),
      total: (rs) => sum(rs, (r) => r.quantityProduced - r.quantityRejected),
    },
    {
      id: "rate",
      header: "Broken %",
      align: "right",
      sortValue: (r) => (r.quantityProduced ? r.quantityRejected / r.quantityProduced : 0),
      cell: (r) => (
        <span className="text-muted-foreground">
          {r.quantityProduced ? ((r.quantityRejected / r.quantityProduced) * 100).toFixed(1) : "0.0"}%
        </span>
      ),
    },
    {
      id: "remarks",
      header: "Remarks",
      className: "max-w-60",
      cell: (r) => (r.remarks ? <span className="block truncate text-muted-foreground">{r.remarks}</span> : <Dash />),
    },
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
            <ProductionEditButton
              {...entryProps}
              entryId={r.id}
              initial={{ entryDate: r.entryDate, productId: r.productId, quantityProduced: r.quantityProduced, quantityRejected: r.quantityRejected }}
            />
            <DeleteButton id={r.id} action={deleteProduction} />
          </span>
        ),
    },
  ];

  return (
    <DataSheet
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      noun={["entry", "entries"]}
      searchText={(r) => [r.productName, r.remarks, r.createdByName].filter(Boolean).join(" ")}
      searchPlaceholder="Search product, remarks or person"
      empty={<EmptyState icon={Factory} title="No production recorded" description={emptyHint} />}
    />
  );
}

function Dash() {
  return <span className="text-muted-foreground/60">—</span>;
}
