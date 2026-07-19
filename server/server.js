if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const path = require("path");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");

const { connectToDatabase, getDatabaseName, getDatabaseState, getMongoEnvName } = require("./db");
const {
  Booking,
  Service,
  StockMonitoringItem,
  Payment,
  User,
  AuditLog,
  Review,
  Promo,
  QuoteRequest,
  Expense,
  Commission,
  SecuritySetting,
  Reward,
  CustomerReward,
} = require("./models");
const bookingDomain = require("./domain/bookingStatus");
const paymentDomain = require("./domain/payments");
const paymentMethodsDomain = require("./domain/paymentMethods");
const stockDomain = require("./domain/stock");
const scheduleDomain = require("./domain/schedule");
const commissionDomain = require("./domain/commission");
const expenseDomain = require("./domain/expenses");
const invoiceDomain = require("./domain/invoices");
const engagementDomain = require("./domain/engagement");
const { buildBusinessSummary } = require("./domain/summaries");

const app = express();
const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);
const CLIENT_APP_URL = String(process.env.CLIENT_APP_URL || "http://localhost:3000").trim();
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const BUILD_DIR = path.resolve(__dirname, "..", "build");
const ALLOWED_CORS_ORIGINS = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const signupOtpStore = new Map();
const passwordChangeOtpStore = new Map();
const PASSWORD_PREFIX = "scrypt$";
const SECURITY_SETTING_ID = "autoflow-security";
const DEFAULT_SPECIAL_PIN = String(process.env.DEFAULT_ADMIN_SPECIAL_PIN || crypto.randomInt(100000, 999999)).trim();
const DEFAULT_SPECIAL_PASSWORD = String(process.env.DEFAULT_ADMIN_SPECIAL_PASSWORD || crypto.randomBytes(24).toString("base64url")).trim();
const DEFAULT_STAFF_SPECIAL_PIN = String(process.env.DEFAULT_STAFF_SPECIAL_PIN || crypto.randomInt(100000, 999999)).trim();
const DEFAULT_STAFF_SPECIAL_PASSWORD = String(process.env.DEFAULT_STAFF_SPECIAL_PASSWORD || crypto.randomBytes(24).toString("base64url")).trim();
const DEFAULT_REQUIRED_DOWN_PAYMENT_AMOUNT = 0;
const SPECIAL_CREDENTIAL_HASH_ROUNDS = 12;
const ADMIN_SEED_EMAIL = String(process.env.ADMIN_SEED_EMAIL || "").trim().toLowerCase();
const ADMIN_SEED_PASSWORD = String(process.env.ADMIN_SEED_PASSWORD || "");
const ADMIN_SEED_NAME = String(process.env.ADMIN_SEED_NAME || "Production Admin").trim();
const ADMIN_SEED_PHONE = String(process.env.ADMIN_SEED_PHONE || "").trim();
const INVOICE_TAX_RATE = 0.12;
const JWT_EXPIRES_IN = String(process.env.JWT_EXPIRES_IN || "7d").trim();
const LEGACY_CUSTOMER_ALIAS = "cl" + "ient";
const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || (IS_PRODUCTION ? "resend" : "smtp"))
  .trim()
  .toLowerCase();
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const SMTP_EMAIL = String(process.env.EMAIL_USER || process.env.GOOGLE_SMTP_EMAIL || "").trim();
const SMTP_APP_PASSWORD = String(process.env.EMAIL_PASS || process.env.GOOGLE_SMTP_APP_PASSWORD || "").trim();
const EMAIL_FROM = String(process.env.EMAIL_FROM || process.env.GOOGLE_SMTP_FROM || SMTP_EMAIL || "").trim();
const AI_PROVIDER_UNCONFIGURED_MESSAGE = "AI provider is not configured yet.";
const AI_PROVIDER_ERROR_MESSAGE = "Unable to generate analysis right now.";
const GROQ_API_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_API_KEY = String(process.env.GROQ_API_KEY || "").trim();
const GROQ_MODEL = String(process.env.GROQ_MODEL || "llama-3.1-8b-instant").trim();
const VEHICLE_API_BASE_URL = "https://vpic.nhtsa.dot.gov/api/vehicles";
const VEHICLE_REFERENCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const vehicleReferenceCache = new Map();
let smtpMailTransportPromise = null;

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (secret) return secret;
  if (IS_PRODUCTION) {
    throw new Error("Missing JWT_SECRET. Add a strong JWT secret to the production environment.");
  }
  return "autoflow-local-development-jwt-secret";
}

function parseJwtExpirySeconds(value) {
  const raw = String(value || "7d").trim();
  const match = raw.match(/^(\d+)\s*([smhd])?$/i);
  if (!match) return 7 * 24 * 60 * 60;

  const amount = Math.max(1, Number(match[1]) || 1);
  const unit = String(match[2] || "s").toLowerCase();
  if (unit === "m") return amount * 60;
  if (unit === "h") return amount * 60 * 60;
  if (unit === "d") return amount * 24 * 60 * 60;
  return amount;
}

function signJwt(payload) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    ...payload,
    iat: now,
    exp: now + parseJwtExpirySeconds(JWT_EXPIRES_IN),
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(body));
  const signature = crypto
    .createHmac("sha256", getJwtSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyJwt(token) {
  const [encodedHeader, encodedPayload, signature] = String(token || "").split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    throw new Error("Invalid token.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", getJwtSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new Error("Invalid token.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  if (Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) {
    const error = new Error("Session expired. Please log in again.");
    error.statusCode = 401;
    throw error;
  }

  return payload;
}

function isAllowedCorsOrigin(origin, req) {
  if (!origin) return true;
  if (ALLOWED_CORS_ORIGINS.includes(origin)) return true;
  try {
    const requestHost = String(req.get("host") || "").toLowerCase();
    const originHost = new URL(origin).host.toLowerCase();
    if (requestHost && originHost === requestHost) return true;
  } catch (_error) {
    return false;
  }
  if (!IS_PRODUCTION && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  return !IS_PRODUCTION && origin === CLIENT_APP_URL;
}

app.use((req, res, next) => {
  cors({
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin, req)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
  })(req, res, next);
});
app.use(express.json({ limit: "12mb" }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

async function authenticateApi(req, res, next) {
  try {
    const authHeader = String(req.get("authorization") || "").trim();
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      res.status(401).json({ message: "Authentication required." });
      return;
    }

    const payload = verifyJwt(token);
    const user = await User.findOne({ id: payload.sub }).lean();
    if (!user) {
      res.status(401).json({ message: "Authentication required." });
      return;
    }

    if (String(user.status || "active").toLowerCase() !== "active") {
      res.status(403).json({ message: "This account is inactive." });
      return;
    }

    req.authUser = {
      id: user.id,
      email: user.email,
      userType: normalizeUserType(user.userType, user.role),
      role: normalizeSubtype(user.userType, user.role),
      name: user.name || `${user.first || ""} ${user.last || ""}`.trim(),
    };
    next();
  } catch (error) {
    res.status(error.statusCode || 401).json({ message: error.message || "Invalid or expired session." });
  }
}

function requireAdminUser(req, res, next) {
  if (normalizeUserType(req.authUser?.userType, req.authUser?.role) !== "admin") {
    recordAudit(req.authUser?.email || req.authUser?.id || "system", "Unauthorized admin route attempt", req.originalUrl || req.path || "", {
      actorId: req.authUser?.id || "",
      actorName: req.authUser?.name || req.authUser?.email || "",
      actorRole: req.authUser?.role || "",
      targetType: "Route",
      result: "denied",
    }).catch((error) => {
      console.error("[audit] Failed to record unauthorized admin route attempt", error);
    });
    res.status(403).json({ message: "Admin access required." });
    return;
  }
  next();
}

function requireRoles(...allowedRoles) {
  const allowed = new Set(allowedRoles.map((role) => String(role || "").toLowerCase()));
  return (req, res, next) => {
    const userType = normalizeUserType(req.authUser?.userType, req.authUser?.role);
    if (!allowed.has(userType)) {
      res.status(403).json({ message: "You do not have permission to perform this action." });
      return;
    }
    next();
  };
}

function createId(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
}

const QR_TOKEN_VERSION = 1;
const QR_TOKEN_PURPOSES = {
  tracking: "tracking",
  warranty: "warranty",
};

function signQrTokenPayload(encodedPayload) {
  return crypto
    .createHmac("sha256", getJwtSecret())
    .update(encodedPayload)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function getBookingAccessVersion(booking = {}, purpose) {
  const field = purpose === QR_TOKEN_PURPOSES.warranty ? "warrantyAccessVersion" : "trackingAccessVersion";
  return Math.max(1, Number(booking?.[field] || 1));
}

function isBookingAccessRevoked(booking = {}, purpose) {
  const field = purpose === QR_TOKEN_PURPOSES.warranty ? "warrantyAccessRevoked" : "trackingAccessRevoked";
  return Boolean(booking?.[field]);
}

function createBookingAccessToken(booking = {}, purpose) {
  const normalizedPurpose = purpose === QR_TOKEN_PURPOSES.warranty ? QR_TOKEN_PURPOSES.warranty : QR_TOKEN_PURPOSES.tracking;
  const payload = {
    v: QR_TOKEN_VERSION,
    bid: String(booking?.id || "").trim(),
    pur: normalizedPurpose,
    av: getBookingAccessVersion(booking, normalizedPurpose),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signQrTokenPayload(encodedPayload);
  return `aft_${QR_TOKEN_VERSION}.${encodedPayload}.${signature}`;
}

function parseBookingAccessToken(token, expectedPurpose) {
  const [prefix, encodedPayload, signature] = String(token || "").trim().split(".");
  if (prefix !== `aft_${QR_TOKEN_VERSION}` || !encodedPayload || !signature) return null;

  const expectedSignature = signQrTokenPayload(encodedPayload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (Number(payload.v) !== QR_TOKEN_VERSION) return null;
    if (String(payload.pur || "") !== expectedPurpose) return null;
    if (!String(payload.bid || "").trim()) return null;
    return {
      bookingId: String(payload.bid || "").trim(),
      purpose: String(payload.pur || ""),
      accessVersion: Math.max(1, Number(payload.av || 1)),
    };
  } catch (_error) {
    return null;
  }
}

function appendBookingAccessLinks(booking = {}) {
  return {
    ...booking,
    trackingAccessToken: createBookingAccessToken(booking, QR_TOKEN_PURPOSES.tracking),
    warrantyAccessToken: createBookingAccessToken(booking, QR_TOKEN_PURPOSES.warranty),
  };
}

function ensureUserDocumentId(user, prefix = "USR") {
  if (!user) return "";
  const currentId = String(user.id || "").trim();
  if (currentId) return currentId;
  const nextId = createId(prefix);
  user.id = nextId;
  return nextId;
}

function toTimestamp() {
  return new Date().toLocaleString("en-PH", { hour12: true });
}

function toDateKey(date = new Date()) {
  return scheduleDomain.toDateKey(date);
}

function normalizePromoExpiryMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "date" || normalized === "usage") return normalized;
  return "none";
}

function normalizePromoStatus(value) {
  return engagementDomain.normalizePromotionStatus(value, "Draft");
}

function normalizePromoDiscountPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric;
}

function parsePromoExpiryDate(value) {
  return engagementDomain.hydratePromotion({ expiresAt: value }).expiresAt || "";
}

function hydratePromo(promo) {
  const hydrated = engagementDomain.hydratePromotion(promo);
  return {
    ...hydrated,
    expiryMode: hydrated.endAt ? "date" : hydrated.usageLimit > 0 ? "usage" : normalizePromoExpiryMode(hydrated.expiryMode),
  };
}

async function countPromoUsageForCustomer({ promoId, customerEmail, customerName, excludeBookingId = "" }) {
  const normalizedPromoId = String(promoId || "").trim();
  const normalizedEmail = String(customerEmail || "").trim();
  const normalizedCustomerName = String(customerName || "").trim();

  if (!normalizedPromoId || (!normalizedEmail && !normalizedCustomerName)) {
    return 0;
  }

  const query = { promoId: normalizedPromoId };
  if (excludeBookingId) {
    query.id = { $ne: String(excludeBookingId).trim() };
  }

  if (normalizedEmail) {
    query.customerEmail = normalizedEmail;
  } else {
    query.customerEmail = "";
    query.customer = normalizedCustomerName;
  }

  return Booking.countDocuments(query);
}

async function enforcePromoUsagePerUserLimit({ promo, promoId, customerEmail, customerName, excludeBookingId = "" }) {
  const hydratedPromo = promo?.status ? promo : hydratePromo(promo);
  const maxUsagePerUser = Math.max(0, Number(hydratedPromo?.maxUsagePerUser) || 0);
  if (!promoId || maxUsagePerUser <= 0) return;

  const usageCountForCustomer = await countPromoUsageForCustomer({
    promoId,
    customerEmail,
    customerName,
    excludeBookingId,
  });

  if (usageCountForCustomer >= maxUsagePerUser) {
    const error = new Error(`This promo can only be used ${maxUsagePerUser} time${maxUsagePerUser === 1 ? "" : "s"} per user.`);
    error.statusCode = 400;
    throw error;
  }
}

async function resolvePromoById(promoId) {
  const normalizedPromoId = String(promoId || "").trim();
  if (!normalizedPromoId) return null;

  const promo = await Promo.findOne({
    $or: [
      { id: normalizedPromoId },
      { code: engagementDomain.normalizePromotionCode(normalizedPromoId) },
    ],
  });
  if (!promo) {
    const error = new Error("Selected promo was not found.");
    error.statusCode = 404;
    throw error;
  }

  const hydratedPromo = hydratePromo(promo);
  if (hydratedPromo.status !== "Active") {
    const error = new Error("Selected promo is no longer active.");
    error.statusCode = 400;
    throw error;
  }

  return { promo, hydratedPromo };
}

function computePromoPricing(amount, promo) {
  if (!promo) {
    const originalAmount = Math.max(0, Number(amount) || 0);
    return {
      originalAmount,
      promoId: "",
      promoCode: "",
      promoTitle: "",
      promoDiscountType: "",
      promoDiscountValue: 0,
      promoDiscountPercent: 0,
      promoDiscountAmount: 0,
      amount: originalAmount,
    };
  }
  return engagementDomain.calculatePromotionDiscount(amount, promo);
}

async function incrementPromoUsage(promoId) {
  const normalizedPromoId = String(promoId || "").trim();
  if (!normalizedPromoId) return;
  await Promo.findOneAndUpdate(
    {
      id: normalizedPromoId,
      $or: [
        { usageLimit: 0 },
        { usageLimit: { $exists: false } },
        { $expr: { $lt: ["$usageCount", "$usageLimit"] } },
      ],
    },
    { $inc: { usageCount: 1 } }
  );
}

async function decrementPromoUsage(promoId) {
  const normalizedPromoId = String(promoId || "").trim();
  if (!normalizedPromoId) return;
  const promo = await Promo.findOne({ id: normalizedPromoId });
  if (!promo) return;
  promo.usageCount = Math.max(0, Number(promo.usageCount || 0) - 1);
  await promo.save();
}

function isPastDateKey(value) {
  const dateKey = String(value || "").trim();
  return Boolean(dateKey) && dateKey < toDateKey();
}

const PLACE_SLOT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];
const SERVICE_ARRIVAL_TIME_OPTIONS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
];
const SHOP_OPEN_MINUTES = 8 * 60;
const SHOP_CLOSE_MINUTES = 17 * 60;
const SHOP_DAY_MINUTES = SHOP_CLOSE_MINUTES - SHOP_OPEN_MINUTES;
const DOWN_PAYMENT_DEADLINE_MS = 24 * 60 * 60 * 1000;
const DOWN_PAYMENT_ONE_HOUR_MS = 60 * 60 * 1000;
const DOWN_PAYMENT_REMINDER_INTERVAL_MS = 10 * 60 * 1000;
const DOWN_PAYMENT_AUTO_CANCEL_REASON = "Automatically cancelled because no down-payment proof was submitted within 24 hours.";

function timeToMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isValidScheduleTime(value) {
  return /^\d{2}:\d{2}$/.test(String(value || "").trim()) && timeToMinutes(value) !== null;
}

function getDefaultArrivalTimesForDuration(durationMinutes = 0) {
  const duration = Math.max(0, Number(durationMinutes) || 0);
  if (duration >= 240) return ["08:00"];
  if (duration > 120) return ["09:00", "11:00", "14:00"];
  return ["08:00", "10:00", "13:00", "15:00"];
}

function normalizeAllowedArrivalTimes(value, durationMinutes = 0) {
  const allowed = Array.isArray(value)
    ? value
        .map((item) => String(item || "").trim())
        .filter((item) => SERVICE_ARRIVAL_TIME_OPTIONS.includes(item))
    : [];
  const unique = [...new Set(allowed)];
  return unique.length ? unique : getDefaultArrivalTimesForDuration(durationMinutes);
}

function validateAllowedArrivalTimesPayload(value) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length === 0) {
    throwValidationError("Select at least one required time of arrival.");
  }

  const invalidTimes = value
    .map((item) => String(item || "").trim())
    .filter((item) => !SERVICE_ARRIVAL_TIME_OPTIONS.includes(item));
  if (invalidTimes.length) {
    throwValidationError("Required time of arrival must be hourly values between 08:00 and 17:00.");
  }
}

function throwValidationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function isScheduleBlockingStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return !["completed", "cancelled", "rejected"].includes(normalized);
}

function isRealPlaceSlot(value) {
  return PLACE_SLOT_OPTIONS.includes(Number(value || 0));
}

function isBlockingPlaceSlotStatus(status, placeSlot) {
  return isRealPlaceSlot(placeSlot) && isScheduleBlockingStatus(status);
}

function getOverlappingBookingsForSchedule(bookings, durationByService, bookingTime, requestedDuration) {
  const requestedStart = timeToMinutes(bookingTime);
  if (requestedStart === null) return [];
  const requestedEnd = requestedStart + requestedDuration;

  return bookings.filter((booking) => {
    if (!isBlockingPlaceSlotStatus(booking.status, booking.placeSlot)) return false;
    const existingStart = timeToMinutes(booking.time);
    if (existingStart === null) return false;
    const existingDuration = durationByService.get(booking.service) || 1;
    const existingEnd = existingStart + existingDuration;
    return requestedStart < existingEnd && existingStart < requestedEnd;
  });
}

function getOccupiedPlaceSlots(overlappingBookings) {
  const occupied = new Set();

  for (const booking of overlappingBookings) {
    const slot = Number(booking.placeSlot || 0);
    if (isRealPlaceSlot(slot)) {
      occupied.add(slot);
    }
  }

  return occupied;
}

async function validateBookingSlotAvailability({ bookingId = "", date = "", time = "", service = "", placeSlot = 0 }) {
  const bookingDate = String(date || "").trim();
  const bookingTime = String(time || "").trim();
  const serviceName = String(service || "").trim();
  const requestedPlaceSlot = Number(placeSlot || 0);

  if (!bookingDate || !bookingTime || !serviceName) return;

  const requestedStart = timeToMinutes(bookingTime);
  if (requestedStart === null) {
    const error = new Error("Please enter a valid booking time.");
    error.statusCode = 400;
    throw error;
  }

  if (!isRealPlaceSlot(requestedPlaceSlot)) {
    const error = new Error("Please choose one of the 8 place slots.");
    error.statusCode = 400;
    throw error;
  }

  const selectedService = await Service.findOne({ name: serviceName }).lean();
  if (!selectedService) {
    const error = new Error("Selected service is invalid.");
    error.statusCode = 400;
    throw error;
  }
  if (selectedService.enabled === false) {
    const error = new Error("Selected service is currently disabled and cannot be booked.");
    error.statusCode = 400;
    throw error;
  }

  const requestedDuration = Math.max(1, Number(selectedService.mins) || 0);
  const allowedArrivalTimes = normalizeAllowedArrivalTimes(selectedService.allowedArrivalTimes, selectedService.mins);
  if (!allowedArrivalTimes.includes(bookingTime)) {
    const error = new Error("Selected time is not available for this service.");
    error.statusCode = 400;
    throw error;
  }
  const excludedBookingId = String(bookingId || "").trim();
  const sameDayBookingsRaw = await Booking.find({ date: bookingDate, ...(excludedBookingId ? { id: { $ne: excludedBookingId } } : {}) }).lean();
  const sameDayBookings = excludedBookingId
    ? sameDayBookingsRaw.filter((booking) =>
        ![booking.id, booking.bookingId, booking._id].some((value) => String(value || "").trim() === excludedBookingId)
      )
    : sameDayBookingsRaw;
  const serviceNames = [...new Set(sameDayBookings.map((booking) => String(booking.service || "").trim()).filter(Boolean))];
  const sameDayServices = serviceNames.length ? await Service.find({ name: { $in: serviceNames } }).lean() : [];
  const durationByService = new Map(sameDayServices.map((item) => [item.name, Math.max(1, Number(item.mins) || 0)]));
  const overlappingBookings = getOverlappingBookingsForSchedule(sameDayBookings, durationByService, bookingTime, requestedDuration);
  const occupiedSlots = getOccupiedPlaceSlots(overlappingBookings);

  if (occupiedSlots.has(requestedPlaceSlot)) {
    const error = new Error("The selected place slot is already occupied for the chosen schedule.");
    error.statusCode = 409;
    throw error;
  }
}

async function ensureBookableService(serviceName) {
  const name = String(serviceName || "").trim();
  if (!name) {
    const error = new Error("Service selection is required.");
    error.statusCode = 400;
    throw error;
  }

  const service = await Service.findOne({ name }).lean();
  if (!service) {
    const error = new Error("Selected service is invalid.");
    error.statusCode = 400;
    throw error;
  }
  if (service.enabled === false) {
    const error = new Error("Selected service is currently disabled and cannot be booked.");
    error.statusCode = 400;
    throw error;
  }
  return service;
}

function createAiUnavailablePayload(feature, overrides = {}) {
  return {
    available: false,
    feature,
    message: AI_PROVIDER_UNCONFIGURED_MESSAGE,
    summary: "",
    keyObservations: [],
    possibleCauses: [],
    recommendations: [],
    warnings: [],
    cleanedUpIssueNote: "",
    technicianFriendlyNote: "",
    suggestedNextAction: "",
    customerSafeSummary: "",
    insights: [],
    suggestion: "",
    model: "",
    ...overrides,
  };
}

const AI_TEXT_KEYS = ["text", "content", "message", "description", "summary", "value", "insight", "detail", "details", "body"];
const AI_TITLE_KEYS = ["title", "label", "category", "type", "heading", "name"];

function normalizeAiText(value, maxLength = 280) {
  let source = value;
  if (Array.isArray(source)) {
    source = source
      .map((item) => normalizeAiText(item, maxLength))
      .filter(Boolean)
      .join(" ");
  } else if (source && typeof source === "object") {
    const textValue = AI_TEXT_KEYS.map((key) => source[key]).find((item) => item !== undefined && item !== null && String(item).trim());
    if (textValue !== undefined && textValue !== null) {
      return normalizeAiText(textValue, maxLength);
    } else {
      source = Object.entries(source)
        .map(([key, item]) => {
          const text = normalizeAiText(item, Math.max(80, Math.floor(maxLength / 2)));
          if (!text) return "";
          const label = String(key || "").replace(/[_-]+/g, " ").trim();
          return label ? `${label}: ${text}` : text;
        })
        .filter(Boolean)
        .join("; ");
    }
  }

  const normalized = String(source || "")
    .replace(/\s+/g, " ")
    .replace(/\[object Object\]/g, "")
    .trim();

  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

function normalizeAiNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function normalizeAiStringList(values, { maxItems = 6, maxLength = 120 } = {}) {
  if (!Array.isArray(values)) return [];

  return values
    .map((value) => normalizeAiText(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeAiRecord(record, { maxEntries = 10, maxKeyLength = 40, maxValueLength = 120 } = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return {};

  return Object.entries(record)
    .slice(0, maxEntries)
    .reduce((accumulator, [key, value]) => {
      const normalizedKey = normalizeAiText(key, maxKeyLength);
      if (!normalizedKey) return accumulator;

      if (typeof value === "number") {
        const normalizedNumber = normalizeAiNumber(value);
        if (normalizedNumber !== null) {
          accumulator[normalizedKey] = normalizedNumber;
        }
        return accumulator;
      }

      const normalizedValue = normalizeAiText(value, maxValueLength);
      if (normalizedValue) {
        accumulator[normalizedKey] = normalizedValue;
      }
      return accumulator;
    }, {});
}

function normalizeAiObjectList(values, allowedKeys, { maxItems = 6, maxValueLength = 120 } = {}) {
  if (!Array.isArray(values)) return [];

  return values
    .slice(0, maxItems)
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const normalized = {};
      allowedKeys.forEach((key) => {
        const value = item[key];
        if (typeof value === "number") {
          const normalizedNumber = normalizeAiNumber(value);
          if (normalizedNumber !== null) {
            normalized[key] = normalizedNumber;
          }
          return;
        }

        const normalizedValue = normalizeAiText(value, maxValueLength);
        if (normalizedValue) {
          normalized[key] = normalizedValue;
        }
      });

      return Object.keys(normalized).length ? normalized : null;
    })
    .filter(Boolean);
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_error) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_nestedError) {
      return null;
    }
  }
}

function buildAnalyticsAiInput(body = {}) {
  const requestedAnalysisType = String(body.analysisType || body.type || "descriptive").trim().toLowerCase();
  const analysisType = requestedAnalysisType === "predictive" ? "predictive" : "descriptive";
  const totals = normalizeAiRecord(body.totals || body.summary || body.metrics, {
    maxEntries: 12,
    maxKeyLength: 40,
    maxValueLength: 80,
  });
  const topServices = normalizeAiObjectList(body.topServices || body.services, ["name", "count"], {
    maxItems: 5,
    maxValueLength: 80,
  });
  const bottomServices = normalizeAiObjectList(body.bottomServices || body.underperformingServices, ["name", "count"], {
    maxItems: 5,
    maxValueLength: 80,
  });
  const paymentSummary = normalizeAiObjectList(
    body.paymentSummary || body.paymentMethods || body.paymentSummaryEntries,
    ["method", "name", "count", "amount"],
    { maxItems: 8, maxValueLength: 80 }
  );
  const trends = normalizeAiStringList(body.trends || body.observations || body.notes, {
    maxItems: 6,
    maxLength: 120,
  });
  const strongestService = topServices[0]
    ? normalizeAiText(`${topServices[0].name} leads with ${topServices[0].count} booking(s).`, 120)
    : "";
  const strongestPaymentMethod = paymentSummary
    .slice()
    .sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0))[0];
  const paymentLeader = strongestPaymentMethod
    ? normalizeAiText(
        `${strongestPaymentMethod.method || strongestPaymentMethod.name} contributes ${Number(strongestPaymentMethod.amount || 0).toLocaleString()} in paid sales.`,
        120
      )
    : "";
  const derivedSignals = [strongestService, paymentLeader].filter(Boolean);

  const payload = {
    analysisType,
    totals,
    topServices,
    bottomServices,
    paymentSummary,
    trends,
    derivedSignals,
  };

  const hasContent =
    Object.keys(totals).length > 0 ||
    topServices.length > 0 ||
    bottomServices.length > 0 ||
    paymentSummary.length > 0 ||
    trends.length > 0 ||
    derivedSignals.length > 0;

  return hasContent ? payload : null;
}

function buildTrackingIssueNoteAiInput(body = {}) {
  const problemLocation = normalizeAiText(body.problemLocation, 120);
  const serviceType = normalizeAiText(body.serviceType || body.service, 120);
  const vehicleDetails = normalizeAiText(body.vehicleDetails || body.vehicle, 160);
  const currentTrackingStatus = normalizeAiText(body.currentTrackingStatus || body.status, 80);
  const currentIssueNote = normalizeAiText(body.currentIssueNote || body.issueNote || body.notes, 320);
  const issueTypes = normalizeAiStringList(body.issueTypes, { maxItems: 6, maxLength: 80 });
  const issueMarkers = normalizeAiObjectList(body.issueMarkers, ["id", "issueType", "x", "y"], {
    maxItems: 6,
    maxValueLength: 80,
  });
  const markerSummaries = issueMarkers.map((marker) => {
    const issueType = normalizeAiText(marker.issueType, 60) || "unspecified issue";
    const id = normalizeAiText(marker.id, 12);
    const x = normalizeAiText(marker.x, 12);
    const y = normalizeAiText(marker.y, 12);
    return normalizeAiText(
      `Marker ${id || "?"}: ${issueType}${x && y ? ` near ${x}% / ${y}%` : ""}`,
      100
    );
  }).filter(Boolean);
  const issueOverview = normalizeAiText(
    issueTypes.length > 1
      ? `${issueTypes.join(", ")} across ${issueMarkers.length || issueTypes.length} marked area(s).`
      : issueTypes[0]
        ? `${issueTypes[0]} noted${issueMarkers.length > 1 ? ` across ${issueMarkers.length} marked area(s)` : ""}.`
        : "",
    140
  );

  const payload = {
    problemLocation,
    serviceType,
    vehicleDetails,
    currentTrackingStatus,
    currentIssueNote,
    issueTypes,
    issueMarkers,
    markerSummaries,
    issueOverview,
  };

  const hasContent =
    problemLocation ||
    serviceType ||
    vehicleDetails ||
    currentTrackingStatus ||
    currentIssueNote ||
    issueTypes.length > 0 ||
    issueMarkers.length > 0 ||
    markerSummaries.length > 0 ||
    issueOverview;

  return hasContent ? payload : null;
}

function buildFinancialAiInput(body = {}) {
  const totalsSource = body && typeof body.totals === "object" ? body.totals : {};
  const revenue = Math.max(0, Number(totalsSource.revenue || 0));
  const expenses = Math.max(0, Number(totalsSource.expenses || 0));
  const commissions = Math.max(0, Number(totalsSource.commissions || 0));
  const netAfterExpenses = Number(totalsSource.netAfterExpenses ?? revenue - expenses);
  const netAfterCommissions = Number(totalsSource.netAfterCommissions ?? revenue - expenses - commissions);

  const expenseCategories = Array.isArray(body.expenseCategories)
    ? body.expenseCategories
        .map((entry) => {
          const category = normalizeAiText(entry?.category, 60);
          const total = Math.max(0, Number(entry?.total || 0));
          const count = Math.max(0, Number(entry?.count || 0));
          if (!category) return null;
          return { category, total, count };
        })
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const topCommissionWorkers = Array.isArray(body.topCommissionWorkers)
    ? body.topCommissionWorkers
        .map((entry) => {
          const worker = normalizeAiText(entry?.worker, 80);
          const total = Math.max(0, Number(entry?.total || 0));
          const count = Math.max(0, Number(entry?.count || 0));
          if (!worker) return null;
          return { worker, total, count };
        })
        .filter(Boolean)
        .slice(0, 5)
    : [];

  const filters = {
    dateFrom: normalizeAiText(body?.filters?.dateFrom, 20),
    dateTo: normalizeAiText(body?.filters?.dateTo, 20),
    expenseType: normalizeAiText(body?.filters?.expenseType, 40),
    workerQuery: normalizeAiText(body?.filters?.workerQuery, 80),
  };

  const payload = {
    scopeLabel: filters.dateFrom || filters.dateTo
      ? `${filters.dateFrom || "start"} to ${filters.dateTo || "present"}`
      : "All available records",
    filters,
    totals: {
      revenue,
      expenses,
      commissions,
      netAfterExpenses: Number.isFinite(netAfterExpenses) ? netAfterExpenses : 0,
      netAfterCommissions: Number.isFinite(netAfterCommissions) ? netAfterCommissions : 0,
      paidTransactions: Math.max(0, Number(totalsSource.paidTransactions || 0)),
      expenseEntries: Math.max(0, Number(totalsSource.expenseEntries || 0)),
      commissionEntries: Math.max(0, Number(totalsSource.commissionEntries || 0)),
    },
    expenseCategories,
    topCommissionWorkers,
  };

  const hasContent =
    payload.totals.revenue > 0 ||
    payload.totals.expenses > 0 ||
    payload.totals.commissions > 0 ||
    payload.totals.paidTransactions > 0 ||
    payload.totals.expenseEntries > 0 ||
    payload.totals.commissionEntries > 0 ||
    expenseCategories.length > 0 ||
    topCommissionWorkers.length > 0 ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.expenseType ||
    filters.workerQuery;

  return hasContent ? payload : null;
}

async function requestGroqStructuredJson({ feature, systemPrompt, userPayload, maxTokens = 420, allowTextFallback = false }) {
  if (!GROQ_API_KEY) {
    return createAiUnavailablePayload(feature);
  }

  try {
    const response = await fetch(`${GROQ_API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[ai] Groq request failed", { feature, status: response.status });
      return createAiUnavailablePayload(feature, { message: AI_PROVIDER_ERROR_MESSAGE });
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content || "";
    const parsed = extractJsonObject(content);

    if (!parsed || typeof parsed !== "object") {
      console.error("[ai] Groq response was not valid JSON", { feature });
      if (allowTextFallback && normalizeAiText(content, 1200)) {
        return {
          available: true,
          feature,
          message: "",
          model: String(payload.model || GROQ_MODEL || "").trim(),
          rawText: content,
        };
      }
      return createAiUnavailablePayload(feature, { message: AI_PROVIDER_ERROR_MESSAGE });
    }

    return {
      available: true,
      feature,
      message: "",
      model: String(payload.model || GROQ_MODEL || "").trim(),
      ...parsed,
    };
  } catch (error) {
    console.error("[ai] Groq request error", { feature, message: error.message || "Unknown error" });
    return createAiUnavailablePayload(feature, { message: AI_PROVIDER_ERROR_MESSAGE });
  }
}

function formatAnalyticsPeso(value) {
  return `Php ${Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

function getAiObjectField(record, keys) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "";
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && String(record[key]).trim()) {
      return record[key];
    }
  }
  return "";
}

function normalizeAnalyticsItemType(value, fallback = "observation") {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized.includes("summary")) return "summary";
  if (normalized.includes("cause")) return "possible_cause";
  if (normalized.includes("recommend") || normalized.includes("action")) return "recommendation";
  if (normalized.includes("warn") || normalized.includes("risk") || normalized.includes("watch")) return "watchpoint";
  if (normalized.includes("predict")) return "prediction";
  if (normalized.includes("confidence")) return "confidence";
  return normalized || fallback;
}

function titleFromItemType(type) {
  const normalized = normalizeAnalyticsItemType(type, "observation");
  if (normalized === "possible_cause") return "Possible Cause";
  if (normalized === "recommendation") return "Recommendation";
  if (normalized === "watchpoint") return "Watchpoint";
  if (normalized === "summary") return "Summary";
  if (normalized === "prediction") return "Prediction";
  if (normalized === "confidence") return "Confidence";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Observation";
}

function flattenAnalyticsItemObject(record = {}, maxLength = 900) {
  const textValue = getAiObjectField(record, AI_TEXT_KEYS);
  if (textValue) return normalizeAiText(textValue, maxLength);

  return Object.entries(record)
    .map(([key, value]) => {
      if (AI_TITLE_KEYS.includes(key)) return "";
      const text = normalizeAiText(value, 240);
      if (!text) return "";
      const label = String(key || "").replace(/[_-]+/g, " ").trim();
      return label ? `${label}: ${text}` : text;
    })
    .filter(Boolean)
    .join("; ")
    .slice(0, maxLength);
}

function normalizeAnalyticsAiItem(item, fallbackTitle = "Observation", fallbackType = "observation") {
  if (item === undefined || item === null) return null;

  const source = item && typeof item === "object" && !Array.isArray(item) ? item : {};
  const type = normalizeAnalyticsItemType(source.type || source.category || source.label || fallbackType, fallbackType);
  const rawTitle = getAiObjectField(source, AI_TITLE_KEYS);
  const title = normalizeAiText(rawTitle, 80) || fallbackTitle || titleFromItemType(type);
  const text = source && Object.keys(source).length
    ? flattenAnalyticsItemObject(source, 1000)
    : normalizeAiText(item, 1000);

  if (!text) return null;
  return {
    type,
    title: title || titleFromItemType(type),
    text,
  };
}

function normalizeAnalyticsAiItems(payload = {}, analysisType = "descriptive") {
  const items = [];
  const pushItem = (item, fallbackTitle, fallbackType) => {
    const normalized = normalizeAnalyticsAiItem(item, fallbackTitle, fallbackType);
    if (normalized) items.push(normalized);
  };
  const pushList = (values, fallbackTitle, fallbackType) => {
    const list = Array.isArray(values) ? values : values ? [values] : [];
    list.forEach((item) => pushItem(item, fallbackTitle, fallbackType));
  };

  pushList(payload.items, "Observation", "observation");
  pushItem(payload.rawText, "Summary", "summary");
  pushItem(payload.summary, "Summary", "summary");
  pushList(payload.keyObservations || payload.observations || payload.insights, "Observation", "observation");
  pushList(payload.possibleCauses || payload.causes || payload.drivers, "Possible Cause", "possible_cause");
  pushList(payload.recommendations || payload.actions || payload.nextSteps, "Recommendation", "recommendation");
  pushList(payload.warnings || payload.watchpoints || payload.risks, analysisType === "predictive" ? "Predictive Watchpoint" : "Watchpoint", "watchpoint");

  const seen = new Set();
  return items
    .filter((item) => {
      const key = `${item.type}:${item.title}:${item.text}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function buildAnalyticsFallbackItems(input = {}, analysisType = "descriptive") {
  const totals = input.totals || {};
  const topServices = Array.isArray(input.topServices) ? input.topServices : [];
  const bottomServices = Array.isArray(input.bottomServices) ? input.bottomServices : [];
  const paymentSummary = Array.isArray(input.paymentSummary) ? input.paymentSummary : [];
  const selectedRange = normalizeAiText(totals.selectedRange, 80) || "the selected period";
  const totalSales = Number(totals.totalSales || 0);
  const selectedRangeSales = Number(totals.selectedRangeSales || 0);
  const paidRevenueEvents = Number(totals.paidRevenueEvents || 0);
  const totalBookings = Number(totals.totalBookings || 0);
  const completedBookings = Number(totals.completedBookings || 0);
  const inProgressBookings = Number(totals.inProgressBookings || 0);
  const avgRating = Number(totals.avgRating || 0);
  const totalReviews = Number(totals.totalReviews || 0);
  const leader = topServices[0];
  const lowerService = bottomServices[0] || topServices[topServices.length - 1];
  const strongestPeriod = paymentSummary
    .slice()
    .sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0))[0];
  const confidenceText = totalBookings + paidRevenueEvents + totalReviews >= 20
    ? "Prediction confidence is moderate because there are multiple booking, revenue, and review signals available."
    : "Prediction confidence is limited because the available analytics dataset is still small.";

  if (analysisType === "predictive") {
    return [
      {
        type: "summary",
        title: "Summary",
        text: `Based on current data, future demand may continue to follow the services and periods already showing traction. Verified revenue is ${formatAnalyticsPeso(totalSales)}, with ${formatAnalyticsPeso(selectedRangeSales)} in ${selectedRange}, so the near-term sales outlook should be treated as directional rather than guaranteed. ${confidenceText}`,
      },
      {
        type: "prediction",
        title: "Likely Service Demand",
        text: leader
          ? `${leader.name} may remain a near-term demand driver because it currently leads the booking mix with ${leader.count} booking(s). If this pattern continues, the shop could benefit from keeping this service visible in recommendations and making sure staff are prepared for its workflow requirements.`
          : "Service demand is difficult to forecast because no booking leaders are available yet. Once bookings accumulate, the strongest services should become clearer and planning confidence should improve.",
      },
      {
        type: "prediction",
        title: "Possible Sales Direction",
        text: strongestPeriod
          ? `${strongestPeriod.name || strongestPeriod.method || "The strongest period"} currently contributes ${formatAnalyticsPeso(strongestPeriod.amount)} in verified sales from ${Number(strongestPeriod.count || 0)} paid record(s). If that revenue rhythm continues, future sales may be strongest around the same operating cadence, but the projection should stay cautious until more periods are observed.`
          : "There is not enough verified period revenue to identify a reliable sales direction yet. Future sales may fluctuate until more paid stages are verified.",
      },
      {
        type: "prediction",
        title: "Expected Booking Pattern",
        text: `Current bookings total ${totalBookings}, with ${completedBookings} completed and ${inProgressBookings} in progress. If new requests keep arriving at the same mix, staff workload may concentrate around services that already appear in the booking leaders, so scheduling buffers and detailer availability should be watched closely.`,
      },
      {
        type: "watchpoint",
        title: "Review And Engagement Risk",
        text: totalReviews
          ? `The current average rating is ${avgRating} from ${totalReviews} review(s). If review volume stays low, one poor rating could noticeably affect the dashboard average, so follow-up requests after completed jobs may help keep engagement and reputation signals steadier.`
          : "There are no review ratings available yet, so customer sentiment cannot be predicted with confidence. The business may want to collect reviews consistently before relying on rating trends for decisions.",
      },
      {
        type: "recommendation",
        title: "Staff And Materials Planning",
        text: leader
          ? `If ${leader.name} keeps attracting bookings, the shop may need to prepare enough detailer capacity, consumables, and bay time for that service. This is especially important for premium or protection-oriented packages where delays can reduce customer satisfaction.`
          : "Staff and inventory planning should remain flexible until service demand becomes clearer. Track the next wave of bookings before committing heavily to a specific service mix.",
      },
      {
        type: "watchpoint",
        title: "Revenue Opportunity",
        text: lowerService
          ? `${lowerService.name} has lower visible demand with ${lowerService.count} booking(s), which may represent either a weaker offer or a service that needs clearer positioning. If the service has good margins, the business could test targeted recommendations before assuming demand will stay low.`
          : "Underperforming services are not visible yet. As more services appear in the data, low-volume offers should be reviewed for pricing, promotion, or bundling opportunities.",
      },
    ];
  }

  return [
    {
      type: "summary",
      title: "Summary",
      text: `The analytics currently show ${formatAnalyticsPeso(totalSales)} in verified paid revenue, counted only from paid payment stages and compatible legacy paid records. The selected range, ${selectedRange}, contributes ${formatAnalyticsPeso(selectedRangeSales)} from ${paidRevenueEvents} verified revenue event(s), which helps separate confirmed cash flow from pending or rejected payments.`,
    },
    {
      type: "observation",
      title: "Verified Sales Performance",
      text: `Sales reporting is based on verified paid revenue only, so pending and for-verification payments are excluded from the totals. This gives the admin a cleaner view of money that has actually been approved, which is more useful for operational decisions than raw booking value alone.`,
    },
    {
      type: "observation",
      title: "Booking Volume",
      text: `There are ${totalBookings} booking(s) in the current dataset, including ${completedBookings} completed and ${inProgressBookings} in progress. This mix shows how much demand has already moved through the shop and how much operational work may still need attention.`,
    },
    {
      type: "observation",
      title: "Top-Performing Service",
      text: leader
        ? `${leader.name} is currently the strongest visible service with ${leader.count} booking(s). That matters because repeated demand for a service can guide what the team highlights in consultations, promos, and scheduling priorities.`
        : "No top service is available yet because bookings are empty or services are not recorded. Once bookings are added, this section can identify which services are actually pulling demand.",
    },
    {
      type: "possible_cause",
      title: "Lower-Volume Services",
      text: lowerService
        ? `${lowerService.name} appears lower in the visible service mix with ${lowerService.count} booking(s). This may mean the service has weaker demand, lower awareness, or a more selective customer fit, so it is worth comparing its pricing and presentation against stronger packages.`
        : "There is not enough service spread to identify underperforming services yet. More booking history will make lower-demand offers easier to spot.",
    },
    {
      type: "observation",
      title: "Ratings And Engagement",
      text: totalReviews
        ? `Customer ratings average ${avgRating} out of 5 across ${totalReviews} review(s). This gives a useful but still volume-sensitive signal: strong ratings can support premium positioning, while a small review count means each new review can move the average materially.`
        : "No review ratings are available yet. That limits visibility into customer satisfaction and makes post-service review collection more important for future analytics.",
    },
    {
      type: "recommendation",
      title: "Operational Focus",
      text: strongestPeriod
        ? `${strongestPeriod.name || strongestPeriod.method || "The strongest sales period"} is the strongest period snapshot with ${formatAnalyticsPeso(strongestPeriod.amount)} in verified sales. Admin decisions should connect this revenue pattern with booking workload so staffing, service recommendations, and follow-ups are aligned with confirmed demand.`
        : "No period stands out for verified revenue yet. Admin should continue monitoring weekly, monthly, quarterly, and annual summaries as more paid stages are verified.",
    },
  ];
}

function normalizeAnalyticsAiOutput(payload, sanitizedInput = {}) {
  const analysisType = normalizeAnalyticsItemType(payload?.analysisType || sanitizedInput.analysisType || "descriptive", "descriptive") === "predictive"
    ? "predictive"
    : "descriptive";
  const fallbackItems = buildAnalyticsFallbackItems(sanitizedInput, analysisType);
  const normalizedItems = normalizeAnalyticsAiItems(payload, analysisType);
  const seen = new Set(normalizedItems.map((item) => `${item.type}:${item.title}:${item.text}`.toLowerCase()));
  const items = [
    ...normalizedItems,
    ...fallbackItems.filter((item) => {
      const key = `${item.type}:${item.title}:${item.text}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ].slice(0, 8);
  const summaryItem = items.find((item) => item.type === "summary") || items[0] || null;
  const groupedItems = (type) => items.filter((item) => item.type === type).map((item) => item.text);

  return {
    analysisType,
    generatedAt: new Date().toISOString(),
    items,
    summary: summaryItem?.text || "",
    keyObservations: items
      .filter((item) => ["observation", "prediction", "confidence"].includes(item.type))
      .map((item) => item.text)
      .slice(0, 5),
    possibleCauses: groupedItems("possible_cause").slice(0, 4),
    recommendations: groupedItems("recommendation").slice(0, 4),
    warnings: groupedItems("watchpoint").slice(0, 4),
    insights: items.map((item) => item.text).slice(0, 6),
  };
}

function normalizeTrackingIssueNoteAiOutput(payload) {
  const stripRepeatedLead = (value, otherValues = []) => {
    const normalizedValue = normalizeAiText(value, 320);
    if (!normalizedValue) return "";

    const otherSentences = otherValues
      .map((item) => normalizeAiText(item, 320))
      .filter(Boolean);

    for (const other of otherSentences) {
      if (normalizedValue.toLowerCase() === other.toLowerCase()) {
        return "";
      }

      if (normalizedValue.toLowerCase().startsWith(`${other.toLowerCase()}. `)) {
        return normalizeAiText(normalizedValue.slice(other.length + 2), 320);
      }
    }

    return normalizedValue;
  };

  const cleanedUpIssueNote = normalizeAiText(payload?.cleanedUpIssueNote, 320);
  const technicianFriendlyNote = stripRepeatedLead(payload?.technicianFriendlyNote, [cleanedUpIssueNote]) || cleanedUpIssueNote;
  const suggestedNextAction = stripRepeatedLead(payload?.suggestedNextAction, [technicianFriendlyNote, cleanedUpIssueNote]);
  const customerSafeSummary = stripRepeatedLead(payload?.customerSafeSummary, [technicianFriendlyNote, cleanedUpIssueNote, suggestedNextAction]);

  return {
    cleanedUpIssueNote,
    technicianFriendlyNote,
    suggestedNextAction,
    customerSafeSummary,
    suggestion: technicianFriendlyNote || cleanedUpIssueNote,
  };
}

function normalizeFinancialAiOutput(payload) {
  const summary = normalizeAiText(payload?.summary, 1200);
  const dedupeAcrossSections = (values, exclusions = []) => {
    const seen = new Set(
      exclusions
        .map((value) => normalizeAiText(value, 180).toLowerCase())
        .filter(Boolean)
    );

    return normalizeAiStringList(values, { maxItems: 5, maxLength: 140 }).filter((item) => {
      const normalized = item.toLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  };

  const keyObservations = dedupeAcrossSections(payload?.keyObservations, [summary]).slice(0, 4);
  const recommendations = dedupeAcrossSections(payload?.recommendations, [summary, ...keyObservations]).slice(0, 4);
  const warnings = dedupeAcrossSections(payload?.warnings, [summary, ...keyObservations, ...recommendations]).slice(0, 3);

  return {
    summary,
    keyObservations,
    recommendations,
    warnings,
    insights: summary ? [summary] : [],
  };
}

async function handleAnalyticsAiInterpret(req, res, next) {
  try {
    const sanitizedInput = buildAnalyticsAiInput(req.body);
    if (!sanitizedInput) {
      res.status(400).json({ message: "Analytics data is required." });
      return;
    }

    const isPredictive = sanitizedInput.analysisType === "predictive";
    const promptLines = isPredictive
      ? [
          "You are an executive forecasting advisor for an auto detailing and car care business.",
          "Return only JSON with this shape: { analysisType: \"predictive\", items: [{ type, title, text }] }.",
          "Return 6 to 8 items. Each item text should be 2 to 4 sentences when the data supports it.",
          "Allowed item types are summary, prediction, observation, recommendation, watchpoint, and confidence.",
          "Focus on likely future trends using the supplied sales, booking, service, and review data.",
          "Use cautious language such as likely, may, possible, expected, or based on current trends.",
          "Do not present predictions as certain. If the data is sparse, clearly state that prediction confidence is limited.",
          "Cover likely service demand, possible sales direction, expected booking patterns, review or engagement risks, staff workload, inventory or material planning, revenue opportunities, and confidence level when the data supports it.",
          "Use exact values from the user payload when possible, but do not invent future numbers unless they are simple directional references from visible data.",
          "Avoid generic statements, avoid repeating the same point across items, and never put nested objects in the text field.",
        ]
      : [
          "You are an executive operations advisor for an auto detailing and car care business.",
          "Return only JSON with this shape: { analysisType: \"descriptive\", items: [{ type, title, text }] }.",
          "Return 6 to 8 items. Each item text should be 2 to 4 sentences when the data supports it.",
          "Allowed item types are summary, observation, possible_cause, recommendation, and watchpoint.",
          "Summarize what already happened using the supplied current analytics data.",
          "Discuss verified paid revenue only, selected period revenue, booking volume, top-performing services, lower-volume services if supplied, ratings and review count, customer engagement signals, and operational observations connected to the data.",
          "Use exact values from the user payload when possible and explain why the numbers matter to the business.",
          "Recommendations must be practical for a car care shop, such as staffing, upsell focus, service mix, scheduling, follow-up, or payment behavior actions.",
          "Avoid generic statements, avoid repeating the same point across items, and never put nested objects in the text field.",
        ];

    const aiPayload = await requestGroqStructuredJson({
      feature: isPredictive ? "analytics-predictive" : "analytics-descriptive",
      systemPrompt: promptLines.join(" "),
      userPayload: sanitizedInput,
      maxTokens: isPredictive ? 900 : 850,
      allowTextFallback: true,
    });

    if (!aiPayload.available) {
      res.json({
        ...aiPayload,
        analysisType: sanitizedInput.analysisType,
        generatedAt: new Date().toISOString(),
        items: buildAnalyticsFallbackItems(sanitizedInput, sanitizedInput.analysisType),
      });
      return;
    }

    res.json({
      available: true,
      feature: aiPayload.feature,
      message: "",
      model: aiPayload.model,
      ...normalizeAnalyticsAiOutput(aiPayload, sanitizedInput),
    });
  } catch (error) {
    next(error);
  }
}

async function handleTrackingIssueNoteAi(req, res, next) {
  try {
    const sanitizedInput = buildTrackingIssueNoteAiInput(req.body);
    if (!sanitizedInput) {
      res.status(400).json({ message: "Issue note context is required." });
      return;
    }

    const aiPayload = await requestGroqStructuredJson({
      feature: "tracking-issue-note",
      systemPrompt: [
        "You assist service advisors and technicians at an auto care shop.",
        "Return only JSON with keys: cleanedUpIssueNote, technicianFriendlyNote, suggestedNextAction, customerSafeSummary.",
        "Write concise professional automotive service wording.",
        "cleanedUpIssueNote and technicianFriendlyNote must focus on technician findings and combine multiple markers into one coherent note when needed.",
        "suggestedNextAction must be a short operational next step, not a repeat of the note.",
        "customerSafeSummary must be plain-language and customer-friendly, without copying the technician wording.",
        "Avoid repeating the same phrase across the note, next action, and customer summary.",
        "Do not invent root cause certainty, parts, pricing, timing, or guarantees.",
      ].join(" "),
      userPayload: sanitizedInput,
      maxTokens: 360,
    });

    if (!aiPayload.available) {
      res.json(aiPayload);
      return;
    }

    res.json({
      available: true,
      feature: aiPayload.feature,
      message: "",
      model: aiPayload.model,
      ...normalizeTrackingIssueNoteAiOutput(aiPayload),
    });
  } catch (error) {
    next(error);
  }
}

async function handleFinancialAiInterpret(req, res, next) {
  try {
    const sanitizedInput = buildFinancialAiInput(req.body);
    if (!sanitizedInput) {
      res.status(400).json({ message: "Financial data is required." });
      return;
    }

    const aiPayload = await requestGroqStructuredJson({
      feature: "financial-interpretation",
      systemPrompt: [
        "You are an executive financial advisor for an auto detailing and car care business.",
        "Return only JSON with keys: summary, keyObservations, recommendations, warnings.",
        "Use management-level financial language suitable for an owner or operations lead.",
        "summary must be one detailed paragraph of 5 to 7 sentences.",
        "The summary paragraph must explicitly cover revenue, expenses, revenue versus expenses, profit pressure or financial health, worker commissions when relevant, key risks or watchpoints, and one practical business recommendation.",
        "Make the paragraph sound like a financial interpretation, not a generic recap.",
        "Avoid filler, avoid vague statements, avoid numbered points, and avoid repeating the same idea in different words.",
        "If commissions are low or absent, mention them briefly only if that affects the financial picture.",
        "keyObservations, recommendations, and warnings may be returned as empty arrays unless the data supports a distinct extra point not already covered by the summary.",
      ].join(" "),
      userPayload: sanitizedInput,
      maxTokens: 520,
    });

    if (!aiPayload.available) {
      res.json(aiPayload);
      return;
    }

    res.json({
      available: true,
      feature: aiPayload.feature,
      message: "",
      model: aiPayload.model,
      ...normalizeFinancialAiOutput(aiPayload),
    });
  } catch (error) {
    next(error);
  }
}

const USER_TYPE_DEFAULT_ROLE = {
  admin: "Admin",
  staff: "Junior Detailer",
  customer: "New",
};

const RESERVED_USER_OVERRIDES = {
  "admin@allprotec.com": { userType: "Admin", role: "Admin" },
  "staff@allprotec.com": { userType: "Staff", role: "Junior Detailer" },
};

const STAFF_ROLE_OPTIONS = [
  "Admin",
  "General Manager",
  "Sales Manager",
  "Sales Associate",
  "Inventory Clerk",
  "Junior Detailer",
  "Senior Detailer",
  "Marketing",
];

const EMPLOYEE_STAFF_ROLE_OPTIONS = STAFF_ROLE_OPTIONS.filter((role) => role !== "Admin");
const EMPLOYEE_STAFF_ROLE_KEYS = new Set(EMPLOYEE_STAFF_ROLE_OPTIONS.map((role) => normalizeRoleKey(role)));
const EMPLOYEE_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const STAFF_ROLE_LABELS = new Map(
  STAFF_ROLE_OPTIONS.map((role) => [normalizeRoleKey(role), role])
);

const LEGACY_STAFF_ROLE_KEYS = new Set([
  "mechanic",
  "inspector",
  "coordinator",
  "staff",
  "detailer",
  "technician",
  "employee",
  "manager",
  "senior staff",
  "junior staff",
]);

const ROLE_OPTIONS_BY_USER_TYPE = {
  admin: new Set(STAFF_ROLE_LABELS.keys()),
  staff: new Set(STAFF_ROLE_LABELS.keys()),
  customer: new Set(["new", "returning"]),
};

function normalizeRoleKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function toTitleCase(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeUserType(userType, role) {
  const normalizedUserType = String(userType || "").trim().toLowerCase();
  if (["admin", "staff", "customer"].includes(normalizedUserType)) {
    return normalizedUserType;
  }
  if (normalizedUserType === LEGACY_CUSTOMER_ALIAS) {
    return "customer";
  }

  const normalizedRole = normalizeRoleKey(role);
  if (["admin", "owner", "co-owner"].includes(normalizedRole)) return "admin";
  if (LEGACY_STAFF_ROLE_KEYS.has(normalizedRole) || (STAFF_ROLE_LABELS.has(normalizedRole) && normalizedRole !== "admin")) return "staff";
  if (["customer", LEGACY_CUSTOMER_ALIAS, "new", "returning"].includes(normalizedRole)) return "customer";
  return "customer";
}

function normalizeSubtype(userType, role) {
  const normalizedUserType = normalizeUserType(userType, role);
  const normalizedRole = normalizeRoleKey(role);
  const validRoles = ROLE_OPTIONS_BY_USER_TYPE[normalizedUserType];

  if (validRoles?.has(normalizedRole)) {
    return normalizedRole;
  }

  if ((normalizedUserType === "admin" || normalizedUserType === "staff") && normalizedRole && !["admin", "staff", "customer"].includes(normalizedRole)) {
    return normalizedRole;
  }

  return String(USER_TYPE_DEFAULT_ROLE[normalizedUserType] || "New").toLowerCase();
}

function toDisplayUserType(userType, role) {
  return toTitleCase(normalizeUserType(userType, role));
}

function toDisplaySubtype(userType, role) {
  const normalizedSubtype = normalizeSubtype(userType, role);
  const label = STAFF_ROLE_LABELS.get(normalizedSubtype) || toTitleCase(normalizedSubtype);
  return label === "Co Owner" ? "Co-Owner" : label;
}

function isValidStaffRole(role) {
  return STAFF_ROLE_LABELS.has(normalizeRoleKey(role));
}

function normalizeStaffRoleForSave(role) {
  const normalizedRole = normalizeRoleKey(role);
  return STAFF_ROLE_LABELS.get(normalizedRole) || "";
}

function normalizeEmployeeStaffRoleForSave(role) {
  const normalizedRole = normalizeRoleKey(role);
  if (!EMPLOYEE_STAFF_ROLE_KEYS.has(normalizedRole)) return "";
  return EMPLOYEE_STAFF_ROLE_OPTIONS.find((option) => normalizeRoleKey(option) === normalizedRole) || "";
}

function sanitizeEmployeeName(value) {
  return String(value || "")
    .replace(/[^\p{L}\s'.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function getPasswordRuleError(password) {
  const value = String(password || "");
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(value)) return "Password must include at least 1 uppercase letter.";
  if (!/[a-z]/.test(value)) return "Password must include at least 1 lowercase letter.";
  if (!/\d/.test(value)) return "Password must include at least 1 number.";
  if (!/[^A-Za-z0-9]/.test(value)) return "Password must include at least 1 special character.";
  return "";
}

const MODULE_KEYS = {
  dashboard: "module.dashboard",
  analytics: "module.analytics",
  auditLogs: "module.auditLogs",
  bookings: "module.bookings",
  services: "module.services",
  serviceTracking: "module.serviceTracking",
  stockMonitoring: "module.stockMonitoring",
  paymentTracking: "module.paymentTracking",
  financialTracker: "module.financialTracker",
  engagement: "module.engagement",
  userManagement: "module.userManagement",
  detailerManagement: "module.detailerManagement",
  myWork: "module.myWork",
  profile: "module.profile",
  settings: "module.settings",
};

const ACTION_KEYS = {
  bookingView: "booking.view",
  bookingCreate: "booking.create",
  bookingUpdate: "booking.update",
  bookingDelete: "booking.delete",
  bookingAccessTokenManage: "booking.accessTokenManage",
  bookingReassignDetailer: "booking.reassignDetailer",
  detailerReassign: "detailer.reassign",
  bookingUpdateStatus: "booking.updateStatus",
  trackingView: "tracking.view",
  trackingUpdateIssueNotes: "tracking.updateIssueNotes",
  trackingUpdateWarranty: "tracking.updateWarranty",
  trackingComplete: "tracking.complete",
  paymentView: "payment.view",
  paymentVerify: "payment.verify",
  paymentOverride: "payment.override",
  stockView: "stock.view",
  stockManage: "stock.manage",
  engagementView: "engagement.view",
  engagementManage: "engagement.manage",
  usersViewStaff: "users.viewStaff",
  usersManageStaff: "users.manageStaff",
  usersPromote: "users.promote",
  usersDelete: "users.delete",
  commissionViewOwn: "commission.viewOwn",
  commissionViewAll: "commission.viewAll",
  commissionMarkPaid: "commission.markPaid",
  commissionVoid: "commission.void",
  commissionPrint: "commission.print",
  commissionExport: "commission.export",
  settingsManageSecurity: "settings.manageSecurity",
  settingsManageDownPayment: "settings.manageDownPayment",
  auditViewAll: "audit.viewAll",
  auditViewOperational: "audit.viewOperational",
  auditViewOwn: "audit.viewOwn",
  servicesManage: "services.manage",
};

const ROLE_MODULES = {
  admin: Object.values(MODULE_KEYS),
  "general manager": [
    MODULE_KEYS.dashboard,
    MODULE_KEYS.analytics,
    MODULE_KEYS.bookings,
    MODULE_KEYS.services,
    MODULE_KEYS.serviceTracking,
    MODULE_KEYS.stockMonitoring,
    MODULE_KEYS.paymentTracking,
    MODULE_KEYS.financialTracker,
    MODULE_KEYS.engagement,
    MODULE_KEYS.profile,
  ],
  "sales manager": [
    MODULE_KEYS.dashboard,
    MODULE_KEYS.analytics,
    MODULE_KEYS.bookings,
    MODULE_KEYS.services,
    MODULE_KEYS.serviceTracking,
    MODULE_KEYS.paymentTracking,
    MODULE_KEYS.engagement,
    MODULE_KEYS.profile,
  ],
  "sales associate": [
    MODULE_KEYS.dashboard,
    MODULE_KEYS.bookings,
    MODULE_KEYS.services,
    MODULE_KEYS.paymentTracking,
    MODULE_KEYS.engagement,
    MODULE_KEYS.profile,
  ],
  "inventory clerk": [
    MODULE_KEYS.dashboard,
    MODULE_KEYS.stockMonitoring,
    MODULE_KEYS.serviceTracking,
    MODULE_KEYS.bookings,
    MODULE_KEYS.auditLogs,
    MODULE_KEYS.profile,
  ],
  "junior detailer": [
    MODULE_KEYS.myWork,
    MODULE_KEYS.bookings,
    MODULE_KEYS.serviceTracking,
    MODULE_KEYS.profile,
  ],
  "senior detailer": [
    MODULE_KEYS.myWork,
    MODULE_KEYS.bookings,
    MODULE_KEYS.serviceTracking,
    MODULE_KEYS.profile,
  ],
  marketing: [
    MODULE_KEYS.dashboard,
    MODULE_KEYS.analytics,
    MODULE_KEYS.services,
    MODULE_KEYS.engagement,
    MODULE_KEYS.profile,
  ],
};

const ROLE_ACTIONS = {
  admin: Object.values(ACTION_KEYS),
  "general manager": [
    ACTION_KEYS.bookingView,
    ACTION_KEYS.bookingCreate,
    ACTION_KEYS.bookingUpdate,
    ACTION_KEYS.bookingReassignDetailer,
    ACTION_KEYS.detailerReassign,
    ACTION_KEYS.bookingUpdateStatus,
    ACTION_KEYS.trackingView,
    ACTION_KEYS.trackingUpdateIssueNotes,
    ACTION_KEYS.trackingUpdateWarranty,
    ACTION_KEYS.trackingComplete,
    ACTION_KEYS.paymentView,
    ACTION_KEYS.stockView,
    ACTION_KEYS.stockManage,
    ACTION_KEYS.engagementView,
    ACTION_KEYS.commissionViewAll,
    ACTION_KEYS.commissionPrint,
  ],
  "sales manager": [
    ACTION_KEYS.bookingView,
    ACTION_KEYS.bookingCreate,
    ACTION_KEYS.bookingUpdate,
    ACTION_KEYS.bookingUpdateStatus,
    ACTION_KEYS.trackingView,
    ACTION_KEYS.paymentView,
    ACTION_KEYS.paymentVerify,
    ACTION_KEYS.engagementView,
  ],
  "sales associate": [
    ACTION_KEYS.bookingView,
    ACTION_KEYS.bookingCreate,
    ACTION_KEYS.bookingUpdate,
    ACTION_KEYS.paymentView,
    ACTION_KEYS.engagementView,
  ],
  "inventory clerk": [
    ACTION_KEYS.bookingView,
    ACTION_KEYS.trackingView,
    ACTION_KEYS.stockView,
    ACTION_KEYS.stockManage,
    ACTION_KEYS.auditViewOperational,
  ],
  "junior detailer": [
    ACTION_KEYS.bookingView,
    ACTION_KEYS.trackingView,
    ACTION_KEYS.trackingUpdateIssueNotes,
    ACTION_KEYS.trackingUpdateWarranty,
    ACTION_KEYS.trackingComplete,
    ACTION_KEYS.commissionViewOwn,
    ACTION_KEYS.commissionPrint,
    ACTION_KEYS.commissionExport,
    ACTION_KEYS.auditViewOwn,
  ],
  "senior detailer": [
    ACTION_KEYS.bookingView,
    ACTION_KEYS.trackingView,
    ACTION_KEYS.trackingUpdateIssueNotes,
    ACTION_KEYS.trackingUpdateWarranty,
    ACTION_KEYS.trackingComplete,
    ACTION_KEYS.commissionViewOwn,
    ACTION_KEYS.commissionPrint,
    ACTION_KEYS.commissionExport,
    ACTION_KEYS.auditViewOwn,
  ],
  marketing: [
    ACTION_KEYS.engagementView,
  ],
};

function isAdmin(user) {
  return normalizeUserType(user?.userType, user?.role) === "admin";
}

function isStaff(user) {
  return normalizeUserType(user?.userType, user?.role) === "staff";
}

function normalizeRole(user) {
  return normalizeRoleKey(user?.role);
}

function getEffectiveRole(user) {
  if (isAdmin(user)) return "admin";
  const role = normalizeRole(user);
  if (role === "admin") return "general manager";
  if (role && ROLE_MODULES[role]) return role;
  return "general manager";
}

function canAccessModule(user, moduleKey) {
  if (isAdmin(user)) return true;
  if (!isStaff(user)) return moduleKey === MODULE_KEYS.profile;
  return (ROLE_MODULES[getEffectiveRole(user)] || []).includes(moduleKey);
}

function canPerformAction(user, actionKey) {
  if (isAdmin(user)) return true;
  if (!isStaff(user)) return false;
  return (ROLE_ACTIONS[getEffectiveRole(user)] || []).includes(actionKey);
}

function requiresAdminSpecialCredential(actionKey) {
  return [
    ACTION_KEYS.bookingDelete,
    ACTION_KEYS.bookingAccessTokenManage,
    ACTION_KEYS.paymentOverride,
    ACTION_KEYS.settingsManageSecurity,
    ACTION_KEYS.settingsManageDownPayment,
    ACTION_KEYS.usersPromote,
    ACTION_KEYS.usersDelete,
  ].includes(actionKey);
}

function canUseStaffSpecialCredentialForAction(user, actionKey) {
  // All staff roles share one Staff Special PIN and one Staff Special Password created by Admin. Staff special credentials are used only for staff-level protected actions that the logged-in staff role is already allowed to perform. Staff special credentials must never grant access to unauthorized modules or admin-only actions. Admin-only actions must continue to require Admin special credentials.
  return isStaff(user) && !requiresAdminSpecialCredential(actionKey) && canPerformAction(user, actionKey);
}

function denyForbidden(res) {
  res.status(403).json({ message: "You do not have permission to perform this action." });
}

function requireAction(actionKey) {
  return (req, res, next) => {
    if (!canPerformAction(req.authUser, actionKey)) {
      denyForbidden(res);
      return;
    }
    next();
  };
}

function requireModule(moduleKey) {
  return (req, res, next) => {
    if (!canAccessModule(req.authUser, moduleKey)) {
      denyForbidden(res);
      return;
    }
    next();
  };
}

function getActorDisplayNames(user = {}) {
  const names = new Set();
  [user.name, user.email].forEach((value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized) names.add(normalized);
  });
  return names;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isBookingAssignedToUser(booking, user = {}) {
  const names = getActorDisplayNames(user);
  const assignedValues = [
    booking?.assigned,
    booking?.assignedTo,
    booking?.assignedStaff,
    booking?.assignedDetailer,
    booking?.preferredDetailerName,
    booking?.preferredDetailerId,
  ].map((value) => String(value || "").trim().toLowerCase());
  return assignedValues.some((value) => value && names.has(value));
}

function isUserJuniorDetailer(user = {}) {
  return normalizeUserType(user.userType, user.role) === "staff" && normalizeRoleKey(user.role) === "junior detailer";
}

function getJuniorDetailerNames(users = []) {
  return new Set(
    users
      .filter(isUserJuniorDetailer)
      .flatMap((user) => [user.name, user.email])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

function canViewDetailerTask(user, booking, users = []) {
  if (isAdmin(user)) return true;
  const role = getEffectiveRole(user);
  if (role === "general manager") return true;
  if (role === "junior detailer") return isBookingAssignedToUser(booking, user);
  if (role === "senior detailer") {
    if (isBookingAssignedToUser(booking, user)) return true;
    const juniorDetailers = getJuniorDetailerNames(users);
    return juniorDetailers.has(String(booking?.assigned || "").trim().toLowerCase());
  }
  return false;
}

function canViewBooking(user, booking, users = []) {
  if (isAdmin(user)) return true;
  const userType = normalizeUserType(user?.userType, user?.role);
  if (userType === "customer") {
    const bookingEmail = String(booking?.customerEmail || "").trim().toLowerCase();
    const actorEmail = String(user?.email || "").trim().toLowerCase();
    const bookingCustomerId = String(booking?.customerId || "").trim();
    const actorId = String(user?.id || "").trim();
    return Boolean(
      (bookingEmail && actorEmail && bookingEmail === actorEmail) ||
      (bookingCustomerId && actorId && bookingCustomerId === actorId)
    );
  }
  if (!canPerformAction(user, ACTION_KEYS.bookingView)) return false;
  const role = getEffectiveRole(user);
  if (role === "junior detailer" || role === "senior detailer") return canViewDetailerTask(user, booking, users);
  return true;
}

function canUpdateBooking(user, booking, users = []) {
  if (isAdmin(user)) return true;
  if (!canViewBooking(user, booking, users) || !canPerformAction(user, ACTION_KEYS.bookingUpdate)) return false;
  const role = getEffectiveRole(user);
  if (role === "inventory clerk" || role === "marketing") return false;
  return true;
}

function canViewCommission(user, commission) {
  if (isAdmin(user) || canPerformAction(user, ACTION_KEYS.commissionViewAll)) return true;
  if (!canPerformAction(user, ACTION_KEYS.commissionViewOwn)) return false;
  const names = getActorDisplayNames(user);
  return names.has(String(commission?.worker || "").trim().toLowerCase());
}

function canManageCommission(user) {
  return isAdmin(user);
}

function canReassignDetailer(user) {
  return isAdmin(user);
}

function canUpdatePlaceSlot(user, booking, users = []) {
  if (isAdmin(user)) return true;
  const role = getEffectiveRole(user);
  if (role === "general manager") return true;
  if (role === "junior detailer" || role === "senior detailer") {
    return canViewDetailerTask(user, booking, users) && isBookingAssignedToUser(booking, user);
  }
  return false;
}

function isActiveDetailerUser(user = {}) {
  const status = String(user.status || user.isActive || "active").trim().toLowerCase();
  const active = user.isActive === false ? false : !["inactive", "disabled", "deactivated"].includes(status);
  const role = normalizeRoleKey(user.role);
  return active && normalizeUserType(user.userType, user.role) === "staff" && (role === "junior detailer" || role === "senior detailer");
}

function buildAuthPayload(user) {
  const userType = normalizeUserType(user.userType, user.role);
  const role = normalizeSubtype(user.userType, user.role);
  const token = signJwt({
    sub: user.id,
    email: user.email,
    userType,
    role,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      userType,
      role,
      name: user.name || `${user.first || ""} ${user.last || ""}`.trim(),
      first: user.first || "",
      last: user.last || "",
      phone: user.phone || "",
    },
  };
}

function isPasswordHash(value) {
  return String(value || "").startsWith(PASSWORD_PREFIX);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `${PASSWORD_PREFIX}${salt}$${derivedKey}`;
}

function verifyPassword(password, storedValue) {
  const rawStoredValue = String(storedValue || "");

  if (!isPasswordHash(rawStoredValue)) {
    return rawStoredValue === String(password || "");
  }

  const [, salt, savedHash] = rawStoredValue.split("$");
  if (!salt || !savedHash) return false;

  const derivedKey = crypto.scryptSync(String(password || ""), salt, 64);
  const savedBuffer = Buffer.from(savedHash, "hex");
  if (savedBuffer.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(derivedKey, savedBuffer);
}

function isBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || ""));
}

async function hashSpecialCredential(value) {
  return bcrypt.hash(String(value || ""), SPECIAL_CREDENTIAL_HASH_ROUNDS);
}

async function verifySpecialCredential(value, storedHash) {
  const hash = String(storedHash || "");
  if (!isBcryptHash(hash)) return false;
  return bcrypt.compare(String(value || ""), hash);
}

function getRawSecurityCredential(rawSetting, field) {
  if (!rawSetting || !Object.prototype.hasOwnProperty.call(rawSetting, field)) return "";
  return String(rawSetting[field] || "");
}

async function getMigratedSpecialCredentialHash(rawSetting, setting, { plainField, hashField, legacyHashField, defaultValue }) {
  const legacyPlainValue = getRawSecurityCredential(rawSetting, plainField);
  if (legacyPlainValue) {
    return hashSpecialCredential(legacyPlainValue);
  }

  const currentHash = String(setting[hashField] || rawSetting?.[hashField] || "");
  if (isBcryptHash(currentHash)) return currentHash;

  const legacyHash = String(rawSetting?.[legacyHashField] || "");
  if (legacyHash && verifyPassword(defaultValue, legacyHash)) {
    return hashSpecialCredential(defaultValue);
  }
  if (currentHash && verifyPassword(defaultValue, currentHash)) {
    return hashSpecialCredential(defaultValue);
  }

  return hashSpecialCredential(defaultValue);
}

async function getOrCreateSecuritySetting() {
  let setting = await SecuritySetting.findOne({ id: SECURITY_SETTING_ID });
  if (!setting) {
    setting = await SecuritySetting.create({
      id: SECURITY_SETTING_ID,
      adminSpecialPinHash: await hashSpecialCredential(DEFAULT_SPECIAL_PIN),
      adminSpecialPasswordHash: await hashSpecialCredential(DEFAULT_SPECIAL_PASSWORD),
      staffSpecialPinHash: await hashSpecialCredential(DEFAULT_STAFF_SPECIAL_PIN),
      staffSpecialPasswordHash: await hashSpecialCredential(DEFAULT_STAFF_SPECIAL_PASSWORD),
      requiredDownPaymentAmount: DEFAULT_REQUIRED_DOWN_PAYMENT_AMOUNT,
      updatedBy: "system",
    });
  }

  const rawSetting = await SecuritySetting.collection.findOne({ id: SECURITY_SETTING_ID });
  const migratedHashes = {
    adminSpecialPinHash: await getMigratedSpecialCredentialHash(rawSetting, setting, {
      plainField: "adminSpecialPin",
      hashField: "adminSpecialPinHash",
      legacyHashField: "specialPinHash",
      defaultValue: DEFAULT_SPECIAL_PIN,
    }),
    adminSpecialPasswordHash: await getMigratedSpecialCredentialHash(rawSetting, setting, {
      plainField: "adminSpecialPassword",
      hashField: "adminSpecialPasswordHash",
      legacyHashField: "specialPasswordHash",
      defaultValue: DEFAULT_SPECIAL_PASSWORD,
    }),
    staffSpecialPinHash: await getMigratedSpecialCredentialHash(rawSetting, setting, {
      plainField: "staffSpecialPin",
      hashField: "staffSpecialPinHash",
      legacyHashField: "",
      defaultValue: DEFAULT_STAFF_SPECIAL_PIN,
    }),
    staffSpecialPasswordHash: await getMigratedSpecialCredentialHash(rawSetting, setting, {
      plainField: "staffSpecialPassword",
      hashField: "staffSpecialPasswordHash",
      legacyHashField: "",
      defaultValue: DEFAULT_STAFF_SPECIAL_PASSWORD,
    }),
  };

  let changed = false;
  for (const [hashField, hashValue] of Object.entries(migratedHashes)) {
    if (setting[hashField] !== hashValue) {
      setting[hashField] = hashValue;
      changed = true;
    }
  }
  if (!Number.isFinite(Number(setting.requiredDownPaymentAmount)) || Number(setting.requiredDownPaymentAmount) < 0) {
    setting.requiredDownPaymentAmount = DEFAULT_REQUIRED_DOWN_PAYMENT_AMOUNT;
    changed = true;
  }
  if (changed) await setting.save();

  await SecuritySetting.collection.updateOne(
    { id: SECURITY_SETTING_ID },
    {
      $set: {
        requiredDownPaymentAmount: Math.max(0, Number(setting.requiredDownPaymentAmount) || 0),
      },
      $unset: {
        specialPinHash: "",
        specialPasswordHash: "",
        adminSpecialPin: "",
        adminSpecialPassword: "",
        staffSpecialPin: "",
        staffSpecialPassword: "",
      },
    }
  );

  return setting;
}

function getSafeSecuritySettings(setting = {}) {
  return {
    requiredDownPaymentAmount: Math.max(0, roundMoney(setting?.requiredDownPaymentAmount || 0)),
    updatedAt: setting?.updatedAt || "",
  };
}

async function verifyAdminAccountPassword(email, currentPassword) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !currentPassword) return null;

  const user = await User.findOne({ email: normalizedEmail });
  if (!user || normalizeUserType(user.userType, user.role) !== "admin") return null;
  return verifyPassword(currentPassword, user.password) ? user : null;
}

async function getRequestActorType(req) {
  const actorEmail = String(req.body?.auditUser || req.query?.auditUser || "").trim().toLowerCase();
  if (!actorEmail) return "";
  const actor = await User.findOne({ email: actorEmail }).lean();
  return actor ? normalizeUserType(actor.userType, actor.role) : "";
}

async function blockStaffEngagementMutation(req, res) {
  const actorType = await getRequestActorType(req);
  if (actorType === "staff" && !canPerformAction(req.authUser, ACTION_KEYS.engagementManage)) {
    res.status(403).json({ message: "You do not have permission to manage engagement records." });
    return true;
  }
  return false;
}

async function validateSpecialCredential(mode, value, scope = "admin") {
  const setting = await getOrCreateSecuritySetting();
  const credentialMode = String(mode || "pin").trim().toLowerCase();
  const credentialScope = String(scope || "admin").trim().toLowerCase() === "staff" ? "staff" : "admin";
  const storedValue = credentialScope === "staff"
    ? (credentialMode === "password" ? setting.staffSpecialPasswordHash : setting.staffSpecialPinHash)
    : (credentialMode === "password" ? setting.adminSpecialPasswordHash : setting.adminSpecialPinHash);
  return verifySpecialCredential(value, storedValue);
}

async function requireSpecialCredentialForRequest(req, { mode = "pin", scope = "", actionKey = "" } = {}) {
  const actorType = normalizeUserType(req.authUser?.userType, req.authUser?.role);
  const credentialScope = scope || (actorType === "staff" ? "staff" : "admin");
  const credentialMode = String(mode || "pin").trim().toLowerCase() === "password" ? "password" : "pin";
  const value = credentialMode === "password"
    ? String(req.body?.specialPassword || req.body?.specialCredential || "")
    : String(req.body?.specialPin || req.body?.specialCredential || "");

  if (!value) {
    const error = new Error(`Special ${credentialMode === "password" ? "password" : "PIN"} is required.`);
    error.statusCode = 401;
    throw error;
  }

  // All staff roles share one Staff Special PIN and one Staff Special Password created by Admin. Staff special credentials are used only for staff-level protected actions that the logged-in staff role is already allowed to perform. Staff special credentials must never grant access to unauthorized modules or admin-only actions. Admin-only actions must continue to require Admin special credentials.
  if (credentialScope === "admin" && actorType !== "admin") {
    const error = new Error("Admin special credentials are required for this action.");
    error.statusCode = 403;
    throw error;
  }
  if (credentialScope === "staff" && (!actionKey || !canUseStaffSpecialCredentialForAction(req.authUser, actionKey))) {
    const error = new Error("Staff special credentials cannot authorize this action.");
    error.statusCode = 403;
    throw error;
  }

  const valid = await validateSpecialCredential(credentialMode, value, credentialScope);
  if (!valid) {
    const error = new Error(`Incorrect ${credentialScope} special ${credentialMode === "password" ? "password" : "PIN"}.`);
    error.statusCode = 401;
    throw error;
  }
}

function requireAccountNameMatch(req) {
  const expectedName = String(req.authUser?.name || req.authUser?.email || "").trim().toLowerCase();
  const submittedName = String(req.body?.accountName || "").trim().toLowerCase();

  if (!expectedName || submittedName !== expectedName) {
    const error = new Error("Entered account name does not match the logged-in account.");
    error.statusCode = 401;
    throw error;
  }
}

function sanitizeUser(user) {
  if (!user) return user;
  const serializedUser = typeof user.toObject === "function" ? user.toObject() : { ...user };
  delete serializedUser.password;
  delete serializedUser.adminSpecialPinHash;
  delete serializedUser.adminSpecialPasswordHash;
  delete serializedUser.staffSpecialPinHash;
  delete serializedUser.staffSpecialPasswordHash;
  return serializedUser;
}

function isActiveAccount(user = {}) {
  return String(user.status || "active").trim().toLowerCase() === "active";
}

async function countActiveAdmins(excludeUserId = "") {
  const users = await User.find().lean();
  return users.filter((user) => {
    if (excludeUserId && String(user.id || "") === String(excludeUserId)) return false;
    return normalizeUserType(user.userType, user.role) === "admin" && isActiveAccount(user);
  }).length;
}

function getUserIdentityValues(user = {}) {
  return {
    id: String(user.id || "").trim(),
    email: String(user.email || "").trim().toLowerCase(),
    name: String(user.name || `${user.first || ""} ${user.last || ""}`.trim()).trim(),
  };
}

async function countProtectedUserRelationships(user = {}) {
  const identity = getUserIdentityValues(user);
  const detailerNamePattern = identity.name ? new RegExp(`^${escapeRegExp(identity.name)}$`, "i") : null;
  const emailPattern = identity.email ? new RegExp(`^${escapeRegExp(identity.email)}$`, "i") : null;
  const bookingCustomerOr = [
    identity.id ? { customerId: identity.id } : null,
    identity.email ? { customerEmail: identity.email } : null,
    identity.name ? { customer: detailerNamePattern } : null,
    identity.name ? { assigned: detailerNamePattern } : null,
    identity.id ? { preferredDetailerId: identity.id } : null,
    identity.name ? { preferredDetailerName: detailerNamePattern } : null,
  ].filter(Boolean);
  const paymentOr = [
    identity.email ? { customerEmail: identity.email } : null,
    identity.name ? { customer: detailerNamePattern } : null,
  ].filter(Boolean);
  const reviewOr = [
    identity.email ? { customerEmail: identity.email } : null,
    identity.name ? { customer: detailerNamePattern } : null,
  ].filter(Boolean);
  const rewardOr = [
    identity.id ? { customerId: identity.id } : null,
    identity.email ? { customerEmail: identity.email } : null,
    identity.name ? { customerName: detailerNamePattern } : null,
  ].filter(Boolean);
  const commissionOr = [
    identity.name ? { worker: detailerNamePattern } : null,
    identity.email ? { worker: emailPattern } : null,
  ].filter(Boolean);
  const auditOr = [
    identity.id ? { targetId: identity.id } : null,
    identity.email ? { userId: identity.email } : null,
    identity.name ? { userId: detailerNamePattern } : null,
  ].filter(Boolean);

  const [
    bookingCount,
    paymentCount,
    reviewCount,
    rewardCount,
    commissionCount,
    auditCount,
  ] = await Promise.all([
    bookingCustomerOr.length ? Booking.countDocuments({ $or: bookingCustomerOr }) : 0,
    paymentOr.length ? Payment.countDocuments({ $or: paymentOr }) : 0,
    reviewOr.length ? Review.countDocuments({ $or: reviewOr }) : 0,
    rewardOr.length ? CustomerReward.countDocuments({ $or: rewardOr }) : 0,
    commissionOr.length ? Commission.countDocuments({ $or: commissionOr }) : 0,
    auditOr.length ? AuditLog.countDocuments({ $or: auditOr }) : 0,
  ]);

  return {
    bookings: bookingCount,
    payments: paymentCount,
    reviews: reviewCount,
    rewards: rewardCount,
    savedVehicles: Array.isArray(user.cars) ? user.cars.length : 0,
    trackingWarranty: bookingCount,
    detailerAssignments: bookingCount,
    commissions: commissionCount,
    auditLogs: auditCount,
    total:
      bookingCount +
      paymentCount +
      reviewCount +
      rewardCount +
      (Array.isArray(user.cars) ? user.cars.length : 0) +
      commissionCount +
      auditCount,
  };
}

async function requireAdminSpecialCredentialWithAudit(req, actionKey, targetId) {
  try {
    await requireSpecialCredentialForRequest(req, { mode: "password", scope: "admin", actionKey });
  } catch (error) {
    await recordAudit(req.authUser?.email || req.body?.auditUser, "Failed special credential verification", targetId, {
      targetType: "User",
      actionKey,
      result: "denied",
      reason: error.statusCode === 401 ? "invalid credential" : "forbidden credential scope",
    });
    throw error;
  }
}

function sanitizePreferredDetailerUser(user) {
  if (!user) return user;
  return {
    id: user.id || String(user._id || ""),
    _id: user.id || String(user._id || ""),
    name: user.name || [user.first, user.last].filter(Boolean).join(" ").trim(),
    fullName: user.name || [user.first, user.last].filter(Boolean).join(" ").trim(),
    userType: "Staff",
    role: toDisplaySubtype(user.userType, user.role),
    status: user.status || "active",
    isActive: true,
  };
}

function buildTrackingDto(booking = {}) {
  return {
    id: booking.id,
    vehicle: booking.vehicle,
    carSize: booking.carSize || "",
    plate: booking.plate || "",
    service: booking.service,
    assigned: booking.assigned || "",
    date: booking.date,
    time: booking.time || "",
    status: booking.status,
    issueNote: booking.issueNote || "",
    issueTypes: booking.issueTypes || [],
    issueMarkers: booking.issueMarkers || [],
    updatedAt: booking.updatedAt,
  };
}

function buildWarrantyDto(booking = {}) {
  const released = isCompletedStatus(booking.status) && Boolean(booking.warrantyReleased);
  if (!released) {
    return {
      id: booking.id,
      status: booking.status,
      warrantyReleased: false,
      message: "Warranty document will be available once released by staff/admin.",
    };
  }

  return {
    id: booking.id,
    vehicle: booking.vehicle,
    carSize: booking.carSize || "",
    plate: booking.plate || "",
    service: booking.service,
    assigned: booking.assigned || "",
    date: booking.date,
    time: booking.time || "",
    status: booking.status,
    warrantyChecklist: booking.warrantyChecklist || "",
    warrantyChecklistItems: booking.warrantyChecklistItems || [],
    warrantyCoveragePackage: booking.warrantyCoveragePackage || "",
    warrantyAcknowledgement: booking.warrantyAcknowledgement || {},
    warrantyReleased: true,
    warrantyReleasedAt: booking.warrantyReleasedAt || "",
    updatedAt: booking.updatedAt,
  };
}

function rejectInvalidPublicAccess(res) {
  res.status(404).json({ message: "Public access record not found." });
}

function normalizeCustomerCars(cars) {
  if (!Array.isArray(cars)) return [];

  const allowedSizes = new Set([
    "Sedan / Small Car",
    "Midsize / Pickup / MPV",
    "SUV",
    "XL / Van / Semi Truck",
  ]);
  const seen = new Set();
  return cars
    .map((car) => {
      const brand = String(car?.brand || car?.make || "").trim();
      const rawVehicle = String(car?.vehicle || "").trim();
      const vehicle = rawVehicle || brand;
      const rawSize = String(car?.size || "").trim();
      const size = allowedSizes.has(rawSize) ? rawSize : "";
      const plate = String(car?.plate || "").trim().toUpperCase();
      return { brand, vehicle, size, plate };
    })
    .filter((car) => car.vehicle && car.plate)
    .filter((car) => {
      const key = `${car.brand.toLowerCase()}::${car.vehicle.toLowerCase()}::${car.plate.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizePlateNumber(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 16);
}

function getCustomerCarKey(car = {}) {
  return [
    String(car.vehicle || car.model || "").trim().toLowerCase(),
    normalizePlateNumber(car.plate),
  ].join("::");
}

function validateVehicleSnapshotFields({ vehicle = "", carSize = "", plate = "" } = {}) {
  if (!String(vehicle || "").trim()) throwValidationError("Vehicle model is required.");
  if (!String(carSize || "").trim()) throwValidationError("Car size is required.");
  if (!normalizePlateNumber(plate)) throwValidationError("Plate number is required.");
}

async function resolveBookingCustomerForRequest(req, { isCustomerRequested = false } = {}) {
  if (isCustomerRequested) {
    const customer = await User.findOne({ id: req.authUser?.id }).lean();
    if (!customer || normalizeUserType(customer.userType, customer.role) !== "customer" || !isActiveAccount(customer)) {
      throwValidationError("Active customer account is required.", 403);
    }
    return customer;
  }

  const email = String(req.body.customerEmail || "").trim().toLowerCase();
  if (!email) return null;

  const customer = await User.findOne({ email }).lean();
  if (!customer || normalizeUserType(customer.userType, customer.role) !== "customer" || !isActiveAccount(customer)) {
    throwValidationError("Please choose an active registered customer.");
  }
  return customer;
}

async function validateVehicleOwnershipForBooking({ req, customer = null, isCustomerRequested = false }) {
  const vehicle = String(req.body.vehicle || "").trim();
  const carSize = String(req.body.carSize || "").trim();
  const plate = normalizePlateNumber(req.body.plate);
  validateVehicleSnapshotFields({ vehicle, carSize, plate });

  const owner = customer || (isCustomerRequested ? await User.findOne({ id: req.authUser?.id }).lean() : null);
  const ownerCars = normalizeCustomerCars(owner?.cars || []);
  const submittedKey = getCustomerCarKey({ vehicle, plate });

  if (ownerCars.length && !ownerCars.some((car) => getCustomerCarKey(car) === submittedKey)) {
    throwValidationError("Selected vehicle does not belong to the customer.");
  }

  const conflictingOwner = await User.findOne({
    id: { $ne: owner?.id || req.authUser?.id || "" },
    userType: /^customer$/i,
    status: { $nin: ["inactive", "deactivated", "deleted"] },
    "cars.plate": plate,
  }).lean();
  if (conflictingOwner) {
    throwValidationError("Selected vehicle belongs to another customer.");
  }

  return { vehicle, carSize, plate };
}

function getVehicleCache(key) {
  const cached = vehicleReferenceCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts > VEHICLE_REFERENCE_CACHE_TTL_MS) {
    vehicleReferenceCache.delete(key);
    return null;
  }
  return cached.value;
}

function setVehicleCache(key, value) {
  vehicleReferenceCache.set(key, { ts: Date.now(), value });
  return value;
}

async function fetchVehicleReference(pathname) {
  const response = await fetch(`${VEHICLE_API_BASE_URL}${pathname}`);
  if (!response.ok) {
    const error = new Error("Could not load vehicle reference data.");
    error.statusCode = 502;
    throw error;
  }

  const data = await response.json();
  return Array.isArray(data?.Results) ? data.Results : [];
}

async function getVehicleBrands() {
  const cacheKey = "brands";
  const cached = getVehicleCache(cacheKey);
  if (cached) return cached;

  const brands = (await fetchVehicleReference("/getallmakes?format=json"))
    .map((item) => String(item?.Make_Name || "").trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort((left, right) => left.localeCompare(right));

  return setVehicleCache(cacheKey, brands);
}

async function getVehicleModelsForBrand(brand) {
  const normalizedBrand = String(brand || "").trim();
  if (!normalizedBrand) {
    const error = new Error("Car brand is required.");
    error.statusCode = 400;
    throw error;
  }

  const cacheKey = `models:${normalizedBrand.toLowerCase()}`;
  const cached = getVehicleCache(cacheKey);
  if (cached) return cached;

  const models = (await fetchVehicleReference(`/GetModelsForMake/${encodeURIComponent(normalizedBrand)}?format=json`))
    .map((item) => String(item?.Model_Name || "").trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort((left, right) => left.localeCompare(right));

  return setVehicleCache(cacheKey, models);
}

function createOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!name || !domain) return email || "";
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone) {
  const digits = String(phone || "");
  if (digits.length < 4) return digits;
  return `${digits.slice(0, 2)}******${digits.slice(-3)}`;
}

function getConfiguredEmailProvider() {
  if (EMAIL_PROVIDER === "resend") return "resend";
  if (EMAIL_PROVIDER === "smtp" || EMAIL_PROVIDER === "gmail" || EMAIL_PROVIDER === "nodemailer") {
    return "smtp";
  }

  return IS_PRODUCTION ? "resend" : "smtp";
}

async function getSmtpMailTransport() {
  if (!SMTP_EMAIL || !SMTP_APP_PASSWORD || !EMAIL_FROM) {
    const error = new Error(
      "SMTP email is not configured. Add EMAIL_PROVIDER=smtp, EMAIL_USER, EMAIL_PASS, and EMAIL_FROM to the server environment. Legacy GOOGLE_SMTP_EMAIL, GOOGLE_SMTP_APP_PASSWORD, and GOOGLE_SMTP_FROM names are also supported."
    );
    error.statusCode = 503;
    throw error;
  }

  if (!smtpMailTransportPromise) {
    smtpMailTransportPromise = (async () => {
      const transport = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: SMTP_EMAIL,
          pass: SMTP_APP_PASSWORD,
        },
      });

      await transport.verify();
      return transport;
    })().catch((error) => {
      smtpMailTransportPromise = null;
      throw error;
    });
  }

  return smtpMailTransportPromise;
}

async function sendEmail({ to, subject, text, html }) {
  if (!EMAIL_FROM) {
    const error = new Error("Email sender is not configured. Add EMAIL_FROM to the server environment.");
    error.publicMessage = "Email provider configuration is missing. EMAIL_FROM is not set.";
    error.statusCode = 503;
    throw error;
  }

  const provider = getConfiguredEmailProvider();
  if (provider === "resend") {
    if (!RESEND_API_KEY) {
      const error = new Error(
        "Resend email is not configured. Add EMAIL_PROVIDER=resend, RESEND_API_KEY, and EMAIL_FROM to the server environment."
      );
      error.publicMessage = "Email provider configuration is missing. RESEND_API_KEY is not set.";
      error.statusCode = 503;
      throw error;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      let details = "";
      try {
        const data = await response.json();
        details = data?.message || data?.error || JSON.stringify(data);
      } catch (error) {
        details = await response.text().catch(() => "");
      }

      console.error("[email] Resend rejected send request.", {
        status: response.status,
        provider,
        from: EMAIL_FROM,
        to: maskEmail(to),
        details,
      });
      const error = new Error(
        `Resend email send failed. Check RESEND_API_KEY, EMAIL_FROM/domain verification, and recipient address.${details ? ` Provider response: ${details}` : ""}`
      );
      error.publicMessage = details
        ? `Email provider rejected the send request: ${details}`
        : "Email provider rejected the send request.";
      error.statusCode = 503;
      throw error;
    }

    return response.json().catch(() => ({}));
  }

  const transport = await getSmtpMailTransport();
  return transport.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    text,
    html,
  });
}

function wrapEmailDeliveryError(label, error) {
  console.error(`[email] ${label} failed:`, error.message || error);
  const wrappedError = new Error(
    error.publicMessage || `Could not send the ${label}. Check the configured email provider settings.`
  );
  wrappedError.statusCode = error.statusCode || 503;
  return wrappedError;
}

async function sendSignupOtpEmail({ email, otp }) {
  try {
    await sendEmail({
      to: email,
      subject: "Your All Pro-Tec signup verification code",
      text: [
        "Welcome to All Pro-Tec.",
        "",
        `Your signup verification code is: ${otp}`,
        "",
        "This code will expire in 10 minutes.",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
      html: `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
          <h2 style="margin: 0 0 12px;">Welcome to All Pro-Tec</h2>
          <p style="margin: 0 0 14px;">Use this one-time password to complete your signup:</p>
          <div style="display: inline-block; padding: 12px 18px; border-radius: 12px; background: #fff8db; border: 1px solid #e7c76f; font-size: 28px; font-weight: 700; letter-spacing: 6px;">
            ${otp}
          </div>
          <p style="margin: 16px 0 0;">This code will expire in 10 minutes.</p>
          <p style="margin: 8px 0 0; color: #64748b;">If you did not request this, you can ignore this email.</p>
        </div>
      `,
    });
  } catch (error) {
    throw wrapEmailDeliveryError("signup OTP email", error);
  }

  return {
    channel: "email",
    destination: maskEmail(email),
  };
}

async function sendPasswordChangeOtpEmail({ email, otp }) {
  try {
    await sendEmail({
      to: email,
      subject: "Your AllProtec password change verification code",
      text: [
        "Password Change Verification",
        "",
        `Your password change verification code is: ${otp}`,
        "",
        "This code will expire in 10 minutes.",
      ].join("\n"),
      html: `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
          <h2 style="margin: 0 0 12px;">Password Change Verification</h2>
          <p style="margin: 0 0 14px;">Use this one-time password to verify your password change request:</p>
          <div style="display: inline-block; padding: 12px 18px; border-radius: 12px; background: #f8fafc; border: 1px solid #dbe4f0; font-size: 24px; font-weight: 700; letter-spacing: 6px;">
            ${otp}
          </div>
          <p style="margin: 14px 0 0; color: #475569;">This code will expire in 10 minutes.</p>
        </div>
      `,
    });
  } catch (error) {
    throw wrapEmailDeliveryError("password change OTP email", error);
  }

  return {
    channel: "email",
    destination: maskEmail(email),
  };
}

async function sendOtpThroughChannel({ channel, email, phone, otp }) {
  if (String(channel || "").trim().toLowerCase() !== "email") {
    const error = new Error("Signup OTP is currently available through email only.");
    error.statusCode = 400;
    throw error;
  }

  console.log(`[OTP EMAIL] Sending signup OTP to ${email}`);
  return sendSignupOtpEmail({ email, otp, phone });
}

async function sendPasswordChangeOtpThroughChannel({ channel, email, phone, otp }) {
  if (channel !== "email") {
    const error = new Error("Password change OTP is currently available through email only.");
    error.statusCode = 400;
    throw error;
  }

  console.log(`[OTP EMAIL] Sending password change OTP to ${email}`);
  return sendPasswordChangeOtpEmail({ email, otp, phone });
}

async function recordAudit(userId, action, targetId, meta) {
  await AuditLog.create({
    id: createId("AUD"),
    userId: userId || "system",
    action,
    targetId: targetId || "",
    ts: toTimestamp(),
    meta: meta || {},
  });
}

function formatAuditDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Submission time not recorded";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function sanitizePaymentReference(value) {
  return String(value || "")
    .trim()
    .replace(/[^\p{L}\p{N}\s._:-]/gu, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function sanitizeProofFileName(value) {
  return path.basename(String(value || "").trim()).replace(/[^\w .()_-]/g, "").slice(0, 120);
}

function sanitizeOcrAdvisoryStatus(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (normalized === "matched") return "matched_advisory";
  if (normalized === "not matched") return "not_matched_advisory";
  if (normalized === "unreadable") return "unreadable_advisory";
  if (normalized === "no proof") return "no_proof_advisory";
  if (normalized === "no reference") return "no_reference_advisory";
  return "";
}

function sanitizeOcrAdvisoryText(value) {
  return String(value || "")
    .replace(/[^\p{L}\p{N}\s.,:;#/_-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function validateProofImageInput(proofImage, proofFileName, required) {
  const image = String(proofImage || "").trim();
  const fileName = sanitizeProofFileName(proofFileName);
  if (!required) return { proofImage: "", proofFileName: "" };
  if (!image) {
    const error = new Error("Proof of payment is required for this payment method.");
    error.statusCode = 400;
    throw error;
  }
  if (/\.\.|[<>]/.test(image) || /\.\./.test(fileName)) {
    const error = new Error("Payment proof metadata is invalid.");
    error.statusCode = 400;
    throw error;
  }
  const isSupportedDataUri = /^data:image\/(png|jpe?g|webp);base64,/i.test(image);
  const isStoredOrRemoteImage = /^https?:\/\/[^<>\s]+$/i.test(image) || /^\/?uploads\/[^<>\s]+$/i.test(image);
  if (!isSupportedDataUri && !isStoredOrRemoteImage) {
    const error = new Error("Payment proof must be a supported image file.");
    error.statusCode = 400;
    throw error;
  }
  return { proofImage: image, proofFileName: fileName };
}

function buildPaymentProofAuditMeta(payment = {}, stage, submittedAt, details = {}) {
  const stageLabel = stage === "finalPayment" ? "Full Payment / Remaining Balance" : "Down Payment";
  const method = details.method || "";
  const reference = details.reference || "";
  const proofFileName = details.proofFileName || "";
  const referenceValidationResult = details.referenceValidationResult || "";
  const referenceValidationLabel = referenceValidationResult === "matched"
    ? "Reference matched"
    : referenceValidationResult === "cash_not_required"
      ? "Cash payment - reference check not required"
      : referenceValidationResult || "Reference validation not available";
  const submittedAtDisplay = formatAuditDateTime(submittedAt);
  const actionText = stage === "finalPayment" ? "full-payment/remaining-balance" : "down-payment";

  return {
    type: "payment-proof-submitted",
    paymentStage: stageLabel,
    bookingId: payment.bookingId || "",
    customer: payment.customer || "",
    customerEmail: payment.customerEmail || "",
    proofSubmittedAt: submittedAt instanceof Date ? submittedAt.toISOString() : "",
    proofSubmittedAtDisplay: submittedAtDisplay,
    method,
    reference,
    proofFileName,
    referenceValidationResult,
    message: `Customer submitted ${actionText} proof for Booking ${payment.bookingId || payment.id || ""} on ${submittedAtDisplay}. Method: ${method || "-"}. Reference: ${reference || "-"}. Proof file: ${proofFileName || "-"}. Validation: ${referenceValidationLabel}.`,
  };
}

function addDownPaymentDeadline(createdAt = new Date()) {
  const base = createdAt instanceof Date && !Number.isNaN(createdAt.getTime()) ? createdAt : new Date();
  return new Date(base.getTime() + DOWN_PAYMENT_DEADLINE_MS);
}

function hasDownPaymentSubmission(payment = {}) {
  const status = normalizePaymentStageStatus(payment.downPaymentStatus, "Pending");
  return Boolean(
    status === "For Verification" ||
    status === "Paid" ||
    payment.downPaymentProofSubmittedAt ||
    String(payment.downPaymentProofUrl || payment.proofImage || "").trim() ||
    String(payment.downPaymentProofName || payment.proofFileName || "").trim()
  );
}

function isPendingDownPaymentDeadlineStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "pending" || normalized === "pending confirmation" || normalized === "";
}

function shouldWarnOrCancelForDownPaymentDeadline(payment = {}, booking = {}) {
  if (!payment || payment.downPaymentRequired !== true) return false;
  if (!payment.downPaymentDueAt) return false;
  if (!booking || !isPendingDownPaymentDeadlineStatus(booking.status)) return false;
  const status = normalizePaymentStageStatus(payment.downPaymentStatus, "Pending");
  if (status === "Paid" || status === "For Verification" || status === "Not Required") return false;
  return !hasDownPaymentSubmission(payment);
}

async function recordCustomerNotification(title, bookingOrPayment = {}, message, extraMeta = {}) {
  await recordAudit("system", title, bookingOrPayment.bookingId || bookingOrPayment.id || "", {
    customer: bookingOrPayment.customer || "",
    customerEmail: bookingOrPayment.customerEmail || "",
    message,
    ...extraMeta,
  });
}

async function runDownPaymentDeadlineWorkflow() {
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + DOWN_PAYMENT_ONE_HOUR_MS);

  const reminderCandidates = await Payment.find({
    downPaymentRequired: true,
    downPaymentDueAt: { $ne: null, $gt: now, $lte: oneHourFromNow },
    downPaymentReminderSentAt: null,
    autoCancelledForNoDownPaymentProof: { $ne: true },
  }).limit(100);

  for (const payment of reminderCandidates) {
    const normalizedPayment = normalizePaymentStageFields(payment);
    const booking = await Booking.findOne({ id: normalizedPayment.bookingId }).lean();
    if (!shouldWarnOrCancelForDownPaymentDeadline(normalizedPayment, booking)) continue;

    payment.downPaymentReminderSentAt = now;
    await payment.save();
    await recordCustomerNotification(
      "1 hour left to submit down payment",
      normalizedPayment,
      "You only have 1 hour left to submit your down-payment proof before your booking slot expires.",
      { type: "down-payment-deadline-reminder", bookingId: normalizedPayment.bookingId }
    );
  }

  const expiredCandidates = await Payment.find({
    downPaymentRequired: true,
    downPaymentDueAt: { $ne: null, $lte: now },
    autoCancelledForNoDownPaymentProof: { $ne: true },
  }).limit(100);

  for (const payment of expiredCandidates) {
    const normalizedPayment = normalizePaymentStageFields(payment);
    const booking = await Booking.findOne({ id: normalizedPayment.bookingId });
    const bookingObject = booking?.toObject ? booking.toObject() : booking;
    if (!shouldWarnOrCancelForDownPaymentDeadline(normalizedPayment, bookingObject)) continue;

    booking.status = "Cancelled";
    booking.cancellationReason = DOWN_PAYMENT_AUTO_CANCEL_REASON;
    booking.cancelReason = DOWN_PAYMENT_AUTO_CANCEL_REASON;
    booking.autoCancelledForNoDownPaymentProof = true;
    await booking.save();

    payment.downPaymentStatus = "Rejected";
    payment.downPaymentExpiredAt = now;
    payment.autoCancelledForNoDownPaymentProof = true;
    payment.cancellationReason = DOWN_PAYMENT_AUTO_CANCEL_REASON;
    payment.status = "Rejected";
    await payment.save();
    if (booking.promoId) {
      await decrementPromoUsage(booking.promoId);
    }
    if (booking.rewardId) {
      await releaseCustomerRewardReservation({
        rewardId: booking.rewardId,
        bookingId: booking.id,
        paymentId: payment.id || "",
        reason: DOWN_PAYMENT_AUTO_CANCEL_REASON,
        auditUser: "system",
      });
    }

    await recordCustomerNotification(
      "Booking cancelled",
      normalizedPayment,
      "Your booking was cancelled because no down-payment proof was submitted within 24 hours.",
      {
        type: "down-payment-auto-cancelled",
        bookingId: normalizedPayment.bookingId,
        reason: DOWN_PAYMENT_AUTO_CANCEL_REASON,
      }
    );
    await recordAudit("system", "Auto-cancelled booking", booking.id, {
      customer: booking.customer,
      customerEmail: booking.customerEmail || "",
      status: "Cancelled",
      reason: DOWN_PAYMENT_AUTO_CANCEL_REASON,
      autoCancelledForNoDownPaymentProof: true,
    });
  }
}

function startDownPaymentDeadlineMonitor() {
  const runSafely = () => {
    runDownPaymentDeadlineWorkflow().catch((error) => {
      console.error("[down-payment-deadline] workflow failed", {
        message: error.message || "Unknown error",
      });
    });
  };
  runSafely();
  return setInterval(runSafely, DOWN_PAYMENT_REMINDER_INTERVAL_MS);
}

function getServiceAuditAction(previousService, nextService) {
  if (
    previousService &&
    typeof nextService.enabled === "boolean" &&
    Boolean(previousService.enabled) !== Boolean(nextService.enabled)
  ) {
    return nextService.enabled ? "Enabled service" : "Disabled service";
  }

  return "Updated service";
}

function normalizeServiceType(serviceType, name = "", desc = "") {
  const raw = String(serviceType || "").trim().toLowerCase();
  if (raw === "package" || raw === "basic service") {
    return raw === "package" ? "Package" : "Basic Service";
  }

  const combined = `${String(name || "").trim()} ${String(desc || "").trim()}`.toLowerCase();
  if (
    combined.includes("+") ||
    combined.includes(" package") ||
    combined.includes("bundle") ||
    combined.includes("combo")
  ) {
    return "Package";
  }

  return "Basic Service";
}

const CAR_SIZE_PRICE_LABELS = {
  "Sedan / Small Car": "sedanSmallCar",
  "Midsize / Pickup / MPV": "midsizePickupMpv",
  SUV: "suv",
  "XL / Van / Semi Truck": "xlVanSemiTruck",
};

const SERVICE_CONSUMABLE_SIZE_KEYS = Object.values(CAR_SIZE_PRICE_LABELS);

function normalizeCarSizeLabel(value) {
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
  return "";
}

function buildServicePriceBySize(priceBySize, fallbackPrice = 0) {
  const basePrice = Math.max(0, Number(fallbackPrice) || 0);
  const source = priceBySize && typeof priceBySize === "object" ? priceBySize : {};

  return {
    sedanSmallCar: Math.max(0, Number(source.sedanSmallCar) || basePrice),
    midsizePickupMpv: Math.max(0, Number(source.midsizePickupMpv) || basePrice),
    suv: Math.max(0, Number(source.suv) || basePrice),
    xlVanSemiTruck: Math.max(0, Number(source.xlVanSemiTruck) || basePrice),
  };
}

function hydrateService(service) {
  const baseService = service?.toObject ? service.toObject() : { ...(service || {}) };
  const priceBySize = buildServicePriceBySize(baseService.priceBySize, baseService.price);
  const consumablesBySize = buildServiceConsumablesBySize(baseService.consumablesBySize, baseService.consumables);
  const allowedArrivalTimes = normalizeAllowedArrivalTimes(baseService.allowedArrivalTimes, baseService.mins);
  return {
    ...baseService,
    price: Math.max(0, Number(baseService.price) || priceBySize.sedanSmallCar || 0),
    priceBySize,
    consumablesBySize,
    allowedArrivalTimes,
  };
}

function getServicePriceForCarSize(service, carSize, fallbackPrice = 0) {
  const hydratedService = hydrateService(service);
  const normalizedCarSize = normalizeCarSizeLabel(carSize);
  const sizeKey = CAR_SIZE_PRICE_LABELS[normalizedCarSize];
  if (sizeKey) {
    return Math.max(0, Number(hydratedService.priceBySize[sizeKey]) || 0);
  }

  return Math.max(0, Number(fallbackPrice) || hydratedService.price || hydratedService.priceBySize.sedanSmallCar || 0);
}

function buildServiceConsumablesBySize(consumablesBySize, legacyConsumables = []) {
  const normalized = {};
  const source =
    consumablesBySize instanceof Map
      ? Object.fromEntries(consumablesBySize.entries())
      : consumablesBySize && typeof consumablesBySize === "object"
        ? consumablesBySize
        : {};

  Object.entries(source).forEach(([name, quantities]) => {
    const itemName = String(name || "").trim();
    if (!itemName) return;
    normalized[itemName] = {
      sedanSmallCar: Math.max(0, Number(quantities?.sedanSmallCar) || 0),
      midsizePickupMpv: Math.max(0, Number(quantities?.midsizePickupMpv) || 0),
      suv: Math.max(0, Number(quantities?.suv) || 0),
      xlVanSemiTruck: Math.max(0, Number(quantities?.xlVanSemiTruck) || 0),
    };
  });

  (legacyConsumables || []).forEach((entry) => {
    const parsed = parseConsumableQuantity(entry);
    if (!parsed || normalized[parsed.name]) return;
    normalized[parsed.name] = {
      sedanSmallCar: parsed.quantity,
      midsizePickupMpv: parsed.quantity,
      suv: parsed.quantity,
      xlVanSemiTruck: parsed.quantity,
    };
  });

  return normalized;
}

function buildLegacyConsumables(consumablesBySize = {}) {
  return Object.entries(consumablesBySize)
    .map(([name, quantities]) => {
      const values = SERVICE_CONSUMABLE_SIZE_KEYS.map((key) => Math.max(0, Number(quantities?.[key]) || 0));
      const baseQuantity = values.find((value) => value > 0) || 1;
      return `${name}: ${baseQuantity}`;
    })
    .filter(Boolean);
}

function getConsumableQuantityForCarSize(quantities, carSize) {
  const sizeKey = CAR_SIZE_PRICE_LABELS[normalizeCarSizeLabel(carSize)] || "sedanSmallCar";
  return Math.max(0, Number(quantities?.[sizeKey]) || 0);
}

async function resolveBookingBaseAmount(serviceName, carSize, fallbackPrice = 0) {
  const normalizedServiceName = String(serviceName || "").trim();
  if (!normalizedServiceName) return Math.max(0, Number(fallbackPrice) || 0);

  const service = await Service.findOne({ name: normalizedServiceName }).lean();
  if (!service) return Math.max(0, Number(fallbackPrice) || 0);

  return getServicePriceForCarSize(service, carSize, fallbackPrice);
}

async function ensureApplicableServicesExist(serviceIds = []) {
  const ids = Array.isArray(serviceIds) ? serviceIds.filter(Boolean) : [];
  if (!ids.length) return;
  const services = await Service.find({ id: { $in: ids } }).lean();
  const activeIds = new Set(services.filter((service) => service.enabled !== false).map((service) => String(service.id || "")));
  const missing = ids.filter((id) => !activeIds.has(String(id || "")));
  if (missing.length) {
    throwValidationError("Applicable services must exist and be enabled.");
  }
}

function getUserAuditAction(previousUser, nextUser) {
  if (previousUser && nextUser.status && previousUser.status !== nextUser.status) {
    return String(nextUser.status).toLowerCase() === "active" ? "Activated user" : "Deactivated user";
  }

  if ("password" in nextUser && nextUser.password) {
    return "Updated user password";
  }

  return "Updated user";
}

function getPaymentAuditAction(previousPayment, nextPayment) {
  if (!previousPayment) return "Updated payment";

  if (nextPayment.status && previousPayment.status !== nextPayment.status) {
    return "Updated payment status";
  }

  if (nextPayment.proofImage && nextPayment.proofImage !== previousPayment.proofImage) {
    return previousPayment.proofImage ? "Updated payment proof" : "Submitted payment proof";
  }

  if (nextPayment.method && nextPayment.method !== previousPayment.method) {
    return "Updated payment method";
  }

  return "Updated payment";
}

function getBookingAuditAction(previousBooking, nextBooking) {
  if (!previousBooking) return "Updated booking";

  if (nextBooking.status && previousBooking.status !== nextBooking.status) {
    return "Updated booking status";
  }

  if (nextBooking.assigned !== undefined && previousBooking.assigned !== nextBooking.assigned) {
    return "Updated service tracking";
  }

  return "Updated booking";
}

function isInProgressStatus(status) {
  return bookingDomain.isInProgressBookingStatus(status);
}

function isCompletedStatus(status) {
  return bookingDomain.isCompletedBookingStatus(status);
}

function isCancelledStatus(status) {
  return bookingDomain.isCancelledBookingStatus(status);
}

function isPaidStatus(status) {
  return paymentDomain.isPaidStatus(status);
}

function normalizeWorkflowStatus(status, fallback = "Scheduled") {
  return bookingDomain.normalizeBookingStatus(status, fallback);
}

function normalizeQuoteStatus(status) {
  return String(status || "").trim().toLowerCase() === "received" ? "Received" : "Under Review";
}

function normalizeRewardPayload(body = {}, existing = {}) {
  return engagementDomain.normalizeRewardDefinitionPayload(body, existing);
}

function selectWeightedReward(rewards) {
  return engagementDomain.selectWeightedReward(rewards);
}

function parseRewardDiscount(value, amount) {
  const raw = String(value || "").trim();
  const discountType = raw.includes("%") ? "Percentage" : /discount|off|php|p\s*\d|₱/i.test(raw) ? "Fixed" : "";
  return engagementDomain.calculateRewardDiscount(amount, {
    type: discountType ? `${discountType} Discount` : raw,
    discountType,
    value: raw,
  }).rewardDiscountAmount;
}

function roundMoney(value) {
  return Number((Number(value || 0)).toFixed(2));
}

function calculateRemainingBalance(totalAmount, amountPaid) {
  return Math.max(0, roundMoney(Number(totalAmount || 0) - Number(amountPaid || 0)));
}

function isDownPaymentExemptService(service) {
  const normalizedService = String(service?.name || service || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return normalizedService === "car wash";
}

function isWarrantyExemptService(service) {
  const normalizedService = String(service?.name || service || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return new Set([
    "car wash",
    "maintenance + hydrophobic sealant",
    "maintenance + light buffing",
  ]).has(normalizedService);
}

function getRequiredDownPaymentAmount(settings, service) {
  if (isDownPaymentExemptService(service)) return 0;
  return Math.max(0, roundMoney(settings?.requiredDownPaymentAmount || 0));
}

function getPreferredDetailerFields(body = {}) {
  const preferredDetailer = String(body.preferredDetailer || body.preferredDetailerName || body.preferredDetailerId || "").trim();
  const preferredDetailerName = String(body.preferredDetailerName || body.preferredDetailer || "").trim();
  const preferredDetailerId = String(body.preferredDetailerId || "").trim();

  return {
    preferredDetailer,
    preferredDetailerName,
    preferredDetailerId,
  };
}

function normalizePaymentStageStatus(status, fallback = "Pending") {
  return paymentDomain.normalizePaymentStageStatus(status, fallback);
}

function getPaymentTotalAmount(payment = {}) {
  return paymentDomain.getPaymentFinalAmountDue(payment);
}

function normalizePaymentStageFields(payment = {}, booking = {}) {
  const source = paymentDomain.normalizePaymentStageFields(payment, booking);

  return {
    ...source,
    downPaymentMethod: source.downPaymentMethod || "",
    downPaymentReference: source.downPaymentReference || "",
    downPaymentProofUrl: source.downPaymentProofUrl || "",
    downPaymentProofName: source.downPaymentProofName || "",
    downPaymentProofSubmittedAt: source.downPaymentProofSubmittedAt || null,
    downPaymentReferenceCheckStatus: source.downPaymentReferenceCheckStatus || "",
    downPaymentReferenceCheckedAt: source.downPaymentReferenceCheckedAt || null,
    downPaymentOcrAdvisoryStatus: source.downPaymentOcrAdvisoryStatus || "",
    downPaymentOcrAdvisoryText: source.downPaymentOcrAdvisoryText || "",
    downPaymentReviewStatus: source.downPaymentReviewStatus || "",
    downPaymentVerifiedAt: source.downPaymentVerifiedAt || null,
    downPaymentVerifiedBy: source.downPaymentVerifiedBy || "",
    downPaymentRejectedAt: source.downPaymentRejectedAt || null,
    downPaymentRejectedBy: source.downPaymentRejectedBy || "",
    downPaymentRejectionReason: source.downPaymentRejectionReason || "",
    downPaymentNotes: source.downPaymentNotes || "",
    downPaymentDueAt: source.downPaymentDueAt || null,
    downPaymentReminderSentAt: source.downPaymentReminderSentAt || null,
    downPaymentFinalReminderSentAt: source.downPaymentFinalReminderSentAt || null,
    downPaymentExpiredAt: source.downPaymentExpiredAt || null,
    downPaymentVerifiedNotificationSentAt: source.downPaymentVerifiedNotificationSentAt || null,
    autoCancelledForNoDownPaymentProof: Boolean(source.autoCancelledForNoDownPaymentProof),
    cancellationReason: source.cancellationReason || "",
    finalPaymentMethod: source.finalPaymentMethod || source.method || "",
    finalPaymentReference: source.finalPaymentReference || source.reference || "",
    finalPaymentProofUrl: source.finalPaymentProofUrl || source.proofImage || "",
    finalPaymentProofName: source.finalPaymentProofName || source.proofFileName || "",
    finalPaymentProofSubmittedAt: source.finalPaymentProofSubmittedAt || null,
    finalPaymentReferenceCheckStatus: source.finalPaymentReferenceCheckStatus || "",
    finalPaymentReferenceCheckedAt: source.finalPaymentReferenceCheckedAt || null,
    finalPaymentOcrAdvisoryStatus: source.finalPaymentOcrAdvisoryStatus || "",
    finalPaymentOcrAdvisoryText: source.finalPaymentOcrAdvisoryText || "",
    finalPaymentReviewStatus: source.finalPaymentReviewStatus || "",
    finalPaymentVerifiedAt: source.finalPaymentVerifiedAt || (isPaidStatus(source.status) ? source.reviewedAt || null : null),
    finalPaymentVerifiedBy: source.finalPaymentVerifiedBy || (isPaidStatus(source.status) ? source.reviewedBy || "" : ""),
    finalPaymentRejectedAt: source.finalPaymentRejectedAt || null,
    finalPaymentRejectedBy: source.finalPaymentRejectedBy || "",
    finalPaymentRejectionReason: source.finalPaymentRejectionReason || "",
    finalPaymentNotes: source.finalPaymentNotes || source.notes || "",
  };
}

function getPaymentStageFields(payment = {}) {
  const normalized = normalizePaymentStageFields(payment);
  return {
    downPaymentRequired: normalized.downPaymentRequired,
    downPaymentAmount: normalized.downPaymentAmount,
    downPaymentStatus: normalized.downPaymentStatus,
    downPaymentMethod: normalized.downPaymentMethod,
    downPaymentReference: normalized.downPaymentReference,
    downPaymentProofUrl: normalized.downPaymentProofUrl,
    downPaymentProofName: normalized.downPaymentProofName,
    downPaymentProofSubmittedAt: normalized.downPaymentProofSubmittedAt,
    downPaymentReferenceCheckStatus: normalized.downPaymentReferenceCheckStatus,
    downPaymentReferenceCheckedAt: normalized.downPaymentReferenceCheckedAt,
    downPaymentOcrAdvisoryStatus: normalized.downPaymentOcrAdvisoryStatus,
    downPaymentOcrAdvisoryText: normalized.downPaymentOcrAdvisoryText,
    downPaymentReviewStatus: normalized.downPaymentReviewStatus,
    downPaymentVerifiedAt: normalized.downPaymentVerifiedAt,
    downPaymentVerifiedBy: normalized.downPaymentVerifiedBy,
    downPaymentRejectedAt: normalized.downPaymentRejectedAt,
    downPaymentRejectedBy: normalized.downPaymentRejectedBy,
    downPaymentRejectionReason: normalized.downPaymentRejectionReason,
    downPaymentNotes: normalized.downPaymentNotes,
    downPaymentDueAt: normalized.downPaymentDueAt,
    downPaymentReminderSentAt: normalized.downPaymentReminderSentAt,
    downPaymentFinalReminderSentAt: normalized.downPaymentFinalReminderSentAt,
    downPaymentExpiredAt: normalized.downPaymentExpiredAt,
    downPaymentVerifiedNotificationSentAt: normalized.downPaymentVerifiedNotificationSentAt,
    autoCancelledForNoDownPaymentProof: normalized.autoCancelledForNoDownPaymentProof,
    cancellationReason: normalized.cancellationReason,
    totalAmount: normalized.totalAmount,
    amountPaid: normalized.amountPaid,
    remainingBalance: normalized.remainingBalance,
    finalPaymentStatus: normalized.finalPaymentStatus,
    finalPaymentMethod: normalized.finalPaymentMethod,
    finalPaymentReference: normalized.finalPaymentReference,
    finalPaymentProofUrl: normalized.finalPaymentProofUrl,
    finalPaymentProofName: normalized.finalPaymentProofName,
    finalPaymentProofSubmittedAt: normalized.finalPaymentProofSubmittedAt,
    finalPaymentReferenceCheckStatus: normalized.finalPaymentReferenceCheckStatus,
    finalPaymentReferenceCheckedAt: normalized.finalPaymentReferenceCheckedAt,
    finalPaymentOcrAdvisoryStatus: normalized.finalPaymentOcrAdvisoryStatus,
    finalPaymentOcrAdvisoryText: normalized.finalPaymentOcrAdvisoryText,
    finalPaymentReviewStatus: normalized.finalPaymentReviewStatus,
    finalPaymentVerifiedAt: normalized.finalPaymentVerifiedAt,
    finalPaymentVerifiedBy: normalized.finalPaymentVerifiedBy,
    finalPaymentRejectedAt: normalized.finalPaymentRejectedAt,
    finalPaymentRejectedBy: normalized.finalPaymentRejectedBy,
    finalPaymentRejectionReason: normalized.finalPaymentRejectionReason,
    finalPaymentNotes: normalized.finalPaymentNotes,
  };
}

function clampPaymentAmount(value, totalAmount) {
  return Math.min(Math.max(0, roundMoney(value || 0)), Math.max(0, roundMoney(totalAmount || 0)));
}

function isPaymentFullyPaid(payment = {}) {
  return paymentDomain.isPaymentFullyPaid(payment);
}

function isDownPaymentSatisfiedForFinalReview(payment = {}) {
  const downPaymentStatus = normalizePaymentStageStatus(
    payment.downPaymentStatus,
    payment.downPaymentRequired === false ? "Not Required" : "Pending"
  );
  return payment.downPaymentRequired === false || downPaymentStatus === "Not Required" || downPaymentStatus === "Paid";
}

function hasCustomerFinalPaymentSubmission(payment = {}) {
  const finalStatus = normalizePaymentStageStatus(payment.finalPaymentStatus, payment.status || "Pending");
  const method = normalizePaymentMethodLabel(payment.finalPaymentMethod || payment.method || "");
  return (
    finalStatus === "For Verification" &&
    Boolean(method) &&
    (
      isCashPaymentMethod(method) ||
      Boolean(String(payment.finalPaymentReference || "").trim()) ||
      Boolean(String(payment.finalPaymentProofUrl || "").trim()) ||
      Boolean(String(payment.finalPaymentProofName || "").trim())
    )
  );
}

function canReviewFinalPaymentStage(payment = {}) {
  return isDownPaymentSatisfiedForFinalReview(payment) && hasCustomerFinalPaymentSubmission(payment);
}

function getPaymentStageSnapshot(payment = {}, stage = "finalPayment") {
  if (stage === "downPayment") {
    const method = normalizePaymentMethodLabel(payment.downPaymentMethod || payment.method || "");
    return {
      status: normalizePaymentStageStatus(payment.downPaymentStatus, payment.downPaymentRequired === false ? "Not Required" : "Pending"),
      method,
      reference: payment.downPaymentReference || payment.reference || "",
      proofUrl: payment.downPaymentProofUrl || payment.proofImage || "",
      proofName: payment.downPaymentProofName || payment.proofFileName || "",
      amount: Math.max(0, Number(payment.downPaymentAmount || 0) || 0),
    };
  }

  const method = normalizePaymentMethodLabel(payment.finalPaymentMethod || payment.method || "");
  return {
    status: normalizePaymentStageStatus(payment.finalPaymentStatus, payment.status || "Pending"),
    method,
    reference: payment.finalPaymentReference || payment.reference || "",
    proofUrl: payment.finalPaymentProofUrl || payment.proofImage || "",
    proofName: payment.finalPaymentProofName || payment.proofFileName || "",
    amount: paymentDomain.getOutstandingBalance({
      ...payment,
      finalPaymentStatus: "Pending",
      status: "Pending",
    }),
  };
}

function validateStageReadyForReview(payment = {}, stage = "finalPayment", nextStatus = "") {
  const snapshot = getPaymentStageSnapshot(payment, stage);
  const next = normalizePaymentStageStatus(nextStatus, "");
  const current = snapshot.status;
  if (!next || next === current) return;

  if (!["Paid", "Rejected"].includes(next)) {
    const error = new Error("Unsupported payment review status.");
    error.statusCode = 400;
    throw error;
  }
  if (current === "Paid") {
    const error = new Error("This payment stage is already verified.");
    error.statusCode = 400;
    throw error;
  }
  if (current === "Rejected") {
    const error = new Error("Rejected payment stages require customer resubmission before review.");
    error.statusCode = 400;
    throw error;
  }
  if (stage === "finalPayment" && !isDownPaymentSatisfiedForFinalReview(payment)) {
    const error = new Error("Down payment must be verified before reviewing the final payment.");
    error.statusCode = 400;
    throw error;
  }
  if (next === "Paid" && current !== "For Verification") {
    const error = new Error("Only submitted payment proof can be verified.");
    error.statusCode = 400;
    throw error;
  }
  if (next === "Rejected" && current !== "For Verification") {
    const error = new Error("Only submitted payment proof can be rejected.");
    error.statusCode = 400;
    throw error;
  }
  if (!snapshot.method) {
    const error = new Error("Payment method is required before review.");
    error.statusCode = 400;
    throw error;
  }
  assertSupportedPaymentMethod(snapshot.method, "Payment method");
  if (!isCashPaymentMethod(snapshot.method)) {
    if (!String(snapshot.reference || "").trim()) {
      const error = new Error("Reference number is required before review.");
      error.statusCode = 400;
      throw error;
    }
    if (!String(snapshot.proofUrl || snapshot.proofName || "").trim()) {
      const error = new Error("Proof of payment is required before review.");
      error.statusCode = 400;
      throw error;
    }
  }
  if (snapshot.amount <= 0) {
    const error = new Error("Payment stage amount must be greater than zero before review.");
    error.statusCode = 400;
    throw error;
  }
}

function getVerifiedRevenueForPayment(payment = {}) {
  return paymentDomain.getHistoricalRecognizedRevenue(payment);
}

async function getLinkedPaymentForBooking(booking = {}) {
  const bookingId = String(booking?.id || "").trim();
  const mongoId = String(booking?._id || "").trim();
  const legacyBookingId = String(booking?.bookingId || "").trim();
  const candidates = [...new Set([bookingId, mongoId, legacyBookingId].filter(Boolean))];
  if (!candidates.length) return null;

  const payment = await Payment.findOne({
    $or: [
      { bookingId: { $in: candidates } },
      { reference: { $in: candidates } },
    ],
  }).lean();
  return payment ? normalizePaymentStageFields(payment, booking) : null;
}

function hasPaidDownPaymentForBooking(booking = {}, payment = null) {
  if (isDownPaymentExemptService(booking.service)) return true;
  return Boolean(
    payment &&
    payment.downPaymentRequired === true &&
    normalizePaymentStageStatus(payment.downPaymentStatus, "") === "Paid"
  );
}

function hasAssignedStaff(booking = {}) {
  return Boolean(String(booking.assigned || "").trim());
}

function hasMeaningfulIssueNotes(booking = {}) {
  const note = String(booking.issueNote || "").trim();
  const issueTypes = Array.isArray(booking.issueTypes) ? booking.issueTypes : [];
  const issueMarkers = Array.isArray(booking.issueMarkers) ? booking.issueMarkers : [];
  return Boolean(
    note ||
    issueTypes.some((issueType) => String(issueType || "").trim()) ||
    issueMarkers.some((marker) => String(marker?.issueType || "").trim())
  );
}

const WARRANTY_FIELDS = [
  "warrantyChecklist",
  "warrantyChecklistItems",
  "warrantyCoveragePackage",
  "warrantyAcknowledgement",
  "warrantyReleased",
  "warrantyReleasedAt",
  "warrantyQrCode",
];

function stableStringify(value) {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

function hasWarrantyFieldChanges(previousBooking = {}, nextBody = {}) {
  if (!WARRANTY_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(nextBody, field))) {
    return false;
  }

  if (
    Object.prototype.hasOwnProperty.call(nextBody, "warrantyReleased") &&
    Boolean(nextBody.warrantyReleased) !== Boolean(previousBooking.warrantyReleased)
  ) {
    return true;
  }

  if (
    Object.prototype.hasOwnProperty.call(nextBody, "warrantyChecklist") &&
    String(nextBody.warrantyChecklist || "").trim() !== String(previousBooking.warrantyChecklist || "").trim()
  ) {
    return Boolean(String(nextBody.warrantyChecklist || previousBooking.warrantyChecklist || "").trim());
  }

  if (Object.prototype.hasOwnProperty.call(nextBody, "warrantyChecklistItems")) {
    const previousMeaningfulItems = (Array.isArray(previousBooking.warrantyChecklistItems) ? previousBooking.warrantyChecklistItems : [])
      .map((item) => ({ id: item?.id || "", done: Boolean(item?.done), doneBy: String(item?.doneBy || ""), notes: String(item?.notes || "") }))
      .filter((item) => item.done || item.doneBy || item.notes);
    const nextMeaningfulItems = (Array.isArray(nextBody.warrantyChecklistItems) ? nextBody.warrantyChecklistItems : [])
      .map((item) => ({ id: item?.id || "", done: Boolean(item?.done), doneBy: String(item?.doneBy || ""), notes: String(item?.notes || "") }))
      .filter((item) => item.done || item.doneBy || item.notes);
    if (stableStringify(previousMeaningfulItems) !== stableStringify(nextMeaningfulItems)) return true;
  }

  if (Object.prototype.hasOwnProperty.call(nextBody, "warrantyAcknowledgement")) {
    const previousAck = previousBooking.warrantyAcknowledgement || {};
    const nextAck = nextBody.warrantyAcknowledgement || {};
    for (const field of ["dateLocation", "clientSignature"]) {
      if (String(nextAck[field] || "").trim() !== String(previousAck[field] || "").trim()) {
        return Boolean(String(nextAck[field] || previousAck[field] || "").trim());
      }
    }
  }

  return false;
}

function hasRequiredWarrantyDetails(booking = {}) {
  if (isWarrantyExemptService(booking.service)) return true;

  const checklistItems = Array.isArray(booking.warrantyChecklistItems) ? booking.warrantyChecklistItems : [];
  const acknowledgement = booking.warrantyAcknowledgement || {};

  // Completion requires the editable warranty essentials only: a selected package,
  // at least one checklist item marked done, and date/location acknowledgement.
  return Boolean(
    String(booking.warrantyCoveragePackage || "").trim() &&
    checklistItems.some((item) => Boolean(item?.done)) &&
    String(acknowledgement.dateLocation || "").trim()
  );
}

async function validateShopHours({ time = "", service = "" }) {
  const startMinutes = timeToMinutes(time);
  if (startMinutes === null || startMinutes < SHOP_OPEN_MINUTES || startMinutes > SHOP_CLOSE_MINUTES) {
    throwValidationError("Booking time must be within shop hours of 08:00 to 17:00.");
  }

  const selectedService = await Service.findOne({ name: String(service || "").trim() }).lean();
  const serviceMinutes = Number(selectedService?.mins || 0);
  const allowedArrivalTimes = normalizeAllowedArrivalTimes(selectedService?.allowedArrivalTimes, serviceMinutes);
  if (selectedService && !allowedArrivalTimes.includes(String(time || "").trim())) {
    throwValidationError("Selected time is not available for this service.");
  }
  if (
    Number.isFinite(serviceMinutes) &&
    serviceMinutes > 0 &&
    serviceMinutes <= SHOP_DAY_MINUTES &&
    startMinutes + serviceMinutes > SHOP_CLOSE_MINUTES
  ) {
    throwValidationError("Booking time must allow the service to finish before shop closing at 17:00.");
  }
}

async function validateScheduledRequirements({ booking, payment, bookingId = "" }) {
  if (!hasAssignedStaff(booking)) {
    throwValidationError("Assigned staff is required before updating this booking status.");
  }

  if (!hasPaidDownPaymentForBooking(booking, payment)) {
    if (!payment) {
      throwValidationError("A linked payment record is required before scheduling this booking.");
    }
    throwValidationError("Down payment must be verified as paid before scheduling this booking.");
  }

  const date = String(booking.date || "").trim();
  const time = String(booking.time || "").trim();
  const placeSlot = Number(booking.placeSlot || 0);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidScheduleTime(time) || !PLACE_SLOT_OPTIONS.includes(placeSlot)) {
    throwValidationError("A valid time and place slot are required before scheduling.");
  }

  await validateShopHours({ time, service: booking.service });
  await validateBookingSlotAvailability({
    bookingId,
    date,
    time,
    service: booking.service,
    placeSlot,
  });
}

async function validateScheduleDetails({ booking, bookingId = "" }) {
  const date = String(booking.date || "").trim();
  const time = String(booking.time || "").trim();
  const placeSlot = Number(booking.placeSlot || 0);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidScheduleTime(time) || !PLACE_SLOT_OPTIONS.includes(placeSlot)) {
    throwValidationError("A valid time and place slot are required before scheduling.");
  }

  await validateShopHours({ time, service: booking.service });
  await validateBookingSlotAvailability({
    bookingId,
    date,
    time,
    service: booking.service,
    placeSlot,
  });
}

async function validateBookingCompletion({ previousBooking, nextBooking, payment, bookingId = "" }) {
  const previousStatus = normalizeWorkflowStatus(previousBooking.status || "Scheduled", "Scheduled");

  if (previousStatus !== "In Progress") {
    throwValidationError("Booking must be in progress with valid schedule details before it can be completed.");
  }

  if (!hasAssignedStaff(nextBooking)) {
    throwValidationError("Assigned staff is required before completing this booking.");
  }

  const date = String(nextBooking.date || "").trim();
  const time = String(nextBooking.time || "").trim();
  const placeSlot = Number(nextBooking.placeSlot || 0);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidScheduleTime(time) || !PLACE_SLOT_OPTIONS.includes(placeSlot)) {
    throwValidationError("Booking must be in progress with valid schedule details before it can be completed.");
  }

  await validateShopHours({ time, service: nextBooking.service });
  await validateBookingSlotAvailability({
    bookingId,
    date,
    time,
    service: nextBooking.service,
    placeSlot,
  });

  if (!payment || !isPaymentFullyPaid(payment)) {
    throwValidationError("Full payment must be marked as paid before completing this booking.");
  }
  if (!hasMeaningfulIssueNotes(nextBooking)) {
    throwValidationError("Issue notes must be saved before completing this booking.");
  }
  if (!hasRequiredWarrantyDetails(nextBooking)) {
    throwValidationError("Warranty details must be completed before completing this booking.");
  }
}

async function validateBookingLifecycleTransition({ previousBooking, nextBooking, payment, nextStatus, scheduleChanged = false }) {
  const previousStatus = normalizeWorkflowStatus(previousBooking.status || "Scheduled", "Scheduled");
  const statusChanged = previousStatus !== nextStatus;
  if (statusChanged) {
    const transition = bookingDomain.validateBookingTransition(previousStatus, nextStatus, {
      allowInProgressCancellation: true,
    });
    if (!transition.allowed) {
      throwValidationError(transition.reason);
    }
  }
  const needsScheduleGate =
    (statusChanged && ["Scheduled", "In Progress", "Completed"].includes(nextStatus)) ||
    (scheduleChanged && ["Scheduled", "In Progress", "Completed"].includes(nextStatus));

  if (needsScheduleGate && nextStatus === "Scheduled") {
    await validateScheduleDetails({
      booking: nextBooking,
      bookingId: previousBooking.id,
    });
  } else if (needsScheduleGate) {
    await validateScheduledRequirements({
      booking: nextBooking,
      payment,
      bookingId: previousBooking.id,
    });
  }

  if (statusChanged && nextStatus === "In Progress" && !hasMeaningfulIssueNotes(nextBooking)) {
    throwValidationError("Issue notes must be saved before starting the service.");
  }

  if (statusChanged && nextStatus === "Completed") {
    await validateBookingCompletion({
      previousBooking,
      nextBooking,
      payment,
      bookingId: previousBooking.id,
    });
  }
}

function buildInvoiceSnapshot(finalAmount, rewardDiscountAmount = 0) {
  const normalizedFinalAmount = Math.max(0, roundMoney(finalAmount));
  const subtotalAfterDiscount = roundMoney(normalizedFinalAmount / (1 + INVOICE_TAX_RATE));
  const taxAmount = roundMoney(normalizedFinalAmount - subtotalAfterDiscount);
  return {
    discountAmount: roundMoney(rewardDiscountAmount),
    subtotalAfterDiscount,
    taxAmount,
    finalAmount: normalizedFinalAmount,
  };
}

function buildRewardPricing(baseAmount, customerReward) {
  const rewardDiscount = engagementDomain.calculateRewardDiscount(baseAmount, {
    type: customerReward?.rewardType || "",
    discountType: customerReward?.discountType || "",
    discountValue: customerReward?.discountValue || 0,
    value: customerReward?.rewardValue || "",
  });
  const rewardDiscountAmount = rewardDiscount.rewardDiscountAmount;
  const amount = Math.max(0, roundMoney(Number(baseAmount || 0) - rewardDiscountAmount));
  return {
    rewardId: customerReward?.id || "",
    rewardName: customerReward?.rewardName || "",
    rewardType: customerReward?.rewardType || "",
    rewardDiscountType: customerReward?.discountType || "",
    rewardValue: customerReward?.rewardValue || "",
    rewardClaimCode: customerReward?.claimCode || "",
    rewardDiscountAmount,
    ...buildInvoiceSnapshot(amount, rewardDiscountAmount),
    amount,
  };
}

function isRewardExpired(customerReward) {
  return engagementDomain.isCustomerRewardExpired(customerReward);
}

function getCustomerRewardUsageStatus(customerReward = {}) {
  return engagementDomain.normalizeRewardStatus(customerReward.status, "Available");
}

function hydrateCustomerReward(customerReward = {}, payments = []) {
  return engagementDomain.hydrateCustomerReward(customerReward, payments);
}

async function validateCustomerRewardForUse({ rewardId = "", customerEmail = "", customerName = "", baseAmount = 0, excludePaymentId = "", service = {} }) {
  const normalizedRewardId = String(rewardId || "").trim();
  if (!normalizedRewardId) {
    return buildRewardPricing(baseAmount, null);
  }

  const customerReward = await CustomerReward.findOne({ id: normalizedRewardId }).lean();
  if (!customerReward) {
    const error = new Error("Reward not found.");
    error.statusCode = 404;
    throw error;
  }

  const ownerEmail = String(customerReward.customerEmail || "").trim().toLowerCase();
  const ownerName = String(customerReward.customerName || "").trim().toLowerCase();
  const requestEmail = String(customerEmail || "").trim().toLowerCase();
  const requestName = String(customerName || "").trim().toLowerCase();
  const belongsToCustomer = ownerEmail ? ownerEmail === requestEmail : ownerName && ownerName === requestName;
  if (!belongsToCustomer) {
    const error = new Error("Reward does not belong to your account.");
    error.statusCode = 403;
    throw error;
  }

  const currentRewardStatus = getCustomerRewardUsageStatus(customerReward);
  if (!["Available", "Claimed", "Released"].includes(currentRewardStatus)) {
    const error = new Error("This reward is not available.");
    error.statusCode = 400;
    throw error;
  }

  const existingActivePayment = await Payment.findOne({
    rewardId: normalizedRewardId,
    id: { $ne: String(excludePaymentId || "") },
    status: { $nin: ["Rejected"] },
  }).lean();
  if (existingActivePayment) {
    const error = new Error("This reward is already reserved for another booking.");
    error.statusCode = 400;
    throw error;
  }

  if (isRewardExpired(customerReward)) {
    const error = new Error("Reward expired.");
    error.statusCode = 400;
    throw error;
  }

  const reward = await Reward.findOne({ id: customerReward.rewardId }).lean();
  if (!reward || !engagementDomain.isRewardDefinitionSelectable(reward, service)) {
    const error = new Error("Reward is no longer active.");
    error.statusCode = 400;
    throw error;
  }

  return buildRewardPricing(baseAmount, customerReward);
}

async function reserveCustomerRewardForBooking({ rewardId = "", booking = {}, payment = {}, auditUser = "" } = {}) {
  const normalizedRewardId = String(rewardId || "").trim();
  if (!normalizedRewardId) return null;
  const customerReward = await CustomerReward.findOne({ id: normalizedRewardId });
  if (!customerReward) return null;
  const currentStatus = getCustomerRewardUsageStatus(customerReward);
  if (!["Available", "Claimed", "Released"].includes(currentStatus)) {
    const error = new Error("This reward is not available.");
    error.statusCode = 400;
    throw error;
  }
  customerReward.status = "Reserved";
  customerReward.linkedBookingId = booking.id || "";
  customerReward.reservedBookingId = booking.id || "";
  customerReward.linkedPaymentId = "";
  customerReward.reservedAt = customerReward.reservedAt || new Date().toISOString();
  customerReward.discountAmount = Number(payment.rewardDiscountAmount || booking.rewardDiscountAmount || 0);
  customerReward.subtotalAfterDiscount = Number(payment.subtotalAfterDiscount || booking.subtotalAfterDiscount || 0);
  customerReward.taxAmount = Number(payment.taxAmount || booking.taxAmount || 0);
  customerReward.finalAmount = Number(payment.finalAmount || booking.finalAmount || booking.amount || 0);
  customerReward.releaseReason = "";
  customerReward.releasedAt = "";
  await customerReward.save();
  await recordAudit(auditUser || "system", "Reward reserved", customerReward.id, {
    bookingId: booking.id || "",
    customerEmail: customerReward.customerEmail || "",
  });
  return customerReward;
}

async function releaseCustomerRewardReservation({ rewardId = "", bookingId = "", paymentId = "", reason = "", auditUser = "system" } = {}) {
  const normalizedRewardId = String(rewardId || "").trim();
  if (!normalizedRewardId) return null;
  const reward = await CustomerReward.findOne({ id: normalizedRewardId });
  if (!reward) return null;
  const status = getCustomerRewardUsageStatus(reward);
  if (!["Reserved", "Claimed", "Released"].includes(status)) return reward;
  if (bookingId && String(reward.linkedBookingId || reward.reservedBookingId || "") !== String(bookingId)) return reward;
  if (paymentId && reward.linkedPaymentId && String(reward.linkedPaymentId || "") !== String(paymentId)) return reward;
  reward.status = "Available";
  reward.linkedBookingId = "";
  reward.reservedBookingId = "";
  reward.linkedPaymentId = "";
  reward.releasedAt = new Date().toISOString();
  reward.releaseReason = String(reason || "Reservation released.").trim().slice(0, 240);
  await reward.save();
  await recordAudit(auditUser || "system", "Reward released", reward.id, {
    bookingId,
    paymentId,
    reason: reward.releaseReason,
  });
  return reward;
}

async function markCustomerRewardUsedForPayment(payment = {}, auditUser = "system") {
  const rewardId = String(payment.rewardId || "").trim();
  if (!rewardId || !isPaidStatus(payment.status)) return null;
  const reward = await CustomerReward.findOne({ id: rewardId });
  if (!reward) return null;
  if (getCustomerRewardUsageStatus(reward) === "Used") return reward;
  const status = getCustomerRewardUsageStatus(reward);
  if (!["Reserved", "Claimed", "Available", "Released"].includes(status)) {
    const error = new Error("This reward cannot be marked used from its current status.");
    error.statusCode = 400;
    throw error;
  }
  reward.status = "Used";
  reward.linkedBookingId = payment.bookingId || reward.linkedBookingId || "";
  reward.reservedBookingId = payment.bookingId || reward.reservedBookingId || "";
  reward.linkedPaymentId = payment.id || "";
  reward.discountAmount = Number(payment.discountAmount || payment.rewardDiscountAmount || 0);
  reward.subtotalAfterDiscount = Number(payment.subtotalAfterDiscount || 0);
  reward.taxAmount = Number(payment.taxAmount || 0);
  reward.finalAmount = Number(payment.finalAmount || payment.amount || 0);
  reward.paymentStatusAtUse = payment.status || "";
  reward.usedAt = reward.usedAt || new Date().toISOString();
  await reward.save();
  await recordAudit(auditUser || "system", "Reward used", reward.id, {
    bookingId: payment.bookingId || "",
    paymentId: payment.id || "",
  });
  return reward;
}

function getQualifiedBookingStatus(status) {
  return isCompletedStatus(status);
}

function buildClaimCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function normalizePaymentMethodLabel(method) {
  return paymentMethodsDomain.normalizePaymentMethodLabel(method, "");
}

function assertSupportedPaymentMethod(method, label = "Payment method") {
  return paymentMethodsDomain.assertSupportedPaymentMethod(method, label);
}

function isCashPaymentMethod(method) {
  return paymentMethodsDomain.isCashPaymentMethod(method);
}

async function migratePaymentMethods() {
  const payments = await Payment.find({
    $or: [
      { method: { $nin: ["", ...paymentMethodsDomain.CANONICAL_PAYMENT_METHODS] } },
      { downPaymentMethod: { $nin: ["", ...paymentMethodsDomain.CANONICAL_PAYMENT_METHODS] } },
      { finalPaymentMethod: { $nin: ["", ...paymentMethodsDomain.CANONICAL_PAYMENT_METHODS] } },
    ],
  });

  for (const payment of payments) {
    let changed = false;
    for (const field of ["method", "downPaymentMethod", "finalPaymentMethod"]) {
      const current = String(payment[field] || "").trim();
      const normalized = normalizePaymentMethodLabel(current);
      if (current && normalized && current !== normalized) {
        payment[field] = normalized;
        changed = true;
      }
    }
    if (changed) await payment.save();
  }
}

async function ensureBookingCommission(booking, auditUser) {
  const bookingId = String(booking?.id || "").trim();
  const workerName = String(booking?.assigned || "").trim();
  if (!bookingId || !workerName) return null;

  const existingCommission = await Commission.findOne({
    bookingId,
    status: { $nin: ["Voided", "Cancelled"] },
  }).lean();
  if (existingCommission) return existingCommission;

  const [workers, linkedPayment] = await Promise.all([
    User.find({}).lean(),
    getLinkedPaymentForBooking(booking),
  ]);
  const worker = workers.find((user) => {
    const name = String(user.name || "").trim().toLowerCase();
    const email = String(user.email || "").trim().toLowerCase();
    const id = String(user.id || user._id || "").trim().toLowerCase();
    const target = workerName.toLowerCase();
    return name === target || email === target || id === target;
  });

  if (!worker || normalizeUserType(worker.userType, worker.role) !== "staff") {
    return null;
  }

  const eligibility = commissionDomain.evaluateCommissionEligibility({
    booking,
    payment: linkedPayment,
    worker,
    existingCommission,
  });
  if (!eligibility.eligible) return null;

  const commission = await Commission.create({
    id: createId("C"),
    bookingId,
    date: booking.date || toDateKey(),
    worker: worker.name || workerName,
    role: toDisplaySubtype(worker.userType, worker.role),
    service: booking.service || "",
    serviceValue: eligibility.serviceValue,
    rate: eligibility.rate,
    earned: eligibility.earned,
    status: "Earned",
    generatedBy: auditUser || "System",
    dateCompleted: booking.date || toDateKey(),
    dateGenerated: toDateKey(),
  });

  await upsertAutomaticExpense({
    sourceType: "commission",
    sourceId: commission.id,
    date: commission.date || toDateKey(),
    description: `Worker commission: ${commission.worker}`,
    note: `${commission.service || "Completed service"} commission at ${commission.rate}%`,
    category: "Commissions",
    amount: commission.earned,
    paidBy: auditUser || "System",
  });

  await recordAudit(auditUser, "Created commission", commission.id, {
    bookingId,
    worker: commission.worker,
    earned: commission.earned,
    status: commission.status,
  });

  return commission;
}

async function upsertAutomaticExpense({
  sourceType = "",
  sourceId = "",
  date = "",
  description = "",
  note = "",
  category = "",
  amount = 0,
  paidBy = "",
}) {
  const normalizedSourceType = String(sourceType || "").trim();
  const normalizedSourceId = String(sourceId || "").trim();
  const numericAmount = Number(amount || 0);

  if (!normalizedSourceType || !normalizedSourceId || numericAmount <= 0) {
    return null;
  }

  const payload = {
    date: String(date || toDateKey()).trim(),
    description: String(description || "").trim(),
    note: String(note || "").trim(),
    category: String(category || "Materials").trim(),
    amount: numericAmount,
    paidBy: String(paidBy || "System").trim(),
    sourceType: normalizedSourceType,
    sourceId: normalizedSourceId,
  };

  const existingExpense = await Expense.findOne({
    sourceType: normalizedSourceType,
    sourceId: normalizedSourceId,
  });

  if (existingExpense) {
    Object.assign(existingExpense, payload);
    await existingExpense.save();
    return existingExpense;
  }

  return Expense.create({
    id: createId("E"),
    ...payload,
  });
}

async function migrateExpenseCategories() {
  await Expense.updateMany(
    { category: "Stock Monitoring" },
    { $set: { category: "Supplies" } }
  );
}

function parseConsumableQuantity(entry) {
  const rawEntry = String(entry || "").trim();
  if (!rawEntry) return null;

  const [rawName, ...rawQuantityParts] = rawEntry.split(":");
  const name = String(rawName || "").trim();
  const quantity = Number(String(rawQuantityParts.join(":") || "1").trim());

  if (!name) return null;

  return {
    name,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
  };
}

function normalizeInventoryName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function applyServiceConsumablesToStockMonitoring(serviceName, carSize = "") {
  const normalizedServiceName = String(serviceName || "").trim();
  if (!normalizedServiceName) {
    return { applied: false, updatedItems: [] };
  }

  const service = await Service.findOne({
    name: new RegExp(`^${normalizedServiceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  }).lean();

  if (!service) {
    return { applied: false, updatedItems: [] };
  }

  const consumables = Object.entries(
    buildServiceConsumablesBySize(service.consumablesBySize, service.consumables)
  )
    .map(([name, quantities]) => ({
      name,
      quantity: getConsumableQuantityForCarSize(quantities, carSize),
    }))
    .filter((item) => item.quantity > 0);

  if (!consumables.length) {
    return { applied: false, updatedItems: [] };
  }

  const requestedNames = [...new Set(consumables.map((item) => normalizeInventoryName(item.name)).filter(Boolean))];
  const stockItems = await StockMonitoringItem.find({}).lean();

  const stockByName = new Map(
    stockItems.map((item) => [normalizeInventoryName(item.name), item])
  );

  const updatedItems = [];

  for (const consumable of consumables) {
    const stockItem = stockByName.get(normalizeInventoryName(consumable.name));
    if (!stockItem) continue;

    const nextStock = Math.max(0, Number(stockItem.currentStock || 0) - consumable.quantity);
    await StockMonitoringItem.updateOne({ id: stockItem.id }, { $set: { currentStock: nextStock } });
    updatedItems.push({ name: stockItem.name, quantity: consumable.quantity });
  }

  return { applied: updatedItems.length > 0, updatedItems };
}

async function ensureSeedData() {
  const [userCount, serviceCount] = await Promise.all([
    User.countDocuments(),
    Service.countDocuments(),
  ]);

  if (!userCount) {
    await User.insertMany([
      {
        id: "USR-ADMIN-1",
        name: "Admin",
        first: "Admin",
        last: "User",
        userType: "Admin",
        role: "Admin",
        email: "admin@allprotec.com",
        phone: "09171234567",
        password: "Admin@123",
        status: "active",
      },
      {
        id: "USR-STAFF-1",
        name: "Staff",
        first: "Staff",
        last: "User",
        userType: "Staff",
        role: "Junior Detailer",
        email: "staff@allprotec.com",
        phone: "09181234567",
        password: "Staff@123",
        status: "active",
      },
      {
        id: "USR-CLIENT-1",
        name: "Customer",
        first: "Customer",
        last: "User",
        userType: "Customer",
        role: "New",
        email: "customer@allprotec.com",
        phone: "09191234567",
        password: "Customer@123",
        status: "active",
      },
    ]);
  }

  if (!serviceCount) {
    await Service.insertMany([
      {
        id: "SVC-1001",
        name: "Graphene Coating",
        desc: "Long-lasting gloss and protection",
        serviceType: "Basic Service",
        category: "Coating",
        price: 25000,
        priceBySize: buildServicePriceBySize({}, 25000),
        mins: 360,
        enabled: true,
        consumables: [],
      },
      {
        id: "SVC-1002",
        name: "Ceramic Coating",
        desc: "Hydrophobic ceramic protection",
        serviceType: "Basic Service",
        category: "Coating",
        price: 18000,
        priceBySize: buildServicePriceBySize({}, 18000),
        mins: 300,
        enabled: true,
        consumables: [],
      },
      {
        id: "SVC-1003",
        name: "Paint Protection Film",
        desc: "High-impact paint protection",
        serviceType: "Basic Service",
        category: "Protection",
        price: 45000,
        priceBySize: buildServicePriceBySize({}, 45000),
        mins: 480,
        enabled: true,
        consumables: [],
      },
    ]);
  }

}

async function ensureProductionAdminFromEnv() {
  if (!ADMIN_SEED_EMAIL && !ADMIN_SEED_PASSWORD) return;

  if (!ADMIN_SEED_EMAIL || !ADMIN_SEED_PASSWORD) {
    console.warn("[startup] ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must both be set to create a production admin.");
    return;
  }

  if (ADMIN_SEED_PASSWORD.length < 8) {
    console.warn("[startup] ADMIN_SEED_PASSWORD must be at least 8 characters. Production admin was not created.");
    return;
  }

  const existing = await User.findOne({ email: ADMIN_SEED_EMAIL }).lean();
  if (existing) {
    console.log("[startup] Production admin seed skipped; account already exists.", {
      email: ADMIN_SEED_EMAIL,
    });
    return;
  }

  const nameParts = (ADMIN_SEED_NAME || "Production Admin").split(/\s+/).filter(Boolean);
  const first = nameParts[0] || "Production";
  const last = nameParts.slice(1).join(" ") || "Admin";
  const user = await User.create({
    id: createId("USR-ADMIN"),
    name: ADMIN_SEED_NAME || "Production Admin",
    first,
    last,
    userType: "Admin",
    role: "Admin",
    email: ADMIN_SEED_EMAIL,
    phone: ADMIN_SEED_PHONE,
    password: hashPassword(ADMIN_SEED_PASSWORD),
    status: "active",
  });

  await recordAudit(user.email, "Created production admin from environment seed", user.id);
  console.log("[startup] Production admin seed created.", {
    email: user.email,
    id: user.id,
  });
}

async function migrateServiceTypes() {
  const services = await Service.find({
    $or: [
      { serviceType: { $exists: false } },
      { serviceType: "" },
      { serviceType: null },
    ],
  });

  for (const service of services) {
    service.serviceType = normalizeServiceType(service.serviceType, service.name, service.desc);
    await service.save();
  }
}

async function migrateServicePricing() {
  const services = await Service.find({
    $or: [
      { priceBySize: { $exists: false } },
      { "priceBySize.sedanSmallCar": { $exists: false } },
      { "priceBySize.midsizePickupMpv": { $exists: false } },
      { "priceBySize.suv": { $exists: false } },
      { "priceBySize.xlVanSemiTruck": { $exists: false } },
    ],
  });

  for (const service of services) {
    service.priceBySize = buildServicePriceBySize(service.priceBySize, service.price);
    service.price = Math.max(0, Number(service.price) || service.priceBySize.sedanSmallCar || 0);
    await service.save();
  }
}

async function migrateServiceConsumablesBySize() {
  const services = await Service.find({
    $or: [
      { consumablesBySize: { $exists: false } },
      { consumablesBySize: null },
    ],
  });

  for (const service of services) {
    const consumablesBySize = buildServiceConsumablesBySize(service.consumablesBySize, service.consumables);
    service.consumablesBySize = consumablesBySize;
    service.consumables = buildLegacyConsumables(consumablesBySize);
    await service.save();
  }
}

async function clearSeededServiceConsumables() {
  await Service.updateMany(
    {
      id: { $in: ["SVC-1001", "SVC-1002", "SVC-1003"] },
      consumables: {
        $in: [
          "Graphene solution: 1",
          "Applicator pad: 2",
          "Ceramic coat: 1",
          "Microfiber towel: 3",
          "PPF roll: 1",
          "Slip solution: 1",
        ],
      },
    },
    { $set: { consumables: [] } }
  );
}

async function removeSeededEngagementData() {
  await Promise.all([
    Review.deleteMany({ id: { $in: ["REV-1001", "REV-1002", "REV-1003"] } }),
    Promo.deleteMany({ id: { $in: ["PRO-1001", "PRO-1002"] } }),
  ]);
}

async function ensureDefaultRewardPool() {
  const count = await Reward.countDocuments();
  if (count > 0) return;

  await Reward.insertMany([
    {
      id: "RWD-1001",
      name: "Free Microfiber Towel",
      type: "Item",
      description: "Claim one microfiber towel on the next shop visit.",
      value: "Free Towel",
      rarity: "Common",
      weight: 50,
      active: true,
      enabled: true,
      stock: 100,
      quantity: 100,
      expirationDays: 30,
    },
    {
      id: "RWD-1002",
      name: "5% Discount",
      type: "Discount",
      description: "Use this voucher for 5% off a future service.",
      value: "5% Discount",
      rarity: "Uncommon",
      weight: 30,
      active: true,
      enabled: true,
      stock: 100,
      quantity: 100,
      expirationDays: 30,
    },
    {
      id: "RWD-1003",
      name: "Free Car Wash",
      type: "Service",
      description: "Claim one free car wash service.",
      value: "Free Car Wash",
      rarity: "Rare",
      weight: 15,
      active: true,
      enabled: true,
      stock: 100,
      quantity: 100,
      expirationDays: 30,
    },
  ]);
}

async function migratePlaintextPasswords() {
  const usersWithPlaintextPasswords = await User.find({
    password: { $exists: true, $ne: "" },
  });

  await Promise.all(
    usersWithPlaintextPasswords.map(async (user) => {
      ensureUserDocumentId(user);
      if (isPasswordHash(user.password)) return;
      user.password = hashPassword(user.password);
      await user.save();
    })
  );
}

async function migrateMissingUserIds() {
  const usersMissingIds = await User.find({
    $or: [
      { id: { $exists: false } },
      { id: null },
      { id: "" },
    ],
  });

  for (const user of usersMissingIds) {
    ensureUserDocumentId(user);
    await user.save();
  }
}

async function migrateUsersToUserTypes() {
  const users = await User.find({
    $or: [
      { role: { $exists: true, $ne: null } },
      { userType: { $exists: false } },
      { userType: "" },
    ],
  });

  for (const user of users) {
    ensureUserDocumentId(user);
    const normalizedEmail = String(user.email || "").trim().toLowerCase();
    const reservedOverride = RESERVED_USER_OVERRIDES[normalizedEmail];
    const nextUserType = reservedOverride?.userType || toDisplayUserType(user.userType, user.role);
    let nextRole = reservedOverride?.role || toDisplaySubtype(nextUserType, user.role);
    if (nextUserType === "Customer") {
      const bookingCount = await Booking.countDocuments({ customerEmail: normalizedEmail });
      nextRole = bookingCount >= 2 ? "Returning" : "New";
    }
    const currentUserType = String(user.userType || "").trim();
    const currentRole = String(user.role || "").trim();
    if (currentUserType === nextUserType && currentRole === nextRole) continue;
    user.userType = nextUserType;
    user.role = nextRole;
    await user.save();
  }
}

async function migrateCustomerCars() {
  await User.updateMany(
    { cars: { $exists: false } },
    { $set: { cars: [] } }
  );

  const usersWithLegacyCarShape = await User.find({
    $or: [
      { "cars.make": { $exists: true } },
      { "cars.size": { $exists: false } },
    ],
  });
  for (const user of usersWithLegacyCarShape) {
    ensureUserDocumentId(user);
    const nextCars = normalizeCustomerCars(user.cars);
    user.cars = nextCars;
    await user.save();
  }
}

async function migratePromoChannels() {
  await Promo.updateMany(
    { channel: { $exists: true } },
    { $unset: { channel: 1 } }
  );
}

async function backfillAutomaticExpenses() {
  const [stockItems, commissions] = await Promise.all([
    StockMonitoringItem.find({}).lean(),
    Commission.find({}).lean(),
  ]);

  for (const item of stockItems) {
    const initialStock = Number(item.currentStock || 0);
    const unitCost = Number(item.pricePerUnit || 0);

    if (initialStock > 0 && unitCost > 0) {
      await upsertAutomaticExpense({
        sourceType: "stock-create",
        sourceId: item.id,
        date: item.lastRestocked || toDateKey(item.createdAt ? new Date(item.createdAt) : new Date()),
        description: `Initial stock: ${item.name}`,
        note: "Backfilled from existing stock monitoring item.",
        category: "Supplies",
        amount: initialStock * unitCost,
        paidBy: "System",
      });
    }

    const history = Array.isArray(item.restockHistory) ? item.restockHistory : [];
    for (let index = 0; index < history.length; index += 1) {
      const entry = history[index];
      const qtyToAdd = Number(entry.qtyToAdd || 0);
      const costPerUnit = Number(entry.costPerUnit || 0);
      if (qtyToAdd <= 0 || costPerUnit <= 0) continue;

      const restockKey =
        String(entry.restockedAt || "").trim() ||
        `${String(entry.date || "").trim()}-${String(entry.time || "").trim()}-${index}`;

      await upsertAutomaticExpense({
        sourceType: "stock-restock",
        sourceId: `${item.id}:${restockKey}`,
        date: entry.date || item.lastRestocked || toDateKey(),
        description: `Restock: ${item.name}`,
        note: entry.notes || "Backfilled from existing restock history.",
        category: "Supplies",
        amount: qtyToAdd * costPerUnit,
        paidBy: entry.restockedBy || "System",
      });
    }
  }

  for (const commission of commissions) {
    const earned = Number(commission.earned || 0);
    if (earned <= 0) continue;

    await upsertAutomaticExpense({
      sourceType: "commission",
      sourceId: commission.id,
      date: commission.date || toDateKey(commission.createdAt ? new Date(commission.createdAt) : new Date()),
      description: `Worker commission: ${commission.worker || "Staff"}`,
      note: `${commission.service || "Completed service"} commission at ${commission.rate || commissionDomain.DEFAULT_COMMISSION_RATE_PERCENT}%`,
      category: "Commissions",
      amount: earned,
      paidBy: "System",
    });
  }
}

async function syncCustomerSubtypeByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return;

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) return;

  if (RESERVED_USER_OVERRIDES[normalizedEmail]) {
    const reservedOverride = RESERVED_USER_OVERRIDES[normalizedEmail];
    const shouldSave =
      String(user.userType || "").trim() !== reservedOverride.userType ||
      String(user.role || "").trim() !== reservedOverride.role;
    if (shouldSave) {
      ensureUserDocumentId(user);
      user.userType = reservedOverride.userType;
      user.role = reservedOverride.role;
      await user.save();
    }
    return;
  }

  if (normalizeUserType(user.userType, user.role) !== "customer") return;

  const bookingCount = await Booking.countDocuments({ customerEmail: normalizedEmail });
  const nextRole = bookingCount >= 2 ? "Returning" : "New";
  if (String(user.userType || "").trim() !== "Customer") {
    ensureUserDocumentId(user);
    user.userType = "Customer";
  }
  if (String(user.role || "").trim() !== nextRole) {
    ensureUserDocumentId(user);
    user.role = nextRole;
    await user.save();
  }
}

async function generateEligibleRewardsForBooking(booking, auditUser = "system") {
  const customerEmail = String(booking?.customerEmail || "").trim().toLowerCase();
  const customerName = String(booking?.customer || "").trim();
  if (!customerEmail && !customerName) return [];

  const bookingQuery = customerEmail ? { customerEmail } : { customer: customerName };
  const [qualifiedBookings, payments, existingCustomerRewards] = await Promise.all([
    Booking.find(bookingQuery).lean(),
    Payment.find(bookingQuery).lean(),
    CustomerReward.find(customerEmail ? { customerEmail } : { customerName }).lean(),
  ]);
  const paymentsByBookingId = new Map(payments.map((payment) => [String(payment.bookingId || "").trim(), payment]));
  const eligibleBookings = engagementDomain.eligibleBookingsForRewards(qualifiedBookings, paymentsByBookingId);
  const milestoneNumbers = engagementDomain.getEarnedMilestoneNumbers(eligibleBookings.length);
  if (!milestoneNumbers.length) return [];

  const existingMilestones = new Set(
    existingCustomerRewards
      .map((reward) => Number(reward.milestoneNumber || 0))
      .filter((milestone) => milestone > 0)
  );
  const missingMilestones = milestoneNumbers.filter((milestone) => !existingMilestones.has(milestone));
  if (!missingMilestones.length) return [];

  const createdRewards = [];
  for (const milestoneNumber of missingMilestones) {
    const activeRewards = await Reward.find({
      active: { $ne: false },
      enabled: { $ne: false },
      archived: { $ne: true },
      quantity: { $gt: 0 },
      stock: { $gt: 0 },
    }).lean();
    const reward = selectWeightedReward(activeRewards);
    if (!reward) break;

    const expirationDays = Math.max(0, Number(reward.expirationDays || 0));
    const expirationDate = expirationDays > 0
      ? new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : "";

    const decrementedReward = await Reward.findOneAndUpdate(
      {
        id: reward.id,
        active: { $ne: false },
        enabled: { $ne: false },
        archived: { $ne: true },
        quantity: { $gt: 0 },
        stock: { $gt: 0 },
      },
      { $inc: { quantity: -1, stock: -1 } },
      { new: true }
    );
    if (!decrementedReward) continue;

    const milestoneBookings = eligibleBookings.slice(0, milestoneNumber * engagementDomain.REWARD_MILESTONE_SIZE);
    const milestoneKey = `${String(booking.customerId || customerEmail || customerName).trim().toLowerCase()}:${milestoneNumber}`;
    try {
      const customerReward = await CustomerReward.create({
        id: createId("CRW"),
        customerId: String(booking.customerId || ""),
        customerName,
        customerEmail,
        rewardId: reward.id,
        rewardName: reward.name,
        rewardType: reward.type || reward.rewardType || "",
        rewardCode: reward.code || "",
        discountType: reward.discountType || "",
        discountValue: Number(reward.discountValue || 0),
        rarity: reward.rarity || "",
        rewardValue: reward.value,
        dateEarned: toDateKey(),
        dateGranted: toDateKey(),
        sourceCompletedBookingsCount: eligibleBookings.length,
        eligibleBookingCount: eligibleBookings.length,
        eligibleBookingIds: milestoneBookings.map((item) => item.id).filter(Boolean),
        countedBookingIds: milestoneBookings.map((item) => item.id).filter(Boolean),
        milestoneNumber,
        milestoneKey,
        status: "Available",
        expirationDate,
        generatedBy: auditUser === "system" ? "System" : "Admin",
        claimCode: buildClaimCode(),
      });
      createdRewards.push(customerReward);
      await recordAudit(auditUser, "Reward granted", customerReward.id, {
        customer: customerName,
        customerEmail,
        milestoneNumber,
        eligibleBookingCount: eligibleBookings.length,
        rewardId: reward.id,
      });
    } catch (error) {
      await Reward.findOneAndUpdate({ id: reward.id }, { $inc: { quantity: 1, stock: 1 } });
      if (error?.code !== 11000) throw error;
    }
  }

  if (createdRewards.length) {
    await recordAudit(auditUser, "Generated customer rewards", booking.id, {
      customer: customerName,
      customerEmail,
      count: createdRewards.length,
    });
  }

  return createdRewards;
}

async function migrateStockMonitoringCollection() {
  const legacyCollection = "inventoryitems";
  const targetCollection = "stockmonitoringitems";
  const db = StockMonitoringItem.db;

  const existingCollections = await db.db.listCollections({}, { nameOnly: true }).toArray();
  const hasLegacyCollection = existingCollections.some((collection) => collection.name === legacyCollection);
  const hasTargetCollection = existingCollections.some((collection) => collection.name === targetCollection);

  if (!hasLegacyCollection) return;

  if (!hasTargetCollection) {
    await db.db.collection(legacyCollection).rename(targetCollection);
    return;
  }

  const legacyDocs = await db.db.collection(legacyCollection).find({}).toArray();
  if (!legacyDocs.length) return;

  const targetIds = new Set(
    (await db.db.collection(targetCollection).find({}, { projection: { id: 1 } }).toArray()).map((doc) => doc.id)
  );

  const docsToInsert = legacyDocs
    .filter((doc) => doc.id && !targetIds.has(doc.id))
    .map(({ _id, ...doc }) => doc);

  if (docsToInsert.length) {
    await db.db.collection(targetCollection).insertMany(docsToInsert, { ordered: false });
  }

  await db.db.collection(legacyCollection).drop();
}

async function loadBootstrapData() {
  const [bookings, services, stockMonitoring, payments, users, auditLogs, archivedAuditLogs, reviews, promos, quoteRequests, expenses, commissions, rewards, customerRewards, securitySetting] = await Promise.all([
    Booking.find().sort({ createdAt: -1 }).lean(),
    Service.find().sort({ createdAt: -1 }).lean(),
    StockMonitoringItem.find().sort({ createdAt: -1 }).lean(),
    Payment.find().sort({ createdAt: -1 }).lean(),
    User.find().sort({ createdAt: -1 }).lean(),
    AuditLog.find({ archived: { $ne: true } }).sort({ createdAt: -1 }).limit(100).lean(),
    AuditLog.find({ archived: true }).sort({ archivedAt: -1, createdAt: -1 }).limit(100).lean(),
    Review.find().sort({ createdAt: -1 }).lean(),
    Promo.find().sort({ createdAt: -1 }).lean(),
    QuoteRequest.find().sort({ createdAt: -1 }).lean(),
    Expense.find().sort({ date: -1, createdAt: -1 }).lean(),
    Commission.find().sort({ date: -1, createdAt: -1 }).lean(),
    Reward.find().sort({ createdAt: -1 }).lean(),
    CustomerReward.find().sort({ createdAt: -1 }).lean(),
    getOrCreateSecuritySetting(),
  ]);

  const bookingById = new Map(bookings.map((booking) => [String(booking.id || "").trim(), booking]));
  const normalizedPayments = payments.map((payment) => {
    const booking = bookingById.get(String(payment.bookingId || "").trim()) || {};
    const normalizedPayment = normalizePaymentStageFields(payment, booking);
    return {
      ...normalizedPayment,
      recognizedRevenueEvents: paymentDomain.getVerifiedRevenueEventsForPayment(normalizedPayment, booking),
      invoice: invoiceDomain.buildInvoiceDto(normalizedPayment, booking),
    };
  });
  const normalizedStockMonitoring = stockMonitoring.map((item) => {
    const stockStatus = stockDomain.getStockStatus(item);
    return {
      ...item,
      reorderLevel: stockStatus.reorderLevel,
      stockStatus: stockStatus.label,
      stockStatusKey: stockStatus.key,
      stockTone: stockStatus.tone,
      stockPercent: stockDomain.getStockPercent(item),
    };
  });
  const businessSummary = buildBusinessSummary({
    bookings,
    payments: normalizedPayments,
    stockMonitoring: normalizedStockMonitoring,
    quoteRequests,
  });

  const alerts = [];
  if (businessSummary.lowStockCount > 0) {
    alerts.push({ title: "Low stock items", description: String(businessSummary.lowStockCount) + " stock monitoring item(s) need restocking." });
  }
  if (bookings.length === 0) {
    alerts.push({ title: "No bookings yet", description: "Create your first booking to start building the dashboard." });
  }
  if (!alerts.length) {
    alerts.push({ title: "All systems good", description: "No urgent admin alerts right now." });
  }

  return {
    bookings: bookings.map((booking) => appendBookingAccessLinks(booking)),
    services: services.map((service) => hydrateService(service)),
    stockMonitoring: normalizedStockMonitoring,
    payments: normalizedPayments,
    users: users.map((user) => sanitizeUser(user)),
    auditLogs,
    archivedAuditLogs,
    reviews,
    promos: promos.map((promo) => hydratePromo(promo)),
    quoteRequests,
    expenses,
    commissions,
    rewards,
    customerRewards: customerRewards.map((reward) => hydrateCustomerReward(reward, normalizedPayments)),
    settings: getSafeSecuritySettings(securitySetting),
    alerts,
    financialReport: invoiceDomain.buildFinancialReportDto({
      payments: normalizedPayments,
      expenses,
      commissions,
    }),
    summary: {
      bookingsToday: businessSummary.bookingsToday,
      inProgressCount: businessSummary.inProgressCount,
      lowStockCount: businessSummary.lowStockCount,
      paidRevenue: businessSummary.paidRevenue,
      activePaidRevenue: businessSummary.activePaidRevenue,
      historicalPaidRevenue: businessSummary.historicalPaidRevenue,
      paidRevenueEvents: businessSummary.paidRevenueEvents,
      totalSchedules: businessSummary.totalSchedules,
      completedCount: businessSummary.completedCount,
      cancelledCount: businessSummary.cancelledCount,
      pendingCount: businessSummary.pendingCount,
      scheduledCount: businessSummary.scheduledCount,
      upcomingBookings: businessSummary.upcomingBookings,
      quoteRequestCount: businessSummary.quoteRequestCount,
    },
  };
}

function normalizeAuditIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function buildAuditActorTypeLookup(users = []) {
  const lookup = new Map();

  for (const user of users) {
    const userType = normalizeUserType(user?.userType, user?.role);
    const email = normalizeAuditIdentity(user?.email);
    const fullName = normalizeAuditIdentity(user?.name || `${user?.first || ""} ${user?.last || ""}`.trim());

    if (email) lookup.set(email, userType);
    if (fullName) lookup.set(fullName, userType);
  }

  return lookup;
}

function getAuditActorType(log, actorTypeLookup) {
  const actor = normalizeAuditIdentity(log?.userId);
  if (!actor) return "";
  if (actor === "system") return "system";
  return actorTypeLookup.get(actor) || "";
}

function buildCustomerAuditScope(authUser = {}, ownUser = {}) {
  const scope = new Set();
  const first = String(ownUser?.first || authUser?.first || "").trim();
  const last = String(ownUser?.last || authUser?.last || "").trim();
  const fullName = [first, last].filter(Boolean).join(" ").trim();

  [
    authUser?.email,
    ownUser?.email,
    authUser?.name,
    ownUser?.name,
    fullName,
  ]
    .map(normalizeAuditIdentity)
    .filter(Boolean)
    .forEach((value) => scope.add(value));

  return scope;
}

function getAuditCustomerScopeValues(log) {
  return [
    log?.userId,
    log?.meta?.email,
    log?.meta?.customerEmail,
    log?.meta?.customer,
  ]
    .map(normalizeAuditIdentity)
    .filter(Boolean);
}

function isCustomerVisibleAuditLog(log, customerScope) {
  if (!customerScope.size) return false;
  return getAuditCustomerScopeValues(log).some((value) => customerScope.has(value));
}

function isAuditLogWithinDays(log, days) {
  const safeDays = Math.max(0, Number(days || 0));
  if (!safeDays) return true;

  const candidates = [log?.createdAt, log?.updatedAt, log?.archivedAt, log?.ts]
    .map((value) => {
      const date = value ? new Date(value) : null;
      return date && !Number.isNaN(date.getTime()) ? date : null;
    })
    .filter(Boolean);

  if (!candidates.length) return false;

  const newestDate = candidates.sort((left, right) => right.getTime() - left.getTime())[0];
  const cutoff = Date.now() - safeDays * 24 * 60 * 60 * 1000;
  return newestDate.getTime() >= cutoff;
}

function isCustomerScopedAuditLog(log) {
  return getAuditCustomerScopeValues(log).length > 0;
}

function isPaymentProofSubmissionAuditLog(log) {
  if (log?.meta?.type === "payment-proof-submitted") return true;
  const action = String(log?.action || "").trim().toLowerCase();
  return (action === "full payment proof submitted" || action === "remaining balance proof submitted") && Boolean(log?.meta?.proofSubmittedAt);
}

function isAdminVisibleAuditLog(log, actorTypeLookup) {
  if (isPaymentProofSubmissionAuditLog(log)) return true;
  const actorType = getAuditActorType(log, actorTypeLookup);
  if (actorType === "admin" || actorType === "staff") return true;
  if (actorType === "system") {
    return !isCustomerScopedAuditLog(log);
  }
  return false;
}

function filterBootstrapDataForRole(data, authUser = {}) {
  const userType = normalizeUserType(authUser.userType, authUser.role);
  const email = String(authUser.email || "").trim().toLowerCase();
  const ownUser = data.users.find((user) => String(user.email || "").trim().toLowerCase() === email);
  const scopedUser = ownUser
    ? { ...authUser, ...ownUser, userType: authUser.userType || ownUser.userType, role: authUser.role || ownUser.role }
    : authUser;
  const actorTypeLookup = buildAuditActorTypeLookup(data.users);

  if (userType === "admin") {
    return {
      ...data,
      auditLogs: data.auditLogs.filter((log) => isAdminVisibleAuditLog(log, actorTypeLookup)),
      archivedAuditLogs: data.archivedAuditLogs.filter((log) => isAdminVisibleAuditLog(log, actorTypeLookup)),
    };
  }

  if (userType === "customer") {
    const customerAuditScope = buildCustomerAuditScope(authUser, ownUser);
    const scopedBookings = data.bookings.filter((booking) => canViewBooking(scopedUser, booking, data.users));
    const visibleBookingIds = new Set(scopedBookings.map((booking) => String(booking.id || "")));
    const customerName = String(scopedUser.name || ownUser?.name || "").trim().toLowerCase();
    const safePreferredDetailers = data.users
      .filter((user) => isActiveDetailerUser(user))
      .map((user) => sanitizePreferredDetailerUser(user));

    return {
      ...data,
      bookings: scopedBookings,
      payments: data.payments.filter((payment) => {
        const paymentEmail = String(payment.customerEmail || "").trim().toLowerCase();
        return (email && paymentEmail === email) || visibleBookingIds.has(String(payment.bookingId || ""));
      }),
      users: [...(ownUser ? [ownUser] : []), ...safePreferredDetailers],
      stockMonitoring: [],
      auditLogs: data.auditLogs.filter((log) => isCustomerVisibleAuditLog(log, customerAuditScope) && isAuditLogWithinDays(log, 30)),
      archivedAuditLogs: data.archivedAuditLogs.filter((log) => isCustomerVisibleAuditLog(log, customerAuditScope) && isAuditLogWithinDays(log, 30)),
      reviews: data.reviews.filter((review) => {
        const reviewEmail = String(review.customerEmail || "").trim().toLowerCase();
        const reviewCustomer = String(review.customer || "").trim().toLowerCase();
        return (email && reviewEmail === email) || (customerName && reviewCustomer === customerName);
      }),
      quoteRequests: [],
      expenses: [],
      commissions: [],
      promos: data.promos.filter((promo) => String(promo.status || "").trim().toLowerCase() === "active"),
      rewards: data.rewards.filter((reward) => reward.active !== false),
      customerRewards: data.customerRewards.filter((reward) => {
        const rewardEmail = String(reward.customerEmail || "").trim().toLowerCase();
        const rewardCustomerId = String(reward.customerId || "").trim();
        return (email && rewardEmail === email) || (scopedUser.id && rewardCustomerId === String(scopedUser.id));
      }),
      alerts: [],
    };
  }

  if (userType === "staff") {
    const staffRole = getEffectiveRole(scopedUser);
    const hasModule = (moduleKey) => canAccessModule(scopedUser, moduleKey);
    const scopedBookings = data.bookings.filter((booking) => canViewBooking(scopedUser, booking, data.users));
    const visibleBookingIds = new Set(scopedBookings.map((booking) => String(booking.id || "")));
    const canSeePayments = hasModule(MODULE_KEYS.paymentTracking);
    const canSeeFinancials = hasModule(MODULE_KEYS.financialTracker);
    const canSeeStock = hasModule(MODULE_KEYS.stockMonitoring);
    const canSeeEngagement = hasModule(MODULE_KEYS.engagement);
    const canSeeCommissions =
      canAccessModule(scopedUser, MODULE_KEYS.detailerManagement) ||
      canAccessModule(scopedUser, MODULE_KEYS.myWork) ||
      canSeeFinancials;
    const scopedCommissions = canSeeCommissions
      ? data.commissions.filter((commission) => {
          return canViewCommission(scopedUser, commission);
        })
      : [];
    const scopedAuditLogs = data.auditLogs.filter((log) => {
      if (!hasModule(MODULE_KEYS.auditLogs)) return false;
      const action = String(log.action || "").trim().toLowerCase();
      const userId = String(log.userId || "").trim().toLowerCase();
      if (staffRole === "inventory clerk") return action.includes("stock") || action.includes("inventory") || action.includes("consumable");
      if (staffRole === "marketing") return action.includes("promo") || action.includes("reward") || action.includes("review") || action.includes("engagement");
      if (staffRole === "sales associate") return userId === email;
      if (staffRole === "junior detailer" || staffRole === "senior detailer") return userId === email || action.includes("commission");
      return false;
    });
    const scopedUsers = data.users.filter((user) => {
      const type = normalizeUserType(user.userType, user.role);
      if (type === "admin") return false;
      if (hasModule(MODULE_KEYS.userManagement)) return staffRole === "general manager" ? type === "staff" || type === "customer" : type === "staff";
      if (staffRole === "junior detailer" || staffRole === "senior detailer") return type === "staff";
      if (hasModule(MODULE_KEYS.bookings)) return type === "customer" || type === "staff";
      if (hasModule(MODULE_KEYS.myWork) || hasModule(MODULE_KEYS.detailerManagement)) return type === "staff";
      return String(user.email || "").trim().toLowerCase() === email;
    });
    return {
      ...data,
      bookings: scopedBookings,
      services: hasModule(MODULE_KEYS.services) || hasModule(MODULE_KEYS.bookings) || hasModule(MODULE_KEYS.myWork) ? data.services : [],
      stockMonitoring: canSeeStock ? data.stockMonitoring : [],
      payments: canSeePayments
        ? data.payments.filter((payment) => visibleBookingIds.has(String(payment.bookingId || "")) || staffRole === "general manager" || staffRole === "sales manager" || staffRole === "sales associate")
        : [],
      users: scopedUsers,
      auditLogs: scopedAuditLogs,
      archivedAuditLogs: [],
      reviews: canSeeEngagement || staffRole === "marketing" ? data.reviews : [],
      promos: canSeeEngagement ? data.promos : data.promos.filter((promo) => String(promo.status || "").trim().toLowerCase() === "active"),
      quoteRequests: canPerformAction(scopedUser, ACTION_KEYS.bookingUpdate) || canSeeEngagement ? data.quoteRequests : [],
      expenses: canSeeFinancials ? data.expenses : [],
      commissions: scopedCommissions,
      customerRewards: canSeeEngagement ? data.customerRewards : [],
      rewards: canSeeEngagement ? data.rewards : data.rewards.filter((reward) => reward.active !== false),
      alerts: canSeeStock ? data.alerts : [],
    };
  }

  return {
    ...data,
    bookings: [],
    payments: [],
    users: ownUser ? [ownUser] : [],
    stockMonitoring: [],
    auditLogs: [],
    archivedAuditLogs: [],
    quoteRequests: [],
    expenses: [],
    commissions: [],
    customerRewards: [],
    alerts: [],
  };
}

function sendHealth(res) {
  res.json({
    status: "ok",
    database: getDatabaseState(),
    databaseName: getDatabaseName() || "unknown",
    timestamp: new Date().toISOString(),
  });
}

function validateProductionEnvironment() {
  if (!IS_PRODUCTION) return;
  getJwtSecret();
}

function isDatabaseConnected() {
  return getDatabaseState() === "connected";
}

function logProductionConfiguration() {
  console.log("[startup] MongoDB", {
    state: getDatabaseState(),
    database: getDatabaseName() || "unknown",
    env: getMongoEnvName() || "not-selected",
  });
  console.log("[startup] Email", {
    provider: getConfiguredEmailProvider(),
    hasResendApiKey: Boolean(RESEND_API_KEY),
    from: EMAIL_FROM || "missing",
    smtpFallbackConfigured: Boolean(SMTP_EMAIL && SMTP_APP_PASSWORD),
  });
}

function respondIfDatabaseUnavailable(res) {
  if (isDatabaseConnected()) return false;
  res.status(503).json({
    message: "Database is not connected. Please check the production MongoDB environment variable and Railway deploy logs.",
  });
  return true;
}

app.get("/health", (_req, res) => {
  sendHealth(res);
});

app.get("/api/health", (_req, res) => {
  sendHealth(res);
});

app.get("/api/reference/vehicle-brands", async (_req, res, next) => {
  try {
    res.json({ brands: await getVehicleBrands() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/reference/vehicle-models", async (req, res, next) => {
  try {
    res.json({ models: await getVehicleModelsForBrand(req.query.brand || req.query.make) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/reference/vehicle-makes", async (_req, res, next) => {
  try {
    res.json({ makes: await getVehicleBrands() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/public/services", async (_req, res, next) => {
  try {
    const services = await Service.find({}).sort({ createdAt: 1 }).lean();
    res.json({ services: services.map((service) => hydrateService(service)).filter((service) => service.enabled !== false) });
  } catch (error) {
    next(error);
  }
});

app.use("/api/admin", authenticateApi);
app.use("/api/ai", authenticateApi);

app.get("/api/admin/bootstrap", async (_req, res, next) => {
  try {
    res.json(filterBootstrapDataForRole(await loadBootstrapData(), _req.authUser));
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/security-controls", requireAdminUser, async (_req, res, next) => {
  try {
    const setting = await getOrCreateSecuritySetting();
    res.json({
      adminSpecialPinConfigured: Boolean(setting.adminSpecialPinHash),
      adminSpecialPasswordConfigured: Boolean(setting.adminSpecialPasswordHash),
      staffSpecialPinConfigured: Boolean(setting.staffSpecialPinHash),
      staffSpecialPasswordConfigured: Boolean(setting.staffSpecialPasswordHash),
      requiredDownPaymentAmount: getSafeSecuritySettings(setting).requiredDownPaymentAmount,
      updatedAt: setting.updatedAt || "",
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/settings/down-payment", requireAdminUser, async (req, res, next) => {
  try {
    const adminSpecialPassword = String(req.body.adminSpecialPassword || req.body.specialPassword || "").trim();
    if (!adminSpecialPassword) {
      res.status(401).json({ message: "Admin special password is required." });
      return;
    }

    const validCredential = await validateSpecialCredential("password", adminSpecialPassword, "admin");
    if (!validCredential) {
      res.status(401).json({ message: "Incorrect admin special password." });
      return;
    }

    const rawAmount = req.body.requiredDownPaymentAmount;
    const amount = Number(rawAmount);
    if (rawAmount === undefined || rawAmount === null || String(rawAmount).trim() === "") {
      res.status(400).json({ message: "Required down payment amount is required." });
      return;
    }
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) {
      res.status(400).json({ message: "Required down payment amount must be between 0 and 1,000,000." });
      return;
    }

    const setting = await getOrCreateSecuritySetting();
    setting.requiredDownPaymentAmount = roundMoney(amount);
    setting.updatedBy = req.authUser?.email || req.body.auditUser || "admin";
    await setting.save();
    await recordAudit(setting.updatedBy, "Updated required down payment amount", SECURITY_SETTING_ID, {
      requiredDownPaymentAmount: setting.requiredDownPaymentAmount,
    });

    res.json({
      message: "Required down payment amount updated.",
      ...getSafeSecuritySettings(setting),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/security/validate", requireRoles("admin", "staff"), async (req, res, next) => {
  try {
    const mode = String(req.body.mode || "pin").trim().toLowerCase();
    const scope = String(req.body.scope || "admin").trim().toLowerCase() === "staff" ? "staff" : "admin";
    const actorType = normalizeUserType(req.authUser?.userType, req.authUser?.role);
    const actionKey = String(req.body.actionKey || "").trim();
    if (actorType === "staff" && scope === "admin") {
      res.status(403).json({ message: "Staff actions must use staff security credentials." });
      return;
    }
    // All staff roles share one Staff Special PIN and one Staff Special Password created by Admin. Staff special credentials are used only for staff-level protected actions that the logged-in staff role is already allowed to perform. Staff special credentials must never grant access to unauthorized modules or admin-only actions. Admin-only actions must continue to require Admin special credentials.
    if (actorType === "staff" && (!actionKey || !canUseStaffSpecialCredentialForAction(req.authUser, actionKey))) {
      res.status(403).json({ message: "Staff special credentials cannot authorize this action." });
      return;
    }
    const value = String(req.body.value || "");
    const valid = await validateSpecialCredential(mode, value, scope);
    if (!valid) {
      res.status(401).json({ message: `Incorrect ${scope} special ${mode === "password" ? "password" : "PIN"}.` });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/security/verify-password", requireAdminUser, async (req, res, next) => {
  try {
    const user = await verifyAdminAccountPassword(req.body.email, req.body.currentPassword);
    if (!user) {
      res.status(401).json({ message: "Current account password is incorrect." });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/security-controls", requireAdminUser, async (req, res, next) => {
  try {
    const user = await verifyAdminAccountPassword(req.body.email, req.body.currentPassword);
    if (!user) {
      res.status(401).json({ message: "Current account password is incorrect." });
      return;
    }

    const setting = await getOrCreateSecuritySetting();
    const updates = [
      ["adminSpecialPin", "adminSpecialPinHash", /^\d{4,8}$/, "Admin special PIN must be 4 to 8 digits."],
      ["staffSpecialPin", "staffSpecialPinHash", /^\d{4,8}$/, "Staff special PIN must be 4 to 8 digits."],
      ["adminSpecialPassword", "adminSpecialPasswordHash", /^.{8,}$/, "Admin special password must be at least 8 characters."],
      ["staffSpecialPassword", "staffSpecialPasswordHash", /^.{8,}$/, "Staff special password must be at least 8 characters."],
    ];

    for (const [field, hashField, rule, message] of updates) {
      if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;
      const nextValue = String(req.body[field] || "").trim();
      if (!rule.test(nextValue)) {
        res.status(400).json({ message });
        return;
      }
      setting[hashField] = await hashSpecialCredential(nextValue);
    }

    setting.updatedBy = user.email;
    await setting.save();
    await recordAudit(user.email, "Updated security controls", SECURITY_SETTING_ID);
    res.json({
      message: "Security controls updated.",
      adminSpecialPinConfigured: Boolean(setting.adminSpecialPinHash),
      adminSpecialPasswordConfigured: Boolean(setting.adminSpecialPasswordHash),
      staffSpecialPinConfigured: Boolean(setting.staffSpecialPinHash),
      staffSpecialPasswordConfigured: Boolean(setting.staffSpecialPasswordHash),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/public/quotes", async (req, res, next) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const phone = String(req.body.phone || "").trim();
    const vehicleType = String(req.body.vehicleType || "").trim();
    const carSize = normalizeCarSizeLabel(req.body.carSize || "");
    const serviceName = String(req.body.service || "").trim();
    const message = String(req.body.message || "").trim();

    if (!fullName) {
      res.status(400).json({ message: "Full name is required." });
      return;
    }

    if (!phone) {
      res.status(400).json({ message: "Phone number is required." });
      return;
    }

    if (!vehicleType) {
      res.status(400).json({ message: "Vehicle type is required." });
      return;
    }

    if (!carSize) {
      res.status(400).json({ message: "Car size is required." });
      return;
    }

    if (!serviceName) {
      res.status(400).json({ message: "Service selection is required." });
      return;
    }

    const matchedService = await ensureBookableService(serviceName);
    const estimatedAmount = matchedService ? resolveBookingBaseAmount(serviceName, carSize, 0) : 0;
    const finalEstimatedAmount = Number(await estimatedAmount) || 0;
    const estimateLabel = finalEstimatedAmount > 0
      ? `Estimated Price: P ${finalEstimatedAmount.toLocaleString()}`
      : "Custom quote available upon review";

    const quoteRequest = await QuoteRequest.create({
      id: createId("QTE"),
      fullName,
      phone,
      vehicleType,
      carSize,
      service: serviceName,
      estimatedAmount: finalEstimatedAmount,
      estimateLabel,
      message,
      status: normalizeQuoteStatus(req.body.status || "Under Review"),
      source: "landing-page",
    });

    await recordAudit(fullName, "Created quote request", quoteRequest.id, {
      phone,
      vehicleType,
      carSize,
      service: serviceName,
      estimatedAmount: finalEstimatedAmount,
    });

    res.status(201).json({
      id: quoteRequest.id,
      message: "Quote request saved. Our team can now follow up with you.",
      estimateLabel,
      estimatedAmount: finalEstimatedAmount,
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/quote-requests/:id", requireRoles("admin", "staff"), async (req, res, next) => {
  try {
    if (
      normalizeUserType(req.authUser?.userType, req.authUser?.role) === "staff" &&
      !canPerformAction(req.authUser, ACTION_KEYS.bookingUpdate) &&
      !canPerformAction(req.authUser, ACTION_KEYS.engagementManage)
    ) {
      denyForbidden(res);
      return;
    }
    const status = normalizeQuoteStatus(req.body.status);
    const quoteRequest = await QuoteRequest.findOneAndUpdate(
      { id: req.params.id },
      { status },
      { new: true }
    );
    if (!quoteRequest) {
      res.status(404).json({ message: "Quote request not found." });
      return;
    }
    await recordAudit(req.body.auditUser, "Updated quote request status", quoteRequest.id, { status });
    res.json(quoteRequest);
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/analytics/interpret", requireRoles("admin", "staff"), requireModule(MODULE_KEYS.analytics), handleAnalyticsAiInterpret);
app.post("/api/admin/analytics/interpretation", requireRoles("admin", "staff"), requireModule(MODULE_KEYS.analytics), handleAnalyticsAiInterpret);

app.post("/api/ai/financial/interpret", requireRoles("admin", "staff"), requireModule(MODULE_KEYS.financialTracker), handleFinancialAiInterpret);
app.post("/api/admin/financials/interpretation", requireRoles("admin", "staff"), requireModule(MODULE_KEYS.financialTracker), handleFinancialAiInterpret);

app.get("/api/public/tracking/:token", async (req, res, next) => {
  try {
    const parsedToken = parseBookingAccessToken(req.params.token, QR_TOKEN_PURPOSES.tracking);
    if (!parsedToken) {
      rejectInvalidPublicAccess(res);
      return;
    }

    const booking = await Booking.findOne({ id: parsedToken.bookingId }).lean();
    if (
      !booking ||
      isBookingAccessRevoked(booking, QR_TOKEN_PURPOSES.tracking) ||
      getBookingAccessVersion(booking, QR_TOKEN_PURPOSES.tracking) !== parsedToken.accessVersion
    ) {
      rejectInvalidPublicAccess(res);
      return;
    }

    res.json(buildTrackingDto(booking));
  } catch (error) {
    next(error);
  }
});

app.get("/api/public/warranty/:token", async (req, res, next) => {
  try {
    const parsedToken = parseBookingAccessToken(req.params.token, QR_TOKEN_PURPOSES.warranty);
    if (!parsedToken) {
      rejectInvalidPublicAccess(res);
      return;
    }

    const booking = await Booking.findOne({ id: parsedToken.bookingId }).lean();
    if (
      !booking ||
      isBookingAccessRevoked(booking, QR_TOKEN_PURPOSES.warranty) ||
      getBookingAccessVersion(booking, QR_TOKEN_PURPOSES.warranty) !== parsedToken.accessVersion
    ) {
      rejectInvalidPublicAccess(res);
      return;
    }

    res.json(buildWarrantyDto(booking));
  } catch (error) {
    next(error);
  }
});

app.get("/api/tracking/:id/warranty", authenticateApi, async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ id: req.params.id }).lean();
    if (!booking) {
      res.status(404).json({ message: "Tracking record not found." });
      return;
    }

    const users = await User.find().lean();
    if (!canViewBooking(req.authUser, booking, users)) {
      res.status(403).json({ message: "You do not have permission to view this warranty record." });
      return;
    }

    res.json(buildWarrantyDto(booking));
  } catch (error) {
    next(error);
  }
});

app.get("/api/tracking/:id", authenticateApi, async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ id: req.params.id }).lean();

    if (!booking) {
      res.status(404).json({ message: "Tracking record not found." });
      return;
    }

    const users = await User.find().lean();
    if (!canViewBooking(req.authUser, booking, users)) {
      res.status(403).json({ message: "You do not have permission to view this tracking record." });
      return;
    }

    res.json(buildTrackingDto(booking));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    if (respondIfDatabaseUnavailable(res)) return;

    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await User.findOne({ email });

    if (!user || !verifyPassword(password, user.password)) {
      await recordAudit(email || "guest", "Failed sign in", email || "LOGIN", { email });
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    if (!isActiveAccount(user)) {
      await recordAudit(email || "guest", "Blocked inactive account sign in", user.id, {
        email,
        status: user.status || "",
      });
      res.status(403).json({ message: "This account is inactive." });
      return;
    }

    if (!isPasswordHash(user.password)) {
      ensureUserDocumentId(user);
      user.password = hashPassword(password);
      await user.save();
    }

    await recordAudit(user.email, "Signed in", user.id, {
      userType: normalizeUserType(user.userType, user.role),
      role: normalizeSubtype(user.userType, user.role),
    });
    res.json(buildAuthPayload(user));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/signup/request-otp", async (req, res, next) => {
  try {
    if (respondIfDatabaseUnavailable(res)) return;

    const payload = {
      first: String(req.body.firstName || "").trim(),
      last: String(req.body.lastName || "").trim(),
      email: String(req.body.email || "").trim().toLowerCase(),
      phone: String(req.body.phone || "").trim(),
      password: String(req.body.password || ""),
      channel: String(req.body.channel || "").trim().toLowerCase(),
    };

    if (payload.channel !== "email") {
      res.status(400).json({ message: "Please use email for signup OTP delivery." });
      return;
    }

    const [existingEmail, existingPhone] = await Promise.all([
      User.findOne({ email: payload.email }).lean(),
      User.findOne({ phone: payload.phone }).lean(),
    ]);

    if (existingEmail) {
      res.status(409).json({ message: "That email is already registered." });
      return;
    }

    if (existingPhone) {
      res.status(409).json({ message: "That contact number is already registered." });
      return;
    }

    const verificationId = createId("OTP");
    const otp = createOtpCode();
    signupOtpStore.set(verificationId, {
      ...payload,
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    });

    const delivery = await sendOtpThroughChannel({
      channel: payload.channel,
      email: payload.email,
      phone: payload.phone,
      otp,
    });

    await recordAudit(payload.email, "Requested signup OTP", verificationId, {
      channel: payload.channel,
      email: payload.email,
    });

    res.json({
      verificationId,
      channel: delivery.channel,
      destination: delivery.destination,
      message: "OTP sent to your email address.",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/signup/verify-otp", async (req, res, next) => {
  try {
    if (respondIfDatabaseUnavailable(res)) return;

    const verificationId = String(req.body.verificationId || "").trim();
    const otp = String(req.body.otp || "").trim();
    const pendingSignup = signupOtpStore.get(verificationId);

    if (!pendingSignup) {
      res.status(410).json({ message: "This OTP session has expired. Please request a new code." });
      return;
    }

    if (Date.now() > pendingSignup.expiresAt) {
      signupOtpStore.delete(verificationId);
      res.status(410).json({ message: "This OTP has expired. Please request a new code." });
      return;
    }

    pendingSignup.attempts += 1;
    if (pendingSignup.attempts > 5) {
      signupOtpStore.delete(verificationId);
      res.status(429).json({ message: "Too many incorrect attempts. Please request a new OTP." });
      return;
    }

    if (otp !== pendingSignup.otp) {
      res.status(400).json({ message: "Incorrect OTP. Please try again." });
      return;
    }

    const [existingEmail, existingPhone] = await Promise.all([
      User.findOne({ email: pendingSignup.email }).lean(),
      User.findOne({ phone: pendingSignup.phone }).lean(),
    ]);

    if (existingEmail || existingPhone) {
      signupOtpStore.delete(verificationId);
      res.status(409).json({ message: "That account already exists. Please sign in instead." });
      return;
    }

    const user = await User.create({
      id: createId("USR"),
      name: `${pendingSignup.first} ${pendingSignup.last}`.trim(),
      first: pendingSignup.first,
      last: pendingSignup.last,
      userType: "Customer",
      role: "New",
      email: pendingSignup.email,
      phone: pendingSignup.phone,
      password: hashPassword(pendingSignup.password),
      status: "active",
    });

    signupOtpStore.delete(verificationId);
    await recordAudit(user.email, "Created account", user.id, {
      channel: pendingSignup.channel,
      email: user.email,
    });

    res.status(201).json(buildAuthPayload(user));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/password-change/request-otp", async (req, res, next) => {
  try {
    if (respondIfDatabaseUnavailable(res)) return;

    const email = String(req.body.email || "").trim().toLowerCase();
    const channel = String(req.body.channel || "").trim().toLowerCase();

    if (channel !== "email") {
      res.status(400).json({ message: "Please use email for password change OTP delivery." });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ message: "No account was found for that email address." });
      return;
    }

    const verificationId = createId("OTP-PW");
    const otp = createOtpCode();
    passwordChangeOtpStore.set(verificationId, {
      userId: user.id,
      email: user.email,
      channel,
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
      verified: false,
    });

    const delivery = await sendPasswordChangeOtpThroughChannel({
      channel,
      email: user.email,
      phone: user.phone || "",
      otp,
    });

    await recordAudit(user.email, "Requested password change OTP", verificationId, {
      channel,
      email: user.email,
    });

    res.json({
      verificationId,
      channel: delivery.channel,
      destination: delivery.destination,
      message: "OTP sent to your email address.",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/password-change/verify-otp", async (req, res, next) => {
  try {
    if (respondIfDatabaseUnavailable(res)) return;

    const verificationId = String(req.body.verificationId || "").trim();
    const otp = String(req.body.otp || "").trim();
    const pendingChange = passwordChangeOtpStore.get(verificationId);

    if (!pendingChange) {
      res.status(410).json({ message: "This OTP session has expired. Please request a new code." });
      return;
    }

    if (Date.now() > pendingChange.expiresAt) {
      passwordChangeOtpStore.delete(verificationId);
      res.status(410).json({ message: "This OTP has expired. Please request a new code." });
      return;
    }

    pendingChange.attempts += 1;
    if (pendingChange.attempts > 5) {
      passwordChangeOtpStore.delete(verificationId);
      res.status(429).json({ message: "Too many incorrect attempts. Please request a new OTP." });
      return;
    }

    if (otp !== pendingChange.otp) {
      res.status(400).json({ message: "Incorrect OTP. Please try again." });
      return;
    }

    pendingChange.verified = true;
    pendingChange.verifiedAt = Date.now();

    await recordAudit(pendingChange.email, "Verified password change OTP", verificationId, {
      email: pendingChange.email,
    });

    res.json({ verified: true, message: "OTP verified successfully." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/password-change/reset", async (req, res, next) => {
  try {
    if (respondIfDatabaseUnavailable(res)) return;

    const verificationId = String(req.body.verificationId || "").trim();
    const password = String(req.body.password || "");
    const pendingChange = passwordChangeOtpStore.get(verificationId);

    if (!pendingChange) {
      res.status(410).json({ message: "This OTP session has expired. Please request a new code." });
      return;
    }

    if (Date.now() > pendingChange.expiresAt) {
      passwordChangeOtpStore.delete(verificationId);
      res.status(410).json({ message: "This OTP has expired. Please request a new code." });
      return;
    }

    if (!pendingChange.verified) {
      res.status(400).json({ message: "Please verify the OTP first." });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ message: "Password must be at least 8 characters." });
      return;
    }

    const user = await User.findOne({ id: pendingChange.userId });
    if (!user) {
      passwordChangeOtpStore.delete(verificationId);
      res.status(404).json({ message: "User account was not found." });
      return;
    }

    ensureUserDocumentId(user);
    user.password = hashPassword(password);
    await user.save();
    passwordChangeOtpStore.delete(verificationId);

    await recordAudit(user.email, "Updated user password", user.id, {
      email: user.email,
      via: "otp",
    });

    res.json({ message: "Password updated successfully." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/bookings", requireRoles("admin", "staff", "customer"), async (req, res, next) => {
  try {
    const bookingDate = String(req.body.date || "").trim();
    const actorType = normalizeUserType(req.authUser?.userType, req.authUser?.role);
    if (actorType === "staff" && !canPerformAction(req.authUser, ACTION_KEYS.bookingCreate)) {
      denyForbidden(res);
      return;
    }
    const isCustomerRequested =
      actorType === "customer";
    const canCreateWithPlaceSlot = actorType === "admin" || getEffectiveRole(req.authUser) === "general manager";
    const bookingTime = String(req.body.time || "").trim();
    const bookingPlaceSlot = canCreateWithPlaceSlot ? Number(req.body.placeSlot || 0) : 0;
    const bookingCustomerEmail = isCustomerRequested
      ? String(req.authUser?.email || "").trim().toLowerCase()
      : String(req.body.customerEmail || "").trim().toLowerCase();
    const resolvedCustomer = await resolveBookingCustomerForRequest(req, { isCustomerRequested });
    const bookingCustomerName = resolvedCustomer
      ? (resolvedCustomer.name || `${resolvedCustomer.first || ""} ${resolvedCustomer.last || ""}`.trim())
      : isCustomerRequested
        ? (req.authUser?.name || req.body.customer || "")
        : (req.body.customer || "");
    const vehicleSnapshot = await validateVehicleOwnershipForBooking({
      req,
      customer: resolvedCustomer,
      isCustomerRequested,
    });

    if (isPastDateKey(bookingDate)) {
      res.status(400).json({ message: "Booking date cannot be in the past." });
      return;
    }
    if (isCustomerRequested && !bookingDate) {
      res.status(400).json({ message: "Please choose a preferred booking date." });
      return;
    }

    const selectedService = await ensureBookableService(req.body.service);

    if (bookingTime && isCustomerRequested) {
      await validateShopHours({ time: bookingTime, service: req.body.service });
    } else if (bookingTime && canCreateWithPlaceSlot) {
      await validateBookingSlotAvailability({
        date: bookingDate,
        time: bookingTime,
        service: req.body.service,
        placeSlot: bookingPlaceSlot,
      });
    } else if (bookingTime) {
      await validateShopHours({ time: bookingTime, service: req.body.service });
    }

    const requestedPromo = String(req.body.promoId || req.body.promoCode || "").trim();
    const promoResolution = await resolvePromoById(requestedPromo).catch((error) => {
      if (!requestedPromo) return null;
      throw error;
    });
    const promoEligibility = promoResolution
      ? engagementDomain.evaluatePromotionEligibility({ promo: promoResolution.hydratedPromo, service: selectedService })
      : { eligible: true };
    if (!promoEligibility.eligible) {
      res.status(400).json({ message: promoEligibility.reason });
      return;
    }
    await enforcePromoUsagePerUserLimit({
      promo: promoResolution?.hydratedPromo || null,
      promoId: promoResolution?.hydratedPromo?.id || "",
      customerEmail: bookingCustomerEmail,
      customerName: bookingCustomerName,
    });
    const baseAmount = await resolveBookingBaseAmount(
      req.body.service,
      req.body.carSize,
      req.body.originalAmount || req.body.amount || 0
    );
    const pricing = computePromoPricing(
      baseAmount,
      promoResolution?.hydratedPromo || null
    );
    const rewardPricing = await validateCustomerRewardForUse({
      rewardId: req.body.rewardId,
      customerEmail: bookingCustomerEmail,
      customerName: bookingCustomerName,
      baseAmount: pricing.amount,
      service: selectedService,
    });

    const preferredDetailerFields = getPreferredDetailerFields(req.body);
    const booking = await Booking.create({
      id: createId("B"),
      customer: bookingCustomerName,
      customerEmail: bookingCustomerEmail,
      customerId: isCustomerRequested ? req.authUser?.id || "" : String(resolvedCustomer?.id || req.body.customerId || ""),
      bookingSource: isCustomerRequested ? "customer" : (req.body.bookingSource || actorType),
      customerRequested: isCustomerRequested,
      createdByUserType: toDisplayUserType(actorType),
      vehicle: vehicleSnapshot.vehicle,
      carSize: vehicleSnapshot.carSize,
      plate: vehicleSnapshot.plate,
      service: String(req.body.service || "").trim(),
      serviceId: selectedService.id || "",
      assigned: isCustomerRequested ? "" : String(req.body.assigned || "").trim(),
      ...preferredDetailerFields,
      date: bookingDate,
      time: bookingTime,
      status: "Pending",
      placeSlot: canCreateWithPlaceSlot && bookingTime ? bookingPlaceSlot : 0,
      ...pricing,
      ...rewardPricing,
      consumablesApplied: false,
      issueNote: String(req.body.issueNote || "").trim(),
      issueTypes: Array.isArray(req.body.issueTypes) ? req.body.issueTypes : [],
      issueMarkers: Array.isArray(req.body.issueMarkers) ? req.body.issueMarkers : [],
    });

    const securitySetting = await getOrCreateSecuritySetting();
    const paymentTotalAmount = Math.max(0, Number(booking.finalAmount || booking.amount || 0));
    const downPaymentRequired = !isDownPaymentExemptService(booking.service);
    const downPaymentAmount = downPaymentRequired
      ? Math.min(paymentTotalAmount, getRequiredDownPaymentAmount(securitySetting, booking.service))
      : 0;
    const downPaymentDueAt = downPaymentRequired ? addDownPaymentDeadline(booking.createdAt || new Date()) : null;
    const paymentStageDefaults = getPaymentStageFields({
      service: booking.service,
      amount: Number(booking.amount || 0),
      finalAmount: paymentTotalAmount,
      totalAmount: paymentTotalAmount,
      amountPaid: 0,
      status: "Pending",
      downPaymentRequired,
      downPaymentAmount,
      downPaymentStatus: downPaymentRequired ? "Pending" : "Not Required",
      downPaymentDueAt,
      finalPaymentStatus: "Pending",
    });

    const payment = await Payment.create({
      id: createId("PAY"),
      bookingId: booking.id,
      date: booking.date,
      customer: booking.customer,
      customerEmail: booking.customerEmail || "",
      service: booking.service,
      serviceId: booking.serviceId || "",
      amount: Number(booking.amount || 0),
      originalAmount: Number(booking.originalAmount || 0),
      promoId: booking.promoId || "",
      promoCode: booking.promoCode || "",
      promoTitle: booking.promoTitle || "",
      promoDiscountType: booking.promoDiscountType || "",
      promoDiscountValue: Number(booking.promoDiscountValue || 0),
      promoDiscountPercent: Number(booking.promoDiscountPercent || 0),
      promoDiscountAmount: Number(booking.promoDiscountAmount || 0),
      rewardId: booking.rewardId || "",
      rewardName: booking.rewardName || "",
      rewardType: booking.rewardType || "",
      rewardDiscountType: booking.rewardDiscountType || "",
      rewardValue: booking.rewardValue || "",
      rewardClaimCode: booking.rewardClaimCode || "",
      rewardDiscountAmount: Number(booking.rewardDiscountAmount || 0),
      discountAmount: Number(booking.discountAmount || booking.rewardDiscountAmount || 0),
      subtotalAfterDiscount: Number(booking.subtotalAfterDiscount || 0),
      taxAmount: Number(booking.taxAmount || 0),
      finalAmount: Number(booking.finalAmount || booking.amount || 0),
      status: "Pending",
      method: "",
      ...paymentStageDefaults,
      downPaymentDueAt,
    });

    if (downPaymentRequired) {
      await recordCustomerNotification(
        "Down payment reminder",
        payment,
        "Please submit your down-payment proof within 24 hours to secure your booking slot. The down payment is non-refundable.",
        {
          type: "down-payment-initial-reminder",
          bookingId: booking.id,
          downPaymentDueAt,
          downPaymentAmount,
        }
      );
    }

    if (booking.promoId) {
      await incrementPromoUsage(booking.promoId);
    }
    if (booking.rewardId) {
      await reserveCustomerRewardForBooking({
        rewardId: booking.rewardId,
        booking,
        payment,
        auditUser: req.authUser?.email || req.body.auditUser || "system",
      });
    }

    if (isCompletedStatus(booking.status)) {
      const consumableResult = await applyServiceConsumablesToStockMonitoring(booking.service, booking.carSize);

      if (consumableResult.applied) {
        await recordAudit(req.body.auditUser, "Applied booking consumables", booking.id, {
          service: booking.service,
          consumables: consumableResult.updatedItems,
        });
      }

      await ensureBookingCommission(booking, req.body.auditUser);
      await generateEligibleRewardsForBooking(booking, req.body.auditUser || "system");
    }

    await recordAudit(req.body.auditUser, "Created booking", booking.id, {
      customer: booking.customer,
      customerEmail: booking.customerEmail || "",
      status: booking.status || "",
      assigned: booking.assigned || "",
      promoId: booking.promoId || "",
      promoDiscountPercent: booking.promoDiscountPercent || 0,
    });
    await syncCustomerSubtypeByEmail(booking.customerEmail);
    res.status(201).json(booking);
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/bookings/:id", requireRoles("admin", "staff"), async (req, res, next) => {
  try {
    const existingBooking = await Booking.findOne({ id: req.params.id });

    if (!existingBooking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }
    const existingBookingObject = typeof existingBooking.toObject === "function"
      ? existingBooking.toObject()
      : { ...existingBooking };
    const actorType = normalizeUserType(req.authUser?.userType, req.authUser?.role);
    if (actorType === "customer") {
      res.status(403).json({ message: "Customers cannot update booking workflow fields." });
      return;
    }
    const allUsersForScope = await User.find({}).lean();
    const staffRoleForBookingUpdate = getEffectiveRole(req.authUser);
    if (staffRoleForBookingUpdate === "junior detailer" || staffRoleForBookingUpdate === "senior detailer") {
      if (!canViewDetailerTask(req.authUser, existingBookingObject, allUsersForScope)) {
        denyForbidden(res);
        return;
      }
      if (staffRoleForBookingUpdate === "senior detailer" && !isBookingAssignedToUser(existingBookingObject, req.authUser)) {
        denyForbidden(res);
        return;
      }
      const detailerAllowedFields = new Set([
        "status",
        "issueNote",
        "issueTypes",
        "issueMarkers",
        "warrantyChecklist",
        "warrantyChecklistItems",
        "warrantyCoveragePackage",
        "warrantyAcknowledgement",
        "warrantyReleased",
        "warrantyReleasedAt",
        "warrantyQrCode",
        "placeSlot",
        "specialPin",
        "specialCredential",
        "auditUser",
      ]);
      req.body = Object.fromEntries(
        Object.entries(req.body || {}).filter(([key]) => detailerAllowedFields.has(key))
      );
    } else if (!canUpdateBooking(req.authUser, existingBookingObject, allUsersForScope)) {
      denyForbidden(res);
      return;
    } else if (staffRoleForBookingUpdate === "sales manager" || staffRoleForBookingUpdate === "sales associate") {
      [
        "issueNote",
        "issueTypes",
        "issueMarkers",
        "warrantyChecklist",
        "warrantyChecklistItems",
        "warrantyCoveragePackage",
        "warrantyAcknowledgement",
        "warrantyReleased",
        "warrantyReleasedAt",
        "warrantyQrCode",
      ].forEach((field) => {
        delete req.body[field];
      });
    }

    const isCustomerOriginBooking = existingBooking.customerRequested === true || String(existingBooking.bookingSource || "").trim().toLowerCase() === "customer";
    if (isCustomerOriginBooking) {
      const lockedCustomerFields = [
        "customer",
        "customerEmail",
        "customerId",
        "vehicle",
        "carSize",
        "plate",
        "service",
        "serviceId",
        "promoId",
        "promoCode",
        "promoTitle",
        "promoDiscountType",
        "promoDiscountValue",
        "promoDiscountPercent",
        "promoDiscountAmount",
        "rewardId",
        "rewardName",
        "rewardType",
        "rewardDiscountType",
        "rewardValue",
        "rewardClaimCode",
        "rewardDiscountAmount",
      ];
      const changedLockedField = lockedCustomerFields.find((field) => {
        if (!Object.prototype.hasOwnProperty.call(req.body, field)) return false;
        return String(req.body[field] ?? "") !== String(existingBooking[field] ?? "");
      });
      if (changedLockedField) {
        res.status(403).json({ message: "Customer-origin booking fields are locked for this workflow." });
        return;
      }
    }

    const requestedService = String(req.body.service || "").trim();
    let selectedServiceForUpdate = null;
    if (requestedService && requestedService !== String(existingBooking.service || "").trim()) {
      selectedServiceForUpdate = await ensureBookableService(requestedService);
    } else {
      selectedServiceForUpdate = await Service.findOne({ name: String(req.body.service || existingBooking.service || "").trim() }).lean();
    }

    if (isCancelledStatus(existingBooking.status)) {
      res.status(400).json({ message: "Cancelled bookings are locked and cannot be edited." });
      return;
    }

    const bookingDate = String(req.body.date || existingBooking.date || "").trim();
    const currentStatusRaw = normalizeWorkflowStatus(existingBooking.status || "Scheduled", "Scheduled");
    const requestedStatusRaw = String(req.body.status || "").trim().toLowerCase().replace(/\s+/g, " ");
    const nextTime = String(req.body.time ?? existingBooking.time ?? "").trim();
    const nextPlaceSlot = Number(req.body.placeSlot ?? existingBooking.placeSlot ?? 0);
    const hasValidScheduleTime = isValidScheduleTime(nextTime);
    if (
      Object.prototype.hasOwnProperty.call(req.body, "status") &&
      !bookingDomain.normalizeBookingStatus(req.body.status, null)
    ) {
      res.status(400).json({ message: `Unsupported booking status: ${req.body.status || "blank"}.` });
      return;
    }
    const shouldAutoSchedulePending =
      currentStatusRaw === "Pending" &&
      hasValidScheduleTime &&
      nextPlaceSlot > 0 &&
      requestedStatusRaw !== "cancelled" &&
      requestedStatusRaw !== "canceled" &&
      requestedStatusRaw !== "completed" &&
      requestedStatusRaw !== "successful";
    const nextStatus = shouldAutoSchedulePending
      ? "Scheduled"
      : normalizeWorkflowStatus(req.body.status || existingBooking.status, existingBooking.status || "Scheduled");
    const previousStatus = normalizeWorkflowStatus(existingBooking.status || "Scheduled", "Scheduled");
    const isSensitiveStatusChange =
      (nextStatus === "Cancelled" && previousStatus !== "Cancelled") ||
      requestedStatusRaw === "rescheduled";
    if (isSensitiveStatusChange) {
      await requireSpecialCredentialForRequest(req, {
        mode: "pin",
        scope: actorType === "staff" ? "staff" : "admin",
        actionKey: ACTION_KEYS.bookingUpdateStatus,
      });
    }
    const dateChanged = Object.prototype.hasOwnProperty.call(req.body, "date") && String(req.body.date || "") !== String(existingBooking.date || "");
    const timeChanged = Object.prototype.hasOwnProperty.call(req.body, "time") && String(req.body.time || "") !== String(existingBooking.time || "");
    const slotChanged = Object.prototype.hasOwnProperty.call(req.body, "placeSlot") && Number(req.body.placeSlot || 0) !== Number(existingBooking.placeSlot || 0);
    if (slotChanged && !canUpdatePlaceSlot(req.authUser, existingBookingObject, allUsersForScope)) {
      res.status(403).json({ message: "You do not have permission to update the place slot for this booking." });
      return;
    }
    const scheduleChanged = dateChanged || timeChanged || slotChanged;
    const requiresScheduleValidation = requestedStatusRaw === "rescheduled" || shouldAutoSchedulePending;

    if ((dateChanged || requiresScheduleValidation) && isPastDateKey(bookingDate)) {
      res.status(400).json({ message: "Booking date cannot be in the past." });
      return;
    }

    if (
      isCompletedStatus(existingBooking.status) &&
      Object.prototype.hasOwnProperty.call(req.body, "status") &&
      !isCompletedStatus(req.body.status)
    ) {
      res.status(400).json({ message: "Completed bookings can no longer change status." });
      return;
    }

    if (requiresScheduleValidation || (scheduleChanged && hasValidScheduleTime)) {
      if (requiresScheduleValidation && !hasValidScheduleTime) {
        res.status(400).json({ message: "Please choose a booking time before rescheduling." });
        return;
      }
      await validateBookingSlotAvailability({
        bookingId: req.params.id,
        date: bookingDate,
        time: nextTime,
        service: req.body.service || existingBooking.service,
        placeSlot: req.body.placeSlot || existingBooking.placeSlot,
      });
      await validateShopHours({ time: nextTime, service: req.body.service || existingBooking.service });
    }

    const nextPromoId = Object.prototype.hasOwnProperty.call(req.body, "promoId")
      ? String(req.body.promoId || "").trim()
      : String(existingBooking.promoId || "").trim();
    const previousPromoId = String(existingBooking.promoId || "").trim();
    const promoResolution =
      nextPromoId && nextPromoId === previousPromoId
        ? await Promo.findOne({ id: nextPromoId }).then((promo) =>
            promo ? { promo, hydratedPromo: hydratePromo(promo) } : null
          )
        : await resolvePromoById(nextPromoId).catch((error) => {
            if (!nextPromoId) return null;
            throw error;
          });
    const promoEligibility = promoResolution
      ? engagementDomain.evaluatePromotionEligibility({ promo: promoResolution.hydratedPromo, service: selectedServiceForUpdate || { id: existingBooking.serviceId || "" } })
      : { eligible: true };
    if (!promoEligibility.eligible) {
      res.status(400).json({ message: promoEligibility.reason });
      return;
    }
    await enforcePromoUsagePerUserLimit({
      promo: promoResolution?.hydratedPromo || null,
      promoId: promoResolution?.hydratedPromo?.id || "",
      customerEmail: req.body.customerEmail ?? existingBooking.customerEmail,
      customerName: req.body.customer ?? existingBooking.customer,
      excludeBookingId: existingBooking.id,
    });
    const baseAmount = await resolveBookingBaseAmount(
      req.body.service || existingBooking.service,
      req.body.carSize ?? existingBooking.carSize,
      req.body.originalAmount || req.body.amount || existingBooking.originalAmount || existingBooking.amount || 0
    );
    const promoPricing = computePromoPricing(
      baseAmount,
      promoResolution?.hydratedPromo || null
    );
    const linkedPaymentForReward = await getLinkedPaymentForBooking(existingBookingObject);
    const requestedRewardId = String(req.body.rewardId ?? existingBooking.rewardId ?? "").trim();
    const rewardChanged = Object.prototype.hasOwnProperty.call(req.body, "rewardId") && requestedRewardId !== String(existingBooking.rewardId || "").trim();
    const rewardPricing = requestedRewardId && !rewardChanged
      ? {
          rewardId: existingBooking.rewardId || "",
          rewardName: existingBooking.rewardName || "",
          rewardType: existingBooking.rewardType || "",
          rewardValue: existingBooking.rewardValue || "",
          rewardClaimCode: existingBooking.rewardClaimCode || "",
          rewardDiscountAmount: Number(existingBooking.rewardDiscountAmount || 0),
          discountAmount: Number(existingBooking.discountAmount || existingBooking.rewardDiscountAmount || 0),
          subtotalAfterDiscount: Number(existingBooking.subtotalAfterDiscount || 0),
          taxAmount: Number(existingBooking.taxAmount || 0),
          finalAmount: Number(existingBooking.finalAmount || existingBooking.amount || promoPricing.amount || 0),
          amount: Number(existingBooking.amount || promoPricing.amount || 0),
        }
      : await validateCustomerRewardForUse({
          rewardId: requestedRewardId,
          customerEmail: req.body.customerEmail ?? existingBooking.customerEmail,
          customerName: req.body.customer ?? existingBooking.customer,
          baseAmount: promoPricing.amount,
          excludePaymentId: linkedPaymentForReward?.id || "",
          service: selectedServiceForUpdate || { id: existingBooking.serviceId || "" },
        });
    const wasCompleted = isCompletedStatus(existingBooking.status);
    const willComplete = isCompletedStatus(nextStatus);
    const shouldApplyConsumables =
      !wasCompleted &&
      willComplete &&
      !existingBooking.consumablesApplied;
    const shouldCreateCommission =
      !wasCompleted &&
      willComplete;

    const updatePayload = {
      ...req.body,
      status: nextStatus,
      serviceId: selectedServiceForUpdate?.id || existingBooking.serviceId || "",
      ...promoPricing,
      ...rewardPricing,
      consumablesApplied: existingBooking.consumablesApplied || shouldApplyConsumables,
    };

    if (isCompletedStatus(existingBooking.status)) {
      Object.assign(updatePayload, {
        customer: existingBooking.customer,
        customerEmail: existingBooking.customerEmail,
        vehicle: existingBooking.vehicle,
        carSize: existingBooking.carSize,
        plate: existingBooking.plate,
        service: existingBooking.service,
        serviceId: existingBooking.serviceId,
        assigned: existingBooking.assigned,
        date: existingBooking.date,
        time: existingBooking.time,
        placeSlot: existingBooking.placeSlot,
        promoId: existingBooking.promoId,
        promoCode: existingBooking.promoCode,
        promoTitle: existingBooking.promoTitle,
        promoDiscountType: existingBooking.promoDiscountType,
        promoDiscountValue: existingBooking.promoDiscountValue,
        promoDiscountPercent: existingBooking.promoDiscountPercent,
        promoDiscountAmount: existingBooking.promoDiscountAmount,
        rewardId: existingBooking.rewardId,
        rewardName: existingBooking.rewardName,
        rewardType: existingBooking.rewardType,
        rewardDiscountType: existingBooking.rewardDiscountType,
        rewardValue: existingBooking.rewardValue,
        rewardClaimCode: existingBooking.rewardClaimCode,
        rewardDiscountAmount: existingBooking.rewardDiscountAmount,
        amount: existingBooking.amount,
        originalAmount: existingBooking.originalAmount,
        status: "Completed",
      });
    }

    const nextBookingForValidation = {
      ...existingBookingObject,
      ...updatePayload,
    };
    if (hasWarrantyFieldChanges(existingBookingObject, req.body)) {
      if (!linkedPaymentForReward || !isPaymentFullyPaid(linkedPaymentForReward)) {
        res.status(400).json({ message: "Full payment must be marked as paid before editing warranty details." });
        return;
      }
    }
    await validateBookingLifecycleTransition({
      previousBooking: existingBookingObject,
      nextBooking: nextBookingForValidation,
      payment: linkedPaymentForReward,
      nextStatus,
      scheduleChanged,
    });

    const booking = await Booking.findOneAndUpdate({ id: req.params.id }, updatePayload, { new: true });

    if (previousPromoId && previousPromoId !== booking.promoId) {
      await decrementPromoUsage(previousPromoId);
    }
    if (booking.promoId && previousPromoId !== booking.promoId) {
      await incrementPromoUsage(booking.promoId);
    }

    const paymentPricingPayload = {
      date: booking.date,
      customer: booking.customer,
      customerEmail: booking.customerEmail || "",
      service: booking.service,
      serviceId: booking.serviceId || "",
      amount: Number(booking.amount || 0),
      originalAmount: Number(booking.originalAmount || 0),
      promoId: booking.promoId || "",
      promoCode: booking.promoCode || "",
      promoTitle: booking.promoTitle || "",
      promoDiscountType: booking.promoDiscountType || "",
      promoDiscountValue: Number(booking.promoDiscountValue || 0),
      promoDiscountPercent: Number(booking.promoDiscountPercent || 0),
      promoDiscountAmount: Number(booking.promoDiscountAmount || 0),
      rewardId: booking.rewardId || "",
      rewardName: booking.rewardName || "",
      rewardType: booking.rewardType || "",
      rewardDiscountType: booking.rewardDiscountType || "",
      rewardValue: booking.rewardValue || "",
      rewardClaimCode: booking.rewardClaimCode || "",
      rewardDiscountAmount: Number(booking.rewardDiscountAmount || 0),
      discountAmount: Number(booking.discountAmount || booking.rewardDiscountAmount || 0),
      subtotalAfterDiscount: Number(booking.subtotalAfterDiscount || 0),
      taxAmount: Number(booking.taxAmount || 0),
      finalAmount: Number(booking.finalAmount || booking.amount || 0),
    };
    const fallbackDownPaymentAmount = getRequiredDownPaymentAmount(await getOrCreateSecuritySetting(), booking.service);
    const hasExistingDownPaymentRequired = Object.prototype.hasOwnProperty.call(linkedPaymentForReward || {}, "downPaymentRequired");
    const hasExistingDownPaymentAmount = Object.prototype.hasOwnProperty.call(linkedPaymentForReward || {}, "downPaymentAmount");

    const syncedPayment = await Payment.findOneAndUpdate(
      { bookingId: booking.id },
      {
        ...paymentPricingPayload,
        ...getPaymentStageFields({
          ...(linkedPaymentForReward || {}),
          ...paymentPricingPayload,
          totalAmount: Number(paymentPricingPayload.finalAmount || paymentPricingPayload.amount || 0),
          downPaymentRequired: hasExistingDownPaymentRequired
            ? linkedPaymentForReward.downPaymentRequired
            : fallbackDownPaymentAmount > 0 && Number(paymentPricingPayload.finalAmount || paymentPricingPayload.amount || 0) > 0,
          downPaymentAmount: hasExistingDownPaymentAmount
            ? linkedPaymentForReward.downPaymentAmount
            : fallbackDownPaymentAmount,
        }),
      }
      ,
      { new: true }
    );
    if (String(existingBooking.rewardId || "").trim() && String(existingBooking.rewardId || "").trim() !== String(booking.rewardId || "").trim()) {
      await releaseCustomerRewardReservation({
        rewardId: existingBooking.rewardId,
        bookingId: booking.id,
        reason: "Booking reward changed before payment confirmation.",
        auditUser: req.authUser?.email || req.body.auditUser || "system",
      });
    }
    if (booking.rewardId && String(existingBooking.rewardId || "").trim() !== String(booking.rewardId || "").trim()) {
      await reserveCustomerRewardForBooking({
        rewardId: booking.rewardId,
        booking,
        payment: syncedPayment || {},
        auditUser: req.authUser?.email || req.body.auditUser || "system",
      });
    }
    if (nextStatus === "Cancelled") {
      if (booking.rewardId) {
        await releaseCustomerRewardReservation({
          rewardId: booking.rewardId,
          bookingId: booking.id,
          reason: "Booking cancelled before reward usage.",
          auditUser: req.authUser?.email || req.body.auditUser || "system",
        });
      }
      if (booking.promoId) {
        await decrementPromoUsage(booking.promoId);
      }
    }

    if (shouldApplyConsumables) {
      const consumableResult = await applyServiceConsumablesToStockMonitoring(booking.service, booking.carSize);

      if (consumableResult.applied) {
        await recordAudit(req.body.auditUser, "Applied booking consumables", booking.id, {
          service: booking.service,
          consumables: consumableResult.updatedItems,
        });
      }
    }

    if (shouldCreateCommission) {
      await ensureBookingCommission(booking, req.body.auditUser);
      await generateEligibleRewardsForBooking(booking, req.body.auditUser || "system");
      await recordAudit("system", "Payment details requested", booking.id, {
        customer: booking.customer,
        customerEmail: booking.customerEmail || "",
        message: "Please upload your payment details. You may disregard this notification if you have already uploaded your payment details.",
      });
    }

    await recordAudit(req.body.auditUser, getBookingAuditAction(existingBooking, booking), booking.id, {
      customer: booking.customer,
      customerEmail: booking.customerEmail || "",
      status: booking.status || "",
      assigned: booking.assigned || "",
    });
    await Promise.all([
      syncCustomerSubtypeByEmail(existingBooking.customerEmail),
      syncCustomerSubtypeByEmail(booking.customerEmail),
    ]);
    res.json(booking);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/bookings/:id/reassign-detailer", requireRoles("admin", "staff"), async (req, res, next) => {
  try {
    if (!canReassignDetailer(req.authUser)) {
      denyForbidden(res);
      return;
    }

    const booking = await Booking.findOne({ id: req.params.id });
    if (!booking) {
      res.status(404).json({ message: "Booking not found." });
      return;
    }

    if (isCancelledStatus(booking.status)) {
      res.status(400).json({ message: "Cancelled bookings are locked and cannot be reassigned." });
      return;
    }

    const existingCommission = await Commission.findOne({
      bookingId: booking.id,
      status: { $nin: ["Voided", "Cancelled"] },
    }).lean();
    if (isCompletedStatus(booking.status) && existingCommission && Number(existingCommission.earned || 0) > 0) {
      res.status(400).json({ message: "Completed bookings with earned commission cannot be silently reassigned." });
      return;
    }

    const actorType = normalizeUserType(req.authUser?.userType, req.authUser?.role);
    await requireSpecialCredentialForRequest(req, {
      mode: "pin",
      scope: actorType === "staff" ? "staff" : "admin",
      actionKey: ACTION_KEYS.detailerReassign,
    });

    const requestedDetailer = String(req.body.assigned || req.body.detailerName || req.body.newAssignedDetailer || "").trim();
    if (!requestedDetailer) {
      res.status(400).json({ message: "Please choose a new assigned detailer." });
      return;
    }

    const detailer = await User.findOne({
      $or: [
        { id: requestedDetailer },
        { email: { $regex: `^${escapeRegExp(requestedDetailer)}$`, $options: "i" } },
        { name: { $regex: `^${escapeRegExp(requestedDetailer)}$`, $options: "i" } },
      ],
    }).lean();

    if (!isActiveDetailerUser(detailer)) {
      res.status(400).json({ message: "Please choose an active Junior or Senior Detailer." });
      return;
    }

    const previousAssigned = String(booking.assigned || "").trim();
    booking.assigned = detailer.name || requestedDetailer;
    const savedBooking = await booking.save();

    const commission = await Commission.findOne({ bookingId: booking.id });
    const commissionStatus = String(commission?.status || "").trim().toLowerCase();
    if (commission && !["paid", "voided", "cancelled"].includes(commissionStatus)) {
      commission.worker = detailer.name || requestedDetailer;
      commission.role = toDisplaySubtype(detailer.userType, detailer.role);
      commission.remarks = String(req.body.remarks || req.body.reason || commission.remarks || "").trim();
      await commission.save();
    }

    const actor = req.authUser?.email || req.body.auditUser || "system";
    await recordAudit(actor, "Reassigned detailer", savedBooking.id, {
      customer: savedBooking.customer || "",
      service: savedBooking.service || "",
      previousAssigned,
      assigned: savedBooking.assigned || "",
      reason: String(req.body.reason || req.body.remarks || "").trim(),
    });

    if (savedBooking.assigned && savedBooking.assigned !== previousAssigned) {
      await recordAudit("system", "Detailer assignment changed", savedBooking.id, {
        message: `You have been assigned to booking ${savedBooking.id}.`,
        assigned: savedBooking.assigned,
        previousAssigned,
        customer: savedBooking.customer || "",
        service: savedBooking.service || "",
      });
    }

    res.json(savedBooking);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/bookings/:id", requireAdminUser, async (req, res, next) => {
  try {
    await requireSpecialCredentialForRequest(req, { mode: "pin", scope: "admin" });
    const booking = await Booking.findOne({ id: req.params.id }).lean();
    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }
    if (String(booking.status || "").trim().toLowerCase() !== "cancelled") {
      res.status(400).json({ message: "Only cancelled bookings can be deleted." });
      return;
    }
    await Booking.findOneAndDelete({ id: req.params.id });
    await Payment.findOneAndDelete({ bookingId: req.params.id });
    await recordAudit(req.body.auditUser || req.query.auditUser, "Deleted booking", req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/bookings/:id/public-access/:purpose", requireAdminUser, async (req, res, next) => {
  try {
    const purpose = String(req.params.purpose || "").trim().toLowerCase();
    if (!Object.values(QR_TOKEN_PURPOSES).includes(purpose)) {
      res.status(400).json({ message: "Unsupported public access purpose." });
      return;
    }

    const operation = String(req.body.action || req.body.operation || "rotate").trim().toLowerCase();
    if (!["rotate", "revoke", "restore"].includes(operation)) {
      res.status(400).json({ message: "Unsupported public access action." });
      return;
    }

    const booking = await Booking.findOne({ id: req.params.id });
    if (!booking) {
      res.status(404).json({ message: "Booking not found." });
      return;
    }

    await requireAdminSpecialCredentialWithAudit(req, ACTION_KEYS.bookingAccessTokenManage, booking.id);

    const versionField = purpose === QR_TOKEN_PURPOSES.warranty ? "warrantyAccessVersion" : "trackingAccessVersion";
    const revokedField = purpose === QR_TOKEN_PURPOSES.warranty ? "warrantyAccessRevoked" : "trackingAccessRevoked";
    const rotatedAtField = purpose === QR_TOKEN_PURPOSES.warranty ? "warrantyAccessRotatedAt" : "trackingAccessRotatedAt";
    const previousState = {
      accessVersion: Math.max(1, Number(booking[versionField] || 1)),
      revoked: Boolean(booking[revokedField]),
    };

    if (operation === "rotate") {
      booking[versionField] = previousState.accessVersion + 1;
      booking[revokedField] = false;
      booking[rotatedAtField] = new Date().toISOString();
    } else if (operation === "revoke") {
      booking[revokedField] = true;
    } else {
      booking[revokedField] = false;
    }

    await booking.save();
    const savedBooking = booking.toObject ? booking.toObject() : booking;
    const newState = {
      accessVersion: getBookingAccessVersion(savedBooking, purpose),
      revoked: isBookingAccessRevoked(savedBooking, purpose),
      rotatedAt: savedBooking[rotatedAtField] || "",
    };
    const eventName =
      operation === "rotate"
        ? `Rotated ${purpose} access token`
        : operation === "revoke"
          ? `Revoked ${purpose} access token`
          : `Restored ${purpose} access token`;
    await recordAudit(req.authUser?.email || req.body.auditUser, eventName, booking.id, {
      actorId: req.authUser?.id || "",
      actorName: req.authUser?.name || req.authUser?.email || "",
      actorRole: req.authUser?.role || "",
      targetType: "Booking",
      purpose,
      previousState,
      newState,
      result: "allowed",
    });

    res.json({
      id: booking.id,
      purpose,
      accessVersion: newState.accessVersion,
      revoked: newState.revoked,
      rotatedAt: newState.rotatedAt,
      accessToken: newState.revoked ? "" : createBookingAccessToken(savedBooking, purpose),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/services", requireRoles("admin", "staff"), requireAction(ACTION_KEYS.servicesManage), async (req, res, next) => {
  try {
    const priceBySize = buildServicePriceBySize(req.body.priceBySize, req.body.price);
    const consumablesBySize = buildServiceConsumablesBySize(req.body.consumablesBySize, req.body.consumables);
    const mins = Math.max(0, Number(req.body.mins) || 0);
    validateAllowedArrivalTimesPayload(req.body.allowedArrivalTimes);
    const payload = {
      ...req.body,
      serviceType: normalizeServiceType(req.body.serviceType, req.body.name, req.body.desc),
      price: Math.max(0, Number(req.body.price) || priceBySize.sedanSmallCar || 0),
      priceBySize,
      mins,
      allowedArrivalTimes: normalizeAllowedArrivalTimes(req.body.allowedArrivalTimes, mins),
      consumablesBySize,
      consumables: buildLegacyConsumables(consumablesBySize),
    };
    const service = await Service.create({ id: createId("SVC"), ...payload });
    await recordAudit(req.body.auditUser, "Created service", service.id, { name: service.name });
    res.status(201).json(hydrateService(service));
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/services/:id", requireRoles("admin", "staff"), requireAction(ACTION_KEYS.servicesManage), async (req, res, next) => {
  try {
    const service = await Service.findOne({ id: req.params.id });
    const existingService = service?.toObject ? service.toObject() : null;
    if (!service) {
      const error = new Error("Service not found.");
      error.statusCode = 404;
      throw error;
    }

    const priceBySize = buildServicePriceBySize(req.body.priceBySize, req.body.price ?? existingService?.price);
    const mins = Math.max(0, Number(req.body.mins ?? existingService?.mins) || 0);
    if (Object.prototype.hasOwnProperty.call(req.body, "allowedArrivalTimes")) {
      validateAllowedArrivalTimesPayload(req.body.allowedArrivalTimes);
    }
    const consumablesBySize = buildServiceConsumablesBySize(
      req.body.consumablesBySize,
      req.body.consumables ?? existingService?.consumables
    );
    const payload = {
      ...req.body,
      serviceType: normalizeServiceType(req.body.serviceType, req.body.name, req.body.desc),
      price: Math.max(0, Number(req.body.price) || priceBySize.sedanSmallCar || 0),
      priceBySize,
      mins,
      allowedArrivalTimes: normalizeAllowedArrivalTimes(
        Object.prototype.hasOwnProperty.call(req.body, "allowedArrivalTimes") ? req.body.allowedArrivalTimes : existingService?.allowedArrivalTimes,
        mins
      ),
      consumablesBySize,
      consumables: buildLegacyConsumables(consumablesBySize),
    };

    Object.entries(payload).forEach(([key, value]) => {
      service.set(key, value);
    });
    service.markModified("priceBySize");
    service.markModified("consumablesBySize");
    service.markModified("consumables");
    await service.save();

    await recordAudit(req.body.auditUser, getServiceAuditAction(existingService, req.body), req.params.id, {
      name: service?.name || existingService?.name || "",
      enabled: service?.enabled,
    });
    res.json(hydrateService(service));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/services/:id", requireAdminUser, async (req, res, next) => {
  try {
    await Service.findOneAndDelete({ id: req.params.id });
    await recordAudit(req.body?.auditUser || req.query.auditUser, "Deleted service", req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

function normalizeStockQuantityValue(value) {
  return stockDomain.normalizeStockQuantity(value);
}

function getConfiguredMaxStockQuantity(value) {
  const quantity = normalizeStockQuantityValue(value);
  return quantity > 0 ? quantity : 0;
}

function validateStockQuantityLimit({ currentStock, maxStock, reorderLevel, qtyToAdd = null }) {
  return stockDomain.validateStockPayload({ currentStock, maxStock, reorderLevel, qtyToAdd });
}

app.post("/api/admin/stock-monitoring", requireRoles("admin", "staff"), requireAction(ACTION_KEYS.stockManage), async (req, res, next) => {
  try {
    const validationMessage = stockDomain.validateStockPayload(req.body);
    if (validationMessage) {
      res.status(400).json({ message: validationMessage });
      return;
    }
    const item = await StockMonitoringItem.create({
      id: createId("INV"),
      ...stockDomain.normalizeStockPayload(req.body),
    });
    const initialStock = Number(req.body.currentStock || 0);
    const unitCost = Number(req.body.pricePerUnit || 0);

    if (initialStock > 0 && unitCost > 0) {
      await upsertAutomaticExpense({
        sourceType: "stock-create",
        sourceId: item.id,
        date: req.body.lastRestocked || toDateKey(),
        description: `Initial stock: ${item.name}`,
        note: `Added ${initialStock} item(s) at P${unitCost.toLocaleString("en-PH")} per unit.`,
        category: "Supplies",
        amount: initialStock * unitCost,
        paidBy: req.body.auditUser || "Admin",
      });
    }

    await recordAudit(req.body.auditUser, "Created stock monitoring item", item.id, { name: item.name });
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/stock-monitoring/:id", requireRoles("admin", "staff"), requireAction(ACTION_KEYS.stockManage), async (req, res, next) => {
  try {
    const existingItem = await StockMonitoringItem.findOne({ id: req.params.id }).lean();
    if (!existingItem) {
      res.status(404).json({ message: "Stock monitoring item not found" });
      return;
    }
    const validationMessage = validateStockQuantityLimit({
      currentStock: req.body.currentStock ?? existingItem.currentStock,
      maxStock: req.body.maxStock ?? existingItem.maxStock,
      reorderLevel: req.body.reorderLevel ?? existingItem.reorderLevel,
    });
    if (validationMessage) {
      res.status(400).json({ message: validationMessage });
      return;
    }

    const nextPayload = stockDomain.normalizeStockPayload(req.body, existingItem);

    const item = await StockMonitoringItem.findOneAndUpdate({ id: req.params.id }, nextPayload, { new: true });
    await recordAudit(req.body.auditUser, "Updated stock monitoring item", req.params.id);
    res.json(item);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/stock-monitoring/:id/restock", requireRoles("admin", "staff"), requireAction(ACTION_KEYS.stockManage), async (req, res, next) => {
  try {
    const item = await StockMonitoringItem.findOne({ id: req.params.id });
    if (!item) {
      res.status(404).json({ message: "Stock monitoring item not found" });
      return;
    }

    const qtyToAdd = normalizeStockQuantityValue(req.body.qtyToAdd);
    const validationMessage = validateStockQuantityLimit({
      currentStock: item.currentStock,
      maxStock: item.maxStock,
      reorderLevel: item.reorderLevel,
      qtyToAdd,
    });
    if (validationMessage) {
      res.status(400).json({ message: validationMessage });
      return;
    }

    item.currentStock = normalizeStockQuantityValue(item.currentStock) + qtyToAdd;
    item.pricePerUnit = Number(req.body.costPerUnit || item.pricePerUnit || 0);
    item.lastRestocked = req.body.date || item.lastRestocked;
    item.restockHistory.unshift({
      date: req.body.date || "",
      time: req.body.time || "",
      qtyToAdd,
      restockedBy: req.body.restockedBy || "",
      costPerUnit: Number(req.body.costPerUnit || 0),
      supplier: req.body.supplier || "",
      notes: req.body.notes || "",
      restockedAt: ((req.body.date || "") + " " + (req.body.time || "")).trim(),
    });
    await item.save();

    if (qtyToAdd > 0) {
      await upsertAutomaticExpense({
        sourceType: "stock-restock",
        sourceId: `${item.id}:${item.restockHistory[0]?.restockedAt || Date.now()}`,
        date: req.body.date || new Date().toISOString().slice(0, 10),
        description: "Restock: " + item.name,
        note: req.body.notes || "",
        category: "Supplies",
        amount: qtyToAdd * Number(req.body.costPerUnit || 0),
        paidBy: req.body.restockedBy || "Admin",
      });
    }

    await recordAudit(req.body.auditUser, "Restocked stock monitoring item", req.params.id, { qtyToAdd });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/stock-monitoring/:id", requireRoles("admin", "staff"), async (req, res, next) => {
  try {
    if (!canPerformAction(req.authUser, ACTION_KEYS.stockManage)) {
      denyForbidden(res);
      return;
    }
    await requireSpecialCredentialForRequest(req, { mode: "pin", actionKey: ACTION_KEYS.stockManage });
    const deletedItem = await StockMonitoringItem.findOneAndDelete({ id: req.params.id });
    if (!deletedItem) {
      res.status(404).json({ message: "Stock monitoring item not found." });
      return;
    }
    await recordAudit(req.body?.auditUser || req.query.auditUser, "Deleted stock monitoring item", req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/payments/:id", requireRoles("admin", "staff", "customer"), async (req, res, next) => {
  try {
    const foundPayment = await Payment.findOne({ id: req.params.id }).lean();
    if (!foundPayment) {
      res.status(404).json({ message: "Payment not found" });
      return;
    }
    const existingPayment = normalizePaymentStageFields(foundPayment);

    if (
      isPaidStatus(existingPayment.status) &&
      Object.prototype.hasOwnProperty.call(req.body, "status") &&
      !isPaidStatus(req.body.status)
    ) {
      res.status(400).json({ message: "Paid payments can no longer change status." });
      return;
    }

    const actorType = normalizeUserType(req.authUser?.userType, req.authUser?.role);
    const isPaymentReviewer = actorType === "admin" || actorType === "staff";
    const actorEmail = String(req.authUser?.email || "").trim().toLowerCase();
    const actorId = String(req.authUser?.id || "").trim();
    const customerEmail = String(existingPayment.customerEmail || "").trim().toLowerCase();
    let isCustomerSubmittingOwnPayment = actorType === "customer" && Boolean(actorEmail && customerEmail && actorEmail === customerEmail);
    if (actorType === "customer" && !isCustomerSubmittingOwnPayment) {
      const linkedBooking = existingPayment.bookingId
        ? await Booking.findOne({ id: existingPayment.bookingId }).lean()
        : null;
      const bookingEmail = String(linkedBooking?.customerEmail || "").trim().toLowerCase();
      const bookingCustomerId = String(linkedBooking?.customerId || "").trim();
      isCustomerSubmittingOwnPayment = Boolean(
        (actorEmail && bookingEmail && actorEmail === bookingEmail) ||
        (actorId && bookingCustomerId && actorId === bookingCustomerId)
      );
    }
    const nextStatus = String(req.body.status || "");
    const nextDownPaymentStatus = normalizePaymentStageStatus(req.body.downPaymentStatus, existingPayment.downPaymentStatus || "Pending");
    const nextFinalPaymentStatus = normalizePaymentStageStatus(req.body.finalPaymentStatus, existingPayment.finalPaymentStatus || existingPayment.status || "Pending");
    const hasBodyField = (field) => Object.prototype.hasOwnProperty.call(req.body, field);
    const isCustomerFinalPaymentSubmission = actorType === "customer" && [
      "finalPaymentStatus",
      "finalPaymentMethod",
      "finalPaymentReference",
      "finalPaymentProofUrl",
      "finalPaymentProofName",
      "finalPaymentNotes",
    ].some(hasBodyField);
    const isCustomerDownPaymentSubmission = actorType === "customer" && !isCustomerFinalPaymentSubmission;
    const administrativeCustomerFieldAttempt = actorType === "customer" && [
      "matched",
      "verified",
      "approved",
      "isVerified",
      "reviewedAt",
      "reviewedBy",
      "downPaymentVerifiedAt",
      "downPaymentVerifiedBy",
      "finalPaymentVerifiedAt",
      "finalPaymentVerifiedBy",
      "downPaymentReviewStatus",
      "finalPaymentReviewStatus",
      "amountPaid",
      "remainingBalance",
    ].some((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    for (const field of ["status", "downPaymentStatus", "finalPaymentStatus"]) {
      if (
        Object.prototype.hasOwnProperty.call(req.body, field) &&
        !paymentDomain.normalizePaymentStageStatus(req.body[field], "")
      ) {
        res.status(400).json({ message: `Unsupported payment status: ${req.body[field] || "blank"}.` });
        return;
      }
    }
    if (actorType === "customer" && !isCustomerSubmittingOwnPayment) {
      res.status(403).json({ message: "You can only update your own payment records." });
      return;
    }
    if (actorType === "staff" && !canPerformAction(req.authUser, ACTION_KEYS.paymentVerify)) {
      res.status(403).json({ message: "You can view payment status, but you cannot verify or update payments." });
      return;
    }
    if (actorType === "customer" && nextStatus && nextStatus !== "For Verification") {
      res.status(403).json({ message: "Customers cannot mark payments as paid." });
      return;
    }
    if (administrativeCustomerFieldAttempt) {
      res.status(403).json({ message: "Customers cannot update payment verification fields." });
      return;
    }
    if (actorType === "customer" && isCustomerFinalPaymentSubmission && Object.prototype.hasOwnProperty.call(req.body, "downPaymentStatus")) {
      res.status(400).json({ message: "Submit one payment stage at a time." });
      return;
    }
    if (actorType === "customer" && Object.prototype.hasOwnProperty.call(req.body, "downPaymentStatus") && nextDownPaymentStatus !== "For Verification") {
      res.status(403).json({ message: "Customers can only submit down payment proof for verification." });
      return;
    }
    if (actorType === "customer" && Object.prototype.hasOwnProperty.call(req.body, "finalPaymentStatus") && nextFinalPaymentStatus !== "For Verification") {
      res.status(403).json({ message: "Customers can only submit final payment proof for verification." });
      return;
    }
    if (isCustomerDownPaymentSubmission) {
      const currentDownPaymentStatus = normalizePaymentStageStatus(
        existingPayment.downPaymentStatus,
        existingPayment.downPaymentRequired === false ? "Not Required" : "Pending"
      );
      if (existingPayment.autoCancelledForNoDownPaymentProof) {
        res.status(400).json({ message: "This booking was cancelled because the down-payment deadline expired." });
        return;
      }
      if (existingPayment.downPaymentRequired === false || currentDownPaymentStatus === "Not Required") {
        res.status(400).json({ message: "Down payment proof is not required for this payment." });
        return;
      }
      if (currentDownPaymentStatus === "For Verification") {
        res.status(400).json({ message: "Your down payment proof is already waiting for review." });
        return;
      }
      if (currentDownPaymentStatus === "Paid") {
        res.status(400).json({ message: "Down payment has already been verified as paid." });
        return;
      }
      if (!String(req.body.downPaymentMethod || req.body.method || "").trim()) {
        res.status(400).json({ message: "Down payment method is required." });
        return;
      }
      const submittedDownPaymentMethod = assertSupportedPaymentMethod(req.body.downPaymentMethod || req.body.method || "", "Down payment method");
      const downPaymentProofRequired = !isCashPaymentMethod(submittedDownPaymentMethod);
      if (downPaymentProofRequired && !String(req.body.downPaymentReference || req.body.reference || "").trim()) {
        res.status(400).json({ message: "Reference number is required." });
        return;
      }
      if (String(req.body.downPaymentReference || req.body.reference || "").trim().length > 80) {
        res.status(400).json({ message: "Reference number must be 80 characters or less." });
        return;
      }
      validateProofImageInput(req.body.downPaymentProofUrl || req.body.proofImage || "", req.body.downPaymentProofName || req.body.proofFileName || "", downPaymentProofRequired);
    }
    if (isCustomerFinalPaymentSubmission) {
      const currentDownPaymentStatus = normalizePaymentStageStatus(
        existingPayment.downPaymentStatus,
        existingPayment.downPaymentRequired === false ? "Not Required" : "Pending"
      );
      const downPaymentSatisfied =
        existingPayment.downPaymentRequired === false ||
        currentDownPaymentStatus === "Not Required" ||
        currentDownPaymentStatus === "Paid";
      if (!downPaymentSatisfied) {
        res.status(400).json({ message: "Down payment must be verified before submitting remaining balance proof." });
        return;
      }

      const currentFinalPaymentStatus = normalizePaymentStageStatus(existingPayment.finalPaymentStatus, existingPayment.status || "Pending");
      if (currentFinalPaymentStatus === "For Verification") {
        res.status(400).json({ message: "Your final payment proof is already waiting for review." });
        return;
      }
      if (currentFinalPaymentStatus === "Paid" || isPaidStatus(existingPayment.status)) {
        res.status(400).json({ message: "Full payment has already been verified as paid." });
        return;
      }
      if (!String(req.body.finalPaymentMethod || "").trim()) {
        res.status(400).json({ message: "Final payment method is required." });
        return;
      }
      const submittedFinalPaymentMethod = assertSupportedPaymentMethod(req.body.finalPaymentMethod || "", "Final payment method");
      const finalPaymentProofRequired = !isCashPaymentMethod(submittedFinalPaymentMethod);
      if (finalPaymentProofRequired && !String(req.body.finalPaymentReference || "").trim()) {
        res.status(400).json({ message: "Reference number is required." });
        return;
      }
      if (String(req.body.finalPaymentReference || "").trim().length > 80) {
        res.status(400).json({ message: "Reference number must be 80 characters or less." });
        return;
      }
      validateProofImageInput(req.body.finalPaymentProofUrl || "", req.body.finalPaymentProofName || "", finalPaymentProofRequired);
    }
    if (
      actorType === "customer" &&
      ["rewardId", "rewardName", "rewardType", "rewardValue", "rewardClaimCode", "rewardDiscountAmount", "discountAmount", "subtotalAfterDiscount", "taxAmount", "finalAmount"]
        .some((field) => Object.prototype.hasOwnProperty.call(req.body, field))
    ) {
      res.status(403).json({ message: "Customers cannot update reward or invoice fields from payment proof submission." });
      return;
    }
    if (existingPayment.downPaymentRequired !== false && nextDownPaymentStatus === "Not Required") {
      res.status(400).json({ message: "Down payment cannot be marked not required for this service." });
      return;
    }

    const normalizedExistingPayment = normalizePaymentStageFields(existingPayment);
    const bodyFieldChanged = (field) => {
      if (!hasBodyField(field)) return false;
      if (field === "amountPaid" || field === "remainingBalance") {
        return Number(req.body[field] || 0) !== Number(normalizedExistingPayment[field] || 0);
      }
      return String(req.body[field] ?? "") !== String(normalizedExistingPayment[field] ?? "");
    };
    const isReviewerFinalPaymentUpdate =
      isPaymentReviewer &&
      [
        "finalPaymentStatus",
        "finalPaymentMethod",
        "finalPaymentReference",
        "finalPaymentProofUrl",
        "finalPaymentProofName",
        "finalPaymentNotes",
        "finalPaymentVerifiedAt",
        "finalPaymentVerifiedBy",
        "amountPaid",
        "remainingBalance",
      ].some(bodyFieldChanged);
    if (isReviewerFinalPaymentUpdate && !canReviewFinalPaymentStage(existingPayment)) {
      res.status(400).json({ message: "Full payment can only be reviewed after the customer submits remaining balance proof." });
      return;
    }

    const requestedTotalAmount = getPaymentTotalAmount({
      ...existingPayment,
      totalAmount: req.body.totalAmount ?? existingPayment.totalAmount,
      finalAmount: req.body.finalAmount ?? existingPayment.finalAmount,
      amount: req.body.amount ?? existingPayment.amount,
    });
    for (const field of ["amount", "originalAmount", "finalAmount", "totalAmount", "downPaymentAmount", "amountPaid", "remainingBalance"]) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        const numericValue = Number(req.body[field]);
        if (!Number.isFinite(numericValue) || numericValue < 0) {
          res.status(400).json({ message: "Payment amounts cannot be negative." });
          return;
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "downPaymentAmount") && Number(req.body.downPaymentAmount || 0) > requestedTotalAmount) {
      res.status(400).json({ message: "Down payment amount cannot exceed the payment total." });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "amountPaid") && Number(req.body.amountPaid || 0) > requestedTotalAmount) {
      res.status(400).json({ message: "Verified amount cannot exceed the payment total." });
      return;
    }

    const isMarkingPaid = isPaidStatus(nextStatus) && !isPaidStatus(existingPayment.status);
    const isMarkingDownPaymentPaid = nextDownPaymentStatus === "Paid" && normalizePaymentStageStatus(existingPayment.downPaymentStatus, "") !== "Paid";
    const isMarkingFinalPaymentPaid = nextFinalPaymentStatus === "Paid" && normalizePaymentStageStatus(existingPayment.finalPaymentStatus, "") !== "Paid";
    const isRejectingDownPayment = isPaymentReviewer && nextDownPaymentStatus === "Rejected" && normalizePaymentStageStatus(existingPayment.downPaymentStatus, "") !== "Rejected";
    const isRejectingFinalPayment = isPaymentReviewer && nextFinalPaymentStatus === "Rejected" && normalizePaymentStageStatus(existingPayment.finalPaymentStatus, "") !== "Rejected";
    if (isPaymentReviewer && (isMarkingDownPaymentPaid || isRejectingDownPayment)) {
      validateStageReadyForReview(existingPayment, "downPayment", nextDownPaymentStatus);
    }
    if (isPaymentReviewer && (isMarkingFinalPaymentPaid || isRejectingFinalPayment || isMarkingPaid)) {
      validateStageReadyForReview(existingPayment, "finalPayment", isMarkingPaid ? "Paid" : nextFinalPaymentStatus);
    }
    if (isPaymentReviewer && (isMarkingPaid || isMarkingDownPaymentPaid || isMarkingFinalPaymentPaid)) {
      await requireSpecialCredentialForRequest(req, { mode: "pin", scope: actorType === "staff" ? "staff" : "admin", actionKey: ACTION_KEYS.paymentVerify });

      const methodForVerification = normalizePaymentMethodLabel(
        isMarkingDownPaymentPaid
          ? (existingPayment.downPaymentMethod || existingPayment.method)
          : (existingPayment.finalPaymentMethod || existingPayment.method)
      );
      const requiresAccountName = actorType === "staff" || String(methodForVerification || "").trim().toLowerCase() === "cash";
      if (requiresAccountName) {
        requireAccountNameMatch(req);
      }
    }

    const rewardId = Object.prototype.hasOwnProperty.call(req.body, "rewardId")
      ? String(req.body.rewardId || "").trim()
      : String(existingPayment.rewardId || "").trim();
    const baseBeforeReward = Math.max(
      0,
      Number(existingPayment.originalAmount || 0) - Number(existingPayment.promoDiscountAmount || 0)
    ) || Number(existingPayment.amount || 0) + Number(existingPayment.rewardDiscountAmount || 0);
    const existingRewardPricing = {
      rewardId: existingPayment.rewardId || "",
      rewardName: existingPayment.rewardName || "",
      rewardType: existingPayment.rewardType || "",
      rewardDiscountType: existingPayment.rewardDiscountType || "",
      rewardValue: existingPayment.rewardValue || "",
      rewardClaimCode: existingPayment.rewardClaimCode || "",
      rewardDiscountAmount: Number(existingPayment.rewardDiscountAmount || 0),
      discountAmount: Number(existingPayment.discountAmount || existingPayment.rewardDiscountAmount || 0),
      subtotalAfterDiscount: Number(existingPayment.subtotalAfterDiscount || 0),
      taxAmount: Number(existingPayment.taxAmount || 0),
      finalAmount: Number(existingPayment.finalAmount || existingPayment.amount || 0),
      amount: Number(existingPayment.amount || 0),
    };
    const rewardPricing = isPaidStatus(existingPayment.status) || actorType === "customer"
      ? {
          ...existingRewardPricing,
        }
      : await validateCustomerRewardForUse({
          rewardId,
          customerEmail: existingPayment.customerEmail,
          customerName: existingPayment.customer,
          baseAmount: baseBeforeReward,
          excludePaymentId: existingPayment.id,
          service: { id: existingPayment.serviceId || "" },
        });
    const customerSubmittedDownPaymentMethod = normalizePaymentMethodLabel(req.body.downPaymentMethod || req.body.method || existingPayment.downPaymentMethod || "");
    const customerSubmittedDownPaymentIsCash = String(customerSubmittedDownPaymentMethod || "").trim().toLowerCase() === "cash";
    const customerSubmittedFinalPaymentMethod = normalizePaymentMethodLabel(req.body.finalPaymentMethod || existingPayment.finalPaymentMethod || "");
    const customerSubmittedFinalPaymentIsCash = String(customerSubmittedFinalPaymentMethod || "").trim().toLowerCase() === "cash";
    const sanitizedDownPaymentProof = validateProofImageInput(
      req.body.downPaymentProofUrl || req.body.proofImage || existingPayment.downPaymentProofUrl || existingPayment.proofImage || "",
      req.body.downPaymentProofName || req.body.proofFileName || existingPayment.downPaymentProofName || existingPayment.proofFileName || "",
      isCustomerSubmittingOwnPayment && isCustomerDownPaymentSubmission && !customerSubmittedDownPaymentIsCash
    );
    const sanitizedFinalPaymentProof = validateProofImageInput(
      req.body.finalPaymentProofUrl || existingPayment.finalPaymentProofUrl || "",
      req.body.finalPaymentProofName || existingPayment.finalPaymentProofName || "",
      isCustomerSubmittingOwnPayment && isCustomerFinalPaymentSubmission && !customerSubmittedFinalPaymentIsCash
    );
    const downPaymentOcrAdvisoryStatus = sanitizeOcrAdvisoryStatus(req.body.downPaymentOcrAdvisoryStatus || req.body.downPaymentReferenceCheckStatus || req.body.referenceValidationResult || "");
    const finalPaymentOcrAdvisoryStatus = sanitizeOcrAdvisoryStatus(req.body.finalPaymentOcrAdvisoryStatus || req.body.finalPaymentReferenceCheckStatus || req.body.referenceValidationResult || "");
    const preservedReviewerDownPaymentMethod = normalizePaymentMethodLabel(existingPayment.downPaymentMethod || existingPayment.method || "");
    const preservedReviewerFinalPaymentMethod = normalizePaymentMethodLabel(existingPayment.finalPaymentMethod || existingPayment.method || "");
    const proofSubmissionServerDate = isCustomerSubmittingOwnPayment && (isCustomerDownPaymentSubmission || isCustomerFinalPaymentSubmission)
      ? new Date()
      : null;
    const proofSubmissionIso = proofSubmissionServerDate ? proofSubmissionServerDate.toISOString() : "";
    const reviewFields =
      actorType !== "customer" && (nextStatus === "Paid" || nextStatus === "Rejected" || nextFinalPaymentStatus === "Paid" || nextFinalPaymentStatus === "Rejected")
        ? {
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.authUser?.email || req.body.auditUser || "",
          }
        : {};
    const verifier = req.authUser?.email || req.body.auditUser || "";
    const stageReviewFields = actorType !== "customer"
      ? {
          ...(isMarkingDownPaymentPaid ? {
            downPaymentVerifiedAt: existingPayment.downPaymentVerifiedAt || new Date(),
            downPaymentVerifiedBy: existingPayment.downPaymentVerifiedBy || verifier,
            downPaymentReviewStatus: "Verified",
          } : {}),
          ...(isRejectingDownPayment ? {
            downPaymentRejectedAt: new Date(),
            downPaymentRejectedBy: verifier,
            downPaymentRejectionReason: String(req.body.downPaymentRejectionReason || req.body.rejectionReason || req.body.downPaymentNotes || req.body.notes || "").trim().slice(0, 240),
            downPaymentReviewStatus: "Rejected",
          } : {}),
          ...(isMarkingFinalPaymentPaid || isMarkingPaid ? {
            finalPaymentVerifiedAt: existingPayment.finalPaymentVerifiedAt || new Date(),
            finalPaymentVerifiedBy: existingPayment.finalPaymentVerifiedBy || verifier,
            finalPaymentReviewStatus: "Verified",
          } : {}),
          ...(isRejectingFinalPayment ? {
            finalPaymentRejectedAt: new Date(),
            finalPaymentRejectedBy: verifier,
            finalPaymentRejectionReason: String(req.body.finalPaymentRejectionReason || req.body.rejectionReason || req.body.finalPaymentNotes || req.body.notes || "").trim().slice(0, 240),
            finalPaymentReviewStatus: "Rejected",
          } : {}),
        }
      : {};
    const nextPayload = isCustomerSubmittingOwnPayment && isCustomerFinalPaymentSubmission
      ? {
          method: existingPayment.method || "",
          reference: existingPayment.reference || "",
          notes: existingPayment.notes || "",
          proofImage: existingPayment.proofImage || "",
          proofFileName: existingPayment.proofFileName || "",
          proofSubmittedAt: existingPayment.proofSubmittedAt || "",
          status: "For Verification",
          downPaymentStatus: existingPayment.downPaymentStatus || "Pending",
          downPaymentMethod: normalizePaymentMethodLabel(existingPayment.downPaymentMethod || ""),
          downPaymentReference: existingPayment.downPaymentReference || "",
          downPaymentProofUrl: existingPayment.downPaymentProofUrl || "",
          downPaymentProofName: existingPayment.downPaymentProofName || "",
          downPaymentNotes: existingPayment.downPaymentNotes || "",
          finalPaymentStatus: "For Verification",
          finalPaymentMethod: customerSubmittedFinalPaymentMethod,
          finalPaymentReference: customerSubmittedFinalPaymentIsCash ? "" : sanitizePaymentReference(req.body.finalPaymentReference || ""),
          finalPaymentProofUrl: customerSubmittedFinalPaymentIsCash ? "" : sanitizedFinalPaymentProof.proofImage,
          finalPaymentProofName: customerSubmittedFinalPaymentIsCash ? "" : sanitizedFinalPaymentProof.proofFileName,
          finalPaymentProofSubmittedAt: proofSubmissionServerDate,
          finalPaymentReferenceCheckStatus: customerSubmittedFinalPaymentIsCash ? "cash_not_required" : "submitted",
          finalPaymentReferenceCheckedAt: proofSubmissionServerDate,
          finalPaymentOcrAdvisoryStatus,
          finalPaymentOcrAdvisoryText: sanitizeOcrAdvisoryText(req.body.finalPaymentOcrAdvisoryText || req.body.detectedText || ""),
          finalPaymentReviewStatus: "Submitted",
          finalPaymentNotes: existingPayment.finalPaymentNotes || "",
          auditUser: actorEmail,
          ...rewardPricing,
        }
      : isCustomerSubmittingOwnPayment
      ? {
          method: existingPayment.method || "",
          reference: existingPayment.reference || "",
          notes: existingPayment.notes || "",
          proofImage: customerSubmittedDownPaymentIsCash ? "" : sanitizedDownPaymentProof.proofImage,
          proofFileName: customerSubmittedDownPaymentIsCash ? "" : sanitizedDownPaymentProof.proofFileName,
          proofSubmittedAt: proofSubmissionIso,
          status: "For Verification",
          downPaymentStatus: "For Verification",
          downPaymentMethod: customerSubmittedDownPaymentMethod,
          downPaymentReference: customerSubmittedDownPaymentIsCash ? "" : sanitizePaymentReference(req.body.downPaymentReference || req.body.reference || ""),
          downPaymentProofUrl: customerSubmittedDownPaymentIsCash ? "" : sanitizedDownPaymentProof.proofImage,
          downPaymentProofName: customerSubmittedDownPaymentIsCash ? "" : sanitizedDownPaymentProof.proofFileName,
          downPaymentProofSubmittedAt: proofSubmissionServerDate,
          downPaymentReferenceCheckStatus: customerSubmittedDownPaymentIsCash ? "cash_not_required" : "submitted",
          downPaymentReferenceCheckedAt: proofSubmissionServerDate,
          downPaymentOcrAdvisoryStatus,
          downPaymentOcrAdvisoryText: sanitizeOcrAdvisoryText(req.body.downPaymentOcrAdvisoryText || req.body.detectedText || ""),
          downPaymentReviewStatus: "Submitted",
          downPaymentNotes: existingPayment.downPaymentNotes || "",
          finalPaymentStatus: existingPayment.finalPaymentStatus || existingPayment.status || "Pending",
          finalPaymentMethod: existingPayment.finalPaymentMethod || "",
          finalPaymentReference: existingPayment.finalPaymentReference || "",
          finalPaymentProofUrl: existingPayment.finalPaymentProofUrl || "",
          finalPaymentProofName: existingPayment.finalPaymentProofName || "",
          finalPaymentNotes: existingPayment.finalPaymentNotes || "",
          auditUser: actorEmail,
          ...rewardPricing,
        }
      : {
          ...req.body,
          ...reviewFields,
          ...stageReviewFields,
          ...rewardPricing,
          auditUser: req.authUser?.email || req.body.auditUser || "",
          method: normalizePaymentMethodLabel(existingPayment.method),
          reference: existingPayment.reference || "",
          downPaymentMethod: preservedReviewerDownPaymentMethod,
          downPaymentReference: existingPayment.downPaymentReference || "",
          finalPaymentMethod: preservedReviewerFinalPaymentMethod,
          finalPaymentReference: existingPayment.finalPaymentReference || existingPayment.reference || "",
        };
    const nextTotalAmount = getPaymentTotalAmount({ ...existingPayment, ...nextPayload });
    let nextAmountPaid = Object.prototype.hasOwnProperty.call(req.body, "amountPaid")
      ? Number(req.body.amountPaid || 0)
      : Number(existingPayment.amountPaid || 0);
    if (nextDownPaymentStatus === "Paid") {
      nextAmountPaid = Math.max(nextAmountPaid, Number(nextPayload.downPaymentAmount ?? existingPayment.downPaymentAmount ?? 0));
    }
    if (nextFinalPaymentStatus === "Paid" || isPaidStatus(nextPayload.status || existingPayment.status)) {
      nextAmountPaid = nextTotalAmount;
    }
    nextAmountPaid = clampPaymentAmount(nextAmountPaid, nextTotalAmount);
    const syncedLegacyStatus = nextFinalPaymentStatus === "Paid"
      ? "Paid"
      : nextFinalPaymentStatus === "For Verification"
        ? "For Verification"
        : nextFinalPaymentStatus === "Rejected"
          ? "Rejected"
          : nextPayload.status || existingPayment.status || "Pending";
    const stagedNextPayload = {
      ...nextPayload,
      status: syncedLegacyStatus,
      ...getPaymentStageFields({
        ...existingPayment,
        ...nextPayload,
        status: syncedLegacyStatus,
        totalAmount: nextTotalAmount,
        amountPaid: nextAmountPaid,
        downPaymentStatus: isCustomerDownPaymentSubmission ? "For Verification" : nextDownPaymentStatus,
        downPaymentMethod: isPaymentReviewer
          ? preservedReviewerDownPaymentMethod
          : normalizePaymentMethodLabel(nextPayload.downPaymentMethod || existingPayment.downPaymentMethod || ""),
        downPaymentReference: isPaymentReviewer
          ? existingPayment.downPaymentReference || ""
          : nextPayload.downPaymentReference || existingPayment.downPaymentReference || nextPayload.reference,
        finalPaymentStatus: isCustomerFinalPaymentSubmission ? "For Verification" : nextFinalPaymentStatus,
        finalPaymentMethod: isPaymentReviewer
          ? preservedReviewerFinalPaymentMethod
          : normalizePaymentMethodLabel(nextPayload.finalPaymentMethod || nextPayload.method || existingPayment.finalPaymentMethod),
        finalPaymentReference: isCustomerFinalPaymentSubmission
          ? nextPayload.finalPaymentReference
          : isPaymentReviewer
            ? existingPayment.finalPaymentReference || existingPayment.reference || ""
            : (nextPayload.finalPaymentReference || existingPayment.finalPaymentReference || nextPayload.reference),
        finalPaymentProofUrl: isCustomerFinalPaymentSubmission ? nextPayload.finalPaymentProofUrl : (nextPayload.finalPaymentProofUrl || nextPayload.proofImage || existingPayment.finalPaymentProofUrl),
        finalPaymentProofName: isCustomerFinalPaymentSubmission ? nextPayload.finalPaymentProofName : (nextPayload.finalPaymentProofName || nextPayload.proofFileName || existingPayment.finalPaymentProofName),
      }),
    };
    if (isMarkingDownPaymentPaid && !existingPayment.downPaymentVerifiedNotificationSentAt) {
      stagedNextPayload.downPaymentVerifiedNotificationSentAt = new Date();
    }

    const payment = await Payment.findOneAndUpdate(
      { id: req.params.id },
      stagedNextPayload,
      { new: true }
    );
    const proofAuditStage = isCustomerSubmittingOwnPayment && isCustomerFinalPaymentSubmission
      ? "finalPayment"
      : isCustomerSubmittingOwnPayment && isCustomerDownPaymentSubmission
        ? "downPayment"
        : "";
    const proofAuditAction = proofAuditStage === "finalPayment"
      ? "Full Payment Proof Submitted"
      : proofAuditStage === "downPayment"
        ? "Down Payment Proof Submitted"
        : "";
    const proofAuditMeta = proofAuditStage
      ? buildPaymentProofAuditMeta(payment, proofAuditStage, proofSubmissionServerDate, {
          method: proofAuditStage === "finalPayment" ? payment.finalPaymentMethod : payment.downPaymentMethod,
          reference: proofAuditStage === "finalPayment" ? payment.finalPaymentReference : payment.downPaymentReference,
          proofFileName: proofAuditStage === "finalPayment" ? payment.finalPaymentProofName : payment.downPaymentProofName,
          referenceValidationResult: proofAuditStage === "finalPayment" ? payment.finalPaymentReferenceCheckStatus : payment.downPaymentReferenceCheckStatus,
        })
      : null;
    await recordAudit(
      req.authUser?.email || req.body.auditUser,
      proofAuditAction || getPaymentAuditAction(existingPayment, stagedNextPayload),
      req.params.id,
      proofAuditMeta || {
        status: payment?.status || req.body.status || "",
        method: payment?.method || req.body.method || "",
        bookingId: payment?.bookingId || existingPayment?.bookingId || "",
      }
    );
    await Booking.findOneAndUpdate(
      { id: payment.bookingId },
      {
        amount: Number(payment.amount || 0),
        rewardId: payment.rewardId || "",
        rewardName: payment.rewardName || "",
        rewardType: payment.rewardType || "",
        rewardValue: payment.rewardValue || "",
        rewardClaimCode: payment.rewardClaimCode || "",
        rewardDiscountAmount: Number(payment.rewardDiscountAmount || 0),
        discountAmount: Number(payment.discountAmount || payment.rewardDiscountAmount || 0),
        subtotalAfterDiscount: Number(payment.subtotalAfterDiscount || 0),
        taxAmount: Number(payment.taxAmount || 0),
        finalAmount: Number(payment.finalAmount || payment.amount || 0),
      }
    );
    if (isPaidStatus(payment.status) && payment.rewardId) {
      await markCustomerRewardUsedForPayment(payment, req.authUser?.email || req.body.auditUser || "system");
    } else if ((isRejectingDownPayment || isRejectingFinalPayment) && payment.rewardId) {
      await releaseCustomerRewardReservation({
        rewardId: payment.rewardId,
        bookingId: payment.bookingId || "",
        paymentId: payment.id || "",
        reason: "Payment was rejected before reward usage.",
        auditUser: req.authUser?.email || req.body.auditUser || "system",
      });
      const resetPricing = {
        rewardId: "",
        rewardName: "",
        rewardType: "",
        rewardDiscountType: "",
        rewardValue: "",
        rewardClaimCode: "",
        rewardDiscountAmount: 0,
        discountAmount: 0,
        amount: Math.max(0, roundMoney(baseBeforeReward)),
        ...buildInvoiceSnapshot(baseBeforeReward, 0),
      };
      await Promise.all([
        Payment.findOneAndUpdate({ id: payment.id }, resetPricing),
        Booking.findOneAndUpdate({ id: payment.bookingId }, resetPricing),
      ]);
      Object.assign(payment, resetPricing);
    }
    if (isCustomerSubmittingOwnPayment && isCustomerDownPaymentSubmission) {
      await recordCustomerNotification(
        "Down payment proof submitted",
        payment,
        "Your down-payment proof has been submitted and is now waiting for admin verification.",
        { type: "down-payment-proof-submitted", bookingId: payment.bookingId || "" }
      );
    }
    if (isMarkingDownPaymentPaid && !existingPayment.downPaymentVerifiedNotificationSentAt) {
      await recordCustomerNotification(
        "Service is booked",
        payment,
        "Your down payment has been verified. Your booking is now secured and ready for scheduling.",
        { type: "down-payment-verified", bookingId: payment.bookingId || "" }
      );
    }
    res.json(normalizePaymentStageFields(payment));
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/tracking/issue-note", requireRoles("admin", "staff"), requireAction(ACTION_KEYS.trackingUpdateIssueNotes), handleTrackingIssueNoteAi);
app.post("/api/admin/issue-note-suggestion", requireRoles("admin", "staff"), requireAction(ACTION_KEYS.trackingUpdateIssueNotes), handleTrackingIssueNoteAi);

app.post("/api/admin/users/staff", requireAdminUser, async (req, res, next) => {
  try {
    if (respondIfDatabaseUnavailable(res)) return;

    const adminUser = await verifyAdminAccountPassword(req.authUser?.email, req.body.currentPassword);
    if (!adminUser) {
      res.status(401).json({ message: "Current account password is incorrect." });
      return;
    }

    const rawName = String(req.body.name || "");
    const name = sanitizeEmployeeName(rawName);
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").replace(/\D/g, "").slice(0, 11);
    const password = String(req.body.password || "");
    const role = normalizeEmployeeStaffRoleForSave(req.body.role || "");
    const passwordError = getPasswordRuleError(password);

    if (!name) {
      res.status(400).json({ message: "Full name is required." });
      return;
    }
    if (name.length > 48 || !/^[\p{L}\s'.-]+$/u.test(name)) {
      res.status(400).json({ message: "Full name can only contain letters, spaces, hyphens, apostrophes, and periods." });
      return;
    }
    if (!email || !EMPLOYEE_EMAIL_REGEX.test(email)) {
      res.status(400).json({ message: "Valid email is required." });
      return;
    }
    if (!/^09\d{9}$/.test(phone)) {
      res.status(400).json({ message: "Contact number must be 11 digits and start with 09." });
      return;
    }
    if (passwordError) {
      res.status(400).json({ message: passwordError });
      return;
    }
    if (!role) {
      res.status(400).json({ message: "Select a valid staff role. Admin cannot be created from this form." });
      return;
    }

    const [existingEmail, existingPhone] = await Promise.all([
      User.findOne({ email }).lean(),
      User.findOne({ phone }).lean(),
    ]);
    if (existingEmail) {
      res.status(409).json({ message: "That email is already registered." });
      return;
    }
    if (existingPhone) {
      res.status(409).json({ message: "That contact number is already registered." });
      return;
    }

    const nameParts = name.split(/\s+/).filter(Boolean);
    const first = nameParts[0] || name;
    const last = nameParts.slice(1).join(" ");
    const userId = String(createId("USR") || "").trim();
    if (!userId) {
      res.status(500).json({ message: "Could not generate a user ID for the new staff account." });
      return;
    }

    let user;
    try {
      user = await User.create({
        id: userId,
        name,
        first,
        last,
        userType: "Staff",
        role,
        email,
        phone,
        password: hashPassword(password),
        status: "active",
        cars: [],
      });
    } catch (error) {
      if (error?.name === "ValidationError") {
        res.status(400).json({ message: error.message || "Invalid staff account details." });
        return;
      }
      throw error;
    }

    await recordAudit(req.authUser?.email || req.body.auditUser, "Created staff account", user.id, {
      email: user.email,
      role: user.role,
      status: user.status,
    });

    res.status(201).json(sanitizeUser(user));
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/users/:id", async (req, res, next) => {
  try {
    const existingUser = await User.findOne({ id: req.params.id }).lean();
    if (!existingUser) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    const actorType = normalizeUserType(req.authUser?.userType, req.authUser?.role);
    const isSelfUpdate = String(req.authUser?.id || "") === String(req.params.id || "");
    if (actorType !== "admin" && !isSelfUpdate) {
      res.status(403).json({ message: "You can only update your own profile." });
      return;
    }

    const existingUserType = normalizeUserType(existingUser.userType, existingUser.role);
    const requestedUserType = Object.prototype.hasOwnProperty.call(req.body, "userType")
      ? normalizeUserType(req.body.userType, req.body.role)
      : existingUserType;
    const existingSubtype = normalizeSubtype(existingUser.userType, existingUser.role);
    const requestedSubtype = Object.prototype.hasOwnProperty.call(req.body, "role")
      ? normalizeSubtype(req.body.userType || existingUser.userType, req.body.role)
      : existingSubtype;
    const nextAccountTypeForRole = toDisplayUserType(req.body.userType || existingUser.userType, req.body.role);
    if (
      actorType === "admin" &&
      ["Admin", "Staff"].includes(nextAccountTypeForRole) &&
      Object.prototype.hasOwnProperty.call(req.body, "role") &&
      !isValidStaffRole(req.body.role)
    ) {
      res.status(400).json({ message: "Select a valid staff role." });
      return;
    }
    const isRoleUpdate = actorType === "admin" && (requestedUserType !== existingUserType || requestedSubtype !== existingSubtype);
    const existingStatus = String(existingUser.status || "active").trim().toLowerCase();
    const requestedStatus = Object.prototype.hasOwnProperty.call(req.body, "status")
      ? String(req.body.status || "").trim().toLowerCase()
      : existingStatus;
    const isStatusUpdate = actorType === "admin" && requestedStatus !== existingStatus;
    const isDeactivatingActiveAdmin =
      existingUserType === "admin" &&
      existingStatus === "active" &&
      requestedStatus !== "active";
    const isRemovingActiveAdminRole =
      existingUserType === "admin" &&
      existingStatus === "active" &&
      requestedUserType !== "admin";

    if (actorType === "admin" && (isRoleUpdate || isStatusUpdate)) {
      await requireAdminSpecialCredentialWithAudit(req, ACTION_KEYS.usersPromote, req.params.id);
    }
    if (isSelfUpdate && actorType === "admin" && (isDeactivatingActiveAdmin || isRemovingActiveAdminRole)) {
      await recordAudit(req.authUser?.email || req.body.auditUser, "Blocked self-deactivation", req.params.id, {
        targetType: "User",
        previousState: { userType: existingUser.userType, role: existingUser.role, status: existingUser.status },
        requestedState: { userType: req.body.userType || existingUser.userType, role: req.body.role || existingUser.role, status: req.body.status || existingUser.status },
        result: "denied",
      });
      res.status(403).json({ message: "Admins cannot deactivate or remove their own admin access here." });
      return;
    }
    if ((isDeactivatingActiveAdmin || isRemovingActiveAdminRole) && (await countActiveAdmins(req.params.id)) < 1) {
      await recordAudit(req.authUser?.email || req.body.auditUser, "Blocked last active admin change", req.params.id, {
        targetType: "User",
        previousState: { userType: existingUser.userType, role: existingUser.role, status: existingUser.status },
        requestedState: { userType: req.body.userType || existingUser.userType, role: req.body.role || existingUser.role, status: req.body.status || existingUser.status },
        result: "denied",
      });
      res.status(403).json({ message: "At least one active Admin account must remain." });
      return;
    }

    const nextUserType = actorType === "admin"
      ? toDisplayUserType(req.body.userType, req.body.role)
      : existingUser.userType;
    const normalizedRequestedStatus = requestedStatus === "active" ? "active" : "deactivated";
    const payload = actorType === "admin"
      ? {
          ...req.body,
          userType: nextUserType,
          role: ["Admin", "Staff"].includes(nextUserType)
            ? normalizeStaffRoleForSave(req.body.role || USER_TYPE_DEFAULT_ROLE[nextUserType.toLowerCase()])
            : toDisplaySubtype(nextUserType, req.body.role),
          name: req.body.name || (String(req.body.first || "") + " " + String(req.body.last || "")).trim(),
          status: normalizedRequestedStatus,
          ...(isStatusUpdate && normalizedRequestedStatus !== "active"
            ? { deactivatedAt: new Date().toISOString(), deactivatedBy: req.authUser?.email || "" }
            : {}),
        }
      : {
          first: req.body.first ?? existingUser.first,
          last: req.body.last ?? existingUser.last,
          name: req.body.name || `${String(req.body.first ?? existingUser.first ?? "")} ${String(req.body.last ?? existingUser.last ?? "")}`.trim() || existingUser.name,
          email: req.body.email ?? existingUser.email,
          phone: req.body.phone ?? existingUser.phone,
          userType: existingUser.userType,
          role: existingUser.role,
          status: existingUser.status,
        };
    if (actorType !== "admin" && Object.prototype.hasOwnProperty.call(req.body, "password")) {
      payload.password = req.body.password;
    }

    if (nextUserType === "Customer") {
      const bookingCount = await Booking.countDocuments({ customerEmail: String(payload.email || "").trim().toLowerCase() });
      payload.role = bookingCount >= 2 ? "Returning" : "New";
      payload.cars = normalizeCustomerCars(req.body.cars ?? existingUser.cars);
    } else if (actorType === "admin") {
      payload.cars = [];
    }

    if ("password" in payload) {
      if (payload.password) {
        payload.password = isPasswordHash(payload.password) ? payload.password : hashPassword(payload.password);
      } else {
        delete payload.password;
      }
    }

    const user = await User.findOneAndUpdate({ id: req.params.id }, payload, { new: true });
    await recordAudit(req.authUser?.email || req.body.auditUser, getUserAuditAction(existingUser, payload), req.params.id, {
      actorId: req.authUser?.id || "",
      actorName: req.authUser?.name || req.authUser?.email || "",
      actorRole: req.authUser?.role || "",
      targetType: "User",
      email: payload.email,
      status: payload.status,
      previousState: {
        userType: existingUser.userType,
        role: existingUser.role,
        status: existingUser.status,
      },
      newState: {
        userType: user.userType,
        role: user.role,
        status: user.status,
      },
      result: "allowed",
    });
    res.json(sanitizeUser(user));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/users/:id", requireAdminUser, async (req, res, next) => {
  try {
    const targetUser = await User.findOne({ id: req.params.id });
    if (!targetUser) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    await requireAdminSpecialCredentialWithAudit(req, ACTION_KEYS.usersDelete, req.params.id);

    const actorEmail = req.authUser?.email || req.body?.auditUser || req.query?.auditUser || "";
    const targetType = normalizeUserType(targetUser.userType, targetUser.role);
    const targetWasActiveAdmin = targetType === "admin" && isActiveAccount(targetUser);
    if (String(req.authUser?.id || "") === String(targetUser.id || "")) {
      await recordAudit(actorEmail, "Blocked self-delete", targetUser.id, {
        targetType: "User",
        targetRole: targetUser.role,
        result: "denied",
      });
      res.status(403).json({ message: "Admins cannot delete or deactivate their own account here." });
      return;
    }
    if (targetWasActiveAdmin && (await countActiveAdmins(targetUser.id)) < 1) {
      await recordAudit(actorEmail, "Blocked last active admin deletion", targetUser.id, {
        targetType: "User",
        targetRole: targetUser.role,
        result: "denied",
      });
      res.status(403).json({ message: "At least one active Admin account must remain." });
      return;
    }

    const relationships = await countProtectedUserRelationships(targetUser);
    const hardDeleteRequested = req.body?.hardDelete === true || String(req.query?.hardDelete || "").toLowerCase() === "true";
    if (hardDeleteRequested && relationships.total === 0) {
      await User.findOneAndDelete({ id: targetUser.id });
      await recordAudit(actorEmail, "Hard deleted user", targetUser.id, {
        targetType: "User",
        targetEmail: targetUser.email,
        previousState: { status: targetUser.status, userType: targetUser.userType, role: targetUser.role },
        newState: { deleted: true },
        result: "allowed",
      });
      res.status(204).end();
      return;
    }

    const previousState = { status: targetUser.status, userType: targetUser.userType, role: targetUser.role };
    targetUser.status = "deleted";
    targetUser.deletedAt = targetUser.deletedAt || new Date().toISOString();
    targetUser.deletedBy = actorEmail;
    targetUser.deletionMode = "soft";
    targetUser.deactivatedAt = targetUser.deactivatedAt || targetUser.deletedAt;
    targetUser.deactivatedBy = targetUser.deactivatedBy || actorEmail;
    await targetUser.save();
    await recordAudit(actorEmail, "Soft deleted user", targetUser.id, {
      targetType: "User",
      targetEmail: targetUser.email,
      previousState,
      newState: { status: "deleted", deletionMode: "soft" },
      protectedRelationships: relationships,
      result: "allowed",
    });
    res.json({ id: targetUser.id, status: targetUser.status, deletionMode: targetUser.deletionMode });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/audit-logs/archive", requireAdminUser, async (req, res, next) => {
  try {
    const auditUser = req.body?.auditUser || req.query?.auditUser || "system";
    const archivedAt = new Date().toISOString();

    await AuditLog.updateMany(
      { archived: { $ne: true } },
      {
        $set: {
          archived: true,
          archivedAt,
          archivedBy: auditUser,
        },
      }
    );

    await AuditLog.create({
      id: createId("AUD"),
      userId: auditUser,
      action: "Archived audit logs",
      targetId: "AUDIT",
      ts: toTimestamp(),
      meta: { archivedAt },
      archived: true,
      archivedAt,
      archivedBy: auditUser,
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/audit-logs/unarchive", requireAdminUser, async (req, res, next) => {
  try {
    const auditUser = req.body?.auditUser || req.query?.auditUser || "system";

    await AuditLog.updateMany(
      { archived: true },
      {
        $set: {
          archived: false,
          archivedAt: "",
          archivedBy: "",
        },
      }
    );

    await recordAudit(auditUser, "Unarchived audit logs", "AUDIT");

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/reviews", requireRoles("admin", "customer"), async (req, res, next) => {
  try {
    const actorType = normalizeUserType(req.authUser?.userType, req.authUser?.role);
    if (actorType !== "customer") {
      res.status(403).json({ message: "Customers submit reviews from their own completed bookings. Admins may moderate existing reviews." });
      return;
    }
    const bookingId = String(req.body.bookingId || "").trim();
    if (!bookingId) {
      res.status(400).json({ message: "Booking selection is required before submitting a review." });
      return;
    }
    const [booking, existingReview] = await Promise.all([
      Booking.findOne({ id: bookingId }).lean(),
      Review.findOne({
        bookingId,
        status: { $nin: ["Archived"] },
      }).lean(),
    ]);
    const payment = booking ? await getLinkedPaymentForBooking(booking) : null;
    const eligibility = engagementDomain.evaluateReviewEligibility({
      booking,
      payment,
      existingReview,
      customer: req.authUser,
    });
    if (!eligibility.eligible) {
      res.status(400).json({ message: eligibility.reason });
      return;
    }
    const reviewInput = engagementDomain.validateReviewInput(req.body);
    const review = await Review.create({
      id: createId("REV"),
      customerId: req.authUser?.id || booking.customerId || "",
      customer: req.authUser?.name || booking.customer || "Customer",
      customerEmail: req.authUser?.email || booking.customerEmail || "",
      bookingId: booking.id,
      serviceId: booking.serviceId || "",
      serviceName: booking.service || "",
      rating: reviewInput.rating,
      comment: reviewInput.comment,
      bookingStatusSnapshot: bookingDomain.normalizeBookingStatus(booking.status, "Completed"),
      paymentEligibilitySnapshot: {
        fullyPaid: paymentDomain.isPaymentFullyPaid(payment, booking),
        verifiedPaidAmount: paymentDomain.getVerifiedPaidAmount(payment, booking),
        outstandingBalance: paymentDomain.getOutstandingBalance(payment, booking),
      },
      status: "Pending",
    });
    await recordAudit(req.authUser?.email || req.body.auditUser, "Review submitted", review.id, {
      bookingId: booking.id,
      customerEmail: review.customerEmail || "",
      rating: review.rating,
    });
    res.status(201).json(review);
  } catch (error) {
    if (error?.code === 11000) {
      res.status(409).json({ message: "This booking already has a review." });
      return;
    }
    next(error);
  }
});

app.put("/api/admin/reviews/:id", requireAdminUser, async (req, res, next) => {
  try {
    const review = await Review.findOne({ id: req.params.id });
    if (!review) {
      res.status(404).json({ message: "Review not found." });
      return;
    }
    const previousStatus = engagementDomain.normalizeReviewStatus(review.status, "Pending");
    const nextStatus = Object.prototype.hasOwnProperty.call(req.body, "status")
      ? engagementDomain.normalizeReviewStatus(req.body.status, "")
      : previousStatus;
    if (!nextStatus || !engagementDomain.REVIEW_STATUSES.includes(nextStatus)) {
      res.status(400).json({ message: "Unsupported review status." });
      return;
    }
    if (previousStatus === "Archived" && nextStatus !== "Published" && nextStatus !== "Hidden") {
      res.status(400).json({ message: "Archived reviews can only be restored to Published or Hidden." });
      return;
    }
    const adminResponse = Object.prototype.hasOwnProperty.call(req.body, "adminResponse")
      ? String(req.body.adminResponse || "").trim().slice(0, 1000)
      : review.adminResponse || "";
    const now = new Date().toISOString();
    review.status = nextStatus;
    review.archived = nextStatus === "Archived";
    review.archivedAt = nextStatus === "Archived" ? now : "";
    review.archivedBy = nextStatus === "Archived" ? req.authUser?.email || "" : "";
    review.moderatedAt = now;
    review.moderatedBy = req.authUser?.email || "";
    review.moderationReason = String(req.body.reason || req.body.moderationReason || "").trim().slice(0, 240);
    if (adminResponse !== review.adminResponse) {
      review.adminResponse = adminResponse;
      review.adminResponseAt = adminResponse ? now : "";
    }
    await review.save();
    await recordAudit(req.authUser?.email || req.body.auditUser, "Review moderated", review.id, {
      bookingId: review.bookingId || "",
      previousStatus,
      status: review.status,
      hasAdminResponse: Boolean(review.adminResponse),
    });
    res.json(review);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/promos", requireAdminUser, async (req, res, next) => {
  try {
    const payload = engagementDomain.normalizePromotionPayload(req.body);
    await ensureApplicableServicesExist(payload.applicableServiceIds);
    const duplicate = await Promo.findOne({ code: payload.code }).lean();
    if (duplicate) {
      res.status(409).json({ message: "Promotion code already exists." });
      return;
    }

    const promo = await Promo.create({
      id: createId("PRO"),
      ...payload,
      expiryMode: payload.endAt ? "date" : payload.usageLimit > 0 ? "usage" : "none",
      usageCount: 0,
    });

    await recordAudit(req.authUser?.email || req.body.auditUser, "Promotion created", promo.id, {
      title: promo.title,
      code: promo.code,
      status: promo.status,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
    });

    res.status(201).json(hydratePromo(promo));
  } catch (error) {
    if (error?.code === 11000) {
      res.status(409).json({ message: "Promotion code already exists." });
      return;
    }
    next(error);
  }
});

app.put("/api/admin/promos/:id", requireAdminUser, async (req, res, next) => {
  try {
    const existingPromo = await Promo.findOne({ id: req.params.id });
    if (!existingPromo) {
      res.status(404).json({ message: "Promo not found." });
      return;
    }

    const payload = engagementDomain.normalizePromotionPayload(req.body, existingPromo);
    await ensureApplicableServicesExist(payload.applicableServiceIds);
    const duplicate = await Promo.findOne({ code: payload.code, id: { $ne: req.params.id } }).lean();
    if (duplicate) {
      res.status(409).json({ message: "Promotion code already exists." });
      return;
    }
    const previousState = hydratePromo(existingPromo);
    const promo = await Promo.findOneAndUpdate(
      { id: req.params.id },
      {
        ...payload,
        expiryMode: payload.endAt ? "date" : payload.usageLimit > 0 ? "usage" : "none",
      },
      { new: true }
    );

    await recordAudit(req.authUser?.email || req.body.auditUser, "Promotion updated", promo.id, {
      title: promo.title,
      code: promo.code,
      previousStatus: previousState.status,
      status: promo.status,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
    });

    res.json(hydratePromo(promo));
  } catch (error) {
    if (error?.code === 11000) {
      res.status(409).json({ message: "Promotion code already exists." });
      return;
    }
    next(error);
  }
});

app.patch("/api/admin/promos/:id/archive", requireAdminUser, async (req, res, next) => {
  try {
    const promo = await Promo.findOneAndUpdate(
      { id: req.params.id },
      { status: "Archived", enabled: false, archived: true, archivedAt: new Date().toISOString(), archivedBy: req.authUser?.email || "" },
      { new: true }
    );
    if (!promo) {
      res.status(404).json({ message: "Promo not found." });
      return;
    }
    await recordAudit(req.authUser?.email || req.body.auditUser, "Promotion archived", promo.id, { code: promo.code || "" });
    res.json(hydratePromo(promo));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/promos/:id/restore", requireAdminUser, async (req, res, next) => {
  try {
    const promo = await Promo.findOneAndUpdate(
      { id: req.params.id },
      { status: "Draft", enabled: false, archived: false, archivedAt: "", archivedBy: "" },
      { new: true }
    );
    if (!promo) {
      res.status(404).json({ message: "Promo not found." });
      return;
    }
    await recordAudit(req.authUser?.email || req.body.auditUser, "Promotion restored", promo.id, { code: promo.code || "" });
    res.json(hydratePromo(promo));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/promos/:id/use", requireAdminUser, async (req, res, next) => {
  try {
    if (await blockStaffEngagementMutation(req, res)) return;
    const promo = await Promo.findOne({ id: req.params.id });
    if (!promo) {
      res.status(404).json({ message: "Promo not found." });
      return;
    }

    const hydratedPromo = hydratePromo(promo);
    if (hydratedPromo.status !== "Active") {
      res.status(400).json({ message: "Only active promos can be used." });
      return;
    }

    promo.usageCount = Math.max(0, Number(promo.usageCount) || 0) + 1;
    await promo.save();

    await recordAudit(req.body.auditUser, "Used promo", promo.id, {
      title: promo.title,
      usageCount: promo.usageCount,
      usageLimit: promo.usageLimit,
    });

    res.json(hydratePromo(promo));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/rewards", requireAdminUser, async (req, res, next) => {
  try {
    const payload = normalizeRewardPayload(req.body);
    const duplicate = await Reward.findOne({ code: payload.code }).lean();
    if (duplicate) {
      res.status(409).json({ message: "Reward code already exists." });
      return;
    }
    const reward = await Reward.create({ id: createId("RWD"), ...payload });
    await recordAudit(req.authUser?.email || req.body.auditUser, "Reward definition created", reward.id, {
      name: reward.name,
      code: reward.code,
      type: reward.type,
      weight: reward.weight,
    });
    res.status(201).json(engagementDomain.hydrateRewardDefinition(reward));
  } catch (error) {
    if (error?.code === 11000) {
      res.status(409).json({ message: "Reward code already exists." });
      return;
    }
    next(error);
  }
});

app.put("/api/admin/rewards/:id", requireAdminUser, async (req, res, next) => {
  try {
    const existingReward = await Reward.findOne({ id: req.params.id });
    if (!existingReward) {
      res.status(404).json({ message: "Reward not found." });
      return;
    }
    const payload = normalizeRewardPayload(req.body, existingReward);
    const duplicate = await Reward.findOne({ code: payload.code, id: { $ne: req.params.id } }).lean();
    if (duplicate) {
      res.status(409).json({ message: "Reward code already exists." });
      return;
    }
    const previous = engagementDomain.hydrateRewardDefinition(existingReward);
    const reward = await Reward.findOneAndUpdate({ id: req.params.id }, payload, { new: true });
    await recordAudit(req.authUser?.email || req.body.auditUser, "Reward definition updated", reward.id, {
      name: reward.name,
      code: reward.code,
      previousEnabled: previous.enabled,
      enabled: reward.enabled,
      archived: reward.archived,
      weight: reward.weight,
      quantity: reward.quantity,
    });
    res.json(engagementDomain.hydrateRewardDefinition(reward));
  } catch (error) {
    if (error?.code === 11000) {
      res.status(409).json({ message: "Reward code already exists." });
      return;
    }
    next(error);
  }
});

app.delete("/api/admin/rewards/:id", requireAdminUser, async (req, res, next) => {
  try {
    const historyCount = await CustomerReward.countDocuments({ rewardId: req.params.id });
    const reward = historyCount > 0
      ? await Reward.findOneAndUpdate(
          { id: req.params.id },
          { active: false, enabled: false, archived: true, archivedAt: new Date().toISOString(), archivedBy: req.authUser?.email || "" },
          { new: true }
        )
      : await Reward.findOneAndDelete({ id: req.params.id });
    if (!reward) {
      res.status(404).json({ message: "Reward not found." });
      return;
    }
    await recordAudit(req.authUser?.email || req.body.auditUser || req.query.auditUser, historyCount > 0 ? "Reward definition archived" : "Reward definition deleted", req.params.id, {
      name: reward.name,
      historyCount,
    });
    if (historyCount > 0) {
      res.json(engagementDomain.hydrateRewardDefinition(reward));
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/rewards/:id/claim", requireRoles("customer"), async (req, res, next) => {
  try {
    const customerReward = await CustomerReward.findOne({ id: req.params.id });
    if (!customerReward) {
      res.status(404).json({ message: "Reward not found." });
      return;
    }
    const ownerEmail = String(customerReward.customerEmail || "").trim().toLowerCase();
    const ownerId = String(customerReward.customerId || "").trim();
    const actorEmail = String(req.authUser?.email || "").trim().toLowerCase();
    const actorId = String(req.authUser?.id || "").trim();
    if (!((ownerEmail && ownerEmail === actorEmail) || (ownerId && ownerId === actorId))) {
      res.status(403).json({ message: "Reward does not belong to your account." });
      return;
    }
    if (isRewardExpired(customerReward)) {
      customerReward.status = "Expired";
      await customerReward.save();
      res.status(400).json({ message: "Reward expired." });
      return;
    }
    const transition = engagementDomain.getRewardTransition(customerReward.status, "Claimed");
    if (!transition.allowed && transition.current !== "Claimed") {
      res.status(400).json({ message: "This reward cannot be claimed from its current status." });
      return;
    }
    customerReward.status = "Claimed";
    customerReward.claimedAt = customerReward.claimedAt || new Date().toISOString();
    await customerReward.save();
    await recordAudit(req.authUser?.email || req.body.auditUser, "Reward claimed", customerReward.id, {
      customerEmail: customerReward.customerEmail || "",
      milestoneNumber: customerReward.milestoneNumber || 0,
    });
    res.json(hydrateCustomerReward(customerReward));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/rewards/generate", requireAdminUser, async (req, res, next) => {
  try {
    const customerEmail = String(req.body.customerEmail || "").trim().toLowerCase();
    const customerName = String(req.body.customerName || "").trim();
    const booking = await Booking.findOne(customerEmail ? { customerEmail } : { customer: customerName }).sort({ createdAt: -1 }).lean();
    if (!booking) {
      res.status(404).json({ message: "No booking found for this customer." });
      return;
    }
    const createdRewards = await generateEligibleRewardsForBooking(booking, req.body.auditUser || "Admin");
    res.json({ createdRewards });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/expenses", requireAdminUser, async (req, res, next) => {
  try {
    const payload = expenseDomain.normalizeExpensePayload(req.body);
    const validationMessage = expenseDomain.validateExpensePayload(payload);
    if (validationMessage) {
      res.status(400).json({ message: validationMessage });
      return;
    }
    const expense = await Expense.create({
      id: createId("E"),
      ...payload,
      archived: false,
    });
    await recordAudit(req.authUser?.email || req.body.auditUser, "Created expense", expense.id, {
      category: expense.category,
      amount: expense.amount,
      description: expense.description,
    });
    res.status(201).json(expense);
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/expenses/:id", requireAdminUser, async (req, res, next) => {
  try {
    const existingExpense = await Expense.findOne({ id: req.params.id });
    if (!existingExpense) {
      res.status(404).json({ message: "Expense not found." });
      return;
    }
    const payload = expenseDomain.normalizeExpensePayload(req.body, existingExpense);
    const validationMessage = expenseDomain.validateExpensePayload(payload);
    if (validationMessage) {
      res.status(400).json({ message: validationMessage });
      return;
    }
    Object.assign(existingExpense, payload);
    await existingExpense.save();
    await recordAudit(req.authUser?.email || req.body.auditUser, "Edited expense", existingExpense.id, {
      category: existingExpense.category,
      amount: existingExpense.amount,
      description: existingExpense.description,
    });
    res.json(existingExpense);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/expenses/:id/archive", requireAdminUser, async (req, res, next) => {
  try {
    const expense = await Expense.findOne({ id: req.params.id });
    if (!expense) {
      res.status(404).json({ message: "Expense not found." });
      return;
    }
    expense.archived = true;
    expense.archivedAt = new Date().toISOString();
    expense.archivedBy = req.authUser?.email || req.body.auditUser || "";
    await expense.save();
    await recordAudit(expense.archivedBy, "Archived expense", expense.id, {
      category: expense.category,
      amount: expense.amount,
    });
    res.json(expense);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/expenses/:id/restore", requireAdminUser, async (req, res, next) => {
  try {
    const expense = await Expense.findOne({ id: req.params.id });
    if (!expense) {
      res.status(404).json({ message: "Expense not found." });
      return;
    }
    expense.archived = false;
    expense.archivedAt = "";
    expense.archivedBy = "";
    await expense.save();
    await recordAudit(req.authUser?.email || req.body.auditUser, "Restored expense", expense.id, {
      category: expense.category,
      amount: expense.amount,
    });
    res.json(expense);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/expenses/:id", requireAdminUser, async (req, res, next) => {
  try {
    const confirmed = String(req.body.confirm || req.query.confirm || "").trim().toLowerCase();
    if (confirmed !== "delete") {
      res.status(400).json({ message: "Type delete to confirm expense deletion." });
      return;
    }
    const expense = await Expense.findOneAndDelete({ id: req.params.id });
    if (!expense) {
      res.status(404).json({ message: "Expense not found." });
      return;
    }
    await recordAudit(req.authUser?.email || req.body.auditUser, "Deleted expense", expense.id, {
      category: expense.category,
      amount: expense.amount,
      description: expense.description,
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/commissions/:id", requireRoles("admin", "staff"), async (req, res, next) => {
  try {
    const commission = await Commission.findOne({ id: req.params.id });
    if (!commission) {
      res.status(404).json({ message: "Commission not found." });
      return;
    }
    if (!canManageCommission(req.authUser, commission)) {
      denyForbidden(res);
      return;
    }

    const nextStatus = String(req.body.status || "").trim();
    if (nextStatus === "Paid") {
      const currentStatus = String(commission.status || "").trim().toLowerCase();
      if (currentStatus === "paid") {
        res.status(400).json({ message: "This commission is already marked as Paid." });
        return;
      }
      if (["voided", "cancelled"].includes(currentStatus)) {
        res.status(400).json({ message: "Voided or cancelled commissions cannot be marked as Paid." });
        return;
      }
      const actorType = normalizeUserType(req.authUser?.userType, req.authUser?.role);
      await requireSpecialCredentialForRequest(req, {
        mode: "pin",
        scope: actorType === "staff" ? "staff" : "admin",
        actionKey: ACTION_KEYS.commissionMarkPaid,
      });
      commission.status = "Paid";
      commission.datePaid = new Date().toISOString();
      commission.paidBy = req.authUser?.email || req.body.auditUser || "";
      commission.remarks = String(req.body.remarks || commission.remarks || "Marked as paid.").trim();
      await commission.save();
      await recordAudit(req.authUser?.email || req.body.auditUser, "Marked commission paid", commission.id, {
        bookingId: commission.bookingId,
        worker: commission.worker,
        earned: commission.earned,
      });
      res.json(commission);
      return;
    }

    if (nextStatus === "Voided") {
      const reason = String(req.body.reason || req.body.voidReason || "").trim();
      if (!reason) {
        res.status(400).json({ message: "Void reason is required." });
        return;
      }
      const currentStatus = String(commission.status || "").trim().toLowerCase();
      if (currentStatus === "paid") {
        res.status(400).json({ message: "Paid commissions cannot be voided." });
        return;
      }
      if (currentStatus === "voided") {
        res.status(400).json({ message: "This commission is already voided." });
        return;
      }
      if (currentStatus === "cancelled") {
        res.status(400).json({ message: "Cancelled commissions cannot be voided." });
        return;
      }
      const actorType = normalizeUserType(req.authUser?.userType, req.authUser?.role);
      await requireSpecialCredentialForRequest(req, {
        mode: "pin",
        scope: actorType === "staff" ? "staff" : "admin",
        actionKey: ACTION_KEYS.commissionVoid,
      });
      commission.status = "Voided";
      commission.voidReason = reason;
      commission.voidedAt = new Date().toISOString();
      commission.voidedBy = req.authUser?.email || req.body.auditUser || "";
      commission.remarks = reason;
      await commission.save();
      await recordAudit(req.authUser?.email || req.body.auditUser, "Voided commission", commission.id, {
        bookingId: commission.bookingId,
        worker: commission.worker,
        reason,
      });
      res.json(commission);
      return;
    }

    res.status(400).json({ message: "Unsupported commission status update." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/commissions", requireAdminUser, async (_req, res) => {
  res.status(403).json({ message: "Commission entries are generated automatically when a staff-assigned booking is marked completed." });
});

if (IS_PRODUCTION) {
  app.use(express.static(BUILD_DIR));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/health") {
      next();
      return;
    }
    res.sendFile(path.join(BUILD_DIR, "index.html"), (error) => {
      if (error) next(error);
    });
  });
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({ message: error.message || "Unexpected server error" });
});

async function start() {
  validateProductionEnvironment();
  await connectToDatabase();
  logProductionConfiguration();
  await migrateStockMonitoringCollection();
  await ensureSeedData();
  await ensureProductionAdminFromEnv();
  await migrateServiceTypes();
  await migrateServicePricing();
  await migrateServiceConsumablesBySize();
  await clearSeededServiceConsumables();
  await removeSeededEngagementData();
  await ensureDefaultRewardPool();
  await migrateMissingUserIds();
  await migrateUsersToUserTypes();
  await migrateCustomerCars();
  await migratePromoChannels();
  await migratePlaintextPasswords();
  await migratePaymentMethods();
  await migrateExpenseCategories();
  await backfillAutomaticExpenses();
  startDownPaymentDeadlineMonitor();
  app.listen(PORT, () => {
    console.log(`AutoFlow server listening on port ${PORT}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
}

module.exports = {
  app,
  ACTION_KEYS,
  MODULE_KEYS,
  QR_TOKEN_PURPOSES,
  appendBookingAccessLinks,
  buildTrackingDto,
  buildWarrantyDto,
  canPerformAction,
  canViewBooking,
  createBookingAccessToken,
  filterBootstrapDataForRole,
  getBookingAccessVersion,
  isBookingAccessRevoked,
  isActiveAccount,
  parseBookingAccessToken,
};
