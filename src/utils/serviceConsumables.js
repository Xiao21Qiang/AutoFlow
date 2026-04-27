import { CAR_SIZE_OPTIONS, PRICE_BY_SIZE_KEYS } from "./servicePricing";

export function createEmptyConsumableSizes() {
  return {
    sedanSmallCar: "",
    midsizePickupMpv: "",
    suv: "",
    xlVanSemiTruck: "",
  };
}

export function normalizeConsumablesBySize(consumablesBySize = {}, legacyConsumables = []) {
  const normalized = {};

  Object.entries(consumablesBySize || {}).forEach(([name, quantities]) => {
    const itemName = String(name || "").trim();
    if (!itemName) return;
    normalized[itemName] = {
      sedanSmallCar: String(quantities?.sedanSmallCar || ""),
      midsizePickupMpv: String(quantities?.midsizePickupMpv || ""),
      suv: String(quantities?.suv || ""),
      xlVanSemiTruck: String(quantities?.xlVanSemiTruck || ""),
    };
  });

  (legacyConsumables || []).forEach((entry) => {
    const raw = String(entry || "").trim();
    if (!raw) return;
    const [rawName, ...rawQuantityParts] = raw.split(":");
    const name = String(rawName || "").trim();
    const quantity = String(rawQuantityParts.join(":") || "1").trim() || "1";
    if (!name || normalized[name]) return;
    normalized[name] = {
      sedanSmallCar: quantity,
      midsizePickupMpv: quantity,
      suv: quantity,
      xlVanSemiTruck: quantity,
    };
  });

  return normalized;
}

export function buildConsumablesBySizePayload(consumablesBySize = {}) {
  const payload = {};

  Object.entries(consumablesBySize || {}).forEach(([name, quantities]) => {
    const itemName = String(name || "").trim();
    if (!itemName) return;
    payload[itemName] = {
      sedanSmallCar: Number(quantities?.sedanSmallCar) || 0,
      midsizePickupMpv: Number(quantities?.midsizePickupMpv) || 0,
      suv: Number(quantities?.suv) || 0,
      xlVanSemiTruck: Number(quantities?.xlVanSemiTruck) || 0,
    };
  });

  return payload;
}

export function formatConsumableSizeLabel(name, quantities) {
  const values = Object.values(quantities || {}).map((value) => Number(value) || 0);
  const unique = [...new Set(values)];
  if (unique.length === 1) {
    return `${name}: ${unique[0] || 0}`;
  }

  return `${name}: S ${Number(quantities?.sedanSmallCar) || 0}, M ${Number(quantities?.midsizePickupMpv) || 0}, SUV ${Number(quantities?.suv) || 0}, XL ${Number(quantities?.xlVanSemiTruck) || 0}`;
}

export function getConsumableQuantityForCarSize(quantities, carSize) {
  const key = PRICE_BY_SIZE_KEYS[carSize] || PRICE_BY_SIZE_KEYS["Sedan / Small Car"];
  return Number(quantities?.[key]) || 0;
}

export { CAR_SIZE_OPTIONS };
