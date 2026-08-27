/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

const { __testModels, app, filterBootstrapDataForRole, signJwt } = require("../server/server");

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
const juniorDetailerUser = { id: "STF-2", email: "junior@example.com", name: "Junior One", userType: "Staff", role: "Junior Detailer", status: "active" };
const inactiveSeniorDetailer = { id: "STF-3", email: "inactive-senior@example.com", name: "Inactive Senior", userType: "Staff", role: "Senior Detailer", status: "inactive" };
const inactiveJuniorDetailer = { id: "STF-4", email: "inactive-junior@example.com", name: "Inactive Junior", userType: "Staff", role: "Junior Detailer", status: "deactivated" };
const generalManagerUser = { id: "GM-1", email: "gm@example.com", name: "General Manager", userType: "Staff", role: "General Manager", status: "active" };
const salesManagerUser = { id: "SM-1", email: "sales-manager@example.com", name: "Sales Manager", userType: "Staff", role: "Sales Manager", status: "active" };
const salesAssociateUser = { id: "SA-1", email: "sales-associate@example.com", name: "Sales Associate", userType: "Staff", role: "Sales Associate", status: "active" };
const inventoryClerkUser = { id: "INV-1", email: "inventory@example.com", name: "Inventory Clerk", userType: "Staff", role: "Inventory Clerk", status: "active" };
const marketingUser = { id: "MKT-1", email: "marketing@example.com", name: "Marketing", userType: "Staff", role: "Marketing", status: "active" };
const allUsers = [
  customerUser,
  otherCustomer,
  adminUser,
  detailerUser,
  juniorDetailerUser,
  inactiveSeniorDetailer,
  inactiveJuniorDetailer,
  generalManagerUser,
  salesManagerUser,
  salesAssociateUser,
  inventoryClerkUser,
  marketingUser,
];

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
let customerRewardRecords;
let rewardRecords;
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
  if (query.id && typeof query.id === "string") return allUsers.find((user) => user.id === query.id);
  if (query.email && typeof query.email === "string") return allUsers.find((user) => user.email === query.email);
  if (query["cars.plate"]) {
    return allUsers.find((user) => user.id !== query.id?.$ne && user.cars?.some((car) => car.plate === query["cars.plate"]));
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
  customerRewardRecords = [];
  rewardRecords = [{
    id: "RWD-1",
    active: true,
    enabled: true,
    name: "Loyalty Discount",
    rewardType: "Fixed Discount",
    discountType: "Fixed",
    discountValue: 100,
    weight: 1,
    quantity: 1,
  }];
}

beforeAll(async () => {
  stub(__testModels.User, "findOne", (query) => doc(findUser(query)));
  stub(__testModels.User, "find", () => chain(allUsers));
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
  stub(__testModels.CustomerReward, "findOne", (query = {}) => doc(customerRewardRecords.find((reward) => reward.id === query.id)));
  stub(__testModels.CustomerReward, "countDocuments", async () => 0);
  stub(__testModels.Reward, "findOne", (query = {}) => doc(rewardRecords.find((reward) => reward.id === query.id)));
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
        assignedDetailerId: "STF-1",
        assignedDetailerName: "Detailer One",
        placeSlot: 7,
        status: "Completed",
        amount: 1,
        finalAmount: 1,
        paymentStatus: "Paid",
        verified: true,
        trackingState: "Completed",
        warrantyReleased: true,
        reviewedBy: "admin@example.com",
      },
    });
    expect(response.status).toBe(201);
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({
      customer: "Customer One",
      customerEmail: "customer@example.com",
      customerId: "CUS-1",
      assigned: "",
      assignedDetailerId: "",
      status: "Pending",
      placeSlot: 0,
      vehicle: "Civic",
      plate: "ABC123",
      carSize: "Sedan / Small Car",
      service: "Car Wash",
      date: "2099-12-31",
      time: "10:00",
    });
    expect(bookings[0].warrantyReleased).toBeUndefined();
    expect(bookings[0].trackingState).toBeUndefined();
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

  test.each([
    ["active Senior Detailer", "STF-1", "Detailer One"],
    ["active Junior Detailer", "STF-2", "Junior One"],
  ])("%s can be stored as a preferred detailer with a server-derived display name", async (_label, preferredDetailerId, expectedName) => {
    const response = await request("/api/admin/bookings", {
      method: "POST",
      body: {
        ...basePayload,
        preferredDetailerId,
        preferredDetailerName: "Forged Name",
        preferredDetailer: "Forged Name",
      },
    });

    expect(response.status).toBe(201);
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({
      preferredDetailerId,
      preferredDetailerName: expectedName,
      preferredDetailer: expectedName,
      assigned: "",
      assignedDetailerId: "",
    });
  });

  test.each([
    ["nonexistent ID", "NO-SUCH-DETAILER"],
    ["inactive Senior Detailer", "STF-3"],
    ["inactive Junior Detailer", "STF-4"],
    ["Customer ID", "CUS-1"],
    ["Admin ID", "ADM-1"],
    ["General Manager ID", "GM-1"],
    ["Sales Manager ID", "SM-1"],
    ["Sales Associate ID", "SA-1"],
    ["Inventory Clerk ID", "INV-1"],
    ["Marketing ID", "MKT-1"],
  ])("rejects forged preferred detailer using %s", async (_label, preferredDetailerId) => {
    const response = await request("/api/admin/bookings", {
      method: "POST",
      body: { ...basePayload, preferredDetailerId },
    });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe("preferredDetailerId");
    expect(bookings).toHaveLength(0);
    expect(payments).toHaveLength(0);
  });

  test("rejects free-text preferred detailer names without a stable detailer ID", async () => {
    const response = await request("/api/admin/bookings", {
      method: "POST",
      body: { ...basePayload, preferredDetailerName: "Someone Else" },
    });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe("preferredDetailerId");
    expect(bookings).toHaveLength(0);
  });

  test.each([
    ["empty vehicle", { vehicle: "   " }, "vehicle"],
    ["whitespace vehicle", { vehicle: "\t\n" }, "vehicle"],
    ["invalid plate", { plate: "AB@123" }, "plate"],
    ["invalid car size", { carSize: "Truck" }, "carSize"],
    ["past date", { date: "2000-01-01" }, "date"],
    ["malformed date", { date: "2099/12/31" }, "date"],
    ["unsupported time", { time: "11:00" }, "time"],
    ["nonexistent service", { service: "Missing Service" }, "service"],
    ["disabled service", { service: "Disabled Wash" }, "service"],
  ])("maps backend field validation for %s", async (_label, patch, field) => {
    const response = await request("/api/admin/bookings", {
      method: "POST",
      body: { ...basePayload, ...patch },
    });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe(field);
    expect(response.body.errors[field]).toBeTruthy();
    expect(bookings).toHaveLength(0);
    expect(payments).toHaveLength(0);
  });

  test("normalizes plate and vehicle snapshots before persistence", async () => {
    const response = await request("/api/admin/bookings", {
      method: "POST",
      body: { ...basePayload, vehicle: "  Civic  ", plate: " abc 123 " },
    });

    expect(response.status).toBe(201);
    expect(bookings[0]).toMatchObject({
      vehicle: "Civic",
      plate: "ABC123",
    });
  });

  test("rejects a reward that belongs to another Customer", async () => {
    customerRewardRecords.push({
      id: "CR-OTHER",
      rewardId: "RWD-1",
      customerId: otherCustomer.id,
      customerEmail: otherCustomer.email,
      customerName: otherCustomer.name,
      rewardName: "Other Customer Discount",
      rewardType: "Fixed Discount",
      rewardValue: "P100 off",
      discountType: "Fixed",
      discountValue: 100,
      status: "Available",
    });

    const response = await request("/api/admin/bookings", {
      method: "POST",
      body: { ...basePayload, rewardId: "CR-OTHER" },
    });

    expect(response.status).toBe(403);
    expect(response.body.field).toBe("rewardId");
    expect(bookings).toHaveLength(0);
    expect(payments).toHaveLength(0);
  });

  test("bootstrap synchronization keeps Customer scoped to authoritative operations changes", () => {
    const scoped = filterBootstrapDataForRole({
      bookings: [
        {
          id: "B-A",
          customerEmail: customerUser.email,
          customerId: customerUser.id,
          customer: "Customer One",
          service: "Car Wash",
          vehicle: "Civic",
          plate: "ABC123",
          carSize: "Sedan / Small Car",
          status: "Scheduled",
          date: "2099-12-31",
          time: "13:00",
          placeSlot: 4,
          preferredDetailerId: "STF-1",
          preferredDetailerName: "Detailer One",
          preferredDetailer: "Detailer One",
          assignedDetailerId: "STF-2",
          assigned: "Junior One",
        },
        {
          id: "B-B",
          customerEmail: otherCustomer.email,
          customerId: otherCustomer.id,
          customer: "Other Customer",
          service: "Car Wash",
          status: "Cancelled",
          date: "2099-12-30",
          time: "10:00",
          placeSlot: 2,
          assigned: "Detailer One",
        },
        {
          id: "B-CANCELLED",
          customerEmail: customerUser.email,
          customerId: customerUser.id,
          customer: "Customer One",
          service: "Car Wash",
          status: "Cancelled",
          date: "2099-12-29",
          time: "10:00",
          placeSlot: 0,
          cancelReason: "Shop emergency",
        },
      ],
      services: [],
      stockMonitoring: [],
      payments: [{ id: "PAY-A", bookingId: "B-A", customerEmail: customerUser.email, downPaymentStatus: "Paid", finalPaymentStatus: "Pending" }],
      users: allUsers,
      auditLogs: [],
      archivedAuditLogs: [],
      reviews: [],
      promos: [],
      quoteRequests: [],
      expenses: [],
      commissions: [],
      rewards: [],
      customerRewards: [],
      alerts: [],
      financialReport: { totals: {}, payments: [], expenses: [], commissions: [] },
      summary: {},
    }, customerUser);

    expect(scoped.bookings.map((booking) => booking.id)).toEqual(["B-A", "B-CANCELLED"]);
    expect(scoped.payments.map((payment) => payment.id)).toEqual(["PAY-A"]);
    expect(scoped.bookings[0]).toMatchObject({
      status: "Scheduled",
      date: "2099-12-31",
      time: "13:00",
      placeSlot: 4,
      preferredDetailerId: "STF-1",
      preferredDetailerName: "Detailer One",
      assignedDetailerId: "STF-2",
      assigned: "Junior One",
    });
    expect(scoped.bookings[1]).toMatchObject({
      status: "Cancelled",
      cancelReason: "Shop emergency",
    });
  });
});
