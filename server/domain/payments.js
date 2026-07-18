const { normalizeBookingStatus } = require("./bookingStatus");
const { clampTinyNegativeMoney, nonNegativeMoney, roundMoney, toFiniteNumber } = require("./money");

const PAYMENT_STAGE_STATUSES = Object.freeze([
  "Not Required",
  "Pending",
  "For Verification",
  "Paid",
  "Rejected",
  "Failed",
]);

const PAID_STAGE_STATUSES = new Set(["paid", "verified", "confirmed", "confirmed paid", "verified paid"]);
const REVIEW_STAGE_STATUSES = new Set(["for verification", "submitted", "under review", "pending review"]);
const REJECTED_STAGE_STATUSES = new Set(["rejected", "declined"]);
const FAILED_STAGE_STATUSES = new Set(["failed", "invalid"]);

function normalizePaymentStageStatus(status, fallback = "Pending") {
  const normalized = String(status || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (normalized === "not required") return "Not Required";
  if (!normalized) return fallback;
  if (PAID_STAGE_STATUSES.has(normalized)) return "Paid";
  if (REVIEW_STAGE_STATUSES.has(normalized)) return "For Verification";
  if (REJECTED_STAGE_STATUSES.has(normalized)) return "Rejected";
  if (FAILED_STAGE_STATUSES.has(normalized)) return "Failed";
  if (normalized === "pending" || normalized === "unpaid") return "Pending";
  return fallback;
}

function isPaidStatus(status) {
  return normalizePaymentStageStatus(status, "") === "Paid";
}

function getPaymentFinalAmountDue(payment = {}, booking = {}) {
  const candidates = [
    payment.finalAmount,
    payment.totalAmount,
    payment.amount,
    booking.finalAmount,
    booking.amount,
    payment.originalAmount,
    booking.originalAmount,
  ];
  for (const candidate of candidates) {
    const amount = toFiniteNumber(candidate, NaN);
    if (Number.isFinite(amount) && amount > 0) return nonNegativeMoney(amount);
  }
  return 0;
}

function hasMeaningfulStagedPayment(payment = {}) {
  return Boolean(
    payment.downPaymentRequired === true ||
    Object.prototype.hasOwnProperty.call(payment, "downPaymentAmount") ||
    String(payment.downPaymentStatus || "").trim() ||
    String(payment.finalPaymentStatus || "").trim() ||
    Object.prototype.hasOwnProperty.call(payment, "totalAmount") ||
    Object.prototype.hasOwnProperty.call(payment, "amountPaid")
  );
}

function getStageDate(payment = {}, fields = []) {
  for (const field of fields) {
    const raw = payment[field];
    if (!raw) continue;
    const date = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(date.getTime())) return date;
  }
  for (const raw of [payment.date, payment.reviewedAt, payment.updatedAt, payment.createdAt]) {
    if (!raw) continue;
    const normalized = String(raw).trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? new Date(`${normalized}T00:00:00`)
      : new Date(raw);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function getVerifiedRevenueEventsForPayment(payment = {}, booking = {}) {
  const totalAmount = getPaymentFinalAmountDue(payment, booking);
  const downPaymentAmount = Math.min(totalAmount, nonNegativeMoney(payment.downPaymentAmount));
  const downPaymentStatus = normalizePaymentStageStatus(
    payment.downPaymentStatus,
    payment.downPaymentRequired === false ? "Not Required" : "Pending"
  );
  const finalPaymentStatus = normalizePaymentStageStatus(payment.finalPaymentStatus, payment.status || "Pending");
  const legacyStatus = normalizePaymentStageStatus(payment.status, "Pending");
  const events = [];
  const baseId = String(payment.id || payment.bookingId || booking.id || "payment").trim();

  if (downPaymentStatus === "Paid" && downPaymentAmount > 0) {
    events.push({
      id: `${baseId}:downPayment`,
      paymentId: payment.id || "",
      bookingId: payment.bookingId || booking.id || "",
      stage: "Down Payment",
      amount: downPaymentAmount,
      date: getStageDate(payment, ["downPaymentVerifiedAt"]),
      customer: payment.customer || booking.customer || payment.customerEmail || booking.customerEmail || "Customer",
      bookingStatus: normalizeBookingStatus(booking.status || payment.bookingStatus || "", ""),
    });
  }

  if (finalPaymentStatus === "Paid") {
    const finalAmount = downPaymentStatus === "Paid" ? Math.max(0, totalAmount - downPaymentAmount) : totalAmount;
    if (finalAmount > 0) {
      events.push({
        id: `${baseId}:finalPayment`,
        paymentId: payment.id || "",
        bookingId: payment.bookingId || booking.id || "",
        stage: downPaymentStatus === "Paid" ? "Remaining Balance" : "Full Payment",
        amount: roundMoney(finalAmount),
        date: getStageDate(payment, ["finalPaymentVerifiedAt", "reviewedAt"]),
        customer: payment.customer || booking.customer || payment.customerEmail || booking.customerEmail || "Customer",
        bookingStatus: normalizeBookingStatus(booking.status || payment.bookingStatus || "", ""),
      });
    }
  }

  if (legacyStatus === "Paid" && finalPaymentStatus !== "Paid") {
    const staged = hasMeaningfulStagedPayment(payment);
    const legacyAmount = staged && downPaymentStatus === "Paid"
      ? Math.max(0, totalAmount - downPaymentAmount)
      : totalAmount || nonNegativeMoney(payment.amount);
    if (legacyAmount > 0) {
      events.push({
        id: `${baseId}:legacyPaid`,
        paymentId: payment.id || "",
        bookingId: payment.bookingId || booking.id || "",
        stage: "Legacy Paid Payment",
        amount: roundMoney(legacyAmount),
        date: getStageDate(payment, ["reviewedAt"]),
        customer: payment.customer || booking.customer || payment.customerEmail || booking.customerEmail || "Customer",
        bookingStatus: normalizeBookingStatus(booking.status || payment.bookingStatus || "", ""),
      });
    }
  }

  return events.filter((event) => event.amount > 0);
}

function getVerifiedPaidAmount(payment = {}, booking = {}) {
  return roundMoney(getVerifiedRevenueEventsForPayment(payment, booking).reduce((sum, event) => sum + event.amount, 0));
}

function getActiveRecognizedRevenue(payment = {}, booking = {}) {
  if (normalizeBookingStatus(booking.status || payment.bookingStatus || "", "") === "Cancelled") return 0;
  return getVerifiedPaidAmount(payment, booking);
}

function getHistoricalRecognizedRevenue(payment = {}, booking = {}) {
  return getVerifiedPaidAmount(payment, booking);
}

function getOutstandingBalance(payment = {}, booking = {}) {
  const finalAmountDue = getPaymentFinalAmountDue(payment, booking);
  const verifiedPaid = getVerifiedPaidAmount(payment, booking);
  return clampTinyNegativeMoney(finalAmountDue - verifiedPaid);
}

function normalizePaymentStageFields(payment = {}, booking = {}) {
  const source = typeof payment.toObject === "function" ? payment.toObject() : { ...payment };
  const totalAmount = getPaymentFinalAmountDue(source, booking);
  const downPaymentRequired = typeof source.downPaymentRequired === "boolean" ? source.downPaymentRequired : false;
  const downPaymentAmount = Math.min(totalAmount, nonNegativeMoney(source.downPaymentAmount));
  const downPaymentStatus = downPaymentRequired
    ? normalizePaymentStageStatus(source.downPaymentStatus, normalizePaymentStageStatus(source.status, "Pending"))
    : "Not Required";
  const finalPaymentStatus = normalizePaymentStageStatus(source.finalPaymentStatus, normalizePaymentStageStatus(source.status, "Pending"));
  const verifiedPaidAmount = getVerifiedPaidAmount({ ...source, totalAmount, downPaymentRequired, downPaymentAmount, downPaymentStatus, finalPaymentStatus }, booking);
  const outstandingBalance = getOutstandingBalance({ ...source, totalAmount, downPaymentRequired, downPaymentAmount, downPaymentStatus, finalPaymentStatus }, booking);

  return {
    ...source,
    downPaymentRequired,
    downPaymentAmount,
    downPaymentStatus,
    totalAmount,
    finalPaymentStatus,
    amountPaid: verifiedPaidAmount,
    remainingBalance: outstandingBalance,
    recognizedRevenue: verifiedPaidAmount,
    historicalRecognizedRevenue: getHistoricalRecognizedRevenue({ ...source, totalAmount, downPaymentRequired, downPaymentAmount, downPaymentStatus, finalPaymentStatus }, booking),
    activeRecognizedRevenue: getActiveRecognizedRevenue({ ...source, totalAmount, downPaymentRequired, downPaymentAmount, downPaymentStatus, finalPaymentStatus }, booking),
    outstandingBalance,
  };
}

function isPaymentFullyPaid(payment = {}, booking = {}) {
  return getOutstandingBalance(payment, booking) <= 0 && getPaymentFinalAmountDue(payment, booking) > 0;
}

module.exports = {
  PAYMENT_STAGE_STATUSES,
  getActiveRecognizedRevenue,
  getHistoricalRecognizedRevenue,
  getOutstandingBalance,
  getPaymentFinalAmountDue,
  getStageDate,
  getVerifiedPaidAmount,
  getVerifiedRevenueEventsForPayment,
  hasMeaningfulStagedPayment,
  isPaidStatus,
  isPaymentFullyPaid,
  normalizePaymentStageFields,
  normalizePaymentStageStatus,
};
