import { PageHeader } from "@/components/common/page-header";
import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" description="Company details, products, raw materials and logins." />
      <SettingsNav />
      {children}
    </>
  );
}
