const paymentDomain = require("./payments");
const { roundMoney } = require("./money");

function buildInvoiceDto(payment = {}, booking = {}) {
  const normalized = paymentDomain.normalizePaymentStageFields(payment, booking);
  const originalAmount = Math.max(0, Number(normalized.originalAmount || normalized.amount || 0) || 0);
  const promoDiscountAmount = Math.max(0, Number(normalized.promoDiscountAmount || 0) || 0);
  const rewardDiscountAmount = Math.max(0, Number(normalized.rewardDiscountAmount || normalized.discountAmount || 0) || 0);
  const discountAmount = Math.min(originalAmount, roundMoney(promoDiscountAmount + rewardDiscountAmount));
  const finalAmountDue = paymentDomain.getPaymentFinalAmountDue(normalized, booking);
  const verifiedDownPayment = paymentDomain.getVerifiedRevenueEventsForPayment(normalized, booking)
    .filter((event) => event.stage === "Down Payment")
    .reduce((sum, event) => sum + Number(event.amount || 0), 0);
  const totalVerifiedPaid = paymentDomain.getVerifiedPaidAmount(normalized, booking);
  const verifiedFinalPayment = Math.max(0, roundMoney(totalVerifiedPaid - verifiedDownPayment));

  return {
    bookingId: normalized.bookingId || booking.id || "",
    customer: normalized.customer || booking.customer || "",
    customerEmail: normalized.customerEmail || booking.customerEmail || "",
    service: normalized.service || booking.service || "",
    bookingDate: normalized.date || booking.date || "",
    paymentMethod: normalized.finalPaymentMethod || normalized.downPaymentMethod || normalized.method || "",
    paymentStage: normalized.finalPaymentStatus === "Paid" ? "Final payment" : normalized.downPaymentStatus === "Paid" ? "Downpayment" : "Pending",
    paymentStatus: normalized.status || "Pending",
    originalServiceAmount: originalAmount,
    promotion: normalized.promoTitle || "",
    reward: normalized.rewardName || "",
    promoDiscountAmount,
    rewardDiscountAmount,
    discountAmount,
    finalAmountDue,
    verifiedDownPayment: roundMoney(verifiedDownPayment),
    verifiedFinalPayment,
    totalVerifiedPaid,
    outstandingBalance: paymentDomain.getOutstandingBalance(normalized, booking),
    downPaymentReference: normalized.downPaymentReference || "",
    finalPaymentReference: normalized.finalPaymentReference || "",
    proofSubmittedAt: normalized.finalPaymentProofSubmittedAt || normalized.downPaymentProofSubmittedAt || normalized.proofSubmittedAt || "",
    downPaymentReviewStatus: normalized.downPaymentReviewStatus || normalized.downPaymentStatus || "",
    finalPaymentReviewStatus: normalized.finalPaymentReviewStatus || normalized.finalPaymentStatus || "",
  };
}

function buildFinancialReportDto({ payments = [], expenses = [], commissions = [], dateFrom = "", dateTo = "" } = {}) {
  const inRange = (date) => {
    const key = String(date || "").slice(0, 10);
    if (!key) return true;
    if (dateFrom && key < dateFrom) return false;
    if (dateTo && key > dateTo) return false;
    return true;
  };
  const revenueEvents = payments
    .flatMap((payment) => paymentDomain.getVerifiedRevenueEventsForPayment(payment))
    .filter((event) => inRange(event.date || ""));
  const activeExpenses = expenses.filter((expense) => expense.archived !== true && inRange(expense.date));
  const scopedCommissions = commissions.filter((commission) => inRange(commission.date));
  const revenue = roundMoney(revenueEvents.reduce((sum, event) => sum + Number(event.amount || 0), 0));
  const expenseTotal = roundMoney(activeExpenses.reduce((sum, expense) => sum + Math.max(0, Number(expense.amount || 0)), 0));
  const commissionTotal = roundMoney(scopedCommissions.reduce((sum, commission) => sum + Math.max(0, Number(commission.earned || 0)), 0));

  return {
    filters: { dateFrom, dateTo },
    payments: payments.map((payment) => ({
      id: payment.id || "",
      bookingId: payment.bookingId || "",
      customer: payment.customer || "",
      amount: paymentDomain.getPaymentFinalAmountDue(payment),
      verifiedPaid: paymentDomain.getVerifiedPaidAmount(payment),
      outstandingBalance: paymentDomain.getOutstandingBalance(payment),
      status: payment.status || "",
    })),
    expenses: activeExpenses,
    commissions: scopedCommissions,
    totals: {
      revenue,
      expenses: expenseTotal,
      commissions: commissionTotal,
      netAfterExpenses: roundMoney(revenue - expenseTotal),
      netAfterCommissions: roundMoney(revenue - expenseTotal - commissionTotal),
    },
  };
}

module.exports = {
  buildFinancialReportDto,
  buildInvoiceDto,
};
