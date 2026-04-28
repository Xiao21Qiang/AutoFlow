require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const { connectToDatabase } = require("./db");
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
} = require("./models");

const app = express();
const PORT = Number(process.env.API_PORT || process.env.PORT || 4000);
const CLIENT_APP_URL = String(process.env.CLIENT_APP_URL || "http://localhost:3000").trim();
const signupOtpStore = new Map();
const passwordChangeOtpStore = new Map();
const PASSWORD_PREFIX = "scrypt$";
const LEGACY_CUSTOMER_ALIAS = "cl" + "ient";
const GOOGLE_SMTP_EMAIL = String(process.env.GOOGLE_SMTP_EMAIL || "").trim();
const GOOGLE_SMTP_APP_PASSWORD = String(process.env.GOOGLE_SMTP_APP_PASSWORD || "").trim();
const GOOGLE_SMTP_FROM = String(process.env.GOOGLE_SMTP_FROM || GOOGLE_SMTP_EMAIL || "").trim();
const AI_PROVIDER_UNCONFIGURED_MESSAGE = "AI provider is not configured yet.";
const VEHICLE_API_BASE_URL = "https://vpic.nhtsa.dot.gov/api/vehicles";
const VEHICLE_REFERENCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const vehicleReferenceCache = new Map();
let otpMailTransportPromise = null;

app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

function createId(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
}

function toTimestamp() {
  return new Date().toLocaleString("en-PH", { hour12: true });
}

function toDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizePromoExpiryMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "date" || normalized === "usage") return normalized;
  return "none";
}

function normalizePromoStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "active") return "Active";
  if (normalized === "expired") return "Expired";
  return "Draft";
}

function normalizePromoDiscountPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, numeric));
}

function parsePromoExpiryDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const parsed = raw.length === 10 ? new Date(`${raw}T23:59:59`) : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function hydratePromo(promo) {
  const basePromo = promo?.toObject ? promo.toObject() : { ...(promo || {}) };
  const expiryMode = normalizePromoExpiryMode(basePromo.expiryMode);
  const normalizedStatus = normalizePromoStatus(basePromo.status);
  const usageLimit = Math.max(0, Number(basePromo.usageLimit) || 0);
  const usageCount = Math.max(0, Number(basePromo.usageCount) || 0);
  const maxUsagePerUser = Math.max(0, Number(basePromo.maxUsagePerUser) || 0);
  const discountPercent = normalizePromoDiscountPercent(basePromo.discountPercent);
  const expiresAt = parsePromoExpiryDate(basePromo.expiresAt);
  const now = Date.now();
  const isDateExpired = expiryMode === "date" && expiresAt ? new Date(expiresAt).getTime() <= now : false;
  const isUsageExpired = expiryMode === "usage" && usageLimit > 0 && usageCount >= usageLimit;
  const isExpired = normalizedStatus === "Expired" || (normalizedStatus !== "Draft" && (isDateExpired || isUsageExpired));
  const status = normalizedStatus === "Draft" ? "Draft" : isExpired ? "Expired" : "Active";

  return {
    ...basePromo,
    expiryMode,
    expiresAt,
    usageLimit,
    usageCount,
    maxUsagePerUser,
    discountPercent,
    remainingUses: usageLimit > 0 ? Math.max(0, usageLimit - usageCount) : null,
    status,
    isExpired,
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

  const promo = await Promo.findOne({ id: normalizedPromoId });
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
  const originalAmount = Math.max(0, Number(amount) || 0);
  const discountPercent = normalizePromoDiscountPercent(promo?.discountPercent);
  const promoDiscountAmount = Number(((originalAmount * discountPercent) / 100).toFixed(2));
  const finalAmount = Number(Math.max(0, originalAmount - promoDiscountAmount).toFixed(2));

  return {
    originalAmount,
    promoId: promo?.id || "",
    promoTitle: promo?.title || "",
    promoDiscountPercent: discountPercent,
    promoDiscountAmount,
    amount: finalAmount,
  };
}

async function incrementPromoUsage(promoId) {
  const normalizedPromoId = String(promoId || "").trim();
  if (!normalizedPromoId) return;
  await Promo.findOneAndUpdate({ id: normalizedPromoId }, { $inc: { usageCount: 1 } });
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

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function isScheduleBlockingStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized !== "completed" && normalized !== "cancelled";
}

function getOverlappingBookingsForSchedule(bookings, durationByService, bookingTime, requestedDuration) {
  const requestedStart = timeToMinutes(bookingTime);
  if (requestedStart === null) return [];
  const requestedEnd = requestedStart + requestedDuration;

  return bookings.filter((booking) => {
    if (!isScheduleBlockingStatus(booking.status)) return false;
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
    if (PLACE_SLOT_OPTIONS.includes(slot)) {
      occupied.add(slot);
    }
  }

  for (const booking of overlappingBookings) {
    const slot = Number(booking.placeSlot || 0);
    if (PLACE_SLOT_OPTIONS.includes(slot)) continue;
    const fallbackSlot = PLACE_SLOT_OPTIONS.find((candidate) => !occupied.has(candidate));
    if (!fallbackSlot) break;
    occupied.add(fallbackSlot);
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

  if (!PLACE_SLOT_OPTIONS.includes(requestedPlaceSlot)) {
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

  const requestedDuration = Math.max(1, Number(selectedService.mins) || 0);
  const sameDayBookings = await Booking.find({ date: bookingDate, ...(bookingId ? { id: { $ne: bookingId } } : {}) }).lean();
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

function createAiUnavailablePayload(feature) {
  return {
    available: false,
    feature,
    message: AI_PROVIDER_UNCONFIGURED_MESSAGE,
    insights: [],
    suggestion: "",
    model: "",
  };
}

const USER_TYPE_DEFAULT_ROLE = {
  admin: "Owner",
  staff: "Mechanic",
  customer: "New",
};

const RESERVED_USER_OVERRIDES = {
  "admin@allprotec.com": { userType: "Admin", role: "Owner" },
  "staff@allprotec.com": { userType: "Staff", role: "Mechanic" },
};

const ROLE_OPTIONS_BY_USER_TYPE = {
  admin: new Set(["owner", "co-owner"]),
  staff: new Set(["mechanic", "inspector", "coordinator"]),
  customer: new Set(["new", "returning"]),
};

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

  const normalizedRole = String(role || "").trim().toLowerCase();
  if (["admin", "owner", "co-owner"].includes(normalizedRole)) return "admin";
  if (["staff", "mechanic", "inspector", "coordinator"].includes(normalizedRole)) return "staff";
  if (["customer", LEGACY_CUSTOMER_ALIAS, "new", "returning"].includes(normalizedRole)) return "customer";
  return "customer";
}

function normalizeSubtype(userType, role) {
  const normalizedUserType = normalizeUserType(userType, role);
  const normalizedRole = String(role || "").trim().toLowerCase();
  const validRoles = ROLE_OPTIONS_BY_USER_TYPE[normalizedUserType];

  if (validRoles?.has(normalizedRole)) {
    return normalizedRole;
  }

  return String(USER_TYPE_DEFAULT_ROLE[normalizedUserType] || "New").toLowerCase();
}

function toDisplayUserType(userType, role) {
  return toTitleCase(normalizeUserType(userType, role));
}

function toDisplaySubtype(userType, role) {
  const label = toTitleCase(normalizeSubtype(userType, role));
  return label === "Co Owner" ? "Co-Owner" : label;
}

function buildAuthPayload(user) {
  const userType = normalizeUserType(user.userType, user.role);
  return {
    token: `${userType}-session`,
    user: {
      id: user.id,
      email: user.email,
      userType,
      role: normalizeSubtype(user.userType, user.role),
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

function sanitizeUser(user) {
  if (!user) return user;
  const serializedUser = typeof user.toObject === "function" ? user.toObject() : { ...user };
  delete serializedUser.password;
  return serializedUser;
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

async function getOtpMailTransport() {
  if (!GOOGLE_SMTP_EMAIL || !GOOGLE_SMTP_APP_PASSWORD || !GOOGLE_SMTP_FROM) {
    const error = new Error(
      "Google SMTP is not configured. Add GOOGLE_SMTP_EMAIL, GOOGLE_SMTP_APP_PASSWORD, and GOOGLE_SMTP_FROM to the server environment."
    );
    error.statusCode = 503;
    throw error;
  }

  if (!otpMailTransportPromise) {
    otpMailTransportPromise = (async () => {
      const transport = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: GOOGLE_SMTP_EMAIL,
          pass: GOOGLE_SMTP_APP_PASSWORD,
        },
      });

      await transport.verify();
      return transport;
    })().catch((error) => {
      otpMailTransportPromise = null;
      throw error;
    });
  }

  return otpMailTransportPromise;
}

async function sendSignupOtpEmail({ email, otp }) {
  try {
    const transport = await getOtpMailTransport();

    await transport.sendMail({
      from: GOOGLE_SMTP_FROM,
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
    const serviceError = new Error(
      "Could not send the signup OTP email. Check your Google SMTP credentials and app password."
    );
    serviceError.statusCode = 503;
    throw serviceError;
  }

  return {
    channel: "email",
    destination: maskEmail(email),
  };
}

async function sendPasswordChangeOtpEmail({ email, otp }) {
  const transport = await getOtpMailTransport();

  try {
    await transport.sendMail({
      from: GOOGLE_SMTP_FROM,
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
    console.error("Failed to send password change OTP email:", error);
    const wrappedError = new Error(
      "Could not send the password change OTP email. Check your Google SMTP credentials and app password."
    );
    wrappedError.statusCode = 503;
    throw wrappedError;
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
  return {
    ...baseService,
    price: Math.max(0, Number(baseService.price) || priceBySize.sedanSmallCar || 0),
    priceBySize,
    consumablesBySize,
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
  return String(status || "").trim().toLowerCase() === "in progress";
}

function isCompletedStatus(status) {
  return String(status || "").trim().toLowerCase() === "completed";
}

function isPaidStatus(status) {
  return String(status || "").trim().toLowerCase() === "paid";
}

function normalizePaymentMethodLabel(method) {
  const normalized = String(method || "").trim();
  if (!normalized) return "";

  const lowered = normalized.toLowerCase();
  if (lowered === "gcash" || lowered === "e-wallet" || lowered === "ewallet") {
    return "E-Wallet";
  }

  return normalized;
}

async function migratePaymentMethods() {
  await Payment.updateMany(
    {
      method: {
        $in: ["GCash", "gcash", "Gcash", "Ewallet", "ewallet", "e-wallet"],
      },
    },
    { $set: { method: "E-Wallet" } }
  );
}

async function ensureBookingCommission(booking, auditUser) {
  const bookingId = String(booking?.id || "").trim();
  const workerName = String(booking?.assigned || "").trim();
  if (!bookingId || !workerName) return null;

  const existingCommission = await Commission.findOne({ bookingId }).lean();
  if (existingCommission) return existingCommission;

  const workers = await User.find({}).lean();
  const worker = workers.find((user) =>
    String(user.name || "").trim().toLowerCase() === workerName.toLowerCase()
  );

  if (!worker || normalizeUserType(worker.userType, worker.role) !== "staff") {
    return null;
  }

  const serviceValue = Number(booking.amount || 0);
  if (serviceValue <= 0) return null;

  const commission = await Commission.create({
    id: createId("C"),
    bookingId,
    date: booking.date || toDateKey(),
    worker: worker.name || workerName,
    role: toDisplaySubtype(worker.userType, worker.role),
    service: booking.service || "",
    serviceValue,
    rate: 10,
    earned: Number((serviceValue * 0.1).toFixed(2)),
    status: "Pending",
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
        role: "Owner",
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
        role: "Mechanic",
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

async function migratePlaintextPasswords() {
  const usersWithPlaintextPasswords = await User.find({
    password: { $exists: true, $ne: "" },
  });

  await Promise.all(
    usersWithPlaintextPasswords.map(async (user) => {
      if (isPasswordHash(user.password)) return;
      user.password = hashPassword(user.password);
      await user.save();
    })
  );
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
      note: `${commission.service || "Completed service"} commission at ${commission.rate || 10}%`,
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
    user.userType = "Customer";
  }
  if (String(user.role || "").trim() !== nextRole) {
    user.role = nextRole;
    await user.save();
  }
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
  const [bookings, services, stockMonitoring, payments, users, auditLogs, archivedAuditLogs, reviews, promos, quoteRequests, expenses, commissions] = await Promise.all([
    Booking.find().sort({ createdAt: -1 }).lean(),
    Service.find().sort({ createdAt: -1 }).lean(),
    StockMonitoringItem.find().sort({ createdAt: -1 }).lean(),
    Payment.find().sort({ createdAt: -1 }).lean(),
    User.find().sort({ createdAt: -1 }).lean(),
    AuditLog.find({ archived: { $ne: true } }).sort({ createdAt: -1 }).limit(100).lean(),
    AuditLog.find({ archived: true }).sort({ archivedAt: -1, createdAt: -1 }).limit(100).lean(),
    Review.find().sort({ createdAt: -1 }).lean(),
    Promo.find().sort({ createdAt: -1 }).lean(),
    QuoteRequest.find().sort({ createdAt: -1 }).limit(25).lean(),
    Expense.find().sort({ date: -1, createdAt: -1 }).lean(),
    Commission.find().sort({ date: -1, createdAt: -1 }).lean(),
  ]);

  const lowStockCount = stockMonitoring.filter((item) => item.maxStock && item.currentStock / item.maxStock <= 0.25).length;
  const inProgressCount = bookings.filter((booking) => String(booking.status || "").toLowerCase().includes("progress")).length;
  const completedCount = bookings.filter((booking) => String(booking.status || "").toLowerCase() === "completed").length;
  const cancelledCount = bookings.filter((booking) => String(booking.status || "").toLowerCase() === "cancelled").length;
  const paidRevenue = payments.filter((payment) => String(payment.status || "").toLowerCase() === "paid").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const alerts = [];
  if (lowStockCount > 0) {
    alerts.push({ title: "Low stock items", description: String(lowStockCount) + " stock monitoring item(s) need restocking." });
  }
  if (bookings.length === 0) {
    alerts.push({ title: "No bookings yet", description: "Create your first booking to start building the dashboard." });
  }
  if (!alerts.length) {
    alerts.push({ title: "All systems good", description: "No urgent admin alerts right now." });
  }

  return {
    bookings,
    services: services.map((service) => hydrateService(service)),
    stockMonitoring,
    payments,
    users: users.map((user) => sanitizeUser(user)),
    auditLogs,
    archivedAuditLogs,
    reviews,
    promos: promos.map((promo) => hydratePromo(promo)),
    quoteRequests,
    expenses,
    commissions,
    alerts,
    summary: {
      bookingsToday: bookings.filter((booking) => booking.date === toDateKey()).length,
      inProgressCount,
      lowStockCount,
      paidRevenue,
      totalSchedules: bookings.length,
      completedCount,
      cancelledCount,
      quoteRequestCount: quoteRequests.length,
    },
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/", (_req, res) => {
  res.redirect(CLIENT_APP_URL);
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

app.get("/api/admin/bootstrap", async (_req, res, next) => {
  try {
    res.json(await loadBootstrapData());
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

    const matchedService = await Service.findOne({ name: serviceName }).lean();
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
      status: "New",
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

app.post("/api/admin/analytics/interpretation", async (req, res, next) => {
  try {
    res.json(createAiUnavailablePayload("analytics-interpretation"));
  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    next(error);
  }
});

app.post("/api/admin/financials/interpretation", async (req, res, next) => {
  try {
    res.json(createAiUnavailablePayload("financial-interpretation"));
  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    next(error);
  }
});

app.get("/api/tracking/:id", async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ id: req.params.id }).lean();

    if (!booking) {
      res.status(404).json({ message: "Tracking record not found." });
      return;
    }

    res.json({
      id: booking.id,
      customer: booking.customer,
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
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await User.findOne({ email });

    if (!user || !verifyPassword(password, user.password)) {
      await recordAudit(email || "guest", "Failed sign in", email || "LOGIN", { email });
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    if (!isPasswordHash(user.password)) {
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

app.post("/api/admin/bookings", async (req, res, next) => {
  try {
    const bookingDate = String(req.body.date || "").trim();

    if (isPastDateKey(bookingDate)) {
      res.status(400).json({ message: "Booking date cannot be in the past." });
      return;
    }

    await validateBookingSlotAvailability({
      date: bookingDate,
      time: req.body.time,
      service: req.body.service,
      placeSlot: req.body.placeSlot,
    });

    const promoResolution = await resolvePromoById(req.body.promoId).catch((error) => {
      if (!String(req.body.promoId || "").trim()) return null;
      throw error;
    });
    await enforcePromoUsagePerUserLimit({
      promo: promoResolution?.hydratedPromo || null,
      promoId: promoResolution?.hydratedPromo?.id || "",
      customerEmail: req.body.customerEmail,
      customerName: req.body.customer,
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

    const booking = await Booking.create({
      id: createId("B"),
      plate: "",
      ...req.body,
      ...pricing,
      consumablesApplied: Boolean(req.body.consumablesApplied) || isCompletedStatus(req.body.status),
    });

    await Payment.create({
      id: createId("PAY"),
      bookingId: booking.id,
      date: booking.date,
      customer: booking.customer,
      customerEmail: booking.customerEmail || "",
      service: booking.service,
      amount: Number(booking.amount || 0),
      originalAmount: Number(booking.originalAmount || 0),
      promoId: booking.promoId || "",
      promoTitle: booking.promoTitle || "",
      promoDiscountPercent: Number(booking.promoDiscountPercent || 0),
      promoDiscountAmount: Number(booking.promoDiscountAmount || 0),
      status: "Pending",
      method: "",
    });

    if (booking.promoId) {
      await incrementPromoUsage(booking.promoId);
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

app.put("/api/admin/bookings/:id", async (req, res, next) => {
  try {
    const existingBooking = await Booking.findOne({ id: req.params.id });

    if (!existingBooking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    const bookingDate = String(req.body.date || existingBooking.date || "").trim();

    if (isPastDateKey(bookingDate)) {
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

    await validateBookingSlotAvailability({
      bookingId: req.params.id,
      date: bookingDate,
      time: req.body.time || existingBooking.time,
      service: req.body.service || existingBooking.service,
      placeSlot: req.body.placeSlot || existingBooking.placeSlot,
    });

    const nextPromoId = String(req.body.promoId || "").trim();
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
    const shouldApplyConsumables =
      isCompletedStatus(req.body.status) &&
      !existingBooking.consumablesApplied;
    const shouldCreateCommission =
      isCompletedStatus(req.body.status) &&
      !isCompletedStatus(existingBooking.status);

    const updatePayload = {
      ...req.body,
      ...computePromoPricing(
        baseAmount,
        promoResolution?.hydratedPromo || null
      ),
      consumablesApplied: existingBooking.consumablesApplied || shouldApplyConsumables,
    };

    const booking = await Booking.findOneAndUpdate({ id: req.params.id }, updatePayload, { new: true });

    if (previousPromoId && previousPromoId !== booking.promoId) {
      await decrementPromoUsage(previousPromoId);
    }
    if (booking.promoId && previousPromoId !== booking.promoId) {
      await incrementPromoUsage(booking.promoId);
    }

    await Payment.findOneAndUpdate(
      { bookingId: booking.id },
      {
        date: booking.date,
        customer: booking.customer,
        customerEmail: booking.customerEmail || "",
        service: booking.service,
        amount: Number(booking.amount || 0),
        originalAmount: Number(booking.originalAmount || 0),
        promoId: booking.promoId || "",
        promoTitle: booking.promoTitle || "",
        promoDiscountPercent: Number(booking.promoDiscountPercent || 0),
        promoDiscountAmount: Number(booking.promoDiscountAmount || 0),
      }
    );

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

app.delete("/api/admin/bookings/:id", async (req, res, next) => {
  try {
    await Booking.findOneAndDelete({ id: req.params.id });
    await Payment.findOneAndDelete({ bookingId: req.params.id });
    await recordAudit(req.query.auditUser, "Deleted booking", req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/services", async (req, res, next) => {
  try {
    const priceBySize = buildServicePriceBySize(req.body.priceBySize, req.body.price);
    const consumablesBySize = buildServiceConsumablesBySize(req.body.consumablesBySize, req.body.consumables);
    const payload = {
      ...req.body,
      serviceType: normalizeServiceType(req.body.serviceType, req.body.name, req.body.desc),
      price: Math.max(0, Number(req.body.price) || priceBySize.sedanSmallCar || 0),
      priceBySize,
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

app.put("/api/admin/services/:id", async (req, res, next) => {
  try {
    const service = await Service.findOne({ id: req.params.id });
    const existingService = service?.toObject ? service.toObject() : null;
    if (!service) {
      const error = new Error("Service not found.");
      error.statusCode = 404;
      throw error;
    }

    const priceBySize = buildServicePriceBySize(req.body.priceBySize, req.body.price ?? existingService?.price);
    const consumablesBySize = buildServiceConsumablesBySize(
      req.body.consumablesBySize,
      req.body.consumables ?? existingService?.consumables
    );
    const payload = {
      ...req.body,
      serviceType: normalizeServiceType(req.body.serviceType, req.body.name, req.body.desc),
      price: Math.max(0, Number(req.body.price) || priceBySize.sedanSmallCar || 0),
      priceBySize,
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

app.delete("/api/admin/services/:id", async (req, res, next) => {
  try {
    await Service.findOneAndDelete({ id: req.params.id });
    await recordAudit(req.body?.auditUser || req.query.auditUser, "Deleted service", req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/stock-monitoring", async (req, res, next) => {
  try {
    const item = await StockMonitoringItem.create({ id: createId("INV"), ...req.body });
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

app.put("/api/admin/stock-monitoring/:id", async (req, res, next) => {
  try {
    const item = await StockMonitoringItem.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
    await recordAudit(req.body.auditUser, "Updated stock monitoring item", req.params.id);
    res.json(item);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/stock-monitoring/:id/restock", async (req, res, next) => {
  try {
    const item = await StockMonitoringItem.findOne({ id: req.params.id });
    if (!item) {
      res.status(404).json({ message: "Stock monitoring item not found" });
      return;
    }

    const qtyToAdd = Number(req.body.qtyToAdd || 0);
    item.currentStock += qtyToAdd;
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

app.delete("/api/admin/stock-monitoring/:id", async (req, res, next) => {
  try {
    await StockMonitoringItem.findOneAndDelete({ id: req.params.id });
    await recordAudit(req.query.auditUser, "Deleted stock monitoring item", req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/payments/:id", async (req, res, next) => {
  try {
    const existingPayment = await Payment.findOne({ id: req.params.id }).lean();
    if (!existingPayment) {
      res.status(404).json({ message: "Payment not found" });
      return;
    }

    if (
      isPaidStatus(existingPayment.status) &&
      Object.prototype.hasOwnProperty.call(req.body, "status") &&
      !isPaidStatus(req.body.status)
    ) {
      res.status(400).json({ message: "Paid payments can no longer change status." });
      return;
    }

    const actorEmail = String(req.body.auditUser || "").trim().toLowerCase();
    const customerEmail = String(existingPayment.customerEmail || "").trim().toLowerCase();
    const isCustomerSubmittingOwnPayment = Boolean(actorEmail && customerEmail && actorEmail === customerEmail);
    const nextStatus = String(req.body.status || "");
    const reviewFields =
      nextStatus === "Paid" || nextStatus === "Rejected"
        ? {
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.body.auditUser || "",
          }
        : {};
    const nextPayload = isCustomerSubmittingOwnPayment
      ? { ...req.body, ...reviewFields, method: normalizePaymentMethodLabel(req.body.method) }
      : {
          ...req.body,
          ...reviewFields,
          method: normalizePaymentMethodLabel(existingPayment.method),
          reference: existingPayment.reference || "",
        };

    const payment = await Payment.findOneAndUpdate(
      { id: req.params.id },
      nextPayload,
      { new: true }
    );
    await recordAudit(
      req.body.auditUser,
      getPaymentAuditAction(existingPayment, nextPayload),
      req.params.id,
      {
        status: payment?.status || req.body.status || "",
        method: payment?.method || req.body.method || "",
        bookingId: payment?.bookingId || existingPayment?.bookingId || "",
      }
    );
    res.json(payment);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/issue-note-suggestion", async (req, res, next) => {
  try {
    res.json(createAiUnavailablePayload("issue-note-suggestion"));
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/users/:id", async (req, res, next) => {
  try {
    const existingUser = await User.findOne({ id: req.params.id }).lean();
    const nextUserType = toDisplayUserType(req.body.userType, req.body.role);
    const payload = {
      ...req.body,
      userType: nextUserType,
      role: toDisplaySubtype(nextUserType, req.body.role),
      name: req.body.name || (String(req.body.first || "") + " " + String(req.body.last || "")).trim(),
    };

    if (nextUserType === "Customer") {
      const bookingCount = await Booking.countDocuments({ customerEmail: String(req.body.email || "").trim().toLowerCase() });
      payload.role = bookingCount >= 2 ? "Returning" : "New";
      payload.cars = normalizeCustomerCars(req.body.cars);
    } else {
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
    await recordAudit(req.body.auditUser, getUserAuditAction(existingUser, payload), req.params.id, {
      email: payload.email,
      status: payload.status,
    });
    res.json(sanitizeUser(user));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/users/:id", async (req, res, next) => {
  try {
    await User.findOneAndDelete({ id: req.params.id });
    await recordAudit(req.query.auditUser, "Deleted user", req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/audit-logs/archive", async (req, res, next) => {
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

app.post("/api/admin/audit-logs/unarchive", async (req, res, next) => {
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

app.post("/api/admin/reviews", async (req, res, next) => {
  try {
    const review = await Review.create({
      id: createId("REV"),
      customer: req.body.customer || "Customer",
      customerEmail: req.body.customerEmail || "",
      rating: Number(req.body.rating || 5),
      comment: req.body.comment || "",
    });
    await recordAudit(req.body.auditUser, "Created review", review.id, { customer: review.customer });
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/promos", async (req, res, next) => {
  try {
    const title = String(req.body.title || "").trim();
    const message = String(req.body.message || "").trim();
    const status = normalizePromoStatus(req.body.status || "Draft");
    const expiryMode = normalizePromoExpiryMode(req.body.expiryMode);
    const expiresAt = parsePromoExpiryDate(req.body.expiresAt);
    const usageLimit = Math.max(0, Number(req.body.usageLimit) || 0);
    const maxUsagePerUser = Math.max(0, Number(req.body.maxUsagePerUser) || 0);
    const discountPercent = normalizePromoDiscountPercent(req.body.discountPercent);

    if (!title) {
      res.status(400).json({ message: "Promo title is required." });
      return;
    }

    if (!message) {
      res.status(400).json({ message: "Promo message is required." });
      return;
    }

    if (discountPercent <= 0) {
      res.status(400).json({ message: "A discount percentage greater than zero is required." });
      return;
    }

    if (expiryMode === "date" && !expiresAt) {
      res.status(400).json({ message: "An expiry date is required for time-limited promos." });
      return;
    }

    if (expiryMode === "usage" && usageLimit <= 0) {
      res.status(400).json({ message: "A usage limit greater than zero is required for usage-limited promos." });
      return;
    }

    if (maxUsagePerUser <= 0) {
      res.status(400).json({ message: "A maximum usage per user greater than zero is required." });
      return;
    }

    const promo = await Promo.create({
      id: createId("PRO"),
      title,
      message,
      status,
      scheduledFor: String(req.body.scheduledFor || "").trim(),
      expiryMode,
      expiresAt,
      usageLimit: expiryMode === "usage" ? usageLimit : 0,
      usageCount: 0,
      maxUsagePerUser,
      discountPercent,
    });

    await recordAudit(req.body.auditUser, "Created promo", promo.id, {
      title: promo.title,
      status: promo.status,
      expiryMode,
      expiresAt,
      usageLimit: expiryMode === "usage" ? usageLimit : 0,
      maxUsagePerUser,
      discountPercent,
    });

    res.status(201).json(hydratePromo(promo));
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/promos/:id", async (req, res, next) => {
  try {
    const existingPromo = await Promo.findOne({ id: req.params.id });
    if (!existingPromo) {
      res.status(404).json({ message: "Promo not found." });
      return;
    }

    const title = String(req.body.title || "").trim();
    const message = String(req.body.message || "").trim();
    const status = normalizePromoStatus(req.body.status || existingPromo.status || "Draft");
    const expiryMode = normalizePromoExpiryMode(req.body.expiryMode || existingPromo.expiryMode);
    const expiresAt = parsePromoExpiryDate(req.body.expiresAt ?? existingPromo.expiresAt);
    const usageLimit = Math.max(0, Number(req.body.usageLimit ?? existingPromo.usageLimit) || 0);
    const maxUsagePerUser = Math.max(0, Number(req.body.maxUsagePerUser ?? existingPromo.maxUsagePerUser) || 0);
    const discountPercent = normalizePromoDiscountPercent(
      req.body.discountPercent ?? existingPromo.discountPercent
    );

    if (!title) {
      res.status(400).json({ message: "Promo title is required." });
      return;
    }

    if (!message) {
      res.status(400).json({ message: "Promo message is required." });
      return;
    }

    if (discountPercent <= 0) {
      res.status(400).json({ message: "A discount percentage greater than zero is required." });
      return;
    }

    if (expiryMode === "date" && !expiresAt) {
      res.status(400).json({ message: "An expiry date is required for time-limited promos." });
      return;
    }

    if (expiryMode === "usage" && usageLimit <= 0) {
      res.status(400).json({ message: "A usage limit greater than zero is required for usage-limited promos." });
      return;
    }

    if (maxUsagePerUser <= 0) {
      res.status(400).json({ message: "A maximum usage per user greater than zero is required." });
      return;
    }

    const promo = await Promo.findOneAndUpdate(
      { id: req.params.id },
      {
        title,
        message,
        status,
        scheduledFor: String(req.body.scheduledFor || existingPromo.scheduledFor || "").trim(),
        expiryMode,
        expiresAt: expiryMode === "date" ? expiresAt : "",
        usageLimit: expiryMode === "usage" ? usageLimit : 0,
        maxUsagePerUser,
        discountPercent,
      },
      { new: true }
    );

    await recordAudit(req.body.auditUser, "Updated promo", promo.id, {
      title: promo.title,
      status: promo.status,
      expiryMode,
      expiresAt: promo.expiresAt || "",
      usageLimit: promo.usageLimit || 0,
      maxUsagePerUser: promo.maxUsagePerUser || 0,
      discountPercent,
    });

    res.json(hydratePromo(promo));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/promos/:id/use", async (req, res, next) => {
  try {
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

app.post("/api/admin/expenses", async (req, res, next) => {
  try {
    const expense = await Expense.create({
      id: createId("E"),
      date: req.body.date || new Date().toISOString().slice(0, 10),
      description: req.body.description || "",
      note: req.body.note || "",
      category: req.body.category === "Stock Monitoring" ? "Supplies" : (req.body.category || "Materials"),
      amount: Number(req.body.amount || 0),
      paidBy: req.body.paidBy || "",
    });
    await recordAudit(req.body.auditUser, "Created expense", expense.id, {
      category: expense.category,
      amount: expense.amount,
      description: expense.description,
    });
    res.status(201).json(expense);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/commissions", async (_req, res) => {
  res.status(403).json({ message: "Commission entries are generated automatically when a staff-assigned booking is marked completed." });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: error.message || "Unexpected server error" });
});

async function start() {
  await connectToDatabase();
  await migrateStockMonitoringCollection();
  await ensureSeedData();
  await migrateServiceTypes();
  await migrateServicePricing();
  await migrateServiceConsumablesBySize();
  await clearSeededServiceConsumables();
  await removeSeededEngagementData();
  await migrateUsersToUserTypes();
  await migrateCustomerCars();
  await migratePromoChannels();
  await migratePlaintextPasswords();
  await migratePaymentMethods();
  await migrateExpenseCategories();
  await backfillAutomaticExpenses();
  app.listen(PORT, () => {
    console.log("API listening on http://localhost:" + PORT);
  });
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
