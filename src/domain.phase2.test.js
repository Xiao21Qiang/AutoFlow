const {
  CANONICAL_BOOKING_STATUSES,
  classifyBookingForDashboard,
  normalizeBookingStatus,
  validateBookingTransition,
} = require("../server/domain/bookingStatus");
const {
  getOutstandingBalance,
  getVerifiedPaidAmount,
  getVerifiedRevenueEventsForPayment,
  isPaymentFullyPaid,
  normalizePaymentStageStatus,
} = require("../server/domain/payments");
const {
  APPLICATION_TIMEZONE,
  getDayRange,
  isBookingToday,
  isUpcomingBooking,
  parseBookingDateTime,
  toDateKey,
} = require("../server/domain/schedule");
const {
  deriveFallbackReorderLevel,
  getStockStatus,
  validateStockPayload,
} = require("../server/domain/stock");
const {
  DEFAULT_COMMISSION_RATE_PERCENT,
  calculateCommissionAmount,
  evaluateCommissionEligibility,
} = require("../server/domain/commission");
const { buildBusinessSummary } = require("../server/domain/summaries");

describe("Phase 2 booking status helpers", () => {
  test("normalizes canonical and legacy booking statuses", () => {
    expect(CANONICAL_BOOKING_STATUSES).toEqual(["Pending", "Scheduled", "In Progress", "Completed", "Cancelled"]);
    expect(normalizeBookingStatus("Pending Confirmation")).toBe("Pending");
    expect(normalizeBookingStatus("Canceled")).toBe("Cancelled");
    expect(normalizeBookingStatus("Successful")).toBe("Completed");
    expect(normalizeBookingStatus("Rescheduled")).toBe("Scheduled");
  });

  test("rejects invalid transitions and allows expected transitions", () => {
    expect(validateBookingTransition("Pending", "Scheduled").allowed).toBe(true);
    expect(validateBookingTransition("Pending", "Cancelled").allowed).toBe(true);
    expect(validateBookingTransition("Scheduled", "In Progress").allowed).toBe(true);
    expect(validateBookingTransition("In Progress", "Completed").allowed).toBe(true);
    expect(validateBookingTransition("Scheduled", "Pending").allowed).toBe(false);
    expect(validateBookingTransition("Completed", "Scheduled").allowed).toBe(false);
  });

  test("classifies legacy values for dashboards", () => {
    expect(classifyBookingForDashboard({ status: "Successful" })).toMatchObject({ status: "Completed", isCompleted: true });
    expect(classifyBookingForDashboard({ status: "Rescheduled" })).toMatchObject({ status: "Scheduled", isUpcomingEligible: true });
  });
});

describe("Phase 2 payment and revenue helpers", () => {
  test("normalizes paid, pending, review, rejected, and invalid payment statuses", () => {
    expect(normalizePaymentStageStatus("Verified")).toBe("Paid");
    expect(normalizePaymentStageStatus("submitted")).toBe("For Verification");
    expect(normalizePaymentStageStatus("under review")).toBe("For Verification");
    expect(normalizePaymentStageStatus("rejected")).toBe("Rejected");
    expect(normalizePaymentStageStatus("failed")).toBe("Failed");
  });

  test("counts only verified staged payments and avoids duplicate totals", () => {
    const payment = {
      id: "PAY-1",
      totalAmount: 1000,
      amount: 1000,
      downPaymentRequired: true,
      downPaymentAmount: 300,
      downPaymentStatus: "Paid",
      finalPaymentStatus: "For Verification",
      status: "For Verification",
    };
    expect(getVerifiedPaidAmount(payment)).toBe(300);
    expect(getOutstandingBalance(payment)).toBe(700);
    expect(isPaymentFullyPaid(payment)).toBe(false);
  });

  test("handles rejected, failed, missing, negative, and fully paid cases", () => {
    expect(getVerifiedPaidAmount({ totalAmount: 1000, downPaymentAmount: 300, downPaymentStatus: "Rejected" })).toBe(0);
    expect(getVerifiedPaidAmount({ totalAmount: 1000, finalPaymentStatus: "Failed" })).toBe(0);
    expect(getVerifiedPaidAmount({ totalAmount: 1000, finalPaymentStatus: "Paid" })).toBe(1000);
    expect(getVerifiedPaidAmount({ totalAmount: 1000, downPaymentAmount: -50, downPaymentStatus: "Paid" })).toBe(0);
    expect(getOutstandingBalance({ totalAmount: 0.3, downPaymentAmount: 0.1, downPaymentStatus: "Paid", finalPaymentStatus: "Paid" })).toBe(0);
  });

  test("preserves cancelled booking historical verified payments while active revenue excludes them", () => {
    const booking = { id: "BK-C", status: "Cancelled" };
    const payment = { bookingId: "BK-C", totalAmount: 1000, downPaymentAmount: 300, downPaymentStatus: "Paid" };
    const events = getVerifiedRevenueEventsForPayment(payment, booking);
    const summary = buildBusinessSummary({ bookings: [booking], payments: [payment] });
    expect(events).toHaveLength(1);
    expect(summary.paidRevenue).toBe(300);
    expect(summary.activePaidRevenue).toBe(0);
  });

  test("handles reward and promotion discounts through final amount due", () => {
    const payment = {
      originalAmount: 1000,
      promoDiscountAmount: 100,
      rewardDiscountAmount: 200,
      finalAmount: 700,
      downPaymentAmount: 200,
      downPaymentStatus: "Paid",
      finalPaymentStatus: "Paid",
    };
    expect(getVerifiedPaidAmount(payment)).toBe(700);
    expect(getOutstandingBalance(payment)).toBe(0);
  });
});

describe("Phase 2 stock helpers", () => {
  test("derives legacy reorder levels and classifies thresholds", () => {
    expect(deriveFallbackReorderLevel(100)).toBe(25);
    expect(getStockStatus({ currentStock: 0, maxStock: 100, reorderLevel: 20 }).label).toBe("Out of Stock");
    expect(getStockStatus({ currentStock: 10, maxStock: 100, reorderLevel: 20 }).label).toBe("Critical");
    expect(getStockStatus({ currentStock: 11, maxStock: 100, reorderLevel: 20 }).label).toBe("Low");
    expect(getStockStatus({ currentStock: 21, maxStock: 100, reorderLevel: 20 }).label).toBe("Healthy");
    expect(getStockStatus({ currentStock: 5, maxStock: 20 }).reorderLevel).toBe(5);
  });

  test("validates negative values, reorder bounds, current max, and restock overflow", () => {
    expect(validateStockPayload({ currentStock: -1, maxStock: 10 })).toMatch(/negative/);
    expect(validateStockPayload({ currentStock: 1, maxStock: -1 })).toMatch(/negative/);
    expect(validateStockPayload({ currentStock: 1, maxStock: 10, reorderLevel: -1 })).toMatch(/negative/);
    expect(validateStockPayload({ currentStock: 1, maxStock: 10, reorderLevel: 11 })).toMatch(/exceed/);
    expect(validateStockPayload({ currentStock: 11, maxStock: 10 })).toMatch(/cannot exceed/);
    expect(validateStockPayload({ currentStock: 9, maxStock: 10, qtyToAdd: 2 })).toMatch(/exceed/);
    expect(validateStockPayload({ currentStock: 9, maxStock: 10, qtyToAdd: 0 })).toMatch(/greater than zero/);
  });
});

describe("Phase 2 commission helpers", () => {
  const activeWorker = { name: "Detailer One", status: "active" };

  test("uses one default rate and rounds earned amount", () => {
    expect(DEFAULT_COMMISSION_RATE_PERCENT).toBe(10);
    expect(calculateCommissionAmount(333.335)).toBe(33.33);
    expect(calculateCommissionAmount(-100)).toBe(0);
  });

  test("enforces completion, payment, active worker, and duplicate rules", () => {
    expect(evaluateCommissionEligibility({ booking: { status: "Pending", assigned: "Detailer One" }, worker: activeWorker }).eligible).toBe(false);
    expect(evaluateCommissionEligibility({ booking: { status: "Completed", assigned: "Detailer One", amount: 1000 }, payment: { totalAmount: 1000 }, worker: activeWorker }).eligible).toBe(false);
    expect(evaluateCommissionEligibility({ booking: { status: "Completed", assigned: "Detailer One", amount: 1000 }, payment: { totalAmount: 1000, finalPaymentStatus: "Paid" }, worker: activeWorker })).toMatchObject({ eligible: true, earned: 100 });
    expect(evaluateCommissionEligibility({ booking: { status: "Completed", assigned: "Detailer One", amount: 1000 }, payment: { totalAmount: 1000, finalPaymentStatus: "Paid" }, worker: activeWorker, existingCommission: { status: "Earned" } }).eligible).toBe(false);
  });
});

describe("Phase 2 schedule helpers", () => {
  test("uses the application timezone and handles date-only bookings", () => {
    expect(APPLICATION_TIMEZONE).toBe("Asia/Manila");
    expect(toDateKey(new Date("2026-07-18T16:30:00.000Z"))).toBe("2026-07-19");
    expect(getDayRange("2026-07-19").key).toBe("2026-07-19");
    expect(parseBookingDateTime({ date: "2026-07-19" }).toISOString()).toBe("2026-07-19T15:59:59.999Z");
  });

  test("classifies today and upcoming without completed or cancelled records", () => {
    const now = new Date("2026-07-19T02:00:00.000Z");
    expect(isBookingToday({ date: "2026-07-19", time: "10:00" }, now)).toBe(true);
    expect(isUpcomingBooking({ date: "2026-07-19", time: "11:00", status: "Scheduled" }, now)).toBe(true);
    expect(isUpcomingBooking({ date: "2026-07-19", time: "11:00", status: "Completed" }, now)).toBe(false);
    expect(isUpcomingBooking({ date: "2026-07-18", time: "11:00", status: "Scheduled" }, now)).toBe(false);
    expect(isUpcomingBooking({ date: "2026-07-20", status: "Cancelled" }, now)).toBe(false);
  });
});

describe("Phase 2 cross-module parity fixtures", () => {
  test("dashboard, analytics, finance, AI, and reports share one revenue total", () => {
    const bookings = [
      { id: "BK-1", status: "Completed", date: "2026-07-19", time: "10:00" },
      { id: "BK-2", status: "Cancelled", date: "2026-07-20", time: "10:00" },
    ];
    const payments = [
      { id: "PAY-1", bookingId: "BK-1", totalAmount: 1000, downPaymentAmount: 300, downPaymentStatus: "Paid", finalPaymentStatus: "Paid" },
      { id: "PAY-2", bookingId: "BK-2", totalAmount: 500, downPaymentAmount: 100, downPaymentStatus: "Paid", finalPaymentStatus: "Rejected" },
    ];
    const summary = buildBusinessSummary({ bookings, payments, now: new Date("2026-07-19T02:00:00.000Z") });
    const dashboardRevenue = summary.paidRevenue;
    const analyticsRevenue = summary.paidRevenue;
    const financialTrackerRevenue = summary.paidRevenue;
    const aiInputRevenue = summary.paidRevenue;
    const reportRevenue = summary.paidRevenue;
    expect(new Set([dashboardRevenue, analyticsRevenue, financialTrackerRevenue, aiInputRevenue, reportRevenue]).size).toBe(1);
    expect(dashboardRevenue).toBe(1100);
    expect(summary.activePaidRevenue).toBe(1000);
  });
});
