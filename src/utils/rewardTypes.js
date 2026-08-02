export const REWARD_UI_CATEGORIES = Object.freeze(["Voucher", "Item", "Discount", "Service"]);

export const REWARD_CANONICAL_TYPES = Object.freeze([
  "Free Car Wash",
  "Free Microfiber Towel",
  "Percentage Discount",
  "Fixed Discount",
  "Other",
]);

const CANONICAL_TO_UI = Object.freeze({
  "Free Microfiber Towel": "Item",
  "Free Car Wash": "Service",
  "Percentage Discount": "Discount",
  "Fixed Discount": "Discount",
  Other: "Voucher",
  Voucher: "Voucher",
  Item: "Item",
  Discount: "Discount",
  Service: "Service",
});

const UI_TO_CANONICAL = Object.freeze({
  Voucher: "Other",
  Item: "Free Microfiber Towel",
  Discount: "Percentage Discount",
  Service: "Free Car Wash",
});

export function canonicalRewardTypeToUiCategory(type) {
  const raw = String(type || "").trim();
  return CANONICAL_TO_UI[raw] || "";
}

export function uiCategoryToCanonicalRewardType(category, context = {}) {
  const uiCategory = String(category || "").trim();
  const previousCanonicalType = String(context.previousCanonicalType || "").trim();
  const previousUiCategory = canonicalRewardTypeToUiCategory(previousCanonicalType);

  if (
    previousUiCategory &&
    previousUiCategory === uiCategory &&
    REWARD_CANONICAL_TYPES.includes(previousCanonicalType)
  ) {
    return previousCanonicalType;
  }

  return UI_TO_CANONICAL[uiCategory] || "";
}

export function getRewardTypeSearchText(type) {
  const uiCategory = canonicalRewardTypeToUiCategory(type);
  return [type, uiCategory].filter(Boolean).join(" ");
}
