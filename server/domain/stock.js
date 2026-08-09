const { toFiniteNumber } = require("./money");

const RESTOCK_UNIT_COST_ERROR = "Unit Cost must be greater than zero.";

function normalizeStockQuantity(value) {
  const number = toFiniteNumber(value, 0);
  return Number.isFinite(number) ? number : 0;
}

function parseStockQuantityForValidation(value, label, { required = false } = {}) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) {
    return required
      ? { valid: false, message: `${label} is required.`, value: 0 }
      : { valid: true, message: "", value: 0 };
  }

  const number = Number(rawValue);
  if (!Number.isFinite(number)) {
    return { valid: false, message: `${label} must be a valid number.`, value: 0 };
  }
  if (number < 0) {
    return { valid: false, message: `${label} cannot be negative.`, value: number };
  }

  return { valid: true, message: "", value: number };
}

function normalizeRestockUnitCost(value) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return NaN;

  const number = Number(rawValue);
  return Number.isFinite(number) ? number : NaN;
}

function validateRestockUnitCost(value) {
  const number = normalizeRestockUnitCost(value);
  if (!Number.isFinite(number) || number <= 0) return RESTOCK_UNIT_COST_ERROR;
  return "";
}

function deriveFallbackReorderLevel(maxStock) {
  const safeMax = Math.max(0, normalizeStockQuantity(maxStock));
  if (safeMax <= 0) return 0;
  return Math.min(safeMax, Math.max(1, Math.ceil(safeMax * 0.25)));
}

function getEffectiveReorderLevel(item = {}) {
  const raw = Number(item.reorderLevel);
  if (Number.isFinite(raw)) return Math.max(0, raw);
  return deriveFallbackReorderLevel(item.maxStock);
}

function getStockStatus(item = {}) {
  const currentStock = Math.max(0, normalizeStockQuantity(item.currentStock));
  const maxStock = Math.max(0, normalizeStockQuantity(item.maxStock));
  const reorderLevel = getEffectiveReorderLevel(item);

  if (currentStock <= 0) {
    return { key: "out", label: "Out of Stock", tone: "danger", currentStock, maxStock, reorderLevel };
  }
  if (reorderLevel <= 0 || currentStock > reorderLevel) {
    return { key: "healthy", label: "Healthy", tone: "healthy", currentStock, maxStock, reorderLevel };
  }
  if (currentStock <= reorderLevel * 0.5) {
    return { key: "critical", label: "Critical", tone: "danger", currentStock, maxStock, reorderLevel };
  }
  return { key: "low", label: "Low", tone: "warning", currentStock, maxStock, reorderLevel };
}

function getStockPercent(item = {}) {
  const maxStock = Math.max(0, normalizeStockQuantity(item.maxStock));
  if (maxStock <= 0) return 0;
  const currentStock = Math.max(0, normalizeStockQuantity(item.currentStock));
  return Math.max(0, Math.min(100, Math.round((currentStock / maxStock) * 100)));
}

function validateStockPayload({ currentStock, maxStock, reorderLevel, qtyToAdd = null, existing = {}, requireFields = false }) {
  const currentStockCheck = parseStockQuantityForValidation(currentStock ?? existing.currentStock, "Current stock quantity", {
    required: requireFields,
  });
  if (!currentStockCheck.valid) return currentStockCheck.message;

  const maxStockCheck = parseStockQuantityForValidation(maxStock ?? existing.maxStock, "Max stock quantity", {
    required: requireFields,
  });
  if (!maxStockCheck.valid) return maxStockCheck.message;

  const hasReorderLevel = reorderLevel !== undefined && reorderLevel !== null && String(reorderLevel) !== "";
  const reorderLevelCheck = hasReorderLevel || requireFields
    ? parseStockQuantityForValidation(reorderLevel, "Reorder level", { required: requireFields })
    : { valid: true, message: "", value: getEffectiveReorderLevel({ ...existing, maxStock: maxStockCheck.value }) };
  if (!reorderLevelCheck.valid) return reorderLevelCheck.message;

  const nextCurrentStock = currentStockCheck.value;
  const nextMaxStock = maxStockCheck.value;
  const nextReorderLevel = hasReorderLevel || requireFields
    ? reorderLevelCheck.value
    : getEffectiveReorderLevel({ ...existing, maxStock: nextMaxStock });

  if (nextCurrentStock < 0) return "Current stock quantity cannot be negative.";
  if (nextMaxStock < 0) return "Max stock quantity cannot be negative.";
  if (nextReorderLevel < 0) return "Reorder level cannot be negative.";
  if (nextMaxStock > 0 && nextReorderLevel > nextMaxStock) return "Reorder level cannot exceed max stock quantity.";

  if (qtyToAdd !== null) {
    const qtyToAddCheck = parseStockQuantityForValidation(qtyToAdd, "Restock quantity", { required: true });
    if (!qtyToAddCheck.valid) return qtyToAddCheck.message;
    const nextQtyToAdd = qtyToAddCheck.value;
    if (nextQtyToAdd <= 0) return "Restock quantity must be greater than zero.";
    if (nextMaxStock > 0 && nextCurrentStock + nextQtyToAdd > nextMaxStock) {
      return `This restock would exceed the max stock quantity of ${nextMaxStock}.`;
    }
    return "";
  }

  if (nextMaxStock > 0 && nextCurrentStock > nextMaxStock) {
    return `Current stock quantity cannot exceed the max stock quantity of ${nextMaxStock}.`;
  }

  return "";
}

function normalizeStockPayload(payload = {}, existing = {}) {
  const next = { ...payload };
  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    next.name = String(payload.name || "").trim().replace(/\s+/g, " ");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "category")) {
    next.category = String(payload.category || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(payload, "currentStock")) {
    next.currentStock = normalizeStockQuantity(payload.currentStock);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "maxStock")) {
    next.maxStock = normalizeStockQuantity(payload.maxStock);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "reorderLevel")) {
    next.reorderLevel = normalizeStockQuantity(payload.reorderLevel);
  } else if (!Object.prototype.hasOwnProperty.call(existing, "reorderLevel") && Object.prototype.hasOwnProperty.call(payload, "maxStock")) {
    next.reorderLevel = deriveFallbackReorderLevel(next.maxStock);
  }
  return next;
}

module.exports = {
  deriveFallbackReorderLevel,
  getEffectiveReorderLevel,
  getStockPercent,
  getStockStatus,
  normalizeRestockUnitCost,
  normalizeStockPayload,
  normalizeStockQuantity,
  parseStockQuantityForValidation,
  validateRestockUnitCost,
  validateStockPayload,
};
