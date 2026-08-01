export const RESTOCK_QUANTITY_ERROR = "Restock quantity must be greater than zero.";
export const RESTOCK_UNIT_COST_ERROR = "Unit Cost must be greater than zero.";

export function parsePositiveFiniteNumber(value) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) {
    return { valid: false, value: 0 };
  }

  const number = Number(rawValue);
  if (!Number.isFinite(number) || number <= 0) {
    return { valid: false, value: 0 };
  }

  return { valid: true, value: number };
}

export function getRestockFieldErrors(form = {}) {
  return {
    qtyToAdd: parsePositiveFiniteNumber(form.qtyToAdd).valid ? "" : RESTOCK_QUANTITY_ERROR,
    costPerUnit: parsePositiveFiniteNumber(form.costPerUnit).valid ? "" : RESTOCK_UNIT_COST_ERROR,
  };
}

export function isRestockFormReady(form = {}) {
  const errors = getRestockFieldErrors(form);
  return !errors.qtyToAdd && !errors.costPerUnit;
}
