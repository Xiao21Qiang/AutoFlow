const { classifyBookingForDashboard } = require("./bookingStatus");
const { getActiveRecognizedRevenue, getHistoricalRecognizedRevenue, getVerifiedRevenueEventsForPayment } = require("./payments");
const { getStockStatus } = require("./stock");
const { isBookingToday, isUpcomingBooking } = require("./schedule");
const { roundMoney } = require("./money");

function buildBookingPaymentLookup(payments = []) {
  const lookup = new Map();
  for (const payment of payments) {
    const bookingId = String(payment.bookingId || "").trim();
    if (bookingId && !lookup.has(bookingId)) lookup.set(bookingId, payment);
  }
  return lookup;
}

function buildBusinessSummary({ bookings = [], payments = [], stockMonitoring = [], quoteRequests = [], now = new Date() } = {}) {
  const paymentByBooking = buildBookingPaymentLookup(payments);
  const bookingById = new Map((bookings || []).map((booking) => [String(booking.id || "").trim(), booking]));
  const normalizedBookingCounts = { pending: 0, scheduled: 0, inProgress: 0, completed: 0, cancelled: 0 };

  for (const booking of bookings || []) {
    const classification = classifyBookingForDashboard(booking);
    if (classification.isPending) normalizedBookingCounts.pending += 1;
    else if (classification.isScheduled) normalizedBookingCounts.scheduled += 1;
    else if (classification.isInProgress) normalizedBookingCounts.inProgress += 1;
    else if (classification.isCompleted) normalizedBookingCounts.completed += 1;
    else if (classification.isCancelled) normalizedBookingCounts.cancelled += 1;
  }

  const revenueEvents = (payments || []).flatMap((payment) => {
    const booking = bookingById.get(String(payment.bookingId || "").trim()) || {};
    return getVerifiedRevenueEventsForPayment(payment, booking);
  });
  const paidRevenue = roundMoney(
    (payments || []).reduce((sum, payment) => {
      const booking = bookingById.get(String(payment.bookingId || "").trim()) || {};
      return sum + getHistoricalRecognizedRevenue(payment, booking);
    }, 0)
  );
  const activePaidRevenue = roundMoney(
    (payments || []).reduce((sum, payment) => {
      const booking = bookingById.get(String(payment.bookingId || "").trim()) || {};
      return sum + getActiveRecognizedRevenue(payment, booking);
    }, 0)
  );
  const lowStockItems = (stockMonitoring || []).filter((item) => {
    const status = getStockStatus(item).key;
    return ["out", "critical", "low"].includes(status);
  });

  return {
    bookingsToday: (bookings || []).filter((booking) => isBookingToday(booking, now)).length,
    upcomingBookings: (bookings || []).filter((booking) => isUpcomingBooking(booking, now)).length,
    inProgressCount: normalizedBookingCounts.inProgress,
    lowStockCount: lowStockItems.length,
    paidRevenue,
    activePaidRevenue,
    historicalPaidRevenue: paidRevenue,
    totalSchedules: (bookings || []).length,
    completedCount: normalizedBookingCounts.completed,
    cancelledCount: normalizedBookingCounts.cancelled,
    pendingCount: normalizedBookingCounts.pending,
    scheduledCount: normalizedBookingCounts.scheduled,
    quoteRequestCount: (quoteRequests || []).length,
    paidRevenueEvents: revenueEvents.length,
    _paymentByBooking: paymentByBooking,
  };
}

module.exports = {
  buildBookingPaymentLookup,
  buildBusinessSummary,
};
