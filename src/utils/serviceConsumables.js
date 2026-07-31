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

  const legacyList = Array.isArray(legacyConsumables) ? legacyConsumables : [];
  legacyList.forEach((entry) => {
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

export function normalizeConsumableNameKey(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeConsumableDisplayName(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function findConsumableEntryKey(consumablesBySize = {}, itemName = "") {
  const requestedKey = normalizeConsumableNameKey(itemName);
  if (!requestedKey) return "";
  return Object.keys(consumablesBySize || {}).find((name) => normalizeConsumableNameKey(name) === requestedKey) || "";
}

export function getStockConsumableKey(item = {}) {
  const id = String(item?.id || item?._id || "").trim();
  if (id) return `id:${id}`;
  const nameKey = normalizeConsumableNameKey(item?.name);
  return nameKey ? `name:${nameKey}` : "";
}

export function getConsumableSelectionKeyForName(name = "", stockItems = []) {
  const nameKey = normalizeConsumableNameKey(name);
  if (!nameKey) return "";
  const stockItem = stockItems.find((item) => normalizeConsumableNameKey(item?.name) === nameKey);
  return stockItem ? getStockConsumableKey(stockItem) : `name:${nameKey}`;
}

function hasPositiveConsumableQuantity(quantities = {}) {
  return Object.values(PRICE_BY_SIZE_KEYS).some((key) => Number(quantities?.[key] || 0) > 0);
}

export function createSelectedConsumableKeys(consumablesBySize = {}, stockItems = []) {
  const stockNameKeys = new Set(stockItems.map((item) => normalizeConsumableNameKey(item?.name)).filter(Boolean));
  return Object.entries(consumablesBySize || {})
    .filter(([name, quantities]) => {
      const nameKey = normalizeConsumableNameKey(name);
      return nameKey && stockNameKeys.has(nameKey) && hasPositiveConsumableQuantity(quantities);
    })
    .map(([name]) => getConsumableSelectionKeyForName(name, stockItems))
    .filter(Boolean);
}

export function filterConsumablesBySelectedKeys(consumablesBySize = {}, selectedKeys = [], stockItems = []) {
  const selectedSet = new Set(selectedKeys);
  const payload = {};

  Object.entries(consumablesBySize || {}).forEach(([name, quantities]) => {
    const selectionKey = getConsumableSelectionKeyForName(name, stockItems);
    if (!selectionKey || !selectedSet.has(selectionKey)) return;
    const itemName = normalizeConsumableDisplayName(name);
    if (!itemName) return;
    payload[itemName] = quantities || createEmptyConsumableSizes();
  });

  return payload;
}

export function alignConsumablesToStockItems(consumablesBySize = {}, stockItems = []) {
  const stockNameByKey = new Map(
    stockItems
      .map((item) => normalizeConsumableDisplayName(item?.name))
      .filter(Boolean)
      .map((name) => [normalizeConsumableNameKey(name), name])
  );
  const aligned = {};

  Object.entries(consumablesBySize || {}).forEach(([name, quantities]) => {
    const normalizedKey = normalizeConsumableNameKey(name);
    if (!normalizedKey) return;
    const canonicalName = stockNameByKey.get(normalizedKey) || normalizeConsumableDisplayName(name);
    if (!canonicalName) return;
    aligned[canonicalName] = {
      ...(aligned[canonicalName] || createEmptyConsumableSizes()),
      sedanSmallCar: String(quantities?.sedanSmallCar || aligned[canonicalName]?.sedanSmallCar || ""),
      midsizePickupMpv: String(quantities?.midsizePickupMpv || aligned[canonicalName]?.midsizePickupMpv || ""),
      suv: String(quantities?.suv || aligned[canonicalName]?.suv || ""),
      xlVanSemiTruck: String(quantities?.xlVanSemiTruck || aligned[canonicalName]?.xlVanSemiTruck || ""),
    };
  });

  return aligned;
}

export function buildConsumablesBySizePayload(consumablesBySize = {}) {
  const payload = {};

  Object.entries(consumablesBySize || {}).forEach(([name, quantities]) => {
    const itemName = normalizeConsumableDisplayName(name);
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
