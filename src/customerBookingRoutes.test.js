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

const customerUser = {
  id: "CUS-1",
  email: "customer@example.com",
  name: "Customer One",
  userType: "Customer",
  role: "New",
  status: "active",
  cars: [{ vehicle: "Civic", size: "Sedan / Small Car", plate: "ABC123" }],
};
const otherCustomer = {
  id: "CUS-2",
  email: "other@example.com",
  name: "Other Customer",
  userType: "Customer",
  role: "New",
  status: "active",
  cars: [{ vehicle: "Accord", size: "SUV", plate: "XYZ789" }],
};
const adminUser = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };
const detailerUser = { id: "STF-1", email: "detailer@example.com", name: "Detailer One", userType: "Staff", role: "Senior Detailer", status: "active" };

const enabledService = {
  id: "SVC-1",
  name: "Car Wash",
  enabled: true,
  price: 500,
  mins: 60,
  allowedArrivalTimes: ["10:00", "13:00"],
};
const disabledService = {
  id: "SVC-2",
  name: "Disabled Wash",
  enabled: false,
  price: 500,
  mins: 60,
  allowedArrivalTimes: ["10:00"],
};

const basePayload = {
  customer: "Spoofed Customer",
  customerEmail: "other@example.com",
  customerId: "CUS-2",
  vehicle: "Civic",
  plate: "ABC123",
  carSize: "Sedan / Small Car",
  service: "Car Wash",
  date: "2099-12-31",
  time: "10:00",
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

function auth(user = customerUser) {
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
  const users = [customerUser, otherCustomer, adminUser, detailerUser];
  if (query.id) return users.find((user) => user.id === query.id);
  if (query.email && typeof query.email === "string") return users.find((user) => user.email === query.email);
  if (query["cars.plate"]) {
    return users.find((user) => user.id !== query.id?.$ne && user.cars?.some((car) => car.plate === query["cars.plate"]));
  }
  return null;
}

function findService(query = {}) {
  const services = [enabledService, disabledService];
  return services.find((service) => service.name === query.name) || null;
}

function resetData(seedBookings = []) {
  bookings = seedBookings.map(clone);
  payments = [];
  auditLogs = [];
}

beforeAll(async () => {
  stub(__testModels.User, "findOne", (query) => doc(findUser(query)));
  stub(__testModels.User, "find", () => chain([customerUser, otherCustomer, adminUser, detailerUser]));
  stub(__testModels.Service, "findOne", (query) => doc(findService(query)));
  stub(__testModels.Service, "find", () => chain([enabledService, disabledService]));
  stub(__testModels.Booking, "find", () => chain(bookings));
  stub(__testModels.Booking, "countDocuments", async () => 0);
  stub(__testModels.Booking, "findOne", (query = {}) => doc(bookings.find((booking) => booking.id === query.id)));
  stub(__testModels.Booking, "create", async (payload) => {
    const saved = { ...clone(payload), createdAt: new Date("2099-01-01T00:00:00.000Z") };
    bookings.push(saved);
    return saved;
  });
  stub(__testModels.Payment, "create", async (payload) => {
    payments.push(clone(payload));
    return clone(payload);
  });
  stub(__testModels.Payment, "findOne", (query = {}) => doc(payments.find((payment) => payment.bookingId === query.bookingId)));
  stub(__testModels.Payment, "findOneAndUpdate", async () => null);
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

describe("Customer booking creation route validation", () => {
  test.each([
    ["vehicle", { vehicle: "" }],
    ["plate", { plate: "" }],
    ["service", { service: "" }],
    ["carSize", { carSize: "" }],
    ["date", { date: "" }],
    ["preferred time", { time: "" }],
  ])("missing %s is rejected and not persisted", async (_field, patch) => {
    const response = await request("/api/admin/bookings", {
      method: "POST",
      body: { ...basePayload, ...patch },
    });
    expect(response.status).toBe(400);
    expect(bookings).toHaveLength(0);
    expect(payments).toHaveLength(0);
  });

  test("unsupported car size is rejected", async () => {
    const response = await request("/api/admin/bookings", {
      method: "POST",
      body: { ...basePayload, carSize: "Monster Truck" },
    });
    expect(response.status).toBe(400);
    expect(bookings).toHaveLength(0);
  });

  test("disabled or invalid services are rejected", async () => {
    expect((await request("/api/admin/bookings", { method: "POST", body: { ...basePayload, service: "Disabled Wash" } })).status).toBe(400);
    expect((await request("/api/admin/bookings", { method: "POST", body: { ...basePayload, service: "Missing Service" } })).status).toBe(400);
    expect(bookings).toHaveLength(0);
  });

  test("a stored vehicle belonging to another customer is rejected", async () => {
    const response = await request("/api/admin/bookings", {
      method: "POST",
      body: { ...basePayload, vehicle: "Accord", plate: "XYZ789", carSize: "SUV" },
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/does not belong|another customer/);
    expect(bookings).toHaveLength(0);
  });

  test("an unauthenticated request is rejected", async () => {
    const response = await request("/api/admin/bookings", { method: "POST", token: "", body: basePayload });
    expect(response.status).toBe(401);
    expect(bookings).toHaveLength(0);
  });

  test("customer-supplied protected fields are ignored safely", async () => {
    const response = await request("/api/admin/bookings", {
      method: "POST",
      body: {
        ...basePayload,
        assigned: "Detailer One",
        placeSlot: 7,
        status: "Completed",
        amount: 1,
        finalAmount: 1,
        paymentStatus: "Paid",
        verified: true,
      },
    });
    expect(response.status).toBe(201);
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({
      customer: "Customer One",
      customerEmail: "customer@example.com",
      customerId: "CUS-1",
      assigned: "",
      status: "Pending",
      placeSlot: 0,
      vehicle: "Civic",
      plate: "ABC123",
      carSize: "Sedan / Small Car",
      service: "Car Wash",
      date: "2099-12-31",
      time: "10:00",
    });
  });

  test("a customer cannot force Scheduled or Completed status", async () => {
    const scheduled = await request("/api/admin/bookings", { method: "POST", body: { ...basePayload, status: "Scheduled" } });
    resetData();
    const completed = await request("/api/admin/bookings", { method: "POST", body: { ...basePayload, status: "Completed" } });
    expect(scheduled.status).toBe(201);
    expect(completed.status).toBe(201);
    expect(bookings).toHaveLength(1);
    expect(bookings[0].status).toBe("Pending");
  });

  test("a valid request creates exactly one Pending booking scoped to the authenticated customer", async () => {
    const response = await request("/api/admin/bookings", {
      method: "POST",
      body: { ...basePayload, customer: "Other Customer", customerEmail: "other@example.com", customerId: "CUS-2", plate: " abc123 " },
    });
    expect(response.status).toBe(201);
    expect(bookings).toHaveLength(1);
    expect(payments).toHaveLength(1);
    expect(bookings[0]).toMatchObject({
      customer: "Customer One",
      customerEmail: "customer@example.com",
      customerId: "CUS-1",
      status: "Pending",
      assigned: "",
      placeSlot: 0,
      vehicle: "Civic",
      plate: "ABC123",
      carSize: "Sedan / Small Car",
      service: "Car Wash",
      date: "2099-12-31",
      time: "10:00",
    });
  });
});
