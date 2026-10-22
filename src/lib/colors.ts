/** Fixed colours so a product/material looks the same in every list and chart. */
const MATERIAL: Record<string, string> = {
  FLYASH: "var(--mat-flyash)",
  CEMENT: "var(--mat-cement)",
  MSAND: "var(--mat-msand)",
};
const PRODUCT: Record<string, string> = {
  FLYASH: "var(--prod-flyash)",
  SOLID: "var(--prod-solid)",
};
const FALLBACK = ["var(--chart-3)", "var(--chart-5)", "var(--chart-4)", "var(--chart-1)", "var(--chart-2)"];

export function materialColor(code: string, index = 0): string {
  return MATERIAL[code] ?? FALLBACK[index % FALLBACK.length];
}

export function productColor(code: string, index = 0): string {
  return PRODUCT[code] ?? FALLBACK[index % FALLBACK.length];
}
