"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useQuickEntry } from "@/components/entry/quick-entry";
import { bottomNavFor, isActivePath, QUICK_ADD, type NavItem } from "./nav-config";
import { useUser } from "./user-provider";

/** Phone-only bottom tab bar (hidden from md / iPad up, where the sidebar takes over). */
export function BottomNav() {
  const user = useUser();
  const pathname = usePathname();
  const items = bottomNavFor(user.role);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-1">
        {items.map((item, i) =>
          item === null ? (
            <li key="quick-add" className="flex flex-1 justify-center">
              <QuickAdd />
            </li>
          ) : (
            <li key={item.href} className="flex flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium transition-colors",
                  isActivePath(pathname, item.href) ? "text-primary" : "text-muted-foreground active:bg-muted",
                )}
                aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
                data-index={i}
              >
                <item.icon className="size-5" aria-hidden />
                {item.title}
              </Link>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}

function QuickAdd() {
  const [open, setOpen] = useState(false);
  const openEntry = useQuickEntry();
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label="Add new entry"
          className="-mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
        >
          <Plus className="size-7" aria-hidden />
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Add new</DrawerTitle>
          <DrawerDescription>What would you like to record?</DrawerDescription>
        </DrawerHeader>
        <div className="grid grid-cols-2 gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {QUICK_ADD.map((item) => {
            const className = "flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors active:bg-muted";
            const { entry } = item;
            return entry ? (
              <button
                key={item.href}
                type="button"
                onClick={() => {
                  setOpen(false);
                  openEntry({ kind: entry });
                }}
                className={className}
              >
                <QuickAddLabel item={item} />
              </button>
            ) : (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={className}>
                <QuickAddLabel item={item} />
              </Link>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function QuickAddLabel({ item }: { item: NavItem }) {
  return (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <item.icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        {item.description && <span className="block truncate text-xs text-muted-foreground">{item.description}</span>}
      </span>
    </>
  );
}
