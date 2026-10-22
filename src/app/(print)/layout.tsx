import { PrintToolbar } from "./print-toolbar";

/** Bare layout for A4 documents: no sidebar or tab bar, always light. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-muted/40 py-4 print:bg-white print:py-0" style={{ colorScheme: "light" }}>
      <PrintToolbar />
      <div className="mx-auto w-full max-w-[210mm] bg-white p-6 text-[13px] text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none md:p-10">
        {children}
      </div>
    </div>
  );
}
