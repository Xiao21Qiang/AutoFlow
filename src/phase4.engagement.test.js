const engagement = require("../server/domain/engagement");

describe("Phase 4 review helpers", () => {
  const customer = { id: "USR-1", email: "customer@example.com" };
  const booking = { id: "B-1", customerId: "USR-1", customerEmail: "customer@example.com", status: "Completed", finalAmount: 1000 };
  const paidPayment = { bookingId: "B-1", totalAmount: 1000, finalPaymentStatus: "Paid" };

  test("allows one owned completed and fully paid booking review", () => {
    expect(engagement.evaluateReviewEligibility({ booking, payment: paidPayment, customer }).eligible).toBe(true);
  });

  test("blocks wrong owner, invalid status, unpaid payment, and duplicate active review", () => {
    expect(engagement.evaluateReviewEligibility({ booking, payment: paidPayment, customer: { email: "other@example.com" } }).eligible).toBe(false);
    expect(engagement.evaluateReviewEligibility({ booking: { ...booking, status: "Scheduled" }, payment: paidPayment, customer }).eligible).toBe(false);
    expect(engagement.evaluateReviewEligibility({ booking, payment: { totalAmount: 1000, finalPaymentStatus: "Rejected" }, customer }).eligible).toBe(false);
    expect(engagement.evaluateReviewEligibility({ booking, payment: paidPayment, existingReview: { status: "Published" }, customer }).eligible).toBe(false);
  });

  test("validates rating and trims comments", () => {
    expect(engagement.validateReviewInput({ rating: 5, comment: "  Great work.  " })).toEqual({ rating: 5, comment: "Great work." });
    expect(() => engagement.validateReviewInput({ rating: 6, comment: "Great" })).toThrow(/Rating/);
    expect(() => engagement.validateReviewInput({ rating: 4, comment: " " })).toThrow(/comment/);
  });
});

describe("Phase 4 promotion helpers", () => {
  const activePromo = {
    id: "PRO-1",
    title: "Summer",
    code: "summer 10",
    enabled: true,
    discountType: "Percentage",
    discountValue: 10,
    usageLimit: 5,
    usageCount: 0,
    applicableServiceIds: ["SVC-1"],
  };

  test("normalizes codes and validates discount types", () => {
    const payload = engagement.normalizePromotionPayload({
      title: " New Promo ",
      code: " save 50! ",
      message: "Save now",
      discountType: "fixed",
      discountValue: 50,
      maxUsagePerUser: 1,
      status: "Active",
    });
    expect(payload.code).toBe("SAVE-50");
    expect(payload.discountType).toBe("Fixed");
    expect(payload.enabled).toBe(true);
  });

  test("rejects invalid percentage, negative usage, and reversed dates", () => {
    expect(() => engagement.normalizePromotionPayload({ title: "Bad", code: "BAD", message: "Bad", discountType: "Percentage", discountValue: 101, maxUsagePerUser: 1 })).toThrow(/100/);
    expect(() => engagement.normalizePromotionPayload({ title: "Bad", code: "BAD", message: "Bad", discountType: "Fixed", discountValue: 1, usageLimit: -1, maxUsagePerUser: 1 })).toThrow(/usage/);
    expect(() => engagement.normalizePromotionPayload({ title: "Bad", code: "BAD", message: "Bad", discountType: "Fixed", discountValue: 1, maxUsagePerUser: 1, startAt: "2026-07-20", endAt: "2026-07-19" })).toThrow(/end date/);
  });

  test("enforces status, dates, usage, and service eligibility", () => {
    expect(engagement.evaluatePromotionEligibility({ promo: activePromo, service: { id: "SVC-1" }, now: new Date("2026-07-19") }).eligible).toBe(true);
    expect(engagement.evaluatePromotionEligibility({ promo: { ...activePromo, enabled: false }, service: { id: "SVC-1" } }).eligible).toBe(false);
    expect(engagement.evaluatePromotionEligibility({ promo: { ...activePromo, startAt: "2099-01-01" }, service: { id: "SVC-1" } }).eligible).toBe(false);
    expect(engagement.evaluatePromotionEligibility({ promo: { ...activePromo, endAt: "2020-01-01" }, service: { id: "SVC-1" } }).eligible).toBe(false);
    expect(engagement.evaluatePromotionEligibility({ promo: { ...activePromo, usageCount: 5 }, service: { id: "SVC-1" } }).eligible).toBe(false);
    expect(engagement.evaluatePromotionEligibility({ promo: activePromo, service: { id: "SVC-2" } }).eligible).toBe(false);
  });

  test("calculates percentage, fixed, and zero-floor discounts", () => {
    expect(engagement.calculatePromotionDiscount(1000, activePromo).amount).toBe(900);
    expect(engagement.calculatePromotionDiscount(100, { ...activePromo, discountType: "Fixed", discountValue: 150 }).amount).toBe(0);
  });
});

describe("Phase 4 reward helpers", () => {
  test("generates every-three-bookings milestone numbers", () => {
    expect(engagement.getEarnedMilestoneNumbers(0)).toEqual([]);
    expect(engagement.getEarnedMilestoneNumbers(3)).toEqual([1]);
    expect(engagement.getEarnedMilestoneNumbers(6)).toEqual([1, 2]);
    expect(engagement.getEarnedMilestoneNumbers(10)).toEqual([1, 2, 3]);
  });

  test("counts only completed and fully paid bookings for rewards", () => {
    const bookings = [
      { id: "B1", status: "Completed", finalAmount: 100 },
      { id: "B2", status: "Cancelled", finalAmount: 100 },
      { id: "B3", status: "Completed", finalAmount: 100 },
    ];
    const payments = new Map([
      ["B1", { totalAmount: 100, finalPaymentStatus: "Paid" }],
      ["B2", { totalAmount: 100, finalPaymentStatus: "Paid" }],
      ["B3", { totalAmount: 100, finalPaymentStatus: "Rejected" }],
    ]);
    expect(engagement.eligibleBookingsForRewards(bookings, payments).map((booking) => booking.id)).toEqual(["B1"]);
  });

  test("selects only enabled, stocked, weighted rewards", () => {
    const rewards = [
      { id: "R1", name: "Disabled", enabled: false, active: false, quantity: 10, weight: 100 },
      { id: "R2", name: "Out", enabled: true, quantity: 0, weight: 100 },
      { id: "R3", name: "Winner", enabled: true, quantity: 2, weight: 1 },
    ];
    expect(engagement.selectWeightedReward(rewards, () => 0.5).id).toBe("R3");
  });

  test("validates reward values and transitions", () => {
    expect(() => engagement.normalizeRewardDefinitionPayload({ name: "Bad", type: "Percentage Discount", discountValue: 101, weight: 1, stock: 1 })).toThrow(/Percentage/);
    expect(engagement.calculateRewardDiscount(1000, { type: "Percentage Discount", discountType: "Percentage", discountValue: 10 }).finalAmount).toBe(900);
    expect(engagement.calculateRewardDiscount(100, { type: "Fixed Discount", discountType: "Fixed", discountValue: 150 }).finalAmount).toBe(0);
    expect(engagement.getRewardTransition("Available", "Reserved").allowed).toBe(true);
    expect(engagement.getRewardTransition("Used", "Available").allowed).toBe(false);
  });
});
