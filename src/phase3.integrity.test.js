const { TextDecoder, TextEncoder } = require("util");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const {
  CANONICAL_PAYMENT_METHODS,
  assertSupportedPaymentMethod,
  isCashPaymentMethod,
  normalizePaymentMethodLabel,
} = require("../server/domain/paymentMethods");
const {
  getActiveExpenseTotal,
  getActiveExpenses,
  normalizeExpensePayload,
  validateExpensePayload,
} = require("../server/domain/expenses");
const { buildFinancialReportDto, buildInvoiceDto } = require("../server/domain/invoices");
const { getOutstandingBalance, getVerifiedPaidAmount } = require("../server/domain/payments");
const { validateStockPayload } = require("../server/domain/stock");
const { ACTION_KEYS, MODULE_KEYS, canAccessModule, canExportReport, canPerformAction, filterBootstrapDataForRole } = require("../server/server");

describe("Phase 3 payment method and proof integrity", () => {
  test("normalizes every canonical supported payment method and safe legacy labels", () => {
    expect(CANONICAL_PAYMENT_METHODS).toEqual(["Cash", "GCash", "Maya", "Bank Transfer", "E-Wallet", "Online Transfer"]);
    for (const method of CANONICAL_PAYMENT_METHODS) {
      expect(normalizePaymentMethodLabel(method)).toBe(method);
      expect(assertSupportedPaymentMethod(method)).toBe(method);
    }
    expect(normalizePaymentMethodLabel("gcash")).toBe("GCash");
    expect(normalizePaymentMethodLabel("PayMaya")).toBe("Maya");
    expect(normalizePaymentMethodLabel("bank deposit")).toBe("Bank Transfer");
    expect(normalizePaymentMethodLabel("ewallet")).toBe("E-Wallet");
  });

  test("rejects unknown free-text methods and keeps cash exception explicit", () => {
    expect(normalizePaymentMethodLabel("Crypto Voucher")).toBe("");
    expect(() => assertSupportedPaymentMethod("Crypto Voucher")).toThrow(/not supported/);
    expect(isCashPaymentMethod("cash")).toBe(true);
    expect(isCashPaymentMethod("GCash")).toBe(false);
  });

  test("pending and rejected proof never count as paid revenue", () => {
    const pending = { totalAmount: 1000, downPaymentAmount: 300, downPaymentStatus: "For Verification", finalPaymentStatus: "Pending" };
    const rejected = { totalAmount: 1000, downPaymentAmount: 300, downPaymentStatus: "Rejected", finalPaymentStatus: "Pending" };
    expect(getVerifiedPaidAmount(pending)).toBe(0);
    expect(getOutstandingBalance(pending)).toBe(1000);
    expect(getVerifiedPaidAmount(rejected)).toBe(0);
  });
});

describe("Phase 3 expense validation and lifecycle helpers", () => {
  test("validates required fields and normalizes known categories", () => {
    const valid = normalizeExpensePayload({
      date: "2026-07-19",
      description: "Microfiber towels",
      category: "Stock Monitoring",
      amount: "500.25",
      paidBy: "Admin",
    });
    expect(valid).toMatchObject({ category: "Supplies", amount: 500.25 });
    expect(validateExpensePayload(valid)).toBe("");
    expect(validateExpensePayload({ ...valid, amount: -1 })).toMatch(/greater than zero/);
    expect(validateExpensePayload({ ...valid, date: "not-a-date" })).toMatch(/date/);
    expect(validateExpensePayload({ ...valid, description: "" })).toMatch(/description/);
    expect(validateExpensePayload({ ...valid, paidBy: "" })).toMatch(/Paid by/);
  });

  test("excludes archived expenses from active totals", () => {
    const expenses = [
      { amount: 100, archived: false },
      { amount: 50, archived: true },
      { amount: 25 },
    ];
    expect(getActiveExpenses(expenses)).toHaveLength(2);
    expect(getActiveExpenseTotal(expenses)).toBe(125);
  });
});

describe("Phase 3 invoice and report DTOs", () => {
  test("builds customer invoice values from verified stages only", () => {
    const invoice = buildInvoiceDto({
      id: "PAY-1",
      bookingId: "B-1",
      customer: "Customer",
      service: "Coating",
      originalAmount: 1200,
      promoDiscountAmount: 100,
      rewardDiscountAmount: 100,
      finalAmount: 1000,
      totalAmount: 1000,
      downPaymentRequired: true,
      downPaymentAmount: 300,
      downPaymentStatus: "Paid",
      finalPaymentStatus: "For Verification",
      downPaymentReference: "REF-1",
    });
    expect(invoice.finalAmountDue).toBe(1000);
    expect(invoice.discountAmount).toBe(200);
    expect(invoice.verifiedDownPayment).toBe(300);
    expect(invoice.totalVerifiedPaid).toBe(300);
    expect(invoice.outstandingBalance).toBe(700);
  });

  test("prepares report totals for Phase 5 without archived expenses", () => {
    const report = buildFinancialReportDto({
      payments: [{ id: "P1", totalAmount: 1000, finalPaymentStatus: "Paid" }],
      expenses: [{ amount: 200, archived: false }, { amount: 900, archived: true }],
      commissions: [{ earned: 50 }],
    });
    expect(report.totals).toMatchObject({
      revenue: 1000,
      expenses: 200,
      commissions: 50,
      netAfterExpenses: 800,
      netAfterCommissions: 750,
    });
  });
});

describe("Phase 3 stock and permission regressions", () => {
  test("keeps reorder-level validation centralized", () => {
    expect(validateStockPayload({ currentStock: 5, maxStock: 10, reorderLevel: 11 })).toMatch(/exceed/);
    expect(validateStockPayload({ currentStock: 11, maxStock: 10, reorderLevel: 5 })).toMatch(/cannot exceed/);
    expect(validateStockPayload({ currentStock: 8, maxStock: 10, reorderLevel: 5, qtyToAdd: 3 })).toMatch(/exceed/);
  });

  test("keeps General Manager finance authority limited to payment review", () => {
    const gm = { userType: "Staff", role: "General Manager" };
    expect(canPerformAction(gm, ACTION_KEYS.paymentView)).toBe(true);
    expect(canPerformAction(gm, ACTION_KEYS.paymentVerify)).toBe(true);
    expect(canPerformAction(gm, ACTION_KEYS.commissionMarkPaid)).toBe(false);
  });

  test("senior detailers still cannot receive junior commission amounts from bootstrap", () => {
    const scoped = filterBootstrapDataForRole({
      bookings: [{ id: "B-JR", assigned: "Junior One", customerEmail: "c@example.com" }],
      services: [],
      stockMonitoring: [],
      payments: [],
      users: [
        { id: "SENIOR", email: "senior@example.com", name: "Senior One", userType: "Staff", role: "Senior Detailer", status: "active" },
        { id: "JUNIOR", email: "junior@example.com", name: "Junior One", userType: "Staff", role: "Junior Detailer", status: "active" },
      ],
      auditLogs: [],
      archivedAuditLogs: [],
      reviews: [],
      promos: [],
      quoteRequests: [],
      expenses: [],
      commissions: [{ id: "C-JR", bookingId: "B-JR", worker: "Junior One", earned: 500 }],
      rewards: [],
      customerRewards: [],
      alerts: [],
    }, { id: "SENIOR", email: "senior@example.com", name: "Senior One", userType: "Staff", role: "Senior Detailer" });
    expect(scoped.bookings.map((booking) => booking.id)).toEqual(["B-JR"]);
    expect(scoped.commissions).toEqual([]);
  });

  test("scopes Sales Associate bootstrap data to authorized module needs", () => {
    const scoped = filterBootstrapDataForRole({
      bookings: [{ id: "B-SA", assigned: "Senior One", customerEmail: "c@example.com" }],
      services: [{ id: "SVC-1", name: "Coating" }],
      stockMonitoring: [{ id: "STK-1", name: "Soap" }],
      payments: [{ id: "PAY-SA", bookingId: "B-SA", customerEmail: "c@example.com" }],
      users: [
        { id: "SA", email: "sales@example.com", name: "Sales Associate", userType: "Staff", role: "Sales Associate", status: "active" },
        { id: "ADM", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" },
        { id: "MKT", email: "marketing@example.com", name: "Marketing", userType: "Staff", role: "Marketing", status: "active" },
        { id: "DET", email: "senior@example.com", name: "Senior One", userType: "Staff", role: "Senior Detailer", status: "active" },
        { id: "CUS", email: "c@example.com", name: "Customer", userType: "Customer", role: "New", status: "active" },
      ],
      auditLogs: [{ id: "AUD-1", userId: "sales@example.com", action: "Updated booking" }],
      archivedAuditLogs: [{ id: "AUD-2", userId: "sales@example.com", action: "Archived" }],
      reviews: [{ id: "REV-1" }],
      promos: [{ id: "PRO-1", status: "active" }],
      quoteRequests: [],
      expenses: [{ id: "EXP-1", amount: 500 }],
      commissions: [{ id: "COM-1", worker: "Senior One", earned: 50 }],
      rewards: [{ id: "RWD-1" }],
      customerRewards: [{ id: "CR-1" }],
      alerts: [{ title: "Low stock" }],
      financialReport: {
        totals: { expenses: 500, commissions: 50 },
        payments: [{ id: "PAY-SA" }],
        expenses: [{ id: "EXP-1" }],
        commissions: [{ id: "COM-1" }],
      },
      summary: { paidRevenue: 1000 },
      settings: { requiredDownPaymentAmount: 300 },
    }, { id: "SA", email: "sales@example.com", name: "Sales Associate", userType: "Staff", role: "Sales Associate" });

    expect(scoped.bookings.map((booking) => booking.id)).toEqual(["B-SA"]);
    expect(scoped.payments.map((payment) => payment.id)).toEqual(["PAY-SA"]);
    expect(scoped.users.map((user) => user.email).sort()).toEqual(["c@example.com", "sales@example.com", "senior@example.com"]);
    expect(scoped.services).toHaveLength(1);
    expect(scoped.reviews).toHaveLength(1);
    expect(scoped.promos).toHaveLength(1);
    expect(scoped.rewards).toHaveLength(1);
    expect(scoped.auditLogs).toEqual([]);
    expect(scoped.archivedAuditLogs).toEqual([]);
    expect(scoped.stockMonitoring).toEqual([]);
    expect(scoped.alerts).toEqual([]);
    expect(scoped.expenses).toEqual([]);
    expect(scoped.commissions).toEqual([]);
    expect(scoped.financialReport).toEqual({ totals: {}, payments: [], expenses: [], commissions: [] });
    expect(scoped.settings).toEqual({ requiredDownPaymentAmount: 0 });
  });

  test("scopes Inventory Clerk to Bookings data, stock, and operational audit logs", () => {
    const inventoryClerk = { id: "INV-CLERK", email: "inventory@example.com", name: "Inventory Clerk", userType: "Staff", role: "Inventory Clerk" };
    const scoped = filterBootstrapDataForRole({
      bookings: [{ id: "B-IC", assigned: "Senior One", customerEmail: "c@example.com" }],
      services: [{ id: "SVC-1", name: "Coating" }],
      stockMonitoring: [{ id: "STK-1", name: "Soap" }],
      payments: [{ id: "PAY-IC", bookingId: "B-IC", customerEmail: "c@example.com" }],
      users: [
        inventoryClerk,
        { id: "ADM", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin", status: "active" },
        { id: "CUS", email: "c@example.com", name: "Customer", userType: "Customer", role: "New", status: "active" },
      ],
      auditLogs: [
        { id: "AUD-STOCK", userId: "admin@example.com", action: "Restocked stock monitoring item" },
        { id: "AUD-STOCK-META", userId: "gm@example.com", action: "Adjusted item", meta: { targetType: "StockMonitoringItem", operation: "update" } },
        { id: "AUD-BOOK", userId: "admin@example.com", action: "Updated booking" },
      ],
      archivedAuditLogs: [
        { id: "AUD-ARCH-STOCK", userId: "gm@example.com", action: "Deleted stock monitoring item", archived: true },
        { id: "AUD-ARCH-BOOK", userId: "admin@example.com", action: "Updated booking", archived: true },
      ],
      reviews: [{ id: "REV-1" }],
      promos: [{ id: "PRO-1", status: "active" }],
      quoteRequests: [{ id: "QR-1" }],
      expenses: [{ id: "EXP-1", amount: 500 }],
      commissions: [{ id: "COM-1", worker: "Senior One", earned: 50 }],
      rewards: [{ id: "RWD-1", active: true }],
      customerRewards: [{ id: "CR-1" }],
      alerts: [{ title: "Low stock" }],
      financialReport: {
        totals: { expenses: 500 },
        payments: [{ id: "PAY-IC" }],
        expenses: [{ id: "EXP-1" }],
        commissions: [{ id: "COM-1" }],
      },
      settings: { requiredDownPaymentAmount: 300 },
    }, inventoryClerk);

    expect(canAccessModule(inventoryClerk, MODULE_KEYS.bookings)).toBe(true);
    expect(canPerformAction(inventoryClerk, ACTION_KEYS.bookingView)).toBe(true);
    expect(canPerformAction(inventoryClerk, ACTION_KEYS.bookingCreate)).toBe(true);
    expect(canPerformAction(inventoryClerk, ACTION_KEYS.bookingUpdate)).toBe(true);
    expect(canPerformAction(inventoryClerk, ACTION_KEYS.trackingView)).toBe(true);
    expect(canPerformAction(inventoryClerk, ACTION_KEYS.stockManage)).toBe(true);
    expect(canPerformAction(inventoryClerk, ACTION_KEYS.stockCreate)).toBe(false);
    expect(scoped.bookings.map((booking) => booking.id)).toEqual(["B-IC"]);
    expect(scoped.services).toEqual([{ id: "SVC-1", name: "Coating" }]);
    expect(scoped.stockMonitoring.map((item) => item.id)).toEqual(["STK-1"]);
    expect(scoped.payments).toEqual([]);
    expect(scoped.users.map((user) => user.email).sort()).toEqual(["c@example.com", "inventory@example.com"]);
    expect(scoped.auditLogs.map((log) => log.id)).toEqual(["AUD-STOCK", "AUD-STOCK-META"]);
    expect(scoped.archivedAuditLogs.map((log) => log.id)).toEqual(["AUD-ARCH-STOCK"]);
    expect(scoped.reviews).toEqual([]);
    expect(scoped.promos).toEqual([]);
    expect(scoped.quoteRequests).toEqual([{ id: "QR-1" }]);
    expect(scoped.expenses).toEqual([]);
    expect(scoped.commissions).toEqual([]);
    expect(scoped.rewards).toEqual([]);
    expect(scoped.financialReport).toEqual({ totals: {}, payments: [], expenses: [], commissions: [] });
    expect(canExportReport(inventoryClerk, "audit-logs")).toBe(true);
    expect(canExportReport(inventoryClerk, "stock")).toBe(true);
    expect(canExportReport(inventoryClerk, "bookings")).toBe(true);
    expect(canExportReport(inventoryClerk, "tracking")).toBe(true);
    expect(canExportReport(inventoryClerk, "analytics")).toBe(false);
  });
});
