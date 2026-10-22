import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Offline" };

/** Shown by the service worker when a page can't load because there's no network. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <WifiOff className="size-7" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">No internet connection</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Brick CRM needs the network to load fresh numbers. Check mobile data or Wi-Fi and try again.
      </p>
      <RetryButton />
    </main>
  );
}
