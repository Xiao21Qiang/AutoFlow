import { getOutstandingBalance as getAuthoritativeOutstandingBalance, getRecognizedRevenue, normalizePaymentStatus } from "./businessMetrics";

export const PAYMENT_STATUS_OPTIONS = ["Pending", "For Verification", "Paid", "Rejected"];
export const PAYMENT_METHOD_OPTIONS = ["Cash", "GCash", "Maya", "Bank Transfer", "E-Wallet", "Online Transfer"];

export function isPaidStatus(status) {
  return normalizePaymentStatus(status, "") === "Paid";
}

export function normalizeStageStatus(status, fallback = "Pending") {
  return normalizePaymentStatus(status, fallback);
}

export function normalizePaymentPlan(plan, payment = {}) {
  const normalized = String(plan || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (["full", "full payment", "pay in full", "pay full", "fullpayment"].includes(normalized)) return "fullPayment";
  if (["flexibledownpayment", "flexible downpayment", "flexible down payment"].includes(normalized)) return "flexibleDownPayment";
  if (["down", "down payment", "dp", "downpayment"].includes(normalized)) return "downPayment";
  return payment.downPaymentRequired === true ? "downPayment" : "fullPayment";
}

// Parse decimal pesos without rounding customer input or accepting exponent notation.
export function parseMoneyCentavos(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return null;
  const [pesos, fraction = ""] = text.replace(/,/g, "").split(".");
  const centavos = Number(pesos) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

export function getRequiredDownPaymentAmount(payment = {}) {
  // Old records already snapshot the required minimum in downPaymentAmount.
  return Math.max(0, Number(payment.requiredDownPaymentAmount ?? payment.downPaymentAmount) || 0);
}

export function validateFlexibleDownPayment(value, payment = {}) {
  const centavos = parseMoneyCentavos(value);
  const minimum = Math.round(getRequiredDownPaymentAmount(payment) * 100);
  const total = Math.round(getPaymentTotal(payment) * 100);
  if (centavos === null || centavos <= 0) {
    return { valid: false, message: "Enter a valid amount with up to 2 decimal places." };
  }
  if (centavos < minimum) {
    return { valid: false, message: `Minimum flexible downpayment is ₱${(minimum / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.` };
  }
  if (centavos > total) {
    return { valid: false, message: "Flexible downpayment cannot exceed the total amount due." };
  }
  return {
    valid: true,
    amount: centavos / 100,
    remainingBalance: (total - centavos) / 100,
    paymentPlan: centavos === total ? "fullPayment" : "flexibleDownPayment",
  };
}

export function getPaymentPlanLabel(payment = {}) {
  const plan = normalizePaymentPlan(payment.paymentPlan, payment);
  return plan === "flexibleDownPayment" ? "Flexible Downpayment" : plan === "fullPayment" ? "Pay in Full" : "Pay Down Payment";
}

export function getBalanceAfterInitialPayment(payment = {}) {
  return Math.max(0, (Math.round(getPaymentTotal(payment) * 100) - Math.round(Number(payment.downPaymentAmount || 0) * 100)) / 100);
}

export function isFullPaymentPlan(payment = {}) {
  return normalizePaymentPlan(payment.paymentPlan, payment) === "fullPayment";
}

export function getPaymentTotal(payment = {}) {
  return Math.max(
    0,
    Number(payment.finalAmount || payment.totalAmount || payment.amount || payment.originalAmount || 0) || 0
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
    isFullPaymentPlan(payment) ||
    payment.downPaymentRequired === false ||
    normalizeStageStatus(payment.downPaymentStatus, "Pending") === "Not Required" ||
    normalizeStageStatus(payment.downPaymentStatus, "Pending") === "Paid"
  );
}

export function hasCustomerFinalPaymentSubmission(payment = {}) {
  const finalStatus = normalizeStageStatus(payment.finalPaymentStatus, payment.status || "Pending");
  const method = String(payment.finalPaymentMethod || payment.method || "").trim();
  return (
    finalStatus === "For Verification" &&
    Boolean(method) &&
    Boolean(
      method.toLowerCase() === "cash" ||
      String(payment.finalPaymentReference || "").trim() ||
      String(payment.finalPaymentProofUrl || "").trim() ||
      String(payment.finalPaymentProofName || "").trim() ||
      payment.finalPaymentProofAvailable === true
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
  if (payment.downPaymentRequired === true && isFullPaymentPlan(payment)) return "Full Payment Pending";
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
