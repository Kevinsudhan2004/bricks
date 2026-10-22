import { AppShell } from "@/components/layout/app-shell";
import { UserProvider } from "@/components/layout/user-provider";
import { getCurrentUser } from "@/lib/auth";
import { getCompanyBrand } from "@/server/queries/masters";

/**
 * The shell (sidebar, top bar, bottom tabs) renders immediately; the parts that
 * depend on who is signed in resolve from `userPromise` behind their own Suspense boundaries.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const userPromise = getCurrentUser();
  const brandPromise = getCompanyBrand();
  return (
    <UserProvider userPromise={userPromise}>
      <AppShell brandPromise={brandPromise}>{children}</AppShell>
    </UserProvider>
  );
}
