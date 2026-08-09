import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminServices from "./screens/admin/AdminServices";

const mockCreateService = jest.fn();
const mockUpdateService = jest.fn();
const mockToggleService = jest.fn();
const mockDeleteService = jest.fn();

const stockItems = [
  { id: "STK-1", name: "Soap", currentStock: 12 },
  { id: "STK-2", name: "Wax", currentStock: 8 },
];

const existingServices = [
  {
    id: "SVC-1",
    name: "Car Wash",
    desc: "Exterior wash",
    category: "Wash",
    serviceType: "Basic Service",
    enabled: true,
    price: 500,
    priceBySize: { sedanSmallCar: 500, midsizePickupMpv: 600, suv: 700, xlVanSemiTruck: 800 },
    mins: 60,
    allowedArrivalTimes: ["08:00", "09:00"],
    consumablesBySize: { Soap: { sedanSmallCar: 1, midsizePickupMpv: 1, suv: 1, xlVanSemiTruck: 1 } },
  },
  {
    id: "SVC-2",
    name: "Ceramic Coating",
    desc: "Gloss protection",
    category: "Coating",
    serviceType: "Package",
    enabled: true,
    price: 1500,
    priceBySize: { sedanSmallCar: 1500, midsizePickupMpv: 1700, suv: 1900, xlVanSemiTruck: 2100 },
    mins: 120,
    allowedArrivalTimes: ["08:00"],
    consumablesBySize: { Wax: { sedanSmallCar: 1, midsizePickupMpv: 1, suv: 1, xlVanSemiTruck: 1 } },
  },
];

let mockData = {};

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    services: existingServices,
    stockMonitoring: stockItems,
    currentUser: { id: "ADM-1", name: "Admin", email: "admin@example.com", userType: "Admin", role: "Admin" },
    createService: mockCreateService,
    updateService: mockUpdateService,
    toggleService: mockToggleService,
    deleteService: mockDeleteService,
    ...mockData,
  }),
}));

jest.mock("./components/common/SecurityConfirmModal", () => (props) => {
  if (!props.open) return null;
  return (
    <div role="dialog" aria-label={props.title || "Security confirmation"}>
      <button type="button" onClick={() => props.onConfirm?.({ secret: "test-secret" })}>
        Confirm Security
      </button>
    </div>
  );
});

function openAddService() {
  render(<AdminServices />);
  fireEvent.click(screen.getByRole("button", { name: "Add New Service" }));
}

function openQuickAddService() {
  render(<AdminServices initialAction="open-add-service" onActionHandled={jest.fn()} />);
}

function getAddForm() {
  return screen.getByRole("button", { name: "Add Service" }).closest("form");
}

function selectConsumable(name = "Soap") {
  const card = screen.getByText(name).closest("label");
  fireEvent.click(within(card).getByRole("checkbox"));
  within(card)
    .getAllByRole("spinbutton")
    .forEach((input) => fireEvent.change(input, { target: { value: "1" } }));
}

function removeConsumable(name = "Soap") {
  const card = screen.getByText(name).closest("label");
  fireEvent.click(within(card).getByRole("checkbox"));
}

function fillRequiredFields({ name = "Paint Correction", includeConsumable = true } = {}) {
  fireEvent.change(screen.getByLabelText("Service Name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Cleaning" } });
  fireEvent.change(screen.getByLabelText("Sedan / Small Car Price (P)"), { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText("Midsize / Pickup / MPV Price (P)"), { target: { value: "600" } });
  fireEvent.change(screen.getByLabelText("SUV Price (P)"), { target: { value: "700" } });
  fireEvent.change(screen.getByLabelText("XL / Van / Semi Truck Price (P)"), { target: { value: "800" } });
  fireEvent.change(screen.getByLabelText("Duration (Hrs)"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Active" } });
  if (includeConsumable) selectConsumable("Soap");
}

function addButton() {
  return screen.getByRole("button", { name: "Add Service" });
}

beforeEach(() => {
  mockData = {};
  mockCreateService.mockReset();
  mockUpdateService.mockReset();
  mockToggleService.mockReset();
  mockDeleteService.mockReset();
});

describe("Add New Service validation", () => {
  test("a unique, valid service with at least one consumable enables Add Service", () => {
    openAddService();
    fillRequiredFields();
    expect(addButton()).toBeEnabled();
  });

  test("valid submission calls the service creation API exactly once", async () => {
    mockCreateService.mockResolvedValueOnce({});
    openAddService();
    fillRequiredFields({ name: "Premium Wash" });
    fireEvent.submit(getAddForm());
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Security" }));
    await waitFor(() => expect(mockCreateService).toHaveBeenCalledTimes(1));
    expect(mockCreateService.mock.calls[0][0]).toMatchObject({
      name: "Premium Wash",
      category: "Cleaning",
      enabled: true,
      consumablesBySize: {
        Soap: { sedanSmallCar: 1, midsizePickupMpv: 1, suv: 1, xlVanSemiTruck: 1 },
      },
    });
  });

  test("dashboard quick action opens the shared Add Service modal", () => {
    openQuickAddService();
    expect(addButton()).toBeInTheDocument();
  });

  test.each(["", "   "])("blank service name %s shows inline validation and never opens confirmation", (name) => {
    openAddService();
    fillRequiredFields({ name });
    fireEvent.submit(getAddForm());
    expect(screen.getAllByText("Service name is required.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "Add Service" })).not.toBeInTheDocument();
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  test("blank required price shows inline validation and blocks confirmation", () => {
    openAddService();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("Sedan / Small Car Price (P)"), { target: { value: "" } });
    fireEvent.submit(getAddForm());
    expect(screen.getAllByText("Sedan / Small Car price is required.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "Add Service" })).not.toBeInTheDocument();
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  test("negative required price shows inline validation and blocks confirmation", () => {
    openAddService();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("SUV Price (P)"), { target: { value: "-5" } });
    fireEvent.submit(getAddForm());
    expect(screen.getAllByText("SUV price cannot be negative.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "Add Service" })).not.toBeInTheDocument();
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  test("blank required duration and status show inline validation and block confirmation", () => {
    openAddService();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("Duration (Hrs)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "" } });
    fireEvent.submit(getAddForm());
    expect(screen.getByText("Duration is required.")).toBeInTheDocument();
    expect(screen.getAllByText("Please select a service status.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "Add Service" })).not.toBeInTheDocument();
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  test.each(["Car Wash", "car wash", " Car  Wash "])("duplicate service name %s prevents submission and shows a clear message", (name) => {
    openAddService();
    fillRequiredFields({ name });
    fireEvent.blur(screen.getByLabelText("Service Name"));
    expect(screen.getByText("A service with this name already exists.")).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
    fireEvent.submit(getAddForm());
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  test("failed duplicate submission keeps the modal open and preserves other valid values", () => {
    openAddService();
    fillRequiredFields({ name: "Car Wash" });
    fireEvent.submit(getAddForm());
    expect(screen.getAllByText("Add Service").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Category")).toHaveValue("Cleaning");
    expect(screen.getByLabelText("SUV Price (P)")).toHaveValue(700);
    expect(screen.getAllByText("A service with this name already exists.").length).toBeGreaterThan(0);
  });

  test("zero selected consumables keeps Add Service disabled and displays an inline error after interaction", () => {
    openAddService();
    fillRequiredFields({ includeConsumable: false });
    expect(addButton()).toBeDisabled();
    fireEvent.submit(getAddForm());
    expect(screen.getAllByText("Please select at least one consumable.").length).toBeGreaterThan(0);
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  test("a selected valid consumable removes the missing-consumable error", () => {
    openAddService();
    fillRequiredFields({ includeConsumable: false });
    fireEvent.submit(getAddForm());
    expect(screen.getAllByText("Please select at least one consumable.").length).toBeGreaterThan(0);
    selectConsumable("Soap");
    expect(screen.queryByText("Please select at least one consumable.")).not.toBeInTheDocument();
    expect(addButton()).toBeEnabled();
  });

  test("removing the final selected consumable makes the form invalid again", () => {
    openAddService();
    fillRequiredFields();
    expect(addButton()).toBeEnabled();
    removeConsumable("Soap");
    expect(addButton()).toBeDisabled();
    expect(screen.getByText("Please select at least one consumable.")).toBeInTheDocument();
  });

  test("directly submitting with no consumables does not call the API", () => {
    openAddService();
    fillRequiredFields({ includeConsumable: false });
    fireEvent.submit(getAddForm());
    expect(mockCreateService).not.toHaveBeenCalled();
    expect(screen.getAllByText("Please select at least one consumable.").length).toBeGreaterThan(0);
  });

  test("placeholder or invalid consumable values do not satisfy the requirement", () => {
    mockData = { stockMonitoring: [{ id: "EMPTY", name: "", currentStock: 10 }] };
    openAddService();
    fillRequiredFields({ includeConsumable: false });
    expect(screen.getByText("No stock monitoring items available yet.")).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
  });

  test("reopening the modal clears stale touched and error state", () => {
    openAddService();
    fireEvent.submit(getAddForm());
    expect(screen.getAllByText("Please select at least one consumable.").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add New Service" }));
    expect(screen.queryByText("Please select at least one consumable.")).not.toBeInTheDocument();
    expect(screen.queryByText("A service with this name already exists.")).not.toBeInTheDocument();
  });

  test("existing required-time validation still prevents submission", () => {
    openAddService();
    fillRequiredFields();
    screen
      .getAllByRole("checkbox")
      .filter((checkbox) => checkbox.closest(".svcArrivalOption"))
      .forEach((checkbox) => {
        if (checkbox.checked) fireEvent.click(checkbox);
      });
    fireEvent.submit(getAddForm());
    expect(screen.getAllByText("Select at least one required time of arrival.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "Add Service" })).not.toBeInTheDocument();
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  test("duplicate confirmation clicks submit a valid service only once", async () => {
    let resolveCreate;
    mockCreateService.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    openAddService();
    fillRequiredFields({ name: "Single Submit Service" });
    fireEvent.submit(getAddForm());
    const confirm = await screen.findByRole("button", { name: "Confirm Security" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mockCreateService).toHaveBeenCalledTimes(1);
    resolveCreate({});
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add Service" })).not.toBeInTheDocument());
  });

  test("existing invalid-price validation remains in place", () => {
    openAddService();
    fillRequiredFields();
    const priceInput = screen.getByLabelText("Sedan / Small Car Price (P)");
    fireEvent.change(priceInput, { target: { value: "-1" } });
    expect(priceInput).toHaveAttribute("min", "0");
    expect(priceInput.validity.valid).toBe(false);
  });

  test("existing one-field and multiple-field required validation remains in place", () => {
    openAddService();
    selectConsumable("Soap");
    expect(screen.getByLabelText("Service Name")).toBeRequired();
    expect(screen.getByLabelText("Service Name").validity.valid).toBe(false);
    expect(screen.getByLabelText("Category")).toBeRequired();
    expect(screen.getByLabelText("Category").validity.valid).toBe(false);
    expect(screen.getByLabelText("Duration (Hrs)")).toBeRequired();
    expect(screen.getByLabelText("Duration (Hrs)").validity.valid).toBe(false);
  });
});
