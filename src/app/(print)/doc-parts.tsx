import type { CompanySettings } from "@/db/schema";

/** Letterhead used on every printed document. */
export function Letterhead({ company, title, meta }: { company: CompanySettings | null; title: string; meta: [string, string][] }) {
  return (
    <header className="flex flex-col gap-4 border-b-2 border-neutral-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xl font-bold tracking-tight">{company?.name ?? "Company name"}</p>
        {company?.tagline && <p className="text-xs text-neutral-600">{company.tagline}</p>}
        {company?.address && <p className="mt-1 max-w-sm text-xs whitespace-pre-line text-neutral-700">{company.address}</p>}
        <p className="mt-1 text-xs text-neutral-700">
          {[company?.phone && `Ph: ${company.phone}`, company?.email].filter(Boolean).join(" · ")}
        </p>
        {company?.gstin && (
          <p className="mt-1 text-xs font-medium">
            GSTIN: {company.gstin}
            {company.stateName ? ` · ${company.stateName}${company.stateCode ? ` (${company.stateCode})` : ""}` : ""}
          </p>
        )}
      </div>
      <div className="sm:text-right">
        <p className="text-lg font-bold tracking-wide uppercase">{title}</p>
        <table className="mt-1 text-xs sm:ml-auto">
          <tbody>
            {meta.map(([k, v]) => (
              <tr key={k}>
                <td className="pr-3 text-neutral-600">{k}</td>
                <td className="text-right font-medium">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </header>
  );
}

export function PartyBlock({
  label,
  name,
  lines,
}: {
  label: string;
  name: string;
  lines: (string | null | undefined)[];
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className="font-semibold">{name}</p>
      {lines.filter(Boolean).map((l, i) => (
        <p key={i} className="text-xs whitespace-pre-line text-neutral-700">
          {l}
        </p>
      ))}
    </div>
  );
}

export function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <div className="mt-12 flex justify-between gap-6 text-xs">
      <div className="w-44 border-t border-neutral-400 pt-1 text-center text-neutral-600">{left}</div>
      <div className="w-44 border-t border-neutral-400 pt-1 text-center text-neutral-600">{right}</div>
    </div>
  );
}
