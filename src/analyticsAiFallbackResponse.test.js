const { TextDecoder, TextEncoder } = require("util");

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const { buildAnalyticsFallbackResponse } = require("../server/server");

const sanitizedInput = {
  analysisType: "descriptive",
  totals: {
    totalSales: 1500,
    selectedRangeSales: 1500,
    selectedRange: "August 2026",
    totalBookings: 1,
    completedBookings: 1,
    inProgressBookings: 0,
    avgRating: 5,
    totalReviews: 1,
    paidRevenueEvents: 1,
  },
  topServices: [{ name: "Full Detail", count: 1 }],
  bottomServices: [{ name: "Full Detail", count: 1 }],
  paymentSummary: [{ name: "Monthly", count: 1, amount: 1500 }],
  trends: ["August 2026 verified sales total Php 1,500."],
};

describe("analytics AI fallback response semantics", () => {
  test("marks usable descriptive fallback analysis as available without a fatal message", () => {
    const response = buildAnalyticsFallbackResponse(
      {
        available: false,
        feature: "analytics-descriptive",
        message: "Unable to generate analysis right now.",
      },
      sanitizedInput
    );

    expect(response).toMatchObject({
      available: true,
      fallback: true,
      source: "deterministic-fallback",
      feature: "analytics-descriptive",
      message: "",
      warning: "Unable to generate analysis right now.",
      analysisType: "descriptive",
    });
    expect(response.items.length).toBeGreaterThan(0);
    expect(response.summary).toBeTruthy();
  });

  test("marks usable predictive fallback analysis as available without a fatal message", () => {
    const response = buildAnalyticsFallbackResponse(
      {
        available: false,
        feature: "analytics-predictive",
        message: "Unable to generate analysis right now.",
      },
      { ...sanitizedInput, analysisType: "predictive" }
    );

    expect(response).toMatchObject({
      available: true,
      fallback: true,
      source: "deterministic-fallback",
      feature: "analytics-predictive",
      message: "",
      warning: "Unable to generate analysis right now.",
      analysisType: "predictive",
    });
    expect(response.items.length).toBeGreaterThan(0);
    expect(response.summary).toBeTruthy();
  });
});
