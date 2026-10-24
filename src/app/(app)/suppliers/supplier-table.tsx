"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import { DataSheet, type SheetColumn } from "@/components/common/data-sheet";
import { EmptyState } from "@/components/common/empty-state";
import { Pill } from "@/components/common/status-badge";
import { formatDay, formatINR, formatNumber, formatTonnes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EditSupplierButton } from "./supplier-forms";

export type SupplierRow = {
  id: number;
  name: string;
  phone: string | null;
  gstin: string | null;
  address: string | null;
  active: boolean;
  openingBalance: number;
  /** What we owe the supplier (owner only; null for employees). */
  payable: number | null;
  /** Last 30 days */
  kg: number;
  loads: number;
  materials: string | null;
  last: string | null;
};

export function SupplierTable({ rows, today, isOwner }: { rows: SupplierRow[]; today: string; isOwner: boolean }) {
  const columns: SheetColumn<SupplierRow>[] = [
    {
      id: "name",
      header: "Supplier",
      className: "min-w-36 max-w-56",
      sortValue: (s) => s.name.toLowerCase(),
      cell: (s) => (
        <span className="flex items-center gap-1.5">
          {isOwner ? (
            <Link href={`/suppliers/${s.id}`} className="truncate font-medium hover:text-primary hover:underline">
              {s.name}
            </Link>
          ) : (
            <span className="truncate font-medium">{s.name}</span>
          )}
          {!s.active && <Pill>Hidden</Pill>}
        </span>
      ),
    },
    ...(isOwner
      ? ([
          {
            id: "payable",
            header: "To pay",
            align: "right",
            sortValue: (s) => s.payable ?? 0,
            cell: (s) =>
              s.payable ? (
                <span className={cn("font-semibold", s.payable < 0 && "text-success")}>
                  {formatINR(Math.abs(s.payable), { decimals: false })}
                  {s.payable < 0 ? " adv" : ""}
                </span>
              ) : (
                <Dash />
              ),
            total: (rs) => formatINR(rs.reduce((a, s) => a + Math.max(s.payable ?? 0, 0), 0), { decimals: false }),
          },
        ] satisfies SheetColumn<SupplierRow>[])
      : []),
    {
      id: "phone",
      header: "Phone",
      sortValue: (s) => s.phone,
      cell: (s) =>
        s.phone ? (
          <a href={`tel:${s.phone}`} className="num hover:text-primary">
            {s.phone}
          </a>
        ) : (
          <Dash />
        ),
    },
    { id: "gstin", header: "GSTIN", cell: (s) => (s.gstin ? <span className="font-mono text-xs">{s.gstin}</span> : <Dash />) },
    { id: "address", header: "Address", className: "max-w-60", cell: (s) => (s.address ? <span className="block truncate">{s.address}</span> : <Dash />) },
    { id: "materials", header: "Materials (30 days)", sortValue: (s) => s.materials, cell: (s) => s.materials ?? <Dash /> },
    {
      id: "loads",
      header: "Loads",
      align: "right",
      sortValue: (s) => s.loads,
      cell: (s) => (s.loads ? formatNumber(s.loads) : <Dash />),
      total: (rs) => formatNumber(rs.reduce((a, s) => a + s.loads, 0)),
    },
    {
      id: "kg",
      header: "Received",
      align: "right",
      sortValue: (s) => s.kg,
      cell: (s) => (s.kg ? <span className="font-semibold">{formatTonnes(s.kg)}</span> : <Dash />),
      total: (rs) => formatTonnes(rs.reduce((a, s) => a + s.kg, 0)),
    },
    { id: "last", header: "Last load", sortValue: (s) => s.last, cell: (s) => (s.last ? formatDay(s.last, today) : <Dash />) },
    {
      id: "actions",
      header: "",
      className: "w-14",
      cell: (s) => (
        <EditSupplierButton
          id={s.id}
          isOwner={isOwner}
          initial={{
            name: s.name,
            phone: s.phone ?? "",
            gstin: s.gstin ?? "",
            address: s.address ?? "",
            openingBalance: isOwner && s.openingBalance ? s.openingBalance : "",
            active: s.active,
          }}
        />
      ),
    },
  ];

  return (
    <DataSheet
      rows={rows}
      columns={columns}
      rowKey={(s) => s.id}
      noun={["supplier", "suppliers"]}
      searchText={(s) => [s.name, s.phone, s.gstin, s.address, s.materials].filter(Boolean).join(" ")}
      searchPlaceholder="Search name, phone or material"
      initialSort={{ id: "kg", dir: "desc" }}
      rowClassName={(s) => (!s.active ? "opacity-60" : undefined)}
      empty={<EmptyState icon={Store} title="No suppliers yet" description="Add your first supplier above." />}
    />
  );
}

function Dash() {
  return <span className="text-muted-foreground/60">—</span>;
}
