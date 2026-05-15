import {
  PLACE_SLOT_OPTIONS,
  isValidScheduleDate,
  isValidShopTime,
} from "./bookingWorkflow";
import { hasMeaningfulIssueNotes, normalizeComparable } from "./trackingIssueNotes";
import {
  hasRequiredWarrantyFields,
  isFullPaymentPaid,
  isWarrantyExemptService,
} from "./warrantyWorkflow";

export function isInProgressStatus(status) {
  return normalizeComparable(status) === "in progress";
}

export function hasValidCompletionSchedule(booking = {}) {
  return (
    isValidScheduleDate(booking.date) &&
    isValidShopTime(booking.time) &&
    PLACE_SLOT_OPTIONS.includes(Number(booking.placeSlot || 0))
  );
}

export function getCompletionReadiness(booking = {}, payment = null) {
  const reasons = [];

  if (!isInProgressStatus(booking.status)) {
    reasons.push("booking is not in progress");
  }

  if (!String(booking.assigned || booking.assignedTo || "").trim()) {
    reasons.push("assigned staff is missing");
  }

  if (!hasValidCompletionSchedule(booking)) {
    reasons.push("valid schedule details are missing");
  }

  if (!payment || !isFullPaymentPaid(payment)) {
    reasons.push("full payment is not paid");
  }

  if (!hasMeaningfulIssueNotes(booking)) {
    reasons.push("issue notes are missing");
  }

  if (!isWarrantyExemptService(booking) && !hasRequiredWarrantyFields(booking)) {
    reasons.push("warranty details are incomplete");
  }

  return {
    canComplete: reasons.length === 0,
    reasons,
  };
}

export function formatCompletionReadinessMessage(readiness = {}) {
  const reasons = Array.isArray(readiness.reasons) ? readiness.reasons : [];
  if (!reasons.length) return "";
  return `Cannot complete yet: ${reasons.join(", ")}.`;
}
