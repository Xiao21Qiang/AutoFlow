/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");
const http = require("http");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const { __testModels, app, filterBootstrapDataForRole, loadBootstrapData, signJwt } = require("../server/server");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function projectDocuments(docs, projection) {
  if (!projection || !Object.values(projection).some((value) => value === 1)) return clone(docs);
  return clone(docs).map((doc) => {
    const projected = {};
    Object.entries(projection).forEach(([field, include]) => {
      if (include === 1 && Object.prototype.hasOwnProperty.call(doc, field)) {
        projected[field] = doc[field];
      }
    });
    return projected;
  });
}

function doc(value) {
  if (!value) {
    return { lean: async () => null };
  }
  return {
    ...value,
    lean: async () => clone(value),
    toObject: () => clone(value),
  };
}

function auth(user) {
  return `Bearer ${signJwt({ sub: user.id, email: user.email, userType: user.userType, role: user.role })}`;
}

async function request(path, { token, method = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage();
    req.method = method;
    req.url = path;
    req.headers = token ? { authorization: token } : {};
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
      const contentType = String(res.getHeader("content-type") || "");
      resolve({
        status: res.statusCode,
        body: contentType.includes("application/json") && text ? JSON.parse(text) : text,
      });
      return res;
    };
    app.handle(req, res, reject);
  });
}

describe("admin bootstrap performance structure", () => {
  const originals = [];
  const findCalls = {};
  let paymentFindProjection = null;
  const auditCreates = [];

  const safeHash = "$2b$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuuabcdefghijklmnopq";
  const securitySetting = {
    id: "autoflow-security",
    adminSpecialPinHash: safeHash,
    adminSpecialPasswordHash: safeHash,
    staffSpecialPinHash: safeHash,
    staffSpecialPasswordHash: safeHash,
    requiredDownPaymentAmount: 500,
    save: jest.fn(async () => securitySetting),
  };

  function stub(model, method, implementation) {
    originals.push([model, method, model[method]]);
    model[method] = implementation;
  }

  function stubFind(model, label, data) {
    findCalls[label] = 0;
    stub(model, "find", () => {
      findCalls[label] += 1;
      return chain(data);
    });
  }

  beforeAll(() => {
    const bookings = [
      { id: "BK-1", customer: "Customer One", customerEmail: "customer@example.com", customerId: "CUS-1", service: "Coating", status: "Completed", finalAmount: 1000, assigned: "Junior Detailer", assignedDetailerId: "JR-1" },
      { id: "BK-2", customer: "Other Customer", customerEmail: "other@example.com", customerId: "CUS-2", service: "Wash", status: "Scheduled", finalAmount: 500, assigned: "Senior Detailer", assignedDetailerId: "SD-1" },
    ];
    const payments = [
      {
        id: "PAY-1",
        bookingId: "BK-1",
        rewardId: "CR-1",
        customer: "Customer One",
        customerEmail: "customer@example.com",
        service: "Coating",
        status: "Paid",
        amount: 1000,
        originalAmount: 1200,
        promoDiscountAmount: 100,
        rewardDiscountAmount: 100,
        discountAmount: 200,
        subtotalAfterDiscount: 892.86,
        taxAmount: 107.14,
        finalAmount: 1000,
        totalAmount: 1000,
        downPaymentRequired: true,
        downPaymentAmount: 300,
        downPaymentStatus: "Paid",
        downPaymentMethod: "GCash",
        downPaymentReference: "DP-REF",
        downPaymentProofUrl: "data:image/jpeg;base64,down-heavy",
        downPaymentProofName: "down.jpg",
        downPaymentProofSubmittedAt: "2026-07-01T00:00:00.000Z",
        downPaymentReferenceCheckStatus: "submitted",
        downPaymentOcrAdvisoryText: "large ocr text",
        finalPaymentStatus: "Paid",
        finalPaymentMethod: "GCash",
        finalPaymentReference: "FP-REF",
        finalPaymentProofUrl: "data:image/jpeg;base64,final-heavy",
        finalPaymentProofName: "final.jpg",
        finalPaymentProofSubmittedAt: "2026-07-02T00:00:00.000Z",
        finalPaymentReferenceCheckStatus: "submitted",
        finalPaymentOcrAdvisoryText: "large final ocr text",
        proofImage: "data:image/jpeg;base64,legacy-heavy",
        proofFileName: "legacy.jpg",
        proofSubmittedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "PAY-2",
        bookingId: "BK-2",
        customer: "Other Customer",
        customerEmail: "other@example.com",
        service: "Wash",
        status: "For Verification",
        amount: 500,
        totalAmount: 500,
        downPaymentRequired: false,
        downPaymentStatus: "Not Required",
        finalPaymentStatus: "For Verification",
        finalPaymentMethod: "GCash",
        finalPaymentReference: "PENDING-REF",
        finalPaymentProofUrl: "data:image/jpeg;base64,pending-heavy",
        finalPaymentProofName: "pending.jpg",
      },
    ];
    stubFind(__testModels.Booking, "bookings", [
      ...bookings,
    ]);
    stubFind(__testModels.Service, "services", [
      { id: "SVC-1", name: "Coating", price: 1000, mins: 60, consumables: ["Soap: 1"] },
    ]);
    stubFind(__testModels.StockMonitoringItem, "stock", [
      { id: "STK-1", name: "Soap", currentStock: 2, maxStock: 10, reorderLevel: 3 },
    ]);
    findCalls.payments = 0;
    stub(__testModels.Payment, "find", (_query, projection) => {
      findCalls.payments += 1;
      paymentFindProjection = projection || null;
      return chain(projectDocuments(payments, projection));
    });
    stub(__testModels.Payment, "findOne", (query = {}) => {
      const found = payments.find((payment) => {
        if (query.id) return payment.id === query.id;
        if (query.bookingId) return payment.bookingId === query.bookingId;
        if (query.$or) {
          return query.$or.some((condition) => (
            (condition.id && payment.id === condition.id) ||
            (condition.bookingId && payment.bookingId === condition.bookingId)
          ));
        }
        return false;
      });
      return doc(found);
    });
    stubFind(__testModels.User, "users", [
      { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", password: "secret" },
      { id: "SD-1", email: "senior@example.com", name: "Senior Detailer", userType: "Staff", role: "Senior Detailer", status: "active", password: "secret" },
      { id: "JR-1", email: "junior@example.com", name: "Junior Detailer", userType: "Staff", role: "Junior Detailer", status: "active", password: "secret" },
      { id: "STF-1", email: "staff@example.com", name: "Staff", userType: "Staff", role: "Sales Associate", password: "secret" },
      { id: "CUS-1", email: "customer@example.com", name: "Customer One", userType: "Customer", role: "New", password: "secret" },
      { id: "CUS-2", email: "other@example.com", name: "Other Customer", userType: "Customer", role: "New", password: "secret" },
    ]);
    stub(__testModels.User, "findOne", (query = {}) => {
      const users = [
        { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" },
        { id: "SD-1", email: "senior@example.com", name: "Senior Detailer", userType: "Staff", role: "Senior Detailer", status: "active" },
        { id: "JR-1", email: "junior@example.com", name: "Junior Detailer", userType: "Staff", role: "Junior Detailer", status: "active" },
        { id: "STF-1", email: "staff@example.com", name: "Staff", userType: "Staff", role: "Sales Associate", status: "active" },
        { id: "CUS-1", email: "customer@example.com", name: "Customer One", userType: "Customer", role: "New", status: "active" },
        { id: "CUS-2", email: "other@example.com", name: "Other Customer", userType: "Customer", role: "New", status: "active" },
      ];
      return doc(users.find((user) => user.id === query.id || user.email === query.email));
    });
    stub(__testModels.Booking, "findOne", (query = {}) => doc(bookings.find((booking) => booking.id === query.id)));
    stubFind(__testModels.Review, "reviews", [
      { id: "REV-1", customer: "Customer One", rating: 5, comment: "Excellent finish.", status: "Published" },
    ]);
    stubFind(__testModels.Promo, "promos", [
      { id: "PRO-1", title: "Summer Shine", status: "Active", message: "Save on detailing.", expiryMode: "usage", usageCount: 2, usageLimit: 10 },
    ]);
    stubFind(__testModels.QuoteRequest, "quoteRequests", []);
    stubFind(__testModels.Expense, "expenses", []);
    stubFind(__testModels.Commission, "commissions", []);
    stubFind(__testModels.Reward, "rewards", [
      { id: "RWD-1", name: "Loyalty Spark", code: "LOYALTY-SPARK", type: "Percentage Discount", rarity: "Common", weight: 10, active: true, enabled: true },
    ]);
    stubFind(__testModels.CustomerReward, "customerRewards", [
      { id: "CR-1", customerEmail: "customer@example.com", rewardName: "Loyalty Wash", status: "Available", dateEarned: "2026-07-01" },
    ]);
    findCalls.auditLogs = 0;
    stub(__testModels.AuditLog, "find", () => {
      findCalls.auditLogs += 1;
      return chain([]);
    });
    stub(__testModels.AuditLog, "create", async (payload) => {
      auditCreates.push(clone(payload));
      return clone(payload);
    });
    stub(__testModels.SecuritySetting, "findOne", async () => securitySetting);
    stub(__testModels.SecuritySetting, "create", async () => securitySetting);
    originals.push([__testModels.SecuritySetting, "collection", __testModels.SecuritySetting.collection]);
    __testModels.SecuritySetting.collection = {
      findOne: async () => securitySetting,
      updateOne: async () => ({}),
    };
  });

  afterAll(() => {
    originals.reverse().forEach(([model, method, original]) => {
      model[method] = original;
    });
  });

  beforeEach(() => {
    Object.keys(findCalls).forEach((key) => {
      findCalls[key] = 0;
    });
    securitySetting.save.mockClear();
    paymentFindProjection = null;
    auditCreates.length = 0;
  });

  test("loads the expected top-level bootstrap shape with bounded collection fanout", async () => {
    const data = await loadBootstrapData();

    expect(Object.keys(data).sort()).toEqual([
      "alerts",
      "archivedAuditLogs",
      "auditLogs",
      "bookings",
      "commissions",
      "customerRewards",
      "expenses",
      "financialReport",
      "payments",
      "promos",
      "quoteRequests",
      "reviews",
      "rewards",
      "services",
      "settings",
      "stockMonitoring",
      "summary",
      "users",
    ]);
    expect(data.users[0]).not.toHaveProperty("password");
    expect(data.payments[0]).toHaveProperty("recognizedRevenueEvents");
    expect(data.payments[0]).toHaveProperty("invoice");
    expect(data.payments[0]).toMatchObject({
      id: "PAY-1",
      bookingId: "BK-1",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      status: "Paid",
      amount: 1000,
      originalAmount: 1200,
      promoDiscountAmount: 100,
      rewardDiscountAmount: 100,
      downPaymentMethod: "GCash",
      downPaymentReference: "DP-REF",
      downPaymentProofName: "down.jpg",
      downPaymentReferenceCheckStatus: "submitted",
      downPaymentProofAvailable: true,
      finalPaymentMethod: "GCash",
      finalPaymentReference: "FP-REF",
      finalPaymentProofName: "final.jpg",
      finalPaymentReferenceCheckStatus: "submitted",
      finalPaymentProofAvailable: true,
    });
    expect(data.payments[0].proofImage).toBe("");
    expect(data.payments[0].downPaymentProofUrl).toBe("");
    expect(data.payments[0].finalPaymentProofUrl).toBe("");
    expect(data.payments[0].downPaymentOcrAdvisoryText).toBe("");
    expect(data.payments[0].finalPaymentOcrAdvisoryText).toBe("");
    expect(data.payments[0].recognizedRevenue).toBe(1000);
    expect(data.payments[1].recognizedRevenue).toBe(0);
    expect(data.financialReport.totals.revenue).toBe(1000);
    expect(data.payments[0].invoice).toMatchObject({
      bookingId: "BK-1",
      customer: "Customer One",
      promotionDiscountType: "",
      promoDiscountAmount: 100,
      rewardDiscountAmount: 100,
      totalVerifiedPaid: 1000,
      outstandingBalance: 0,
    });
    expect(paymentFindProjection).toMatchObject({
      id: 1,
      bookingId: 1,
      status: 1,
      amount: 1,
      downPaymentProofName: 1,
      finalPaymentProofName: 1,
      finalPaymentReferenceCheckStatus: 1,
    });
    expect(paymentFindProjection).not.toHaveProperty("proofImage");
    expect(paymentFindProjection).not.toHaveProperty("downPaymentProofUrl");
    expect(paymentFindProjection).not.toHaveProperty("finalPaymentProofUrl");
    expect(paymentFindProjection).not.toHaveProperty("downPaymentOcrAdvisoryText");
    expect(paymentFindProjection).not.toHaveProperty("finalPaymentOcrAdvisoryText");
    expect(data.customerRewards[0]).toMatchObject({
      id: "CR-1",
      status: "Used",
      linkedBookingId: "BK-1",
      linkedPaymentId: "PAY-1",
    });
    expect(findCalls).toMatchObject({
      bookings: 1,
      services: 1,
      stock: 1,
      payments: 1,
      users: 1,
      auditLogs: 2,
      reviews: 1,
      promos: 1,
      quoteRequests: 1,
      expenses: 1,
      commissions: 1,
      rewards: 1,
      customerRewards: 1,
    });
  });

  test("role filtering preserves admin visibility and customer restrictions", async () => {
    const data = await loadBootstrapData();
    const adminScoped = filterBootstrapDataForRole(data, { userType: "Admin", role: "Admin", email: "admin@example.com" });
    const customerScoped = filterBootstrapDataForRole(data, { id: "CUS-1", userType: "Customer", role: "New", email: "customer@example.com", name: "Customer One" });

    expect(adminScoped.bookings.map((booking) => booking.id)).toEqual(["BK-1", "BK-2"]);
    expect(customerScoped.bookings.map((booking) => booking.id)).toEqual(["BK-1"]);
    expect(customerScoped.payments.map((payment) => payment.id)).toEqual(["PAY-1"]);
    expect(customerScoped.stockMonitoring).toEqual([]);
    expect(customerScoped.expenses).toEqual([]);
    expect(customerScoped.customerRewards.map((reward) => reward.id)).toEqual(["CR-1"]);
  });

  test("Senior Detailer bootstrap keeps shared Bookings and Tracking data but redacts unrelated sensitive surfaces", async () => {
    const seniorToken = auth({ id: "SD-1", email: "senior@example.com", userType: "Staff", role: "Senior Detailer" });
    const response = await request("/api/admin/bootstrap", { token: seniorToken });

    expect(response.status).toBe(200);
    expect(response.body.bookings.map((booking) => booking.id)).toEqual(["BK-1", "BK-2"]);
    expect(response.body.payments.map((payment) => payment.id)).toEqual(["PAY-1", "PAY-2"]);
    expect(response.body.services.map((service) => service.id)).toEqual(["SVC-1"]);
    expect(response.body.stockMonitoring).toEqual([]);
    expect(response.body.auditLogs).toEqual([]);
    expect(response.body.archivedAuditLogs).toEqual([]);
    expect(response.body.expenses).toEqual([]);
    expect(response.body.reviews).toEqual([]);
    expect(response.body.promos).toEqual([]);
    expect(response.body.rewards).toEqual([]);
    expect(response.body.customerRewards).toEqual([]);
    expect(response.body.alerts).toEqual([]);
    expect(response.body.users.map((user) => user.id)).toEqual(expect.arrayContaining(["SD-1", "STF-1", "CUS-1", "CUS-2"]));
    expect(response.body.users.map((user) => user.id)).not.toContain("ADM-1");
    expect(JSON.stringify(response.body)).not.toMatch(/password|adminSpecial|staffSpecial|\$2b\$12\$|data:image/);
  });

  test("Junior Detailer bootstrap gets Bookings support data without unrelated module data", async () => {
    const juniorToken = auth({ id: "JR-1", email: "junior@example.com", userType: "Staff", role: "Junior Detailer" });
    const response = await request("/api/admin/bootstrap", { token: juniorToken });

    expect(response.status).toBe(200);
    expect(response.body.bookings.map((booking) => booking.id)).toEqual(["BK-1", "BK-2"]);
    expect(response.body.payments.map((payment) => payment.id)).toEqual(["PAY-1", "PAY-2"]);
    expect(response.body.services.map((service) => service.id)).toEqual(["SVC-1"]);
    expect(response.body.promos.map((promo) => promo.id)).toEqual(["PRO-1"]);
    expect(response.body.users.map((user) => user.id)).toEqual(expect.arrayContaining(["JR-1", "SD-1", "STF-1", "CUS-1", "CUS-2"]));
    expect(response.body.users.map((user) => user.id)).not.toContain("ADM-1");
    expect(response.body.stockMonitoring).toEqual([]);
    expect(response.body.auditLogs).toEqual([]);
    expect(response.body.archivedAuditLogs).toEqual([]);
    expect(response.body.expenses).toEqual([]);
    expect(response.body.reviews).toEqual([]);
    expect(response.body.rewards).toEqual([]);
    expect(response.body.customerRewards).toEqual([]);
    expect(response.body.alerts).toEqual([]);
    expect(JSON.stringify(response.body)).not.toMatch(/password|adminSpecial|staffSpecial|\$2b\$12\$|data:image/);
  });

  test("Junior Detailer booking export is broad while tracking export is assignment scoped", async () => {
    const juniorToken = auth({ id: "JR-1", email: "junior@example.com", userType: "Staff", role: "Junior Detailer" });

    const bookingsExport = await request("/api/admin/reports/bookings/csv", { token: juniorToken });
    const trackingExport = await request("/api/admin/reports/tracking/csv", { token: juniorToken });

    expect(bookingsExport.status).toBe(200);
    expect(bookingsExport.body).toContain("BK-1");
    expect(bookingsExport.body).toContain("BK-2");
    expect(trackingExport.status).toBe(200);
    expect(trackingExport.body).toContain("BK-1");
    expect(trackingExport.body).not.toContain("BK-2");
  });

  test.each([
    "financial",
    "analytics",
    "stock",
    "payments",
    "services",
    "audit-logs",
    "reviews",
    "promotions",
    "rewards",
    "reward-history",
    "detailer-management",
  ])("Senior Detailer cannot export unauthorized %s reports directly", async (reportType) => {
    const seniorToken = auth({ id: "SD-1", email: "senior@example.com", userType: "Staff", role: "Senior Detailer" });
    const response = await request(`/api/admin/reports/${reportType}/csv`, { token: seniorToken });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("You do not have permission to export this report.");
  });

  test("Sales Associate bootstrap includes Engagement read-only data without Reward History", async () => {
    const data = await loadBootstrapData();
    const salesAssociateScoped = filterBootstrapDataForRole(data, {
      id: "STF-1",
      userType: "Staff",
      role: "Sales Associate",
      email: "staff@example.com",
      name: "Staff",
    });

    expect(salesAssociateScoped.reviews.map((review) => review.id)).toEqual(["REV-1"]);
    expect(salesAssociateScoped.promos.map((promo) => promo.id)).toEqual(["PRO-1"]);
    expect(salesAssociateScoped.rewards.map((reward) => reward.id)).toEqual(["RWD-1"]);
    expect(salesAssociateScoped.customerRewards).toEqual([]);
    expect(salesAssociateScoped.auditLogs).toEqual([]);
    expect(salesAssociateScoped.archivedAuditLogs).toEqual([]);
    expect(salesAssociateScoped.settings).toEqual({ requiredDownPaymentAmount: 0 });
  });

  test("on-demand proof route enforces auth and payment ownership", async () => {
    const adminToken = auth({ id: "ADM-1", email: "admin@example.com", userType: "Admin", role: "Admin" });
    const staffToken = auth({ id: "STF-1", email: "staff@example.com", userType: "Staff", role: "Sales Associate" });
    const customerToken = auth({ id: "CUS-1", email: "customer@example.com", userType: "Customer", role: "New" });
    const otherCustomerToken = auth({ id: "CUS-2", email: "other@example.com", userType: "Customer", role: "New" });

    const unauthenticated = await request("/api/admin/payments/PAY-1/proof?stage=downPayment");
    expect(unauthenticated.status).toBe(401);

    const admin = await request("/api/admin/payments/PAY-1/proof?stage=downPayment", { token: adminToken });
    expect(admin.status).toBe(200);
    expect(admin.body).toMatchObject({
      id: "PAY-1",
      stage: "downPayment",
      proofImage: "data:image/jpeg;base64,down-heavy",
      proofFileName: "down.jpg",
    });

    const staff = await request("/api/admin/payments/PAY-1/proof?stage=finalPayment", { token: staffToken });
    expect(staff.status).toBe(200);
    expect(staff.body).toMatchObject({
      id: "PAY-1",
      stage: "finalPayment",
      proofImage: "data:image/jpeg;base64,final-heavy",
      proofFileName: "final.jpg",
    });

    const customer = await request("/api/admin/payments/PAY-1/proof?stage=downPayment", { token: customerToken });
    expect(customer.status).toBe(200);
    expect(customer.body.proofImage).toBe("data:image/jpeg;base64,down-heavy");

    const forbidden = await request("/api/admin/payments/PAY-1/proof?stage=downPayment", { token: otherCustomerToken });
    expect(forbidden.status).toBe(403);

    const missing = await request("/api/admin/payments/UNKNOWN/proof?stage=downPayment", { token: adminToken });
    expect(missing.status).toBe(404);
  });
});
