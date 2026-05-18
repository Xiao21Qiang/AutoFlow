export const PAYMENT_STATUS_OPTIONS = ["Pending", "For Verification", "Paid", "Rejected"];
export const PAYMENT_METHOD_OPTIONS = ["Cash", "E-Wallet", "Bank Transfer", "Online Transfer"];

export function isPaidStatus(status) {
  return String(status || "").trim().toLowerCase() === "paid";
}

export function normalizeStageStatus(status, fallback = "Pending") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "not required") return "Not Required";
  if (normalized === "pending") return "Pending";
  if (normalized === "for verification") return "For Verification";
  if (normalized === "paid") return "Paid";
  if (normalized === "rejected") return "Rejected";
  return fallback;
}

export function getPaymentTotal(payment = {}) {
  return Math.max(
    0,
    Number(payment.totalAmount || payment.finalAmount || payment.amount || payment.originalAmount || 0) || 0
  );
}

export function getAmountPaid(payment = {}) {
  const total = getPaymentTotal(payment);
  if (isPaidStatus(payment.finalPaymentStatus) || isPaidStatus(payment.status)) return total;
  return Math.min(total, Math.max(0, Number(payment.amountPaid || 0) || 0));
}

export function getRemainingBalance(payment = {}) {
  return Math.max(0, getPaymentTotal(payment) - getAmountPaid(payment));
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
