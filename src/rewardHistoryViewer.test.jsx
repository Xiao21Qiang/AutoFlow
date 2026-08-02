import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminEngagement from "./screens/admin/AdminEngagement";
import { ACTION_KEYS } from "./utils/rbac";
import { validateSpecialCredential } from "./utils/reauth";

const mockCreatePromo = jest.fn();
const mockUpdatePromo = jest.fn();
const mockUpdateReview = jest.fn();
const mockCreateReward = jest.fn();
const mockUpdateReward = jest.fn();
const mockUpdateRewardStatus = jest.fn();
const mockDeleteReward = jest.fn();
const mockGenerateCustomerReward = jest.fn();

let mockUsersState = [];
let mockCustomerRewardsState = [];

jest.mock("./context/AdminDataContext", () => ({
  useAdminData: () => ({
    reviews: [],
    promos: [],
    rewards: [],
    customerRewards: mockCustomerRewardsState,
    users: mockUsersState,
    currentUser: { id: "ADM-1", name: "Admin", email: "admin@example.com", userType: "Admin", role: "Admin" },
    createPromo: mockCreatePromo,
    updatePromo: mockUpdatePromo,
    updateReview: mockUpdateReview,
    createReward: mockCreateReward,
    updateReward: mockUpdateReward,
    updateRewardStatus: mockUpdateRewardStatus,
    deleteReward: mockDeleteReward,
    generateCustomerReward: mockGenerateCustomerReward,
  }),
}));

jest.mock("./utils/reauth", () => ({
  getCurrentUserDisplayName: (user) => String(user?.name || user?.email || "").trim(),
  validateSpecialCredential: jest.fn(),
  verifyCurrentPassword: jest.fn(),
}));

function renderEngagement() {
  return render(<AdminEngagement />);
}

function historyControls() {
  return screen.getByRole("button", { name: "View Reward History" }).closest(".engManualReward");
}

function customerSelect() {
  return within(historyControls()).getByRole("combobox");
}

function historyFilters() {
  return document.querySelector(".engRewardHistoryFilters");
}

function historyRows() {
  return Array.from(document.querySelectorAll(".engRewardHistoryRow"));
}

function setCustomer(key) {
  fireEvent.change(customerSelect(), { target: { value: key } });
}

function clickViewHistory() {
  fireEvent.click(screen.getByRole("button", { name: "View Reward History" }));
}

function pinInput() {
  return screen.getByPlaceholderText("Enter special PIN");
}

function confirmPinButton() {
  return screen.getByRole("button", { name: /Confirm PIN|Checking/i });
}

async function authorizeSelectedCustomer(pin = "123456") {
  clickViewHistory();
  fireEvent.change(pinInput(), { target: { value: pin } });
  await act(async () => {
    fireEvent.click(confirmPinButton());
    await Promise.resolve();
  });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: /view reward history/i })).not.toBeInTheDocument());
}

function customer(overrides = {}) {
  return {
    id: "CUS-A",
    name: "Alex Cruz",
    email: "alex.a@example.com",
    userType: "Customer",
    role: "Customer",
    status: "active",
    ...overrides,
  };
}

function reward(overrides = {}) {
  return {
    id: "CRW-A1",
    customerId: "CUS-A",
    customerName: "Alex Cruz",
    customerEmail: "alex.a@example.com",
    rewardName: "Loyalty Spark",
    rewardType: "Percentage Discount",
    rewardCode: "LOYALTY",
    claimCode: "CLAIM-A1",
    status: "Available",
    dateGranted: "2026-08-02",
    dateEarned: "2026-08-02",
    milestoneNumber: 1,
    linkedBookingId: "BK-A1",
    ...overrides,
  };
}

function expectNoMutations() {
  expect(mockCreatePromo).not.toHaveBeenCalled();
  expect(mockUpdatePromo).not.toHaveBeenCalled();
  expect(mockUpdateReview).not.toHaveBeenCalled();
  expect(mockCreateReward).not.toHaveBeenCalled();
  expect(mockUpdateReward).not.toHaveBeenCalled();
  expect(mockUpdateRewardStatus).not.toHaveBeenCalled();
  expect(mockDeleteReward).not.toHaveBeenCalled();
  expect(mockGenerateCustomerReward).not.toHaveBeenCalled();
}

beforeEach(() => {
  mockUsersState = [
    customer(),
    customer({ id: "CUS-B", email: "alex.b@example.com" }),
    customer({ id: "CUS-C", name: "No Rewards", email: "none@example.com" }),
  ];
  mockCustomerRewardsState = [
    reward(),
    reward({
      id: "CRW-A2",
      rewardName: "Wash Credit",
      rewardType: "Fixed Discount",
      rewardCode: "WASH",
      claimCode: "CLAIM-A2",
      status: "Claimed",
      dateGranted: "2026-08-05",
      milestoneNumber: 2,
      linkedBookingId: "BK-A2",
    }),
    reward({
      id: "CRW-B1",
      customerId: "CUS-B",
      customerEmail: "alex.b@example.com",
      rewardName: "Detail Token",
      rewardType: "Other",
      rewardCode: "DETAIL",
      claimCode: "CLAIM-B1",
      status: "Used",
      usedAt: "2026-08-06",
      dateGranted: "2026-08-01",
      milestoneNumber: 1,
      linkedBookingId: "BK-B1",
    }),
  ];
  [
    mockCreatePromo,
    mockUpdatePromo,
    mockUpdateReview,
    mockCreateReward,
    mockUpdateReward,
    mockUpdateRewardStatus,
    mockDeleteReward,
    mockGenerateCustomerReward,
  ].forEach((mock) => mock.mockClear());
  validateSpecialCredential.mockReset();
  validateSpecialCredential.mockResolvedValue(true);
});

describe("Reward History PIN-gated customer viewer", () => {
  test("labels the customer action as View Reward History and starts genuinely disabled", () => {
    renderEngagement();

    expect(screen.getByRole("button", { name: "View Reward History" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Generate" })).not.toBeInTheDocument();
    clickViewHistory();
    expect(screen.queryByRole("dialog", { name: /view reward history/i })).not.toBeInTheDocument();
    expect(validateSpecialCredential).not.toHaveBeenCalled();
    expectNoMutations();
  });

  test("correct Admin PIN applies the selected customer history filter and closes the modal", async () => {
    renderEngagement();

    setCustomer("CUS-A");
    expect(screen.getByRole("button", { name: "View Reward History" })).toBeEnabled();
    clickViewHistory();

    expect(screen.getByRole("dialog", { name: /view reward history/i })).toBeInTheDocument();
    fireEvent.change(pinInput(), { target: { value: " 123456 " } });
    await act(async () => {
      fireEvent.click(confirmPinButton());
      await Promise.resolve();
    });

    await waitFor(() => expect(validateSpecialCredential).toHaveBeenCalledTimes(1));
    expect(validateSpecialCredential).toHaveBeenCalledWith(
      "pin",
      "123456",
      "admin",
      expect.objectContaining({ id: "ADM-1" }),
      ACTION_KEYS.engagementManage
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /view reward history/i })).not.toBeInTheDocument());
    expect(screen.getByText("Loyalty Spark")).toBeInTheDocument();
    expect(screen.getByText("Wash Credit")).toBeInTheDocument();
    expect(screen.queryByText("Detail Token")).not.toBeInTheDocument();
    expect(historyRows()).toHaveLength(2);
    expectNoMutations();
  });

  test("incorrect Admin PIN keeps the modal open and does not apply the pending customer filter", async () => {
    validateSpecialCredential.mockRejectedValueOnce(new Error("Incorrect admin special PIN."));
    renderEngagement();

    setCustomer("CUS-A");
    clickViewHistory();
    fireEvent.change(pinInput(), { target: { value: "000000" } });
    await act(async () => {
      fireEvent.click(confirmPinButton());
      await Promise.resolve();
    });

    expect(await screen.findByText("Incorrect admin special PIN.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /view reward history/i })).toBeInTheDocument();
    expect(validateSpecialCredential).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Detail Token")).toBeInTheDocument();
    expect(historyRows()).toHaveLength(3);
    expectNoMutations();
  });

  test("blank and whitespace-only PIN keep Confirm PIN disabled and send no verification request", () => {
    renderEngagement();

    setCustomer("CUS-A");
    clickViewHistory();

    expect(confirmPinButton()).toBeDisabled();
    fireEvent.click(confirmPinButton());
    expect(validateSpecialCredential).not.toHaveBeenCalled();

    fireEvent.change(pinInput(), { target: { value: "   " } });
    expect(confirmPinButton()).toBeDisabled();
    fireEvent.click(confirmPinButton());

    expect(screen.getByRole("dialog", { name: /view reward history/i })).toBeInTheDocument();
    expect(validateSpecialCredential).not.toHaveBeenCalled();
    expect(historyRows()).toHaveLength(3);
    expectNoMutations();
  });

  test("Confirm PIN enables for non-whitespace input, disables again when cleared, and Show/Hide preserves the PIN", () => {
    renderEngagement();

    setCustomer("CUS-A");
    clickViewHistory();
    const input = pinInput();

    expect(confirmPinButton()).toBeDisabled();
    fireEvent.change(input, { target: { value: "1357" } });
    expect(confirmPinButton()).toBeEnabled();
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("1357");

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("1357");

    fireEvent.change(input, { target: { value: "" } });
    expect(confirmPinButton()).toBeDisabled();
    expect(validateSpecialCredential).not.toHaveBeenCalled();
  });

  test("pending customer changes do not alter the active view until another correct PIN succeeds", async () => {
    renderEngagement();

    setCustomer("CUS-A");
    await authorizeSelectedCustomer();
    expect(screen.getByText("Loyalty Spark")).toBeInTheDocument();
    expect(screen.queryByText("Detail Token")).not.toBeInTheDocument();

    setCustomer("CUS-B");
    expect(screen.queryByText("Detail Token")).not.toBeInTheDocument();

    validateSpecialCredential.mockRejectedValueOnce(new Error("Incorrect admin special PIN."));
    clickViewHistory();
    fireEvent.change(pinInput(), { target: { value: "000000" } });
    await act(async () => {
      fireEvent.click(confirmPinButton());
      await Promise.resolve();
    });

    expect(await screen.findByText("Incorrect admin special PIN.")).toBeInTheDocument();
    expect(screen.getByText("Loyalty Spark")).toBeInTheDocument();
    expect(screen.queryByText("Detail Token")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    validateSpecialCredential.mockResolvedValue(true);
    await authorizeSelectedCustomer();
    expect(screen.getByText("Detail Token")).toBeInTheDocument();
    expect(screen.queryByText("Loyalty Spark")).not.toBeInTheDocument();
    expect(historyRows()).toHaveLength(1);
    expectNoMutations();
  });

  test("customer with no rewards shows the existing empty state after correct PIN without creating anything", async () => {
    renderEngagement();

    setCustomer("CUS-C");
    await authorizeSelectedCustomer();

    expect(screen.getByText("No generated rewards matched the filters.")).toBeInTheDocument();
    expect(validateSpecialCredential).toHaveBeenCalledTimes(1);
    expectNoMutations();
  });

  test("authorized customer composes with status, search, type, code, booking, milestone, and date filters", async () => {
    renderEngagement();
    setCustomer("CUS-A");
    await authorizeSelectedCustomer();

    fireEvent.change(within(historyFilters()).getByDisplayValue("All status"), { target: { value: "Claimed" } });
    expect(screen.getByText("Wash Credit")).toBeInTheDocument();
    expect(screen.queryByText("Loyalty Spark")).not.toBeInTheDocument();
    expect(screen.queryByText("Detail Token")).not.toBeInTheDocument();

    fireEvent.change(within(historyFilters()).getByPlaceholderText("Search customer, reward, booking..."), { target: { value: "Wash" } });
    fireEvent.change(within(historyFilters()).getByPlaceholderText("Reward type"), { target: { value: "Discount" } });
    fireEvent.change(within(historyFilters()).getByPlaceholderText("Reward code"), { target: { value: "WASH" } });
    fireEvent.change(within(historyFilters()).getByPlaceholderText("Booking ID"), { target: { value: "BK-A2" } });
    fireEvent.change(within(historyFilters()).getByPlaceholderText("Milestone"), { target: { value: "2" } });
    const dateInputs = historyFilters().querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: "2026-08-04" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-08-06" } });

    expect(screen.getByText("Wash Credit")).toBeInTheDocument();
    expect(historyRows()).toHaveLength(1);
    expectNoMutations();
  });

  test("repeated clicks and duplicate confirmation attempts do not duplicate rows or verification requests", async () => {
    let resolveValidation;
    validateSpecialCredential.mockImplementation(() => new Promise((resolve) => {
      resolveValidation = () => resolve(true);
    }));
    renderEngagement();

    setCustomer("CUS-A");
    clickViewHistory();
    fireEvent.change(pinInput(), { target: { value: "123456" } });
    const form = confirmPinButton().closest("form");

    fireEvent.click(confirmPinButton());
    fireEvent.submit(form);
    expect(validateSpecialCredential).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveValidation();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /view reward history/i })).not.toBeInTheDocument());
    expect(historyRows()).toHaveLength(2);

    clickViewHistory();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(historyRows()).toHaveLength(2);
    expectNoMutations();
  });

  test("modal reset clears PIN and error state after close and reopen", async () => {
    validateSpecialCredential.mockRejectedValueOnce(new Error("Incorrect admin special PIN."));
    renderEngagement();

    setCustomer("CUS-A");
    clickViewHistory();
    fireEvent.change(pinInput(), { target: { value: "000000" } });
    await act(async () => {
      fireEvent.click(confirmPinButton());
      await Promise.resolve();
    });
    expect(await screen.findByText("Incorrect admin special PIN.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "x" }));
    expect(screen.queryByRole("dialog", { name: /view reward history/i })).not.toBeInTheDocument();

    clickViewHistory();
    expect(pinInput()).toHaveValue("");
    expect(confirmPinButton()).toBeDisabled();
    expect(screen.queryByText("Incorrect admin special PIN.")).not.toBeInTheDocument();
  });
});
