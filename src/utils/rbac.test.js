import {
  ACTION_KEYS,
  MODULE_KEYS,
  canAccessModule,
  canPerformAction,
} from "./rbac";

const admin = { userType: "Admin", role: "Admin" };
const generalManager = { userType: "Staff", role: "General Manager" };
const salesManager = { userType: "Staff", role: "Sales Manager" };
const seniorDetailer = { userType: "Staff", role: "Senior Detailer" };
const juniorDetailer = { userType: "Staff", role: "Junior Detailer" };
const customer = { userType: "Customer", role: "New" };

describe("Phase 1 permission matrix", () => {
  test("keeps service, promotion, reward, and account mutation actions admin-only", () => {
    expect(canPerformAction(admin, ACTION_KEYS.servicesManage)).toBe(true);
    expect(canPerformAction(admin, ACTION_KEYS.engagementManage)).toBe(true);
    expect(canPerformAction(admin, ACTION_KEYS.usersManageStaff)).toBe(true);
    expect(canPerformAction(admin, ACTION_KEYS.usersDelete)).toBe(true);

    for (const user of [generalManager, salesManager, seniorDetailer, juniorDetailer, customer]) {
      expect(canPerformAction(user, ACTION_KEYS.servicesManage)).toBe(false);
      expect(canPerformAction(user, ACTION_KEYS.engagementManage)).toBe(false);
      expect(canPerformAction(user, ACTION_KEYS.usersManageStaff)).toBe(false);
      expect(canPerformAction(user, ACTION_KEYS.usersDelete)).toBe(false);
    }
  });

  test("does not treat General Manager as Admin for finance and commission actions", () => {
    expect(canAccessModule(generalManager, MODULE_KEYS.financialTracker)).toBe(true);
    expect(canPerformAction(generalManager, ACTION_KEYS.paymentView)).toBe(true);
    expect(canPerformAction(generalManager, ACTION_KEYS.paymentVerify)).toBe(false);
    expect(canPerformAction(generalManager, ACTION_KEYS.bookingDelete)).toBe(false);
    expect(canPerformAction(generalManager, ACTION_KEYS.commissionViewAll)).toBe(true);
    expect(canPerformAction(generalManager, ACTION_KEYS.commissionMarkPaid)).toBe(false);
    expect(canPerformAction(generalManager, ACTION_KEYS.commissionVoid)).toBe(false);
    expect(canAccessModule(generalManager, MODULE_KEYS.userManagement)).toBe(false);
    expect(canAccessModule(generalManager, MODULE_KEYS.detailerManagement)).toBe(false);
  });

  test("preserves operational payment review only for authorized staff roles", () => {
    expect(canPerformAction(salesManager, ACTION_KEYS.paymentVerify)).toBe(true);
    expect(canPerformAction(juniorDetailer, ACTION_KEYS.paymentVerify)).toBe(false);
    expect(canPerformAction(customer, ACTION_KEYS.paymentVerify)).toBe(false);
  });
});
