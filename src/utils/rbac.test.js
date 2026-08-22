import {
  ACTION_KEYS,
  MODULE_KEYS,
  canAccessModule,
  canPerformAction,
  getAllowedModules,
  getEffectiveRole,
  isAdmin,
  isStaff,
  normalizeRole,
  normalizeUserType,
} from "./rbac";

const admin = { userType: "Admin", role: "Admin" };
const generalManager = { userType: "Staff", role: "General Manager" };
const salesManager = { userType: "Staff", role: "Sales Manager" };
const salesAssociate = { userType: "Staff", role: "Sales Associate" };
const seniorDetailer = { userType: "Staff", role: "Senior Detailer" };
const juniorDetailer = { userType: "Staff", role: "Junior Detailer" };
const marketing = { userType: "Staff", role: "Marketing" };
const customer = { userType: "Customer", role: "New" };

describe("Phase 1 permission matrix", () => {
  test("keeps service, promotion, reward, and account mutation actions admin-only", () => {
    expect(canPerformAction(admin, ACTION_KEYS.servicesManage)).toBe(true);
    expect(canPerformAction(admin, ACTION_KEYS.engagementManage)).toBe(true);
    expect(canPerformAction(admin, ACTION_KEYS.usersManageStaff)).toBe(true);
    expect(canPerformAction(admin, ACTION_KEYS.usersDelete)).toBe(true);

    for (const user of [generalManager, salesManager, salesAssociate, seniorDetailer, juniorDetailer, marketing, customer]) {
      expect(canPerformAction(user, ACTION_KEYS.servicesManage)).toBe(false);
      expect(canPerformAction(user, ACTION_KEYS.engagementManage)).toBe(false);
      expect(canPerformAction(user, ACTION_KEYS.usersManageStaff)).toBe(false);
      expect(canPerformAction(user, ACTION_KEYS.usersDelete)).toBe(false);
    }
  });

  test("keeps Engagement management Admin-only while Staff roles may view assigned Engagement modules", () => {
    expect(canPerformAction(admin, ACTION_KEYS.engagementManage)).toBe(true);
    for (const user of [generalManager, salesManager, salesAssociate, marketing]) {
      expect(canAccessModule(user, MODULE_KEYS.engagement)).toBe(true);
      expect(canPerformAction(user, ACTION_KEYS.engagementView)).toBe(true);
      expect(canPerformAction(user, ACTION_KEYS.engagementManage)).toBe(false);
    }
  });

  test("gives General Manager payment review without Admin-only finance and commission actions", () => {
    expect(canAccessModule(generalManager, MODULE_KEYS.financialTracker)).toBe(true);
    expect(canPerformAction(generalManager, ACTION_KEYS.paymentView)).toBe(true);
    expect(canPerformAction(generalManager, ACTION_KEYS.paymentVerify)).toBe(true);
    expect(canPerformAction(generalManager, ACTION_KEYS.bookingDelete)).toBe(false);
    expect(canPerformAction(generalManager, ACTION_KEYS.commissionViewAll)).toBe(true);
    expect(canPerformAction(generalManager, ACTION_KEYS.commissionMarkPaid)).toBe(false);
    expect(canPerformAction(generalManager, ACTION_KEYS.commissionVoid)).toBe(false);
    expect(canAccessModule(generalManager, MODULE_KEYS.userManagement)).toBe(false);
    expect(canAccessModule(generalManager, MODULE_KEYS.detailerManagement)).toBe(false);
  });

  test("preserves operational payment review only for authorized staff roles", () => {
    expect(canPerformAction(salesManager, ACTION_KEYS.paymentVerify)).toBe(true);
    expect(canPerformAction(salesAssociate, ACTION_KEYS.paymentVerify)).toBe(true);
    expect(canPerformAction(juniorDetailer, ACTION_KEYS.paymentVerify)).toBe(false);
    expect(canPerformAction(customer, ACTION_KEYS.paymentVerify)).toBe(false);
  });

  test("keeps Sales Manager Service Tracking view-only at the capability layer", () => {
    expect(normalizeRole({ role: "  Sales   Manager  " })).toBe("sales manager");
    expect(normalizeUserType({ userType: "Staff", role: "Sales Manager" })).toBe("staff");
    expect(isStaff(salesManager)).toBe(true);
    expect(isAdmin(salesManager)).toBe(false);
    expect(canAccessModule(salesManager, MODULE_KEYS.serviceTracking)).toBe(true);
    expect(canPerformAction(salesManager, ACTION_KEYS.trackingView)).toBe(true);
    expect(canPerformAction(salesManager, ACTION_KEYS.trackingUpdateIssueNotes)).toBe(false);
    expect(canPerformAction(salesManager, ACTION_KEYS.trackingUpdateWarranty)).toBe(false);
    expect(canPerformAction(salesManager, ACTION_KEYS.trackingComplete)).toBe(false);
  });

  test("recognizes Sales Associate as Staff using the canonical normalized role", () => {
    expect(normalizeRole({ role: "  Sales   Associate  " })).toBe("sales associate");
    expect(normalizeUserType({ userType: "Staff", role: "Sales Associate" })).toBe("staff");
    expect(getEffectiveRole(salesAssociate)).toBe("sales associate");
    expect(isStaff(salesAssociate)).toBe(true);
    expect(isAdmin(salesAssociate)).toBe(false);
  });

  test("limits Sales Associate modules to the approved eight-module set", () => {
    expect(getAllowedModules(salesAssociate)).toEqual([
      MODULE_KEYS.dashboard,
      MODULE_KEYS.analytics,
      MODULE_KEYS.bookings,
      MODULE_KEYS.services,
      MODULE_KEYS.serviceTracking,
      MODULE_KEYS.paymentTracking,
      MODULE_KEYS.engagement,
      MODULE_KEYS.profile,
    ]);

    for (const moduleKey of [
      MODULE_KEYS.userManagement,
      MODULE_KEYS.detailerManagement,
      MODULE_KEYS.stockMonitoring,
      MODULE_KEYS.financialTracker,
      MODULE_KEYS.auditLogs,
      MODULE_KEYS.settings,
      MODULE_KEYS.myWork,
    ]) {
      expect(canAccessModule(salesAssociate, moduleKey)).toBe(false);
    }
  });

  test("gives Sales Associate GM-equivalent allowed-module actions while preserving explicit denials", () => {
    for (const actionKey of [
      ACTION_KEYS.bookingView,
      ACTION_KEYS.bookingCreate,
      ACTION_KEYS.bookingUpdate,
      ACTION_KEYS.bookingUpdateStatus,
      ACTION_KEYS.trackingView,
      ACTION_KEYS.trackingUpdateIssueNotes,
      ACTION_KEYS.trackingUpdateWarranty,
      ACTION_KEYS.trackingComplete,
      ACTION_KEYS.paymentView,
      ACTION_KEYS.paymentVerify,
      ACTION_KEYS.engagementView,
    ]) {
      expect(canPerformAction(salesAssociate, actionKey)).toBe(true);
    }

    for (const actionKey of [
      ACTION_KEYS.bookingDelete,
      ACTION_KEYS.servicesManage,
      ACTION_KEYS.engagementManage,
      ACTION_KEYS.auditViewAll,
      ACTION_KEYS.usersViewStaff,
      ACTION_KEYS.usersManageStaff,
      ACTION_KEYS.settingsManageSecurity,
      ACTION_KEYS.settingsManageDownPayment,
      ACTION_KEYS.stockView,
      ACTION_KEYS.commissionViewAll,
      ACTION_KEYS.commissionMarkPaid,
    ]) {
      expect(canPerformAction(salesAssociate, actionKey)).toBe(false);
    }
  });
});
