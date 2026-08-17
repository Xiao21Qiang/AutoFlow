/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");

process.env.GROQ_API_KEY = "test-groq-key";
process.env.GROQ_MODEL = "test-groq-model";

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

const { __testModels, app, signJwt } = require("../server/server");

const adminUser = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };
const generalManagerUser = { id: "GM-1", email: "gm@example.com", name: "General Manager", userType: "Staff", role: "General Manager", status: "active" };
const salesAssociateUser = { id: "SA-1", email: "sales@example.com", name: "Sales Associate", userType: "Staff", role: "Sales Associate", status: "active" };
const marketingUser = { id: "MKT-1", email: "marketing@example.com", name: "Marketing", userType: "Staff", role: "Marketing", status: "active" };
const customerUser = { id: "CUS-1", email: "customer@example.com", name: "Customer", userType: "Customer", role: "New", status: "active" };
const seniorDetailerUser = { id: "STF-1", email: "senior@example.com", name: "Senior Detailer", userType: "Staff", role: "Senior Detailer", status: "active" };
const users = [adminUser, generalManagerUser, salesAssociateUser, marketingUser, customerUser, seniorDetailerUser];

const booking = {
  id: "B-AI-1",
  customer: "Customer",
  customerEmail: "customer@example.com",
  vehicle: "Civic",
  service: "Ceramic Coating",
  status: "Scheduled",
  assigned: "Detailer One",
  issueNote: "",
  issueTypes: [],
  issueMarkers: [],
};

let bookings = [];
let auditLogs = [];
const originals = [];
let originalFetch;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function doc(value) {
  return {
    lean: async () => (value ? clone(value) : null),
  };
}

function chain(value) {
  return {
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

async function request(path, { token = auth(), body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage();
    req.method = "POST";
    req.url = path;
    req.headers = {
      ...(token ? { authorization: token } : {}),
      "content-type": "application/json",
    };
    req.body = body;
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
      resolve({ status: res.statusCode, body: text ? JSON.parse(text) : {} });
      return res;
    };
    app.handle(req, res, reject);
  });
}

function findUser(query = {}) {
  if (query.id) return users.find((user) => user.id === query.id);
  if (query.email) return users.find((user) => user.email === query.email);
  return null;
}

function mockProviderJson(payload, { ok = true, status = 200 } = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  });
}

beforeAll(() => {
  originalFetch = global.fetch;
  stub(__testModels.User, "findOne", (query) => doc(findUser(query)));
  stub(__testModels.User, "find", () => chain(users));
  stub(__testModels.Booking, "findOne", (query = {}) => doc(bookings.find((item) => item.id === query.id)));
  stub(__testModels.AuditLog, "create", async (payload) => {
    auditLogs.push(clone(payload));
    return clone(payload);
  });
});

beforeEach(() => {
  bookings = [clone(booking)];
  auditLogs = [];
  mockProviderJson({
    model: "test-groq-model",
    choices: [{
      message: {
        content: JSON.stringify({
          cleanedUpIssueNote: "Paint blemish noted on the marked panel.",
          technicianFriendlyNote: "Inspect the marked panel for a paint blemish before coating.",
          suggestedNextAction: "Confirm prep requirements before service.",
          customerSafeSummary: "A marked area needs inspection before work begins.",
        }),
      },
    }],
  });
});

afterAll(() => {
  originals.reverse().forEach(([model, method, original]) => {
    model[method] = original;
  });
  global.fetch = originalFetch;
  consoleErrorSpy.mockRestore();
});

function aiBody(overrides = {}) {
  return {
    bookingId: "B-AI-1",
    problemLocation: "Marker 1",
    issueMarkers: [{ id: 1, x: 50, y: 50, issueType: "Paint blemish" }],
    issueTypes: ["Paint blemish"],
    serviceType: "Forged Service",
    vehicleDetails: "Forged Vehicle",
    currentTrackingStatus: "Forged Status",
    auditUser: "admin@example.com",
    actorRole: "Admin",
    ...overrides,
  };
}

describe("tracking issue note AI route", () => {
  test("allows Admin and returns the canonical DTO without mutating tracking data", async () => {
    const response = await request("/api/ai/tracking/issue-note", { token: auth(adminUser), body: aiBody() });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      available: true,
      feature: "tracking-issue-note",
      model: "test-groq-model",
      technicianFriendlyNote: "Inspect the marked panel for a paint blemish before coating.",
      suggestedNextAction: "Confirm prep requirements before service.",
      customerSafeSummary: "A marked area needs inspection before work begins.",
      suggestion: "Inspect the marked panel for a paint blemish before coating.",
    });
    expect(bookings[0]).toEqual(booking);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("allows General Manager as Staff and attributes audit to the authenticated GM", async () => {
    const response = await request("/api/ai/tracking/issue-note", { token: auth(generalManagerUser), body: aiBody() });

    expect(response.status).toBe(200);
    const audit = auditLogs.find((log) => log.targetId === "tracking-issue-note");
    expect(audit.userId).toBe("gm@example.com");
    expect(audit.meta.actorRole).toBe("general manager");
    expect(audit.meta.actorUserType).toBe("staff");
    expect(JSON.stringify(audit)).not.toContain("test-groq-key");
  });

  test("allows Sales Associate as Staff and attributes audit to the authenticated Sales Associate", async () => {
    const response = await request("/api/ai/tracking/issue-note", {
      token: auth(salesAssociateUser),
      body: aiBody({ auditUser: "admin@example.com", actorRole: "Admin", actorUserType: "Admin" }),
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      available: true,
      technicianFriendlyNote: "Inspect the marked panel for a paint blemish before coating.",
      suggestedNextAction: "Confirm prep requirements before service.",
      customerSafeSummary: "A marked area needs inspection before work begins.",
    });
    const audit = auditLogs.find((log) => log.targetId === "tracking-issue-note");
    expect(audit.userId).toBe("sales@example.com");
    expect(audit.meta.actorRole).toBe("sales associate");
    expect(audit.meta.actorUserType).toBe("staff");
    expect(JSON.stringify(audit)).not.toContain("test-groq-key");
  });

  test("denies unauthorized Staff, Customer, unauthenticated, and forged actor requests", async () => {
    await expect(request("/api/ai/tracking/issue-note", { token: auth(marketingUser), body: aiBody() }))
      .resolves.toMatchObject({ status: 403 });
    await expect(request("/api/ai/tracking/issue-note", { token: auth(customerUser), body: aiBody() }))
      .resolves.toMatchObject({ status: 403 });
    await expect(request("/api/ai/tracking/issue-note", { token: "", body: aiBody() }))
      .resolves.toMatchObject({ status: 401 });
    await expect(request("/api/ai/tracking/issue-note", { token: auth(marketingUser), body: aiBody({ actorRole: "Admin", actorUserType: "Admin" }) }))
      .resolves.toMatchObject({ status: 403 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("denies authorized Staff when bookingId points at an unauthorized tracking record", async () => {
    const response = await request("/api/ai/tracking/issue-note", { token: auth(seniorDetailerUser), body: aiBody() });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("You do not have permission to view this tracking record.");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("normalizes provider text fallback into the canonical tracking DTO", async () => {
    mockProviderJson({
      model: "test-groq-model",
      choices: [{ message: { content: "Inspect marker 1 for a paint blemish before service." } }],
    });

    const response = await request("/api/ai/tracking/issue-note", { token: auth(adminUser), body: aiBody() });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      available: true,
      technicianFriendlyNote: "Inspect marker 1 for a paint blemish before service.",
      suggestion: "Inspect marker 1 for a paint blemish before service.",
    });
  });

  test("returns a safe provider-auth failure DTO when the provider rejects configuration", async () => {
    mockProviderJson({
      error: { message: "Invalid API Key", code: "expired_api_key", type: "invalid_request_error" },
    }, { ok: false, status: 401 });

    const response = await request("/api/ai/tracking/issue-note", { token: auth(adminUser), body: aiBody() });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      available: false,
      feature: "tracking-issue-note",
      message: "AI provider configuration needs attention.",
      errorCategory: "provider-auth",
      providerStatus: 401,
    });
    const audit = auditLogs.find((log) => log.action === "AI request failed");
    expect(audit.meta.errorCategory).toBe("provider-auth");
    expect(JSON.stringify(response.body)).not.toContain("test-groq-key");
    expect(JSON.stringify(audit)).not.toContain("test-groq-key");
  });
});
