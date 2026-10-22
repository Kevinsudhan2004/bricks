"use client";

import { WifiOff } from "lucide-react";
import { useOffline } from "next/offline";

/**
 * Calm banner while the device has no connection. With `experimental.useOffline`,
 * Next.js holds navigations and saves (Server Actions) and retries them when the network returns.
 */
export function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-sm font-medium text-warning-foreground"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      You&apos;re offline. Anything you save will be sent automatically when the network is back.
    </div>
  );
}
