import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminFinancialTracker from "./screens/admin/AdminFinancialTracker";

const mockGenerateFinancialInterpretation = jest.fn();
const mockCreateExpense = jest.fn();
const mockUpdateExpense = jest.fn();
const mockArchiveExpense = jest.fn();
const mockRestoreExpense = jest.fn();

function commission(index, worker = `Worker ${index}`) {
  return {
    id: `COM-${index}`,
    date: `2099-12-${String(index).padStart(2, "0")}`,
    worker,
    role: index % 2 ? "Senior Detailer" : "Junior Detailer",
    service: `Service ${index}`,
    serviceValue: 1000 + index,
    rate: 5,
    earned: 50 + index,
  };
}

const mockData = {
  expenses: [
    { id: "EXP-1", date: "2099-12-01", description: "Supplies", note: "", category: "Supplies", amount: 300, paidBy: "Admin" },
  ],
  commissions: Array.from({ length: 12 }, (_, index) => commission(index + 1)),
  payments: [
    { id: "PAY-1", bookingId: "B-1", finalPaymentStatus: "Paid", finalAmount: 2000, totalAmount: 2000, date: "2099-12-01" },
  ],
  users: [
    { id: "STF-1", name: "Worker 1", userType: "Staff", role: "Senior Detailer" },
    { id: "STF-2", name: "Worker 2", userType: "Staff", role: "Junior Detailer" },
  ],
};

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    ...mockData,
    currentUser: { id: "ADM-1", name: "Admin", email: "admin@example.com", userType: "Admin", role: "Admin" },
    createExpense: mockCreateExpense,
    updateExpense: mockUpdateExpense,
    archiveExpense: mockArchiveExpense,
    restoreExpense: mockRestoreExpense,
    generateFinancialInterpretation: mockGenerateFinancialInterpretation,
  }),
}));

function renderTracker() {
  render(<AdminFinancialTracker />);
}

function generateButton() {
  return screen.getByRole("button", { name: /Generate AI Interpretation|Generating/i });
}

beforeEach(() => {
  mockGenerateFinancialInterpretation.mockReset();
  mockCreateExpense.mockReset();
  mockUpdateExpense.mockReset();
  mockArchiveExpense.mockReset();
  mockRestoreExpense.mockReset();
});

describe("Financial Tracker AI interpretation", () => {
  test("renders usable deterministic fallback interpretation without fatal unavailable messaging", async () => {
    mockGenerateFinancialInterpretation.mockResolvedValueOnce({
      available: true,
      fallback: true,
      source: "deterministic-fallback",
      summary: "Fallback interpretation uses verified revenue, active expenses, and commissions.",
      keyObservations: ["Revenue remains above active expenses."],
      warnings: [],
      recommendations: ["Keep reviewing commission pressure."],
    });

    renderTracker();
    fireEvent.click(generateButton());

    await waitFor(() => expect(screen.getByText(/Fallback interpretation uses verified revenue/)).toBeInTheDocument());
    expect(screen.getByText("Fallback ready")).toBeInTheDocument();
    expect(screen.queryByText(/AI interpretation is unavailable right now/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unable to generate interpretation right now/i)).not.toBeInTheDocument();
    expect(generateButton()).toBeEnabled();
  });

  test("guards duplicate AI requests while generation is in progress", async () => {
    let resolveInterpretation;
    mockGenerateFinancialInterpretation.mockImplementationOnce(() => new Promise((resolve) => {
      resolveInterpretation = () => resolve({
        available: true,
        summary: "Provider interpretation is ready.",
        keyObservations: [],
        warnings: [],
        recommendations: [],
      });
    }));

    renderTracker();
    fireEvent.click(generateButton());
    fireEvent.click(generateButton());

    expect(mockGenerateFinancialInterpretation).toHaveBeenCalledTimes(1);
    resolveInterpretation();
    await waitFor(() => expect(screen.getByText(/Provider interpretation is ready/)).toBeInTheDocument());
  });

  test("clears stale error after a successful retry", async () => {
    mockGenerateFinancialInterpretation
      .mockRejectedValueOnce(new Error("Unable to generate analysis right now."))
      .mockResolvedValueOnce({
        available: true,
        summary: "Retry generated a financial interpretation.",
        keyObservations: [],
        warnings: [],
        recommendations: [],
      });

    renderTracker();
    fireEvent.click(generateButton());
    await waitFor(() => expect(screen.getByText("Unable to generate analysis right now.")).toBeInTheDocument());

    fireEvent.click(generateButton());
    await waitFor(() => expect(screen.getByText(/Retry generated a financial interpretation/)).toBeInTheDocument());
    expect(screen.queryByText("Unable to generate analysis right now.")).not.toBeInTheDocument();
  });

  test("total failure after success removes old interpretation and shows one failure state", async () => {
    mockGenerateFinancialInterpretation
      .mockResolvedValueOnce({
        available: true,
        summary: "Initial financial interpretation.",
        keyObservations: [],
        warnings: [],
        recommendations: [],
      })
      .mockResolvedValueOnce({
        available: false,
        message: "AI unavailable.",
      });

    renderTracker();
    fireEvent.click(generateButton());
    await waitFor(() => expect(screen.getByText(/Initial financial interpretation/)).toBeInTheDocument());

    fireEvent.click(generateButton());
    await waitFor(() => expect(screen.getByText("AI unavailable.")).toBeInTheDocument());
    expect(screen.queryByText(/Initial financial interpretation/)).not.toBeInTheDocument();
    expect(screen.getByText(/AI interpretation is unavailable right now/i)).toBeInTheDocument();
  });
});

describe("Financial Tracker commission log pagination", () => {
  test("paginates commission records with existing previous/current/next controls", () => {
    renderTracker();

    expect(screen.getByText("Worker 1")).toBeInTheDocument();
    expect(screen.getByText("Worker 5")).toBeInTheDocument();
    expect(screen.queryByText("Worker 6")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Commission page 1")).toHaveTextContent("1");
    expect(screen.getByLabelText("Previous commission page")).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Next commission page"));

    expect(screen.getByLabelText("Commission page 2")).toHaveTextContent("2");
    expect(screen.queryByText("Worker 1")).not.toBeInTheDocument();
    expect(screen.getByText("Worker 6")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous commission page")).toBeEnabled();
  });

  test("commission search resets pagination and applies to filtered results", () => {
    renderTracker();

    fireEvent.click(screen.getByLabelText("Next commission page"));
    expect(screen.getByLabelText("Commission page 2")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search worker..."), { target: { value: "Worker 12" } });

    expect(screen.getByLabelText("Commission page 1")).toBeInTheDocument();
    expect(screen.getByText("Worker 12")).toBeInTheDocument();
    expect(screen.queryByText("Worker 11")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Previous commission page")).toBeDisabled();
    expect(screen.getByLabelText("Next commission page")).toBeDisabled();
  });
});
