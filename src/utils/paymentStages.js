import { getOutstandingBalance as getAuthoritativeOutstandingBalance, getRecognizedRevenue, normalizePaymentStatus } from "./businessMetrics";

export const PAYMENT_STATUS_OPTIONS = ["Pending", "For Verification", "Paid", "Rejected"];
export const PAYMENT_METHOD_OPTIONS = ["Cash", "E-Wallet", "Bank Transfer", "Online Transfer"];

export function isPaidStatus(status) {
  return normalizePaymentStatus(status, "") === "Paid";
}

export function normalizeStageStatus(status, fallback = "Pending") {
  return normalizePaymentStatus(status, fallback);
}

export function getPaymentTotal(payment = {}) {
  return Math.max(
    0,
    Number(payment.totalAmount || payment.finalAmount || payment.amount || payment.originalAmount || 0) || 0
  );
}

export function getAmountPaid(payment = {}) {
  return getRecognizedRevenue(payment);
}

export function getRemainingBalance(payment = {}) {
  return getAuthoritativeOutstandingBalance(payment);
}

export function isDownPaymentSatisfied(payment = {}) {
  return (
    payment.downPaymentRequired === false ||
    normalizeStageStatus(payment.downPaymentStatus, "Pending") === "Not Required" ||
    normalizeStageStatus(payment.downPaymentStatus, "Pending") === "Paid"
  );
}

export function hasCustomerFinalPaymentSubmission(payment = {}) {
  const finalStatus = normalizeStageStatus(payment.finalPaymentStatus, payment.status || "Pending");
  return (
    finalStatus === "For Verification" &&
    Boolean(String(payment.finalPaymentMethod || "").trim()) &&
    Boolean(
      String(payment.finalPaymentReference || "").trim() ||
      String(payment.finalPaymentProofUrl || "").trim() ||
      String(payment.finalPaymentProofName || "").trim()
    )
  );
}

export function canReviewFinalPaymentStage(payment = {}) {
  return isDownPaymentSatisfied(payment) && hasCustomerFinalPaymentSubmission(payment);
}

export function getPaymentStageLabel(payment = {}) {
  const legacyStatus = normalizeStageStatus(payment.status, "Pending");
  const downPaymentStatus = normalizeStageStatus(payment.downPaymentStatus, payment.downPaymentRequired === false ? "Not Required" : legacyStatus);
  const finalPaymentStatus = normalizeStageStatus(payment.finalPaymentStatus, legacyStatus);

  if (isPaidStatus(payment.status) || finalPaymentStatus === "Paid") return "Paid";
  if (legacyStatus === "Rejected" && !payment.downPaymentStatus && !payment.finalPaymentStatus) return "Rejected";
  if (finalPaymentStatus === "For Verification") return "Full Payment For Verification";
  if (payment.downPaymentRequired === false || downPaymentStatus === "Not Required") return "Balance Pending";
  if (downPaymentStatus === "For Verification") return "DP For Verification";
  if (downPaymentStatus === "Paid") return "DP Paid / Balance Pending";
  if (downPaymentStatus === "Rejected") return "DP Rejected";
  return "DP Pending";
}

export function getPaymentStageClass(payment = {}) {
  const label = getPaymentStageLabel(payment).toLowerCase();
  if (label === "paid") return "paid";
  if (label.includes("verification")) return "review";
  if (label.includes("reject")) return "rejected";
  if (label.includes("balance")) return "balance";
  return "pending";
}

export function getPaymentFormDefaults(payment = {}) {
  const downPaymentStatus = normalizeStageStatus(
    payment.downPaymentStatus,
    payment.downPaymentRequired === false ? "Not Required" : "Pending"
  );
  const finalPaymentStatus = normalizeStageStatus(payment.finalPaymentStatus, payment.status || "Pending");
  return {
    downPaymentStatus,
    downPaymentMethod: payment.downPaymentMethod || payment.method || "",
    downPaymentReference: payment.downPaymentReference || "",
    downPaymentNotes: payment.downPaymentNotes || "",
    finalPaymentStatus,
    finalPaymentMethod: payment.finalPaymentMethod || payment.method || "",
    finalPaymentReference: payment.finalPaymentReference || payment.reference || "",
    finalPaymentNotes: payment.finalPaymentNotes || payment.notes || "",
  };
}

export function getAllowedDownPaymentStatuses(payment = {}) {
  const statuses = [...PAYMENT_STATUS_OPTIONS];
  if (payment.downPaymentRequired === false || normalizeStageStatus(payment.downPaymentStatus, "") === "Not Required") {
    statuses.push("Not Required");
  }
  return statuses;
}
