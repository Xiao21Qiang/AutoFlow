import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import StaffMain from "./screens/staff/StaffMain";
import { buildReportDownloadPath, downloadAuthenticatedFile } from "./utils/downloadExport";

const mockGenerateAnalyticsInterpretation = jest.fn();
const mockUseAdminData = jest.fn();

jest.mock("recharts", () => ({
  Bar: () => <div data-testid="analytics-bar" />,
  BarChart: ({ children }) => <div data-testid="analytics-bar-chart">{children}</div>,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }) => <div data-testid="analytics-responsive-chart">{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

jest.mock("./context/AdminDataContext", () => ({
  AdminDataProvider: ({ children }) => <>{children}</>,
  useAdminData: () => mockUseAdminData(),
}));

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock("./utils/downloadExport", () => ({
  buildReportDownloadPath: jest.fn((reportType, format) => `/api/admin/reports/${reportType}/${format}`),
  downloadAuthenticatedFile: jest.fn(),
}));

const generalManager = {
  id: "STF-GM",
  email: "gm@example.com",
  name: "General Manager",
  userType: "Staff",
  role: "General Manager",
};

const salesAssociate = {
  id: "STF-SA",
  email: "sales@example.com",
  name: "Sales Associate",
  userType: "Staff",
  role: "Sales Associate",
};

const salesManager = {
  id: "STF-SM",
  email: "sales-manager@example.com",
  name: "Sales Manager",
  userType: "Staff",
  role: "Sales Manager",
};

const seniorDetailer = {
  id: "STF-SR",
  email: "senior@example.com",
  name: "Senior Detailer",
  userType: "Staff",
  role: "Senior Detailer",
};

const analyticsData = {
  bookings: [
    { id: "BOOK-1", service: "Full Detail", status: "Completed", date: "2026-08-01" },
    { id: "BOOK-2", service: "Ceramic Coating", status: "In Progress", date: "2026-08-02" },
    { id: "BOOK-3", service: "Full Detail", status: "Cancelled", date: "2026-08-03" },
  ],
  payments: [
    {
      id: "PAY-1",
      bookingId: "BOOK-1",
      customer: "Customer One",
      totalAmount: 1500,
      finalPaymentStatus: "Paid",
      finalPaymentVerifiedAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "PAY-2",
      bookingId: "BOOK-2",
      customer: "Customer Two",
      totalAmount: 900,
      downPaymentAmount: 300,
      downPaymentStatus: "Paid",
      downPaymentVerifiedAt: "2026-08-02T00:00:00.000Z",
    },
  ],
  reviews: [
    { id: "REV-1", rating: 5 },
    { id: "REV-2", rating: 4 },
  ],
  services: [],
  stockMonitoring: [{ id: "STK-1", name: "Soap" }],
  commissions: [],
  customerRewards: [],
  detailers: [],
  expenses: [],
  promos: [],
  rewards: [],
  users: [],
  quoteRequests: [],
  summary: {},
  currentUser: salesAssociate,
  loading: false,
  error: "",
  notifications: [],
  unreadNotificationCount: 0,
  notificationPermission: "unsupported",
  requestNotificationPermission: jest.fn(),
  markNotificationsRead: jest.fn(),
  generateAnalyticsInterpretation: mockGenerateAnalyticsInterpretation,
};

function setAnalyticsContext(overrides = {}) {
  mockUseAdminData.mockReturnValue({
    ...analyticsData,
    ...overrides,
  });
}

function renderStaff(session = salesAssociate) {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("user", JSON.stringify(session));
  setAnalyticsContext({ currentUser: session });
  return render(<StaffMain session={session} />);
}

function openAnalytics(session = salesAssociate) {
  const result = renderStaff(session);
  fireEvent.click(screen.getAllByText("Analytics")[0]);
  return result;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-08-15T08:00:00+08:00"));
  localStorage.clear();
  mockGenerateAnalyticsInterpretation.mockReset();
  mockGenerateAnalyticsInterpretation.mockResolvedValue({
    available: true,
    analysisType: "descriptive",
    model: "mock-model",
    items: [{ type: "summary", title: "Summary", text: "Mock analytics summary." }],
  });
  buildReportDownloadPath.mockClear();
  buildReportDownloadPath.mockImplementation((reportType, format) => `/api/admin/reports/${reportType}/${format}`);
  downloadAuthenticatedFile.mockReset();
  downloadAuthenticatedFile.mockResolvedValue(undefined);
  setAnalyticsContext();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Staff Analytics authorization", () => {
  test("routes General Manager and Sales Manager to the canonical Analytics implementation", () => {
    const { unmount } = openAnalytics(generalManager);
    expect(screen.getByRole("heading", { name: "Total Sales Visual Analytics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bookings Summary" })).toBeInTheDocument();

    unmount();
    localStorage.clear();
    openAnalytics(salesManager);
    expect(screen.getByRole("heading", { name: "Total Sales Visual Analytics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bookings Summary" })).toBeInTheDocument();
  });

  test("keeps Analytics hidden from Sales Associate and unrelated Staff without module authorization", () => {
    const { unmount } = renderStaff(salesAssociate);

    expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Total Sales Visual Analytics" })).not.toBeInTheDocument();

    unmount();
    localStorage.clear();
    renderStaff(seniorDetailer);

    expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Total Sales Visual Analytics" })).not.toBeInTheDocument();
  });

  test("renders Sales Manager metrics, charts, services, and ratings", () => {
    openAnalytics(salesManager);

    expect(screen.getByText("All-time verified sales")).toBeInTheDocument();
    expect(screen.getAllByText("Php 1,800").length).toBeGreaterThan(0);
    expect(screen.getByText("Verified paid stages")).toBeInTheDocument();
    expect(screen.getByText("Total Bookings")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("4.5 / 5")).toBeInTheDocument();
    expect(screen.getByText("2 reviews")).toBeInTheDocument();
    expect(screen.getByText("Full Detail")).toBeInTheDocument();
    expect(screen.getByText("Ceramic Coating")).toBeInTheDocument();
    expect(screen.getAllByTestId("analytics-bar-chart").length).toBeGreaterThan(0);
  });

  test("keeps range filters functional for Sales Manager", () => {
    openAnalytics(salesManager);

    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    expect(screen.getByText("Month")).toBeInTheDocument();
    expect(screen.getByText("August 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Quarterly" }));
    expect(screen.getByText("Quarter")).toBeInTheDocument();
    expect(screen.getByText("Q3 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Annual" }));
    expect(screen.getAllByText("2026").length).toBeGreaterThan(0);
  });

  test("exposes only Analytics export and blocks duplicate export clicks for Sales Manager", async () => {
    let resolveExport;
    downloadAuthenticatedFile.mockImplementation(() => new Promise((resolve) => {
      resolveExport = resolve;
    }));
    openAnalytics(salesManager);

    const button = screen.getByRole("button", { name: "Export as PDF" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(buildReportDownloadPath).toHaveBeenCalledWith("analytics", "pdf");
    expect(downloadAuthenticatedFile).toHaveBeenCalledTimes(1);
    expect(downloadAuthenticatedFile).toHaveBeenCalledWith("/api/admin/reports/analytics/pdf", "autoflow-analytics-report.pdf");
    expect(screen.getByRole("button", { name: "Exporting..." })).toBeDisabled();
    expect(screen.queryByText("Financial Tracker")).not.toBeInTheDocument();
    expect(screen.queryByText("Stock Monitoring")).not.toBeInTheDocument();
    expect(screen.queryByText("Audit Logs")).not.toBeInTheDocument();

    resolveExport();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Analytics report export started."));
  });

  test("exposes Analytics AI and blocks duplicate requests for Sales Manager", async () => {
    let resolveAi;
    mockGenerateAnalyticsInterpretation.mockImplementation(() => new Promise((resolve) => {
      resolveAi = resolve;
    }));
    openAnalytics(salesManager);

    const section = screen.getByRole("heading", { name: "AI Generated Descriptive Analytics" }).closest("section");
    const button = within(section).getByRole("button", { name: "Generate Descriptive Analysis" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(mockGenerateAnalyticsInterpretation).toHaveBeenCalledTimes(1);
    expect(within(section).getByRole("button", { name: "Generating..." })).toBeDisabled();

    resolveAi({
      available: true,
      analysisType: "descriptive",
      model: "mock-model",
      items: [{ type: "summary", title: "Summary", text: "Sales Manager analytics AI summary." }],
    });

    await waitFor(() => expect(within(section).getByText("Sales Manager analytics AI summary.")).toBeInTheDocument());
  });

  test("preserves Sales Manager Analytics access without granting unauthorized admin modules", () => {
    openAnalytics(salesManager);

    expect(screen.getByRole("heading", { name: "Total Sales Visual Analytics" })).toBeInTheDocument();
    expect(screen.queryByText("Financial Tracker")).not.toBeInTheDocument();
    expect(screen.queryByText("Audit Logs")).not.toBeInTheDocument();
    expect(screen.queryByText("User Management")).not.toBeInTheDocument();
  });
});
