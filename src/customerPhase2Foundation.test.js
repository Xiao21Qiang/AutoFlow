/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

process.env.EMAIL_PROVIDER = "smtp";
process.env.EMAIL_USER = "noreply@example.com";
process.env.EMAIL_PASS = "test-password";
process.env.EMAIL_FROM = "noreply@example.com";

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn(async () => ({ accepted: ["customer@example.com"] })),
  })),
}));

jest.mock("../server/db", () => ({
  connectToDatabase: jest.fn(),
  getDatabaseName: () => "test",
  getDatabaseState: () => "connected",
  getMongoEnvName: () => "test",
}));

const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

const {
  __testModels,
  __testSignupOtpStore,
  app,
  filterBootstrapDataForRole,
  signJwt,
  validatePublicCustomerSignupPayload,
} = require("../server/server");

const originals = [];

const users = [];
const auditLogs = [];

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

function stub(model, method, implementation) {
  originals.push([model, method, model[method]]);
  model[method] = implementation;
}

function findUser(query = {}) {
  if (query.id) return users.find((user) => user.id === query.id) || null;
  if (query.email) return users.find((user) => user.email === query.email) || null;
  if (query.phone) return users.find((user) => user.phone === query.phone) || null;
  return null;
}

function auth(user) {
  return `Bearer ${signJwt({ sub: user.id, email: user.email, userType: user.userType, role: user.role })}`;
}

async function request(path, { method = "GET", token = "", body } = {}) {
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

const validSignup = {
  firstName: "Juan",
  lastName: "Santos",
  email: "JUAN@example.com",
  phone: "09123456789",
  password: "Customer1!",
  confirmPassword: "Customer1!",
  channel: "email",
};

beforeAll(() => {
  stub(__testModels.User, "findOne", (query) => doc(findUser(query)));
  stub(__testModels.User, "findOneAndUpdate", async (query, payload) => {
    const index = users.findIndex((user) => user.id === query.id);
    if (index === -1) return null;
    users[index] = { ...users[index], ...clone(payload) };
    return clone(users[index]);
  });
  stub(__testModels.User, "create", async (payload) => {
    const saved = { ...clone(payload), _id: payload.id || `mongo-${users.length + 1}` };
    users.push(saved);
    return saved;
  });
  stub(__testModels.AuditLog, "create", async (payload) => {
    auditLogs.push(clone(payload));
    return clone(payload);
  });
});

afterAll(() => {
  originals.reverse().forEach(([model, method, original]) => {
    model[method] = original;
  });
  __testSignupOtpStore.clear();
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

beforeEach(() => {
  users.length = 0;
  auditLogs.length = 0;
  __testSignupOtpStore.clear();
});

async function requestAndVerifySignup(body) {
  const verificationId = `OTP-${__testSignupOtpStore.size + 1}`;
  __testSignupOtpStore.set(verificationId, {
    ...validatePublicCustomerSignupPayload(body),
    otp: "123456",
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
  });
  const verifyResponse = await request("/api/auth/signup/verify-otp", {
    method: "POST",
    body: {
      verificationId,
      otp: "123456",
    },
  });
  return verifyResponse;
}

describe("Customer Phase 2 public signup foundation", () => {
  test("normal public signup creates an active Customer/New account after OTP verification", async () => {
    const response = await requestAndVerifySignup(validSignup);

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      email: "juan@example.com",
      userType: "customer",
      role: "new",
      first: "Juan",
      last: "Santos",
      phone: "09123456789",
    });
    expect(users[0]).toMatchObject({
      email: "juan@example.com",
      userType: "Customer",
      role: "New",
      status: "active",
    });
    expect(users[0]).not.toHaveProperty("confirmPassword");
  });

  test.each([
    ["forged userType", { userType: "Admin" }],
    ["forged role", { role: "General Manager" }],
    ["forged staffRole", { staffRole: "Senior Detailer" }],
    ["forged accountType", { accountType: "Staff" }],
    ["forged permissions", { permissions: ["module.analytics", "users.manageStaff"] }],
    ["forged admin flag", { isAdmin: true, capabilities: ["admin"] }],
  ])("%s cannot elevate a verified public signup", async (_label, forgedFields) => {
    const response = await requestAndVerifySignup({
      ...validSignup,
      ...forgedFields,
      email: `${_label.replace(/\W+/g, "-")}@example.com`,
      phone: "09123456780",
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ userType: "customer", role: "new" });
    expect(users[0]).toMatchObject({ userType: "Customer", role: "New" });
    expect(users[0].permissions).toBeUndefined();
    users.length = 0;
    __testSignupOtpStore.clear();
  });

  test.each([
    ["blank first name", { firstName: "   " }, "firstName"],
    ["blank last name", { lastName: "   " }, "lastName"],
    ["invalid first name", { firstName: "Juan123" }, "firstName"],
    ["invalid email", { email: "not-an-email" }, "email"],
    ["invalid phone", { phone: "02123456789" }, "phone"],
    ["non-digit phone", { phone: "0912-345-678" }, "phone"],
    ["weak password", { password: "password", confirmPassword: "password" }, "password"],
    ["confirm mismatch", { confirmPassword: "Customer2!" }, "confirmPassword"],
  ])("backend rejects bypassed signup validation: %s", async (_label, patch, field) => {
    const response = await request("/api/auth/signup/request-otp", {
      method: "POST",
      body: { ...validSignup, ...patch },
    });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe(field);
    expect(response.body.errors[field]).toBeTruthy();
    expect(users).toHaveLength(0);
    expect(__testSignupOtpStore.size).toBe(0);
  });

  test("duplicate email and phone are mapped to field-specific errors", async () => {
    users.push({
      id: "CUS-EXISTING",
      email: "juan@example.com",
      phone: "09123456789",
      userType: "Customer",
      role: "New",
      status: "active",
    });

    const duplicateEmail = await request("/api/auth/signup/request-otp", {
      method: "POST",
      body: { ...validSignup, phone: "09123456788" },
    });
    expect(duplicateEmail.status).toBe(409);
    expect(duplicateEmail.body).toMatchObject({ field: "email", errors: { email: "That email is already registered." } });

    const duplicatePhone = await request("/api/auth/signup/request-otp", {
      method: "POST",
      body: { ...validSignup, email: "new@example.com" },
    });
    expect(duplicatePhone.status).toBe(409);
    expect(duplicatePhone.body).toMatchObject({ field: "phone", errors: { phone: "That contact number is already registered." } });
  });
});

describe("Customer Phase 2 bootstrap and profile boundaries", () => {
  const customerA = { id: "CUS-A", email: "same@example.com", name: "Same Name", first: "Same", last: "Name", userType: "Customer", role: "New", phone: "09111111111", status: "active" };
  const customerB = { id: "CUS-B", email: "other@example.com", name: "Same Name", first: "Same", last: "Name", userType: "Customer", role: "New", phone: "09222222222", status: "active" };

  test("Customer A bootstrap excludes Customer B private data and operations datasets", () => {
    const scoped = filterBootstrapDataForRole({
      bookings: [
        { id: "B-A", customerEmail: customerA.email, customerId: customerA.id, customer: "Old Name", service: "Wash" },
        { id: "B-B", customerEmail: customerB.email, customerId: customerB.id, customer: "Same Name", service: "Coating" },
      ],
      services: [{ id: "SVC-1", name: "Wash", enabled: true }],
      stockMonitoring: [{ id: "STK-1", name: "Soap" }],
      payments: [
        { id: "PAY-A", bookingId: "B-A", customerEmail: customerA.email, customer: "Old Name" },
        { id: "PAY-B", bookingId: "B-B", customerEmail: customerB.email, customer: "Same Name" },
      ],
      users: [
        { ...customerA, password: "secret" },
        customerB,
        { id: "ADM", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active", password: "secret" },
        { id: "SD", email: "senior@example.com", phone: "09999999999", name: "Senior One", userType: "Staff", role: "Senior Detailer", status: "active", password: "secret" },
        { id: "JR", email: "junior@example.com", phone: "09888888888", name: "Junior One", userType: "Staff", role: "Junior Detailer", status: "active", password: "secret" },
        { id: "GM", email: "gm@example.com", name: "GM", userType: "Staff", role: "General Manager", status: "active" },
        { id: "OLD", email: "old@example.com", name: "Old Detailer", userType: "Staff", role: "Senior Detailer", status: "deactivated" },
      ],
      auditLogs: [
        { id: "AUD-A", userId: customerA.email, action: "Updated booking", ts: new Date().toISOString(), meta: { customerEmail: customerA.email } },
        { id: "AUD-B", userId: customerB.email, action: "Updated booking", ts: new Date().toISOString(), meta: { customerEmail: customerB.email } },
        { id: "AUD-STOCK", userId: "admin@example.com", action: "Restocked stock monitoring item", ts: new Date().toISOString() },
      ],
      archivedAuditLogs: [],
      reviews: [
        { id: "REV-A", customerEmail: customerA.email, customer: "Old Name" },
        { id: "REV-B", customerEmail: customerB.email, customer: "Same Name" },
      ],
      promos: [{ id: "PRO-A", status: "Active" }, { id: "PRO-D", status: "Draft" }],
      quoteRequests: [{ id: "QTE-1" }],
      expenses: [{ id: "EXP-1" }],
      commissions: [{ id: "COM-1" }],
      rewards: [{ id: "RWD-1", active: true }],
      customerRewards: [
        { id: "CR-A", customerId: customerA.id, customerEmail: customerA.email },
        { id: "CR-B", customerId: customerB.id, customerEmail: customerB.email },
      ],
      alerts: [{ title: "Low stock" }],
      financialReport: {
        totals: { revenue: 999999, expenses: 5000 },
        payments: [{ id: "PAY-B" }],
        expenses: [{ id: "EXP-1" }],
        commissions: [{ id: "COM-1" }],
      },
      summary: { paidRevenue: 999999, lowStockCount: 1 },
    }, customerA);

    expect(scoped.bookings.map((item) => item.id)).toEqual(["B-A"]);
    expect(scoped.payments.map((item) => item.id)).toEqual(["PAY-A"]);
    expect(scoped.reviews.map((item) => item.id)).toEqual(["REV-A"]);
    expect(scoped.customerRewards.map((item) => item.id)).toEqual(["CR-A"]);
    expect(scoped.auditLogs.map((item) => item.id)).toEqual(["AUD-A"]);
    expect(scoped.stockMonitoring).toEqual([]);
    expect(scoped.quoteRequests).toEqual([]);
    expect(scoped.expenses).toEqual([]);
    expect(scoped.commissions).toEqual([]);
    expect(scoped.alerts).toEqual([]);
    expect(scoped.promos.map((item) => item.id)).toEqual(["PRO-A"]);
    expect(scoped.financialReport).toEqual({ totals: {}, payments: [], expenses: [], commissions: [] });
    expect(scoped.summary.paidRevenue).toBe(0);
    expect(scoped.summary.lowStockCount).toBeUndefined();
    expect(scoped.users.map((item) => item.id)).toEqual(["CUS-A", "SD", "JR"]);
    expect(scoped.users.find((item) => item.id === "SD")).toEqual({
      id: "SD",
      name: "Senior One",
      fullName: "Senior One",
      userType: "Staff",
      role: "Senior Detailer",
    });
    expect(JSON.stringify(scoped)).not.toMatch(/admin@example\.com|senior@example\.com|09999999999|Restocked stock|secret/);
  });

  test("Customer A cannot mutate Customer B profile, while self-profile update remains allowed", async () => {
    users.push(customerA, customerB);

    const tamper = await request("/api/admin/users/CUS-B?refreshSession=1", {
      method: "PUT",
      token: auth(customerA),
      body: { first: "Mallory", last: "Tamper", email: "mallory@example.com", phone: "09333333333" },
    });
    expect(tamper.status).toBe(403);
    expect(users.find((user) => user.id === "CUS-B").email).toBe(customerB.email);

    const selfUpdate = await request("/api/admin/users/CUS-A?refreshSession=1", {
      method: "PUT",
      token: auth(customerA),
      body: { first: "Updated", last: "Customer", email: "updated@example.com", phone: "09444444444" },
    });
    expect(selfUpdate.status).toBe(200);
    expect(selfUpdate.body.user).toMatchObject({
      id: "CUS-A",
      email: "updated@example.com",
      userType: "customer",
      role: "new",
      first: "Updated",
      last: "Customer",
      phone: "09444444444",
    });
  });
});
