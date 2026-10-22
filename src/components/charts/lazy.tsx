"use client";

import dynamic from "next/dynamic";
import { ChartSkeleton } from "@/components/common/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/*
 * Recharts is the heaviest dependency in the app, so charts load lazily and only
 * on the pages that show them. Data-entry screens never download it.
 */
const load = () => import("./charts");
const fallback = () => <ChartSkeleton />;

export const ProductionChart = dynamic(() => load().then((m) => m.ProductionChart), { ssr: false, loading: fallback });
export const YardStockChart = dynamic(() => load().then((m) => m.YardStockChart), { ssr: false, loading: fallback });
export const InboundChart = dynamic(() => load().then((m) => m.InboundChart), { ssr: false, loading: fallback });
export const MoneyChart = dynamic(() => load().then((m) => m.MoneyChart), { ssr: false, loading: fallback });
export const AgeingChart = dynamic(() => load().then((m) => m.AgeingChart), { ssr: false, loading: fallback });
export const DeliveriesByMonthChart = dynamic(() => load().then((m) => m.DeliveriesByMonthChart), { ssr: false, loading: fallback });
export const InvoicePaymentChart = dynamic(() => load().then((m) => m.InvoicePaymentChart), { ssr: false, loading: fallback });
export const CapacityGauge = dynamic(() => load().then((m) => m.CapacityGauge), {
  ssr: false,
  loading: () => <Skeleton className="mx-auto size-36 rounded-full" />,
});

// These two are plain HTML (no Recharts) and render on the server.
export { MaterialStock, RankedBars } from "./bars";
