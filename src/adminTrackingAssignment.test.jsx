import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminTracking from "./screens/admin/AdminTracking";

const mockUpdateBooking = jest.fn();
const mockGenerateTrackingIssueNote = jest.fn();

let mockBookings = [];

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

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    bookings: mockBookings,
    payments: [],
    users: [
      activeDetailerOne,
      activeDetailerTwo,
      customerUser,
      deletedDetailer,
      { id: "ADM-1", name: "Admin", email: "admin@example.com", userType: "Admin", role: "Admin", status: "active" },
    ],
    currentUser: { id: "ADM-1", name: "Admin", email: "admin@example.com", userType: "Admin", role: "Admin" },
    updateBooking: mockUpdateBooking,
    generateTrackingIssueNote: mockGenerateTrackingIssueNote,
  }),
}));

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
  mockUpdateBooking.mockReset();
  mockGenerateTrackingIssueNote.mockReset();
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
});
