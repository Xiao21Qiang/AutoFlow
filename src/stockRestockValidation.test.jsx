import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminStockMonitoring from "./screens/admin/AdminStockMonitoring";
import StaffStockMonitoring from "./screens/staff/StaffStockMonitoring";
import { useAdminData } from "./context/AdminDataContext";

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: jest.fn(),
}));

const RESTOCK_QUANTITY_ERROR = "Restock quantity must be greater than zero.";
const RESTOCK_UNIT_COST_ERROR = "Unit Cost must be greater than zero.";

const stockItem = {
  id: "INV-1",
  name: "Ceramic Coating",
  category: "Coating",
  currentStock: 5,
  maxStock: 100,
  reorderLevel: 10,
  pricePerUnit: 25,
  lastRestocked: "2026-08-01",
  restockHistory: [],
  soldHistory: [],
};

function renderStockScreen(Component, overrides = {}) {
  const restockStockMonitoringItem = jest.fn(async () => ({ ...stockItem, currentStock: 8 }));
  useAdminData.mockReturnValue({
    stockMonitoring: [stockItem],
    currentUser: { email: "admin@example.com", userType: "Admin", role: "Admin" },
    createStockMonitoringItem: jest.fn(),
    updateStockMonitoringItem: jest.fn(),
    restockStockMonitoringItem,
    deleteStockMonitoringItem: jest.fn(),
    ...overrides,
  });

  render(<Component />);
  fireEvent.click(screen.getByRole("button", { name: "Restock" }));
  return { restockStockMonitoringItem };
}

function renderAdminAddStock(overrides = {}) {
  const createStockMonitoringItem = jest.fn(async (payload) => ({ id: "INV-2", ...payload }));
  useAdminData.mockReturnValue({
    stockMonitoring: [stockItem],
    currentUser: { email: "admin@example.com", userType: "Admin", role: "Admin" },
    createStockMonitoringItem,
    updateStockMonitoringItem: jest.fn(),
    restockStockMonitoringItem: jest.fn(),
    deleteStockMonitoringItem: jest.fn(),
    ...overrides,
  });

  render(<AdminStockMonitoring initialAction="open-add-stock-item" onActionHandled={jest.fn()} />);
  return { createStockMonitoringItem };
}

function renderStaffAddStock(overrides = {}) {
  const createStockMonitoringItem = jest.fn(async (payload) => ({ id: "INV-2", ...payload }));
  useAdminData.mockReturnValue({
    stockMonitoring: [stockItem],
    currentUser: { email: "inventory@example.com", userType: "Staff", role: "Inventory Clerk" },
    createStockMonitoringItem,
    updateStockMonitoringItem: jest.fn(),
    restockStockMonitoringItem: jest.fn(),
    deleteStockMonitoringItem: jest.fn(),
    ...overrides,
  });

  render(<StaffStockMonitoring />);
  fireEvent.click(screen.getByRole("button", { name: "Add New Item" }));
  return { createStockMonitoringItem };
}

function addStockControls() {
  return {
    name: screen.getByLabelText(/^Item Name/i),
    category: screen.getByLabelText(/^Category/i),
    currentStock: screen.getByLabelText(/^Current Stock \(Qty\)/i),
    maxStock: screen.getByLabelText(/^Max Stock \(Qty\)/i),
    reorderLevel: screen.getByLabelText(/^Reorder Level/i),
    pricePerUnit: screen.getByLabelText(/^Price Per Unit \(P\)/i),
    add: screen.getByRole("button", { name: /Add Item|Adding|Save Item|Saving/i }),
  };
}

function fillValidAddStock({ name = "Microfiber Towels", currentStock = "10", maxStock = "100", reorderLevel = "20", pricePerUnit = "30" } = {}) {
  const controls = addStockControls();
  fireEvent.change(controls.name, { target: { value: name } });
  fireEvent.change(controls.currentStock, { target: { value: currentStock } });
  fireEvent.change(controls.maxStock, { target: { value: maxStock } });
  fireEvent.change(controls.reorderLevel, { target: { value: reorderLevel } });
  fireEvent.change(controls.pricePerUnit, { target: { value: pricePerUnit } });
  return controls;
}

function getRestockFormControls() {
  return {
    quantity: screen.getByLabelText(/Quantity to Add/i),
    unitCost: screen.getByLabelText(/Unit Cost/i),
    save: screen.getByRole("button", { name: "Save Restock" }),
  };
}

describe.each([
  ["Admin", AdminStockMonitoring],
  ["Staff", StaffStockMonitoring],
])("%s Restock Item unit cost validation", (_role, Component) => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("shows the unit cost error and keeps Save Restock disabled when Unit Cost is blank", () => {
    const { restockStockMonitoringItem } = renderStockScreen(Component);
    const { quantity, unitCost, save } = getRestockFormControls();

    fireEvent.change(quantity, { target: { value: "2" } });
    fireEvent.change(unitCost, { target: { value: "" } });
    fireEvent.blur(unitCost);

    expect(screen.getByText(RESTOCK_UNIT_COST_ERROR)).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest("form"));
    expect(restockStockMonitoringItem).not.toHaveBeenCalled();
    expect(save).toBeInTheDocument();
  });

  test.each(["0", "0.00", "-1"])("rejects Unit Cost value %s without calling the API", (value) => {
    const { restockStockMonitoringItem } = renderStockScreen(Component);
    const { quantity, unitCost, save } = getRestockFormControls();

    fireEvent.change(quantity, { target: { value: "2" } });
    fireEvent.change(unitCost, { target: { value } });
    fireEvent.blur(unitCost);

    expect(screen.getByText(RESTOCK_UNIT_COST_ERROR)).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest("form"));
    expect(restockStockMonitoringItem).not.toHaveBeenCalled();
  });

  test("rejects non-numeric Unit Cost states without calling the API", () => {
    const { restockStockMonitoringItem } = renderStockScreen(Component);
    const { quantity, unitCost, save } = getRestockFormControls();

    fireEvent.change(quantity, { target: { value: "2" } });
    fireEvent.change(unitCost, { target: { value: "not-a-number" } });
    fireEvent.blur(unitCost);

    expect(screen.getByText(RESTOCK_UNIT_COST_ERROR)).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest("form"));
    expect(restockStockMonitoringItem).not.toHaveBeenCalled();
  });

  test("clears the unit cost error when a valid positive value is entered", () => {
    renderStockScreen(Component);
    const { quantity, unitCost, save } = getRestockFormControls();

    fireEvent.change(quantity, { target: { value: "2" } });
    fireEvent.change(unitCost, { target: { value: "0" } });
    fireEvent.blur(unitCost);
    expect(screen.getByText(RESTOCK_UNIT_COST_ERROR)).toBeInTheDocument();

    fireEvent.change(unitCost, { target: { value: "12.50" } });

    expect(screen.queryByText(RESTOCK_UNIT_COST_ERROR)).not.toBeInTheDocument();
    expect(save).not.toBeDisabled();
  });

  test("shows both quantity and unit cost messages when both fields are invalid", () => {
    const { restockStockMonitoringItem } = renderStockScreen(Component);
    const { quantity, unitCost, save } = getRestockFormControls();

    fireEvent.change(quantity, { target: { value: "0" } });
    fireEvent.change(unitCost, { target: { value: "0" } });
    fireEvent.blur(quantity);
    fireEvent.blur(unitCost);

    expect(screen.getByText(RESTOCK_QUANTITY_ERROR)).toBeInTheDocument();
    expect(screen.getByText(RESTOCK_UNIT_COST_ERROR)).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest("form"));
    expect(restockStockMonitoringItem).not.toHaveBeenCalled();
  });

  test("submits exactly one valid restock request with numeric values", async () => {
    const { restockStockMonitoringItem } = renderStockScreen(Component);
    const { quantity, unitCost, save } = getRestockFormControls();

    fireEvent.change(quantity, { target: { value: "3" } });
    fireEvent.change(unitCost, { target: { value: "12.5" } });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);

    await waitFor(() => expect(restockStockMonitoringItem).toHaveBeenCalledTimes(1));
    expect(restockStockMonitoringItem).toHaveBeenCalledWith(
      stockItem.id,
      expect.objectContaining({ qtyToAdd: 3, costPerUnit: 12.5 })
    );
  });

  test("clears stale unit cost errors after closing and reopening the modal", () => {
    renderStockScreen(Component);
    const { quantity, unitCost } = getRestockFormControls();

    fireEvent.change(quantity, { target: { value: "2" } });
    fireEvent.change(unitCost, { target: { value: "" } });
    fireEvent.blur(unitCost);
    expect(screen.getByText(RESTOCK_UNIT_COST_ERROR)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Restock" }));

    expect(screen.queryByText(RESTOCK_UNIT_COST_ERROR)).not.toBeInTheDocument();
  });
});

describe("Admin Add Stock Item quick action validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("dashboard quick action opens the shared Add Item modal", () => {
    renderAdminAddStock();
    expect(screen.getByRole("button", { name: "Add Item" })).toBeInTheDocument();
  });

  test.each(["", "   "])("blank item name %s shows inline validation and blocks creation", (name) => {
    const { createStockMonitoringItem } = renderAdminAddStock();
    fillValidAddStock({ name });
    fireEvent.submit(addStockControls().add.closest("form"));
    expect(screen.getByText("Item name is required.")).toBeInTheDocument();
    expect(createStockMonitoringItem).not.toHaveBeenCalled();
  });

  test.each([
    ["blank current stock", { currentStock: "" }, "Current stock quantity is required."],
    ["negative current stock", { currentStock: "-5" }, "Current stock quantity cannot be negative."],
    ["blank max stock", { maxStock: "" }, "Max stock quantity is required."],
    ["negative max stock", { maxStock: "-1" }, "Max stock quantity cannot be negative."],
    ["blank reorder level", { reorderLevel: "" }, "Reorder level is required."],
    ["reorder above max", { maxStock: "5", reorderLevel: "6" }, "Reorder level cannot exceed the max stock quantity of 5."],
    ["current stock above max", { currentStock: "11", maxStock: "10", reorderLevel: "5" }, "Current stock quantity cannot exceed the max stock quantity of 10."],
    ["negative price", { pricePerUnit: "-1" }, "Price per unit cannot be negative."],
    ["blank price", { pricePerUnit: "" }, "Price per unit is required."],
  ])("%s shows inline validation and does not call the API", (_label, values, message) => {
    const { createStockMonitoringItem } = renderAdminAddStock();
    fillValidAddStock(values);
    fireEvent.submit(addStockControls().add.closest("form"));
    expect(screen.getAllByText(message).length).toBeGreaterThan(0);
    expect(createStockMonitoringItem).not.toHaveBeenCalled();
  });

  test("valid corrected inputs remove inline errors and create one stock item", async () => {
    const { createStockMonitoringItem } = renderAdminAddStock();
    fillValidAddStock({ name: "   " });
    fireEvent.submit(addStockControls().add.closest("form"));
    expect(screen.getByText("Item name is required.")).toBeInTheDocument();
    fireEvent.change(addStockControls().name, { target: { value: "  Microfiber Towels  " } });
    expect(screen.queryByText("Item name is required.")).not.toBeInTheDocument();
    fireEvent.click(addStockControls().add);
    await waitFor(() => expect(createStockMonitoringItem).toHaveBeenCalledTimes(1));
    expect(createStockMonitoringItem).toHaveBeenCalledWith(expect.objectContaining({
      name: "Microfiber Towels",
      currentStock: 10,
      maxStock: 100,
      reorderLevel: 20,
      pricePerUnit: 30,
    }));
  });

  test("duplicate submit while adding is guarded", async () => {
    let resolveCreate;
    const createStockMonitoringItem = jest.fn(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    renderAdminAddStock({ createStockMonitoringItem });
    fillValidAddStock();
    const add = addStockControls().add;
    fireEvent.click(add);
    fireEvent.click(add);
    expect(createStockMonitoringItem).toHaveBeenCalledTimes(1);
    resolveCreate({});
    await waitFor(() => expect(screen.queryByRole("button", { name: /Adding/i })).not.toBeInTheDocument());
  });
});

describe("Inventory Clerk Add Stock Item validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("shows Add New Item and opens the shared create form", () => {
    renderStaffAddStock();
    expect(screen.getByText("Add Stock Monitoring Item")).toBeInTheDocument();
    expect(addStockControls().add).toHaveTextContent("Save Item");
  });

  test("blank item name blocks Inventory Clerk stock creation", () => {
    const { createStockMonitoringItem } = renderStaffAddStock();
    fillValidAddStock({ name: "   " });
    fireEvent.submit(addStockControls().add.closest("form"));
    expect(screen.getByText("Item name is required.")).toBeInTheDocument();
    expect(createStockMonitoringItem).not.toHaveBeenCalled();
  });

  test("stock limit validation blocks invalid Inventory Clerk create input", () => {
    const { createStockMonitoringItem } = renderStaffAddStock();
    fillValidAddStock({ currentStock: "11", maxStock: "10", reorderLevel: "5" });
    fireEvent.submit(addStockControls().add.closest("form"));
    expect(screen.getByText("Current stock quantity cannot exceed the max stock quantity of 10.")).toBeInTheDocument();
    expect(createStockMonitoringItem).not.toHaveBeenCalled();
  });

  test("valid Inventory Clerk create submits canonical numeric stock payload", async () => {
    const { createStockMonitoringItem } = renderStaffAddStock();
    fillValidAddStock({ name: "  Microfiber Towels  " });
    fireEvent.click(addStockControls().add);
    await waitFor(() => expect(createStockMonitoringItem).toHaveBeenCalledTimes(1));
    expect(createStockMonitoringItem).toHaveBeenCalledWith(expect.objectContaining({
      name: "Microfiber Towels",
      category: "Coating",
      currentStock: 10,
      maxStock: 100,
      reorderLevel: 20,
      pricePerUnit: 30,
    }));
  });

  test("duplicate Inventory Clerk create submit while saving is guarded", async () => {
    let resolveCreate;
    const createStockMonitoringItem = jest.fn(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    renderStaffAddStock({ createStockMonitoringItem });
    fillValidAddStock();
    const add = addStockControls().add;
    fireEvent.click(add);
    fireEvent.click(add);
    expect(createStockMonitoringItem).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    resolveCreate({});
    await waitFor(() => expect(screen.queryByRole("button", { name: "Saving..." })).not.toBeInTheDocument());
  });
});
