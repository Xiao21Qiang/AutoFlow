import { fireEvent, render, screen, within } from "@testing-library/react";
import AdminEngagement from "./screens/admin/AdminEngagement";
import StaffMain from "./screens/staff/StaffMain";
import StaffEngagement from "./screens/staff/StaffEngagement";

const mockUseAdminData = jest.fn();
const mutationFns = {
  createPromo: jest.fn(),
  updatePromo: jest.fn(),
  updateReview: jest.fn(),
  createReward: jest.fn(),
  updateReward: jest.fn(),
  updateRewardStatus: jest.fn(),
  deleteReward: jest.fn(),
};

jest.mock("./context/AdminDataContext", () => ({
  AdminDataProvider: ({ children }) => <>{children}</>,
  useAdminData: () => mockUseAdminData(),
}));

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock("./utils/downloadExport", () => ({
  buildReportDownloadPath: (type, format) => `/reports/${type}.${format}`,
  downloadAuthenticatedFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./components/common/SecurityConfirmModal", () => (props) => {
  if (!props.open) return null;
  return <div role="dialog" aria-label={props.title || "Security confirmation"} />;
});

const generalManager = { id: "GM-1", email: "gm@example.com", name: "General Manager", userType: "Staff", role: "General Manager" };
const salesAssociate = { id: "SA-1", email: "sales@example.com", name: "Sales Associate", userType: "Staff", role: "Sales Associate" };
const admin = { id: "ADM-1", email: "admin@example.com", name: "Admin", userType: "Admin", role: "Admin" };

const baseData = {
  bookings: [],
  payments: [],
  services: [],
  stockMonitoring: [],
  quoteRequests: [],
  commissions: [],
  expenses: [],
  auditLogs: [],
  archivedAuditLogs: [],
  financialReport: { totals: {}, payments: [], expenses: [], commissions: [] },
  alerts: [],
  settings: {},
  reviews: [
    { id: "REV-1", customer: "Customer One", rating: 5, comment: "Excellent finish.", status: "Pending" },
  ],
  promos: [
    { id: "PRO-1", title: "Summer Shine", status: "Active", expiryMode: "usage", usageCount: 2, usageLimit: 10, message: "Save on detailing.", discountType: "Percentage", discountValue: 10, maxUsagePerUser: 1 },
  ],
  rewards: [
    {
      id: "RWD-1",
      name: "Loyalty Spark",
      code: "LOYALTY-SPARK",
      rewardType: "Percentage Discount",
      type: "Percentage Discount",
      description: "Ten percent loyalty reward.",
      value: "10",
      discountType: "Percentage",
      discountValue: 10,
      rarity: "Common",
      weight: 10,
      active: true,
      enabled: true,
      stock: 8,
      quantity: 8,
      expirationDays: 30,
    },
    {
      id: "RWD-2",
      name: "Ceramic Care Kit",
      code: "CERAMIC-KIT",
      rewardType: "Free Microfiber Towel",
      type: "Free Microfiber Towel",
      description: "Premium towel kit.",
      value: "Free Microfiber Towel",
      discountType: "",
      discountValue: 0,
      rarity: "Rare",
      weight: 2,
      active: false,
      enabled: false,
      stock: 3,
      quantity: 3,
      expirationDays: 14,
    },
  ],
  customerRewards: [
    { id: "CR-1", customerName: "Customer One", rewardName: "Loyalty Spark", claimCode: "CLAIM-1", status: "Available" },
  ],
  users: [{ id: "CUS-1", email: "customer@example.com", name: "Customer One", userType: "Customer", role: "New" }],
};

function setContext(currentUser = generalManager, overrides = {}) {
  mockUseAdminData.mockReturnValue({
    ...baseData,
    currentUser,
    ...mutationFns,
    ...overrides,
  });
}

function renderStaff(currentUser = generalManager) {
  setContext(currentUser);
  render(<StaffEngagement />);
}

function renderStaffMain(currentUser = salesAssociate) {
  localStorage.setItem("token", "test-token");
  localStorage.setItem("user", JSON.stringify(currentUser));
  setContext(currentUser);
  render(<StaffMain session={currentUser} />);
}

function expectNoStaffMutationControls(scope = screen) {
  [
    "Add Promo",
    "Edit",
    "Delete",
    "Add Reward",
    "Enable",
    "Disable",
    "Save",
    "Update Reward",
    "Save Reward",
    "Generate",
    "View Reward History",
  ].forEach((name) => {
    expect(scope.queryByRole("button", { name })).not.toBeInTheDocument();
  });
}

beforeEach(() => {
  Object.values(mutationFns).forEach((fn) => fn.mockReset());
  setContext();
});

test("General Manager Engagement shows Reviews, Promos, and Reward Pool as view-only without Reward History", () => {
  renderStaff(generalManager);

  expect(screen.getByText("Reviews")).toBeInTheDocument();
  expect(screen.getByText("Customer One")).toBeInTheDocument();
  expect(screen.getByText("Excellent finish.")).toBeInTheDocument();
  expect(screen.getByText("Promos")).toBeInTheDocument();
  expect(screen.getByText("Summer Shine")).toBeInTheDocument();
  expect(screen.getByText("Save on detailing.")).toBeInTheDocument();
  expect(screen.getByText("Reward Pool")).toBeInTheDocument();
  expect(screen.getByText("Loyalty Spark")).toBeInTheDocument();
  expect(screen.getByText("Ceramic Care Kit")).toBeInTheDocument();
  expect(screen.queryByText("Reward History")).not.toBeInTheDocument();
  expect(screen.queryByText("CLAIM-1")).not.toBeInTheDocument();
  expectNoStaffMutationControls();
});

test("Reward Pool details use stable reward identity and never expose mutation controls", () => {
  renderStaff(generalManager);

  fireEvent.click(screen.getAllByRole("button", { name: "View Details" })[1]);
  let dialog = screen.getByRole("dialog", { name: "Reward Details" });
  expect(within(dialog).getByText("Ceramic Care Kit")).toBeInTheDocument();
  expect(within(dialog).getByText("CERAMIC-KIT")).toBeInTheDocument();
  expect(within(dialog).getByText("Premium towel kit.")).toBeInTheDocument();
  expect(within(dialog).queryByText("Loyalty Spark")).not.toBeInTheDocument();
  expectNoStaffMutationControls(within(dialog));

  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getAllByRole("button", { name: "View Details" })[0]);
  dialog = screen.getByRole("dialog", { name: "Reward Details" });
  expect(within(dialog).getByText("Loyalty Spark")).toBeInTheDocument();
  expect(within(dialog).getByText("LOYALTY-SPARK")).toBeInTheDocument();
  expect(within(dialog).queryByText("Ceramic Care Kit")).not.toBeInTheDocument();
});

test("other Staff roles with Engagement access receive the same view-only Engagement surface", () => {
  renderStaff(salesAssociate);

  expect(screen.getByText("Reviews")).toBeInTheDocument();
  expect(screen.getByText("Promos")).toBeInTheDocument();
  expect(screen.getByText("Reward Pool")).toBeInTheDocument();
  expect(screen.queryByText("Reward History")).not.toBeInTheDocument();
  expectNoStaffMutationControls();
});

test("Sales Associate opens canonical Staff Engagement with read-only Reviews, Promos, and Reward Pool", () => {
  renderStaffMain(salesAssociate);

  fireEvent.click(screen.getAllByText("Engagement")[1]);

  expect(screen.getByText("Reviews")).toBeInTheDocument();
  expect(screen.getByText("Customer One")).toBeInTheDocument();
  expect(screen.getByText("★★★★★")).toBeInTheDocument();
  expect(screen.getByText("Excellent finish.")).toBeInTheDocument();
  expect(screen.getByText("Promos")).toBeInTheDocument();
  expect(screen.getByText("Summer Shine")).toBeInTheDocument();
  expect(screen.getByText("Used 2/10")).toBeInTheDocument();
  expect(screen.getByText("Save on detailing.")).toBeInTheDocument();
  expect(screen.getByText("Reward Pool")).toBeInTheDocument();
  expect(screen.getByText("Loyalty Spark")).toBeInTheDocument();
  expect(screen.getByText("Ceramic Care Kit")).toBeInTheDocument();
  expect(screen.queryByText("Reward History")).not.toBeInTheDocument();
  expect(screen.queryByText("CLAIM-1")).not.toBeInTheDocument();
  expectNoStaffMutationControls();
});

test("Sales Associate reward search, filters, and details stay read-only", () => {
  renderStaff(salesAssociate);

  fireEvent.change(screen.getByPlaceholderText("Search reward"), { target: { value: "ceramic" } });
  expect(screen.getByText("Ceramic Care Kit")).toBeInTheDocument();
  expect(screen.queryByText("Loyalty Spark")).not.toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText("Search reward"), { target: { value: "" } });
  const [rarityFilter, statusFilter] = screen.getAllByRole("combobox");
  fireEvent.change(rarityFilter, { target: { value: "Rare" } });
  fireEvent.change(statusFilter, { target: { value: "Disabled" } });

  expect(screen.getByText("Ceramic Care Kit")).toBeInTheDocument();
  expect(screen.queryByText("Loyalty Spark")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "View Details" }));
  const dialog = screen.getByRole("dialog", { name: "Reward Details" });
  expect(within(dialog).getByText("Ceramic Care Kit")).toBeInTheDocument();
  expect(within(dialog).getByText("CERAMIC-KIT")).toBeInTheDocument();
  expect(within(dialog).getByText("Premium towel kit.")).toBeInTheDocument();
  expect(within(dialog).getByText("Rare")).toBeInTheDocument();
  expect(within(dialog).getByText("Disabled")).toBeInTheDocument();
  expectNoStaffMutationControls(within(dialog));

  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog", { name: "Reward Details" })).not.toBeInTheDocument();
});

test("Admin Engagement keeps canonical management controls and Reward History", () => {
  setContext(admin);
  render(<AdminEngagement />);

  expect(screen.getByText("Reward Pool Management")).toBeInTheDocument();
  expect(screen.getByText("Reward History")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add Promo" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add Reward" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Edit" }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: /Enable|Disable/ }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: "Delete" }).length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: "View Reward History" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
});
