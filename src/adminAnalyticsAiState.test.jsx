import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminAnalytics from "./screens/admin/AdminAnalytics";

const mockGenerateAnalyticsInterpretation = jest.fn();

jest.mock("recharts", () => ({
  Bar: () => null,
  BarChart: ({ children }) => <div>{children}</div>,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    payments: [
      {
        id: "PAY-1",
        bookingId: "BOOK-1",
        totalAmount: 1500,
        finalPaymentStatus: "Paid",
        date: "2026-08-01",
      },
    ],
    bookings: [
      {
        id: "BOOK-1",
        service: "Full Detail",
        status: "Completed",
        date: "2026-08-01",
      },
    ],
    reviews: [{ id: "REV-1", rating: 5 }],
    generateAnalyticsInterpretation: mockGenerateAnalyticsInterpretation,
  }),
}));

function renderAnalytics() {
  render(<AdminAnalytics />);
}

function aiSection(title) {
  return screen.getByRole("heading", { name: title }).closest("section");
}

function descriptiveSection() {
  return aiSection("AI Generated Descriptive Analytics");
}

function predictiveSection() {
  return aiSection("AI Generated Predictive Analytics");
}

function clickGenerate(label) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

function successfulAnalysis(analysisType, text) {
  return {
    available: true,
    analysisType,
    model: "groq-test",
    items: [{ type: "summary", title: "Summary", text }],
  };
}

function fallbackAnalysis(analysisType, text) {
  return {
    available: false,
    fallback: true,
    source: "deterministic-fallback",
    message: "Unable to generate analysis right now.",
    analysisType,
    items: [{ type: "summary", title: "Summary", text }],
  };
}

beforeEach(() => {
  mockGenerateAnalyticsInterpretation.mockReset();
});

describe("Admin Analytics AI state handling", () => {
  test("renders successful descriptive analysis without a fatal generation message", async () => {
    mockGenerateAnalyticsInterpretation.mockResolvedValueOnce(
      successfulAnalysis("descriptive", "Verified sales and booking activity are healthy.")
    );

    renderAnalytics();
    clickGenerate("Generate Descriptive Analysis");

    const section = descriptiveSection();
    await waitFor(() => expect(within(section).getByText("Verified sales and booking activity are healthy.")).toBeInTheDocument());
    expect(within(section).queryByText("Unable to generate analysis right now.")).not.toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Generate Descriptive Analysis" })).toBeEnabled();
  });

  test("shows a descriptive error only when no usable result exists", async () => {
    mockGenerateAnalyticsInterpretation.mockRejectedValueOnce(new Error("Unable to generate analysis right now."));

    renderAnalytics();
    clickGenerate("Generate Descriptive Analysis");

    const section = descriptiveSection();
    await waitFor(() => expect(within(section).getByText("Unable to generate analysis right now.")).toBeInTheDocument());
    expect(within(section).queryByText("Summary")).not.toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Generate Descriptive Analysis" })).toBeEnabled();
  });

  test("clears a stale descriptive error after a successful retry", async () => {
    mockGenerateAnalyticsInterpretation
      .mockRejectedValueOnce(new Error("Unable to generate analysis right now."))
      .mockResolvedValueOnce(successfulAnalysis("descriptive", "Retry produced a fresh descriptive summary."));

    renderAnalytics();
    clickGenerate("Generate Descriptive Analysis");

    const section = descriptiveSection();
    await waitFor(() => expect(within(section).getByText("Unable to generate analysis right now.")).toBeInTheDocument());

    clickGenerate("Generate Descriptive Analysis");

    await waitFor(() => expect(within(section).getByText("Retry produced a fresh descriptive summary.")).toBeInTheDocument());
    expect(within(section).queryByText("Unable to generate analysis right now.")).not.toBeInTheDocument();
  });

  test("renders usable descriptive fallback analysis without a fatal banner", async () => {
    mockGenerateAnalyticsInterpretation.mockResolvedValueOnce(
      fallbackAnalysis("descriptive", "Fallback descriptive analysis uses verified sales and bookings.")
    );

    renderAnalytics();
    clickGenerate("Generate Descriptive Analysis");

    const section = descriptiveSection();
    await waitFor(() => expect(within(section).getByText("Fallback descriptive analysis uses verified sales and bookings.")).toBeInTheDocument());
    expect(within(section).queryByText("Unable to generate analysis right now.")).not.toBeInTheDocument();
  });

  test("replaces an existing descriptive result with a new successful result without stale error", async () => {
    mockGenerateAnalyticsInterpretation
      .mockResolvedValueOnce(successfulAnalysis("descriptive", "Initial descriptive analysis."))
      .mockResolvedValueOnce(successfulAnalysis("descriptive", "Updated descriptive analysis."));

    renderAnalytics();
    clickGenerate("Generate Descriptive Analysis");

    const section = descriptiveSection();
    await waitFor(() => expect(within(section).getByText("Initial descriptive analysis.")).toBeInTheDocument());

    clickGenerate("Generate Descriptive Analysis");

    await waitFor(() => expect(within(section).getByText("Updated descriptive analysis.")).toBeInTheDocument());
    expect(within(section).queryByText("Initial descriptive analysis.")).not.toBeInTheDocument();
    expect(within(section).queryByText("Unable to generate analysis right now.")).not.toBeInTheDocument();
  });

  test("renders successful predictive analysis without a fatal generation message", async () => {
    mockGenerateAnalyticsInterpretation.mockResolvedValueOnce(
      successfulAnalysis("predictive", "Near-term demand will likely follow current service demand.")
    );

    renderAnalytics();
    clickGenerate("Generate Predictive Analysis");

    const section = predictiveSection();
    await waitFor(() => expect(within(section).getByText("Near-term demand will likely follow current service demand.")).toBeInTheDocument());
    expect(within(section).queryByText("Unable to generate analysis right now.")).not.toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Generate Predictive Analysis" })).toBeEnabled();
  });

  test("shows a predictive error only when no usable result exists", async () => {
    mockGenerateAnalyticsInterpretation.mockRejectedValueOnce(new Error("Unable to generate analysis right now."));

    renderAnalytics();
    clickGenerate("Generate Predictive Analysis");

    const section = predictiveSection();
    await waitFor(() => expect(within(section).getByText("Unable to generate analysis right now.")).toBeInTheDocument());
    expect(within(section).queryByText("Summary")).not.toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Generate Predictive Analysis" })).toBeEnabled();
  });

  test("clears a stale predictive error after a successful retry", async () => {
    mockGenerateAnalyticsInterpretation
      .mockRejectedValueOnce(new Error("Unable to generate analysis right now."))
      .mockResolvedValueOnce(successfulAnalysis("predictive", "Retry produced a fresh predictive forecast."));

    renderAnalytics();
    clickGenerate("Generate Predictive Analysis");

    const section = predictiveSection();
    await waitFor(() => expect(within(section).getByText("Unable to generate analysis right now.")).toBeInTheDocument());

    clickGenerate("Generate Predictive Analysis");

    await waitFor(() => expect(within(section).getByText("Retry produced a fresh predictive forecast.")).toBeInTheDocument());
    expect(within(section).queryByText("Unable to generate analysis right now.")).not.toBeInTheDocument();
  });

  test("renders usable predictive fallback analysis without a fatal banner", async () => {
    mockGenerateAnalyticsInterpretation.mockResolvedValueOnce(
      fallbackAnalysis("predictive", "Fallback predictive analysis stays cautious about future demand.")
    );

    renderAnalytics();
    clickGenerate("Generate Predictive Analysis");

    const section = predictiveSection();
    await waitFor(() => expect(within(section).getByText("Fallback predictive analysis stays cautious about future demand.")).toBeInTheDocument());
    expect(within(section).queryByText("Unable to generate analysis right now.")).not.toBeInTheDocument();
  });

  test("shows predictive failure after a previous success without keeping contradictory old cards", async () => {
    mockGenerateAnalyticsInterpretation
      .mockResolvedValueOnce(successfulAnalysis("predictive", "Initial predictive forecast."))
      .mockRejectedValueOnce(new Error("Unable to generate analysis right now."));

    renderAnalytics();
    clickGenerate("Generate Predictive Analysis");

    const section = predictiveSection();
    await waitFor(() => expect(within(section).getByText("Initial predictive forecast.")).toBeInTheDocument());

    clickGenerate("Generate Predictive Analysis");

    await waitFor(() => expect(within(section).getByText("Unable to generate analysis right now.")).toBeInTheDocument());
    expect(within(section).queryByText("Initial predictive forecast.")).not.toBeInTheDocument();
  });

  test("keeps descriptive and predictive states independent", async () => {
    mockGenerateAnalyticsInterpretation
      .mockResolvedValueOnce(successfulAnalysis("descriptive", "Descriptive analysis remains visible."))
      .mockRejectedValueOnce(new Error("Unable to generate analysis right now."));

    renderAnalytics();
    clickGenerate("Generate Descriptive Analysis");
    await waitFor(() => expect(within(descriptiveSection()).getByText("Descriptive analysis remains visible.")).toBeInTheDocument());

    clickGenerate("Generate Predictive Analysis");
    await waitFor(() => expect(within(predictiveSection()).getByText("Unable to generate analysis right now.")).toBeInTheDocument());

    expect(within(descriptiveSection()).getByText("Descriptive analysis remains visible.")).toBeInTheDocument();
    expect(within(descriptiveSection()).queryByText("Unable to generate analysis right now.")).not.toBeInTheDocument();
  });
});
