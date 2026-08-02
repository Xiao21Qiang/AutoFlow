const bookingDomain = require("./bookingStatus");
const paymentDomain = require("./payments");
const { nonNegativeMoney, roundMoney, toFiniteNumber } = require("./money");

const REVIEW_STATUSES = Object.freeze(["Pending", "Published", "Hidden", "Archived"]);
const ACTIVE_REVIEW_STATUSES = new Set(["Pending", "Published", "Hidden"]);
const PROMOTION_DISCOUNT_TYPES = Object.freeze(["Percentage", "Fixed"]);
const PROMOTION_STATUSES = Object.freeze(["Draft", "Active", "Expired", "Archived"]);
const REWARD_RARITIES = Object.freeze(["Common", "Uncommon", "Rare", "Epic"]);
const REWARD_STATUSES = Object.freeze(["Available", "Claimed", "Reserved", "Used", "Expired", "Released", "Cancelled"]);
const REWARD_MILESTONE_SIZE = 3;

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hasOwnInput(source = {}, field) {
  return Object.prototype.hasOwnProperty.call(source, field);
}

function isBlankInput(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function assertPlainTextInput(value, label) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value) || (typeof value === "object" && !(value instanceof Date))) {
    throw createValidationError(`${label} is invalid.`);
  }
}

function parseRequiredPositiveNumber(value, requiredMessage, invalidMessage) {
  if (isBlankInput(value)) {
    throw createValidationError(requiredMessage);
  }
  const numeric = Number(String(value).trim());
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw createValidationError(invalidMessage);
  }
  return numeric;
}

function parsePositiveWholeNumber(value, requiredMessage, invalidMessage) {
  const numeric = parseRequiredPositiveNumber(value, requiredMessage, invalidMessage);
  if (!Number.isInteger(numeric)) {
    throw createValidationError(invalidMessage);
  }
  return numeric;
}

function createValidationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function assertValidObjectIdLike(value, label) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "";
  if (!/^[A-Za-z0-9:_-]{1,80}$/.test(normalized)) {
    throw createValidationError(`${label} is invalid.`);
  }
  return normalized;
}

function normalizeReviewStatus(status, fallback = "Pending") {
  const normalized = normalizeWhitespace(status).toLowerCase();
  if (normalized === "published" || normalized === "approved" || normalized === "public") return "Published";
  if (normalized === "hidden" || normalized === "unpublished") return "Hidden";
  if (normalized === "archived" || normalized === "deleted" || normalized === "withdrawn") return "Archived";
  if (normalized === "pending" || normalized === "submitted" || !normalized) return fallback;
  return fallback;
}

function validateReviewInput({ rating, comment } = {}) {
  const numericRating = Number(rating);
  if (!Number.isFinite(numericRating) || !Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    throw createValidationError("Rating must be a whole number from 1 to 5.");
  }
  const normalizedComment = normalizeWhitespace(comment);
  if (normalizedComment.length < 3) {
    throw createValidationError("Review comment must be at least 3 characters.");
  }
  if (normalizedComment.length > 1000) {
    throw createValidationError("Review comment must be 1000 characters or less.");
  }
  return { rating: numericRating, comment: normalizedComment };
}

function customerOwnsBooking(customer = {}, booking = {}) {
  const customerId = normalizeWhitespace(customer.id);
  const customerEmail = normalizeWhitespace(customer.email).toLowerCase();
  const bookingCustomerId = normalizeWhitespace(booking.customerId);
  const bookingEmail = normalizeWhitespace(booking.customerEmail).toLowerCase();
  return Boolean(
    (customerId && bookingCustomerId && customerId === bookingCustomerId) ||
    (customerEmail && bookingEmail && customerEmail === bookingEmail)
  );
}

function isActiveReview(review = {}) {
  return ACTIVE_REVIEW_STATUSES.has(normalizeReviewStatus(review.status, "Published"));
}

function evaluateReviewEligibility({ booking, payment, existingReview, customer } = {}) {
  if (!booking) return { eligible: false, reason: "Booking was not found." };
  if (!customerOwnsBooking(customer, booking)) return { eligible: false, reason: "You can only review your own bookings." };
  if (!bookingDomain.isCompletedBookingStatus(booking.status)) {
    return { eligible: false, reason: "Only completed bookings can be reviewed." };
  }
  if (!payment || !paymentDomain.isPaymentFullyPaid(payment, booking)) {
    return { eligible: false, reason: "Only fully paid bookings can be reviewed." };
  }
  if (existingReview && isActiveReview(existingReview)) {
    return { eligible: false, reason: "This booking already has a review." };
  }
  return { eligible: true, reason: "" };
}

function normalizePromotionCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
}

function normalizePromotionStatus(value, fallback = "Draft") {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (normalized === "active" || normalized === "enabled") return "Active";
  if (normalized === "expired") return "Expired";
  if (normalized === "archived") return "Archived";
  if (normalized === "draft" || normalized === "disabled" || !normalized) return fallback;
  return fallback;
}

function normalizeDiscountType(value, fallback = "") {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (normalized === "percentage" || normalized === "percent") return "Percentage";
  if (normalized === "fixed" || normalized === "amount" || normalized === "fixed value") return "Fixed";
  return fallback;
}

function parseDateTime(value, endOfDay = false) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = raw.length === 10
    ? new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function normalizeServiceIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => assertValidObjectIdLike(item, "Service")).filter(Boolean))];
}

function normalizePromotionPayload(body = {}, existing = {}) {
  const titleSource = body.title ?? body.name ?? existing.title ?? existing.name;
  const codeSource = hasOwnInput(body, "code") ? body.code : existing.code;
  const descriptionSource = body.message ?? body.description ?? existing.message ?? existing.description;
  assertPlainTextInput(titleSource, "Promotion title");
  assertPlainTextInput(codeSource, "Promotion code");
  assertPlainTextInput(descriptionSource, "Promotion message");
  const title = normalizeWhitespace(titleSource);
  const code = normalizePromotionCode(codeSource);
  const description = normalizeWhitespace(descriptionSource);
  const legacyPercent = body.discountPercent ?? existing.discountPercent;
  const discountType = normalizeDiscountType(body.discountType ?? existing.discountType, Number(legacyPercent || 0) > 0 ? "Percentage" : "");
  const discountValue = parseRequiredPositiveNumber(
    body.discountValue ?? existing.discountValue ?? legacyPercent,
    "Promotion discount value is required.",
    "Promotion discount value must be greater than zero."
  );
  const startAt = parseDateTime(body.startAt ?? body.scheduledFor ?? existing.startAt ?? existing.scheduledFor, false);
  const endAt = parseDateTime(body.endAt ?? body.expiresAt ?? existing.endAt ?? existing.expiresAt, true);
  const enabled = typeof body.enabled === "boolean"
    ? body.enabled
    : normalizePromotionStatus(body.status ?? existing.status, existing.status || "Draft") === "Active";
  const archived = typeof body.archived === "boolean"
    ? body.archived
    : normalizePromotionStatus(body.status ?? existing.status, existing.status || "Draft") === "Archived" || existing.archived === true;
  const status = archived ? "Archived" : enabled ? "Active" : normalizePromotionStatus(body.status ?? existing.status, "Draft");
  const usageLimitRaw = body.usageLimit ?? existing.usageLimit;
  const usageLimit = usageLimitRaw === "" || usageLimitRaw === null || usageLimitRaw === undefined ? 0 : toFiniteNumber(usageLimitRaw, NaN);
  const usageCount = Math.max(0, toFiniteNumber(existing.usageCount ?? body.usageCount, 0));
  const maxUsagePerUser = parsePositiveWholeNumber(
    body.maxUsagePerUser ?? existing.maxUsagePerUser,
    "Max usage per user is required.",
    "Max usage per user must be a positive whole number."
  );
  const applicableServiceIds = normalizeServiceIdList(body.applicableServiceIds ?? existing.applicableServiceIds);
  const requestedExpiryMode = String(body.expiryMode ?? existing.expiryMode ?? "").trim().toLowerCase();

  if (!title) throw createValidationError("Promotion name is required.");
  if (!code) throw createValidationError("Promotion code is required.");
  if (!PROMOTION_DISCOUNT_TYPES.includes(discountType)) throw createValidationError("Promotion discount type must be Percentage or Fixed.");
  if (!Number.isFinite(discountValue) || discountValue <= 0) throw createValidationError("Promotion discount value must be greater than zero.");
  if (discountType === "Percentage" && discountValue > 100) throw createValidationError("Percentage promotions cannot exceed 100%.");
  if (!Number.isFinite(usageLimit) || usageLimit < 0) throw createValidationError("Promotion usage limit cannot be negative.");
  if (requestedExpiryMode === "date" && !endAt) throw createValidationError("Promotion expiry date is required.");
  if (requestedExpiryMode === "usage" && (!Number.isFinite(usageLimit) || usageLimit <= 0)) {
    throw createValidationError("Promotion usage limit must be greater than zero.");
  }
  if (usageLimit > 0 && usageCount > usageLimit) throw createValidationError("Promotion usage count cannot exceed the usage limit.");
  if (startAt && endAt && new Date(endAt).getTime() < new Date(startAt).getTime()) {
    throw createValidationError("Promotion end date cannot be before the start date.");
  }

  return {
    title,
    name: title,
    code,
    description,
    message: description,
    status,
    enabled: status === "Active",
    archived,
    startAt,
    endAt,
    scheduledFor: startAt,
    expiresAt: endAt,
    usageLimit,
    usageCount,
    maxUsagePerUser,
    discountType,
    discountValue: roundMoney(discountValue),
    discountPercent: discountType === "Percentage" ? roundMoney(discountValue) : 0,
    applicableServiceIds,
  };
}

function hydratePromotion(promo = {}, now = new Date()) {
  const source = promo?.toObject ? promo.toObject() : { ...(promo || {}) };
  const discountType = normalizeDiscountType(source.discountType, Number(source.discountPercent || 0) > 0 ? "Percentage" : "Fixed");
  const discountValue = discountType === "Percentage"
    ? toFiniteNumber(source.discountValue ?? source.discountPercent, 0)
    : toFiniteNumber(source.discountValue ?? 0, 0);
  const statusFromSource = normalizePromotionStatus(source.status, "Draft");
  const archived = Boolean(source.archived) || statusFromSource === "Archived";
  const enabled = statusFromSource === "Active" ? true : source.enabled !== undefined ? Boolean(source.enabled) : false;
  const startAt = parseDateTime(source.startAt || source.scheduledFor, false);
  const endAt = parseDateTime(source.endAt || source.expiresAt, true);
  const usageLimit = Math.max(0, toFiniteNumber(source.usageLimit, 0));
  const usageCount = Math.max(0, toFiniteNumber(source.usageCount, 0));
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const future = Boolean(startAt && new Date(startAt).getTime() > nowMs);
  const expiredByDate = Boolean(endAt && new Date(endAt).getTime() < nowMs);
  const exhausted = usageLimit > 0 && usageCount >= usageLimit;
  const status = archived
    ? "Archived"
    : statusFromSource === "Expired"
      ? "Expired"
    : !enabled
      ? "Draft"
      : expiredByDate || exhausted
        ? "Expired"
        : "Active";
  return {
    ...source,
    title: source.title || source.name || "",
    name: source.name || source.title || "",
    code: normalizePromotionCode(source.code || source.title || source.name),
    message: source.message || source.description || "",
    description: source.description || source.message || "",
    status,
    enabled,
    archived,
    discountType,
    discountValue: roundMoney(discountValue),
    discountPercent: discountType === "Percentage" ? roundMoney(discountValue) : 0,
    startAt,
    endAt,
    scheduledFor: startAt,
    expiresAt: endAt,
    usageLimit,
    usageCount,
    remainingUses: usageLimit > 0 ? Math.max(0, usageLimit - usageCount) : null,
    applicableServiceIds: normalizeServiceIdList(source.applicableServiceIds),
    isFuture: future,
    isExpired: status === "Expired",
    isExhausted: exhausted,
  };
}

function isPromotionApplicableToService(promo = {}, service = {}) {
  const serviceIds = normalizeServiceIdList(promo.applicableServiceIds);
  if (!serviceIds.length) return true;
  const candidates = [service.id, service._id, service.serviceId]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return candidates.some((candidate) => serviceIds.includes(candidate));
}

function evaluatePromotionEligibility({ promo, service = {}, now = new Date() } = {}) {
  const hydrated = hydratePromotion(promo, now);
  if (!hydrated.id && !hydrated.code) return { eligible: false, reason: "Promotion was not found.", promo: hydrated };
  if (hydrated.archived) return { eligible: false, reason: "Promotion is archived.", promo: hydrated };
  if (!hydrated.enabled || hydrated.status !== "Active") return { eligible: false, reason: "Promotion is not active.", promo: hydrated };
  if (hydrated.isFuture) return { eligible: false, reason: "Promotion is not active yet.", promo: hydrated };
  if (hydrated.isExpired) return { eligible: false, reason: "Promotion has expired.", promo: hydrated };
  if (hydrated.isExhausted) return { eligible: false, reason: "Promotion usage limit has been reached.", promo: hydrated };
  if (!isPromotionApplicableToService(hydrated, service)) return { eligible: false, reason: "Promotion is not eligible for this service.", promo: hydrated };
  return { eligible: true, reason: "", promo: hydrated };
}

function calculatePromotionDiscount(amount, promo = {}) {
  const baseAmount = nonNegativeMoney(amount);
  const hydrated = hydratePromotion(promo);
  const discount = hydrated.discountType === "Percentage"
    ? roundMoney((baseAmount * hydrated.discountValue) / 100)
    : roundMoney(hydrated.discountValue);
  const discountAmount = Math.min(baseAmount, nonNegativeMoney(discount));
  return {
    originalAmount: baseAmount,
    promoId: hydrated.id || "",
    promoTitle: hydrated.title || hydrated.name || "",
    promoCode: hydrated.code || "",
    promoDiscountType: hydrated.discountType,
    promoDiscountValue: roundMoney(hydrated.discountValue),
    promoDiscountPercent: hydrated.discountType === "Percentage" ? roundMoney(hydrated.discountValue) : 0,
    promoDiscountAmount: discountAmount,
    amount: nonNegativeMoney(baseAmount - discountAmount),
  };
}

function normalizeRarity(value, fallback = "Common") {
  const raw = normalizeWhitespace(value).toLowerCase();
  const found = REWARD_RARITIES.find((rarity) => rarity.toLowerCase() === raw);
  return found || fallback;
}

function normalizeRewardStatus(status, fallback = "Available") {
  const raw = normalizeWhitespace(status).toLowerCase();
  if (["available", "unused", "granted"].includes(raw) || !raw) return fallback;
  if (raw === "claimed") return "Claimed";
  if (raw === "reserved") return "Reserved";
  if (["used", "redeemed"].includes(raw)) return "Used";
  if (raw === "expired") return "Expired";
  if (raw === "released") return "Released";
  if (["cancelled", "canceled"].includes(raw)) return "Cancelled";
  return fallback;
}

function normalizeRewardType(value, fallback = "Other") {
  const raw = normalizeWhitespace(value).toLowerCase();
  if (raw === "free car wash" || raw === "service") return "Free Car Wash";
  if (raw === "free microfiber towel" || raw === "item") return "Free Microfiber Towel";
  if (raw === "percentage discount" || raw === "discount percentage") return "Percentage Discount";
  if (raw === "fixed discount" || raw === "discount fixed") return "Fixed Discount";
  if (raw === "discount") return "Percentage Discount";
  if (raw === "voucher") return "Other";
  return normalizeWhitespace(value) || fallback;
}

function normalizeRewardDefinitionPayload(body = {}, existing = {}) {
  const name = normalizeWhitespace(body.name ?? existing.name);
  const code = normalizePromotionCode(body.code ?? existing.code ?? name);
  const type = normalizeRewardType(body.rewardType ?? body.type ?? existing.rewardType ?? existing.type, "Other");
  const description = normalizeWhitespace(body.description ?? existing.description);
  const rawDiscountType = body.discountType ?? existing.discountType;
  const inferredDiscountType = type === "Percentage Discount" ? "Percentage" : type === "Fixed Discount" ? "Fixed" : "";
  const discountType = normalizeDiscountType(rawDiscountType, inferredDiscountType);
  const legacyValue = body.value ?? existing.value;
  const discountValue = toFiniteNumber(body.discountValue ?? existing.discountValue ?? extractLegacyRewardNumericValue(legacyValue), 0);
  const rarity = normalizeRarity(body.rarity ?? existing.rarity);
  const weight = toFiniteNumber(body.weight ?? existing.weight ?? 10, NaN);
  const quantity = toFiniteNumber(body.quantity ?? body.stock ?? existing.quantity ?? existing.stock ?? 0, NaN);
  const enabled = typeof body.enabled === "boolean" ? body.enabled : typeof body.active === "boolean" ? body.active : Boolean(existing.enabled ?? existing.active ?? true);
  const archived = typeof body.archived === "boolean" ? body.archived : Boolean(existing.archived);
  const expirationDays = toFiniteNumber(body.expirationDays ?? existing.expirationDays ?? 30, NaN);
  const applicableServiceIds = normalizeServiceIdList(body.applicableServiceIds ?? existing.applicableServiceIds);

  if (!name) throw createValidationError("Reward name is required.");
  if (!code) throw createValidationError("Reward code is required.");
  if (!Number.isFinite(weight) || weight <= 0) throw createValidationError("Reward weight must be greater than zero.");
  if (!Number.isFinite(quantity) || quantity < 0) throw createValidationError("Reward quantity cannot be negative.");
  if (!Number.isFinite(expirationDays) || expirationDays < 0) throw createValidationError("Reward expiration days cannot be negative.");
  if (discountType === "Percentage" && (discountValue <= 0 || discountValue > 100)) {
    throw createValidationError("Percentage rewards must be greater than zero and at most 100.");
  }
  if (discountType === "Fixed" && discountValue <= 0) {
    throw createValidationError("Fixed rewards must be greater than zero.");
  }

  return {
    name,
    code,
    type,
    rewardType: type,
    description,
    value: legacyValue || (discountType === "Percentage" ? `${discountValue}% Discount` : discountType === "Fixed" ? `P ${discountValue} Discount` : type),
    discountType,
    discountValue: roundMoney(discountValue),
    rarity,
    weight: roundMoney(weight),
    quantity,
    stock: quantity,
    enabled,
    active: enabled,
    archived,
    expirationDays,
    applicableServiceIds,
  };
}

function extractLegacyRewardNumericValue(value) {
  const raw = String(value || "").replace(/,/g, "");
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function hydrateRewardDefinition(reward = {}) {
  const source = reward?.toObject ? reward.toObject() : { ...(reward || {}) };
  const type = normalizeRewardType(source.rewardType || source.type, "Other");
  const inferredDiscountType = type === "Percentage Discount" ? "Percentage" : type === "Fixed Discount" ? "Fixed" : "";
  const discountType = normalizeDiscountType(source.discountType, inferredDiscountType);
  const quantity = Math.max(0, toFiniteNumber(source.quantity ?? source.stock, 0));
  return {
    ...source,
    code: normalizePromotionCode(source.code || source.name),
    type,
    rewardType: type,
    discountType,
    discountValue: roundMoney(toFiniteNumber(source.discountValue ?? extractLegacyRewardNumericValue(source.value), 0)),
    rarity: normalizeRarity(source.rarity),
    weight: Math.max(0, toFiniteNumber(source.weight, 0)),
    quantity,
    stock: quantity,
    enabled: source.active === true ? true : source.enabled !== undefined ? Boolean(source.enabled) : source.active !== false,
    active: source.enabled === true ? true : source.active !== undefined ? Boolean(source.active) : source.enabled !== false,
    archived: Boolean(source.archived),
    applicableServiceIds: normalizeServiceIdList(source.applicableServiceIds),
  };
}

function isRewardDefinitionSelectable(reward = {}, service = {}) {
  const hydrated = hydrateRewardDefinition(reward);
  if (!hydrated.enabled || !hydrated.active || hydrated.archived) return false;
  if (hydrated.weight <= 0) return false;
  if (hydrated.quantity <= 0) return false;
  if (!isPromotionApplicableToService(hydrated, service)) return false;
  return true;
}

function selectWeightedReward(rewards = [], random = Math.random, service = {}) {
  const pool = rewards.map(hydrateRewardDefinition).filter((reward) => isRewardDefinitionSelectable(reward, service));
  const totalWeight = pool.reduce((sum, reward) => sum + Number(reward.weight || 0), 0);
  if (!pool.length || totalWeight <= 0) return null;
  let cursor = Math.max(0, Math.min(0.999999999, Number(random()) || 0)) * totalWeight;
  for (const reward of pool) {
    cursor -= Number(reward.weight || 0);
    if (cursor < 0) return reward;
  }
  return pool[pool.length - 1];
}

function calculateRewardDiscount(amount, reward = {}) {
  const baseAmount = nonNegativeMoney(amount);
  const hydrated = hydrateRewardDefinition(reward);
  let discountAmount = 0;
  if (hydrated.discountType === "Percentage") {
    discountAmount = roundMoney((baseAmount * hydrated.discountValue) / 100);
  } else if (hydrated.discountType === "Fixed") {
    discountAmount = roundMoney(hydrated.discountValue);
  } else if (hydrated.type === "Free Car Wash") {
    discountAmount = baseAmount;
  }
  discountAmount = Math.min(baseAmount, nonNegativeMoney(discountAmount));
  return {
    rewardDiscountAmount: discountAmount,
    finalAmount: nonNegativeMoney(baseAmount - discountAmount),
  };
}

function isCustomerRewardExpired(customerReward = {}, now = new Date()) {
  const expirationDate = String(customerReward.expirationDate || customerReward.expiresAt || "").trim();
  if (!expirationDate) return false;
  return expirationDate < (now instanceof Date ? now.toISOString().slice(0, 10) : new Date(now).toISOString().slice(0, 10));
}

function hydrateCustomerReward(customerReward = {}, payments = [], now = new Date()) {
  const source = customerReward?.toObject ? customerReward.toObject() : { ...(customerReward || {}) };
  const paidPayment = payments.find((payment) => String(payment?.rewardId || "").trim() === String(source.id || "").trim() && paymentDomain.isPaidStatus(payment?.status));
  const expired = isCustomerRewardExpired(source, now);
  const status = paidPayment
    ? "Used"
    : expired && !["Used", "Cancelled"].includes(normalizeRewardStatus(source.status))
      ? "Expired"
      : normalizeRewardStatus(source.status, "Available");
  return {
    ...source,
    status,
    dateGranted: source.dateGranted || source.dateEarned || "",
    dateEarned: source.dateEarned || source.dateGranted || "",
    milestoneNumber: Math.max(0, toFiniteNumber(source.milestoneNumber, 0)),
    linkedBookingId: source.linkedBookingId || source.reservedBookingId || paidPayment?.bookingId || "",
    linkedPaymentId: source.linkedPaymentId || paidPayment?.id || "",
    usedAt: source.usedAt || (paidPayment ? paidPayment.updatedAt || paidPayment.createdAt || "" : ""),
  };
}

function getRewardTransition(currentStatus, nextStatus) {
  const current = normalizeRewardStatus(currentStatus);
  const next = normalizeRewardStatus(nextStatus);
  const allowed = {
    Available: ["Claimed", "Reserved", "Expired", "Cancelled"],
    Claimed: ["Reserved", "Available", "Expired", "Cancelled"],
    Reserved: ["Used", "Available", "Released", "Expired", "Cancelled"],
    Released: ["Available", "Expired", "Cancelled"],
    Used: [],
    Expired: [],
    Cancelled: [],
  };
  return { current, next, allowed: (allowed[current] || []).includes(next) };
}

function eligibleBookingsForRewards(bookings = [], paymentsByBookingId = new Map()) {
  return bookings
    .filter((booking) => {
      if (!bookingDomain.isCompletedBookingStatus(booking.status)) return false;
      const payment = paymentsByBookingId.get(String(booking.id || "").trim());
      return paymentDomain.isPaymentFullyPaid(payment, booking);
    })
    .sort((left, right) => {
      const leftDate = new Date(left.createdAt || left.date || 0).getTime();
      const rightDate = new Date(right.createdAt || right.date || 0).getTime();
      return leftDate - rightDate || String(left.id || "").localeCompare(String(right.id || ""));
    });
}

function getEarnedMilestoneNumbers(eligibleBookingCount) {
  const milestoneCount = Math.floor(Math.max(0, Number(eligibleBookingCount || 0)) / REWARD_MILESTONE_SIZE);
  return Array.from({ length: milestoneCount }, (_value, index) => index + 1);
}

module.exports = {
  ACTIVE_REVIEW_STATUSES,
  PROMOTION_DISCOUNT_TYPES,
  PROMOTION_STATUSES,
  REVIEW_STATUSES,
  REWARD_MILESTONE_SIZE,
  REWARD_RARITIES,
  REWARD_STATUSES,
  calculatePromotionDiscount,
  calculateRewardDiscount,
  createValidationError,
  customerOwnsBooking,
  eligibleBookingsForRewards,
  evaluatePromotionEligibility,
  evaluateReviewEligibility,
  getEarnedMilestoneNumbers,
  getRewardTransition,
  hydrateCustomerReward,
  hydratePromotion,
  hydrateRewardDefinition,
  isActiveReview,
  isCustomerRewardExpired,
  isPromotionApplicableToService,
  isRewardDefinitionSelectable,
  normalizeDiscountType,
  normalizePromotionCode,
  normalizePromotionPayload,
  normalizePromotionStatus,
  normalizeReviewStatus,
  normalizeRewardDefinitionPayload,
  normalizeRewardStatus,
  selectWeightedReward,
  validateReviewInput,
};
