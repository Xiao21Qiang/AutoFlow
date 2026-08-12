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
const testUsers = [adminUser, generalManagerUser, marketingUser, customerUser, detailerUser, secondDetailerUser, deletedDetailerUser];

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

function seedScheduledBooking() {
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
  payments.push({ id: "PAY-RESCHEDULE", bookingId: "B-RESCHEDULE", totalAmount: 1000, finalAmount: 1000 });
}

function reschedulePayload(specialPin, extra = {}) {
  return {
    ...bookings[0],
    date: "2099-12-31",
    time: "13:00",
    placeSlot: 2,
    specialPin,
    ...extra,
  };
}

beforeAll(async () => {
  stub(__testModels.User, "findOne", (query) => doc(findUser(query)));
  stub(__testModels.User, "find", () => chain(testUsers));
  stub(__testModels.Service, "findOne", () => doc(service));
  stub(__testModels.Service, "find", () => chain([service]));
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
  stub(__testModels.Payment, "findOne", (query = {}) => doc(payments.find((payment) => payment.bookingId === query.bookingId)));
  stub(__testModels.Payment, "findOneAndUpdate", async (query, update) => {
    const index = payments.findIndex((payment) => payment.bookingId === query.bookingId);
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
  stub(__testModels.CustomerReward, "countDocuments", async () => 0);
  stub(__testModels.Review, "countDocuments", async () => 0);
  stub(__testModels.Commission, "findOne", () => doc(null));
  stub(__testModels.Commission, "countDocuments", async () => 0);
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

  test("General Manager cannot delete even a Cancelled booking with Staff credential or forged Admin body data", async () => {
    seedDeletedBooking("Cancelled");
    const response = await request("/api/admin/bookings/B-DELETE", {
      method: "DELETE",
      token: auth(generalManagerUser),
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

  test.each([
    ["incorrect Staff PIN", "000000"],
    ["Admin PIN supplied by Staff", "123456"],
  ])("General Manager %s is rejected as a Staff-scope credential failure", async (_label, value) => {
    const response = await validateCredential(generalManagerUser, {
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

describe("Booking reschedule special credential matrix", () => {
  test("General Manager may reschedule with the correct Staff PIN and audit as the authenticated GM", async () => {
    seedScheduledBooking();
    const response = await request("/api/admin/bookings/B-RESCHEDULE", {
      method: "PUT",
      token: auth(generalManagerUser),
      body: reschedulePayload("654321", { auditUser: "admin@example.com", userType: "Admin", role: "Admin" }),
    });

    expect(response.status).toBe(200);
    expect(bookings[0]).toMatchObject({ date: "2099-12-31", time: "13:00", placeSlot: 2 });
    expect(auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "gm@example.com",
        targetId: "B-RESCHEDULE",
      }),
    ]));
  });

  test.each([
    ["incorrect Staff PIN", "000000"],
    ["Admin PIN supplied by Staff", "123456"],
  ])("General Manager reschedule rejects %s", async (_label, specialPin) => {
    seedScheduledBooking();
    const response = await request("/api/admin/bookings/B-RESCHEDULE", {
      method: "PUT",
      token: auth(generalManagerUser),
      body: reschedulePayload(specialPin),
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Incorrect staff special PIN.");
    expect(bookings[0]).toMatchObject({ date: "2099-12-30", time: "10:00", placeSlot: 1 });
  });

  test("Admin may reschedule with the correct Admin PIN and audit as the authenticated Admin", async () => {
    seedScheduledBooking();
    const response = await request("/api/admin/bookings/B-RESCHEDULE", {
      method: "PUT",
      token: auth(adminUser),
      body: reschedulePayload("123456", { auditUser: "gm@example.com" }),
    });

    expect(response.status).toBe(200);
    expect(bookings[0]).toMatchObject({ date: "2099-12-31", time: "13:00", placeSlot: 2 });
    expect(auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "admin@example.com",
        targetId: "B-RESCHEDULE",
      }),
    ]));
  });

  test.each([
    ["incorrect Admin PIN", "000000"],
    ["Staff PIN supplied by Admin", "654321"],
  ])("Admin reschedule rejects %s", async (_label, specialPin) => {
    seedScheduledBooking();
    const response = await request("/api/admin/bookings/B-RESCHEDULE", {
      method: "PUT",
      token: auth(adminUser),
      body: reschedulePayload(specialPin),
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Incorrect admin special PIN.");
    expect(bookings[0]).toMatchObject({ date: "2099-12-30", time: "10:00", placeSlot: 1 });
  });

  test("unauthorized Staff cannot reschedule even with the correct Staff PIN", async () => {
    seedScheduledBooking();
    const response = await request("/api/admin/bookings/B-RESCHEDULE", {
      method: "PUT",
      token: auth(marketingUser),
      body: reschedulePayload("654321"),
    });

    expect(response.status).toBe(403);
    expect(bookings[0]).toMatchObject({ date: "2099-12-30", time: "10:00", placeSlot: 1 });
  });

  test.each([
    ["Customer", auth(customerUser), 403],
    ["Unauthenticated", "", 401],
  ])("%s cannot reschedule regardless of supplied credential", async (_label, token, expectedStatus) => {
    seedScheduledBooking();
    const response = await request("/api/admin/bookings/B-RESCHEDULE", {
      method: "PUT",
      token,
      body: reschedulePayload("654321"),
    });

    expect(response.status).toBe(expectedStatus);
    expect(bookings[0]).toMatchObject({ date: "2099-12-30", time: "10:00", placeSlot: 1 });
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
