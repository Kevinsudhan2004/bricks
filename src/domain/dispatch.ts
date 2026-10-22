export type DispatchLine = { productId: number; quantity: number };

/**
 * A dispatch may not send more of a product than is still pending on the invoice.
 * Returns per-product errors (empty when valid) and a form-level error.
 */
export function validateDispatch(
  pending: Map<number, number>,
  lines: DispatchLine[],
  productName: (id: number) => string = (id) => `Product ${id}`,
): { errors: Map<number, string>; formError: string | null } {
  const errors = new Map<number, string>();
  const positive = lines.filter((l) => l.quantity > 0);
  if (positive.length === 0) {
    return { errors, formError: "Enter the quantity for at least one product." };
  }
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 0) {
      errors.set(line.productId, "Enter a whole number.");
      continue;
    }
    if (line.quantity === 0) continue;
    const left = pending.get(line.productId);
    if (left === undefined) {
      errors.set(line.productId, `${productName(line.productId)} is not on this invoice.`);
    } else if (line.quantity > left) {
      errors.set(line.productId, `Only ${left.toLocaleString("en-IN")} pending for ${productName(line.productId)}.`);
    }
  }
  return { errors, formError: null };
}
