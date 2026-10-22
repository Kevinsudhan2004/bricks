"use client";

import { useSyncExternalStore } from "react";
import { ArrowLeft, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintToolbar() {
  // false on the server, real value in the browser — no hydration mismatch.
  const canShare = useSyncExternalStore(
    () => () => {},
    () => "share" in navigator,
    () => false,
  );

  return (
    <div className="no-print mx-auto mb-4 flex w-full max-w-[210mm] items-center justify-between gap-2 px-4 md:px-0">
      <Button variant="ghost" onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}>
        <ArrowLeft aria-hidden /> Back
      </Button>
      <div className="flex gap-2">
        {canShare && (
          <Button variant="outline" onClick={() => navigator.share({ title: document.title, url: window.location.href }).catch(() => {})}>
            <Share2 aria-hidden /> Share
          </Button>
        )}
        <Button onClick={() => window.print()}>
          <Printer aria-hidden /> Print / Save PDF
        </Button>
      </div>
    </div>
  );
}
