/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

const { __testModels, app, setTestBootstrapDataOverride, signJwt } = require("../server/server");

function auth(user) {
  return `Bearer ${signJwt({ sub: user.id, email: user.email, userType: user.userType, role: user.role })}`;
}

async function invoke(path, { method = "GET", token, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage();
    req.method = method;
    req.url = path;
    req.headers = token ? { authorization: token } : {};
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
      const rawBody = Buffer.concat(chunks);
      const contentType = String(res.getHeader("content-type") || "");
      let parsedBody = {};
      if (rawBody.length && contentType.includes("application/json")) {
        parsedBody = JSON.parse(rawBody.toString("utf8"));
      }
      resolve({ status: res.statusCode, headers: res.getHeaders(), body: parsedBody, rawBody });
      return res;
    };
    app.handle(req, res, reject);
  });
}

function chain(value) {
  return {
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    lean: async () => value,
  };
}

describe("Sales Associate Analytics backend routes", () => {
  const originals = [];
  const auditEvents = [];
  const originalFetch = global.fetch;
  const admin = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };
  const salesAssociate = { id: "SA-1", email: "sales@example.com", name: "Sales Associate", userType: "Staff", role: "Sales Associate", status: "active" };
  const seniorDetailer = { id: "SR-1", email: "senior@example.com", name: "Senior Detailer", userType: "Staff", role: "Senior Detailer", status: "active" };
  const users = [admin, salesAssociate, seniorDetailer];

  const analyticsData = {
    bookings: [
      { id: "BOOK-1", customer: "Customer One", customerEmail: "customer@example.com", service: "Full Detail", status: "Completed", date: "2026-08-01" },
    ],
    services: [{ id: "SVC-1", name: "Full Detail" }],
    stockMonitoring: [{ id: "STK-1", name: "Soap", currentStock: 1, maxStock: 10, reorderLevel: 3 }],
    payments: [
      {
        id: "PAY-1",
        bookingId: "BOOK-1",
        customer: "Customer One",
        customerEmail: "customer@example.com",
        service: "Full Detail",
        totalAmount: 1000,
        finalPaymentStatus: "Paid",
        finalPaymentVerifiedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    users,
    auditLogs: [],
    archivedAuditLogs: [],
    reviews: [{ id: "REV-1", rating: 5, customer: "Customer One" }],
    promos: [],
    quoteRequests: [],
    expenses: [{ id: "EXP-1", amount: 500 }],
    commissions: [{ id: "COM-1", worker: "Senior Detailer", earned: 100 }],
    rewards: [],
    customerRewards: [],
    alerts: [{ title: "Low stock" }],
    settings: { requiredDownPaymentAmount: 0 },
    summary: { paidRevenue: 1000, paidRevenueEvents: 1, totalSchedules: 1, completedCount: 1 },
    financialReport: {
      totals: { revenue: 1000, expenses: 500, commissions: 100 },
      payments: [{ id: "PAY-1" }],
      expenses: [{ id: "EXP-1" }],
      commissions: [{ id: "COM-1" }],
    },
  };

  function stub(model, method, implementation) {
    originals.push([model, method, model[method]]);
    model[method] = implementation;
  }

  beforeAll(() => {
    stub(__testModels.User, "findOne", (query = {}) => {
      const user = users.find((item) => item.id === query.id || item.email === query.email);
      return { lean: async () => user || null };
    });
    stub(__testModels.AuditLog, "create", async (payload) => {
      auditEvents.push(payload);
      return payload;
    });
    stub(__testModels.AuditLog, "find", () => chain([]));
    setTestBootstrapDataOverride(async () => analyticsData);
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: "invalid_api_key" } }),
    }));
  });

  afterAll(() => {
    originals.reverse().forEach(([model, method, original]) => {
      model[method] = original;
    });
    setTestBootstrapDataOverride(null);
    global.fetch = originalFetch;
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    auditEvents.length = 0;
    if (global.fetch?.mockClear) global.fetch.mockClear();
  });

  test("allows Sales Associate to export Analytics report and audits the authenticated actor", async () => {
    const response = await invoke("/api/admin/reports/analytics/csv", {
      token: auth(salesAssociate),
    });
    const text = response.rawBody.toString("utf8");

    expect(response.status).toBe(200);
    expect(String(response.headers["content-type"])).toContain("text/csv");
    expect(text).toContain("Summary");
    expect(text).toContain("Full Detail");
    expect(text).not.toContain("EXP-1");
    expect(text).not.toContain("COM-1");
    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "sales@example.com",
        action: "Report exported",
        meta: expect.objectContaining({
          reportType: "analytics",
          result: "success",
        }),
      }),
    ]));
  });

  test.each([
    ["financial", "/api/admin/reports/financial/csv"],
    ["stock", "/api/admin/reports/stock/csv"],
    ["audit logs", "/api/admin/reports/audit-logs/csv"],
    ["reward history", "/api/admin/reports/reward-history/csv"],
  ])("denies Sales Associate %s exports", async (_label, path) => {
    const response = await invoke(path, { token: auth(salesAssociate) });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("You do not have permission to export this report.");
    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "sales@example.com",
        action: "Report export denied",
      }),
    ]));
  });

  test("allows Sales Associate Analytics AI using backend-authoritative scoped data", async () => {
    const response = await invoke("/api/ai/analytics/interpret", {
      method: "POST",
      token: auth(salesAssociate),
      body: {
        analysisType: "descriptive",
        totals: {
          totalSales: 999999,
          totalBookings: 999999,
        },
        actor: "admin@example.com",
        role: "Admin",
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      available: true,
      fallback: true,
      source: "deterministic-fallback",
      analysisType: "descriptive",
    });
    expect(response.body.summary).toContain("Php 1,000");
    expect(response.body.summary).not.toContain("999999");
    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "sales@example.com",
        action: "AI request failed",
        targetId: "analytics-descriptive",
        meta: expect.objectContaining({
          aiFeature: "analytics-descriptive",
          result: "failed",
        }),
      }),
    ]));
  });

  test("denies Analytics AI to Staff without Analytics module access", async () => {
    const response = await invoke("/api/ai/analytics/interpret", {
      method: "POST",
      token: auth(seniorDetailer),
      body: { analysisType: "descriptive" },
    });

    expect(response.status).toBe(403);
  });
});
