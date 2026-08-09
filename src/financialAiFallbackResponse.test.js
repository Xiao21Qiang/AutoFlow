const { TextDecoder, TextEncoder } = require("util");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const { buildFinancialFallbackResponse } = require("../server/server");

describe("financial AI fallback response semantics", () => {
  test("marks deterministic financial fallback as usable without a fatal message", () => {
    const response = buildFinancialFallbackResponse(
      {
        available: false,
        feature: "financial-interpretation",
        message: "Unable to generate analysis right now.",
      },
      {
        scopeLabel: "2099-12-01 to 2099-12-31",
        filters: { dateFrom: "2099-12-01", dateTo: "2099-12-31" },
        totals: {
          revenue: 5000,
          expenses: 1200,
          commissions: 300,
          netAfterExpenses: 3800,
          netAfterCommissions: 3500,
          paidTransactions: 2,
          expenseEntries: 3,
          commissionEntries: 1,
        },
        expenseCategories: [{ category: "Supplies", total: 700, count: 2 }],
        topCommissionWorkers: [{ worker: "Detailer One", total: 300, count: 1 }],
      }
    );

    expect(response).toMatchObject({
      available: true,
      fallback: true,
      source: "deterministic-fallback",
      feature: "financial-interpretation",
      message: "",
      warning: "Unable to generate analysis right now.",
    });
    expect(response.summary).toMatch(/verified revenue/i);
    expect(response.keyObservations.length).toBeGreaterThan(0);
    expect(response.recommendations.length).toBeGreaterThan(0);
  });
});
