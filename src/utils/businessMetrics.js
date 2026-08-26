export const CANONICAL_BOOKING_STATUSES = ["Pending", "Scheduled", "In Progress", "Completed", "Cancelled"];
export const APPLICATION_TIMEZONE = "Asia/Manila";

export function toAppDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APPLICATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

export function normalizeBookingStatus(status, fallback = "Scheduled") {
  const normalized = String(status || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "pending confirmation" || normalized === "pending") return "Pending";
  if (normalized === "scheduled" || normalized === "rescheduled") return "Scheduled";
  if (normalized === "in progress") return "In Progress";
  if (normalized === "completed" || normalized === "successful") return "Completed";
  if (normalized === "cancelled" || normalized === "canceled") return "Cancelled";
  return fallback;
}

export function normalizePaymentStatus(status, fallback = "Pending") {
  const normalized = String(status || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (normalized === "not required") return "Not Required";
  if (["paid", "verified", "confirmed", "confirmed paid", "verified paid"].includes(normalized)) return "Paid";
  if (["for verification", "submitted", "under review", "pending review"].includes(normalized)) return "For Verification";
  if (["rejected", "declined"].includes(normalized)) return "Rejected";
  if (["failed", "invalid"].includes(normalized)) return "Failed";
  if (normalized === "pending" || normalized === "unpaid") return "Pending";
  return fallback;
}

export function getRecognizedRevenue(payment = {}) {
  const authoritative = Number(payment.recognizedRevenue ?? payment.historicalRecognizedRevenue);
  if (Number.isFinite(authoritative)) return Math.max(0, authoritative);
  const total = Math.max(0, Number(payment.totalAmount || payment.finalAmount || payment.amount || payment.originalAmount || 0) || 0);
  const down = Math.min(total, Math.max(0, Number(payment.downPaymentAmount || 0) || 0));
  const downPaid = normalizePaymentStatus(payment.downPaymentStatus, payment.downPaymentRequired === false ? "Not Required" : "Pending") === "Paid";
  const finalPaid = normalizePaymentStatus(payment.finalPaymentStatus, payment.status || "Pending") === "Paid";
  const legacyPaid = normalizePaymentStatus(payment.status, "Pending") === "Paid";
  if (finalPaid) return total;
  if (downPaid && legacyPaid) return total;
  if (downPaid) return down;
  if (legacyPaid) return total;
  return 0;
}

export function getOutstandingBalance(payment = {}) {
  const authoritative = Number(payment.outstandingBalance ?? payment.remainingBalance);
  if (Number.isFinite(authoritative)) return Math.max(0, authoritative);
  const total = Math.max(0, Number(payment.totalAmount || payment.finalAmount || payment.amount || payment.originalAmount || 0) || 0);
  return Math.max(0, Number((total - getRecognizedRevenue(payment)).toFixed(2)));
}

export function getRevenueEvents(payment = {}) {
  if (Array.isArray(payment.recognizedRevenueEvents)) {
    return payment.recognizedRevenueEvents
      .map((event) => ({ ...event, amount: Number(event.amount || 0), date: event.date ? new Date(event.date) : null }))
      .filter((event) => event.amount > 0 && event.date && !Number.isNaN(event.date.getTime()));
  }
  const date = payment.finalPaymentVerifiedAt || payment.downPaymentVerifiedAt || payment.reviewedAt || payment.date;
  const parsed = date ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? `${date}T00:00:00` : date) : null;
  const amount = getRecognizedRevenue(payment);
  return amount > 0 && parsed && !Number.isNaN(parsed.getTime())
    ? [{ id: payment.id || payment.bookingId, amount, date: parsed, customer: payment.customer || payment.customerEmail || "Customer" }]
    : [];
}

export function getEffectiveReorderLevel(item = {}) {
  const explicit = Number(item.reorderLevel);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  const maxStock = Math.max(0, Number(item.maxStock || 0));
  return maxStock > 0 ? Math.max(1, Math.ceil(maxStock * 0.25)) : 0;
}

export function getStockState(item = {}) {
  if (item.stockStatusKey && item.stockTone) {
    return {
      key: item.stockStatusKey,
      label: item.stockStatus || item.stockStatusKey,
      tone: item.stockTone,
      reorderLevel: getEffectiveReorderLevel(item),
    };
  }
  const currentStock = Math.max(0, Number(item.currentStock || 0));
  const reorderLevel = getEffectiveReorderLevel(item);
  if (currentStock <= 0) return { key: "out", label: "Out of Stock", tone: "danger", reorderLevel };
  if (reorderLevel <= 0 || currentStock > reorderLevel) return { key: "healthy", label: "Healthy", tone: "healthy", reorderLevel };
  if (currentStock <= reorderLevel * 0.5) return { key: "critical", label: "Critical", tone: "danger", reorderLevel };
  return { key: "low", label: "Low", tone: "warning", reorderLevel };
}

export function getStockPercent(item = {}) {
  if (Number.isFinite(Number(item.stockPercent))) return Number(item.stockPercent);
  const maxStock = Math.max(0, Number(item.maxStock || 0));
  if (maxStock <= 0) return 0;
  const currentStock = Math.max(0, Number(item.currentStock || 0));
  return Math.max(0, Math.min(100, Math.round((currentStock / maxStock) * 100)));
}

export function isUpcomingBooking(booking = {}, todayKey = "") {
  const status = normalizeBookingStatus(booking.status, "Scheduled");
  if (status === "Completed" || status === "Cancelled") return false;
  return Boolean(booking.date && String(booking.date) >= todayKey);
}

export function getBookingDateTimeSortValue(booking = {}) {
  const date = String(booking.date || "").trim();
  const time = String(booking.time || "").trim();
  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? time : "23:59";
  const parsed = date ? new Date(`${date}T${normalizedTime}:00`) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : Number.MAX_SAFE_INTEGER;
}
