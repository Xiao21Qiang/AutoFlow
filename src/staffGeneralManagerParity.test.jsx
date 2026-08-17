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

const salesAssociate = {
  id: "STF-SA-1",
  email: "sales@example.com",
  name: "Sales Associate",
  userType: "Staff",
  role: "Sales Associate",
};

const salesManager = {
  id: "STF-SM-1",
  email: "sales-manager@example.com",
  name: "Sales Manager",
  userType: "Staff",
  role: "Sales Manager",
};

const seniorDetailer = {
  id: "STF-SR-1",
  email: "senior@example.com",
  name: "Senior Detailer",
  userType: "Staff",
  role: "Senior Detailer",
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
  stockMonitoring: [
    { id: "STK-CRIT", name: "Shampoo", currentStock: 1, maxStock: 10, reorderLevel: 3 },
    { id: "STK-LOW", name: "Wax", currentStock: 4, maxStock: 10, reorderLevel: 3 },
    { id: "STK-OK", name: "Towel", currentStock: 8, maxStock: 10, reorderLevel: 3 },
  ],
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
  test("keeps General Manager on the canonical staff dashboard including authorized stock shortcuts", () => {
    const goTo = jest.fn();
    render(<StaffDashboard session={currentUser} goTo={goTo} />);

    expect(screen.getByText("Recent Quote Requests")).toBeInTheDocument();
    expect(screen.getByText("Upcoming Bookings")).toBeInTheDocument();
    expect(screen.getByText("Critical Stock")).toBeInTheDocument();
    expect(screen.getByText("Low Stock")).toBeInTheDocument();
    expect(screen.getByText("Healthy Stock")).toBeInTheDocument();
    expect(screen.getByText("Restock item")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Restock item").closest(".stQuickCard"));
    expect(goTo).toHaveBeenCalledWith("stock-monitoring");
  });

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

describe("Sales Associate dashboard parity", () => {
  test("renders the canonical GM dashboard content while withholding unauthorized stock shortcuts", () => {
    const goTo = jest.fn();
    render(<StaffDashboard session={salesAssociate} goTo={goTo} />);

    expect(screen.getByText("Recent Quote Requests")).toBeInTheDocument();
    expect(screen.getByText("Upcoming Bookings")).toBeInTheDocument();
    expect(screen.getByText("Bookings today")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Paid Revenue")).toBeInTheDocument();
    expect(screen.getByText("Create Booking")).toBeInTheDocument();
    expect(screen.getByText("View Services")).toBeInTheDocument();
    expect(screen.getByText("Customer Reviews")).toBeInTheDocument();

    expect(screen.queryByText("Critical Stock")).not.toBeInTheDocument();
    expect(screen.queryByText("Low Stock")).not.toBeInTheDocument();
    expect(screen.queryByText("Healthy Stock")).not.toBeInTheDocument();
    expect(screen.queryByText("Restock item")).not.toBeInTheDocument();
    expect(screen.queryByText("Financial Tracker")).not.toBeInTheDocument();
    expect(screen.queryByText("User Management")).not.toBeInTheDocument();
    expect(screen.queryByText("Audit Logs")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Bookings today").closest("button"));
    fireEvent.click(screen.getByText("In Progress").closest("button"));
    fireEvent.click(screen.getByText("Paid Revenue").closest("button"));
    fireEvent.click(screen.getByText("View Services").closest(".stQuickCard"));
    fireEvent.click(screen.getByText("Customer Reviews").closest(".stQuickCard"));

    expect(goTo).toHaveBeenCalledWith("bookings");
    expect(goTo).toHaveBeenCalledWith("tracking");
    expect(goTo).toHaveBeenCalledWith("payments");
    expect(goTo).toHaveBeenCalledWith("services");
    expect(goTo).toHaveBeenCalledWith("engagement");
    expect(goTo).not.toHaveBeenCalledWith("stock-monitoring");
  });

  test("opens the same booking detail modal without Delete exposure", () => {
    render(<StaffDashboard session={salesAssociate} />);

    clickButtonContaining("SUV • Status: Scheduled");

    const modal = screen.getByText("Booking Details").closest(".stDetailModalOverlay");
    expect(within(modal).getByText("B-TEST-002")).toBeInTheDocument();
    expect(within(modal).getByText("DJ De Guzman")).toBeInTheDocument();
    expect(within(modal).getByText("Paid")).toBeInTheDocument();
    expect(within(modal).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  test("updates quote status once while a Dashboard update is already submitting", async () => {
    let resolveUpdate;
    mockUpdateQuoteRequest.mockImplementation(() => new Promise((resolve) => {
      resolveUpdate = resolve;
    }));
    render(<StaffDashboard session={salesAssociate} />);

    clickButtonContaining("Marco Reyes");
    const modal = screen.getByText("Quote Request Details").closest(".stDetailModalOverlay");

    fireEvent.change(within(modal).getByRole("combobox"), { target: { value: "Received" } });
    fireEvent.change(within(modal).getByRole("combobox"), { target: { value: "Under Review" } });

    expect(mockUpdateQuoteRequest).toHaveBeenCalledTimes(1);
    expect(within(modal).getByRole("combobox")).toBeDisabled();

    await act(async () => {
      resolveUpdate({});
      await Promise.resolve();
    });

    await waitFor(() => expect(within(modal).getByRole("combobox")).not.toBeDisabled());
  });
});

describe("Staff dashboard role regressions", () => {
  test("Sales Manager keeps authorized Dashboard shortcuts without stock-module access", () => {
    render(<StaffDashboard session={salesManager} />);

    expect(screen.getByText("Bookings today")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Paid Revenue")).toBeInTheDocument();
    expect(screen.getByText("Create Booking")).toBeInTheDocument();
    expect(screen.queryByText("Restock item")).not.toBeInTheDocument();
    expect(screen.queryByText("Critical Stock")).not.toBeInTheDocument();
  });

  test("ordinary assigned-work Staff do not receive payment, stock, service, or engagement Dashboard shortcuts", () => {
    render(<StaffDashboard session={seniorDetailer} />);

    expect(screen.getByText("Bookings today")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.queryByText("Paid Revenue")).not.toBeInTheDocument();
    expect(screen.queryByText("Restock item")).not.toBeInTheDocument();
    expect(screen.queryByText("View Services")).not.toBeInTheDocument();
    expect(screen.queryByText("Customer Reviews")).not.toBeInTheDocument();
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
