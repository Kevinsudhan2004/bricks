import type { Metadata } from "next";
import { Suspense } from "react";
import { ShieldCheck, UserRound } from "lucide-react";
import { ListSkeleton } from "@/components/common/skeletons";
import { Pill } from "@/components/common/status-badge";
import { getUsers } from "@/server/queries/masters";
import { NewUserButton, ResetPasswordButton, UserEditor } from "../editors";

export const metadata: Metadata = { title: "Users · Settings" };

export default function UsersSettingsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <Users />
    </Suspense>
  );
}

async function Users() {
  const users = await getUsers();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <strong className="font-medium text-foreground">Owners</strong> see everything.{" "}
          <strong className="font-medium text-foreground">Employees</strong> only record inbound, production and dispatch, and
          never see amounts.
        </p>
        <NewUserButton />
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
              {u.role === "owner" ? <ShieldCheck className="size-5 text-primary" aria-hidden /> : <UserRound className="size-5" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium">
                {u.name}
                <Pill tone={u.role === "owner" ? "primary" : "muted"}>{u.role === "owner" ? "Owner" : "Employee"}</Pill>
                {!u.active && <Pill tone="danger">Disabled</Pill>}
              </p>
              <p className="text-xs text-muted-foreground">
                @{u.username}
                {u.phone ? ` · ${u.phone}` : ""}
              </p>
            </div>
            <div className="flex">
              <ResetPasswordButton id={u.id} name={u.name} />
              <UserEditor id={u.id} initial={{ name: u.name, phone: u.phone ?? "", role: u.role, active: u.active }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
