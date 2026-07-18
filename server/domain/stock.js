const { toFiniteNumber } = require("./money");

function normalizeStockQuantity(value) {
  const number = toFiniteNumber(value, 0);
  return Number.isFinite(number) ? number : 0;
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

function validateStockPayload({ currentStock, maxStock, reorderLevel, qtyToAdd = null, existing = {} }) {
  const nextCurrentStock = normalizeStockQuantity(currentStock ?? existing.currentStock);
  const nextMaxStock = normalizeStockQuantity(maxStock ?? existing.maxStock);
  const hasReorderLevel = reorderLevel !== undefined && reorderLevel !== null && String(reorderLevel) !== "";
  const nextReorderLevel = hasReorderLevel
    ? normalizeStockQuantity(reorderLevel)
    : getEffectiveReorderLevel({ ...existing, maxStock: nextMaxStock });

  if (nextCurrentStock < 0) return "Current stock quantity cannot be negative.";
  if (nextMaxStock < 0) return "Max stock quantity cannot be negative.";
  if (nextReorderLevel < 0) return "Reorder level cannot be negative.";
  if (nextMaxStock > 0 && nextReorderLevel > nextMaxStock) return "Reorder level cannot exceed max stock quantity.";

  if (qtyToAdd !== null) {
    const nextQtyToAdd = normalizeStockQuantity(qtyToAdd);
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
  normalizeStockPayload,
  normalizeStockQuantity,
  validateStockPayload,
};
