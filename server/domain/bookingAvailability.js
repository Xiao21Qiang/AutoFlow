const { normalizeBookingStatus } = require("./bookingStatus");
const { isPaidStatus, isFullPaymentPlan, normalizePaymentStageStatus } = require("./payments");

const DAILY_BOOKING_CAPACITY = 8;

function clampAvailableSlots(value, capacity = DAILY_BOOKING_CAPACITY) {
  const safeCapacity = Math.max(0, Number(capacity || 0) || 0);
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return safeCapacity;
  return Math.min(safeCapacity, Math.max(0, numericValue));
}

function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function buildPaymentByBookingId(payments = []) {
  const lookup = new Map();
  for (const payment of payments || []) {
    const bookingId = String(payment?.bookingId || "").trim();
    if (bookingId && !lookup.has(bookingId)) lookup.set(bookingId, payment);
  }
  return lookup;
}

function isDownPaymentSatisfiedForCapacity(payment = {}) {
  if (!payment) return false;
  const downPaymentStatus = normalizePaymentStageStatus(
    payment.downPaymentStatus,
    payment.downPaymentRequired === false ? "Not Required" : "Pending"
  );
  const finalPaymentStatus = normalizePaymentStageStatus(payment.finalPaymentStatus, payment.status || "Pending");
  return (
    downPaymentStatus === "Paid" ||
    (isFullPaymentPlan(payment) && (finalPaymentStatus === "Paid" || isPaidStatus(payment.status)))
  );
}

function bookingConsumesDailyCapacity(booking = {}, payment = null) {
  const status = normalizeBookingStatus(booking.status, "");
  if (!isValidDateKey(booking.date)) return false;
  if (status === "Cancelled") return false;
  if (status === "Completed" && booking.warrantyReleased === true) return false;

  if (payment?.downPaymentRequired === false) {
    return status === "Scheduled" || status === "In Progress" || status === "Completed";
  }

  return isDownPaymentSatisfiedForCapacity(payment);
}

function buildCustomerBookingAvailability({ bookings = [], payments = [], capacity = DAILY_BOOKING_CAPACITY } = {}) {
  const safeCapacity = Math.max(0, Number(capacity || DAILY_BOOKING_CAPACITY) || DAILY_BOOKING_CAPACITY);
  const paymentByBookingId = buildPaymentByBookingId(payments);
  const reservedByDate = new Map();

  for (const booking of bookings || []) {
    const dateKey = String(booking?.date || "").trim();
    if (!isValidDateKey(dateKey)) continue;
    const payment = paymentByBookingId.get(String(booking?.id || "").trim()) || null;
    if (!bookingConsumesDailyCapacity(booking, payment)) continue;
    reservedByDate.set(dateKey, (reservedByDate.get(dateKey) || 0) + 1);
  }

  const byDate = {};
  for (const [dateKey, reservedSlots] of reservedByDate.entries()) {
    const safeReserved = Math.max(0, Number(reservedSlots || 0) || 0);
    byDate[dateKey] = {
      availableSlots: clampAvailableSlots(safeCapacity - safeReserved, safeCapacity),
    };
  }

  return {
    maxDailyCapacity: safeCapacity,
    byDate,
  };
}

function getAvailableSlotsForDate(availability = {}, dateKey = "") {
  const capacity = Math.max(0, Number(availability.maxDailyCapacity || DAILY_BOOKING_CAPACITY) || DAILY_BOOKING_CAPACITY);
  const value = availability.byDate?.[dateKey]?.availableSlots;
  return value === undefined ? capacity : clampAvailableSlots(value, capacity);
}

module.exports = {
  DAILY_BOOKING_CAPACITY,
  bookingConsumesDailyCapacity,
  buildCustomerBookingAvailability,
  clampAvailableSlots,
  getAvailableSlotsForDate,
  isDownPaymentSatisfiedForCapacity,
};
