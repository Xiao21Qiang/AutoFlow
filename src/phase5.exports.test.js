/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const exportDomain = require("../server/domain/exports");
const invoiceDomain = require("../server/domain/invoices");
const { ACTION_KEYS, __testModels, app, canExportReport, parseExportFilters, setTestBootstrapDataOverride, signJwt } = require("../server/server");

const baseData = {
  bookings: [
    {
      id: "BK-500",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      vehicle: "Civic",
      plate: "ABC123",
      service: "Ceramic Coating",
      assigned: "Senior One",
      date: "2026-07-19",
      time: "09:00",
      placeSlot: 1,
      status: "Rescheduled",
    },
  ],
  payments: [
    {
      id: "PAY-500",
      bookingId: "BK-500",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      service: "Ceramic Coating",
      originalAmount: 1200,
      totalAmount: 1000,
      finalAmount: 1000,
      promoDiscountAmount: 100,
      rewardDiscountAmount: 100,
      downPaymentRequired: true,
      downPaymentAmount: 300,
      downPaymentStatus: "Paid",
      finalPaymentStatus: "For Verification",
      downPaymentReference: "=HYPERLINK(\"bad\")",
      finalPaymentReference: "+SUM(1,2)",
    },
  ],
  stockMonitoring: [
    { id: "STK-1", name: "@command", category: "Supplies", currentStock: 2, maxStock: 10, reorderLevel: 3 },
  ],
  services: [],
  auditLogs: [],
  reviews: [],
  promos: [],
  rewards: [],
  customerRewards: [],
  expenses: [{ id: "EXP-1", date: "2026-07-19", description: "-1+2", category: "Supplies", amount: 200, paidBy: "Admin" }],
  commissions: [{ id: "COM-1", bookingId: "BK-500", date: "2026-07-19", worker: "Senior One", role: "Senior Detailer", service: "Ceramic Coating", earned: 50, rate: 5, status: "Pending" }],
  quoteRequests: [],
};

jest.setTimeout(15000);

describe("Phase 5 export helpers", () => {
  test("protects CSV cells from spreadsheet formula injection without corrupting numeric columns", () => {
    const csv = exportDomain.buildCsv({
      columns: [{ label: "Text" }, { label: "Amount", numeric: true }],
      rows: [
        ["=HYPERLINK(\"https://bad\")", 10],
        ["+SUM(1,2)", 20],
        ["-1+2", 30],
        ["@command", 40],
      ],
    });

    expect(csv).toContain('"\'=HYPERLINK(""https://bad"")"');
    expect(csv).toContain('"\'+SUM(1,2)"');
    expect(csv).toContain('"\'-1+2"');
    expect(csv).toContain('"\'@command"');
    expect(csv).toContain(",10");
  });

  test("builds reports from canonical backend DTO values", () => {
    const payment = baseData.payments[0];
    const booking = baseData.bookings[0];
    const invoice = invoiceDomain.buildInvoiceDto(payment, booking);
    const paymentReport = exportDomain.buildReport("payments", baseData);
    const row = paymentReport.sections[0].rows[0];

    expect(row).toEqual([
      payment.id,
      invoice.bookingId,
      invoice.customer,
      invoice.service,
      invoice.paymentMethod || "-",
      invoice.paymentStage,
      exportDomain.formatPeso(invoice.totalVerifiedPaid),
      exportDomain.formatPeso(invoice.outstandingBalance),
      invoice.paymentStatus,
    ]);
  });

  test("normalizes legacy Rescheduled status in booking exports", () => {
    const report = exportDomain.buildReport("bookings", baseData);
    expect(report.sections[0].rows[0][8]).toBe("Scheduled");
  });

  test("renders non-empty real PDF output", async () => {
    const report = exportDomain.buildReport("stock", baseData);
    const pdf = await exportDomain.renderReportPdf(report);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.slice(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(500);
  });

  test("validates export filters and report permissions", () => {
    expect(parseExportFilters({ dateFrom: "2026-07-19", dateTo: "2026-07-20" })).toEqual({ dateFrom: "2026-07-19", dateTo: "2026-07-20" });
    expect(() => parseExportFilters({ dateFrom: "2026-07-20", dateTo: "2026-07-19" })).toThrow(/Invalid date range/);
    expect(() => parseExportFilters({ dateFrom: "not-a-date" })).toThrow(/Invalid date range/);

    expect(canExportReport({ userType: "Admin", role: "Admin" }, "financial")).toBe(true);
    expect(canExportReport({ userType: "Customer", role: "New" }, "financial")).toBe(false);
    expect(canExportReport({ userType: "Staff", role: "General Manager" }, "financial")).toBe(true);
    expect(canExportReport({ userType: "Admin", role: "Admin" }, "analytics")).toBe(true);
    expect(canExportReport({ userType: "Staff", role: "General Manager" }, "analytics")).toBe(true);
    expect(canExportReport({ userType: "Staff", role: "Sales Manager" }, "analytics")).toBe(true);
    expect(canExportReport({ userType: "Staff", role: "Junior Detailer" }, "financial")).toBe(false);
    expect(canExportReport({ userType: "Staff", role: "Junior Detailer" }, "my-work")).toBe(true);
    expect(canExportReport({ userType: "Staff", role: "Junior Detailer" }, "commissions")).toBe(true);
    expect(canExportReport({ userType: "Admin", role: "Admin" }, "reward-history")).toBe(true);
    expect(canExportReport({ userType: "Staff", role: "General Manager" }, "tracking")).toBe(true);
    expect(canExportReport({ userType: "Staff", role: "Sales Manager" }, "tracking")).toBe(true);
    expect(canExportReport({ userType: "Staff", role: "Junior Detailer" }, "tracking")).toBe(true);
    expect(canExportReport({ userType: "Staff", role: "Sales Associate" }, "tracking")).toBe(false);
    expect(canExportReport({ userType: "Staff", role: "Sales Associate" }, "payments")).toBe(true);
    expect(canExportReport({ userType: "Staff", role: "Sales Associate" }, "analytics")).toBe(false);
    expect(canExportReport({ userType: "Staff", role: "Sales Associate" }, "financial")).toBe(false);
    expect(canExportReport({ userType: "Staff", role: "Sales Associate" }, "audit-logs")).toBe(false);
    expect(canExportReport({ userType: "Staff", role: "Inventory Clerk" }, "audit-logs")).toBe(true);
    expect(canExportReport({ userType: "Staff", role: "Inventory Clerk" }, "stock")).toBe(true);
    expect(canExportReport({ userType: "Staff", role: "Inventory Clerk" }, "bookings")).toBe(false);
    expect(canExportReport({ userType: "Staff", role: "Inventory Clerk" }, "tracking")).toBe(true);
    expect(canExportReport({ userType: "Staff", role: "Inventory Clerk" }, "analytics")).toBe(false);
    expect(canExportReport({ userType: "Staff", role: "General Manager" }, "reward-history")).toBe(false);
    expect(canExportReport({ userType: "Staff", role: "Sales Associate" }, "reward-history")).toBe(false);
    expect(canExportReport({ userType: "Staff", role: "Marketing" }, "reward-history")).toBe(false);
    expect(ACTION_KEYS.commissionExport).toBe("commission.export");
  });
});

describe("Phase 5 export routes", () => {
  const originals = [];
  const auditEvents = [];

  function chain(data) {
    return {
      sort() {
        return this;
      },
      limit() {
        return this;
      },
      lean: async () => data,
    };
  }

  function stub(model, method, implementation) {
    originals.push([model, method, model[method]]);
    model[method] = implementation;
  }

  function invokeApp(path, { method = "GET", headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = new http.IncomingMessage();
      req.method = method;
      req.url = path;
      req.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
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
        resolve({
          status: res.statusCode,
          headers: res.getHeaders(),
          body: Buffer.concat(chunks),
        });
        return res;
      };
      app.handle(req, res, reject);
    });
  }

  beforeAll(async () => {
    const adminUser = { id: "USR-ADMIN", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" };
    const salesAssociateUser = { id: "USR-SA", email: "sales@example.com", name: "Sales Associate", userType: "Staff", role: "Sales Associate", status: "active" };
    const generalManagerUser = { id: "USR-GM", email: "gm@example.com", name: "General Manager", userType: "Staff", role: "General Manager", status: "active" };
    const salesManagerUser = { id: "USR-SM", email: "sales-manager@example.com", name: "Sales Manager", userType: "Staff", role: "Sales Manager", status: "active" };
    const customerUser = { id: "USR-CUST", email: "customer@example.com", name: "Customer One", userType: "Customer", role: "New", status: "active" };
    const users = [adminUser, salesAssociateUser, generalManagerUser, salesManagerUser, customerUser];

    stub(__testModels.User, "findOne", (query = {}) => ({
      lean: async () => users.find((user) => user.id === query.id || user.email === query.email) || null,
    }));
    stub(__testModels.User, "find", () => chain(users));
    stub(__testModels.Booking, "find", () => chain(baseData.bookings));
    stub(__testModels.Service, "find", () => chain(baseData.services));
    stub(__testModels.StockMonitoringItem, "find", () => chain(baseData.stockMonitoring));
    stub(__testModels.Payment, "find", () => chain(baseData.payments));
    stub(__testModels.AuditLog, "find", () => chain([]));
    stub(__testModels.AuditLog, "create", async (payload) => {
      auditEvents.push(payload);
      return payload;
    });
    stub(__testModels.Review, "find", () => chain(baseData.reviews));
    stub(__testModels.Promo, "find", () => chain(baseData.promos));
    stub(__testModels.QuoteRequest, "find", () => chain(baseData.quoteRequests));
    stub(__testModels.Expense, "find", () => chain(baseData.expenses));
    stub(__testModels.Commission, "find", () => chain(baseData.commissions));
    stub(__testModels.Reward, "find", () => chain(baseData.rewards));
    stub(__testModels.CustomerReward, "find", () => chain(baseData.customerRewards));
    stub(__testModels.SecuritySetting, "findOne", async () => ({
      requiredDownPaymentAmount: 0,
      adminSpecialPinHash: "x",
      adminSpecialPasswordHash: "x",
      staffSpecialPinHash: "x",
      staffSpecialPasswordHash: "x",
    }));
    setTestBootstrapDataOverride(async () => ({
      ...baseData,
      users,
      auditLogs: [],
      archivedAuditLogs: [],
      alerts: [],
      settings: { requiredDownPaymentAmount: 0 },
      summary: {},
      financialReport: { totals: {}, payments: [], expenses: [], commissions: [] },
    }));

  });

  afterAll(async () => {
    originals.reverse().forEach(([model, method, original]) => {
      model[method] = original;
    });
    setTestBootstrapDataOverride(null);
  });

  test("requires authentication for export routes", async () => {
    const response = await invokeApp("/api/admin/reports/stock/pdf");
    expect(response.status).toBe(401);
  });

  test("returns PDF attachment and audits successful export", async () => {
    const token = signJwt({ sub: "USR-ADMIN", email: "admin@example.com", userType: "admin", role: "admin" });
    const response = await invokeApp("/api/admin/reports/stock/pdf", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(String(response.headers["content-type"])).toContain("application/pdf");
    expect(String(response.headers["content-disposition"])).toContain("attachment");
    expect(response.body.slice(0, 4).toString()).toBe("%PDF");
    expect(auditEvents.some((event) => event.action === "Report exported" && event.meta?.reportType === "stock")).toBe(true);
  });

  test("returns CSV attachment with formula injection protection", async () => {
    const token = signJwt({ sub: "USR-ADMIN", email: "admin@example.com", userType: "admin", role: "admin" });
    const response = await invokeApp("/api/admin/reports/stock/csv", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = response.body.toString("utf8");

    expect(response.status).toBe(200);
    expect(String(response.headers["content-type"])).toContain("text/csv");
    expect(String(response.headers["content-disposition"])).toContain("attachment");
    expect(text).toContain('"\'@command"');
  });

  test("denies Sales Associate Tracking export even with forged Admin query data", async () => {
    auditEvents.length = 0;
    const token = signJwt({ sub: "USR-SA", email: "sales@example.com", userType: "Staff", role: "Sales Associate" });
    const response = await invokeApp("/api/admin/reports/tracking/pdf?role=Admin&userType=admin&employeeRole=General%20Manager&scope=admin&auditUser=Admin", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(JSON.parse(response.body.toString("utf8")).message).toBe("You do not have permission to export this report.");
    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: "sales@example.com",
        action: "Report export denied",
        meta: expect.objectContaining({ reportType: "tracking", result: "denied" }),
      }),
    ]));
  });

  test("keeps Reward History export Admin-only at the route layer", async () => {
    const adminToken = signJwt({ sub: "USR-ADMIN", email: "admin@example.com", userType: "Admin", role: "Admin" });
    const salesAssociateToken = signJwt({ sub: "USR-SA", email: "sales@example.com", userType: "Staff", role: "Sales Associate" });
    const generalManagerToken = signJwt({ sub: "USR-GM", email: "gm@example.com", userType: "Staff", role: "General Manager" });
    const salesManagerToken = signJwt({ sub: "USR-SM", email: "sales-manager@example.com", userType: "Staff", role: "Sales Manager" });

    const adminResponse = await invokeApp("/api/admin/reports/reward-history/pdf", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(adminResponse.status).toBe(200);
    expect(String(adminResponse.headers["content-type"])).toContain("application/pdf");

    for (const token of [salesAssociateToken, generalManagerToken, salesManagerToken]) {
      const response = await invokeApp("/api/admin/reports/reward-history/pdf", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(403);
      expect(JSON.parse(response.body.toString("utf8")).message).toBe("You do not have permission to export this report.");
    }
  });
});
