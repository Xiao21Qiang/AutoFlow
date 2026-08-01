/**
 * @jest-environment node
 */

const { TextDecoder, TextEncoder } = require("util");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const { __testModels, filterBootstrapDataForRole, loadBootstrapData } = require("../server/server");

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

describe("admin bootstrap performance structure", () => {
  const originals = [];
  const findCalls = {};

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
    stubFind(__testModels.Booking, "bookings", [
      { id: "BK-1", customer: "Customer One", customerEmail: "customer@example.com", service: "Coating", status: "Completed", finalAmount: 1000 },
    ]);
    stubFind(__testModels.Service, "services", [
      { id: "SVC-1", name: "Coating", price: 1000, mins: 60, consumables: ["Soap: 1"] },
    ]);
    stubFind(__testModels.StockMonitoringItem, "stock", [
      { id: "STK-1", name: "Soap", currentStock: 2, maxStock: 10, reorderLevel: 3 },
    ]);
    stubFind(__testModels.Payment, "payments", [
      { id: "PAY-1", bookingId: "BK-1", rewardId: "CR-1", customer: "Customer One", status: "Paid", amount: 1000 },
    ]);
    stubFind(__testModels.User, "users", [
      { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", password: "secret" },
      { id: "CUS-1", email: "customer@example.com", name: "Customer One", userType: "Customer", role: "New", password: "secret" },
    ]);
    stubFind(__testModels.Review, "reviews", []);
    stubFind(__testModels.Promo, "promos", []);
    stubFind(__testModels.QuoteRequest, "quoteRequests", []);
    stubFind(__testModels.Expense, "expenses", []);
    stubFind(__testModels.Commission, "commissions", []);
    stubFind(__testModels.Reward, "rewards", []);
    stubFind(__testModels.CustomerReward, "customerRewards", [
      { id: "CR-1", customerEmail: "customer@example.com", rewardName: "Loyalty Wash", status: "Available", dateEarned: "2026-07-01" },
    ]);
    findCalls.auditLogs = 0;
    stub(__testModels.AuditLog, "find", () => {
      findCalls.auditLogs += 1;
      return chain([]);
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

    expect(adminScoped.bookings.map((booking) => booking.id)).toEqual(["BK-1"]);
    expect(customerScoped.bookings.map((booking) => booking.id)).toEqual(["BK-1"]);
    expect(customerScoped.stockMonitoring).toEqual([]);
    expect(customerScoped.expenses).toEqual([]);
    expect(customerScoped.customerRewards.map((reward) => reward.id)).toEqual(["CR-1"]);
  });
});
