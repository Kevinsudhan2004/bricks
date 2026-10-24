import {
  BarChart3,
  Boxes,
  ClipboardList,
  Factory,
  FileStack,
  HandCoins,
  Home,
  IndianRupee,
  LayoutDashboard,
  MapPin,
  ReceiptText,
  Scale,
  Settings,
  Store,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { EntryKind } from "@/components/entry/quick-entry";
import type { Role } from "@/lib/auth";

export type NavItem = { title: string; href: string; icon: LucideIcon; description?: string; /** Opens the entry sheet in place instead of navigating. */ entry?: EntryKind };
export type NavGroup = { label: string; items: NavItem[] };

export const ENTRY_ITEMS = {
  inbound: { title: "Inbound", href: "/inbound", icon: Warehouse, description: "Raw material received" },
  production: { title: "Production", href: "/production", icon: Factory, description: "Bricks made today" },
  dispatch: { title: "Dispatch", href: "/dispatch", icon: Truck, description: "Bricks sent to customers" },
  suppliers: { title: "Suppliers", href: "/suppliers", icon: Store, description: "Who sends raw material" },
  orders: { title: "Orders", href: "/orders", icon: ClipboardList, description: "Customer brick orders" },
  customers: { title: "Customers", href: "/customers", icon: Users, description: "Who buys bricks" },
} satisfies Record<string, NavItem>;

const OWNER_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Accounts", href: "/accounts", icon: Scale, description: "Who owes you, whom you owe" },
      { title: "Truck location", href: "/trucks", icon: MapPin },
    ],
  },
  { label: "Daily entry", items: [ENTRY_ITEMS.inbound, ENTRY_ITEMS.production, ENTRY_ITEMS.dispatch] },
  {
    label: "Sales & accounts",
    items: [
      ENTRY_ITEMS.orders,
      ENTRY_ITEMS.customers,
      { title: "Payments", href: "/payments", icon: IndianRupee },
      { title: "Credit / Debit notes", href: "/notes", icon: ReceiptText },
    ],
  },
  {
    label: "Purchases",
    items: [
      { title: "Raw material bills", href: "/purchases", icon: FileStack, description: "Supplier bills: ongoing and closed" },
      { title: "Payments to suppliers", href: "/purchases/payments", icon: HandCoins },
      { ...ENTRY_ITEMS.suppliers, description: "Who sends raw material, and what you owe them" },
    ],
  },
  {
    label: "Inventory & reports",
    items: [
      { title: "Stock", href: "/stock", icon: Boxes },
      { title: "Reports", href: "/reports", icon: BarChart3 },
    ],
  },
  { label: "Admin", items: [{ title: "Settings", href: "/settings", icon: Settings }] },
];

const EMPLOYEE_NAV: NavGroup[] = [
  { label: "Today", items: [{ title: "Home", href: "/entry", icon: Home }] },
  { label: "Daily entry", items: [ENTRY_ITEMS.inbound, ENTRY_ITEMS.production, ENTRY_ITEMS.dispatch] },
  { label: "Orders & people", items: [ENTRY_ITEMS.orders, ENTRY_ITEMS.customers, ENTRY_ITEMS.suppliers] },
];

export function navFor(role: Role): NavGroup[] {
  return role === "owner" ? OWNER_NAV : EMPLOYEE_NAV;
}

/** Phone bottom bar (max 5). `null` marks the centre "+" quick-add button. */
export function bottomNavFor(role: Role): (NavItem | null)[] {
  return role === "owner"
    ? [
        { title: "Home", href: "/dashboard", icon: LayoutDashboard },
        { title: "Customers", href: "/customers", icon: Users },
        null,
        ENTRY_ITEMS.orders,
        { title: "Trucks", href: "/trucks", icon: MapPin },
      ]
    : [
        { title: "Home", href: "/entry", icon: Home },
        ENTRY_ITEMS.inbound,
        ENTRY_ITEMS.production,
        ENTRY_ITEMS.dispatch,
        ENTRY_ITEMS.orders,
      ];
}

export const QUICK_ADD: NavItem[] = [
  { ...ENTRY_ITEMS.inbound, title: "Inbound load", href: "/inbound" },
  { ...ENTRY_ITEMS.production, title: "Production", href: "/production" },
  { ...ENTRY_ITEMS.dispatch, title: "Dispatch", href: "/dispatch" },
  { title: "Order", href: "/orders/new", icon: ClipboardList, description: "Note a customer order", entry: "order" },
  { title: "Payment", href: "/payments/new", icon: IndianRupee, description: "Money received", entry: "payment" },
  { title: "Customer", href: "/customers/new", icon: Users, description: "Add a new customer", entry: "customer" },
  { title: "Credit / Debit note", href: "/notes/new", icon: ReceiptText, description: "Adjust a balance", entry: "credit" },
  { title: "Supplier bill", href: "/purchases?new=bill", icon: FileStack, description: "Raw material bill", entry: "bill" },
  { title: "Pay supplier", href: "/purchases/payments?new=payment", icon: HandCoins, description: "Money paid out", entry: "supplierPayment" },
  { title: "Stock adjustment", href: "/stock/adjust", icon: ClipboardList, description: "Correct stock count" },
];

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The most specific nav link for a path, so /purchases/payments lights up "Payments", not also "Bills". */
export function activeHref(pathname: string, hrefs: string[]): string | undefined {
  return hrefs.filter((h) => isActivePath(pathname, h)).sort((a, b) => b.length - a.length)[0];
}
