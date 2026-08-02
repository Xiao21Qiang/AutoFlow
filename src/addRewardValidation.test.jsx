import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminEngagement from "./screens/admin/AdminEngagement";

const mockCreateReward = jest.fn();
const mockUpdateReward = jest.fn();
const mockDeleteReward = jest.fn();

let mockRewardsState = [];

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    reviews: [],
    promos: [],
    rewards: mockRewardsState,
    customerRewards: [],
    users: [],
    currentUser: { id: "ADM-1", name: "Admin", email: "admin@example.com", userType: "Admin", role: "Admin" },
    createPromo: jest.fn(),
    updatePromo: jest.fn(),
    updateReview: jest.fn(),
    createReward: mockCreateReward,
    updateReward: mockUpdateReward,
    deleteReward: mockDeleteReward,
    generateCustomerReward: jest.fn(),
  }),
}));

jest.mock("./components/common/SecurityConfirmModal", () => (props) => {
  if (!props.open) return null;
  return <div role="dialog" aria-label={props.title || "Security confirmation"}>Security PIN</div>;
});

function renderEngagement() {
  render(<AdminEngagement />);
}

function rewardRecord(overrides = {}) {
  return {
    id: "RWD-1",
    name: "Loyalty Spark",
    type: "Percentage Discount",
    rewardType: "Percentage Discount",
    description: "Reward for loyal customers.",
    value: "10% Discount",
    rarity: "Common",
    weight: 10,
    active: true,
    stock: 8,
    quantity: 8,
    expirationDays: 30,
    ...overrides,
  };
}

function rowForReward(name) {
  return screen.getByText(name).closest(".engRewardRow");
}

function editReward(name) {
  fireEvent.click(within(rowForReward(name)).getByRole("button", { name: "Edit" }));
}

function openAddReward() {
  renderEngagement();
  fireEvent.click(screen.getByRole("button", { name: "Add Reward" }));
}

function saveButton() {
  return screen.getByRole("button", { name: /Save Reward|Update Reward|Saving/i });
}

function rewardForm() {
  return saveButton().closest("form");
}

function nameInput() {
  return document.getElementById("reward-name");
}

function typeSelect() {
  return document.getElementById("reward-type");
}

function descriptionInput() {
  return document.getElementById("reward-description");
}

function valueInput() {
  return document.getElementById("reward-value");
}

function stockInput() {
  return document.getElementById("reward-stock");
}

function expirationDaysInput() {
  return document.getElementById("reward-expiration-days");
}

function fillValidReward(overrides = {}) {
  const values = {
    name: "Loyalty Spark",
    type: "Discount",
    description: "Reward for loyal customers.",
    value: "10",
    stock: "8",
    expirationDays: "30",
    weight: "10",
    ...overrides,
  };

  fireEvent.change(nameInput(), { target: { value: values.name } });
  fireEvent.change(typeSelect(), { target: { value: values.type } });
  fireEvent.change(descriptionInput(), { target: { value: values.description } });
  fireEvent.change(valueInput(), { target: { value: values.value } });
  fireEvent.change(stockInput(), { target: { value: values.stock } });
  fireEvent.change(expirationDaysInput(), { target: { value: values.expirationDays } });
  fireEvent.change(document.getElementById("reward-weight"), { target: { value: values.weight } });
  return values;
}

beforeEach(() => {
  mockRewardsState = [];
  mockCreateReward.mockReset();
  mockUpdateReward.mockReset();
  mockDeleteReward.mockReset();
});

describe("Add Reward modal validation", () => {
  test("starts with Save Reward genuinely disabled on the empty form", () => {
    openAddReward();

    expect(screen.getByRole("dialog", { name: /add reward/i })).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  test("saves one valid reward and shows the authoritative result once", async () => {
    let resolveCreate;
    mockCreateReward.mockImplementation((payload) => new Promise((resolve) => {
      resolveCreate = () => {
        const saved = {
          id: "RWD-1",
          ...payload,
          type: "Percentage Discount",
          rewardType: "Percentage Discount",
          value: `${payload.value}% Discount`,
          discountType: "Percentage",
          discountValue: Number(payload.value),
          stock: Number(payload.stock),
          quantity: Number(payload.stock),
          expirationDays: Number(payload.expirationDays),
        };
        mockRewardsState = [saved];
        resolve(saved);
      };
    }));

    openAddReward();
    const values = fillValidReward({ name: "  Loyalty Spark  ", description: "  Reward for loyal customers.  " });

    expect(saveButton()).toBeEnabled();
    await act(async () => {
      fireEvent.click(saveButton());
      await Promise.resolve();
    });

    await waitFor(() => expect(mockCreateReward).toHaveBeenCalledTimes(1));
    expect(mockCreateReward).toHaveBeenCalledWith(expect.objectContaining({
      name: "Loyalty Spark",
      type: "Percentage Discount",
      description: "Reward for loyal customers.",
      value: values.value,
      stock: Number(values.stock),
      expirationDays: Number(values.expirationDays),
    }));
    await act(async () => {
      resolveCreate();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: /add reward/i })).not.toBeInTheDocument());
    expect(screen.getAllByText("Loyalty Spark")).toHaveLength(1);
    expect(within(rowForReward("Loyalty Spark")).getByText("Discount")).toBeInTheDocument();
    expect(within(rowForReward("Loyalty Spark")).getByText("10% Discount")).toBeInTheDocument();
  });

  test("maps backend canonical reward types to user-facing Type column labels", () => {
    mockRewardsState = [
      rewardRecord({ id: "RWD-ITEM", name: "Towel Prize", type: "Free Microfiber Towel", rewardType: "Free Microfiber Towel", value: "Fresh towel" }),
      rewardRecord({ id: "RWD-SERVICE", name: "Wash Prize", type: "Free Car Wash", rewardType: "Free Car Wash", value: "Exterior wash" }),
      rewardRecord({ id: "RWD-PERCENT", name: "Percent Prize", type: "Percentage Discount", rewardType: "Percentage Discount", value: "5% off" }),
      rewardRecord({ id: "RWD-FIXED", name: "Fixed Prize", type: "Fixed Discount", rewardType: "Fixed Discount", value: "P 150 off" }),
      rewardRecord({ id: "RWD-VOUCHER", name: "Voucher Prize", type: "Other", rewardType: "Other", value: "VIP token" }),
    ];

    renderEngagement();

    expect(within(rowForReward("Towel Prize")).getByText("Item")).toBeInTheDocument();
    expect(within(rowForReward("Wash Prize")).getByText("Service")).toBeInTheDocument();
    expect(within(rowForReward("Percent Prize")).getByText("Discount")).toBeInTheDocument();
    expect(within(rowForReward("Fixed Prize")).getByText("Discount")).toBeInTheDocument();
    expect(within(rowForReward("Voucher Prize")).getByText("Voucher")).toBeInTheDocument();
    expect(screen.queryByText("Free Microfiber Towel")).not.toBeInTheDocument();
    expect(screen.queryByText("Free Car Wash")).not.toBeInTheDocument();
    expect(screen.queryByText("Percentage Discount")).not.toBeInTheDocument();
    expect(screen.queryByText("Fixed Discount")).not.toBeInTheDocument();
    expect(screen.queryByText("Other")).not.toBeInTheDocument();
  });

  test.each([
    ["Free Microfiber Towel", "Item"],
    ["Free Car Wash", "Service"],
    ["Percentage Discount", "Discount"],
    ["Fixed Discount", "Discount"],
    ["Other", "Voucher"],
  ])("preselects %s as %s when editing", (canonicalType, uiCategory) => {
    mockRewardsState = [rewardRecord({ type: canonicalType, rewardType: canonicalType })];
    renderEngagement();

    editReward("Loyalty Spark");

    expect(typeSelect()).toHaveValue(uiCategory);
    expect(typeSelect()).not.toHaveValue("");
  });

  test.each([
    ["Free Microfiber Towel", "Free Shampoo"],
    ["Percentage Discount", "10% Discount"],
    ["Fixed Discount", "P 150 Discount"],
  ])("preserves canonical type %s when saving an unchanged edited reward", async (canonicalType, value) => {
    mockRewardsState = [rewardRecord({ type: canonicalType, rewardType: canonicalType, value })];
    mockUpdateReward.mockImplementation(async (id, payload) => {
      mockRewardsState = [rewardRecord({ id, ...payload, rewardType: payload.type })];
      return mockRewardsState[0];
    });
    renderEngagement();
    editReward("Loyalty Spark");

    expect(saveButton()).toBeEnabled();
    await act(async () => {
      fireEvent.click(saveButton());
      await Promise.resolve();
    });

    await waitFor(() => expect(mockUpdateReward).toHaveBeenCalledTimes(1));
    expect(mockUpdateReward).toHaveBeenCalledWith("RWD-1", expect.objectContaining({
      type: canonicalType,
      value,
    }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /edit reward/i })).not.toBeInTheDocument());
    expect(screen.getAllByText("Loyalty Spark")).toHaveLength(1);
  });

  test("changing Item to Service clears stale value and submits the canonical Service type", async () => {
    mockRewardsState = [rewardRecord({ type: "Free Microfiber Towel", rewardType: "Free Microfiber Towel", value: "Free Shampoo" })];
    mockUpdateReward.mockResolvedValue({});
    renderEngagement();
    editReward("Loyalty Spark");

    fireEvent.change(typeSelect(), { target: { value: "Service" } });
    expect(valueInput()).toHaveValue("");
    expect(saveButton()).toBeDisabled();
    fireEvent.blur(valueInput());
    expect(screen.getByText("Reward value is required.")).toBeInTheDocument();

    fireEvent.change(valueInput(), { target: { value: "Free Car Wash" } });
    expect(saveButton()).toBeEnabled();
    await act(async () => {
      fireEvent.submit(rewardForm());
      await Promise.resolve();
    });

    expect(mockUpdateReward).toHaveBeenCalledWith("RWD-1", expect.objectContaining({
      type: "Free Car Wash",
      value: "Free Car Wash",
    }));
  });

  test.each([
    ["Voucher", "Voucher"],
    ["Item", "Item"],
    ["Discount", "Discount"],
    ["Service", "Service"],
  ])("keeps legacy frontend type %s displayable and editable", (legacyType, uiCategory) => {
    mockRewardsState = [rewardRecord({ type: legacyType, rewardType: legacyType })];
    renderEngagement();

    expect(within(rowForReward("Loyalty Spark")).getByText(uiCategory)).toBeInTheDocument();
    editReward("Loyalty Spark");
    expect(typeSelect()).toHaveValue(uiCategory);
  });

  test.each([
    ["Item", "Free Microfiber Towel", "Free Microfiber Towel"],
    ["Service", "Free Car Wash", "Free Car Wash"],
    ["Voucher", "VIP Voucher", "Other"],
    ["Discount", "10", "Percentage Discount"],
  ])("Add Reward submits %s as canonical backend type", async (uiCategory, value, canonicalType) => {
    mockCreateReward.mockResolvedValue({});
    openAddReward();
    fillValidReward({ type: uiCategory, value });

    expect(saveButton()).toBeEnabled();
    await act(async () => {
      fireEvent.click(saveButton());
      await Promise.resolve();
    });

    expect(mockCreateReward).toHaveBeenCalledWith(expect.objectContaining({
      type: canonicalType,
      value,
    }));
  });

  test("reward search matches user-facing type labels for canonical stored types", () => {
    mockRewardsState = [
      rewardRecord({ id: "RWD-ITEM", name: "Towel Prize", type: "Free Microfiber Towel", rewardType: "Free Microfiber Towel", value: "Fresh towel" }),
      rewardRecord({ id: "RWD-SERVICE", name: "Wash Prize", type: "Free Car Wash", rewardType: "Free Car Wash", value: "Exterior wash" }),
      rewardRecord({ id: "RWD-PERCENT", name: "Percent Prize", type: "Percentage Discount", rewardType: "Percentage Discount", value: "5% off" }),
      rewardRecord({ id: "RWD-FIXED", name: "Fixed Prize", type: "Fixed Discount", rewardType: "Fixed Discount", value: "P 150 off" }),
      rewardRecord({ id: "RWD-VOUCHER", name: "Voucher Prize", type: "Other", rewardType: "Other", value: "VIP token" }),
    ];

    renderEngagement();
    const search = screen.getByPlaceholderText("Search reward");

    fireEvent.change(search, { target: { value: "Item" } });
    expect(screen.getByText("Towel Prize")).toBeInTheDocument();
    expect(screen.queryByText("Wash Prize")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "Service" } });
    expect(screen.getByText("Wash Prize")).toBeInTheDocument();
    expect(screen.queryByText("Towel Prize")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "Discount" } });
    expect(screen.getByText("Percent Prize")).toBeInTheDocument();
    expect(screen.getByText("Fixed Prize")).toBeInTheDocument();
    expect(screen.queryByText("Voucher Prize")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "Voucher" } });
    expect(screen.getByText("Voucher Prize")).toBeInTheDocument();
    expect(screen.queryByText("Percent Prize")).not.toBeInTheDocument();
  });

  test.each([
    ["blank reward name", { name: "" }],
    ["whitespace-only reward name", { name: "   " }],
  ])("rejects %s with an inline error and no API request", (_label, override) => {
    openAddReward();
    fillValidReward(override);
    fireEvent.blur(nameInput());

    expect(screen.getByText("Reward name is required.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockCreateReward).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /add reward/i })).toBeInTheDocument();
  });

  test("rejects a missing reward type with an inline error and no API request", () => {
    openAddReward();
    fillValidReward({ type: "" });
    fireEvent.blur(typeSelect());

    expect(screen.getByText("Reward type is required.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockCreateReward).not.toHaveBeenCalled();
  });

  test("rejects a blank value for the selected type", () => {
    openAddReward();
    fillValidReward({ value: "" });
    fireEvent.blur(valueInput());

    expect(screen.getByText("Reward value is required.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockCreateReward).not.toHaveBeenCalled();
  });

  test.each(["0", "-1", "101", "abc", "NaN", "Infinity"])("rejects invalid percentage reward value %s", (value) => {
    openAddReward();
    fillValidReward({ value });
    fireEvent.blur(valueInput());

    expect(screen.getByText(value === "101" ? "Percentage reward value cannot exceed 100%." : "Reward value must be greater than zero.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockCreateReward).not.toHaveBeenCalled();
  });

  test("accepts a textual value for a non-numeric reward type after rejecting an empty value", () => {
    openAddReward();
    fillValidReward({ type: "Item", value: "" });
    fireEvent.blur(valueInput());

    expect(screen.getByText("Reward value is required.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    fireEvent.change(valueInput(), { target: { value: "Free Microfiber Towel" } });

    expect(screen.queryByText("Reward value is required.")).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  test("changing reward type clears incompatible stale value state", () => {
    openAddReward();
    fillValidReward({ type: "Item", value: "Free Microfiber Towel" });
    expect(saveButton()).toBeEnabled();

    fireEvent.change(typeSelect(), { target: { value: "Discount" } });
    fireEvent.blur(valueInput());

    expect(valueInput()).toHaveValue("");
    expect(screen.getByText("Reward value is required.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  test("rejects a blank stock value with an inline error", () => {
    openAddReward();
    fillValidReward({ stock: "" });
    fireEvent.blur(stockInput());

    expect(screen.getByText("Reward stock is required.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockCreateReward).not.toHaveBeenCalled();
  });

  test.each(["0", "-1", "1.5", "abc", "NaN", "Infinity"])("rejects invalid stock value %s", (stock) => {
    openAddReward();
    fillValidReward({ stock });
    fireEvent.blur(stockInput());

    expect(screen.getByText("Reward stock must be a positive whole number.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockCreateReward).not.toHaveBeenCalled();
  });

  test.each([
    ["blank expiration days", "", "Expiration days are required."],
    ["zero expiration days", "0", "Expiration days must be a positive whole number."],
    ["negative expiration days", "-1", "Expiration days must be a positive whole number."],
    ["decimal expiration days", "1.5", "Expiration days must be a positive whole number."],
    ["non-numeric expiration days", "abc", "Expiration days must be a positive whole number."],
  ])("rejects %s", (_label, expirationDays, message) => {
    openAddReward();
    fillValidReward({ expirationDays });
    fireEvent.blur(expirationDaysInput());

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockCreateReward).not.toHaveBeenCalled();
  });

  test("direct submit with multiple invalid fields displays every applicable error and opens no PIN", () => {
    openAddReward();

    expect(saveButton()).toBeDisabled();
    fireEvent.submit(rewardForm());

    expect(screen.getByText("Reward name is required.")).toBeInTheDocument();
    expect(screen.getByText("Reward type is required.")).toBeInTheDocument();
    expect(screen.getByText("Reward description is required.")).toBeInTheDocument();
    expect(screen.getByText("Reward value is required.")).toBeInTheDocument();
    expect(screen.getByText("Reward stock is required.")).toBeInTheDocument();
    expect(mockCreateReward).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /security/i })).not.toBeInTheDocument();
  });

  test("field errors clear as values become valid and Save enables only when the form is valid", () => {
    openAddReward();
    fireEvent.submit(rewardForm());
    expect(screen.getByText("Reward name is required.")).toBeInTheDocument();
    expect(screen.getByText("Reward type is required.")).toBeInTheDocument();

    fillValidReward();

    expect(screen.queryByText("Reward name is required.")).not.toBeInTheDocument();
    expect(screen.queryByText("Reward type is required.")).not.toBeInTheDocument();
    expect(screen.queryByText("Reward value is required.")).not.toBeInTheDocument();
    expect(screen.queryByText("Reward stock is required.")).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  test("closing and reopening Add Reward clears stale values and errors", () => {
    openAddReward();
    fireEvent.submit(rewardForm());
    expect(screen.getByText("Reward name is required.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Reward" }));

    expect(screen.queryByText("Reward name is required.")).not.toBeInTheDocument();
    expect(nameInput()).toHaveValue("");
    expect(typeSelect()).toHaveValue("");
    expect(valueInput()).toHaveValue("");
  });

  test("rapid repeated submit attempts create only one reward", async () => {
    let resolveCreate;
    mockCreateReward.mockReturnValue(new Promise((resolve) => {
      resolveCreate = resolve;
    }));

    openAddReward();
    fillValidReward();
    const form = rewardForm();

    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
      fireEvent.click(saveButton());
      expect(mockCreateReward).toHaveBeenCalledTimes(1);
      resolveCreate({ id: "RWD-1", name: "Loyalty Spark", type: "Percentage Discount", value: "10% Discount" });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /add reward/i })).not.toBeInTheDocument());
  });
});
