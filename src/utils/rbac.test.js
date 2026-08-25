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
const inventoryClerk = { userType: "Staff", role: "Inventory Clerk" };
const seniorDetailer = { userType: "Staff", role: "Senior Detailer" };
const juniorDetailer = { userType: "Staff", role: "Junior Detailer" };
const marketing = { userType: "Staff", role: "Marketing" };
const customer = { userType: "Customer", role: "New" };

describe("Phase 1 permission matrix", () => {
  test("keeps service and account mutation actions admin-only while Marketing alone gets Engagement management", () => {
    expect(canPerformAction(admin, ACTION_KEYS.servicesManage)).toBe(true);
    expect(canPerformAction(admin, ACTION_KEYS.engagementManage)).toBe(true);
    expect(canPerformAction(admin, ACTION_KEYS.usersManageStaff)).toBe(true);
    expect(canPerformAction(admin, ACTION_KEYS.usersDelete)).toBe(true);
    expect(canPerformAction(marketing, ACTION_KEYS.engagementManage)).toBe(true);

    for (const user of [generalManager, salesManager, salesAssociate, seniorDetailer, juniorDetailer, marketing, customer]) {
      expect(canPerformAction(user, ACTION_KEYS.servicesManage)).toBe(false);
      expect(canPerformAction(user, ACTION_KEYS.usersManageStaff)).toBe(false);
      expect(canPerformAction(user, ACTION_KEYS.usersDelete)).toBe(false);
    }
    for (const user of [generalManager, salesManager, salesAssociate, seniorDetailer, juniorDetailer, customer]) {
      expect(canPerformAction(user, ACTION_KEYS.engagementManage)).toBe(false);
    }
  });

  test("keeps Engagement management limited to Admin and Marketing while other Staff roles remain view-only", () => {
    expect(canPerformAction(admin, ACTION_KEYS.engagementManage)).toBe(true);
    for (const user of [generalManager, salesManager, salesAssociate, marketing]) {
      expect(canAccessModule(user, MODULE_KEYS.engagement)).toBe(true);
      expect(canPerformAction(user, ACTION_KEYS.engagementView)).toBe(true);
    }
    expect(canPerformAction(marketing, ACTION_KEYS.engagementManage)).toBe(true);
    for (const user of [generalManager, salesManager, salesAssociate]) {
      expect(canPerformAction(user, ACTION_KEYS.engagementManage)).toBe(false);
    }
  });

  test("recognizes Marketing as Staff with exactly the approved five modules", () => {
    expect(normalizeRole({ role: "  Marketing  " })).toBe("marketing");
    expect(normalizeUserType(marketing)).toBe("staff");
    expect(getEffectiveRole(marketing)).toBe("marketing");
    expect(getAllowedModules(marketing)).toEqual([
      MODULE_KEYS.dashboard,
      MODULE_KEYS.analytics,
      MODULE_KEYS.services,
      MODULE_KEYS.engagement,
      MODULE_KEYS.profile,
    ]);

    for (const moduleKey of [
      MODULE_KEYS.auditLogs,
      MODULE_KEYS.bookings,
      MODULE_KEYS.serviceTracking,
      MODULE_KEYS.stockMonitoring,
      MODULE_KEYS.paymentTracking,
      MODULE_KEYS.financialTracker,
      MODULE_KEYS.userManagement,
      MODULE_KEYS.detailerManagement,
      MODULE_KEYS.myWork,
      MODULE_KEYS.settings,
    ]) {
      expect(canAccessModule(marketing, moduleKey)).toBe(false);
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
    expect(canPerformAction(generalManager, ACTION_KEYS.stockCreate)).toBe(true);
    expect(canAccessModule(generalManager, MODULE_KEYS.userManagement)).toBe(false);
    expect(canAccessModule(generalManager, MODULE_KEYS.detailerManagement)).toBe(false);
  });

  test("gives Senior Detailer exactly four modules with General Manager Bookings and Service Tracking actions", () => {
    expect(getAllowedModules(seniorDetailer)).toEqual([
      MODULE_KEYS.myWork,
      MODULE_KEYS.bookings,
      MODULE_KEYS.serviceTracking,
      MODULE_KEYS.profile,
    ]);

    for (const actionKey of [
      ACTION_KEYS.bookingView,
      ACTION_KEYS.bookingCreate,
      ACTION_KEYS.bookingUpdate,
      ACTION_KEYS.bookingReassignDetailer,
      ACTION_KEYS.detailerReassign,
      ACTION_KEYS.bookingUpdateStatus,
      ACTION_KEYS.trackingView,
      ACTION_KEYS.trackingUpdateIssueNotes,
      ACTION_KEYS.trackingUpdateWarranty,
      ACTION_KEYS.trackingComplete,
      ACTION_KEYS.commissionViewOwn,
      ACTION_KEYS.commissionPrint,
      ACTION_KEYS.commissionExport,
    ]) {
      expect(canPerformAction(seniorDetailer, actionKey)).toBe(true);
    }

    for (const actionKey of [
      ACTION_KEYS.bookingDelete,
      ACTION_KEYS.paymentView,
      ACTION_KEYS.paymentVerify,
      ACTION_KEYS.stockView,
      ACTION_KEYS.stockCreate,
      ACTION_KEYS.stockManage,
      ACTION_KEYS.engagementView,
      ACTION_KEYS.engagementManage,
      ACTION_KEYS.commissionViewAll,
      ACTION_KEYS.commissionMarkPaid,
      ACTION_KEYS.commissionVoid,
      ACTION_KEYS.usersManageStaff,
      ACTION_KEYS.settingsManageSecurity,
      ACTION_KEYS.settingsManageDownPayment,
    ]) {
      expect(canPerformAction(seniorDetailer, actionKey)).toBe(false);
    }
  });

  test("gives Junior Detailer exactly four modules with Bookings parity and assignment-scoped tracking actions", () => {
    expect(getAllowedModules(juniorDetailer)).toEqual([
      MODULE_KEYS.myWork,
      MODULE_KEYS.bookings,
      MODULE_KEYS.serviceTracking,
      MODULE_KEYS.profile,
    ]);

    for (const actionKey of [
      ACTION_KEYS.bookingView,
      ACTION_KEYS.bookingCreate,
      ACTION_KEYS.bookingUpdate,
      ACTION_KEYS.bookingReassignDetailer,
      ACTION_KEYS.detailerReassign,
      ACTION_KEYS.bookingUpdateStatus,
      ACTION_KEYS.trackingView,
      ACTION_KEYS.trackingUpdateIssueNotes,
      ACTION_KEYS.trackingUpdateWarranty,
      ACTION_KEYS.trackingComplete,
      ACTION_KEYS.commissionViewOwn,
      ACTION_KEYS.commissionPrint,
      ACTION_KEYS.commissionExport,
    ]) {
      expect(canPerformAction(juniorDetailer, actionKey)).toBe(true);
    }

    for (const actionKey of [
      ACTION_KEYS.bookingDelete,
      ACTION_KEYS.paymentView,
      ACTION_KEYS.paymentVerify,
      ACTION_KEYS.stockView,
      ACTION_KEYS.stockCreate,
      ACTION_KEYS.stockManage,
      ACTION_KEYS.engagementView,
      ACTION_KEYS.engagementManage,
      ACTION_KEYS.commissionViewAll,
      ACTION_KEYS.commissionMarkPaid,
      ACTION_KEYS.commissionVoid,
      ACTION_KEYS.usersManageStaff,
      ACTION_KEYS.settingsManageSecurity,
      ACTION_KEYS.settingsManageDownPayment,
    ]) {
      expect(canPerformAction(juniorDetailer, actionKey)).toBe(false);
    }
  });

  test("limits Inventory Clerk to the exact six approved modules", () => {
    expect(normalizeRole({ role: "  Inventory   Clerk  " })).toBe("inventory clerk");
    expect(normalizeUserType(inventoryClerk)).toBe("staff");
    expect(getEffectiveRole(inventoryClerk)).toBe("inventory clerk");
    expect(getAllowedModules(inventoryClerk)).toEqual([
      MODULE_KEYS.dashboard,
      MODULE_KEYS.bookings,
      MODULE_KEYS.stockMonitoring,
      MODULE_KEYS.serviceTracking,
      MODULE_KEYS.auditLogs,
      MODULE_KEYS.profile,
    ]);

    for (const moduleKey of [
      MODULE_KEYS.analytics,
      MODULE_KEYS.services,
      MODULE_KEYS.paymentTracking,
      MODULE_KEYS.financialTracker,
      MODULE_KEYS.engagement,
      MODULE_KEYS.userManagement,
      MODULE_KEYS.detailerManagement,
      MODULE_KEYS.myWork,
      MODULE_KEYS.settings,
    ]) {
      expect(canAccessModule(inventoryClerk, moduleKey)).toBe(false);
    }
  });

  test("gives Inventory Clerk Bookings, audit read, tracking view, and full stock monitoring actions", () => {
    for (const actionKey of [
      ACTION_KEYS.bookingView,
      ACTION_KEYS.bookingCreate,
      ACTION_KEYS.bookingUpdate,
      ACTION_KEYS.bookingUpdateStatus,
      ACTION_KEYS.trackingView,
      ACTION_KEYS.stockView,
      ACTION_KEYS.stockCreate,
      ACTION_KEYS.stockManage,
      ACTION_KEYS.auditViewOperational,
    ]) {
      expect(canPerformAction(inventoryClerk, actionKey)).toBe(true);
    }

    for (const actionKey of [
      ACTION_KEYS.trackingUpdateIssueNotes,
      ACTION_KEYS.trackingUpdateWarranty,
      ACTION_KEYS.trackingComplete,
      ACTION_KEYS.paymentView,
      ACTION_KEYS.paymentVerify,
      ACTION_KEYS.engagementView,
      ACTION_KEYS.engagementManage,
      ACTION_KEYS.usersManageStaff,
      ACTION_KEYS.settingsManageSecurity,
      ACTION_KEYS.settingsManageDownPayment,
    ]) {
      expect(canPerformAction(inventoryClerk, actionKey)).toBe(false);
    }
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

  test("limits Sales Associate modules to the approved six-module set without Analytics or Service Tracking", () => {
    expect(getAllowedModules(salesAssociate)).toEqual([
      MODULE_KEYS.dashboard,
      MODULE_KEYS.bookings,
      MODULE_KEYS.services,
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
      MODULE_KEYS.analytics,
      MODULE_KEYS.serviceTracking,
      MODULE_KEYS.settings,
      MODULE_KEYS.myWork,
    ]) {
      expect(canAccessModule(salesAssociate, moduleKey)).toBe(false);
    }
  });

  test("gives Sales Associate approved booking, payment, and engagement actions while denying Tracking", () => {
    for (const actionKey of [
      ACTION_KEYS.bookingView,
      ACTION_KEYS.bookingCreate,
      ACTION_KEYS.bookingUpdate,
      ACTION_KEYS.bookingUpdateStatus,
      ACTION_KEYS.paymentView,
      ACTION_KEYS.paymentVerify,
      ACTION_KEYS.engagementView,
    ]) {
      expect(canPerformAction(salesAssociate, actionKey)).toBe(true);
    }

    for (const actionKey of [
      ACTION_KEYS.bookingDelete,
      ACTION_KEYS.bookingReassignDetailer,
      ACTION_KEYS.detailerReassign,
      ACTION_KEYS.trackingView,
      ACTION_KEYS.trackingUpdateIssueNotes,
      ACTION_KEYS.trackingUpdateWarranty,
      ACTION_KEYS.trackingComplete,
      ACTION_KEYS.servicesManage,
      ACTION_KEYS.engagementManage,
      ACTION_KEYS.auditViewAll,
      ACTION_KEYS.usersViewStaff,
      ACTION_KEYS.usersManageStaff,
      ACTION_KEYS.settingsManageSecurity,
      ACTION_KEYS.settingsManageDownPayment,
      ACTION_KEYS.stockView,
      ACTION_KEYS.stockCreate,
      ACTION_KEYS.commissionViewAll,
      ACTION_KEYS.commissionMarkPaid,
    ]) {
      expect(canPerformAction(salesAssociate, actionKey)).toBe(false);
    }
  });
});
