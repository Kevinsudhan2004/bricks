"use client";

import { Suspense, use, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrickWall } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickEntryProvider } from "@/components/entry/quick-entry";
import { BottomNav } from "./bottom-nav";
import { CommandSearch } from "./command-search";
import { OfflineBanner } from "./offline-banner";
import { isActivePath, navFor } from "./nav-config";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { useUser } from "./user-provider";

const NARROW = "(max-width: 1023px)";
function subscribeNarrow(onChange: () => void) {
  const mql = window.matchMedia(NARROW);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function AppShell({
  brandPromise,
  children,
}: {
  brandPromise: Promise<{ name: string }>;
  children: React.ReactNode;
}) {
  // iPad portrait and small laptops start with the icon-only sidebar so content gets the room.
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? !narrow;

  return (
    <SidebarProvider open={open} onOpenChange={setUserOpen}>
      <QuickEntryProvider>
      <Sidebar collapsible="icon" variant="sidebar">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <BrickWall className="size-4" aria-hidden />
                  </div>
                  <div className="grid flex-1 text-left leading-tight">
                    <Suspense fallback={<Skeleton className="h-4 w-28" />}>
                      <BrandName brandPromise={brandPromise} />
                    </Suspense>
                    <span className="truncate text-xs text-muted-foreground">Brick CRM</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <Suspense fallback={<NavSkeleton />}>
            <SidebarNav />
          </Suspense>
        </SidebarContent>
        <SidebarFooter className="md:hidden">
          <p className="px-2 text-xs text-muted-foreground">Tap outside to close</p>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b bg-background/85 pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] backdrop-blur supports-[backdrop-filter]:bg-background/70 md:pr-[max(1rem,env(safe-area-inset-right))] md:pl-[max(1rem,env(safe-area-inset-left))]">
          <SidebarTrigger className="-ml-1" aria-label="Open menu" />
          <Link href="/" className="flex min-w-0 items-center gap-2 md:hidden">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BrickWall className="size-3.5" aria-hidden />
            </span>
            <Suspense fallback={<Skeleton className="h-4 w-24" />}>
              <BrandName brandPromise={brandPromise} className="font-semibold" />
            </Suspense>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Suspense>
              <CommandSearch />
            </Suspense>
            <ThemeToggle />
            <Suspense fallback={<Skeleton className="size-9 rounded-full" />}>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        <OfflineBanner />
        <main className="mx-auto w-full max-w-[1600px] flex-1 pt-4 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(env(safe-area-inset-bottom)+6rem)] pl-[max(1rem,env(safe-area-inset-left))] md:px-6 md:pt-6 md:pb-12 lg:px-8">
          {children}
        </main>
        <Suspense>
          <BottomNav />
        </Suspense>
      </SidebarInset>
      </QuickEntryProvider>
    </SidebarProvider>
  );
}

function BrandName({ brandPromise, className }: { brandPromise: Promise<{ name: string }>; className?: string }) {
  const brand = use(brandPromise);
  return <span className={`truncate text-sm font-semibold ${className ?? ""}`}>{brand.name}</span>;
}

function SidebarNav() {
  const user = useUser();
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const groups = navFor(user.role);

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActivePath(pathname, item.href)}
                    tooltip={item.title}
                    className="h-10 md:h-9"
                  >
                    <Link href={item.href} onClick={() => isMobile && setOpenMobile(false)}>
                      <item.icon aria-hidden />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function NavSkeleton() {
  return (
    <SidebarGroup>
      <SidebarMenu>
        {Array.from({ length: 6 }).map((_, i) => (
          <SidebarMenuItem key={i}>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
