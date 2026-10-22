"use client";

import { useTransition } from "react";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setCustomerActive } from "@/server/actions/customers";

export function ArchiveCustomerButton({ id, active }: { id: number; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      onClick={() =>
        start(async () => {
          const res = await setCustomerActive(id, !active);
          if (res.ok) toast.success(res.message);
          else toast.error(res.error);
        })
      }
      disabled={pending}
      aria-label={active ? "Archive customer" : "Restore customer"}
    >
      {pending ? <Loader2 className="animate-spin" /> : active ? <Archive aria-hidden /> : <ArchiveRestore aria-hidden />}
      <span className="hidden sm:inline">{active ? "Archive" : "Restore"}</span>
    </Button>
  );
}
