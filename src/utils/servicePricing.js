export const CAR_SIZE_OPTIONS = [
  "Sedan / Small Car",
  "Midsize / Pickup / MPV",
  "SUV",
  "XL / Van / Semi Truck",
];

export const MOTORCYCLE_CAR_SIZE = "Motorcycle";

export const PRICE_BY_SIZE_KEYS = {
  "Sedan / Small Car": "sedanSmallCar",
  "Midsize / Pickup / MPV": "midsizePickupMpv",
  SUV: "suv",
  "XL / Van / Semi Truck": "xlVanSemiTruck",
};

const STANDARD_PRICE_KEYS = CAR_SIZE_OPTIONS.map((size) => PRICE_BY_SIZE_KEYS[size]);
const PRICE_BY_SIZE_DEFAULTS = {
  sedanSmallCar: 0,
  midsizePickupMpv: 0,
  suv: 0,
  xlVanSemiTruck: 0,
};

export function normalizeServiceName(value = "") {
  return String(value?.name || value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function isMotorCoatingService(service = {}) {
  return normalizeServiceName(service) === "motor coating";
}

export function getServiceCarSizeOptions(service = {}) {
  if (isMotorCoatingService(service)) return [MOTORCYCLE_CAR_SIZE];
  return CAR_SIZE_OPTIONS;
}

export function createEmptyPriceBySize() {
  return { ...PRICE_BY_SIZE_DEFAULTS };
}

export function normalizeCarSizeLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "sedan / small car" || raw === "sedan" || raw === "small car") return "Sedan / Small Car";
  if (raw === "midsize / pickup / mpv" || raw === "midsize" || raw === "pickup" || raw === "mpv") {
    return "Midsize / Pickup / MPV";
  }
  if (raw === "suv") return "SUV";
  if (raw === "xl / van / semi truck" || raw === "xl" || raw === "van" || raw === "semi truck") {
    return "XL / Van / Semi Truck";
  }
  if (raw === "motorcycle" || raw === "motor bike" || raw === "motorbike") return MOTORCYCLE_CAR_SIZE;
  return "";
}

export function getServicePriceBySize(service) {
  const fallbackPrice = Math.max(0, Number(service?.price || 0));
  const source = service?.priceBySize || {};
  const normalized = { ...PRICE_BY_SIZE_DEFAULTS };

  STANDARD_PRICE_KEYS.forEach((key) => {
    const value = Math.max(0, Number(source[key]));
    normalized[key] = Number.isFinite(value) && value > 0 ? value : fallbackPrice;
  });
  return normalized;
}

export function getPriceForCarSize(service, carSize) {
  if (isMotorCoatingService(service)) return Math.max(0, Number(service?.price || 0));

  const normalizedSize = normalizeCarSizeLabel(carSize);
  const priceBySize = getServicePriceBySize(service);
  if (normalizedSize === MOTORCYCLE_CAR_SIZE) return 0;

  const exactKey = PRICE_BY_SIZE_KEYS[normalizedSize];
  if (exactKey) return Math.max(0, Number(priceBySize[exactKey] || 0));

  const prices = STANDARD_PRICE_KEYS.map((key) => priceBySize[key]).filter((value) => Number(value) > 0);
  return prices.length ? Math.min(...prices) : Math.max(0, Number(service?.price || 0));
}

export function getServicePriceRange(service) {
  if (isMotorCoatingService(service)) {
    const fixedPrice = Math.max(0, Number(service?.price || 0));
    return { min: fixedPrice, max: fixedPrice };
  }

  const priceBySize = getServicePriceBySize(service);
  const prices = STANDARD_PRICE_KEYS.map((key) => priceBySize[key]).filter((value) => Number(value) > 0);
  if (!prices.length) return { min: 0, max: 0 };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function formatPriceRangeLabel(service) {
  const { min, max } = getServicePriceRange(service);
  if (!max) return "P 0";
  if (min === max) return `P ${min.toLocaleString()}`;
  return `P ${min.toLocaleString()} - P ${max.toLocaleString()}`;
}
