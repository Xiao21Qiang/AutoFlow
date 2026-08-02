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
  return (
    <div role="dialog" aria-label={props.title || "Security confirmation"}>
      <button type="button" onClick={props.onClose}>Cancel PIN</button>
      <button type="button" onClick={props.onConfirm}>Confirm PIN</button>
    </div>
  );
});

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

function renderEngagement() {
  render(<AdminEngagement />);
}

function rowForReward(name) {
  return screen.getByText(name).closest(".engRewardRow");
}

function openEditReward(name = "Loyalty Spark") {
  fireEvent.click(within(rowForReward(name)).getByRole("button", { name: "Edit" }));
}

function updateButton() {
  return screen.getByRole("button", { name: /Update Reward|Saving/i });
}

function rewardForm() {
  return updateButton().closest("form");
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

function weightInput() {
  return document.getElementById("reward-weight");
}

function expirationDaysInput() {
  return document.getElementById("reward-expiration-days");
}

function setupReward(overrides = {}) {
  mockRewardsState = [rewardRecord(overrides)];
  renderEngagement();
  openEditReward(overrides.name || "Loyalty Spark");
}

beforeEach(() => {
  mockRewardsState = [];
  mockCreateReward.mockReset();
  mockUpdateReward.mockReset();
  mockDeleteReward.mockReset();
});

describe("Edit Reward modal validation", () => {
  test("updates one existing reward with valid edited values and shows the authoritative row once", async () => {
    mockRewardsState = [rewardRecord()];
    mockUpdateReward.mockImplementation(async (id, payload) => {
      const updated = rewardRecord({
        id,
        ...payload,
        rewardType: payload.type,
        type: payload.type,
        value: payload.value,
      });
      mockRewardsState = [updated];
      return updated;
    });
    renderEngagement();
    openEditReward();

    expect(nameInput()).toHaveValue("Loyalty Spark");
    expect(typeSelect()).toHaveValue("Discount");
    expect(valueInput()).toHaveValue("10% Discount");
    expect(stockInput()).toHaveValue("8");
    expect(weightInput()).toHaveValue("10");
    expect(expirationDaysInput()).toHaveValue("30");

    fireEvent.change(nameInput(), { target: { value: "Loyalty Glow" } });
    fireEvent.change(valueInput(), { target: { value: "15" } });
    fireEvent.change(stockInput(), { target: { value: "11" } });
    fireEvent.change(expirationDaysInput(), { target: { value: "45" } });

    expect(updateButton()).toBeEnabled();
    await act(async () => {
      fireEvent.click(updateButton());
      await Promise.resolve();
    });

    await waitFor(() => expect(mockUpdateReward).toHaveBeenCalledTimes(1));
    expect(mockUpdateReward).toHaveBeenCalledWith("RWD-1", expect.objectContaining({
      name: "Loyalty Glow",
      type: "Percentage Discount",
      value: "15",
      stock: 11,
      weight: 10,
      expirationDays: 45,
    }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /edit reward/i })).not.toBeInTheDocument());
    expect(screen.getAllByText("Loyalty Glow")).toHaveLength(1);
    expect(screen.queryByText("Loyalty Spark")).not.toBeInTheDocument();
  });

  test.each([
    ["blank reward name", ""],
    ["whitespace-only reward name", "   "],
  ])("rejects %s without an update request", (_label, value) => {
    setupReward();
    fireEvent.change(nameInput(), { target: { value } });
    fireEvent.blur(nameInput());

    expect(screen.getByText("Reward name is required.")).toBeInTheDocument();
    expect(updateButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockUpdateReward).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /edit reward/i })).toBeInTheDocument();
  });

  test("rejects an unselected type without opening PIN or updating", () => {
    setupReward();
    fireEvent.change(typeSelect(), { target: { value: "" } });
    fireEvent.blur(typeSelect());

    expect(screen.getByText("Reward type is required.")).toBeInTheDocument();
    expect(updateButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockUpdateReward).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /change reward weight/i })).not.toBeInTheDocument();
  });

  test.each([
    ["Voucher", "Other"],
    ["Item", "Free Microfiber Towel"],
    ["Discount", "Percentage Discount"],
    ["Service", "Free Car Wash"],
  ])("rejects blank Value for %s rewards", (uiCategory, canonicalType) => {
    setupReward({ type: canonicalType, rewardType: canonicalType, value: uiCategory === "Discount" ? "10" : `${uiCategory} reward` });
    expect(typeSelect()).toHaveValue(uiCategory);

    fireEvent.change(valueInput(), { target: { value: "" } });
    fireEvent.blur(valueInput());

    expect(screen.getByText("Reward value is required.")).toBeInTheDocument();
    expect(updateButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockUpdateReward).not.toHaveBeenCalled();
  });

  test.each(["0", "-1", "abc", "101"])("rejects invalid percentage discount value %s", (value) => {
    setupReward({ type: "Percentage Discount", rewardType: "Percentage Discount", value: "10" });
    fireEvent.change(valueInput(), { target: { value } });
    fireEvent.blur(valueInput());

    expect(screen.getByText(value === "101" ? "Percentage reward value cannot exceed 100%." : "Reward value must be greater than zero.")).toBeInTheDocument();
    expect(updateButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockUpdateReward).not.toHaveBeenCalled();
  });

  test("allows an unchanged Fixed Discount above 100 and preserves its canonical subtype", async () => {
    setupReward({ type: "Fixed Discount", rewardType: "Fixed Discount", value: "150" });
    mockUpdateReward.mockResolvedValue({});

    expect(typeSelect()).toHaveValue("Discount");
    expect(updateButton()).toBeEnabled();
    await act(async () => {
      fireEvent.submit(rewardForm());
      await Promise.resolve();
    });

    expect(mockUpdateReward).toHaveBeenCalledWith("RWD-1", expect.objectContaining({
      type: "Fixed Discount",
      value: "150",
    }));
  });

  test("rejects blank Stock without updating", () => {
    setupReward();
    fireEvent.change(stockInput(), { target: { value: "" } });
    fireEvent.blur(stockInput());

    expect(screen.getByText("Reward stock is required.")).toBeInTheDocument();
    expect(updateButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockUpdateReward).not.toHaveBeenCalled();
  });

  test.each(["0", "-1", "1.5", "abc"])("rejects invalid Stock value %s", (stock) => {
    setupReward();
    fireEvent.change(stockInput(), { target: { value: stock } });
    fireEvent.blur(stockInput());

    expect(screen.getByText("Reward stock must be a positive whole number.")).toBeInTheDocument();
    expect(updateButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockUpdateReward).not.toHaveBeenCalled();
  });

  test.each(["", "0", "-1", "abc", "NaN", "Infinity"])("rejects invalid Weight/Chance value %s", (weight) => {
    setupReward();
    fireEvent.change(weightInput(), { target: { value: weight } });
    fireEvent.blur(weightInput());

    expect(screen.getByText("Reward weight must be greater than zero.")).toBeInTheDocument();
    expect(updateButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockUpdateReward).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /change reward weight/i })).not.toBeInTheDocument();
  });

  test.each([
    ["", "Expiration days are required."],
    ["0", "Expiration days must be a positive whole number."],
    ["-1", "Expiration days must be a positive whole number."],
    ["1.5", "Expiration days must be a positive whole number."],
    ["abc", "Expiration days must be a positive whole number."],
  ])("rejects invalid Expiration Days value %s", (expirationDays, message) => {
    setupReward();
    fireEvent.change(expirationDaysInput(), { target: { value: expirationDays } });
    fireEvent.blur(expirationDaysInput());

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(updateButton()).toBeDisabled();
    fireEvent.submit(rewardForm());
    expect(mockUpdateReward).not.toHaveBeenCalled();
  });

  test("direct submit with multiple invalid fields shows all errors and sends no update", () => {
    setupReward();
    fireEvent.change(nameInput(), { target: { value: "" } });
    fireEvent.change(typeSelect(), { target: { value: "" } });
    fireEvent.change(valueInput(), { target: { value: "" } });
    fireEvent.change(stockInput(), { target: { value: "" } });
    fireEvent.change(weightInput(), { target: { value: "" } });
    fireEvent.change(expirationDaysInput(), { target: { value: "" } });

    fireEvent.submit(rewardForm());

    expect(screen.getByText("Reward name is required.")).toBeInTheDocument();
    expect(screen.getByText("Reward type is required.")).toBeInTheDocument();
    expect(screen.getByText("Reward value is required.")).toBeInTheDocument();
    expect(screen.getByText("Reward stock is required.")).toBeInTheDocument();
    expect(screen.getByText("Reward weight must be greater than zero.")).toBeInTheDocument();
    expect(screen.getByText("Expiration days are required.")).toBeInTheDocument();
    expect(mockUpdateReward).not.toHaveBeenCalled();
  });

  test("errors clear as edited values become valid", () => {
    setupReward();
    fireEvent.change(nameInput(), { target: { value: "" } });
    fireEvent.change(stockInput(), { target: { value: "0" } });
    fireEvent.submit(rewardForm());
    expect(screen.getByText("Reward name is required.")).toBeInTheDocument();
    expect(screen.getByText("Reward stock must be a positive whole number.")).toBeInTheDocument();

    fireEvent.change(nameInput(), { target: { value: "Clean Reward" } });
    fireEvent.change(stockInput(), { target: { value: "4" } });

    expect(screen.queryByText("Reward name is required.")).not.toBeInTheDocument();
    expect(screen.queryByText("Reward stock must be a positive whole number.")).not.toBeInTheDocument();
    expect(updateButton()).toBeEnabled();
  });

  test("closing Edit Reward and opening another reward clears stale errors and values", () => {
    mockRewardsState = [
      rewardRecord({ id: "RWD-1", name: "First Reward", value: "10" }),
      rewardRecord({ id: "RWD-2", name: "Second Reward", type: "Free Car Wash", rewardType: "Free Car Wash", value: "Free Wash", stock: 2, weight: 5, expirationDays: 14 }),
    ];
    renderEngagement();
    openEditReward("First Reward");
    fireEvent.change(nameInput(), { target: { value: "" } });
    fireEvent.submit(rewardForm());
    expect(screen.getByText("Reward name is required.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    openEditReward("First Reward");
    expect(screen.queryByText("Reward name is required.")).not.toBeInTheDocument();
    expect(nameInput()).toHaveValue("First Reward");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    openEditReward("Second Reward");
    expect(nameInput()).toHaveValue("Second Reward");
    expect(typeSelect()).toHaveValue("Service");
    expect(valueInput()).toHaveValue("Free Wash");
    expect(screen.queryByText("Reward name is required.")).not.toBeInTheDocument();
  });

  test.each([
    ["Free Microfiber Towel", "Item"],
    ["Free Car Wash", "Service"],
    ["Percentage Discount", "Discount"],
    ["Fixed Discount", "Discount"],
    ["Other", "Voucher"],
  ])("preselects canonical %s as %s", (canonicalType, uiCategory) => {
    setupReward({ type: canonicalType, rewardType: canonicalType, value: uiCategory === "Discount" ? "10" : `${uiCategory} reward` });
    expect(typeSelect()).toHaveValue(uiCategory);
    expect(typeSelect()).not.toHaveValue("");
  });

  test.each([
    ["Free Microfiber Towel", "Item reward"],
    ["Free Car Wash", "Service reward"],
    ["Percentage Discount", "10"],
    ["Fixed Discount", "150"],
    ["Other", "Voucher reward"],
  ])("preserves unchanged canonical type %s", async (canonicalType, value) => {
    setupReward({ type: canonicalType, rewardType: canonicalType, value });
    mockUpdateReward.mockResolvedValue({});

    await act(async () => {
      fireEvent.click(updateButton());
      await Promise.resolve();
    });

    expect(mockUpdateReward).toHaveBeenCalledWith("RWD-1", expect.objectContaining({
      type: canonicalType,
      value,
    }));
  });

  test("intentional Item to Service change clears stale Value and submits Free Car Wash", async () => {
    setupReward({ type: "Free Microfiber Towel", rewardType: "Free Microfiber Towel", value: "Free Towel" });
    mockUpdateReward.mockResolvedValue({});

    fireEvent.change(typeSelect(), { target: { value: "Service" } });
    expect(valueInput()).toHaveValue("");
    expect(updateButton()).toBeDisabled();
    fireEvent.change(valueInput(), { target: { value: "Free Car Wash" } });

    await act(async () => {
      fireEvent.click(updateButton());
      await Promise.resolve();
    });

    expect(mockUpdateReward).toHaveBeenCalledWith("RWD-1", expect.objectContaining({
      type: "Free Car Wash",
      value: "Free Car Wash",
    }));
  });

  test("repeated valid submissions send one update request", async () => {
    let resolveUpdate;
    mockRewardsState = [rewardRecord()];
    mockUpdateReward.mockReturnValue(new Promise((resolve) => {
      resolveUpdate = resolve;
    }));
    renderEngagement();
    openEditReward();
    fireEvent.change(valueInput(), { target: { value: "12" } });
    const form = rewardForm();

    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
      fireEvent.click(updateButton());
      expect(mockUpdateReward).toHaveBeenCalledTimes(1);
      resolveUpdate(rewardRecord({ value: "12" }));
      await Promise.resolve();
    });
  });

  test("valid Weight/Chance changes require PIN, cancel leaves unchanged, and confirm updates once", async () => {
    setupReward();
    mockUpdateReward.mockResolvedValue({});
    fireEvent.change(weightInput(), { target: { value: "12" } });

    fireEvent.submit(rewardForm());
    expect(screen.getByRole("dialog", { name: /change reward weight/i })).toBeInTheDocument();
    expect(mockUpdateReward).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel PIN" }));
    expect(mockUpdateReward).not.toHaveBeenCalled();

    fireEvent.submit(rewardForm());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm PIN" }));
      await Promise.resolve();
    });

    expect(mockUpdateReward).toHaveBeenCalledTimes(1);
    expect(mockUpdateReward).toHaveBeenCalledWith("RWD-1", expect.objectContaining({ weight: 12 }));
  });
});
