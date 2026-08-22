import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import StaffMain from "./screens/staff/StaffMain";
import { validateSpecialCredential } from "./utils/reauth";
import { buildReportDownloadPath, downloadAuthenticatedFile } from "./utils/downloadExport";

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
  buildReportDownloadPath.mockClear();
  buildReportDownloadPath.mockImplementation((reportType, format) => `/api/admin/reports/${reportType}/${format}`);
  downloadAuthenticatedFile.mockReset();
  downloadAuthenticatedFile.mockResolvedValue(undefined);
  setContext();
});

function renderStaffMain(session = generalManager) {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("user", JSON.stringify(session));
  render(<StaffMain session={session} />);
}

function paidCancelledBookingPayment() {
  return {
    id: "PAY-CANCELLED",
    bookingId: "B-CANCELLED",
    customer: "Customer One",
    customerEmail: "customer@example.com",
    service: "Ceramic Coating",
    totalAmount: 1000,
    finalAmount: 1000,
    downPaymentRequired: true,
    downPaymentAmount: 300,
    downPaymentStatus: "Paid",
    downPaymentVerifiedAt: "2099-12-01T00:10:00.000Z",
    finalPaymentStatus: "Pending",
  };
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

describe("Sales Manager Bookings create shell", () => {
  test("uses canonical Admin Bookings validation without exposing Delete or changing Service Tracking view-only access", () => {
    setContext({ currentUser: salesManager });
    renderStaffMain(salesManager);

    fireEvent.click(screen.getByText("Bookings"));

    expect(screen.getByRole("button", { name: "Export as PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add New Booking" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Edit Booking")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Add New Booking" }));
    expect(screen.getByText("New Booking")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Save Booking" }).closest("form"));
    expect(screen.getAllByText("Please select a registered customer from the list.").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByText("Service Tracking"));
    expect(screen.getByRole("button", { name: "View Only" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export as PDF" })).not.toBeInTheDocument();
  });
});

describe("Sales Associate authorization foundation shell", () => {
  test("shows exactly the approved Sales Associate navigation modules", () => {
    setContext({ currentUser: salesAssociate });
    renderStaffMain(salesAssociate);

    for (const label of [
      "Dashboard",
      "Bookings",
      "Services",
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
      "Analytics",
      "Service Tracking",
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

  test("Dashboard Create Booking opens the shared Sales Associate New Booking modal", () => {
    setContext({ currentUser: salesAssociate });
    renderStaffMain(salesAssociate);

    fireEvent.click(screen.getByText("Create Booking").closest(".stQuickCard"));

    expect(screen.getByRole("button", { name: "Export as PDF" })).toBeInTheDocument();
    expect(screen.getByText("New Booking")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  test("matches Sales Manager cancelled booking restrictions without exposing Delete", () => {
    setContext({ currentUser: salesAssociate, payments: [paidCancelledBookingPayment()] });
    renderStaffMain(salesAssociate);

    fireEvent.click(screen.getByText("Bookings"));

    expect(screen.queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("button", { name: "Reschedule Booking" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  test("preserves the approved Sales Associate navigation after Profile save", async () => {
    const profileSession = {
      ...salesAssociate,
      first: "Sales",
      last: "Associate",
      phone: "09170000001",
    };
    const updateProfile = jest.fn().mockResolvedValue({
      ...profileSession,
      first: "Sasha",
      email: "sasha@example.com",
      userType: "Staff",
      role: "Sales Associate",
    });
    setContext({
      currentUser: profileSession,
      updateProfile,
      requestPasswordChangeOtp: jest.fn(),
      verifyPasswordChangeOtp: jest.fn(),
      resetPasswordWithOtp: jest.fn(),
    });
    renderStaffMain(profileSession);

    fireEvent.click(screen.getByText("Profile"));
    fireEvent.click(screen.getByRole("button", { name: "Edit Account" }));
    fireEvent.change(screen.getByLabelText("Edit first name"), { target: { value: "Sasha" } });
    fireEvent.change(screen.getByLabelText("Edit email"), { target: { value: "Sasha@Example.com" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.queryByText("Update your personal information")).not.toBeInTheDocument());
    expect(updateProfile).toHaveBeenCalledWith({
      first: "Sasha",
      last: "Associate",
      email: "sasha@example.com",
      phone: "09170000001",
    });
    expect(updateProfile.mock.calls[0][0]).not.toHaveProperty("role");
    expect(updateProfile.mock.calls[0][0]).not.toHaveProperty("userType");
    expect(updateProfile.mock.calls[0][0]).not.toHaveProperty("status");

    for (const label of [
      "Dashboard",
      "Bookings",
      "Services",
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
      "Analytics",
      "Service Tracking",
      "My Work",
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getByText("Bookings"));
    expect(screen.getByRole("button", { name: "Add New Booking" })).toBeInTheDocument();
    expect(screen.queryByText("Financial Tracker")).not.toBeInTheDocument();
  });

  test("blocks duplicate Sales Associate Bookings export clicks", async () => {
    let resolveExport;
    downloadAuthenticatedFile.mockImplementation(() => new Promise((resolve) => {
      resolveExport = resolve;
    }));
    setContext({ currentUser: salesAssociate });
    renderStaffMain(salesAssociate);

    fireEvent.click(screen.getByText("Bookings"));
    const exportButton = screen.getByRole("button", { name: "Export as PDF" });
    fireEvent.click(exportButton);
    fireEvent.click(exportButton);

    expect(buildReportDownloadPath).toHaveBeenCalledWith("bookings", "pdf");
    expect(downloadAuthenticatedFile).toHaveBeenCalledTimes(1);
    expect(downloadAuthenticatedFile).toHaveBeenCalledWith("/api/admin/reports/bookings/pdf", "autoflow-bookings-report.pdf");
    expect(screen.getByRole("button", { name: "Exporting..." })).toBeDisabled();

    resolveExport();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Bookings report export started."));
  });

  test("does not expose Service Tracking navigation or actions to Sales Associate", () => {
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

    expect(screen.queryByText("Service Tracking")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export as PDF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View Only" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  test("does not render Sales Associate Service Tracking details from booking-like data", () => {
    setContext({
      currentUser: salesAssociate,
      bookings: [{
        ...baseData.bookings[0],
        id: "B-SA-TRACK-2",
        status: "In Progress",
        assigned: "Detailer One",
        issueNote: "Paint blemish documented before service.",
        issueTypes: ["Paint blemish"],
        issueMarkers: [{ id: 1, x: 42, y: 58, issueType: "Paint blemish" }],
      }],
    });
    renderStaffMain(salesAssociate);

    expect(screen.queryByText("Service Tracking")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Service Tracking Details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View Only" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Special PIN")).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "View Only" })).toBeInTheDocument();
  });
});

describe("Sales Manager Service Tracking view-only shell", () => {
  test("opens selected tracking details without mutation controls", () => {
    const updateBooking = jest.fn();
    setContext({
      currentUser: salesManager,
      updateBooking,
      bookings: [{
        ...baseData.bookings[0],
        id: "B-SM-TRACK-1",
        status: "In Progress",
        assigned: "Detailer One",
        issueNote: "Paint blemish documented before service.",
        issueTypes: ["Paint blemish"],
        issueMarkers: [{ id: 1, x: 42, y: 58, issueType: "Paint blemish" }],
        warrantyCoveragePackage: "Standard Warranty",
        warrantyChecklist: "Customer advised on aftercare.",
        warrantyChecklistItems: [{ id: "client-inspection", label: "Final inspection with client", done: true, doneBy: "Detailer One", notes: "Checked" }],
        warrantyAcknowledgement: {
          dateLocation: "2099-12-31 / QC",
          carModelYearColor: "Civic 2024 Blue",
          plateCsNumber: "ABC123",
          serviceAvailed: "Ceramic Coating",
          clientName: "Customer One",
          clientSignature: "Customer One",
        },
        warrantyReleased: false,
      }],
    });
    renderStaffMain(salesManager);

    fireEvent.click(screen.getByText("Service Tracking"));

    const viewButton = screen.getByRole("button", { name: "View Only" });
    expect(viewButton).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export as PDF" })).not.toBeInTheDocument();

    fireEvent.click(viewButton);

    const dialog = screen.getByRole("dialog", { name: "Service Tracking Details" });
    expect(within(dialog).getByText("B-SM-TRACK-1")).toBeInTheDocument();
    expect(within(dialog).getByText("In Progress")).toBeInTheDocument();
    expect(within(dialog).getByText("Detailer One")).toBeInTheDocument();
    expect(within(dialog).getByText("Paint blemish documented before service.")).toBeInTheDocument();
    expect(within(dialog).getByText(/Marker 1: Paint blemish at 42%, 58%/)).toBeInTheDocument();
    expect(within(dialog).getByText("Standard Warranty")).toBeInTheDocument();
    expect(within(dialog).getByText(/Final inspection with client: Done by Detailer One - Checked/)).toBeInTheDocument();
    expect(within(dialog).getByText("2099-12-31 / QC")).toBeInTheDocument();

    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /generate suggestion/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /add marker/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Special PIN")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog", { name: "Service Tracking Details" })).not.toBeInTheDocument();
    expect(updateBooking).not.toHaveBeenCalled();
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
    fireEvent.change(screen.getByPlaceholderText("General Manager"), { target: { value: "General Manager" } });
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
        accountName: "General Manager",
      })
    ));
  });

  test("validates Sales Associate payment verification with Staff credential scope", async () => {
    const updatePayment = jest.fn().mockResolvedValue({});
    setContext({ currentUser: salesAssociate, updatePayment });
    renderStaffMain(salesAssociate);

    fireEvent.click(screen.getByText("Payment Tracking"));

    expect(screen.queryByRole("button", { name: "Export as PDF" })).not.toBeInTheDocument();
    expect(screen.queryByText("View only")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "✎" }));
    expect(await screen.findByText("Review Payment")).toBeInTheDocument();
    expect(screen.getByDisplayValue("GCash")).toBeInTheDocument();
    expect(screen.getByDisplayValue("DP-REF-1")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/December 1, 2099/)).toBeInTheDocument();
    expect(screen.getByText("Submitted with customer-side OCR advisory metadata.")).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("Status")[0], { target: { value: "Paid" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(screen.getByPlaceholderText("Enter special PIN"), { target: { value: "654321" } });
    fireEvent.change(screen.getByPlaceholderText("Sales Associate"), { target: { value: "Sales Associate" } });
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
        accountName: "Sales Associate",
      })
    ));
    const payload = updatePayment.mock.calls[0][1];
    expect(payload).not.toHaveProperty("downPaymentReference");
    expect(payload).not.toHaveProperty("downPaymentProofSubmittedAt");
    expect(payload).not.toHaveProperty("downPaymentReferenceCheckStatus");
    expect(payload).not.toHaveProperty("downPaymentOcrAdvisoryStatus");
    expect(payload).not.toHaveProperty("proofImage");
    expect(payload).not.toHaveProperty("proofFileName");
  });

  test("blocks duplicate Sales Associate payment review confirmations", async () => {
    let resolveUpdate;
    const updatePayment = jest.fn(() => new Promise((resolve) => {
      resolveUpdate = resolve;
    }));
    setContext({ currentUser: salesAssociate, updatePayment });
    renderStaffMain(salesAssociate);

    fireEvent.click(screen.getByText("Payment Tracking"));
    fireEvent.click(screen.getByRole("button", { name: "✎" }));
    fireEvent.change(screen.getAllByLabelText("Status")[0], { target: { value: "Paid" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(screen.getByPlaceholderText("Enter special PIN"), { target: { value: "654321" } });
    fireEvent.change(screen.getByPlaceholderText("Sales Associate"), { target: { value: "Sales Associate" } });
    const confirmButton = screen.getByRole("button", { name: "Confirm PIN" });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    await waitFor(() => expect(validateSpecialCredential).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(updatePayment).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveUpdate({});
    });
  });

  test("requires Sales Associate Staff PIN confirmation for payment rejection", async () => {
    const updatePayment = jest.fn().mockResolvedValue({});
    setContext({ currentUser: salesAssociate, updatePayment });
    renderStaffMain(salesAssociate);

    fireEvent.click(screen.getByText("Payment Tracking"));
    fireEvent.click(screen.getByRole("button", { name: "✎" }));
    fireEvent.change(screen.getAllByLabelText("Status")[0], { target: { value: "Rejected" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Reject Down Payment")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Enter special PIN"), { target: { value: "654321" } });
    fireEvent.change(screen.getByPlaceholderText("Sales Associate"), { target: { value: "Sales Associate" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm PIN" }));

    await waitFor(() => expect(validateSpecialCredential).toHaveBeenCalledWith(
      "pin",
      "654321",
      "staff",
      expect.objectContaining({ userType: "Staff", role: "Sales Associate" }),
      "payment.verify"
    ));
    await waitFor(() => expect(updatePayment).toHaveBeenCalledWith(
      "PAY-1",
      expect.objectContaining({
        downPaymentStatus: "Rejected",
        specialPin: "654321",
        accountName: "Sales Associate",
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
