import { fireEvent, render, screen } from "@testing-library/react";
import StaffMain from "./screens/staff/StaffMain";

const mockUseAdminData = jest.fn();

jest.mock("./context/AdminDataContext", () => ({
  AdminDataProvider: ({ children }) => <>{children}</>,
  useAdminData: () => mockUseAdminData(),
}));

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
}), { virtual: true });

const generalManager = {
  id: "STF-GM",
  email: "gm@example.com",
  name: "General Manager",
  userType: "Staff",
  role: "General Manager",
};

const seniorDetailer = {
  id: "STF-SR",
  email: "senior@example.com",
  name: "Senior Detailer",
  userType: "Staff",
  role: "Senior Detailer",
};

const baseData = {
  bookings: [
    {
      id: "B-CANCELLED",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      vehicle: "Civic",
      plate: "ABC123",
      service: "Ceramic Coating",
      carSize: "Sedan / Small Car",
      assigned: "Detailer One",
      date: "2099-12-31",
      time: "10:00",
      placeSlot: 1,
      status: "Cancelled",
    },
  ],
  services: [{ id: "SVC-1", name: "Ceramic Coating", enabled: true, mins: 60, price: 1000, allowedArrivalTimes: ["10:00"] }],
  promos: [{ id: "PROMO-1", title: "Summer Promo", status: "active", discountType: "Fixed", discountValue: 100 }],
  stockMonitoring: [],
  quoteRequests: [],
  summary: {},
  reviews: [],
  commissions: [],
  expenses: [],
  auditLogs: [],
  archivedAuditLogs: [],
  financialReport: { totals: {}, payments: [], expenses: [], commissions: [] },
  alerts: [],
  settings: { requiredDownPaymentAmount: 0 },
  users: [
    { id: "CUS-1", name: "Customer One", email: "customer@example.com", userType: "Customer", role: "New", status: "active", cars: [] },
    { id: "STF-1", name: "Detailer One", email: "detailer@example.com", userType: "Staff", role: "Senior Detailer", status: "active" },
  ],
  payments: [],
  currentUser: generalManager,
  createBooking: jest.fn(),
  updateBooking: jest.fn(),
  deleteBooking: jest.fn(),
  loading: false,
  error: "",
  notifications: [],
  unreadNotificationCount: 0,
  notificationPermission: "unsupported",
  requestNotificationPermission: jest.fn(),
  markNotificationsRead: jest.fn(),
};

function setContext(overrides = {}) {
  mockUseAdminData.mockReturnValue({ ...baseData, ...overrides });
}

beforeEach(() => {
  localStorage.clear();
  setContext();
});

function renderStaffMain(session = generalManager) {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("user", JSON.stringify(session));
  render(<StaffMain session={session} />);
}

describe("General Manager Bookings parity shell", () => {
  test("uses canonical Admin Bookings features but does not render Delete", () => {
    renderStaffMain();

    fireEvent.click(screen.getByText("Bookings"));

    expect(screen.getByRole("button", { name: "Export as PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add New Booking" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Edit Booking")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  test("other Staff roles keep the Staff Bookings implementation", () => {
    setContext({ currentUser: seniorDetailer });
    renderStaffMain(seniorDetailer);

    fireEvent.click(screen.getByText("Bookings"));

    expect(screen.queryByRole("button", { name: "Export as PDF" })).not.toBeInTheDocument();
  });
});

describe("General Manager Service Tracking parity shell", () => {
  test("uses canonical Admin Tracking features for unassigned tracking records", () => {
    setContext({
      bookings: [{
        ...baseData.bookings[0],
        id: "B-TRACK-1",
        status: "Scheduled",
        assigned: "Detailer One",
        issueNote: "",
        issueTypes: [],
        issueMarkers: [],
        warrantyChecklistItems: [],
      }],
    });
    renderStaffMain();

    fireEvent.click(screen.getByText("Service Tracking"));

    expect(screen.getByRole("button", { name: "Export as PDF" })).toBeInTheDocument();
    expect(screen.queryByText("View only")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Edit Tracking Row")).toBeInTheDocument();
    expect(screen.getByLabelText("Assigned To")).toBeEnabled();
  });

  test("other Staff roles keep assigned-only Staff Tracking behavior", () => {
    setContext({ currentUser: seniorDetailer });
    renderStaffMain(seniorDetailer);

    fireEvent.click(screen.getByText("Service Tracking"));

    expect(screen.queryByRole("button", { name: "Export as PDF" })).not.toBeInTheDocument();
    expect(screen.getByText("View only")).toBeInTheDocument();
  });
});
