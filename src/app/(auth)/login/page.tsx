import type { Metadata } from "next";
import { Suspense } from "react";
import { BrickWall } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {/* subtle brick-course background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05] dark:opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
          backgroundSize: "64px 28px",
        }}
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <BrickWall className="size-7" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Brick CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to record today&apos;s work</p>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Forgot your password? Ask the owner to reset it in Settings → Users.
        </p>
      </div>
    </main>
  );
}
