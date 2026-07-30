/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

const { __testModels, app, signJwt } = require("../server/server");

jest.setTimeout(15000);

const adminUser = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };
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
const service = {
  id: "SVC-1",
  name: "Ceramic Coating",
  enabled: true,
  price: 1000,
  mins: 60,
  allowedArrivalTimes: ["10:00", "13:00"],
};

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
  if (query.id) return [adminUser, marketingUser, customerUser, detailerUser].find((user) => user.id === query.id);
  if (query.email && typeof query.email === "string") {
    return [adminUser, marketingUser, customerUser, detailerUser].find((user) => user.email === query.email);
  }
  if (query.$or) {
    return [adminUser, marketingUser, customerUser, detailerUser].find((user) =>
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

beforeAll(async () => {
  stub(__testModels.User, "findOne", (query) => doc(findUser(query)));
  stub(__testModels.User, "find", () => chain([adminUser, marketingUser, customerUser, detailerUser]));
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
    adminSpecialPinHash: "hash",
    adminSpecialPasswordHash: "hash",
    staffSpecialPinHash: "hash",
    staffSpecialPasswordHash: "hash",
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
      body: { ...bookings[1], date: "2099-12-31", time: "10:00", placeSlot: 1, auditUser: "admin@example.com" },
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
});
