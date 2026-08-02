import { fireEvent, render, screen, within } from "@testing-library/react";
import AdminEngagement from "./screens/admin/AdminEngagement";

const mockCreatePromo = jest.fn();
const mockUpdatePromo = jest.fn();
const mockUpdateReview = jest.fn();
const mockCreateReward = jest.fn();
const mockUpdateReward = jest.fn();
const mockUpdateRewardStatus = jest.fn();
const mockDeleteReward = jest.fn();
const mockSecurityConfirmModal = jest.fn(() => null);

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
  }),
}));

jest.mock("./components/common/SecurityConfirmModal", () => (props) => mockSecurityConfirmModal(props));

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
    mockSecurityConfirmModal,
  ].forEach((mock) => mock.mockClear());
});

describe("Reward History customer viewer", () => {
  test("labels the customer action as View Reward History and starts genuinely disabled", () => {
    renderEngagement();

    expect(screen.getByRole("button", { name: "View Reward History" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Generate" })).not.toBeInTheDocument();
  });

  test("selecting a customer enables the button and filters history by stable customer ID only after clicking", () => {
    renderEngagement();

    expect(screen.getByText("Detail Token")).toBeInTheDocument();
    setCustomer("CUS-A");
    expect(screen.getByRole("button", { name: "View Reward History" })).toBeEnabled();
    clickViewHistory();

    expect(screen.getByText("Loyalty Spark")).toBeInTheDocument();
    expect(screen.getByText("Wash Credit")).toBeInTheDocument();
    expect(screen.queryByText("Detail Token")).not.toBeInTheDocument();
    expect(historyRows()).toHaveLength(2);
  });

  test("customer with no rewards shows the existing empty state without opening PIN or mutating data", () => {
    renderEngagement();

    setCustomer("CUS-C");
    clickViewHistory();

    expect(screen.getByText("No generated rewards matched the filters.")).toBeInTheDocument();
    expect(mockSecurityConfirmModal.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ open: false }));
    expect(mockCreateReward).not.toHaveBeenCalled();
    expect(mockUpdateReward).not.toHaveBeenCalled();
    expect(mockUpdateRewardStatus).not.toHaveBeenCalled();
    expect(mockDeleteReward).not.toHaveBeenCalled();
  });

  test("selected customer composes with status, search, type, code, booking, milestone, and date filters", () => {
    renderEngagement();
    setCustomer("CUS-A");
    clickViewHistory();

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
  });

  test("switching and clearing customers updates the applied history filter without duplicating rows", () => {
    renderEngagement();

    setCustomer("CUS-A");
    clickViewHistory();
    clickViewHistory();
    expect(historyRows()).toHaveLength(2);

    setCustomer("CUS-B");
    clickViewHistory();
    expect(screen.getByText("Detail Token")).toBeInTheDocument();
    expect(screen.queryByText("Loyalty Spark")).not.toBeInTheDocument();
    expect(historyRows()).toHaveLength(1);

    setCustomer("");
    expect(screen.getByRole("button", { name: "View Reward History" })).toBeDisabled();
    expect(screen.getByText("Loyalty Spark")).toBeInTheDocument();
    expect(screen.getByText("Wash Credit")).toBeInTheDocument();
    expect(screen.getByText("Detail Token")).toBeInTheDocument();
  });
});
