const CANONICAL_BOOKING_STATUSES = Object.freeze([
  "Pending",
  "Scheduled",
  "In Progress",
  "Completed",
  "Cancelled",
]);

const BOOKING_STATUS_ALIASES = Object.freeze({
  "pending confirmation": "Pending",
  pending: "Pending",
  scheduled: "Scheduled",
  "in progress": "In Progress",
  completed: "Completed",
  successful: "Completed",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  rescheduled: "Scheduled",
});

const ALLOWED_BOOKING_TRANSITIONS = Object.freeze({
  Pending: ["Scheduled", "Cancelled"],
  Scheduled: ["Scheduled", "In Progress", "Cancelled"],
  "In Progress": ["Completed", "Cancelled"],
  Completed: ["Completed"],
  Cancelled: ["Cancelled"],
});

function normalizeBookingStatus(status, fallback = "Scheduled") {
  const key = String(status || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (BOOKING_STATUS_ALIASES[key]) return BOOKING_STATUS_ALIASES[key];
  if (fallback === null || fallback === undefined) return null;
  return normalizeBookingStatus(fallback, "Scheduled");
}

function assertCanonicalBookingStatus(status) {
  const normalized = normalizeBookingStatus(status, null);
  if (!normalized || !CANONICAL_BOOKING_STATUSES.includes(normalized)) {
    const error = new Error(`Unsupported booking status: ${status || "blank"}.`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function getBookingStatusMetadata(status) {
  const raw = String(status || "").trim();
  return {
    raw,
    canonical: normalizeBookingStatus(raw, "Scheduled"),
    wasRescheduled: raw.toLowerCase().replace(/\s+/g, " ") === "rescheduled",
  };
}

function isBookingStatus(status, expected) {
  return normalizeBookingStatus(status, "") === expected;
}

function isPendingBookingStatus(status) {
  return isBookingStatus(status, "Pending");
}

function isScheduledBookingStatus(status) {
  return isBookingStatus(status, "Scheduled");
}

function isInProgressBookingStatus(status) {
  return isBookingStatus(status, "In Progress");
}

function isCompletedBookingStatus(status) {
  return isBookingStatus(status, "Completed");
}

function isCancelledBookingStatus(status) {
  return isBookingStatus(status, "Cancelled");
}

function isActiveBookingStatus(status) {
  const normalized = normalizeBookingStatus(status, "");
  return ["Pending", "Scheduled", "In Progress"].includes(normalized);
}

function classifyBookingForDashboard(booking = {}) {
  const normalized = normalizeBookingStatus(booking.status, "Scheduled");
  return {
    status: normalized,
    isPending: normalized === "Pending",
    isScheduled: normalized === "Scheduled",
    isInProgress: normalized === "In Progress",
    isCompleted: normalized === "Completed",
    isCancelled: normalized === "Cancelled",
    isUpcomingEligible: ["Pending", "Scheduled", "In Progress"].includes(normalized),
  };
}

function validateBookingTransition(previousStatus, nextStatus, options = {}) {
  const previous = assertCanonicalBookingStatus(previousStatus || "Scheduled");
  const next = assertCanonicalBookingStatus(nextStatus || previous);
  if (previous === next) {
    return { allowed: true, previous, next, reason: "" };
  }

  const allowed = ALLOWED_BOOKING_TRANSITIONS[previous] || [];
  if (allowed.includes(next)) {
    return { allowed: true, previous, next, reason: "" };
  }

  if (previous === "In Progress" && next === "Cancelled" && options.allowInProgressCancellation === true) {
    return { allowed: true, previous, next, reason: "" };
  }

  return {
    allowed: false,
    previous,
    next,
    reason: `Booking status cannot transition from ${previous} to ${next}.`,
  };
}

module.exports = {
  CANONICAL_BOOKING_STATUSES,
  BOOKING_STATUS_ALIASES,
  ALLOWED_BOOKING_TRANSITIONS,
  assertCanonicalBookingStatus,
  classifyBookingForDashboard,
  getBookingStatusMetadata,
  isActiveBookingStatus,
  isCancelledBookingStatus,
  isCompletedBookingStatus,
  isInProgressBookingStatus,
  isPendingBookingStatus,
  isScheduledBookingStatus,
  normalizeBookingStatus,
  validateBookingTransition,
};
