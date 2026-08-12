import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminBookings from "./screens/admin/AdminBookings";
import { ACTION_KEYS } from "./utils/rbac";
import { validateSpecialCredential } from "./utils/reauth";

const mockCreateBooking = jest.fn();
const mockUpdateBooking = jest.fn();
const mockRescheduleBooking = jest.fn();
const mockDeleteBooking = jest.fn();

const baseUsers = [
  {
    id: "CUS-1",
    name: "Customer One",
    email: "customer@example.com",
    userType: "Customer",
    role: "New",
    status: "active",
    cars: [],
  },
  {
    id: "STF-1",
    name: "Detailer One",
    email: "detailer@example.com",
    userType: "Staff",
    role: "Senior Detailer",
    status: "active",
  },
];

const services = [
  {
    id: "SVC-1",
    name: "Ceramic Coating",
    enabled: true,
    mins: 60,
    price: 1000,
    allowedArrivalTimes: ["10:00", "13:00"],
  },
];

let mockData = {};

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    bookings: [],
    services,
    promos: [],
    users: baseUsers,
    payments: [],
    currentUser: { id: "ADM-1", name: "Admin", email: "admin@example.com", userType: "Admin", role: "Admin" },
    createBooking: mockCreateBooking,
    updateBooking: mockUpdateBooking,
    rescheduleBooking: mockRescheduleBooking,
    deleteBooking: mockDeleteBooking,
    ...mockData,
  }),
}));

jest.mock("./utils/reauth", () => ({
  getCurrentUserDisplayName: (user) => String(user?.name || user?.email || "").trim(),
  validateSpecialCredential: jest.fn(),
  verifyCurrentPassword: jest.fn(),
}));

function openModal() {
  render(<AdminBookings />);
  fireEvent.click(screen.getByRole("button", { name: "Add New Booking" }));
}

function openQuickModal() {
  render(<AdminBookings initialAction="open-add-booking" onActionHandled={jest.fn()} />);
}

function openModalWithProps(props = {}) {
  render(<AdminBookings {...props} />);
}

function selectModalOption(label, option) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.click(screen.getByRole("button", { name: option }));
}

async function selectCustomer() {
  const input = screen.getByLabelText("Customer Name");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Customer One" } });
  fireEvent.click(await screen.findByRole("button", { name: /Customer One/ }));
}

async function fillValidForm({ skip = [] } = {}) {
  const skipped = new Set(skip);
  if (!skipped.has("customer")) await selectCustomer();
  if (!skipped.has("vehicle")) fireEvent.change(screen.getByLabelText("Vehicle"), { target: { value: "Civic" } });
  if (!skipped.has("plate")) fireEvent.change(screen.getByLabelText("Plate Number"), { target: { value: "ABC123" } });
  if (!skipped.has("service")) selectModalOption("Service", "Ceramic Coating");
  if (!skipped.has("carSize")) selectModalOption("Car Size", "Sedan / Small Car");
  if (!skipped.has("assigned")) selectModalOption("Assigned Detailer", "Detailer One");
  if (!skipped.has("date")) fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2099-12-31" } });
  if (!skipped.has("time")) fireEvent.change(screen.getByLabelText("Time"), { target: { value: "10:00" } });
  if (!skipped.has("placeSlot")) selectModalOption("Place Slot", "Place Slot 2");
}

function getBookingRow(bookingId) {
  return screen.getByText(bookingId).closest("tr");
}

beforeEach(() => {
  mockData = {};
  mockCreateBooking.mockReset();
  mockUpdateBooking.mockReset();
  mockRescheduleBooking.mockReset();
  mockDeleteBooking.mockReset();
  validateSpecialCredential.mockReset();
  validateSpecialCredential.mockResolvedValue(true);
});

describe("Admin Add New Booking validation", () => {
  test("Admin Cancelled booking without eligible payment is locked, cannot reschedule, and keeps Admin delete available", () => {
    mockData = {
      promos: [{ id: "PROMO-1", title: "Summer Promo", status: "active", discountType: "Fixed", discountValue: 100 }],
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
    };

    openModalWithProps();
    expect(within(getBookingRow("B-CANCELLED")).queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument();
    expect(within(getBookingRow("B-CANCELLED")).getByText("Delete")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText("Cancelled bookings are locked and cannot be edited.")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toBeDisabled();
    expect(screen.getByLabelText("Time")).toBeDisabled();
    expect(screen.getByLabelText("Service")).toBeDisabled();
    expect(screen.getByLabelText("Car Size")).toBeDisabled();
    expect(screen.getByLabelText("Assigned Detailer")).toBeDisabled();
    expect(screen.getByLabelText("Place Slot")).toBeDisabled();
    expect(screen.getByDisplayValue("Cancelled")).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reschedule Booking" })).not.toBeInTheDocument();
    expect(screen.getByText("Down payment must be verified as paid before this booking can be rescheduled.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  test("General Manager Cancelled booking without eligible payment is locked and cannot save, reschedule, or delete", () => {
    mockData = {
      currentUser: { id: "GM-1", name: "General Manager", email: "gm@example.com", userType: "Staff", role: "General Manager" },
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
    };

    openModalWithProps({ allowDelete: false });
    expect(within(getBookingRow("B-CANCELLED")).queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument();
    expect(within(getBookingRow("B-CANCELLED")).queryByText("Delete")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText("Cancelled bookings are locked and cannot be edited.")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toBeDisabled();
    expect(screen.getByLabelText("Time")).toBeDisabled();
    expect(screen.getByLabelText("Place Slot")).toBeDisabled();
    expect(screen.getByDisplayValue("Cancelled")).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reschedule Booking" })).not.toBeInTheDocument();
    expect(screen.getByText("Down payment must be verified as paid before this booking can be rescheduled.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Booking" }));
    expect(validateSpecialCredential).not.toHaveBeenCalled();
    expect(mockUpdateBooking).not.toHaveBeenCalled();
  });

  test("allowDelete=false suppresses the Admin-only Delete action even for Cancelled bookings", () => {
    mockData = {
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
    };

    openModalWithProps({ allowDelete: false });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText("Edit Booking")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  test("Admin Cancelled booking with verified downpayment exposes Reschedule separately from Delete while Edit stays locked", () => {
    mockData = {
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
      payments: [{ id: "PAY-CANCELLED", bookingId: "B-CANCELLED", downPaymentRequired: true, downPaymentStatus: "Paid" }],
    };

    openModalWithProps();
    const rowActions = within(getBookingRow("B-CANCELLED"));
    expect(rowActions.getByRole("button", { name: "Edit" })).toBeEnabled();
    expect(rowActions.getByRole("button", { name: "Reschedule" })).toBeEnabled();
    expect(rowActions.getByText("Delete")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Date")).toBeDisabled();
    expect(screen.getByLabelText("Time")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reschedule Booking" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  test("General Manager Cancelled booking with verified downpayment exposes Reschedule but never Delete", () => {
    mockData = {
      currentUser: { id: "GM-1", name: "General Manager", email: "gm@example.com", userType: "Staff", role: "General Manager" },
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
      payments: [{ id: "PAY-CANCELLED", bookingId: "B-CANCELLED", downPaymentRequired: true, downPaymentStatus: "Paid" }],
    };

    openModalWithProps({ allowDelete: false });
    const rowActions = within(getBookingRow("B-CANCELLED"));
    expect(rowActions.getByRole("button", { name: "Edit" })).toBeEnabled();
    expect(rowActions.getByRole("button", { name: "Reschedule" })).toBeEnabled();
    expect(rowActions.queryByText("Delete")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Date")).toBeDisabled();
    expect(screen.getByLabelText("Time")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reschedule Booking" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  test("Cancelled no-downpayment service exposes Reschedule without verified payment warning", () => {
    mockData = {
      bookings: [
        {
          id: "B-NO-DP-SERVICE",
          customer: "Customer One",
          customerEmail: "customer@example.com",
          vehicle: "Civic",
          plate: "ABC123",
          service: "Car Wash",
          carSize: "Sedan / Small Car",
          assigned: "Detailer One",
          date: "2099-12-31",
          time: "10:00",
          placeSlot: 1,
          status: "Cancelled",
        },
      ],
    };

    openModalWithProps();
    expect(within(getBookingRow("B-NO-DP-SERVICE")).getByRole("button", { name: "Reschedule" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("button", { name: "Reschedule Booking" })).toBeEnabled();
    expect(screen.queryByText("Down payment must be verified as paid before this booking can be rescheduled.")).not.toBeInTheDocument();
  });

  test("Reschedule modal only edits Date, Time, and Place Slot and submits through Staff PIN for GM", async () => {
    const generalManager = {
      id: "GM-1",
      name: "General Manager",
      email: "gm@example.com",
      userType: "Staff",
      role: "General Manager",
    };
    mockData = {
      currentUser: generalManager,
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
          date: "2099-12-30",
          time: "10:00",
          placeSlot: 1,
          status: "Cancelled",
        },
      ],
      payments: [{ id: "PAY-CANCELLED", bookingId: "B-CANCELLED", downPaymentRequired: true, downPaymentStatus: "Paid" }],
    };
    mockRescheduleBooking.mockResolvedValue({ id: "B-CANCELLED", status: "Scheduled" });

    openModalWithProps({ allowDelete: false });
    fireEvent.click(within(getBookingRow("B-CANCELLED")).getByRole("button", { name: "Reschedule" }));

    expect(screen.getByText("Reschedule Booking")).toBeInTheDocument();
    expect(screen.getByLabelText("Customer Name")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Vehicle")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Service")).toHaveAttribute("readonly");
    expect(screen.queryByLabelText("Assigned Detailer")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Booking" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2099-12-31" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "13:00" } });
    selectModalOption("Place Slot", "Place Slot 2");
    fireEvent.submit(screen.getByRole("button", { name: "Confirm Reschedule" }).closest("form"));

    fireEvent.change(await screen.findByLabelText("Special PIN"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm PIN" }));

    await waitFor(() => expect(validateSpecialCredential).toHaveBeenCalledWith(
      "pin",
      "654321",
      "staff",
      expect.objectContaining({ userType: "Staff", role: "General Manager" }),
      ACTION_KEYS.bookingUpdateStatus
    ));
    await waitFor(() => expect(mockRescheduleBooking).toHaveBeenCalledWith("B-CANCELLED", {
      date: "2099-12-31",
      time: "13:00",
      placeSlot: 2,
      specialPin: "654321",
    }));
    expect(mockUpdateBooking).not.toHaveBeenCalled();
  });

  test("Admin row Reschedule opens the dedicated workflow and uses the PATCH helper, not ordinary update", async () => {
    mockData = {
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
          date: "2099-12-30",
          time: "10:00",
          placeSlot: 1,
          status: "Cancelled",
        },
      ],
      payments: [{ id: "PAY-CANCELLED", bookingId: "B-CANCELLED", downPaymentRequired: true, downPaymentStatus: "Paid" }],
    };
    mockRescheduleBooking.mockResolvedValue({ id: "B-CANCELLED", status: "Scheduled" });

    openModalWithProps();
    const rowActions = within(getBookingRow("B-CANCELLED"));
    expect(rowActions.getByRole("button", { name: "Edit" })).toBeEnabled();
    fireEvent.click(rowActions.getByRole("button", { name: "Reschedule" }));

    expect(screen.getByText("Reschedule Booking")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Booking" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2099-12-31" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "13:00" } });
    selectModalOption("Place Slot", "Place Slot 2");
    fireEvent.submit(screen.getByRole("button", { name: "Confirm Reschedule" }).closest("form"));

    fireEvent.change(await screen.findByLabelText("Special PIN"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm PIN" }));

    await waitFor(() => expect(validateSpecialCredential).toHaveBeenCalledWith(
      "pin",
      "123456",
      "admin",
      expect.objectContaining({ userType: "Admin", role: "Admin" }),
      ACTION_KEYS.bookingUpdateStatus
    ));
    await waitFor(() => expect(mockRescheduleBooking).toHaveBeenCalledWith("B-CANCELLED", {
      date: "2099-12-31",
      time: "13:00",
      placeSlot: 2,
      specialPin: "123456",
    }));
    expect(mockUpdateBooking).not.toHaveBeenCalled();
  });

  test("General Manager reschedule through shared Admin Bookings validates with Staff PIN scope and booking action", async () => {
    const generalManager = {
      id: "GM-1",
      name: "General Manager",
      email: "gm@example.com",
      userType: "Staff",
      role: "General Manager",
    };
    mockData = {
      currentUser: generalManager,
      bookings: [
        {
          id: "B-RESCHEDULE",
          customer: "Customer One",
          customerEmail: "customer@example.com",
          vehicle: "Civic",
          plate: "ABC123",
          service: "Ceramic Coating",
          carSize: "Sedan / Small Car",
          assigned: "Detailer One",
          date: "2099-12-30",
          time: "10:00",
          placeSlot: 1,
          status: "Scheduled",
          amount: 1000,
        },
      ],
      payments: [
        {
          id: "PAY-RESCHEDULE",
          bookingId: "B-RESCHEDULE",
          downPaymentRequired: true,
          downPaymentAmount: 300,
          downPaymentStatus: "Paid",
          downPaymentMethod: "GCash",
          downPaymentReference: "DP-REF-1",
          downPaymentProofSubmittedAt: "2099-12-01T00:00:00.000Z",
          downPaymentVerifiedAt: "2099-12-01T00:10:00.000Z",
        },
      ],
    };
    mockUpdateBooking.mockResolvedValue({});

    openModalWithProps({ allowDelete: false });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2099-12-31" } });
    selectModalOption("Place Slot", "Place Slot 1");
    fireEvent.submit(screen.getByRole("button", { name: "Save Booking" }).closest("form"));

    fireEvent.change(await screen.findByLabelText("Special PIN"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm PIN" }));

    await waitFor(() => expect(validateSpecialCredential).toHaveBeenCalledTimes(1));
    expect(validateSpecialCredential).toHaveBeenCalledWith(
      "pin",
      "654321",
      "staff",
      expect.objectContaining({ userType: "Staff", role: "General Manager" }),
      ACTION_KEYS.bookingUpdateStatus
    );
    await waitFor(() => expect(mockUpdateBooking).toHaveBeenCalledTimes(1));
    expect(mockUpdateBooking.mock.calls[0][1]).toEqual(expect.objectContaining({ specialPin: "654321" }));
  });

  test("Scheduled booking without verified downpayment disables reschedule controls and does not open PIN confirmation", () => {
    mockData = {
      bookings: [
        {
          id: "B-NO-DP",
          customer: "Customer One",
          customerEmail: "customer@example.com",
          vehicle: "Civic",
          plate: "ABC123",
          service: "Ceramic Coating",
          carSize: "Sedan / Small Car",
          assigned: "Detailer One",
          date: "2099-12-30",
          time: "10:00",
          placeSlot: 1,
          status: "Scheduled",
          amount: 1000,
        },
      ],
      payments: [
        {
          id: "PAY-NO-DP",
          bookingId: "B-NO-DP",
          downPaymentRequired: true,
          downPaymentAmount: 300,
          downPaymentStatus: "For Verification",
          downPaymentMethod: "GCash",
          downPaymentReference: "DP-REF-1",
          downPaymentProofSubmittedAt: "2099-12-01T00:00:00.000Z",
        },
      ],
    };

    openModalWithProps();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText("Down payment must be verified as paid before this booking can be rescheduled.")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toBeDisabled();
    expect(screen.getByLabelText("Time")).toBeDisabled();
    expect(screen.getByLabelText("Place Slot")).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Save Booking" }).closest("form"));
    expect(screen.queryByText("Reschedule Booking")).not.toBeInTheDocument();
    expect(validateSpecialCredential).not.toHaveBeenCalled();
  });

  test("dashboard quick action opens the shared New Booking modal", () => {
    openQuickModal();
    expect(screen.getByText("New Booking")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
  });

  test("a fully valid Admin booking form enables Save Booking", async () => {
    openModal();
    await fillValidForm();
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeEnabled();
  });

  test.each([
    ["vehicle", "Vehicle", "Vehicle is required."],
    ["plate", "Plate Number", "Plate number is required."],
    ["date", "Date", "Booking date is required."],
  ])("empty %s keeps Save Booking disabled and shows inline error after blur", async (field, label, message) => {
    openModal();
    await fillValidForm({ skip: [field, "placeSlot"] });
    fireEvent.blur(screen.getByLabelText(label));
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  test("whitespace-only vehicle is treated as blank and blocks the quick-action save", async () => {
    openQuickModal();
    await fillValidForm({ skip: ["vehicle", "placeSlot"] });
    fireEvent.change(screen.getByLabelText("Vehicle"), { target: { value: "     " } });
    fireEvent.blur(screen.getByLabelText("Vehicle"));
    expect(screen.getByText("Vehicle is required.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Save Booking" }).closest("form"));
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  test.each([
    ["service", "Service", "Please select a service."],
    ["carSize", "Car Size", "Please select a car size."],
    ["assigned", "Assigned Detailer", "Please select an assigned detailer."],
  ])("missing %s keeps Save Booking disabled and shows inline error after blur", async (field, label, message) => {
    openModal();
    await fillValidForm({ skip: [field, "placeSlot"] });
    fireEvent.blur(screen.getByRole("button", { name: label }));
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  test("missing time and place slot are required before saving", async () => {
    openModal();
    await fillValidForm({ skip: ["time", "placeSlot"] });
    fireEvent.blur(screen.getByLabelText("Time"));
    expect(screen.getByText("Please select a time.")).toBeInTheDocument();
    fireEvent.submit(screen.getByRole("button", { name: "Save Booking" }).closest("form"));
    expect(screen.getByText("Please select a place slot.")).toBeInTheDocument();
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  test("car size dropdown contains exactly the four business options", () => {
    openModal();
    fireEvent.click(screen.getByRole("button", { name: "Car Size" }));
    const menu = screen.getByText("Sedan / Small Car").closest(".bookSuggestMenu");
    expect(within(menu).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Sedan / Small Car",
      "Midsize / Pickup / MPV",
      "SUV",
      "XL / Van / Semi Truck",
    ]);
  });

  test("reopening the modal does not retain stale touched error state", () => {
    openModal();
    fireEvent.blur(screen.getByLabelText("Vehicle"));
    expect(screen.getByText("Vehicle is required.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add New Booking" }));
    expect(screen.queryByText("Vehicle is required.")).not.toBeInTheDocument();
  });

  test("directly submitting invalid state does not call the booking API", () => {
    openModal();
    fireEvent.submit(screen.getByRole("button", { name: "Save Booking" }).closest("form"));
    expect(mockCreateBooking).not.toHaveBeenCalled();
    expect(screen.getByText("Vehicle is required.")).toBeInTheDocument();
  });
});

describe("Admin Add New Booking place-slot behavior", () => {
  test("date and time enable place-slot selection and occupied slots are disabled", async () => {
    mockData = {
      bookings: [{ id: "B-1", date: "2099-12-31", time: "10:00", placeSlot: 1, status: "Scheduled" }],
    };
    openModal();
    await fillValidForm({ skip: ["placeSlot"] });
    const slotButton = screen.getByRole("button", { name: "Place Slot" });
    expect(slotButton).toBeEnabled();
    fireEvent.click(slotButton);
    expect(screen.getByRole("button", { name: "Place Slot 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Place Slot 2" })).toBeEnabled();
  });

  test("changing date or time recalculates availability and clears the selected slot", async () => {
    openModal();
    await fillValidForm();
    expect(screen.getByRole("button", { name: "Place Slot" })).toHaveTextContent("Place Slot 2");
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "13:00" } });
    expect(screen.getByRole("button", { name: "Place Slot" })).toHaveTextContent("Select place slot");
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
  });

  test("a valid available place slot allows the form to become valid", async () => {
    mockData = {
      bookings: [{ id: "B-1", date: "2099-12-31", time: "10:00", placeSlot: 1, status: "Scheduled" }],
    };
    openModal();
    await fillValidForm({ skip: ["placeSlot"] });
    selectModalOption("Place Slot", "Place Slot 2");
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeEnabled();
  });

  test("no available slots produces a clear message", async () => {
    mockData = {
      bookings: Array.from({ length: 8 }, (_, index) => ({
        id: `B-${index + 1}`,
        date: "2099-12-31",
        time: "10:00",
        placeSlot: index + 1,
        status: "Scheduled",
      })),
    };
    openModal();
    await fillValidForm({ skip: ["placeSlot"] });
    expect(screen.getByText("No place slots are available for the selected schedule.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place Slot" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
  });
});
