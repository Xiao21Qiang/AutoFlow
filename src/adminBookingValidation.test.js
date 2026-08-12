import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminBookings from "./screens/admin/AdminBookings";

const mockCreateBooking = jest.fn();
const mockUpdateBooking = jest.fn();
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
    deleteBooking: mockDeleteBooking,
    ...mockData,
  }),
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

beforeEach(() => {
  mockData = {};
  mockCreateBooking.mockReset();
  mockUpdateBooking.mockReset();
  mockDeleteBooking.mockReset();
});

describe("Admin Add New Booking validation", () => {
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
