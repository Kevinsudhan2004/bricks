"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryButton() {
  return (
    <Button size="lg" className="mt-6" onClick={() => window.location.reload()}>
      <RotateCw aria-hidden /> Try again
    </Button>
  );
}
