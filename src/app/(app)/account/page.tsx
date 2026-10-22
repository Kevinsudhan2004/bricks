import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "My account" };

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Change password" description="Use at least 8 characters. Don't share your login." />
      <PasswordForm />
    </div>
  );
}
