import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StaffMain from "./screens/staff/StaffMain";
import { validateSpecialCredential } from "./utils/reauth";

const mockUseAdminData = jest.fn();

jest.mock("./context/AdminDataContext", () => ({
  AdminDataProvider: ({ children }) => <>{children}</>,
  useAdminData: () => mockUseAdminData(),
}));

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock("./utils/reauth", () => ({
  getCurrentUserDisplayName: (user = {}) => user.name || user.email || "",
  validateSpecialCredential: jest.fn(),
  verifyCurrentPassword: jest.fn(),
}));

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

const salesAssociate = {
  id: "STF-SA",
  email: "sales@example.com",
  name: "Sales Associate",
  userType: "Staff",
  role: "Sales Associate",
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
  payments: [
    {
      id: "PAY-1",
      bookingId: "B-PAY-1",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      service: "Ceramic Coating",
      date: "2099-12-31",
      totalAmount: 1000,
      finalAmount: 1000,
      amount: 1000,
      amountPaid: 0,
      remainingBalance: 1000,
      downPaymentRequired: true,
      downPaymentAmount: 300,
      status: "For Verification",
      downPaymentStatus: "For Verification",
      downPaymentMethod: "GCash",
      downPaymentReference: "DP-REF-1",
      downPaymentProofSubmittedAt: "2099-12-01T00:00:00.000Z",
      downPaymentReferenceCheckStatus: "submitted",
      downPaymentOcrAdvisoryStatus: "matched_advisory",
      finalPaymentStatus: "Pending",
    },
  ],
  currentUser: generalManager,
  createBooking: jest.fn(),
  updateBooking: jest.fn(),
  deleteBooking: jest.fn(),
  updatePayment: jest.fn(),
  loadPaymentProof: jest.fn().mockResolvedValue({}),
  loading: false,
  error: "",
  notifications: [],
  unreadNotificationCount: 0,
  notificationPermission: "unsupported",
  requestNotificationPermission: jest.fn(),
  markNotificationsRead: jest.fn(),
};

function setContext(overrides = {}) {
  mockUseAdminData.mockReturnValue({
    ...baseData,
    updatePayment: jest.fn().mockResolvedValue({}),
    loadPaymentProof: jest.fn().mockResolvedValue({}),
    ...overrides,
  });
}

beforeEach(() => {
  localStorage.clear();
  validateSpecialCredential.mockReset();
  validateSpecialCredential.mockResolvedValue(true);
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

describe("Sales Associate authorization foundation shell", () => {
  test("shows exactly the approved Sales Associate navigation modules", () => {
    setContext({ currentUser: salesAssociate });
    renderStaffMain(salesAssociate);

    for (const label of [
      "Dashboard",
      "Analytics",
      "Bookings",
      "Services",
      "Service Tracking",
      "Payment Tracking",
      "Engagement",
      "Profile",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    for (const label of [
      "User Management",
      "Detailer Management",
      "Stock Monitoring",
      "Financial Tracker",
      "Audit Logs",
      "My Work",
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  test("uses Admin Bookings parity without exposing Delete", () => {
    setContext({ currentUser: salesAssociate });
    renderStaffMain(salesAssociate);

    fireEvent.click(screen.getByText("Bookings"));

    expect(screen.getByRole("button", { name: "Export as PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add New Booking" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Edit Booking")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  test("uses Admin Tracking parity for Service Tracking", () => {
    setContext({
      currentUser: salesAssociate,
      bookings: [{
        ...baseData.bookings[0],
        id: "B-SA-TRACK-1",
        status: "Scheduled",
        assigned: "Detailer One",
        issueNote: "",
        issueTypes: [],
        issueMarkers: [],
        warrantyChecklistItems: [],
      }],
    });
    renderStaffMain(salesAssociate);

    fireEvent.click(screen.getByText("Service Tracking"));

    expect(screen.getByRole("button", { name: "Export as PDF" })).toBeInTheDocument();
    expect(screen.queryByText("View only")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Edit Tracking Row")).toBeInTheDocument();
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

describe("General Manager Payment Tracking parity shell", () => {
  test("uses canonical Admin Payments features for payment review", async () => {
    renderStaffMain();

    fireEvent.click(screen.getByText("Payment Tracking"));

    expect(screen.getByRole("button", { name: "Export as PDF" })).toBeInTheDocument();
    expect(screen.queryByText("View only")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "✎" }));

    expect(await screen.findByText("Review Payment")).toBeInTheDocument();
    expect(screen.getAllByText("Down Payment").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("DP-REF-1")).toBeInTheDocument();
    expect(screen.getByText("Submitted with customer-side OCR advisory metadata.")).toBeInTheDocument();
  });

  test("validates General Manager payment verification with Staff credential scope", async () => {
    const updatePayment = jest.fn().mockResolvedValue({});
    setContext({ updatePayment });
    renderStaffMain();

    fireEvent.click(screen.getByText("Payment Tracking"));
    fireEvent.click(screen.getByRole("button", { name: "✎" }));
    fireEvent.change(screen.getAllByLabelText("Status")[0], { target: { value: "Paid" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(screen.getByPlaceholderText("Enter special PIN"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm PIN" }));

    await waitFor(() => expect(validateSpecialCredential).toHaveBeenCalledTimes(1));
    expect(validateSpecialCredential).toHaveBeenCalledWith(
      "pin",
      "654321",
      "staff",
      expect.objectContaining({ userType: "Staff", role: "General Manager" }),
      "payment.verify"
    );
    await waitFor(() => expect(updatePayment).toHaveBeenCalledWith(
      "PAY-1",
      expect.objectContaining({
        downPaymentStatus: "Paid",
        specialPin: "654321",
      })
    ));
  });

  test("validates Sales Associate payment verification with Staff credential scope", async () => {
    const updatePayment = jest.fn().mockResolvedValue({});
    setContext({ currentUser: salesAssociate, updatePayment });
    renderStaffMain(salesAssociate);

    fireEvent.click(screen.getByText("Payment Tracking"));

    expect(screen.getByRole("button", { name: "Export as PDF" })).toBeInTheDocument();
    expect(screen.queryByText("View only")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "✎" }));
    fireEvent.change(screen.getAllByLabelText("Status")[0], { target: { value: "Paid" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(screen.getByPlaceholderText("Enter special PIN"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm PIN" }));

    await waitFor(() => expect(validateSpecialCredential).toHaveBeenCalledTimes(1));
    expect(validateSpecialCredential).toHaveBeenCalledWith(
      "pin",
      "654321",
      "staff",
      expect.objectContaining({ userType: "Staff", role: "Sales Associate" }),
      "payment.verify"
    );
    await waitFor(() => expect(updatePayment).toHaveBeenCalledWith(
      "PAY-1",
      expect.objectContaining({
        downPaymentStatus: "Paid",
        specialPin: "654321",
      })
    ));
  });

  test("other Staff roles without Payment Tracking keep the module hidden", () => {
    setContext({ currentUser: seniorDetailer });
    renderStaffMain(seniorDetailer);

    expect(screen.queryByText("Payment Tracking")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "✎" })).not.toBeInTheDocument();
  });
});
