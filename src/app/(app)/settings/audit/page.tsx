import type { Metadata } from "next";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/skeletons";
import { Pill } from "@/components/common/status-badge";
import { formatDateTime } from "@/lib/format";
import { getAuditLog } from "@/server/queries/audit";

export const metadata: Metadata = { title: "Activity log · Settings" };

const TONE = { create: "success", update: "info", delete: "danger", cancel: "danger", close: "success", reopen: "warning", login: "muted", logout: "muted" } as const;

export default function AuditPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={8} />}>
      <Audit />
    </Suspense>
  );
}

async function Audit() {
  const rows = await getAuditLog();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Who entered, changed or deleted what — the latest 300 actions.</p>
      <ol className="divide-y rounded-xl border bg-card">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3 p-3.5">
            <Pill tone={TONE[r.action as keyof typeof TONE] ?? "muted"} className="mt-0.5 w-16 justify-center capitalize">
              {r.action}
            </Pill>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{r.summary}</p>
              <p className="text-xs text-muted-foreground">
                {r.userName ?? "System"} · {formatDateTime(r.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
