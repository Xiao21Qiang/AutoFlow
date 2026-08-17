/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");
const bcrypt = require("bcryptjs");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

const { __testModels, app, signJwt } = require("../server/server");

jest.setTimeout(15000);

const adminUser = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };
const generalManagerUser = { id: "GM-1", email: "gm@example.com", name: "General Manager", userType: "Staff", role: "General Manager", status: "active" };
const marketingUser = { id: "MKT-1", email: "marketing@example.com", name: "Marketing", userType: "Staff", role: "Marketing", status: "active" };
const salesAssociateUser = { id: "SA-1", email: "sales@example.com", name: "Sales Associate", userType: "Staff", role: "Sales Associate", status: "active" };
const customerUser = {
  id: "CUS-1",
  email: "customer@example.com",
  name: "Customer One",
  userType: "Customer",
  role: "New",
  status: "active",
  cars: [{ vehicle: "Civic", size: "Sedan / Small Car", plate: "ABC123" }],
};
const detailerUser = { id: "STF-1", email: "detailer@example.com", name: "Detailer One", userType: "Staff", role: "Senior Detailer", status: "active" };
const secondDetailerUser = { id: "STF-2", email: "detailer2@example.com", name: "Detailer Two", userType: "Staff", role: "Junior Detailer", status: "active" };
const deletedDetailerUser = { id: "STF-DEL", email: "deleted-detailer@example.com", name: "Deleted Detailer", userType: "Staff", role: "Senior Detailer", status: "deleted" };
const service = {
  id: "SVC-1",
  name: "Ceramic Coating",
  enabled: true,
  price: 1000,
  mins: 60,
  allowedArrivalTimes: ["10:00", "13:00"],
};
const carWashService = {
  id: "SVC-NO-DP",
  name: "Car Wash",
  enabled: true,
  price: 300,
  mins: 60,
  allowedArrivalTimes: ["10:00", "13:00"],
};
const serviceFixtures = [service, carWashService];
const testUsers = [adminUser, generalManagerUser, marketingUser, salesAssociateUser, customerUser, detailerUser, secondDetailerUser, deletedDetailerUser];

const basePayload = {
  customer: "Customer One",
  customerEmail: "customer@example.com",
  vehicle: "Civic",
  plate: "ABC123",
  carSize: "Sedan / Small Car",
  service: "Ceramic Coating",
  assigned: "Detailer One",
  date: "2099-12-31",
  time: "10:00",
  placeSlot: 1,
  auditUser: "admin@example.com",
};

let bookings;
let payments;
let auditLogs;
const originals = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function doc(value) {
  if (!value) {
    return {
      lean: async () => null,
    };
  }
  return {
    ...value,
    lean: async () => clone(value),
    toObject: () => clone(value),
    save: async () => value,
  };
}

function chain(value) {
  return {
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    lean: async () => clone(value),
  };
}

function stub(model, method, implementation) {
  originals.push([model, method, model[method]]);
  model[method] = implementation;
}

function auth(user = adminUser) {
  return `Bearer ${signJwt({ sub: user.id, email: user.email, userType: user.userType, role: user.role })}`;
}

async function request(path, { method = "GET", token = auth(), body } = {}) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage();
    req.method = method;
    req.url = path;
    req.headers = {
      ...(token ? { authorization: token } : {}),
    };
    req.body = body || {};
    req.push(null);

    const res = new http.ServerResponse(req);
    const chunks = [];
    res.write = (chunk, encoding, callback) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      if (typeof callback === "function") callback();
      return true;
    };
    res.end = (chunk, encoding, callback) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      if (typeof callback === "function") callback();
      const text = Buffer.concat(chunks).toString("utf8");
      resolve({
        status: res.statusCode,
        body: text ? JSON.parse(text) : {},
      });
      return res;
    };
    app.handle(req, res, reject);
  });
}

function findUser(query = {}) {
  if (query.id) return testUsers.find((user) => user.id === query.id);
  if (query.email && typeof query.email === "string") {
    return testUsers.find((user) => user.email === query.email);
  }
  if (query.$or) {
    return testUsers.find((user) =>
      query.$or.some((condition) => {
        if (condition.id) return user.id === condition.id;
        if (condition.email?.$regex) return new RegExp(condition.email.$regex, condition.email.$options).test(user.email);
        if (condition.name?.$regex) return new RegExp(condition.name.$regex, condition.name.$options).test(user.name);
        return false;
      })
    );
  }
  if (query["cars.plate"]) {
    return [customerUser].find((user) => user.id !== query.id?.$ne && user.cars?.some((car) => car.plate === query["cars.plate"]));
  }
  return null;
}

function resetData(seedBookings = []) {
  bookings = seedBookings.map(clone);
  payments = [];
  auditLogs = [];
}

function seedDeletedBooking(status = "Cancelled") {
  resetData([
    {
      id: "B-DELETE",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      vehicle: "Civic",
      plate: "ABC123",
      service: "Ceramic Coating",
      carSize: "Sedan / Small Car",
      assigned: "Detailer One",
      date: "2099-12-31",
      time: "10:00",
      placeSlot: 1,
      status,
    },
  ]);
  payments.push({ id: "PAY-DELETE", bookingId: "B-DELETE", totalAmount: 1000, finalAmount: 1000 });
}

function buildVerifiedDownPayment(patch = {}) {
  return {
    id: "PAY-RESCHEDULE",
    bookingId: "B-RESCHEDULE",
    totalAmount: 1000,
    finalAmount: 1000,
    downPaymentRequired: true,
    downPaymentAmount: 300,
    downPaymentStatus: "Paid",
    downPaymentMethod: "GCash",
    downPaymentReference: "DP-REF-1",
    downPaymentProofSubmittedAt: "2099-12-01T00:00:00.000Z",
    downPaymentVerifiedAt: "2099-12-01T00:10:00.000Z",
    downPaymentVerifiedBy: "admin@example.com",
    ...patch,
  };
}

function seedScheduledBooking(paymentPatch = {}) {
  resetData([
    {
      id: "B-RESCHEDULE",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      vehicle: "Civic",
      plate: "ABC123",
      service: "Ceramic Coating",
      carSize: "Sedan / Small Car",
      assigned: "Detailer One",
      date: "2099-12-30",
      time: "10:00",
      placeSlot: 1,
      status: "Scheduled",
      amount: 1000,
      originalAmount: 1000,
    },
  ]);
  if (paymentPatch !== null) {
    payments.push(buildVerifiedDownPayment(paymentPatch));
  }
}

function seedPendingBooking() {
  resetData([
    {
      id: "B-PENDING",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      vehicle: "Civic",
      plate: "ABC123",
      service: "Ceramic Coating",
      carSize: "Sedan / Small Car",
      assigned: "Detailer One",
      date: "",
      time: "",
      placeSlot: 0,
      status: "Pending",
      amount: 1000,
      originalAmount: 1000,
    },
  ]);
}

function seedInProgressTrackingBooking(paymentPatch = {}) {
  resetData([
    {
      id: "B-TRACKING",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      vehicle: "Civic",
      plate: "ABC123",
      service: "Ceramic Coating",
      carSize: "Sedan / Small Car",
      assigned: "Detailer One",
      date: "2099-12-31",
      time: "10:00",
      placeSlot: 1,
      status: "In Progress",
      amount: 1000,
      originalAmount: 1000,
      issueNote: "Paint blemish documented before service.",
      issueTypes: ["Paint blemish"],
      issueMarkers: [{ id: 1, x: 50, y: 50, issueType: "Paint blemish" }],
      warrantyCoveragePackage: "Standard Warranty",
      warrantyChecklistItems: [{ id: "paint", label: "Paint inspection", done: true, doneBy: "Detailer One", notes: "Checked" }],
      warrantyAcknowledgement: { dateLocation: "2099-12-31 / QC", clientName: "Customer One" },
    },
  ]);
  payments.push({
    id: "PAY-TRACKING",
    bookingId: "B-TRACKING",
    totalAmount: 1000,
    finalAmount: 1000,
    downPaymentRequired: true,
    downPaymentAmount: 300,
    downPaymentStatus: "Paid",
    downPaymentVerifiedAt: "2099-12-01T00:10:00.000Z",
    finalPaymentStatus: "Paid",
    finalPaymentVerifiedAt: "2099-12-02T00:10:00.000Z",
    status: "Paid",
    ...paymentPatch,
  });
}

function seedPaymentReviewBooking() {
  resetData([
    {
      id: "B-PAY-REVIEW",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      vehicle: "Civic",
      plate: "ABC123",
      service: "Ceramic Coating",
      carSize: "Sedan / Small Car",
      assigned: "Detailer One",
      date: "2099-12-31",
      time: "10:00",
      placeSlot: 1,
      status: "Scheduled",
      amount: 1000,
      originalAmount: 1000,
    },
  ]);
  payments.push({
    id: "PAY-GM-REVIEW",
    bookingId: "B-PAY-REVIEW",
    customer: "Customer One",
    customerEmail: "customer@example.com",
    service: "Ceramic Coating",
    totalAmount: 1000,
    finalAmount: 1000,
    amount: 1000,
    downPaymentRequired: true,
    downPaymentAmount: 300,
    downPaymentStatus: "For Verification",
    downPaymentMethod: "GCash",
    downPaymentReference: "DP-REF-1",
    downPaymentProofUrl: "uploads/downpayment-proof.png",
    finalPaymentStatus: "Pending",
    status: "For Verification",
  });
}

function seedFinalPaymentReviewBooking() {
  resetData([
    {
      id: "B-FINAL-REVIEW",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      vehicle: "Civic",
      plate: "ABC123",
      service: "Ceramic Coating",
      carSize: "Sedan / Small Car",
      assigned: "Detailer One",
      date: "2099-12-31",
      time: "10:00",
      placeSlot: 1,
      status: "In Progress",
      amount: 1000,
      originalAmount: 1000,
    },
  ]);
  payments.push({
    id: "PAY-FINAL-REVIEW",
    bookingId: "B-FINAL-REVIEW",
    customer: "Customer One",
    customerEmail: "customer@example.com",
    service: "Ceramic Coating",
    totalAmount: 1000,
    finalAmount: 1000,
    amount: 1000,
    amountPaid: 300,
    remainingBalance: 700,
    downPaymentRequired: true,
    downPaymentAmount: 300,
    downPaymentStatus: "Paid",
    downPaymentMethod: "GCash",
    downPaymentReference: "DP-REF-1",
    downPaymentProofUrl: "uploads/downpayment-proof.png",
    downPaymentProofSubmittedAt: "2099-12-01T00:00:00.000Z",
    downPaymentReferenceCheckStatus: "submitted",
    downPaymentReferenceCheckedAt: "2099-12-01T00:01:00.000Z",
    downPaymentOcrAdvisoryStatus: "matched_advisory",
    finalPaymentStatus: "For Verification",
    finalPaymentMethod: "GCash",
    finalPaymentReference: "FINAL-REF-1",
    finalPaymentProofUrl: "uploads/final-payment-proof.png",
    finalPaymentProofName: "final-payment-proof.png",
    finalPaymentProofSubmittedAt: "2099-12-02T00:00:00.000Z",
    finalPaymentReferenceCheckStatus: "submitted",
    finalPaymentReferenceCheckedAt: "2099-12-02T00:01:00.000Z",
    finalPaymentOcrAdvisoryStatus: "matched_advisory",
    finalPaymentOcrAdvisoryText: "FINAL-REF-1",
    status: "For Verification",
  });
}

function seedCancelledRescheduleBooking({ paymentPatch = {}, serviceName = "Ceramic Coating", bookingPatch = {} } = {}) {
  resetData([
    {
      id: "B-CANCELLED-RESCHEDULE",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      vehicle: "Civic",
      plate: "ABC123",
      service: serviceName,
      carSize: "Sedan / Small Car",
      assigned: "Detailer One",
      date: "2099-12-30",
      time: "10:00",
      placeSlot: 1,
      status: "Cancelled",
      amount: serviceName === "Car Wash" ? 300 : 1000,
      originalAmount: serviceName === "Car Wash" ? 300 : 1000,
      ...bookingPatch,
    },
  ]);
  if (paymentPatch !== null) {
    payments.push(buildVerifiedDownPayment({
      bookingId: "B-CANCELLED-RESCHEDULE",
      totalAmount: serviceName === "Car Wash" ? 300 : 1000,
      finalAmount: serviceName === "Car Wash" ? 300 : 1000,
      service: serviceName,
      ...paymentPatch,
    }));
  }
}

function reschedulePayload(specialPin, extra = {}) {
  return {
    date: "2099-12-31",
    time: "13:00",
    placeSlot: 2,
    specialPin,
    ...extra,
  };
}

function reschedulePath(id = "B-CANCELLED-RESCHEDULE") {
  return `/api/admin/bookings/${id}/reschedule`;
}

beforeAll(async () => {
  stub(__testModels.User, "findOne", (query) => doc(findUser(query)));
  stub(__testModels.User, "find", () => chain(testUsers));
  stub(__testModels.Service, "findOne", (query = {}) => {
    if (query.name) return doc(serviceFixtures.find((entry) => entry.name === query.name));
    return doc(service);
  });
  stub(__testModels.Service, "find", () => chain(serviceFixtures));
  stub(__testModels.Booking, "find", (query = {}) => {
    const result = bookings.filter((booking) => {
      if (query.date && booking.date !== query.date) return false;
      if (query.id?.$ne && booking.id === query.id.$ne) return false;
      return true;
    });
    return chain(result);
  });
  stub(__testModels.Booking, "countDocuments", async () => 0);
  stub(__testModels.Booking, "findOne", (query = {}) => doc(bookings.find((booking) => booking.id === query.id)));
  stub(__testModels.Booking, "create", async (payload) => {
    const saved = { ...clone(payload), createdAt: new Date("2099-01-01T00:00:00.000Z") };
    bookings.push(saved);
    return saved;
  });
  stub(__testModels.Booking, "findOneAndUpdate", async (query, update) => {
    const index = bookings.findIndex((booking) => booking.id === query.id);
    if (index === -1) return null;
    bookings[index] = { ...bookings[index], ...clone(update) };
    return doc(bookings[index]);
  });
  stub(__testModels.Booking, "findOneAndDelete", async (query = {}) => {
    const index = bookings.findIndex((booking) => booking.id === query.id);
    if (index === -1) return null;
    const [deleted] = bookings.splice(index, 1);
    return doc(deleted);
  });
  stub(__testModels.Payment, "create", async (payload) => {
    payments.push(clone(payload));
    return clone(payload);
  });
  stub(__testModels.Payment, "find", (query = {}) => {
    const result = payments.filter((payment) => {
      if (query.customerEmail && payment.customerEmail !== query.customerEmail) return false;
      if (query.customer && payment.customer !== query.customer) return false;
      return true;
    });
    return chain(result);
  });
  stub(__testModels.Payment, "findOne", (query = {}) => {
    if (query.$or) {
      return doc(payments.find((payment) =>
        query.$or.some((condition) => {
          if (condition.bookingId?.$in) return condition.bookingId.$in.includes(payment.bookingId);
          if (condition.reference?.$in) return condition.reference.$in.includes(payment.reference);
          if (condition.bookingId) return payment.bookingId === condition.bookingId;
          if (condition.reference) return payment.reference === condition.reference;
          return false;
        })
      ));
    }
    if (query.id) return doc(payments.find((payment) => payment.id === query.id));
    return doc(payments.find((payment) => payment.bookingId === query.bookingId));
  });
  stub(__testModels.Payment, "findOneAndUpdate", async (query, update) => {
    const index = payments.findIndex((payment) => (
      (query.id && payment.id === query.id) ||
      (query.bookingId && payment.bookingId === query.bookingId)
    ));
    if (index === -1) return null;
    payments[index] = { ...payments[index], ...clone(update) };
    return clone(payments[index]);
  });
  stub(__testModels.Payment, "findOneAndDelete", async (query = {}) => {
    const index = payments.findIndex((payment) => payment.bookingId === query.bookingId);
    if (index === -1) return null;
    const [deleted] = payments.splice(index, 1);
    return clone(deleted);
  });
  stub(__testModels.Payment, "countDocuments", async () => 0);
  stub(__testModels.Promo, "findOne", () => doc(null));
  stub(__testModels.CustomerReward, "findOne", () => doc(null));
  stub(__testModels.CustomerReward, "find", () => chain([]));
  stub(__testModels.CustomerReward, "create", async (payload) => clone(payload));
  stub(__testModels.CustomerReward, "countDocuments", async () => 0);
  stub(__testModels.Review, "countDocuments", async () => 0);
  stub(__testModels.Commission, "findOne", () => doc(null));
  stub(__testModels.Commission, "create", async (payload) => clone(payload));
  stub(__testModels.Commission, "countDocuments", async () => 0);
  stub(__testModels.Reward, "find", () => chain([]));
  stub(__testModels.Reward, "findOneAndUpdate", async () => null);
  stub(__testModels.StockMonitoringItem, "find", () => chain([]));
  stub(__testModels.StockMonitoringItem, "updateOne", async () => ({}));
  stub(__testModels.Expense, "findOne", async () => null);
  stub(__testModels.Expense, "create", async (payload) => clone(payload));
  stub(__testModels.AuditLog, "create", async (payload) => {
    auditLogs.push(clone(payload));
    return clone(payload);
  });
  stub(__testModels.AuditLog, "countDocuments", async () => 0);
  const securitySetting = {
    id: "autoflow-security",
    requiredDownPaymentAmount: 0,
    adminSpecialPinHash: bcrypt.hashSync("123456", 4),
    adminSpecialPasswordHash: bcrypt.hashSync("AdminPass1!", 4),
    staffSpecialPinHash: bcrypt.hashSync("654321", 4),
    staffSpecialPasswordHash: bcrypt.hashSync("StaffPass1!", 4),
    save: async () => securitySetting,
  };
  stub(__testModels.SecuritySetting, "findOne", async () => securitySetting);
  stub(__testModels.SecuritySetting, "create", async () => securitySetting);
  originals.push([__testModels.SecuritySetting, "collection", __testModels.SecuritySetting.collection]);
  __testModels.SecuritySetting.collection = {
    findOne: async () => securitySetting,
    updateOne: async () => ({}),
  };

});

afterAll(async () => {
  originals.reverse().forEach(([model, method, original]) => {
    model[method] = original;
  });
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

beforeEach(() => {
  resetData();
});

describe("Admin booking creation route validation", () => {
  test.each([
    ["customer", { customerEmail: "" }],
    ["vehicle", { vehicle: "" }],
    ["plate", { plate: "" }],
    ["service", { service: "" }],
    ["carSize", { carSize: "" }],
    ["assigned", { assigned: "" }],
    ["date", { date: "" }],
    ["time", { time: "" }],
    ["placeSlot", { placeSlot: "" }],
  ])("direct API creation with missing %s is rejected and not persisted", async (_field, patch) => {
    const response = await request("/api/admin/bookings", {
      method: "POST",
      body: { ...basePayload, ...patch },
    });
    expect(response.status).toBe(400);
    expect(bookings).toHaveLength(0);
    expect(payments).toHaveLength(0);
  });

  test("unauthenticated and unauthorized users cannot use booking creation", async () => {
    expect((await request("/api/admin/bookings", { method: "POST", token: "", body: basePayload })).status).toBe(401);
    expect((await request("/api/admin/bookings", { method: "POST", token: auth(marketingUser), body: basePayload })).status).toBe(403);
    expect(bookings).toHaveLength(0);
  });

  test("a valid request creates exactly one Scheduled booking with normalized values", async () => {
    const response = await request("/api/admin/bookings", {
      method: "POST",
      body: { ...basePayload, plate: " abc123 ", carSize: "sedan" },
    });
    expect(response.status).toBe(201);
    expect(bookings).toHaveLength(1);
    expect(payments).toHaveLength(1);
    expect(bookings[0]).toMatchObject({
      status: "Scheduled",
      vehicle: "Civic",
      plate: "ABC123",
      carSize: "Sedan / Small Car",
      assigned: "Detailer One",
      date: "2099-12-31",
      time: "10:00",
      placeSlot: 1,
    });
  });
});

describe("Admin-only booking deletion route", () => {
  test("Admin may delete a Cancelled booking with the correct Admin special PIN and authenticated audit actor", async () => {
    seedDeletedBooking("Cancelled");
    const response = await request("/api/admin/bookings/B-DELETE", {
      method: "DELETE",
      token: auth(adminUser),
      body: { specialPin: "123456", auditUser: "forged@example.com" },
    });

    expect(response.status).toBe(204);
    expect(bookings).toHaveLength(0);
    expect(payments).toHaveLength(0);
    expect(auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "admin@example.com",
        action: "Deleted booking",
        targetId: "B-DELETE",
      }),
    ]));
  });

  test("Admin cannot delete a non-Cancelled booking", async () => {
    seedDeletedBooking("Scheduled");
    const response = await request("/api/admin/bookings/B-DELETE", {
      method: "DELETE",
      token: auth(adminUser),
      body: { specialPin: "123456" },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Only cancelled bookings can be deleted.");
    expect(bookings).toHaveLength(1);
    expect(payments).toHaveLength(1);
  });

  test("incorrect Admin special PIN blocks deletion", async () => {
    seedDeletedBooking("Cancelled");
    const response = await request("/api/admin/bookings/B-DELETE", {
      method: "DELETE",
      token: auth(adminUser),
      body: { specialPin: "000000" },
    });

    expect(response.status).toBe(401);
    expect(bookings).toHaveLength(1);
    expect(payments).toHaveLength(1);
  });

  test.each([
    ["General Manager", generalManagerUser],
    ["Sales Associate", salesAssociateUser],
  ])("%s cannot delete even a Cancelled booking with Staff credential or forged Admin body data", async (_label, actor) => {
    seedDeletedBooking("Cancelled");
    const response = await request("/api/admin/bookings/B-DELETE", {
      method: "DELETE",
      token: auth(actor),
      body: {
        specialPin: "654321",
        userType: "Admin",
        role: "Admin",
        auditUser: "admin@example.com",
      },
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin access required.");
    expect(bookings).toHaveLength(1);
    expect(payments).toHaveLength(1);
  });

  test("General Manager cannot delete a Cancelled booking even when it is reschedule-eligible", async () => {
    seedCancelledRescheduleBooking();
    const response = await request("/api/admin/bookings/B-CANCELLED-RESCHEDULE", {
      method: "DELETE",
      token: auth(generalManagerUser),
      body: { specialPin: "654321" },
    });

    expect(response.status).toBe(403);
    expect(bookings).toHaveLength(1);
    expect(bookings[0].status).toBe("Cancelled");
  });

  test.each([
    ["other Staff", marketingUser],
    ["Customer", customerUser],
  ])("%s cannot delete through the administrative booking route", async (_label, actor) => {
    seedDeletedBooking("Cancelled");
    const response = await request("/api/admin/bookings/B-DELETE", {
      method: "DELETE",
      token: auth(actor),
      body: { specialPin: "123456" },
    });

    expect(response.status).toBe(403);
    expect(bookings).toHaveLength(1);
    expect(payments).toHaveLength(1);
  });

  test("unauthenticated delete is rejected", async () => {
    seedDeletedBooking("Cancelled");
    const response = await request("/api/admin/bookings/B-DELETE", {
      method: "DELETE",
      token: "",
      body: { specialPin: "123456" },
    });

    expect(response.status).toBe(401);
    expect(bookings).toHaveLength(1);
  });
});

describe("Cancelled booking immutability", () => {
  test.each([
    ["Admin ordinary update", adminUser, { issueNote: "Changed note" }],
    ["General Manager ordinary update", generalManagerUser, { issueNote: "Changed note" }],
    ["Sales Associate ordinary update", salesAssociateUser, { issueNote: "Changed note" }],
    ["General Manager status rollback", generalManagerUser, { status: "Scheduled" }],
    ["Sales Associate status rollback", salesAssociateUser, { status: "Scheduled" }],
    ["crafted schedule and assignment change", adminUser, { date: "2099-12-30", time: "13:00", placeSlot: 2, assigned: "STF-2", service: "Ceramic Coating", promoId: "FORGED-PROMO" }],
  ])("%s against a Cancelled booking is rejected without mutation", async (_label, actor, patch) => {
    seedDeletedBooking("Cancelled");
    const original = clone(bookings[0]);
    const response = await request("/api/admin/bookings/B-DELETE", {
      method: "PUT",
      token: auth(actor),
      body: { ...bookings[0], ...patch, specialPin: actor.userType === "Staff" ? "654321" : "123456", auditUser: "forged@example.com" },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Cancelled bookings are locked and cannot be edited.");
    expect(bookings[0]).toEqual(original);
  });
});

describe("Sales Associate Service Tracking route parity", () => {
  test("Sales Associate can move Scheduled tracking to In Progress with issue fields and authenticated audit actor", async () => {
    seedScheduledBooking({ finalPaymentStatus: "For Verification", status: "For Verification" });
    const response = await request("/api/admin/bookings/B-RESCHEDULE", {
      method: "PUT",
      token: auth(salesAssociateUser),
      body: {
        ...bookings[0],
        status: "In Progress",
        issueNote: "Paint blemish documented before service.",
        issueTypes: ["Paint blemish"],
        issueMarkers: [{ id: 1, x: 50, y: 50, issueType: "Paint blemish" }],
        auditUser: "admin@example.com",
        userType: "Admin",
        role: "Admin",
      },
    });

    expect(response.status).toBe(200);
    expect(bookings[0]).toMatchObject({
      status: "In Progress",
      issueNote: "Paint blemish documented before service.",
      issueTypes: ["Paint blemish"],
    });
    expect(payments[0].finalPaymentStatus).toBe("For Verification");
    expect(auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "sales@example.com",
        action: "Updated booking status",
        targetId: "B-RESCHEDULE",
        meta: expect.objectContaining({ status: "In Progress" }),
      }),
    ]));
  });

  test("Sales Associate can complete valid In Progress tracking without forging the audit actor", async () => {
    seedInProgressTrackingBooking();
    const response = await request("/api/admin/bookings/B-TRACKING", {
      method: "PUT",
      token: auth(salesAssociateUser),
      body: {
        ...bookings[0],
        status: "Completed",
        auditUser: "admin@example.com",
        actor: "admin@example.com",
        userType: "Admin",
        role: "Admin",
      },
    });

    expect(response.status).toBe(200);
    expect(bookings[0].status).toBe("Completed");
    expect(payments[0].finalPaymentStatus).toBe("Paid");
    expect(auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "sales@example.com",
        action: "Updated booking status",
        targetId: "B-TRACKING",
        meta: expect.objectContaining({ status: "Completed" }),
      }),
    ]));
  });

  test("Sales Associate completion is rejected when final payment is still for verification", async () => {
    seedInProgressTrackingBooking({ finalPaymentStatus: "For Verification", status: "For Verification", finalPaymentVerifiedAt: "" });
    const originalBooking = clone(bookings[0]);
    const response = await request("/api/admin/bookings/B-TRACKING", {
      method: "PUT",
      token: auth(salesAssociateUser),
      body: {
        ...bookings[0],
        status: "Completed",
        auditUser: "admin@example.com",
        userType: "Admin",
        role: "Admin",
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Full payment must be marked as paid before completing this booking.");
    expect(bookings[0]).toEqual(originalBooking);
  });

  test("Sales Associate cannot roll In Progress tracking back to Scheduled through Service Tracking", async () => {
    seedInProgressTrackingBooking();
    const originalBooking = clone(bookings[0]);
    const response = await request("/api/admin/bookings/B-TRACKING", {
      method: "PUT",
      token: auth(salesAssociateUser),
      body: {
        ...bookings[0],
        status: "Scheduled",
        specialPin: "654321",
        auditUser: "admin@example.com",
        userType: "Admin",
        role: "Admin",
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Booking status cannot transition from In Progress to Scheduled.");
    expect(bookings[0]).toEqual(originalBooking);
  });
});

describe("Role-aware special credential validation", () => {
  async function validateCredential(actor, body, token = auth(actor)) {
    return request("/api/admin/security/validate", {
      method: "POST",
      token,
      body,
    });
  }

  test("General Manager PIN validation derives Staff scope from the authenticated actor and ignores forged Admin scope", async () => {
    const response = await validateCredential(generalManagerUser, {
      mode: "pin",
      value: "654321",
      scope: "admin",
      actorUserType: "Admin",
      actorRole: "Admin",
      actionKey: "booking.updateStatus",
    });

    expect(response.status).toBe(200);
  });

  test("Sales Associate PIN validation derives Staff scope and ignores forged Admin scope for authorized actions", async () => {
    const response = await validateCredential(salesAssociateUser, {
      mode: "pin",
      value: "654321",
      scope: "admin",
      actorUserType: "Admin",
      actorRole: "Admin",
      actionKey: "payment.verify",
    });

    expect(response.status).toBe(200);
  });

  test.each([
    ["General Manager", generalManagerUser, "incorrect Staff PIN", "000000"],
    ["General Manager", generalManagerUser, "Admin PIN supplied by Staff", "123456"],
    ["Sales Associate", salesAssociateUser, "incorrect Staff PIN", "000000"],
    ["Sales Associate", salesAssociateUser, "Admin PIN supplied by Staff", "123456"],
  ])("%s %s is rejected as a Staff-scope credential failure", async (_roleLabel, actor, _label, value) => {
    const response = await validateCredential(actor, {
      mode: "pin",
      value,
      scope: "admin",
      actionKey: "booking.updateStatus",
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Incorrect staff special PIN.");
  });

  test("Admin PIN validation derives Admin scope from the authenticated actor and ignores forged Staff scope", async () => {
    const response = await validateCredential(adminUser, {
      mode: "pin",
      value: "123456",
      scope: "staff",
      actionKey: "booking.updateStatus",
    });

    expect(response.status).toBe(200);
  });

  test.each([
    ["incorrect Admin PIN", "000000"],
    ["Staff PIN supplied by Admin", "654321"],
  ])("Admin %s is rejected as an Admin-scope credential failure", async (_label, value) => {
    const response = await validateCredential(adminUser, {
      mode: "pin",
      value,
      scope: "staff",
      actionKey: "booking.updateStatus",
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Incorrect admin special PIN.");
  });

  test("Staff special password is accepted only for an authorized Staff action and Admin password is rejected for Staff", async () => {
    const allowed = await validateCredential(generalManagerUser, {
      mode: "password",
      value: "StaffPass1!",
      scope: "admin",
      actionKey: "booking.updateStatus",
    });
    expect(allowed.status).toBe(200);

    const wrongScopeSecret = await validateCredential(generalManagerUser, {
      mode: "password",
      value: "AdminPass1!",
      scope: "admin",
      actionKey: "booking.updateStatus",
    });
    expect(wrongScopeSecret.status).toBe(401);
    expect(wrongScopeSecret.body.message).toBe("Incorrect staff special password.");
  });

  test("Admin special password is accepted only for Admin scope and Staff password is rejected for Admin", async () => {
    const allowed = await validateCredential(adminUser, {
      mode: "password",
      value: "AdminPass1!",
      scope: "staff",
      actionKey: "settings.manageDownPayment",
    });
    expect(allowed.status).toBe(200);

    const wrongScopeSecret = await validateCredential(adminUser, {
      mode: "password",
      value: "StaffPass1!",
      scope: "staff",
      actionKey: "settings.manageDownPayment",
    });
    expect(wrongScopeSecret.status).toBe(401);
    expect(wrongScopeSecret.body.message).toBe("Incorrect admin special password.");
  });

  test("unauthorized Staff cannot use correct Staff special password to gain another role's action", async () => {
    const response = await validateCredential(marketingUser, {
      mode: "password",
      value: "StaffPass1!",
      actionKey: "booking.updateStatus",
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Staff special credentials cannot authorize this action.");
  });

  test.each([
    ["Customer", customerUser, auth(customerUser), 403],
    ["Unauthenticated", null, "", 401],
  ])("%s cannot validate management special credentials", async (_label, actor, token, expectedStatus) => {
    const response = await validateCredential(actor || adminUser, {
      mode: "pin",
      value: "123456",
      actionKey: "booking.updateStatus",
    }, token);

    expect(response.status).toBe(expectedStatus);
  });
});

describe("Cancelled booking dedicated reschedule workflow", () => {
  test("General Manager may reschedule an eligible Cancelled booking with the correct Staff PIN and authenticated audit actor", async () => {
    seedCancelledRescheduleBooking();
    const response = await request(reschedulePath(), {
      method: "PATCH",
      token: auth(generalManagerUser),
      body: reschedulePayload("654321", { auditUser: "admin@example.com", userType: "Admin", role: "Admin" }),
    });

    expect(response.status).toBe(200);
    expect(bookings[0]).toMatchObject({ date: "2099-12-31", time: "13:00", placeSlot: 2, status: "Scheduled" });
    expect(bookings[0]).toMatchObject({ customer: "Customer One", vehicle: "Civic", service: "Ceramic Coating", assigned: "Detailer One" });
    expect(auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "gm@example.com",
        action: "Rescheduled booking",
        targetId: "B-CANCELLED-RESCHEDULE",
        meta: expect.objectContaining({
          previousDate: "2099-12-30",
          previousTime: "10:00",
          previousPlaceSlot: 1,
          date: "2099-12-31",
          time: "13:00",
          placeSlot: 2,
          status: "Scheduled",
        }),
      }),
    ]));
  });

  test("Sales Associate may reschedule an eligible Cancelled booking with Staff PIN and authenticated audit actor", async () => {
    seedCancelledRescheduleBooking();
    const response = await request(reschedulePath(), {
      method: "PATCH",
      token: auth(salesAssociateUser),
      body: reschedulePayload("654321", { auditUser: "admin@example.com", userType: "Admin", role: "Admin" }),
    });

    expect(response.status).toBe(200);
    expect(bookings[0]).toMatchObject({ date: "2099-12-31", time: "13:00", placeSlot: 2, status: "Scheduled" });
    expect(auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "sales@example.com",
        action: "Rescheduled booking",
        targetId: "B-CANCELLED-RESCHEDULE",
      }),
    ]));
  });

  test.each([
    ["incorrect Staff PIN", "000000"],
    ["Admin PIN supplied by Staff", "123456"],
  ])("General Manager and Sales Associate reschedule reject %s", async (_label, specialPin) => {
    seedCancelledRescheduleBooking();
    const gmResponse = await request(reschedulePath(), {
      method: "PATCH",
      token: auth(generalManagerUser),
      body: reschedulePayload(specialPin),
    });
    expect(gmResponse.status).toBe(401);
    expect(gmResponse.body.message).toBe("Incorrect staff special PIN.");
    expect(bookings[0]).toMatchObject({ date: "2099-12-30", time: "10:00", placeSlot: 1, status: "Cancelled" });

    const salesResponse = await request(reschedulePath(), {
      method: "PATCH",
      token: auth(salesAssociateUser),
      body: reschedulePayload(specialPin),
    });
    expect(salesResponse.status).toBe(401);
    expect(salesResponse.body.message).toBe("Incorrect staff special PIN.");
    expect(bookings[0]).toMatchObject({ date: "2099-12-30", time: "10:00", placeSlot: 1, status: "Cancelled" });
  });

  test("Admin may reschedule with the correct Admin PIN and audit as the authenticated Admin", async () => {
    seedCancelledRescheduleBooking();
    const response = await request(reschedulePath(), {
      method: "PATCH",
      token: auth(adminUser),
      body: reschedulePayload("123456", { auditUser: "gm@example.com" }),
    });

    expect(response.status).toBe(200);
    expect(bookings[0]).toMatchObject({ date: "2099-12-31", time: "13:00", placeSlot: 2, status: "Scheduled" });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ bookingId: "B-CANCELLED-RESCHEDULE", downPaymentStatus: "Paid" });
    const trackingResponse = await request("/api/tracking/B-CANCELLED-RESCHEDULE", { token: auth(adminUser) });
    expect(trackingResponse.status).toBe(200);
    expect(trackingResponse.body).toMatchObject({ id: "B-CANCELLED-RESCHEDULE", status: "Scheduled", date: "2099-12-31", time: "13:00" });
    expect(auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "admin@example.com",
        action: "Rescheduled booking",
        targetId: "B-CANCELLED-RESCHEDULE",
      }),
    ]));
  });

  test.each([
    ["required downpayment not submitted", null, "A linked payment record is required before rescheduling this booking."],
    ["required downpayment For Verification", { downPaymentStatus: "For Verification", downPaymentVerifiedAt: null }, "Down payment must be verified as paid before rescheduling this booking."],
    ["required downpayment rejected", { downPaymentStatus: "Rejected", downPaymentRejectedAt: "2099-12-01T00:10:00.000Z", downPaymentVerifiedAt: null }, "Down payment must be verified as paid before rescheduling this booking."],
  ])("Sales Associate reschedule with %s is denied", async (_label, paymentPatch, message) => {
    seedCancelledRescheduleBooking({ paymentPatch });
    const response = await request(reschedulePath(), {
      method: "PATCH",
      token: auth(salesAssociateUser),
      body: reschedulePayload("654321"),
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(message);
    expect(bookings[0]).toMatchObject({ date: "2099-12-30", time: "10:00", placeSlot: 1, status: "Cancelled" });
  });

  test("no-downpayment service may be rescheduled without a Paid payment record", async () => {
    seedCancelledRescheduleBooking({ paymentPatch: null, serviceName: "Car Wash" });
    const response = await request(reschedulePath(), {
      method: "PATCH",
      token: auth(salesAssociateUser),
      body: reschedulePayload("654321"),
    });

    expect(response.status).toBe(200);
    expect(bookings[0]).toMatchObject({ service: "Car Wash", date: "2099-12-31", time: "13:00", placeSlot: 2, status: "Scheduled" });
  });

  test("forged client payment state cannot satisfy the backend reschedule downpayment gate", async () => {
    seedCancelledRescheduleBooking({ paymentPatch: { downPaymentStatus: "Pending", downPaymentProofSubmittedAt: null, downPaymentVerifiedAt: null } });
    const response = await request(reschedulePath(), {
      method: "PATCH",
      token: auth(generalManagerUser),
      body: reschedulePayload("654321", {
        downPaymentStatus: "Paid",
        downPaymentVerifiedAt: "2099-12-01T00:10:00.000Z",
        paymentStatus: "Paid",
        downPaymentVerified: true,
        scope: "admin",
        actorUserType: "Admin",
        actorRole: "Admin",
      }),
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Down payment must be verified as paid before rescheduling this booking.");
    expect(bookings[0]).toMatchObject({ date: "2099-12-30", time: "10:00", placeSlot: 1, status: "Cancelled" });
  });

  test.each([
    ["incorrect Admin PIN", "000000"],
    ["Staff PIN supplied by Admin", "654321"],
  ])("Admin reschedule rejects %s", async (_label, specialPin) => {
    seedCancelledRescheduleBooking();
    const response = await request(reschedulePath(), {
      method: "PATCH",
      token: auth(adminUser),
      body: reschedulePayload(specialPin),
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Incorrect admin special PIN.");
    expect(bookings[0]).toMatchObject({ date: "2099-12-30", time: "10:00", placeSlot: 1, status: "Cancelled" });
  });

  test("unauthorized Staff cannot reschedule even with the correct Staff PIN", async () => {
    seedCancelledRescheduleBooking();
    const response = await request(reschedulePath(), {
      method: "PATCH",
      token: auth(marketingUser),
      body: reschedulePayload("654321"),
    });

    expect(response.status).toBe(403);
    expect(bookings[0]).toMatchObject({ date: "2099-12-30", time: "10:00", placeSlot: 1, status: "Cancelled" });
  });

  test.each([
    ["Customer", auth(customerUser), 403],
    ["Unauthenticated", "", 401],
  ])("%s cannot reschedule regardless of supplied credential", async (_label, token, expectedStatus) => {
    seedCancelledRescheduleBooking();
    const response = await request(reschedulePath(), {
      method: "PATCH",
      token,
      body: reschedulePayload("654321"),
    });

    expect(response.status).toBe(expectedStatus);
    expect(bookings[0]).toMatchObject({ date: "2099-12-30", time: "10:00", placeSlot: 1, status: "Cancelled" });
  });

  test("protected reschedule payload fields are rejected and do not mutate authoritative booking data", async () => {
    seedCancelledRescheduleBooking();
    const original = clone(bookings[0]);
    const response = await request(reschedulePath(), {
      method: "PATCH",
      token: auth(adminUser),
      body: reschedulePayload("123456", {
        customer: "Other Customer",
        service: "Car Wash",
        promoId: "FORGED-PROMO",
        assigned: "Detailer Two",
      }),
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Reschedule can only update date, time, and place slot/);
    expect(bookings[0]).toEqual(original);
  });

  test("non-Cancelled bookings cannot use the dedicated Cancelled reschedule route", async () => {
    seedScheduledBooking();
    const response = await request("/api/admin/bookings/B-RESCHEDULE/reschedule", {
      method: "PATCH",
      token: auth(adminUser),
      body: reschedulePayload("123456"),
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Only cancelled bookings can be rescheduled through this workflow.");
    expect(bookings[0]).toMatchObject({ date: "2099-12-30", time: "10:00", placeSlot: 1, status: "Scheduled" });
  });

  test("same date, time, and place slot conflict is rejected at reschedule submit time", async () => {
    seedCancelledRescheduleBooking();
    bookings.push({ id: "B-ACTIVE", date: "2099-12-31", time: "13:00", placeSlot: 2, status: "Scheduled", service: "Ceramic Coating" });
    const response = await request(reschedulePath(), {
      method: "PATCH",
      token: auth(salesAssociateUser),
      body: reschedulePayload("654321"),
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/already booked/);
    expect(bookings[0]).toMatchObject({ date: "2099-12-30", time: "10:00", placeSlot: 1, status: "Cancelled" });
  });

  test.each([
    ["same date and time with different place slot", { date: "2099-12-31", time: "13:00", placeSlot: 3 }],
    ["same date and place slot with different time", { date: "2099-12-31", time: "10:00", placeSlot: 2 }],
    ["same time and place slot with different date", { date: "2099-12-30", time: "13:00", placeSlot: 2 }],
    ["same exact slot held only by another Cancelled booking", { date: "2099-12-31", time: "13:00", placeSlot: 2, status: "Cancelled" }],
  ])("%s does not block dedicated reschedule", async (_label, blocker) => {
    seedCancelledRescheduleBooking();
    bookings.push({ id: "B-BLOCKER", service: "Ceramic Coating", ...blocker });
    const response = await request(reschedulePath(), {
      method: "PATCH",
      token: auth(adminUser),
      body: reschedulePayload("123456"),
    });

    expect(response.status).toBe(200);
    expect(bookings[0]).toMatchObject({ date: "2099-12-31", time: "13:00", placeSlot: 2, status: "Scheduled" });
  });

  test("rescheduling to its own former slot does not conflict with itself", async () => {
    seedCancelledRescheduleBooking();
    const response = await request(reschedulePath(), {
      method: "PATCH",
      token: auth(adminUser),
      body: reschedulePayload("123456", { date: "2099-12-30", time: "10:00", placeSlot: 1 }),
    });

    expect(response.status).toBe(200);
    expect(bookings[0]).toMatchObject({ date: "2099-12-30", time: "10:00", placeSlot: 1, status: "Scheduled" });
  });

  test.each([
    ["General Manager", generalManagerUser],
    ["Sales Associate", salesAssociateUser],
  ])("%s Pending customer booking initial scheduling remains allowed without verified downpayment", async (_label, actor) => {
    seedPendingBooking();
    const response = await request("/api/admin/bookings/B-PENDING", {
      method: "PUT",
      token: auth(actor),
      body: {
        ...bookings[0],
        date: "2099-12-31",
        time: "10:00",
        placeSlot: 1,
        status: "Scheduled",
        specialPin: "654321",
      },
    });

    expect(response.status).toBe(200);
    expect(bookings[0]).toMatchObject({ date: "2099-12-31", time: "10:00", placeSlot: 1, status: "Scheduled" });
  });

  test("Sales Associate may perform an eligible ordinary booking assignment edit and audits authenticated actor", async () => {
    seedScheduledBooking();
    const response = await request("/api/admin/bookings/B-RESCHEDULE", {
      method: "PUT",
      token: auth(salesAssociateUser),
      body: {
        ...bookings[0],
        assigned: "STF-2",
        auditUser: "admin@example.com",
        userType: "Admin",
        role: "Admin",
      },
    });

    expect(response.status).toBe(200);
    expect(bookings[0]).toMatchObject({ assigned: "Detailer Two", status: "Scheduled" });
    expect(auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "sales@example.com",
        targetId: "B-RESCHEDULE",
      }),
    ]));
  });

  test("Sales Associate may cancel an eligible booking with Staff PIN and cannot forge audit actor", async () => {
    seedScheduledBooking();
    const response = await request("/api/admin/bookings/B-RESCHEDULE", {
      method: "PUT",
      token: auth(salesAssociateUser),
      body: {
        ...bookings[0],
        status: "Cancelled",
        specialPin: "654321",
        auditUser: "admin@example.com",
        userType: "Admin",
        role: "Admin",
      },
    });

    expect(response.status).toBe(200);
    expect(bookings[0].status).toBe("Cancelled");
    expect(auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "sales@example.com",
        targetId: "B-RESCHEDULE",
        meta: expect.objectContaining({
          status: "Cancelled",
        }),
      }),
    ]));
  });
});

describe("Payment verification state remains separate from booking status", () => {
  test("General Manager verifies submitted downpayment proof with Staff special PIN and leaves booking status unchanged", async () => {
    seedPaymentReviewBooking();
    const response = await request("/api/admin/payments/PAY-GM-REVIEW", {
      method: "PUT",
      token: auth(generalManagerUser),
      body: {
        ...payments[0],
        downPaymentStatus: "Paid",
        downPaymentNotes: "Verified by GM",
        specialPin: "654321",
        accountName: "General Manager",
      },
    });

    expect(response.status).toBe(200);
    expect(payments[0]).toMatchObject({
      downPaymentStatus: "Paid",
      downPaymentReviewStatus: "Verified",
      downPaymentVerifiedBy: "gm@example.com",
    });
    expect(bookings[0].status).toBe("Scheduled");
  });

  test("Sales Associate verifies submitted downpayment proof with Staff special PIN and leaves booking status unchanged", async () => {
    seedPaymentReviewBooking();
    const response = await request("/api/admin/payments/PAY-GM-REVIEW", {
      method: "PUT",
      token: auth(salesAssociateUser),
      body: {
        ...payments[0],
        downPaymentStatus: "Paid",
        downPaymentNotes: "Verified by Sales Associate",
        specialPin: "654321",
        accountName: "Sales Associate",
      },
    });

    expect(response.status).toBe(200);
    expect(payments[0]).toMatchObject({
      downPaymentStatus: "Paid",
      downPaymentReviewStatus: "Verified",
      downPaymentVerifiedBy: "sales@example.com",
    });
    expect(bookings[0].status).toBe("Scheduled");
  });

  test("Sales Associate payment verification rejects Admin special PIN as a Staff-scope credential failure", async () => {
    seedPaymentReviewBooking();
    const originalPayment = clone(payments[0]);
    const response = await request("/api/admin/payments/PAY-GM-REVIEW", {
      method: "PUT",
      token: auth(salesAssociateUser),
      body: {
        ...payments[0],
        downPaymentStatus: "Paid",
        specialPin: "123456",
        accountName: "Sales Associate",
      },
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Incorrect staff special PIN.");
    expect(payments[0]).toEqual(originalPayment);
    expect(bookings[0].status).toBe("Scheduled");
  });

  test("Sales Associate verifies submitted final payment proof and preserves proof metadata", async () => {
    seedFinalPaymentReviewBooking();
    const response = await request("/api/admin/payments/PAY-FINAL-REVIEW", {
      method: "PUT",
      token: auth(salesAssociateUser),
      body: {
        ...payments[0],
        finalPaymentStatus: "Paid",
        finalPaymentNotes: "Verified by Sales Associate",
        finalPaymentProofUrl: "uploads/forged-proof.png",
        finalPaymentReference: "FORGED-REF",
        finalPaymentOcrAdvisoryStatus: "legacy",
        specialPin: "654321",
        accountName: "Sales Associate",
        auditUser: "admin@example.com",
        userType: "Admin",
        role: "Admin",
      },
    });

    expect(response.status).toBe(200);
    expect(payments[0]).toMatchObject({
      finalPaymentStatus: "Paid",
      finalPaymentReviewStatus: "Verified",
      finalPaymentVerifiedBy: "sales@example.com",
      finalPaymentReference: "FINAL-REF-1",
      finalPaymentProofUrl: "uploads/final-payment-proof.png",
      finalPaymentProofName: "final-payment-proof.png",
      finalPaymentOcrAdvisoryStatus: "matched_advisory",
    });
    expect(bookings[0].status).toBe("In Progress");
    expect(auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "sales@example.com",
        targetId: "PAY-FINAL-REVIEW",
      }),
    ]));
  });

  test("Sales Associate rejection requires Staff special PIN before mutating payment state", async () => {
    seedPaymentReviewBooking();
    const originalPayment = clone(payments[0]);
    const missingCredential = await request("/api/admin/payments/PAY-GM-REVIEW", {
      method: "PUT",
      token: auth(salesAssociateUser),
      body: {
        ...payments[0],
        downPaymentStatus: "Rejected",
        downPaymentNotes: "Reference did not match.",
      },
    });

    expect(missingCredential.status).toBe(401);
    expect(payments[0]).toEqual(originalPayment);

    const response = await request("/api/admin/payments/PAY-GM-REVIEW", {
      method: "PUT",
      token: auth(salesAssociateUser),
      body: {
        ...payments[0],
        downPaymentStatus: "Rejected",
        downPaymentNotes: "Reference did not match.",
        specialPin: "654321",
        accountName: "Sales Associate",
      },
    });

    expect(response.status).toBe(200);
    expect(payments[0]).toMatchObject({
      downPaymentStatus: "Rejected",
      downPaymentReviewStatus: "Rejected",
      downPaymentRejectedBy: "sales@example.com",
      downPaymentRejectionReason: "Reference did not match.",
    });
    expect(bookings[0].status).toBe("Scheduled");
  });

  test("General Manager payment verification rejects Admin special PIN as a Staff-scope credential failure", async () => {
    seedPaymentReviewBooking();
    const originalPayment = clone(payments[0]);
    const response = await request("/api/admin/payments/PAY-GM-REVIEW", {
      method: "PUT",
      token: auth(generalManagerUser),
      body: {
        ...payments[0],
        downPaymentStatus: "Paid",
        specialPin: "123456",
        accountName: "General Manager",
      },
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Incorrect staff special PIN.");
    expect(payments[0]).toEqual(originalPayment);
    expect(bookings[0].status).toBe("Scheduled");
  });

  test("Staff without verify authority cannot approve payment proof", async () => {
    seedPaymentReviewBooking();
    const response = await request("/api/admin/payments/PAY-GM-REVIEW", {
      method: "PUT",
      token: auth(marketingUser),
      body: {
        ...payments[0],
        downPaymentStatus: "Paid",
        specialPin: "654321",
        accountName: "Marketing",
      },
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("You can view payment status, but you cannot verify or update payments.");
    expect(payments[0].downPaymentStatus).toBe("For Verification");
  });

  test("customer downpayment proof submission keeps a Scheduled booking Scheduled while payment awaits verification", async () => {
    resetData([
      {
        id: "B-PAYMENT-STATUS",
        customer: "Customer One",
        customerEmail: "customer@example.com",
        vehicle: "Civic",
        plate: "ABC123",
        service: "Ceramic Coating",
        carSize: "Sedan / Small Car",
        assigned: "Detailer One",
        date: "2099-12-31",
        time: "10:00",
        placeSlot: 1,
        status: "Scheduled",
        amount: 1000,
        originalAmount: 1000,
      },
    ]);
    payments.push({
      id: "PAY-PROOF",
      bookingId: "B-PAYMENT-STATUS",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      service: "Ceramic Coating",
      totalAmount: 1000,
      finalAmount: 1000,
      amount: 1000,
      downPaymentRequired: true,
      downPaymentAmount: 300,
      downPaymentStatus: "Pending",
      finalPaymentStatus: "Pending",
      status: "Pending",
    });

    const response = await request("/api/admin/payments/PAY-PROOF", {
      method: "PUT",
      token: auth(customerUser),
      body: {
        downPaymentStatus: "For Verification",
        downPaymentMethod: "GCash",
        downPaymentReference: "DP-REF-1",
        downPaymentProofUrl: "uploads/downpayment-proof.png",
        downPaymentProofName: "downpayment-proof.png",
      },
    });

    expect(response.status).toBe(200);
    expect(payments[0].downPaymentStatus).toBe("For Verification");
    expect(bookings[0].status).toBe("Scheduled");
  });

  test("customer remaining-balance proof submission keeps an In Progress booking in its operational status", async () => {
    resetData([
      {
        id: "B-FINAL-PAYMENT",
        customer: "Customer One",
        customerEmail: "customer@example.com",
        vehicle: "Civic",
        plate: "ABC123",
        service: "Ceramic Coating",
        carSize: "Sedan / Small Car",
        assigned: "Detailer One",
        date: "2099-12-31",
        time: "10:00",
        placeSlot: 1,
        status: "In Progress",
        amount: 1000,
        originalAmount: 1000,
      },
    ]);
    payments.push({
      id: "PAY-FINAL-PROOF",
      bookingId: "B-FINAL-PAYMENT",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      service: "Ceramic Coating",
      totalAmount: 1000,
      finalAmount: 1000,
      amount: 1000,
      amountPaid: 300,
      downPaymentRequired: true,
      downPaymentAmount: 300,
      downPaymentStatus: "Paid",
      finalPaymentStatus: "Pending",
      status: "Pending",
    });

    const response = await request("/api/admin/payments/PAY-FINAL-PROOF", {
      method: "PUT",
      token: auth(customerUser),
      body: {
        finalPaymentStatus: "For Verification",
        finalPaymentMethod: "GCash",
        finalPaymentReference: "FINAL-REF-1",
        finalPaymentProofUrl: "uploads/final-payment-proof.png",
        finalPaymentProofName: "final-payment-proof.png",
      },
    });

    expect(response.status).toBe(200);
    expect(payments[0].finalPaymentStatus).toBe("For Verification");
    expect(bookings[0].status).toBe("In Progress");
  });
});

describe("Admin booking schedule conflict route protection", () => {
  test("same date, same time, and same place slot is rejected", async () => {
    resetData([{ id: "B-1", date: "2099-12-31", time: "10:00", placeSlot: 1, status: "Scheduled", service: "Ceramic Coating" }]);
    const response = await request("/api/admin/bookings", { method: "POST", body: basePayload });
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/already booked/);
    expect(bookings).toHaveLength(1);
  });

  test("same date and time with a different place slot is allowed", async () => {
    resetData([{ id: "B-1", date: "2099-12-31", time: "10:00", placeSlot: 1, status: "Scheduled", service: "Ceramic Coating" }]);
    const response = await request("/api/admin/bookings", { method: "POST", body: { ...basePayload, placeSlot: 2 } });
    expect(response.status).toBe(201);
    expect(bookings).toHaveLength(2);
  });

  test("same date and place slot with a different time is allowed", async () => {
    resetData([{ id: "B-1", date: "2099-12-31", time: "10:00", placeSlot: 1, status: "Scheduled", service: "Ceramic Coating" }]);
    const response = await request("/api/admin/bookings", { method: "POST", body: { ...basePayload, time: "13:00" } });
    expect(response.status).toBe(201);
    expect(bookings).toHaveLength(2);
  });

  test("different date with same time and place slot is allowed", async () => {
    resetData([{ id: "B-1", date: "2099-12-30", time: "10:00", placeSlot: 1, status: "Scheduled", service: "Ceramic Coating" }]);
    const response = await request("/api/admin/bookings", { method: "POST", body: basePayload });
    expect(response.status).toBe(201);
    expect(bookings).toHaveLength(2);
  });

  test("a Cancelled booking does not block reuse of its former schedule", async () => {
    resetData([{ id: "B-1", date: "2099-12-31", time: "10:00", placeSlot: 1, status: "Cancelled", service: "Ceramic Coating" }]);
    const response = await request("/api/admin/bookings", { method: "POST", body: basePayload });
    expect(response.status).toBe(201);
    expect(bookings).toHaveLength(2);
  });

  test("updating another booking into an occupied slot is rejected", async () => {
    resetData([
      { id: "B-1", customerEmail: "customer@example.com", date: "2099-12-31", time: "10:00", placeSlot: 1, status: "Scheduled", service: "Ceramic Coating", carSize: "Sedan / Small Car", amount: 1000 },
      { id: "B-2", customerEmail: "customer@example.com", date: "2099-12-31", time: "13:00", placeSlot: 2, status: "Scheduled", service: "Ceramic Coating", carSize: "Sedan / Small Car", amount: 1000 },
    ]);
    payments.push({ id: "PAY-2", bookingId: "B-2", totalAmount: 1000, finalAmount: 1000 });
    const response = await request("/api/admin/bookings/B-2", {
      method: "PUT",
      body: { ...bookings[1], date: "2099-12-31", time: "10:00", placeSlot: 1, specialPin: "123456", auditUser: "admin@example.com" },
    });
    expect(response.status).toBe(409);
    expect(bookings.find((booking) => booking.id === "B-2").placeSlot).toBe(2);
  });

  test("updating a booking without changing its own schedule does not conflict with itself", async () => {
    resetData([
      { id: "B-1", customerEmail: "customer@example.com", date: "2099-12-31", time: "10:00", placeSlot: 1, status: "Scheduled", service: "Ceramic Coating", carSize: "Sedan / Small Car", amount: 1000 },
    ]);
    payments.push({ id: "PAY-1", bookingId: "B-1", totalAmount: 1000, finalAmount: 1000 });
    const response = await request("/api/admin/bookings/B-1", {
      method: "PUT",
      body: { ...bookings[0], issueNote: "Updated note", auditUser: "admin@example.com" },
    });
    expect(response.status).toBe(200);
    expect(bookings).toHaveLength(1);
    expect(bookings[0].issueNote).toBe("Updated note");
  });

  test("updating a tracking assignment to another active detailer persists the normalized staff name", async () => {
    resetData([
      { id: "B-1", customer: "Customer One", customerEmail: "customer@example.com", vehicle: "Civic", plate: "ABC123", date: "2099-12-31", time: "10:00", placeSlot: 1, status: "Scheduled", service: "Ceramic Coating", carSize: "Sedan / Small Car", amount: 1000, assigned: "Detailer One" },
    ]);
    payments.push({ id: "PAY-1", bookingId: "B-1", totalAmount: 1000, finalAmount: 1000 });

    const response = await request("/api/admin/bookings/B-1", {
      method: "PUT",
      body: { ...bookings[0], assigned: "STF-2", auditUser: "admin@example.com" },
    });

    expect(response.status).toBe(200);
    expect(bookings[0].assigned).toBe("Detailer Two");
    expect(auditLogs.some((log) => log.action === "Updated service tracking" && log.meta?.assigned === "Detailer Two")).toBe(true);
  });

  test.each([
    ["nonexistent staff", "Ghost Detailer"],
    ["customer account", "Customer One"],
    ["deleted detailer", "Deleted Detailer"],
  ])("crafted assignment update to %s is rejected and does not mutate the booking", async (_label, assigned) => {
    resetData([
      { id: "B-1", customer: "Customer One", customerEmail: "customer@example.com", vehicle: "Civic", plate: "ABC123", date: "2099-12-31", time: "10:00", placeSlot: 1, status: "Scheduled", service: "Ceramic Coating", carSize: "Sedan / Small Car", amount: 1000, assigned: "Detailer One" },
    ]);
    payments.push({ id: "PAY-1", bookingId: "B-1", totalAmount: 1000, finalAmount: 1000 });

    const response = await request("/api/admin/bookings/B-1", {
      method: "PUT",
      body: { ...bookings[0], assigned, auditUser: "admin@example.com" },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Please choose an active Junior or Senior Detailer.");
    expect(bookings[0].assigned).toBe("Detailer One");
  });
});
