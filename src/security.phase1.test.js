const { TextDecoder, TextEncoder } = require("util");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const {
  QR_TOKEN_PURPOSES,
  buildTrackingDto,
  buildWarrantyDto,
  canViewBooking,
  createBookingAccessToken,
  filterBootstrapDataForRole,
  isActiveAccount,
  parseBookingAccessToken,
} = require("../server/server");

const booking = {
  id: "BK-100",
  customer: "Customer One",
  customerEmail: "customer@example.com",
  customerId: "USR-CUSTOMER",
  vehicle: "Civic",
  plate: "ABC123",
  service: "Coating",
  status: "Completed",
  amount: 9999,
  finalAmount: 9999,
  trackingAccessVersion: 2,
  warrantyAccessVersion: 4,
  warrantyReleased: true,
  warrantyChecklistItems: [{ id: "paint", label: "Paint", done: true }],
  warrantyAcknowledgement: { clientName: "Customer One" },
};

describe("Phase 1 tracking and warranty access helpers", () => {
  test("uses separate purpose-specific public tokens", () => {
    const trackingToken = createBookingAccessToken(booking, QR_TOKEN_PURPOSES.tracking);
    const warrantyToken = createBookingAccessToken(booking, QR_TOKEN_PURPOSES.warranty);

    expect(trackingToken).not.toBe(warrantyToken);
    expect(parseBookingAccessToken(trackingToken, QR_TOKEN_PURPOSES.tracking)).toMatchObject({
      bookingId: booking.id,
      purpose: QR_TOKEN_PURPOSES.tracking,
      accessVersion: booking.trackingAccessVersion,
    });
    expect(parseBookingAccessToken(warrantyToken, QR_TOKEN_PURPOSES.warranty)).toMatchObject({
      bookingId: booking.id,
      purpose: QR_TOKEN_PURPOSES.warranty,
      accessVersion: booking.warrantyAccessVersion,
    });
  });

  test("rejects wrong-purpose, malformed, and stale-version tokens", () => {
    const trackingToken = createBookingAccessToken(booking, QR_TOKEN_PURPOSES.tracking);
    const parsed = parseBookingAccessToken(trackingToken, QR_TOKEN_PURPOSES.tracking);

    expect(parseBookingAccessToken(trackingToken, QR_TOKEN_PURPOSES.warranty)).toBeNull();
    expect(parseBookingAccessToken("not-a-token", QR_TOKEN_PURPOSES.tracking)).toBeNull();
    expect(parsed.accessVersion).not.toBe(booking.trackingAccessVersion + 1);
  });

  test("limits public tracking and warranty response fields", () => {
    const trackingDto = buildTrackingDto(booking);
    const warrantyDto = buildWarrantyDto(booking);

    expect(trackingDto).toHaveProperty("id", booking.id);
    expect(trackingDto).toHaveProperty("issueMarkers");
    expect(trackingDto).not.toHaveProperty("customerEmail");
    expect(trackingDto).not.toHaveProperty("amount");
    expect(trackingDto).not.toHaveProperty("finalAmount");

    expect(warrantyDto).toHaveProperty("warrantyReleased", true);
    expect(warrantyDto).toHaveProperty("warrantyChecklistItems");
    expect(warrantyDto).not.toHaveProperty("customerEmail");
    expect(warrantyDto).not.toHaveProperty("amount");
    expect(warrantyDto).not.toHaveProperty("warrantyAccessToken");
  });

  test("enforces authenticated customer ownership checks", () => {
    expect(canViewBooking({ userType: "Customer", email: "customer@example.com", id: "OTHER" }, booking, [])).toBe(true);
    expect(canViewBooking({ userType: "Customer", email: "other@example.com", id: "USR-CUSTOMER" }, booking, [])).toBe(true);
    expect(canViewBooking({ userType: "Customer", email: "other@example.com", id: "OTHER" }, booking, [])).toBe(false);
    expect(canViewBooking({ userType: "Admin", role: "Admin" }, booking, [])).toBe(true);
  });
});

describe("Phase 1 account state helpers", () => {
  test("only active accounts remain authenticated", () => {
    expect(isActiveAccount({ status: "active" })).toBe(true);
    expect(isActiveAccount({ status: "deactivated" })).toBe(false);
    expect(isActiveAccount({ status: "deleted" })).toBe(false);
    expect(isActiveAccount({ status: "inactive" })).toBe(false);
  });
});

describe("Phase 1 private bootstrap visibility", () => {
  const baseData = {
    bookings: [
      { id: "BK-OWN", customerEmail: "customer@example.com", customerId: "USR-CUSTOMER", assigned: "Senior One" },
      { id: "BK-OTHER", customerEmail: "other@example.com", customerId: "USR-OTHER", assigned: "Other Detailer" },
      { id: "BK-JUNIOR", customerEmail: "third@example.com", assigned: "Junior One" },
    ],
    services: [],
    stockMonitoring: [],
    payments: [
      { id: "PAY-OWN", bookingId: "BK-OWN", customerEmail: "customer@example.com" },
      { id: "PAY-OTHER", bookingId: "BK-OTHER", customerEmail: "other@example.com" },
    ],
    users: [
      { id: "USR-CUSTOMER", email: "customer@example.com", name: "Customer One", userType: "Customer", role: "New" },
      { id: "GM", email: "gm@example.com", name: "General Manager", userType: "Staff", role: "General Manager", status: "active" },
      { id: "SENIOR", email: "senior@example.com", name: "Senior One", userType: "Staff", role: "Senior Detailer", status: "active" },
      { id: "JUNIOR", email: "junior@example.com", name: "Junior One", userType: "Staff", role: "Junior Detailer", status: "active" },
    ],
    auditLogs: [],
    archivedAuditLogs: [],
    reviews: [
      { id: "REV-OWN", customerEmail: "customer@example.com", customer: "Customer One" },
      { id: "REV-OTHER", customerEmail: "other@example.com", customer: "Other Customer" },
    ],
    promos: [],
    quoteRequests: [],
    expenses: [{ id: "EXP-1", amount: 100 }],
    commissions: [
      { id: "COM-SENIOR", bookingId: "BK-OWN", worker: "Senior One", earned: 1000 },
      { id: "COM-JUNIOR", bookingId: "BK-JUNIOR", worker: "Junior One", earned: 500 },
    ],
    rewards: [{ id: "RWD-1", name: "Loyalty Spark", active: true }],
    customerRewards: [
      { id: "CR-OWN", customerId: "USR-CUSTOMER", customerEmail: "customer@example.com" },
      { id: "CR-OTHER", customerId: "USR-OTHER", customerEmail: "other@example.com" },
    ],
    alerts: [],
  };

  test("customers receive only their own private records", () => {
    const scoped = filterBootstrapDataForRole(baseData, {
      id: "USR-CUSTOMER",
      email: "customer@example.com",
      name: "Customer One",
      userType: "Customer",
      role: "New",
    });

    expect(scoped.bookings.map((item) => item.id)).toEqual(["BK-OWN"]);
    expect(scoped.payments.map((item) => item.id)).toEqual(["PAY-OWN"]);
    expect(scoped.reviews.map((item) => item.id)).toEqual(["REV-OWN"]);
    expect(scoped.customerRewards.map((item) => item.id)).toEqual(["CR-OWN"]);
    expect(scoped.expenses).toEqual([]);
    expect(scoped.commissions).toEqual([]);
  });

  test("senior detailers can see junior work without junior commission amounts", () => {
    const scoped = filterBootstrapDataForRole(baseData, {
      id: "SENIOR",
      email: "senior@example.com",
      name: "Senior One",
      userType: "Staff",
      role: "Senior Detailer",
    });

    expect(scoped.bookings.map((item) => item.id)).toEqual(["BK-OWN", "BK-JUNIOR"]);
    expect(scoped.commissions.map((item) => item.id)).toEqual(["COM-SENIOR"]);
    expect(scoped.commissions.some((item) => item.id === "COM-JUNIOR" || item.earned === 500)).toBe(false);
  });

  test("staff Engagement bootstrap includes Reward Pool definitions but excludes Admin-only Reward History", () => {
    const scoped = filterBootstrapDataForRole(baseData, {
      id: "GM",
      email: "gm@example.com",
      name: "General Manager",
      userType: "Staff",
      role: "General Manager",
    });

    expect(scoped.reviews.map((item) => item.id)).toEqual(["REV-OWN", "REV-OTHER"]);
    expect(scoped.rewards.map((item) => item.id)).toEqual(["RWD-1"]);
    expect(scoped.customerRewards).toEqual([]);
  });
});
