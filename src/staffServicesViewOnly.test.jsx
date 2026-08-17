import { fireEvent, render, screen, within } from "@testing-library/react";
import AdminServices from "./screens/admin/AdminServices";
import StaffServices from "./screens/staff/StaffServices";

const mockCreateService = jest.fn();
const mockUpdateService = jest.fn();
const mockToggleService = jest.fn();
const mockDeleteService = jest.fn();

const services = [
  {
    id: "SVC-BASIC",
    name: "Essential Wash",
    desc: "Exterior wash and dry",
    category: "Wash",
    serviceType: "Basic Service",
    enabled: true,
    price: 500,
    priceBySize: { sedanSmallCar: 500, midsizePickupMpv: 650, suv: 800, xlVanSemiTruck: 950 },
    mins: 60,
    allowedArrivalTimes: ["08:00", "09:00"],
    consumablesBySize: {
      Soap: { sedanSmallCar: 1, midsizePickupMpv: 2, suv: 3, xlVanSemiTruck: 4 },
    },
  },
  {
    id: "SVC-PACKAGE",
    name: "Premium Protection Package",
    desc: "Wash, coating, and interior protection",
    category: "Protection",
    serviceType: "Package",
    enabled: false,
    price: 2500,
    priceBySize: { sedanSmallCar: 2500, midsizePickupMpv: 2800, suv: 3100, xlVanSemiTruck: 3500 },
    mins: 180,
    allowedArrivalTimes: ["08:00"],
    consumablesBySize: {
      Wax: { sedanSmallCar: 1, midsizePickupMpv: 1, suv: 2, xlVanSemiTruck: 2 },
      "Interior Cleaner": { sedanSmallCar: 2, midsizePickupMpv: 2, suv: 3, xlVanSemiTruck: 3 },
    },
    includedServices: ["Essential Wash", "Interior Detail"],
  },
];

const salesAssociate = { id: "SA-1", name: "Sales Associate", email: "sales@example.com", userType: "Staff", role: "Sales Associate" };
const generalManager = { id: "GM-1", name: "General Manager", email: "gm@example.com", userType: "Staff", role: "General Manager" };
const salesManager = { id: "SM-1", name: "Sales Manager", email: "sales-manager@example.com", userType: "Staff", role: "Sales Manager" };
const inventoryClerk = { id: "INV-1", name: "Inventory Clerk", email: "inventory@example.com", userType: "Staff", role: "Inventory Clerk" };
const juniorDetailer = { id: "JD-1", name: "Junior Detailer", email: "junior@example.com", userType: "Staff", role: "Junior Detailer" };
const seniorDetailer = { id: "SD-1", name: "Senior Detailer", email: "senior@example.com", userType: "Staff", role: "Senior Detailer" };
const marketing = { id: "MKT-1", name: "Marketing", email: "marketing@example.com", userType: "Staff", role: "Marketing" };

let mockData = {};

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    services,
    stockMonitoring: [],
    currentUser: { id: "GM-1", name: "General Manager", email: "gm@example.com", userType: "Staff", role: "General Manager" },
    createService: mockCreateService,
    updateService: mockUpdateService,
    toggleService: mockToggleService,
    deleteService: mockDeleteService,
    ...mockData,
  }),
}));

jest.mock("./components/common/SecurityConfirmModal", () => (props) => {
  if (!props.open) return null;
  return <div role="dialog" aria-label={props.title || "Security confirmation"} />;
});

beforeEach(() => {
  mockData = {};
  mockCreateService.mockReset();
  mockUpdateService.mockReset();
  mockToggleService.mockReset();
  mockDeleteService.mockReset();
});

function renderStaff(user = generalManager) {
  mockData = { currentUser: user };
  render(<StaffServices />);
}

function staffMutationControls() {
  return ["Add New Service", "Edit", "Save Service", "Delete Service", "Enable", "Disable"];
}

function expectReadOnlyDialog(dialog) {
  expect(within(dialog).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Save Service" })).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Delete Service" })).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
}

test("Staff View Only opens selected Basic Service details without mutation controls", () => {
  renderStaff(salesAssociate);

  expect(screen.getByText("Essential Wash")).toBeInTheDocument();
  staffMutationControls().forEach((name) => {
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  });

  fireEvent.click(screen.getAllByRole("button", { name: "View Only" })[0]);

  const dialog = screen.getByRole("dialog", { name: "Service Details" });
  expect(within(dialog).getByText("Essential Wash")).toBeInTheDocument();
  expect(within(dialog).getByText("Basic Service")).toBeInTheDocument();
  expect(within(dialog).getByText("Wash")).toBeInTheDocument();
  expect(within(dialog).getByText("Enabled")).toBeInTheDocument();
  expect(within(dialog).getByText("Exterior wash and dry")).toBeInTheDocument();
  expect(within(dialog).getByText("P 500 - P 950")).toBeInTheDocument();
  expect(within(dialog).getByText("60 mins")).toBeInTheDocument();
  expect(within(dialog).getByText("08:00 / 8:00 AM, 09:00 / 9:00 AM")).toBeInTheDocument();
  expect(within(dialog).getByText(/Soap/)).toBeInTheDocument();
  expect(within(dialog).getByText(/S 1, M 2, SUV 3, XL 4/)).toBeInTheDocument();
  expectReadOnlyDialog(dialog);

  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog", { name: "Service Details" })).not.toBeInTheDocument();
  expect(mockCreateService).not.toHaveBeenCalled();
  expect(mockUpdateService).not.toHaveBeenCalled();
  expect(mockToggleService).not.toHaveBeenCalled();
  expect(mockDeleteService).not.toHaveBeenCalled();
});

test("Staff View Only opens selected Package details including package contents", () => {
  renderStaff(salesAssociate);

  fireEvent.click(screen.getAllByRole("button", { name: "View Only" })[1]);

  const dialog = screen.getByRole("dialog", { name: "Package Details" });
  expect(within(dialog).getByText("Premium Protection Package")).toBeInTheDocument();
  expect(within(dialog).getByText("Package")).toBeInTheDocument();
  expect(within(dialog).getByText("Protection")).toBeInTheDocument();
  expect(within(dialog).getByText("Disabled")).toBeInTheDocument();
  expect(within(dialog).getByText("Wash, coating, and interior protection")).toBeInTheDocument();
  expect(within(dialog).getByText("P 2,500 - P 3,500")).toBeInTheDocument();
  expect(within(dialog).getByText("180 mins")).toBeInTheDocument();
  expect(within(dialog).getByText("08:00 / 8:00 AM")).toBeInTheDocument();
  expect(within(dialog).getByText(/Wax/)).toBeInTheDocument();
  expect(within(dialog).getByText(/Interior Cleaner/)).toBeInTheDocument();
  expect(within(dialog).getByText("Package Contents")).toBeInTheDocument();
  expect(within(dialog).getByText("Essential Wash")).toBeInTheDocument();
  expect(within(dialog).getByText("Interior Detail")).toBeInTheDocument();
  expectReadOnlyDialog(dialog);
});

test("View Only uses stable service identity and does not retain stale modal details", () => {
  renderStaff();

  fireEvent.click(screen.getAllByRole("button", { name: "View Only" })[1]);
  let dialog = screen.getByRole("dialog", { name: "Package Details" });
  expect(within(dialog).getByText("Premium Protection Package")).toBeInTheDocument();
  expect(within(dialog).queryByText("Essential Wash")).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getAllByRole("button", { name: "View Only" })[0]);

  dialog = screen.getByRole("dialog", { name: "Service Details" });
  expect(within(dialog).getByText("Essential Wash")).toBeInTheDocument();
  expect(within(dialog).queryByText("Premium Protection Package")).not.toBeInTheDocument();
});

test.each([
  generalManager,
  salesAssociate,
  salesManager,
  inventoryClerk,
  juniorDetailer,
  seniorDetailer,
  marketing,
])("Staff Services is view-only for %s", (user) => {
  renderStaff(user);

  expect(screen.getAllByRole("button", { name: "View Only" })).toHaveLength(2);
  staffMutationControls().forEach((name) => {
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  });
});

test("Sales Associate uses shared Staff Services search and filters without mutation controls", () => {
  renderStaff(salesAssociate);

  fireEvent.change(screen.getByPlaceholderText("Search Services..."), { target: { value: "premium" } });

  expect(screen.queryByText("Essential Wash")).not.toBeInTheDocument();
  expect(screen.getByText("Premium Protection Package")).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText("Search Services..."), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "" }));
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Wash" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));

  expect(screen.getByText("Essential Wash")).toBeInTheDocument();
  expect(screen.queryByText("Premium Protection Package")).not.toBeInTheDocument();
  staffMutationControls().forEach((name) => {
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  });
});

test("Admin Services still exposes canonical management controls", () => {
  mockData = {
    currentUser: { id: "ADM-1", name: "Admin", email: "admin@example.com", userType: "Admin", role: "Admin" },
  };
  render(<AdminServices />);

  expect(screen.getByRole("button", { name: "Add New Service" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Edit" }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: /Enable|Disable/ }).length).toBeGreaterThan(0);
});
