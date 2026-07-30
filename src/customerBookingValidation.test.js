import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CustomerBookings from "./screens/customer/CustomerBookings";
import CustomerServices from "./screens/customer/CustomerServices";

const mockCreateBooking = jest.fn();

const currentCustomer = {
  id: "CUS-1",
  name: "Customer One",
  email: "customer@example.com",
  userType: "Customer",
  role: "New",
  cars: [],
};

const services = [
  {
    id: "SVC-1",
    name: "Car Wash",
    enabled: true,
    mins: 60,
    price: 500,
    allowedArrivalTimes: ["10:00", "13:00"],
  },
];

let mockData = {};

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    bookings: [],
    services,
    promos: [],
    rewards: [],
    customerRewards: [],
    payments: [],
    users: [],
    currentUser: currentCustomer,
    createBooking: mockCreateBooking,
    loading: false,
    ...mockData,
  }),
}));

function openModal() {
  render(<CustomerBookings />);
  fireEvent.click(screen.getByRole("button", { name: "Add New Booking" }));
}

function selectModalOption(label, option) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.click(screen.getByRole("button", { name: option }));
}

async function fillValidForm({ skip = [] } = {}) {
  const skipped = new Set(skip);
  if (!skipped.has("date")) fireEvent.change(screen.getByLabelText("Preferred Date"), { target: { value: "2099-12-31" } });
  if (!skipped.has("vehicle")) fireEvent.change(screen.getByLabelText("Vehicle Model"), { target: { value: "Civic" } });
  if (!skipped.has("plate")) fireEvent.change(screen.getByLabelText("Plate Number"), { target: { value: "ABC123" } });
  if (!skipped.has("carSize")) selectModalOption("Car Size", "Sedan / Small Car");
  if (!skipped.has("service")) selectModalOption("Service", "Car Wash");
  if (!skipped.has("time")) fireEvent.change(screen.getByLabelText("Preferred Time"), { target: { value: "10:00" } });
}

beforeEach(() => {
  mockData = {};
  mockCreateBooking.mockReset();
  mockCreateBooking.mockResolvedValue({});
});

describe("Customer Add New Booking validation", () => {
  test("a fully valid Customer booking form enables Save Booking", async () => {
    openModal();
    await fillValidForm();
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeEnabled();
  });

  test.each([
    ["vehicle", "Vehicle Model", "Vehicle is required."],
    ["plate", "Plate Number", "Plate number is required."],
    ["date", "Preferred Date", "Booking date is required."],
  ])("empty %s keeps Save Booking disabled and shows inline error after blur", async (field, label, message) => {
    openModal();
    await fillValidForm({ skip: [field] });
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
    fireEvent.blur(screen.getByLabelText(label));
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  test.each([
    ["service", "Service", "Please select a service."],
    ["carSize", "Car Size", "Please select a car size."],
  ])("missing %s keeps Save Booking disabled and shows inline error after blur", async (field, label, message) => {
    openModal();
    await fillValidForm({ skip: [field, "time"] });
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
    fireEvent.blur(screen.getByRole("button", { name: label }));
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  test("missing preferred time keeps Save Booking disabled and shows inline error after blur", async () => {
    openModal();
    await fillValidForm({ skip: ["time"] });
    expect(screen.getByRole("button", { name: "Save Booking" })).toBeDisabled();
    fireEvent.blur(screen.getByLabelText("Preferred Time"));
    expect(screen.getByText("Please select a preferred time.")).toBeInTheDocument();
  });

  test("Save Booking uses the actual disabled property and placeholder values are invalid", () => {
    openModal();
    const saveButton = screen.getByRole("button", { name: "Save Booking" });
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Service" })).toHaveTextContent("Select service");
    expect(screen.getByRole("button", { name: "Car Size" })).toHaveTextContent("Select car size");
    expect(screen.getByLabelText("Preferred Time")).toHaveValue("");
  });

  test("directly submitting invalid state does not call the booking API", () => {
    openModal();
    fireEvent.submit(screen.getByRole("button", { name: "Save Booking" }).closest("form"));
    expect(mockCreateBooking).not.toHaveBeenCalled();
    expect(screen.getAllByText("Vehicle is required.").length).toBeGreaterThan(0);
  });

  test("valid submission calls the booking API exactly once", async () => {
    openModal();
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Save Booking" }));
    await waitFor(() => expect(mockCreateBooking).toHaveBeenCalledTimes(1));
    expect(mockCreateBooking.mock.calls[0][0]).toMatchObject({
      customer: "Customer One",
      customerEmail: "customer@example.com",
      vehicle: "Civic",
      plate: "ABC123",
      carSize: "Sedan / Small Car",
      service: "Car Wash",
      date: "2099-12-31",
      time: "10:00",
      status: "Pending Confirmation",
      assigned: "",
      customerRequested: true,
      bookingSource: "customer",
    });
  });

  test("closing and reopening the modal clears stale touched error state", () => {
    openModal();
    fireEvent.blur(screen.getByLabelText("Vehicle Model"));
    expect(screen.getByText("Vehicle is required.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add New Booking" }));
    expect(screen.queryByText("Vehicle is required.")).not.toBeInTheDocument();
  });

  test("car size dropdown reuses the canonical four business options", () => {
    openModal();
    fireEvent.click(screen.getByRole("button", { name: "Car Size" }));
    const menu = screen.getByText("Sedan / Small Car").closest(".clBookModalSelectMenu");
    expect(within(menu).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Sedan / Small Car",
      "Midsize / Pickup / MPV",
      "SUV",
      "XL / Van / Semi Truck",
    ]);
  });
});

describe("Customer Services contextual booking", () => {
  test("opening from a service keeps that service context preselected", () => {
    render(<CustomerServices />);
    fireEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(screen.getByText("Book Service")).toBeInTheDocument();
    expect(screen.getAllByText("Car Wash").length).toBeGreaterThan(1);
    const timeField = screen.getByText("Time Slot").closest("label").querySelector("select");
    expect(timeField).toBeEnabled();
  });
});
