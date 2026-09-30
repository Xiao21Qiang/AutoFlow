const {
  bookingConsumesDailyCapacity,
  buildCustomerBookingAvailability,
  getAvailableSlotsForDate,
} = require("../server/domain/bookingAvailability");

function availabilityForCount(count) {
  const bookings = Array.from({ length: count }, (_, index) => ({
    id: `B-${index}`,
    date: "2099-11-01",
    status: "Scheduled",
  }));
  const payments = bookings.map((booking) => ({
    bookingId: booking.id,
    downPaymentRequired: false,
    downPaymentStatus: "Not Required",
  }));
  return buildCustomerBookingAvailability({ bookings, payments });
}

describe("customer booking daily availability", () => {
  test("derives available slots from payment, scheduling, cancellation, and release state", () => {
    const bookings = [
      { id: "B-PENDING", date: "2099-10-05", service: "Ceramic Coating", status: "Pending" },
      { id: "B-DP-PAID", date: "2099-10-05", service: "Ceramic Coating", status: "Pending" },
      { id: "B-FULL-PAID", date: "2099-10-05", service: "Ceramic Coating", status: "Pending" },
      { id: "B-NO-DP-PENDING", date: "2099-10-05", service: "Car Wash", status: "Pending" },
      { id: "B-NO-DP-SCHEDULED", date: "2099-10-05", service: "Car Wash", status: "Scheduled" },
      { id: "B-CANCELLED", date: "2099-10-05", service: "Ceramic Coating", status: "Cancelled" },
      { id: "B-COMPLETED-HOLD", date: "2099-10-05", service: "Ceramic Coating", status: "Completed", warrantyReleased: false },
      { id: "B-COMPLETED-RELEASED", date: "2099-10-05", service: "Ceramic Coating", status: "Completed", warrantyReleased: true },
    ];
    const payments = [
      { bookingId: "B-PENDING", downPaymentRequired: true, downPaymentStatus: "For Verification" },
      { bookingId: "B-DP-PAID", downPaymentRequired: true, downPaymentStatus: "Paid" },
      { bookingId: "B-FULL-PAID", downPaymentRequired: true, paymentPlan: "fullPayment", downPaymentStatus: "Pending", finalPaymentStatus: "Paid" },
      { bookingId: "B-NO-DP-PENDING", downPaymentRequired: false, downPaymentStatus: "Not Required" },
      { bookingId: "B-NO-DP-SCHEDULED", downPaymentRequired: false, downPaymentStatus: "Not Required" },
      { bookingId: "B-CANCELLED", downPaymentRequired: true, downPaymentStatus: "Paid" },
      { bookingId: "B-COMPLETED-HOLD", downPaymentRequired: true, downPaymentStatus: "Paid" },
      { bookingId: "B-COMPLETED-RELEASED", downPaymentRequired: true, downPaymentStatus: "Paid" },
    ];

    expect(buildCustomerBookingAvailability({ bookings, payments }).byDate["2099-10-05"]).toEqual({ availableSlots: 4 });
  });

  test.each([
    [0, 8],
    [1, 7],
    [8, 0],
    [10, 0],
  ])("%i qualifying reservations report %i available slots", (reserved, expectedAvailable) => {
    const availability = availabilityForCount(reserved);
    expect(getAvailableSlotsForDate(availability, "2099-11-01")).toBe(expectedAvailable);
    expect(getAvailableSlotsForDate(availability, "2099-11-01")).toBeGreaterThanOrEqual(0);
    expect(getAvailableSlotsForDate(availability, "2099-11-01")).toBeLessThanOrEqual(8);
  });

  test("proof submission awaiting review does not reserve capacity", () => {
    expect(bookingConsumesDailyCapacity(
      { id: "B-1", date: "2099-12-01", status: "Pending", service: "Ceramic Coating" },
      { bookingId: "B-1", downPaymentRequired: true, downPaymentStatus: "For Verification" }
    )).toBe(false);
  });

  test("reservation timing distinguishes unsatisfied, verified DP, and verified pay-in-full", () => {
    const booking = { id: "B-1", date: "2099-12-01", status: "Pending" };

    expect(bookingConsumesDailyCapacity(booking, {
      bookingId: "B-1",
      downPaymentRequired: true,
      downPaymentStatus: "Pending",
    })).toBe(false);
    expect(bookingConsumesDailyCapacity(booking, {
      bookingId: "B-1",
      downPaymentRequired: true,
      downPaymentStatus: "Paid",
    })).toBe(true);
    expect(bookingConsumesDailyCapacity(booking, {
      bookingId: "B-1",
      downPaymentRequired: true,
      paymentPlan: "fullPayment",
      downPaymentStatus: "Pending",
      finalPaymentStatus: "Paid",
    })).toBe(true);
  });

  test("repeated derivation reads do not double-reserve", () => {
    const bookings = [{ id: "B-1", date: "2099-12-02", status: "Pending" }];
    const payments = [{ bookingId: "B-1", downPaymentRequired: true, downPaymentStatus: "Paid" }];

    const first = buildCustomerBookingAvailability({ bookings, payments });
    const second = buildCustomerBookingAvailability({ bookings, payments });

    expect(getAvailableSlotsForDate(first, "2099-12-02")).toBe(7);
    expect(second).toEqual(first);
  });

  test("canonical no-DP Scheduled state reserves exactly one slot", () => {
    expect(bookingConsumesDailyCapacity(
      { id: "B-1", date: "2099-12-03", status: "Scheduled" },
      { bookingId: "B-1", downPaymentRequired: false, downPaymentStatus: "Not Required" }
    )).toBe(true);
  });

  test("cancellation releases only a previously reserved slot and never exceeds capacity", () => {
    const reserved = [{ id: "B-1", date: "2099-12-04", status: "Scheduled" }];
    const payments = [{ bookingId: "B-1", downPaymentRequired: false, downPaymentStatus: "Not Required" }];
    expect(getAvailableSlotsForDate(buildCustomerBookingAvailability({ bookings: reserved, payments }), "2099-12-04")).toBe(7);

    const cancelled = [{ ...reserved[0], status: "Cancelled" }];
    expect(getAvailableSlotsForDate(buildCustomerBookingAvailability({ bookings: cancelled, payments }), "2099-12-04")).toBe(8);

    const unreservedCancelled = [{ id: "B-2", date: "2099-12-04", status: "Cancelled" }];
    expect(getAvailableSlotsForDate(buildCustomerBookingAvailability({ bookings: unreservedCancelled, payments: [] }), "2099-12-04")).toBe(8);
  });

  test.each([
    ["In Progress", false, true],
    ["Completed", false, true],
    ["Completed", true, false],
  ])("%s with warrantyReleased=%s has reserved=%s", (status, warrantyReleased, expected) => {
    expect(bookingConsumesDailyCapacity(
      { id: "B-1", date: "2099-12-05", status, warrantyReleased },
      { bookingId: "B-1", downPaymentRequired: true, downPaymentStatus: "Paid" }
    )).toBe(expected);
  });

  test("customer payload contains only capacity and per-date remaining slots", () => {
    const availability = availabilityForCount(1);
    expect(availability).toEqual({
      maxDailyCapacity: 8,
      byDate: { "2099-11-01": { availableSlots: 7 } },
    });
    expect(JSON.stringify(availability)).not.toMatch(/customer|vehicle|payment|service|bookingId/i);
  });
});
