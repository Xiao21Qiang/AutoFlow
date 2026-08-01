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
