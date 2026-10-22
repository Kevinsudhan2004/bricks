import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getCurrentUser, homeFor } from "@/lib/auth";

/** "/" sends owners to the dashboard and employees to their entry home. */
export default function RootPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-label="Loading" />
        </div>
      }
    >
      <RedirectHome />
    </Suspense>
  );
}

async function RedirectHome(): Promise<null> {
  const user = await getCurrentUser();
  redirect(homeFor(user.role));
}
