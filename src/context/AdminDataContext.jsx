import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../services/api";
import { isValidStaffRole, normalizeStaffRole } from "../utils/staffRoles";

const AdminDataContext = createContext(null);

const INITIAL_DATA = {
  bookings: [],
  services: [],
  stockMonitoring: [],
  payments: [],
  users: [],
  auditLogs: [],
  archivedAuditLogs: [],
  reviews: [],
  promos: [],
  quoteRequests: [],
  expenses: [],
  commissions: [],
  rewards: [],
  customerRewards: [],
  alerts: [],
  summary: {},
};

function normalizeUserType(userType, role) {
  const normalizedUserType = String(userType || "").trim().toLowerCase();
  if (["admin", "staff", "customer"].includes(normalizedUserType)) {
    return normalizedUserType;
  }

  const normalizedRole = normalizeStaffRole(role);
  if (["owner", "co-owner", "admin"].includes(normalizedRole)) return "admin";
  if (
    ["mechanic", "inspector", "coordinator", "staff", "detailer", "technician", "employee", "manager", "senior staff", "junior staff"].includes(normalizedRole) ||
    (isValidStaffRole(normalizedRole) && normalizedRole !== "admin")
  ) {
    return "staff";
  }
  return "customer";
}

function buildNotificationMessage(log) {
  const actor = log.userId || "System";
  const target = log.targetId ? ` (${log.targetId})` : "";
  return `${actor} ${String(log.action || "").toLowerCase()}${target}`;
}

function mapAuditLogToNotification(log) {
  return {
    id: log.id,
    title: log.action || "System update",
    message: buildNotificationMessage(log),
    userId: log.userId || "system",
    targetId: log.targetId || "",
    createdAt: log.createdAt || "",
    ts: log.ts || "",
    meta: log.meta || {},
  };
}

const PAYMENT_NOTIFICATION_TITLES = new Set([
  "Updated payment status",
  "Submitted payment proof",
  "Updated payment proof",
  "Updated payment method",
  "Updated payment",
  "Payment details requested",
]);

const STOCK_NOTIFICATION_TITLES = new Set([
  "Created stock monitoring item",
  "Updated stock monitoring item",
  "Restocked stock monitoring item",
  "Deleted stock monitoring item",
]);

const BOOKING_NOTIFICATION_TITLES = new Set([
  "Created booking",
  "Updated booking status",
]);

const TRACKING_NOTIFICATION_TITLES = new Set([
  "Updated service tracking",
]);

function isPaymentNotification(item) {
  return PAYMENT_NOTIFICATION_TITLES.has(item.title);
}

function isStockNotification(item) {
  return STOCK_NOTIFICATION_TITLES.has(item.title);
}

function isBookingStatusNotification(item) {
  return BOOKING_NOTIFICATION_TITLES.has(item.title);
}

function isTrackingNotification(item) {
  return TRACKING_NOTIFICATION_TITLES.has(item.title);
}

function isEssentialNotification(item) {
  return (
    isPaymentNotification(item) ||
    isStockNotification(item) ||
    isBookingStatusNotification(item) ||
    isTrackingNotification(item)
  );
}

function isCustomerRelatedNotification(item, email, fullName) {
  return (
    String(item.userId || "").trim().toLowerCase() === email ||
    String(item.meta?.email || "").trim().toLowerCase() === email ||
    String(item.meta?.customerEmail || "").trim().toLowerCase() === email ||
    String(item.meta?.customer || "").trim().toLowerCase() === fullName ||
    String(item.meta?.customer || "").trim().toLowerCase() === fullName
  );
}

function isSelfAuthoredNotification(item, email, fullName) {
  const actor = String(item.userId || "").trim().toLowerCase();
  if (!actor) return false;
  if (email && actor === email) return true;
  if (fullName && actor === fullName) return true;
  return false;
}

function mapAlertsToNotifications(alerts, role) {
  if (role === "customer") return [];

  return (alerts || [])
    .filter((alert) => String(alert.title || "").toLowerCase().includes("low stock"))
    .map((alert, index) => ({
      id: `alert-low-stock-${index}-${String(alert.description || "").trim()}`,
      title: alert.title || "Stock alert",
      message: alert.description || "Stock monitoring needs attention.",
      userId: "system",
      targetId: "stock-monitoring",
      createdAt: "",
      ts: "System alert",
      meta: { type: "stock-alert" },
    }));
}

function filterNotificationsForUser(auditLogs, alerts, currentUser) {
  const role = normalizeUserType(currentUser?.userType, currentUser?.role);
  const email = String(currentUser?.email || "").trim().toLowerCase();
  const fullName = String(currentUser?.name || "").trim().toLowerCase();

  const essentialAuditNotifications = auditLogs
    .map(mapAuditLogToNotification)
    .filter((item) => {
      if (!isEssentialNotification(item)) {
        return false;
      }

      if (isSelfAuthoredNotification(item, email, fullName)) {
        return false;
      }

      if (role === "admin") {
        return true;
      }

      if (role === "staff") {
        return true;
      }

      if (isStockNotification(item)) {
        return false;
      }

      return isCustomerRelatedNotification(item, email, fullName);
    })
    .slice(0, 20);

  return [...mapAlertsToNotifications(alerts, role), ...essentialAuditNotifications].slice(0, 20);
}

function decorateNotificationsWithUnread(items, lastReadNotificationId) {
  if (!items.length) return [];

  let unreadUntilIndex = 0;
  if (lastReadNotificationId) {
    const readIndex = items.findIndex((item) => item.id === lastReadNotificationId);
    unreadUntilIndex = readIndex === -1 ? items.length : readIndex;
  }

  return items.map((item, index) => ({
    ...item,
    isUnread: index < unreadUntilIndex,
  }));
}

function requestFinancialInterpretation(payload) {
  return apiRequest("/api/admin/financials/interpretation", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

function requestAnalyticsInterpretation(payload) {
  return apiRequest("/api/ai/analytics/interpret", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

function requestTrackingIssueNote(payload) {
  return apiRequest("/api/ai/tracking/issue-note", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

function requestPasswordChangeOtp(payload) {
  return apiRequest("/api/auth/password-change/request-otp", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

function verifyPasswordChangeOtp(payload) {
  return apiRequest("/api/auth/password-change/verify-otp", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

function resetPasswordWithOtp(payload) {
  return apiRequest("/api/auth/password-change/reset", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export function AdminDataProvider({ children, session }) {
  const [data, setData] = useState(INITIAL_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== "undefined" && "Notification" in window ? window.Notification.permission : "unsupported"
  );
  const [lastReadNotificationId, setLastReadNotificationId] = useState("");
  const notificationsBootstrappedRef = useRef(false);
  const previousNotificationIdsRef = useRef([]);

  const auditUser = session?.email || session?.name || "admin@allprotec.com";
  const currentRole = normalizeUserType(session?.userType, session?.role);
  const notificationStorageKey = useMemo(
    () => `autoflow:last-read-notification:${String(session?.email || currentRole || "guest").toLowerCase()}`,
    [session?.email, currentRole]
  );

  useEffect(() => {
    setLastReadNotificationId(localStorage.getItem(notificationStorageKey) || "");
  }, [notificationStorageKey]);

  const currentUserFallback = useMemo(
    () => ({
      id: "LOCAL-ADMIN",
      name: session?.name || "Admin",
      first: session?.first || session?.firstName || "Admin",
      last: session?.last || session?.lastName || "",
      email: session?.email || "admin@allprotec.com",
      phone: session?.phone || "",
      userType: session?.userType || normalizeUserType(session?.userType, session?.role || "Admin"),
      role: session?.role || "Admin",
      status: "active",
      cars: Array.isArray(session?.cars) ? session.cars : [],
    }),
    [session]
  );

  const visibleNotifications = useMemo(() => {
    const foundUser = data.users.find((user) => user.email === session?.email);
    const items = filterNotificationsForUser(data.auditLogs || [], data.alerts || [], foundUser || currentUserFallback);
    return decorateNotificationsWithUnread(items, lastReadNotificationId);
  }, [data.alerts, data.auditLogs, data.users, session?.email, currentUserFallback, lastReadNotificationId]);

  const unreadCount = useMemo(() => {
    if (!visibleNotifications.length) return 0;
    if (!lastReadNotificationId) return 0;
    const readIndex = visibleNotifications.findIndex((item) => item.id === lastReadNotificationId);
    if (readIndex === -1) return visibleNotifications.length;
    return readIndex;
  }, [visibleNotifications, lastReadNotificationId]);

  useEffect(() => {
    if (!visibleNotifications.length) return;

    const currentIds = visibleNotifications.map((item) => item.id);
    if (!notificationsBootstrappedRef.current) {
      notificationsBootstrappedRef.current = true;
      previousNotificationIdsRef.current = currentIds;
      if (!localStorage.getItem(notificationStorageKey)) {
        const newestId = visibleNotifications[0]?.id || "";
        if (newestId) {
          localStorage.setItem(notificationStorageKey, newestId);
          setLastReadNotificationId(newestId);
        }
      }
      return;
    }

    const previousIds = previousNotificationIdsRef.current;
    const newItems = visibleNotifications.filter((item) => !previousIds.includes(item.id));
    previousNotificationIdsRef.current = currentIds;

    if (!newItems.length) return;

    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      window.Notification.permission === "granted"
    ) {
      newItems
        .filter((item) => String(item.userId || "").trim().toLowerCase() !== String(session?.email || "").trim().toLowerCase())
        .slice(0, 3)
        .forEach((item) => {
          new window.Notification(item.title, {
            body: item.message,
          });
        });
    }
  }, [visibleNotifications, notificationStorageKey, session?.email]);

  const loadAdminData = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const payload = await apiRequest("/api/admin/bootstrap");
      setData({ ...INITIAL_DATA, ...payload });
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load admin data.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadAdminData();

    const refreshFromDatabase = () => {
      loadAdminData({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshFromDatabase();
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        refreshFromDatabase();
      }
    }, 15000);

    window.addEventListener("focus", refreshFromDatabase);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshFromDatabase);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const mutate = async (path, options = {}) => {
    const result = await apiRequest(path, options);
    await loadAdminData();
    return result;
  };

  const currentUser = useMemo(() => {
    const foundUser = data.users.find((user) => user.email === session?.email);
    if (foundUser) return foundUser;
    return currentUserFallback;
  }, [data.users, session, currentUserFallback]);

  const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return "unsupported";
    }

    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
    return permission;
  };

  const markNotificationsRead = () => {
    const newestId = visibleNotifications[0]?.id || "";
    if (!newestId) return;
    localStorage.setItem(notificationStorageKey, newestId);
    setLastReadNotificationId(newestId);
  };

  const updateProfile = async (payload) => {
    await mutate("/api/admin/users/" + currentUser.id, {
      method: "PUT",
      body: JSON.stringify({
        ...currentUser,
        ...payload,
        auditUser,
      }),
    });

    const nextUser = {
      ...JSON.parse(localStorage.getItem("user") || "{}"),
      name: payload.name || (String(payload.first || "") + " " + String(payload.last || "")).trim() || currentUser.name,
      email: payload.email || currentUser.email,
      first: payload.first || currentUser.first,
      last: payload.last || currentUser.last,
      phone: payload.phone || currentUser.phone,
      userType: currentUser.userType || session?.userType || normalizeUserType(currentUser.userType, currentUser.role),
      role: payload.role || currentUser.role || session?.role || "New",
      cars: Array.isArray(payload.cars) ? payload.cars : Array.isArray(currentUser.cars) ? currentUser.cars : [],
    };
    localStorage.setItem("user", JSON.stringify(nextUser));
  };

  const value = {
    ...data,
    currentUser,
    notifications: visibleNotifications,
    unreadNotificationCount: unreadCount,
    notificationPermission,
    requestNotificationPermission,
    markNotificationsRead,
    loading,
    error,
    reload: loadAdminData,
    createBooking: (payload) => mutate("/api/admin/bookings", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        auditUser,
        actorUserType: currentUser?.userType || session?.userType || currentRole,
        actorRole: currentUser?.role || session?.role || "",
      }),
    }),
    updateBooking: (id, payload) => mutate("/api/admin/bookings/" + id, { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) }),
    deleteBooking: (id, payload = {}) =>
      mutate("/api/admin/bookings/" + id, {
        method: "DELETE",
        body: JSON.stringify({ ...payload, auditUser }),
      }),
    createService: (payload) => mutate("/api/admin/services", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    updateService: (id, payload) => mutate("/api/admin/services/" + id, { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) }),
    toggleService: (service) => mutate("/api/admin/services/" + service.id, { method: "PUT", body: JSON.stringify({ ...service, enabled: !service.enabled, auditUser }) }),
    deleteService: (id) =>
      mutate("/api/admin/services/" + id, {
        method: "DELETE",
        body: JSON.stringify({ auditUser }),
      }),
    createStockMonitoringItem: (payload) => mutate("/api/admin/stock-monitoring", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    updateStockMonitoringItem: (id, payload) => mutate("/api/admin/stock-monitoring/" + id, { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) }),
    restockStockMonitoringItem: (id, payload) => mutate("/api/admin/stock-monitoring/" + id + "/restock", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    deleteStockMonitoringItem: (id, payload = {}) =>
      mutate("/api/admin/stock-monitoring/" + id, {
        method: "DELETE",
        body: JSON.stringify({ ...payload, auditUser }),
      }),
    updatePayment: (id, payload) => mutate("/api/admin/payments/" + id, { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) }),
    markPaymentPaid: (payment) => mutate("/api/admin/payments/" + payment.id, { method: "PUT", body: JSON.stringify({ ...payment, status: "Paid", auditUser }) }),
    submitPaymentProof: (payment, payload) =>
      mutate("/api/admin/payments/" + payment.id, {
        method: "PUT",
        body: JSON.stringify({
          ...payload,
          downPaymentStatus: "For Verification",
          status: "For Verification",
          proofSubmittedAt: new Date().toISOString(),
          auditUser,
        }),
      }),
    updateUser: (id, payload) => mutate("/api/admin/users/" + id, { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) }),
    createEmployeeAccount: (payload) => mutate("/api/admin/users/staff", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    toggleUserStatus: (user) => mutate("/api/admin/users/" + user.id, { method: "PUT", body: JSON.stringify({ ...user, status: user.status === "active" ? "inactive" : "active", auditUser }) }),
    deleteUser: (id) => mutate("/api/admin/users/" + id + "?auditUser=" + encodeURIComponent(auditUser), { method: "DELETE" }),
    archiveAuditLogs: () =>
      mutate("/api/admin/audit-logs/archive", {
        method: "POST",
        body: JSON.stringify({ auditUser }),
      }),
    unarchiveAuditLogs: () =>
      mutate("/api/admin/audit-logs/unarchive", {
        method: "POST",
        body: JSON.stringify({ auditUser }),
      }),
    createReview: (payload) => mutate("/api/admin/reviews", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    createPromo: (payload) => mutate("/api/admin/promos", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    updatePromo: (id, payload) => mutate("/api/admin/promos/" + id, { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) }),
    updateQuoteRequest: (id, payload) => mutate("/api/admin/quote-requests/" + id, { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) }),
    usePromo: (promoId) =>
      mutate("/api/admin/promos/" + promoId + "/use", {
        method: "POST",
        body: JSON.stringify({ auditUser }),
      }),
    createExpense: (payload) => mutate("/api/admin/expenses", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    createCommission: (payload) => mutate("/api/admin/commissions", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    createReward: (payload) => mutate("/api/admin/rewards", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    updateReward: (id, payload) => mutate("/api/admin/rewards/" + id, { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) }),
    deleteReward: (id) => mutate("/api/admin/rewards/" + id, { method: "DELETE", body: JSON.stringify({ auditUser }) }),
    generateCustomerReward: (payload) => mutate("/api/admin/rewards/generate", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    generateAnalyticsInterpretation: requestAnalyticsInterpretation,
    generateTrackingIssueNote: requestTrackingIssueNote,
    generateFinancialInterpretation: requestFinancialInterpretation,
    requestPasswordChangeOtp,
    verifyPasswordChangeOtp,
    resetPasswordWithOtp,
    updateProfile,
    updatePassword: (password) => updateProfile({ password }),
  };

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>;
}

export function useAdminData() {
  const context = useContext(AdminDataContext);
  if (!context) {
    throw new Error("useAdminData must be used inside AdminDataProvider");
  }
  return context;
}
