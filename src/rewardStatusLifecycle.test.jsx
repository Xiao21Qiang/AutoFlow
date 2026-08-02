import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminEngagement from "./screens/admin/AdminEngagement";
import { validateSpecialCredential } from "./utils/reauth";

const mockUpdateRewardStatus = jest.fn();

let mockRewardsState = [];

jest.mock("./utils/reauth", () => {
  const actual = jest.requireActual("./utils/reauth");
  return {
    ...actual,
    validateSpecialCredential: jest.fn(),
  };
});

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
    createReward: jest.fn(),
    updateReward: jest.fn(),
    updateRewardStatus: mockUpdateRewardStatus,
    deleteReward: jest.fn(),
    generateCustomerReward: jest.fn(),
  }),
}));

function rewardRecord(overrides = {}) {
  return {
    id: "RWD-1",
    name: "Loyalty Spark",
    type: "Free Microfiber Towel",
    rewardType: "Free Microfiber Towel",
    description: "Reward for loyal customers.",
    value: "Free Towel",
    rarity: "Common",
    weight: 10,
    enabled: true,
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

function pinInput() {
  return screen.getByPlaceholderText("Enter special PIN");
}

async function confirmPin(pin = "123456") {
  fireEvent.change(pinInput(), { target: { value: pin } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Confirm PIN" }));
    await Promise.resolve();
  });
}

function installStatusUpdater() {
  mockUpdateRewardStatus.mockImplementation(async (id, enabled) => {
    const updated = mockRewardsState.map((reward) => {
      const matches = [reward.id, reward._id].some((value) => String(value || "") === String(id || ""));
      return matches ? { ...reward, enabled, active: enabled } : reward;
    });
    mockRewardsState = updated;
    return updated.find((reward) => [reward.id, reward._id].some((value) => String(value || "") === String(id || "")));
  });
}

beforeEach(() => {
  mockRewardsState = [];
  mockUpdateRewardStatus.mockReset();
  validateSpecialCredential.mockReset();
  validateSpecialCredential.mockResolvedValue(true);
});

describe("Reward Enable/Disable lifecycle", () => {
  test("disables an enabled reward after one valid Admin Special PIN check", async () => {
    mockRewardsState = [rewardRecord()];
    installStatusUpdater();
    renderEngagement();

    fireEvent.click(within(rowForReward("Loyalty Spark")).getByRole("button", { name: "Disable" }));
    expect(screen.getByRole("dialog", { name: "Disable Reward" })).toBeInTheDocument();

    await confirmPin();

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Disable Reward" })).not.toBeInTheDocument());
    expect(validateSpecialCredential).toHaveBeenCalledTimes(1);
    expect(validateSpecialCredential).toHaveBeenCalledWith("pin", "123456", "admin", expect.objectContaining({ userType: "Admin" }), "engagement.manage");
    expect(mockUpdateRewardStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateRewardStatus).toHaveBeenCalledWith("RWD-1", false);
    expect(within(rowForReward("Loyalty Spark")).getByText("Disabled")).toBeInTheDocument();
    expect(within(rowForReward("Loyalty Spark")).getByRole("button", { name: "Enable" })).toBeInTheDocument();
    expect(screen.getAllByText("Loyalty Spark")).toHaveLength(1);
    expect(within(rowForReward("Loyalty Spark")).getByText("Item")).toBeInTheDocument();
  });

  test("enables a disabled reward after one valid Admin Special PIN check", async () => {
    mockRewardsState = [rewardRecord({ enabled: false, active: false })];
    installStatusUpdater();
    renderEngagement();

    fireEvent.click(within(rowForReward("Loyalty Spark")).getByRole("button", { name: "Enable" }));
    expect(screen.getByRole("dialog", { name: "Enable Reward" })).toBeInTheDocument();

    await confirmPin();

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Enable Reward" })).not.toBeInTheDocument());
    expect(validateSpecialCredential).toHaveBeenCalledTimes(1);
    expect(mockUpdateRewardStatus).toHaveBeenCalledTimes(1);
    expect(mockUpdateRewardStatus).toHaveBeenCalledWith("RWD-1", true);
    expect(within(rowForReward("Loyalty Spark")).getByText("Enabled")).toBeInTheDocument();
    expect(within(rowForReward("Loyalty Spark")).getByRole("button", { name: "Disable" })).toBeInTheDocument();
  });

  test("empty PIN shows inline validation and sends no status update", async () => {
    mockRewardsState = [rewardRecord()];
    installStatusUpdater();
    renderEngagement();

    fireEvent.click(within(rowForReward("Loyalty Spark")).getByRole("button", { name: "Disable" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm PIN" }));

    expect(await screen.findByText("Please fill out this field.")).toBeInTheDocument();
    expect(validateSpecialCredential).not.toHaveBeenCalled();
    expect(mockUpdateRewardStatus).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Disable Reward" })).toBeInTheDocument();
    expect(within(rowForReward("Loyalty Spark")).getByText("Enabled")).toBeInTheDocument();
  });

  test("incorrect PIN keeps the modal open and sends no status update", async () => {
    validateSpecialCredential.mockRejectedValueOnce(new Error("Incorrect admin special PIN."));
    mockRewardsState = [rewardRecord()];
    installStatusUpdater();
    renderEngagement();

    fireEvent.click(within(rowForReward("Loyalty Spark")).getByRole("button", { name: "Disable" }));
    await confirmPin("000000");

    expect(await screen.findByText("Incorrect admin special PIN.")).toBeInTheDocument();
    expect(validateSpecialCredential).toHaveBeenCalledTimes(1);
    expect(mockUpdateRewardStatus).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Disable Reward" })).toBeInTheDocument();
    expect(within(rowForReward("Loyalty Spark")).getByText("Enabled")).toBeInTheDocument();
  });

  test("successful PIN but failed update clears Checking state and allows retry", async () => {
    mockRewardsState = [rewardRecord()];
    mockUpdateRewardStatus
      .mockRejectedValueOnce(new Error("Unable to update reward status."))
      .mockImplementationOnce(async (id, enabled) => {
        mockRewardsState = mockRewardsState.map((reward) => reward.id === id ? { ...reward, enabled, active: enabled } : reward);
        return mockRewardsState[0];
      });
    renderEngagement();

    fireEvent.click(within(rowForReward("Loyalty Spark")).getByRole("button", { name: "Disable" }));
    await confirmPin();

    expect(await screen.findByText("Unable to update reward status.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Checking..." })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Disable Reward" })).toBeInTheDocument();
    expect(within(rowForReward("Loyalty Spark")).getByText("Enabled")).toBeInTheDocument();

    await confirmPin("123456");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Disable Reward" })).not.toBeInTheDocument());
    expect(validateSpecialCredential).toHaveBeenCalledTimes(2);
    expect(mockUpdateRewardStatus).toHaveBeenCalledTimes(2);
    expect(within(rowForReward("Loyalty Spark")).getByText("Disabled")).toBeInTheDocument();
  });

  test("stores the selected reward and updates only that row", async () => {
    mockRewardsState = [
      rewardRecord({ id: "RWD-A", name: "Reward A", enabled: true, active: true }),
      rewardRecord({ id: "RWD-B", name: "Reward B", enabled: true, active: true }),
    ];
    installStatusUpdater();
    renderEngagement();

    fireEvent.click(within(rowForReward("Reward A")).getByRole("button", { name: "Disable" }));
    await confirmPin();

    expect(mockUpdateRewardStatus).toHaveBeenCalledWith("RWD-A", false);
    expect(within(rowForReward("Reward A")).getByText("Disabled")).toBeInTheDocument();
    expect(within(rowForReward("Reward B")).getByText("Enabled")).toBeInTheDocument();
  });

  test("uses backend _id when id is absent and replaces the matching row", async () => {
    mockRewardsState = [rewardRecord({ id: undefined, _id: "64f0c2f1a5b8a77a12345678", name: "Backend Reward" })];
    installStatusUpdater();
    renderEngagement();

    fireEvent.click(within(rowForReward("Backend Reward")).getByRole("button", { name: "Disable" }));
    await confirmPin();

    expect(mockUpdateRewardStatus).toHaveBeenCalledWith("64f0c2f1a5b8a77a12345678", false);
    expect(within(rowForReward("Backend Reward")).getByText("Disabled")).toBeInTheDocument();
    expect(screen.getAllByText("Backend Reward")).toHaveLength(1);
  });

  test("rapid confirm clicks run one verification and one status update", async () => {
    let resolveVerification;
    validateSpecialCredential.mockReturnValue(new Promise((resolve) => {
      resolveVerification = resolve;
    }));
    mockRewardsState = [rewardRecord()];
    installStatusUpdater();
    renderEngagement();

    fireEvent.click(within(rowForReward("Loyalty Spark")).getByRole("button", { name: "Disable" }));
    fireEvent.change(pinInput(), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm PIN" }));
    expect(await screen.findByRole("button", { name: "Checking..." })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Checking..." }));

    await act(async () => {
      resolveVerification(true);
      await Promise.resolve();
    });

    await waitFor(() => expect(mockUpdateRewardStatus).toHaveBeenCalledTimes(1));
    expect(validateSpecialCredential).toHaveBeenCalledTimes(1);
  });
});
