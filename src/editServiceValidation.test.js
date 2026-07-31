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

const services = [
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
    name: "Motor Coating",
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
    services,
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

function renderServices() {
  render(<AdminServices />);
}

function openEditService(index = 0) {
  renderServices();
  fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[index]);
}

function editForm() {
  return screen.getByRole("button", { name: "Save Service" }).closest("form");
}

function saveButton() {
  return screen.getByRole("button", { name: "Save Service" });
}

function consumableCard(name) {
  return screen.getByText(name).closest("label");
}

function removeConsumable(name = "Soap") {
  fireEvent.click(within(consumableCard(name)).getByRole("checkbox"));
}

function selectConsumable(name = "Wax") {
  const card = consumableCard(name);
  fireEvent.click(within(card).getByRole("checkbox"));
  within(card)
    .getAllByRole("spinbutton")
    .forEach((input) => fireEvent.change(input, { target: { value: "1" } }));
}

beforeEach(() => {
  mockData = {};
  mockCreateService.mockReset();
  mockUpdateService.mockReset();
  mockToggleService.mockReset();
  mockDeleteService.mockReset();
});

describe("Edit Service validation", () => {
  test("a valid edit with at least one consumable enables Save Service", () => {
    openEditService();
    expect(saveButton()).toBeEnabled();
  });

  test("valid edit calls the update API exactly once", async () => {
    mockUpdateService.mockResolvedValueOnce({});
    openEditService();
    fireEvent.change(screen.getByLabelText("Short Description"), { target: { value: "Updated exterior wash" } });
    fireEvent.submit(editForm());
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Security" }));
    await waitFor(() => expect(mockUpdateService).toHaveBeenCalledTimes(1));
    expect(mockUpdateService.mock.calls[0][0]).toBe("SVC-1");
    expect(mockUpdateService.mock.calls[0][1]).toMatchObject({
      id: "SVC-1",
      name: "Car Wash",
      desc: "Updated exterior wash",
      consumablesBySize: {
        Soap: { sedanSmallCar: 1, midsizePickupMpv: 1, suv: 1, xlVanSemiTruck: 1 },
      },
    });
  });

  test("keeping the current service name is allowed", () => {
    openEditService();
    fireEvent.blur(screen.getByLabelText("Service Name"));
    expect(screen.queryByText("A service with this name already exists.")).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  test.each([" CAR WASH ", "Car  Wash"])("current service self-name normalization %s does not falsely trigger a duplicate", (name) => {
    openEditService();
    fireEvent.change(screen.getByLabelText("Service Name"), { target: { value: name } });
    fireEvent.blur(screen.getByLabelText("Service Name"));
    expect(screen.queryByText("A service with this name already exists.")).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  test.each(["Motor Coating", "motor coating", " Motor  Coating "])("renaming to duplicate %s blocks Save and shows a message", (name) => {
    openEditService();
    fireEvent.change(screen.getByLabelText("Service Name"), { target: { value: name } });
    fireEvent.blur(screen.getByLabelText("Service Name"));
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("A service with this name already exists.")).toBeInTheDocument();
    fireEvent.submit(editForm());
    expect(mockUpdateService).not.toHaveBeenCalled();
  });

  test("duplicate failure keeps the modal open and preserves other valid edited fields", () => {
    openEditService();
    fireEvent.change(screen.getByLabelText("Short Description"), { target: { value: "Still here" } });
    fireEvent.change(screen.getByLabelText("Service Name"), { target: { value: "Motor Coating" } });
    fireEvent.submit(editForm());
    expect(screen.getAllByText("Edit Service").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Short Description")).toHaveValue("Still here");
    expect(mockUpdateService).not.toHaveBeenCalled();
  });

  test("removing all consumables disables Save and shows inline error after interaction", () => {
    openEditService();
    removeConsumable("Soap");
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("Please select at least one consumable.")).toBeInTheDocument();
  });

  test("selecting a valid consumable removes the missing-consumable error", () => {
    openEditService();
    removeConsumable("Soap");
    expect(screen.getByText("Please select at least one consumable.")).toBeInTheDocument();
    selectConsumable("Wax");
    expect(screen.queryByText("Please select at least one consumable.")).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  test("removing the final selected consumable makes the form invalid again", () => {
    openEditService();
    removeConsumable("Soap");
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("Please select at least one consumable.")).toBeInTheDocument();
  });

  test("directly submitting with no consumables does not call the update API", () => {
    openEditService();
    removeConsumable("Soap");
    fireEvent.submit(editForm());
    expect(mockUpdateService).not.toHaveBeenCalled();
    expect(screen.getAllByText("Please select at least one consumable.").length).toBeGreaterThan(0);
  });

  test("placeholder or malformed consumables do not satisfy validation", () => {
    mockData = { stockMonitoring: [{ id: "EMPTY", name: "", currentStock: 10 }] };
    openEditService();
    expect(screen.getByText("No stock monitoring items available yet.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  test("reopening the Edit modal clears stale errors", () => {
    openEditService();
    fireEvent.change(screen.getByLabelText("Service Name"), { target: { value: "Motor Coating" } });
    fireEvent.blur(screen.getByLabelText("Service Name"));
    expect(screen.getByText("A service with this name already exists.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.queryByText("A service with this name already exists.")).not.toBeInTheDocument();
  });

  test("opening a different service does not retain previous validation state", () => {
    openEditService();
    removeConsumable("Soap");
    expect(screen.getByText("Please select at least one consumable.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    expect(screen.queryByText("Please select at least one consumable.")).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  test("existing required-field validation still passes", () => {
    openEditService();
    const description = screen.getByLabelText("Short Description");
    fireEvent.change(description, { target: { value: "" } });
    expect(description).toBeRequired();
    expect(description.validity.valid).toBe(false);
  });

  test("existing time-of-arrival validation still prevents update", () => {
    openEditService();
    screen
      .getAllByRole("checkbox")
      .filter((checkbox) => checkbox.closest(".svcArrivalOption"))
      .forEach((checkbox) => {
        if (checkbox.checked) fireEvent.click(checkbox);
      });
    fireEvent.submit(editForm());
    expect(screen.getByText("Select at least one required time of arrival.")).toBeInTheDocument();
    expect(mockUpdateService).not.toHaveBeenCalled();
  });

  test("existing invalid-price validation remains in place", () => {
    openEditService();
    const priceInput = screen.getByLabelText("Sedan / Small Car Price (P)");
    fireEvent.change(priceInput, { target: { value: "-1" } });
    expect(priceInput).toHaveAttribute("min", "0");
    expect(priceInput.validity.valid).toBe(false);
  });

  test("existing invalid-duration validation remains in place", () => {
    openEditService();
    const durationInput = screen.getByLabelText("Est. Duration (Mins)");
    fireEvent.change(durationInput, { target: { value: "-1" } });
    expect(durationInput).toHaveAttribute("min", "0");
    expect(durationInput.validity.valid).toBe(false);
  });
});
