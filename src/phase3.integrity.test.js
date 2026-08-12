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
const { ACTION_KEYS, canPerformAction, filterBootstrapDataForRole } = require("../server/server");

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
});
