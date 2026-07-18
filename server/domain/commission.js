const { isCompletedBookingStatus } = require("./bookingStatus");
const { getVerifiedPaidAmount } = require("./payments");
const { nonNegativeMoney, roundMoney } = require("./money");

const DEFAULT_COMMISSION_RATE_PERCENT = 10;

function normalizeCommissionRate(rate = DEFAULT_COMMISSION_RATE_PERCENT) {
  const number = Number(rate);
  if (!Number.isFinite(number) || number < 0) return DEFAULT_COMMISSION_RATE_PERCENT;
  return number;
}

function calculateCommissionAmount(serviceValue, rate = DEFAULT_COMMISSION_RATE_PERCENT) {
  return roundMoney(nonNegativeMoney(serviceValue) * (normalizeCommissionRate(rate) / 100));
}

function getEligibleCommissionServiceValue(booking = {}, payment = null) {
  const bookingAmount = nonNegativeMoney(booking.finalAmount || booking.amount || booking.originalAmount || 0);
  if (!payment) return bookingAmount;
  return Math.min(bookingAmount || getVerifiedPaidAmount(payment, booking), getVerifiedPaidAmount(payment, booking));
}

function evaluateCommissionEligibility({ booking = {}, payment = null, worker = null, existingCommission = null, rate = DEFAULT_COMMISSION_RATE_PERCENT }) {
  if (!isCompletedBookingStatus(booking.status)) {
    return { eligible: false, reason: "Booking is not completed." };
  }
  if (!String(booking.assigned || "").trim()) {
    return { eligible: false, reason: "Booking has no assigned worker." };
  }
  if (existingCommission && !["voided", "cancelled"].includes(String(existingCommission.status || "").trim().toLowerCase())) {
    return { eligible: false, reason: "An active commission already exists for this booking." };
  }
  if (!worker || String(worker.status || "active").trim().toLowerCase() !== "active") {
    return { eligible: false, reason: "Assigned worker is not active." };
  }
  const serviceValue = getEligibleCommissionServiceValue(booking, payment);
  if (serviceValue <= 0) {
    return { eligible: false, reason: "No verified paid service value is available." };
  }
  const commissionRate = normalizeCommissionRate(rate);
  return {
    eligible: true,
    reason: "",
    serviceValue,
    rate: commissionRate,
    earned: calculateCommissionAmount(serviceValue, commissionRate),
  };
}

module.exports = {
  DEFAULT_COMMISSION_RATE_PERCENT,
  calculateCommissionAmount,
  evaluateCommissionEligibility,
  getEligibleCommissionServiceValue,
  normalizeCommissionRate,
};
