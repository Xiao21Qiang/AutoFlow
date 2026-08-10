import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import StaffDashboard from "./screens/staff/StaffDashboard";
import StaffMain from "./screens/staff/StaffMain";

const mockUpdateQuoteRequest = jest.fn();
const mockUseAdminData = jest.fn();

jest.mock("./context/AdminDataContext", () => ({
  AdminDataProvider: ({ children }) => <>{children}</>,
  useAdminData: () => mockUseAdminData(),
}));

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock("./screens/admin/AdminAnalytics", () => () => (
  <div data-testid="shared-admin-analytics">Shared Admin Analytics</div>
));
jest.mock("./screens/admin/AdminAuditLogs", () => () => <div>Audit Logs</div>);
jest.mock("./screens/admin/AdminFinancialTracker", () => () => <div>Financial Tracker</div>);
jest.mock("./screens/admin/AdminUsers", () => () => <div>User Management</div>);
jest.mock("./screens/admin/AdminDetailerManagement", () => () => <div>Detailer Management</div>);
jest.mock("./screens/admin/AdminEngagement", () => () => <div>Admin Engagement</div>);

const currentUser = {
  id: "STF-GM-1",
  email: "gm@example.com",
  name: "General Manager",
  userType: "Staff",
  role: "General Manager",
};

const dashboardData = {
  bookings: [
    {
      id: "B-TEST-001",
      customer: "Kristine Mercado",
      customerEmail: "kristine@example.com",
      vehicle: "Sedan",
      plate: "ABC123",
      service: "Tint",
      carSize: "Compact",
      date: "2026-08-11",
      time: "09:00",
      status: "Scheduled",
    },
    {
      id: "B-TEST-002",
      customer: "DJ De Guzman",
      customerEmail: "dj@example.com",
      vehicle: "SUV",
      plate: "XYZ789",
      service: "Car Wash",
      carSize: "Large",
      date: "2026-08-11",
      time: "10:00",
      status: "Scheduled",
    },
  ],
  stockMonitoring: [],
  payments: [
    { id: "PAY-2", bookingId: "B-TEST-002", status: "Paid" },
  ],
  quoteRequests: [
    {
      id: "Q-TEST-001",
      fullName: "Ariana Cruz",
      service: "Ceramic Coating",
      vehicleType: "Car",
      carSize: "Sedan",
      phone: "09170000001",
      status: "Received",
      message: "First quote",
    },
    {
      id: "Q-TEST-002",
      fullName: "Marco Reyes",
      service: "Interior Detail",
      vehicleType: "SUV",
      carSize: "Large",
      phone: "09170000002",
      status: "Under Review",
      message: "Second quote",
    },
  ],
  summary: {},
  currentUser,
  loading: false,
  error: "",
  notifications: [],
  unreadNotificationCount: 0,
  notificationPermission: "unsupported",
  requestNotificationPermission: jest.fn(),
  markNotificationsRead: jest.fn(),
  updateQuoteRequest: mockUpdateQuoteRequest,
};

function setDashboardContext(overrides = {}) {
  mockUseAdminData.mockReturnValue({
    ...dashboardData,
    ...overrides,
  });
}

function clickButtonContaining(text) {
  const button = screen
    .getAllByRole("button")
    .find((item) => item.textContent.includes(text));
  expect(button).toBeTruthy();
  fireEvent.click(button);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-08-11T08:00:00+08:00"));
  mockUpdateQuoteRequest.mockReset();
  mockUpdateQuoteRequest.mockResolvedValue({});
  setDashboardContext();
  localStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Staff General Manager dashboard parity", () => {
  test("activates the correct booking row with the canonical booking details workflow", () => {
    render(<StaffDashboard session={currentUser} />);

    clickButtonContaining("SUV • Status: Scheduled");

    const modal = screen.getByText("Booking Details").closest(".stDetailModalOverlay");
    expect(within(modal).getByText("B-TEST-002")).toBeInTheDocument();
    expect(within(modal).getByText("DJ De Guzman")).toBeInTheDocument();
    expect(within(modal).getByText("Paid")).toBeInTheDocument();
    expect(within(modal).queryByText("B-TEST-001")).not.toBeInTheDocument();
  });

  test("keeps no-bookings placeholders non-actionable", () => {
    setDashboardContext({ bookings: [], payments: [] });
    render(<StaffDashboard session={currentUser} />);

    fireEvent.click(screen.getByText("No bookings"));

    expect(screen.queryByText("Booking Details")).not.toBeInTheDocument();
  });

  test("calendar controls continue to update the selected booking list", () => {
    render(<StaffDashboard session={currentUser} />);

    expect(screen.getByText("Selected: 2026-08-11 • 2 booking(s)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByText("Selected: 2026-08-11 • 2 booking(s)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "→" }));
    expect(screen.getByText(/September 2026/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "←" }));
    expect(screen.getByText(/August 2026/)).toBeInTheDocument();
  });

  test("opens and closes canonical quote details for the selected quote", () => {
    render(<StaffDashboard session={currentUser} />);

    clickButtonContaining("Marco Reyes");

    const modal = screen.getByText("Quote Request Details").closest(".stDetailModalOverlay");
    expect(within(modal).getByText("Marco Reyes")).toBeInTheDocument();
    expect(within(modal).getByText("Second quote")).toBeInTheDocument();
    expect(within(modal).queryByText("Ariana Cruz")).not.toBeInTheDocument();

    fireEvent.click(within(modal).getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Quote Request Details")).not.toBeInTheDocument();
  });

  test("updates quote status through the canonical quote ID", async () => {
    render(<StaffDashboard session={currentUser} />);

    clickButtonContaining("Marco Reyes");
    const modal = screen.getByText("Quote Request Details").closest(".stDetailModalOverlay");
    await act(async () => {
      fireEvent.change(within(modal).getByRole("combobox"), { target: { value: "Received" } });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockUpdateQuoteRequest).toHaveBeenCalledWith("Q-TEST-002", { status: "Received" });
    });
  });
});

describe("Staff General Manager analytics parity", () => {
  test("renders the shared Admin Analytics implementation while preserving account-management boundaries", () => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("user", JSON.stringify(currentUser));
    setDashboardContext();

    render(<StaffMain session={currentUser} />);

    fireEvent.click(screen.getByText("Analytics"));

    expect(screen.getByTestId("shared-admin-analytics")).toBeInTheDocument();
    expect(screen.queryByText("User Management")).not.toBeInTheDocument();
    expect(screen.queryByText("Detailer Management")).not.toBeInTheDocument();
  });
});
