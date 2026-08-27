import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CustomerBookings from "./screens/customer/CustomerBookings";
import CustomerEngagement from "./screens/customer/CustomerEngagement";
import CustomerProfile from "./screens/customer/CustomerProfile";
import CustomerServices from "./screens/customer/CustomerServices";
import CustomerTracking from "./screens/customer/CustomerTracking";
import { apiRequest } from "./services/api";

const mockCreateBooking = jest.fn();
const mockCreateReview = jest.fn();
const mockClaimReward = jest.fn();
const mockUpdateProfile = jest.fn();

jest.mock("./services/api", () => ({
  apiRequest: jest.fn(),
}));

const currentCustomer = {
  id: "CUS-1",
  name: "Customer One",
  first: "Customer",
  last: "One",
  email: "customer@example.com",
  phone: "09123456789",
  userType: "Customer",
  role: "New",
  cars: [],
};

const services = [
  {
    id: "SVC-1",
    name: "Car Wash",
    enabled: true,
    desc: "Admin-entered wash description.",
    category: "Wash",
    serviceType: "Basic Service",
    mins: 60,
    price: 500,
    priceBySize: { sedanSmallCar: 500, midsizePickupMpv: 600, suv: 700, xlVanSemiTruck: 800 },
    allowedArrivalTimes: ["10:00", "13:00"],
  },
];
const customerBookings = [
  {
    id: "B-1",
    customer: "Customer One",
    customerEmail: "customer@example.com",
    vehicle: "Civic",
    plate: "ABC123",
    carSize: "Sedan / Small Car",
    service: "Car Wash",
    date: "2099-12-31",
    time: "10:00",
    status: "Pending",
    preferredDetailerId: "STF-1",
    preferredDetailerName: "Senior One",
    assignedDetailerId: "STF-2",
    assigned: "Junior One",
    placeSlot: 3,
    promoTitle: "Welcome Promo",
    rewardName: "Loyalty Reward",
    customerNotes: "Please handle with care.",
  },
  {
    id: "B-2",
    customer: "Customer One",
    customerEmail: "customer@example.com",
    vehicle: "City",
    plate: "XYZ789",
    carSize: "SUV",
    service: "Car Wash",
    date: "2099-12-30",
    time: "13:00",
    status: "Cancelled",
    cancelReason: "Shop emergency",
  },
];
const detailerUsers = [
  { id: "STF-1", name: "Senior One", userType: "Staff", role: "Senior Detailer", status: "active" },
  { id: "STF-2", name: "Junior One", userType: "Staff", role: "Junior Detailer", status: "active" },
  { id: "ADM-1", name: "Admin One", userType: "Admin", role: "Admin", status: "active" },
  { id: "GM-1", name: "Manager One", userType: "Staff", role: "General Manager", status: "active" },
  { id: "OLD-1", name: "Inactive Detailer", userType: "Staff", role: "Senior Detailer", status: "inactive" },
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
    createReview: mockCreateReview,
    claimReward: mockClaimReward,
    updateProfile: mockUpdateProfile,
    requestPasswordChangeOtp: jest.fn(),
    verifyPasswordChangeOtp: jest.fn(),
    resetPasswordWithOtp: jest.fn(),
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
  mockCreateReview.mockReset();
  mockCreateReview.mockResolvedValue({});
  mockClaimReward.mockReset();
  mockClaimReward.mockResolvedValue({});
  mockUpdateProfile.mockReset();
  mockUpdateProfile.mockImplementation(async (payload) => payload);
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (path) => {
    if (path === "/api/reference/vehicle-brands") return { brands: ["Toyota", "Honda"] };
    if (String(path).includes("/api/reference/vehicle-models")) return { models: ["Vios", "Corolla", "City"] };
    return {};
  });
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
    expect(mockCreateBooking.mock.calls[0][0]).toEqual({
      vehicle: "Civic",
      plate: "ABC123",
      carSize: "Sedan / Small Car",
      service: "Car Wash",
      date: "2099-12-31",
      time: "10:00",
      customerRequested: true,
      bookingSource: "customer",
      preferredDetailerId: "",
      promoId: "",
      rewardId: "",
    });
    expect(mockCreateBooking.mock.calls[0][0]).not.toHaveProperty("status");
    expect(mockCreateBooking.mock.calls[0][0]).not.toHaveProperty("assigned");
    expect(mockCreateBooking.mock.calls[0][0]).not.toHaveProperty("customerEmail");
    expect(mockCreateBooking.mock.calls[0][0]).not.toHaveProperty("amount");
  });

  test("pending submission blocks duplicate booking requests", async () => {
    let resolveRequest;
    mockCreateBooking.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    openModal();
    await fillValidForm();

    const saveButton = screen.getByRole("button", { name: "Save Booking" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
    resolveRequest({});
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  test("backend field errors are shown inline next to the mapped field", async () => {
    const error = new Error("Please choose an active Junior or Senior Detailer.");
    error.field = "preferredDetailerId";
    error.errors = { preferredDetailerId: "Please choose an active Junior or Senior Detailer." };
    mockCreateBooking.mockRejectedValue(error);
    mockData = { users: detailerUsers };
    openModal();
    await fillValidForm();
    fireEvent.change(screen.getByText("Select Preferred Detailer").closest("label").querySelector("select"), {
      target: { value: "STF-1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Booking" }));

    expect(await screen.findByText("Please choose an active Junior or Senior Detailer.")).toBeInTheDocument();
    expect(screen.queryByText("Failed to create booking.")).not.toBeInTheDocument();
  });

  test("preferred detailer dropdown includes only active Junior and Senior Detailers", () => {
    mockData = { users: detailerUsers };
    openModal();
    const select = screen.getByText("Select Preferred Detailer").closest("label").querySelector("select");
    const labels = Array.from(select.options).map((option) => option.textContent);

    expect(labels).toContain("Senior One — Senior Detailer");
    expect(labels).toContain("Junior One — Junior Detailer");
    expect(labels.join(" ")).not.toMatch(/Admin One|Manager One|Inactive Detailer/);
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

describe("Customer Bookings list, filters, pagination, and details", () => {
  test("searches visible customer booking fields including status and detailer labels", () => {
    mockData = { bookings: customerBookings };
    render(<CustomerBookings />);

    expect(screen.getByText("B-1")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Search Bookings..."), { target: { value: " junior one " } });

    expect(screen.getByText("B-1")).toBeInTheDocument();
    expect(screen.queryByText("B-2")).not.toBeInTheDocument();
  });

  test("filters by canonical booking status and resets to the first page", () => {
    mockData = { bookings: customerBookings };
    const { container } = render(<CustomerBookings />);

    fireEvent.click(container.querySelector(".clBookFilterBtn"));
    fireEvent.change(screen.getByLabelText("Booking Status"), { target: { value: "Cancelled" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText("B-2")).toBeInTheDocument();
    expect(screen.queryByText("B-1")).not.toBeInTheDocument();
  });

  test("pagination exposes page numbers and disables boundary navigation", () => {
    mockData = {
      bookings: Array.from({ length: 6 }, (_, index) => ({
        ...customerBookings[0],
        id: `B-${index + 1}`,
        plate: `ABC12${index}`,
      })),
    };
    render(<CustomerBookings />);

    expect(screen.getByRole("button", { name: "<" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByRole("button", { name: ">" })).toBeDisabled();
    expect(screen.getByText("B-6")).toBeInTheDocument();
  });

  test("details view presents customer-safe booking, scheduling, promo, reward, and payment state", () => {
    mockData = {
      bookings: customerBookings,
      payments: [{
        id: "PAY-1",
        bookingId: "B-1",
        downPaymentRequired: true,
        downPaymentDueAt: "2099-12-31T02:00:00.000Z",
        downPaymentStatus: "Paid",
        finalPaymentStatus: "Pending",
      }],
    };
    render(<CustomerBookings />);

    fireEvent.click(screen.getAllByRole("button", { name: "View" })[0]);
    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveTextContent("Booking ID: B-1");
    expect(dialog).toHaveTextContent("Booking Status: Pending");
    expect(dialog).toHaveTextContent("Preferred Detailer: Senior One");
    expect(dialog).toHaveTextContent("Assigned Detailer: Junior One");
    expect(dialog).toHaveTextContent("Place Slot: 3");
    expect(dialog).toHaveTextContent("Promo: Welcome Promo");
    expect(dialog).toHaveTextContent("Reward: Loyalty Reward");
    expect(dialog).toHaveTextContent("Payment: Down payment Paid; final payment Pending");
  });
});

describe("Customer Services contextual booking", () => {
  test("View Details opens a read-only service details modal with admin service data", () => {
    mockData = {
      services: [{
        ...services[0],
        name: "Ceramic Protection",
        desc: "Admin ceramic protection description.",
        category: "Protection",
        serviceType: "Package",
        mins: 180,
        priceBySize: { sedanSmallCar: 7000, midsizePickupMpv: 8000, suv: 9000, xlVanSemiTruck: 10000 },
      }],
    };

    render(<CustomerServices />);
    fireEvent.click(screen.getByRole("button", { name: "View Details" }));
    const dialog = screen.getByRole("dialog", { name: "Service Details" });

    expect(dialog).toHaveTextContent("Ceramic Protection");
    expect(dialog).toHaveTextContent("Package");
    expect(dialog).toHaveTextContent("Protection");
    expect(dialog).toHaveTextContent("Admin ceramic protection description.");
    expect(dialog).toHaveTextContent("P 7,000 - P 10,000");
    expect(dialog).toHaveTextContent("180 mins");
    expect(dialog).toHaveTextContent("10:00 / 10:00 AM");
    expect(dialog).toHaveTextContent("13:00 / 1:00 PM");
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Book" })).not.toBeInTheDocument();
  });

  test("missing service descriptions use the customer empty state without fabricated fallback copy", () => {
    mockData = { services: [{ ...services[0], desc: "   " }] };

    render(<CustomerServices />);

    expect(screen.getByText("No description available.")).toBeInTheDocument();
    expect(screen.queryByText("Premium auto care service from All Pro-Tec.")).not.toBeInTheDocument();
  });

  test("inactive services are unavailable to Customer service browsing and booking", () => {
    mockData = { services: [{ ...services[0], enabled: false }] };

    render(<CustomerServices />);

    expect(screen.queryByText("Car Wash")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Book" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View Details" })).not.toBeInTheDocument();
  });

  test("opening from a service keeps that service context preselected", () => {
    render(<CustomerServices />);
    fireEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(screen.getByText("Book Service")).toBeInTheDocument();
    expect(screen.getAllByText("Car Wash").length).toBeGreaterThan(1);
    const timeField = screen.getByText("Time Slot").closest("label").querySelector("select");
    expect(timeField).toBeEnabled();
  });
});

describe("Customer Engagement validation and reward visibility", () => {
  test("no eligible review bookings shows a disabled customer-facing review flow", () => {
    render(<CustomerEngagement initialAction="open-add-review" />);

    expect(screen.getByRole("button", { name: "Add Review" })).toBeDisabled();
    expect(screen.getByText("No completed and fully paid bookings are ready for review.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Review" })).toBeDisabled();
  });

  test("review submission uses inline field errors instead of alerts", async () => {
    mockData = {
      bookings: [{ ...customerBookings[0], id: "B-READY", status: "Completed", service: "Car Wash" }],
      payments: [{ id: "PAY-READY", bookingId: "B-READY", invoice: { outstandingBalance: 0, finalAmountDue: 500 } }],
    };
    render(<CustomerEngagement />);

    fireEvent.click(screen.getByRole("button", { name: "Add Review" }));
    fireEvent.change(screen.getByText("Booking").closest("label").querySelector("select"), { target: { value: "B-READY" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit Review" }));

    expect(screen.getByText("Review comment must be at least 3 characters.")).toBeInTheDocument();
    expect(mockCreateReview).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("Share your experience..."), { target: { value: "Great finish." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit Review" }));

    await waitFor(() => expect(mockCreateReview).toHaveBeenCalledWith({
      bookingId: "B-READY",
      rating: 5,
      comment: "Great finish.",
    }));
  });

  test("inactive reward definitions are visible as unavailable but not claimable", () => {
    mockData = {
      rewards: [{ id: "RWD-INACTIVE", active: false, enabled: false }],
      customerRewards: [{
        id: "CR-1",
        rewardId: "RWD-INACTIVE",
        customerEmail: currentCustomer.email,
        rewardName: "Inactive Reward",
        rewardValue: "P100 off",
        status: "Available",
      }],
    };
    render(<CustomerEngagement />);

    expect(screen.getByText("Inactive Reward")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Claim" })).not.toBeInTheDocument();
  });
});

describe("Customer Profile saved cars and validation", () => {
  test("profile save validates inline and persists saved cars through updateProfile", async () => {
    render(<CustomerProfile />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Account" }));
    fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Juan123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(screen.getByText("First name can only contain letters, spaces, hyphens, apostrophes, and periods.")).toBeInTheDocument();
    expect(mockUpdateProfile).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Customer" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Car" }));
    fireEvent.change(screen.getByLabelText("Car 1 Brand"), { target: { value: "Toyota" } });
    fireEvent.change(screen.getByLabelText("Car 1 Model"), { target: { value: "Vios" } });
    fireEvent.change(screen.getByLabelText("Car 1 Size"), { target: { value: "Sedan / Small Car" } });
    fireEvent.change(screen.getByLabelText("Car 1 Plate Number"), { target: { value: "abc 123" } });

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
    expect(mockUpdateProfile.mock.calls[0][0]).toEqual({
      first: "Customer",
      last: "One",
      email: "customer@example.com",
      phone: "09123456789",
      cars: [{ brand: "Toyota", vehicle: "Toyota Vios", size: "Sedan / Small Car", plate: "ABC123" }],
    });
  });

  test("persisted saved cars appear in booking autofill after refresh", () => {
    mockData = {
      currentUser: {
        ...currentCustomer,
        cars: [{ brand: "Toyota", vehicle: "Toyota Vios", size: "Sedan / Small Car", plate: "ABC123" }],
      },
    };
    render(<CustomerBookings />);

    fireEvent.click(screen.getByRole("button", { name: "Add New Booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Saved Car" }));
    fireEvent.click(screen.getByRole("button", { name: "Toyota Vios | ABC123" }));

    expect(screen.getByLabelText("Vehicle Model")).toHaveValue("Toyota Vios");
    expect(screen.getByLabelText("Plate Number")).toHaveValue("ABC123");
    expect(screen.getByRole("button", { name: "Car Size" })).toHaveTextContent("Sedan / Small Car");
  });
});

describe("Customer Tracking list, details, and pagination", () => {
  const trackingBookings = Array.from({ length: 6 }, (_, index) => ({
    id: `B-T${index + 1}`,
    customer: "Customer One",
    customerEmail: "customer@example.com",
    vehicle: index === 5 ? "City" : "Civic",
    plate: `ABC12${index}`,
    carSize: "Sedan / Small Car",
    service: "Car Wash",
    date: "2099-12-31",
    time: "10:00",
    status: index === 5 ? "Completed" : "In Progress",
    assigned: "Junior One",
    issueNote: "Paint chip documented at intake.",
    issueTypes: ["Paint Crack / Chip"],
    issueMarkers: [{ id: 1, x: 42, y: 58, issueType: "Paint Crack / Chip" }],
    warrantyReleased: index === 5,
    trackingAccessToken: `track-${index + 1}`,
    warrantyAccessToken: `warranty-${index + 1}`,
  }));

  test("pagination disables first and final boundaries and resets cleanly for zero-result search", () => {
    mockData = { bookings: trackingBookings };
    render(<CustomerTracking />);

    expect(screen.getByRole("button", { name: "<" })).toBeDisabled();
    expect(screen.getByRole("button", { name: ">" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: ">" }));

    expect(screen.getByText("B-T6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "<" })).toBeEnabled();
    expect(screen.getByRole("button", { name: ">" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Search Bookings..."), { target: { value: "missing booking" } });

    expect(screen.getByText("No records found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "<" })).toBeDisabled();
    expect(screen.getByRole("button", { name: ">" })).toBeDisabled();
  });

  test("View details keeps tracking issue and warranty information read-only", () => {
    mockData = { bookings: trackingBookings };
    render(<CustomerTracking />);
    fireEvent.click(screen.getByRole("button", { name: ">" }));
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveTextContent("Tracking Details");
    expect(dialog).toHaveTextContent("B-T6");
    expect(dialog).toHaveTextContent("Ready for release");
    expect(dialog).toHaveTextContent("Problem Location");
    expect(dialog).toHaveTextContent("Paint Crack / Chip");
    expect(within(dialog).getByDisplayValue("Paint chip documented at intake.")).toHaveAttribute("readonly");
    expect(dialog).toHaveTextContent("Warranty Checklist");
    expect(within(dialog).getByRole("link", { name: "Open warranty document" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /save|assign|release|edit/i })).not.toBeInTheDocument();
  });
});
