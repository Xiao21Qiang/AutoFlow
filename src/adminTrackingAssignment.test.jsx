import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminTracking from "./screens/admin/AdminTracking";
import { ACTION_KEYS } from "./utils/rbac";

const mockUpdateBooking = jest.fn();
const mockGenerateTrackingIssueNote = jest.fn();
const mockSecurityConfirm = jest.fn();

let mockBookings = [];
let mockCurrentUser = null;

const activeDetailerOne = {
  id: "STF-1",
  name: "Detailer One",
  email: "detailer.one@example.com",
  userType: "Staff",
  role: "Senior Detailer",
  status: "active",
};
const activeDetailerTwo = {
  id: "STF-2",
  name: "Detailer Two",
  email: "detailer.two@example.com",
  userType: "Staff",
  role: "Junior Detailer",
  status: "active",
};
const customerUser = {
  id: "CUS-1",
  name: "Customer One",
  email: "customer@example.com",
  userType: "Customer",
  role: "New",
  status: "active",
};
const deletedDetailer = {
  id: "STF-DEL",
  name: "Deleted Detailer",
  email: "deleted@example.com",
  userType: "Staff",
  role: "Senior Detailer",
  status: "deleted",
};
const mockAdminUser = { id: "ADM-1", name: "Admin", email: "admin@example.com", userType: "Admin", role: "Admin" };
const generalManagerUser = { id: "STF-GM", name: "General Manager", email: "gm@example.com", userType: "Staff", role: "General Manager" };

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    bookings: mockBookings,
    payments: [],
    users: [
      activeDetailerOne,
      activeDetailerTwo,
      customerUser,
      deletedDetailer,
      { ...mockAdminUser, status: "active" },
    ],
    currentUser: mockCurrentUser,
    updateBooking: mockUpdateBooking,
    generateTrackingIssueNote: mockGenerateTrackingIssueNote,
  }),
}));

jest.mock("./components/common/SecurityConfirmModal", () => (props) => {
  mockSecurityConfirm(props);
  if (!props.open) return null;
  return <div role="dialog" aria-label={props.title || "Security confirmation"}>{props.message}</div>;
});

function seedBookings(overrides = {}) {
  mockBookings = [
    {
      id: "B-1",
      customer: "Customer One",
      customerEmail: "customer@example.com",
      date: "2099-12-31",
      service: "Ceramic Coating",
      vehicle: "Civic",
      status: "Scheduled",
      assigned: "Detailer One",
      issueNote: "",
      issueTypes: [],
      issueMarkers: [],
      warrantyChecklistItems: [],
      ...overrides,
    },
  ];
}

function openEditModal() {
  const result = render(<AdminTracking />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  return result;
}

function assignedSelect() {
  return screen.getByLabelText("Assigned To");
}

function selectOptionValues(select) {
  return Array.from(select.options).map((option) => option.value);
}

beforeEach(() => {
  seedBookings();
  mockCurrentUser = mockAdminUser;
  mockUpdateBooking.mockReset();
  mockGenerateTrackingIssueNote.mockReset();
  mockSecurityConfirm.mockReset();
  mockUpdateBooking.mockImplementation(async (id, payload) => {
    const index = mockBookings.findIndex((booking) => booking.id === id);
    const updated = { ...mockBookings[index], ...payload };
    mockBookings = mockBookings.map((booking, bookingIndex) => bookingIndex === index ? updated : booking);
    return updated;
  });
});

describe("Admin Service Tracking assignment editing", () => {
  test("displays current assigned staff in an editable Admin control with eligible options only", () => {
    openEditModal();

    const select = assignedSelect();
    expect(select).toBeEnabled();
    expect(select).toHaveValue("Detailer One");
    expect(selectOptionValues(select)).toEqual(expect.arrayContaining(["Detailer One", "Detailer Two"]));
    expect(selectOptionValues(select)).not.toEqual(expect.arrayContaining(["Customer One", "Deleted Detailer"]));
  });

  test("saves a changed assigned detailer and shows it when the row is reopened", async () => {
    const { rerender } = openEditModal();

    fireEvent.change(assignedSelect(), { target: { value: "Detailer Two" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockUpdateBooking).toHaveBeenCalledTimes(1));
    expect(mockUpdateBooking).toHaveBeenCalledWith("B-1", expect.objectContaining({
      assigned: "Detailer Two",
      status: "Scheduled",
    }));
    await waitFor(() => expect(screen.queryByText("Edit Tracking Row")).not.toBeInTheDocument());

    rerender(<AdminTracking />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(assignedSelect()).toHaveValue("Detailer Two");
  });

  test("blocks blank assigned detailer changes with inline validation", () => {
    openEditModal();

    fireEvent.change(assignedSelect(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Please select an assigned detailer.")).toBeInTheDocument();
    expect(screen.getByText("Edit Tracking Row")).toBeInTheDocument();
    expect(mockUpdateBooking).not.toHaveBeenCalled();
  });

  test("preserves assignment and status when both are changed in one tracking update", async () => {
    seedBookings({ issueNote: "Saved issue note before starting service." });
    openEditModal();

    fireEvent.change(assignedSelect(), { target: { value: "Detailer Two" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "In Progress" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockUpdateBooking).toHaveBeenCalledTimes(1));
    expect(mockUpdateBooking).toHaveBeenCalledWith("B-1", expect.objectContaining({
      assigned: "Detailer Two",
      status: "In Progress",
    }));
  });

  test("keeps existing status safeguards and does not submit duplicate tracking saves", async () => {
    openEditModal();

    fireEvent.change(assignedSelect(), { target: { value: "Detailer Two" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "In Progress" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getAllByText("Issue notes must be saved before starting the service.").length).toBeGreaterThan(0);
    expect(mockUpdateBooking).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Scheduled" } });
    let resolveUpdate;
    mockUpdateBooking.mockImplementationOnce(() => new Promise((resolve) => {
      resolveUpdate = () => resolve({ ...mockBookings[0], assigned: "Detailer Two" });
    }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Saving..." }));

    expect(mockUpdateBooking).toHaveBeenCalledTimes(1);
    resolveUpdate();
    await waitFor(() => expect(screen.queryByText("Saving...")).not.toBeInTheDocument());
  });

  test("uses actor-derived special credential scope for General Manager tracking cancellation", () => {
    mockCurrentUser = generalManagerUser;
    openEditModal();

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Cancelled" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("dialog", { name: "Cancel Tracking Record" })).toBeInTheDocument();
    expect(screen.getByText("Enter the special PIN before cancelling this tracking record.")).toBeInTheDocument();

    const openSecurityProps = mockSecurityConfirm.mock.calls
      .map(([props]) => props)
      .reverse()
      .find((props) => props.open);
    expect(openSecurityProps.currentUser).toEqual(generalManagerUser);
    expect(openSecurityProps.scope).toBeUndefined();
    expect(openSecurityProps.actionKey).toBe(ACTION_KEYS.bookingUpdateStatus);
    expect(mockUpdateBooking).not.toHaveBeenCalled();
  });

  test("generates an Admin issue note suggestion once and displays the canonical result", async () => {
    openEditModal();
    mockGenerateTrackingIssueNote.mockResolvedValueOnce({
      available: true,
      technicianFriendlyNote: "Inspect the marked paint blemish before starting the coating.",
      suggestedNextAction: "Confirm surface prep requirements.",
      customerSafeSummary: "A small paint concern needs review before service starts.",
      model: "test-model",
    });

    const generateButton = screen.getByRole("button", { name: "Generate Suggestion" });
    fireEvent.click(generateButton);
    fireEvent.click(generateButton);

    expect(mockGenerateTrackingIssueNote).toHaveBeenCalledTimes(1);
    expect(mockGenerateTrackingIssueNote).toHaveBeenCalledWith(expect.objectContaining({
      bookingId: "B-1",
      serviceType: "Ceramic Coating",
      vehicleDetails: "Civic",
      currentTrackingStatus: "Scheduled",
    }));
    expect(screen.getByRole("button", { name: "Generating..." })).toBeDisabled();

    await waitFor(() => expect(screen.getByText("Inspect the marked paint blemish before starting the coating.")).toBeInTheDocument());
    expect(screen.getByText("Next action:")).toBeInTheDocument();
    expect(screen.getByText("Confirm surface prep requirements.")).toBeInTheDocument();
    expect(screen.getByText("Customer summary:")).toBeInTheDocument();
    expect(screen.queryByText("Unable to generate analysis right now.")).not.toBeInTheDocument();
  });

  test("shows provider configuration failures without mutating tracking data", async () => {
    openEditModal();
    mockGenerateTrackingIssueNote.mockResolvedValueOnce({
      available: false,
      message: "AI provider configuration needs attention.",
      errorCategory: "provider-auth",
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Suggestion" }));

    await waitFor(() => expect(screen.getByText("AI provider configuration needs attention.")).toBeInTheDocument());
    expect(mockGenerateTrackingIssueNote).toHaveBeenCalledTimes(1);
    expect(mockUpdateBooking).not.toHaveBeenCalled();
    expect(screen.queryByText("Inspect the marked paint blemish before starting the coating.")).not.toBeInTheDocument();
  });

  test("treats malformed successful AI payloads as unavailable instead of applying empty text", async () => {
    openEditModal();
    mockGenerateTrackingIssueNote.mockResolvedValueOnce({ available: true, model: "test-model" });

    fireEvent.click(screen.getByRole("button", { name: "Generate Suggestion" }));

    await waitFor(() => expect(screen.getByText("AI unavailable right now.")).toBeInTheDocument());
    expect(mockUpdateBooking).not.toHaveBeenCalled();
  });
});
