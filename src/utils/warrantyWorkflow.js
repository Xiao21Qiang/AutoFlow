import { getLinkedPaymentForBooking as findLinkedPaymentForBooking } from "./bookingWorkflow";
import { isAdminUser, isAssignedStaffForBooking, normalizeComparable } from "./trackingIssueNotes";

const WARRANTY_EXEMPT_SERVICES = new Set([
  "car wash",
  "maintenance + hydrophobic sealant",
  "maintenance + light buffing",
]);

export function isWarrantyExemptService(serviceOrBooking = "") {
  const service = typeof serviceOrBooking === "object" ? serviceOrBooking?.service : serviceOrBooking;
  return WARRANTY_EXEMPT_SERVICES.has(normalizeComparable(service));
}

export function getLinkedPaymentForBooking(booking = {}, payments = []) {
  return findLinkedPaymentForBooking(booking, payments);
}

export function isFullPaymentPaid(payment = null) {
  return (
    normalizeComparable(payment?.finalPaymentStatus) === "paid" ||
    normalizeComparable(payment?.status) === "paid"
  );
}

export function isInProgressStatus(status) {
  return normalizeComparable(status) === "in progress";
}

export function hasRequiredWarrantyFields(booking = {}) {
  if (isWarrantyExemptService(booking)) return true;

  const checklistItems = Array.isArray(booking.warrantyChecklistItems) ? booking.warrantyChecklistItems : [];
  const acknowledgement = booking.warrantyAcknowledgement || {};

  return Boolean(
    String(booking.warrantyCoveragePackage || "").trim() &&
      checklistItems.some((item) => Boolean(item?.done)) &&
      String(acknowledgement.dateLocation || "").trim()
  );
}

export function canEditWarranty(booking = {}, payment = null, currentUser = {}, { allowAdmin = false } = {}) {
  if (isWarrantyExemptService(booking)) return false;
  if (!isInProgressStatus(booking.status)) return false;
  if (!isFullPaymentPaid(payment)) return false;
  if (allowAdmin && isAdminUser(currentUser)) return true;
  return isAssignedStaffForBooking(booking, currentUser);
}

export function getWarrantyBlockReason(booking = {}, payment = null, currentUser = {}, { allowAdmin = false } = {}) {
  if (isWarrantyExemptService(booking)) {
    return "Warranty document is not required for this service.";
  }
  if (!isInProgressStatus(booking.status)) {
    return "Warranty details can only be edited while the service is In Progress.";
  }
  if (!payment) {
    return "Linked payment record is required before editing warranty details.";
  }
  if (!isFullPaymentPaid(payment)) {
    return "Full payment must be marked as paid before editing warranty details.";
  }
  if (!allowAdmin && !isAssignedStaffForBooking(booking, currentUser)) {
    return "Only the assigned staff can edit warranty details for this booking.";
  }
  if (allowAdmin && !isAdminUser(currentUser) && !isAssignedStaffForBooking(booking, currentUser)) {
    return "Only the assigned staff can edit warranty details for this booking.";
  }
  return "";
}

export function buildWarrantyPayload(source = {}, status = "") {
  return {
    status,
    warrantyChecklist: source.warrantyChecklist || "",
    warrantyChecklistItems: Array.isArray(source.warrantyChecklistItems) ? source.warrantyChecklistItems : [],
    warrantyCoveragePackage: source.warrantyCoveragePackage || "",
    warrantyAcknowledgement: source.warrantyAcknowledgement || {},
    warrantyReleased: Boolean(source.warrantyReleased),
  };
}
