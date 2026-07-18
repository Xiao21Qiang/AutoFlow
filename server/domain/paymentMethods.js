const CANONICAL_PAYMENT_METHODS = Object.freeze([
  "Cash",
  "GCash",
  "Maya",
  "Bank Transfer",
  "E-Wallet",
  "Online Transfer",
]);

const PAYMENT_METHOD_ALIASES = Object.freeze({
  cash: "Cash",
  gcash: "GCash",
  "g cash": "GCash",
  maya: "Maya",
  paymaya: "Maya",
  "pay maya": "Maya",
  "bank transfer": "Bank Transfer",
  banktransfer: "Bank Transfer",
  "bank deposit": "Bank Transfer",
  "e wallet": "E-Wallet",
  "e-wallet": "E-Wallet",
  ewallet: "E-Wallet",
  "online transfer": "Online Transfer",
  onlinetransfer: "Online Transfer",
});

function normalizePaymentMethodKey(method) {
  return String(method || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizePaymentMethodLabel(method, fallback = "") {
  const key = normalizePaymentMethodKey(method);
  if (!key) return fallback;
  if (PAYMENT_METHOD_ALIASES[key]) return PAYMENT_METHOD_ALIASES[key];
  const exact = CANONICAL_PAYMENT_METHODS.find((item) => normalizePaymentMethodKey(item) === key);
  return exact || fallback;
}

function isSupportedPaymentMethod(method) {
  return Boolean(normalizePaymentMethodLabel(method, ""));
}

function isCashPaymentMethod(method) {
  return normalizePaymentMethodLabel(method, "") === "Cash";
}

function assertSupportedPaymentMethod(method, label = "Payment method") {
  const normalized = normalizePaymentMethodLabel(method, "");
  if (!normalized) {
    const error = new Error(`${label} is not supported.`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

module.exports = {
  CANONICAL_PAYMENT_METHODS,
  PAYMENT_METHOD_ALIASES,
  assertSupportedPaymentMethod,
  isCashPaymentMethod,
  isSupportedPaymentMethod,
  normalizePaymentMethodLabel,
};
