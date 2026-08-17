import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../services/api";
import { writeAuthSession } from "../utils/auth";
import { isValidStaffRole, normalizeStaffRole } from "../utils/staffRoles";

const AdminDataContext = createContext(null);
const PASSIVE_BOOTSTRAP_REFRESH_REASONS = new Set(["poll", "focus", "visibility"]);
const FRESH_AFTER_CURRENT_REASONS = new Set(["mutation"]);
const PASSIVE_REFRESH_MIN_AGE_MS = 30000;

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
  settings: {
    requiredDownPaymentAmount: 0,
  },
  financialReport: {
    totals: {},
    payments: [],
    expenses: [],
    commissions: [],
  },
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
  if (log?.meta?.message) return String(log.meta.message);
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
  "Down payment reminder",
  "1 hour left to submit down payment",
  "Down payment proof submitted",
  "Service is booked",
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
  "Booking cancelled",
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

function getStoredBootstrapToken() {
  if (typeof window === "undefined" || !window.localStorage) return "";
  return localStorage.getItem("token") || "";
}

function buildBootstrapSessionKey(session) {
  return [
    getStoredBootstrapToken(),
    String(session?.id || "").trim(),
    String(session?.email || "").trim().toLowerCase(),
    normalizeUserType(session?.userType, session?.role),
    String(session?.role || "").trim().toLowerCase(),
  ].join("|");
}

function isBootstrapRefreshLoggingEnabled() {
  if (String(process.env.REACT_APP_BOOTSTRAP_PERF_LOGS || "").trim().toLowerCase() === "true") return true;
  return typeof window !== "undefined" && window.localStorage?.getItem("BOOTSTRAP_PERF_LOGS") === "true";
}

function logBootstrapRefresh(reason, action) {
  if (!isBootstrapRefreshLoggingEnabled()) return;
  console.info(`[bootstrap-refresh] reason=${reason} action=${action}`);
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
  const inFlightBootstrapRef = useRef(null);
  const latestBootstrapRequestIdRef = useRef(0);
  const lastSuccessfulBootstrapAtRef = useRef(0);

  const auditUser = session?.email || session?.name || "admin@allprotec.com";
  const currentRole = normalizeUserType(session?.userType, session?.role);
  const bootstrapSessionKey = buildBootstrapSessionKey(session);
  const notificationStorageKey = useMemo(
    () => `autoflow:last-read-notification:${String(session?.email || currentRole || "guest").toLowerCase()}`,
    [session?.email, currentRole]
  );

  useEffect(() => {
    setLastReadNotificationId(localStorage.getItem(notificationStorageKey) || "");
  }, [notificationStorageKey]);

  const currentUserFallback = useMemo(
    () => ({
      id: session?.id || "LOCAL-ADMIN",
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

  const startBootstrapRequest = useCallback(({ silent = false, reason = "manual" } = {}) => {
    const requestId = latestBootstrapRequestIdRef.current + 1;
    latestBootstrapRequestIdRef.current = requestId;
    logBootstrapRefresh(reason, "start");
    const activeRequest = {
      requestId,
      sessionKey: bootstrapSessionKey,
      showLoading: !silent,
      promise: null,
      followUpPromise: null,
    };

    if (!silent) {
      setLoading(true);
    }

    const promise = apiRequest("/api/admin/bootstrap")
      .then((payload) => {
        if (
          latestBootstrapRequestIdRef.current === requestId &&
          inFlightBootstrapRef.current?.sessionKey === bootstrapSessionKey
        ) {
          lastSuccessfulBootstrapAtRef.current = Date.now();
          setData({ ...INITIAL_DATA, ...payload });
          setError("");
        }
        return payload;
      })
      .catch((err) => {
        if (
          latestBootstrapRequestIdRef.current === requestId &&
          inFlightBootstrapRef.current?.sessionKey === bootstrapSessionKey
        ) {
          setError(err.message || "Failed to load admin data.");
        }
        return null;
      })
      .finally(() => {
        if (
          inFlightBootstrapRef.current?.requestId === requestId &&
          inFlightBootstrapRef.current?.sessionKey === bootstrapSessionKey
        ) {
          if (inFlightBootstrapRef.current.showLoading) {
            setLoading(false);
          }
          inFlightBootstrapRef.current = null;
        }
      });

    activeRequest.promise = promise;
    inFlightBootstrapRef.current = activeRequest;
    return promise;
  }, [bootstrapSessionKey]);

  const loadAdminData = useCallback(({ silent = false, ensureFresh, reason = "manual" } = {}) => {
    const passiveRefresh = PASSIVE_BOOTSTRAP_REFRESH_REASONS.has(reason);
    const requireFreshAfterCurrent = ensureFresh ?? FRESH_AFTER_CURRENT_REASONS.has(reason);
    const activeRequest = inFlightBootstrapRef.current;
    if (activeRequest?.sessionKey === bootstrapSessionKey) {
      if (!silent) {
        activeRequest.showLoading = true;
        setLoading(true);
      }

      if (!requireFreshAfterCurrent) {
        logBootstrapRefresh(reason, passiveRefresh ? "reuse-in-flight" : "reuse-in-flight");
        return activeRequest.promise;
      }

      if (!activeRequest.followUpPromise) {
        logBootstrapRefresh(reason, "queue-one-follow-up");
        activeRequest.followUpPromise = activeRequest.promise.then(() => {
          if (inFlightBootstrapRef.current || bootstrapSessionKey !== buildBootstrapSessionKey(session)) {
            return inFlightBootstrapRef.current?.promise || null;
          }
          return startBootstrapRequest({ silent, reason });
        });
      } else {
        logBootstrapRefresh(reason, "reuse-follow-up");
      }

      return activeRequest.followUpPromise;
    }

    if (passiveRefresh && Date.now() - lastSuccessfulBootstrapAtRef.current < PASSIVE_REFRESH_MIN_AGE_MS) {
      logBootstrapRefresh(reason, "skip-recent");
      return Promise.resolve(null);
    }

    return startBootstrapRequest({ silent, reason });
  }, [bootstrapSessionKey, session, startBootstrapRequest]);

  useEffect(() => {
    inFlightBootstrapRef.current = null;
    latestBootstrapRequestIdRef.current += 1;
    lastSuccessfulBootstrapAtRef.current = 0;
    notificationsBootstrappedRef.current = false;
    previousNotificationIdsRef.current = [];
    setData(INITIAL_DATA);
    setError("");
    loadAdminData({ reason: "initial" });

    const refreshFromDatabase = (reason) => {
      loadAdminData({ silent: true, reason });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshFromDatabase("visibility");
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        refreshFromDatabase("poll");
      }
    }, 15000);

    const handleFocus = () => refreshFromDatabase("focus");

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [bootstrapSessionKey, loadAdminData]);

  const mutate = async (path, options = {}, syncOptions = {}) => {
    const result = await apiRequest(path, options);
    if (typeof syncOptions.applyResult === "function") {
      setData((currentData) => syncOptions.applyResult(currentData, result));
    }
    if (syncOptions.refresh !== false) {
      await loadAdminData({ reason: "mutation", ensureFresh: true });
    }
    return result;
  };

  const withServices = (updater) => (currentData, result) => ({
    ...currentData,
    services: updater(Array.isArray(currentData.services) ? currentData.services : [], result),
  });

  const withRewards = (updater) => (currentData, result) => ({
    ...currentData,
    rewards: updater(Array.isArray(currentData.rewards) ? currentData.rewards : [], result),
  });

  const matchesRecordId = (item, id) => {
    const targetId = String(id || "").trim();
    return Boolean(targetId && [item?.id, item?._id].some((value) => String(value || "").trim() === targetId));
  };

  const withUsers = (updater) => (currentData, result) => ({
    ...currentData,
    users: updater(Array.isArray(currentData.users) ? currentData.users : [], result),
  });

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

  const loadPaymentProof = useCallback((paymentId, stage = "downPayment") =>
    apiRequest(`/api/admin/payments/${encodeURIComponent(paymentId || "")}/proof?stage=${encodeURIComponent(stage || "downPayment")}`), []);

  const updateProfile = async (payload) => {
    const profileUserId = currentUser.id || session?.id;
    if (!profileUserId) {
      throw new Error("Could not identify the current profile.");
    }
    const profilePayload = {
      first: payload.first,
      last: payload.last,
      email: payload.email,
      phone: payload.phone,
      auditUser,
    };

    const result = await mutate("/api/admin/users/" + profileUserId + "?refreshSession=1", {
      method: "PUT",
      body: JSON.stringify(profilePayload),
    });
    const updatedUser = result?.user || result || {};
    if (result?.token && result?.user) {
      writeAuthSession(result.token, result.user);
    }

    const nextUser = {
      ...JSON.parse(localStorage.getItem("user") || "{}"),
      name: updatedUser.name || payload.name || (String(updatedUser.first || payload.first || "") + " " + String(updatedUser.last || payload.last || "")).trim() || currentUser.name,
      email: updatedUser.email || payload.email || currentUser.email,
      first: updatedUser.first || payload.first || currentUser.first,
      last: updatedUser.last || payload.last || currentUser.last,
      phone: updatedUser.phone || payload.phone || currentUser.phone,
      userType: updatedUser.userType || currentUser.userType || session?.userType || normalizeUserType(currentUser.userType, currentUser.role),
      role: updatedUser.role || currentUser.role || session?.role || "New",
      cars: Array.isArray(updatedUser.cars) ? updatedUser.cars : Array.isArray(payload.cars) ? payload.cars : Array.isArray(currentUser.cars) ? currentUser.cars : [],
    };
    if (!result?.token) {
      localStorage.setItem("user", JSON.stringify(nextUser));
    }
    return nextUser;
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
    reload: (options = {}) => loadAdminData({ ...options, reason: options.reason || "manual" }),
    loadPaymentProof,
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
    rescheduleBooking: (id, payload) => mutate("/api/admin/bookings/" + id + "/reschedule", { method: "PATCH", body: JSON.stringify({ ...payload, auditUser }) }),
    reassignDetailer: (id, payload) => mutate("/api/admin/bookings/" + id + "/reassign-detailer", { method: "PATCH", body: JSON.stringify({ ...payload, auditUser }) }),
    deleteBooking: (id, payload = {}) =>
      mutate("/api/admin/bookings/" + id, {
        method: "DELETE",
        body: JSON.stringify({ ...payload, auditUser }),
      }),
    createService: (payload) =>
      mutate(
        "/api/admin/services",
        { method: "POST", body: JSON.stringify({ ...payload, auditUser }) },
        {
          refresh: false,
          applyResult: withServices((services, service) => [service, ...services]),
        }
      ),
    updateService: (id, payload) =>
      mutate(
        "/api/admin/services/" + id,
        { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) },
        {
          refresh: false,
          applyResult: withServices((services, result) => services.map((service) => service.id === id ? result : service)),
        }
      ),
    toggleService: (service) =>
      mutate(
        "/api/admin/services/" + service.id,
        { method: "PUT", body: JSON.stringify({ enabled: !service.enabled, auditUser }) },
        {
          refresh: false,
          applyResult: withServices((services, result) => services.map((item) => item.id === service.id ? result : item)),
        }
      ),
    deleteService: (id) =>
      mutate("/api/admin/services/" + id, {
        method: "DELETE",
        body: JSON.stringify({ auditUser }),
      }, {
        refresh: false,
        applyResult: withServices((services) => services.filter((service) => service.id !== id)),
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
    submitPaymentProof: (payment, payload) =>
      mutate("/api/admin/payments/" + payment.id, {
        method: "PUT",
        body: JSON.stringify({
          ...payload,
          status: "For Verification",
          auditUser,
        }),
      }),
    updateUser: (id, payload) => mutate("/api/admin/users/" + id, { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) }, {
      refresh: false,
      applyResult: withUsers((users, result) => users.map((user) => matchesRecordId(user, id) || matchesRecordId(user, result?.id) || matchesRecordId(user, result?._id) ? result : user)),
    }),
    createEmployeeAccount: (payload) => mutate("/api/admin/users/staff", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    updateRequiredDownPaymentAmount: (requiredDownPaymentAmount, adminSpecialPassword) =>
      mutate("/api/admin/settings/down-payment", {
        method: "PATCH",
        body: JSON.stringify({ requiredDownPaymentAmount, adminSpecialPassword, auditUser }),
      }, {
        applyResult: (currentData, result) => ({
          ...currentData,
          settings: {
            ...(currentData.settings || {}),
            requiredDownPaymentAmount: Number(result?.requiredDownPaymentAmount ?? currentData.settings?.requiredDownPaymentAmount ?? 0) || 0,
          },
        }),
      }),
    toggleUserStatus: (user) => mutate("/api/admin/users/" + user.id, { method: "PUT", body: JSON.stringify({ ...user, status: user.status === "active" ? "inactive" : "active", auditUser }) }),
    deleteUser: (id, payload = {}) =>
      mutate("/api/admin/users/" + id + "?auditUser=" + encodeURIComponent(auditUser), {
        method: "DELETE",
        body: JSON.stringify({ ...payload, auditUser }),
      }, {
        refresh: false,
        applyResult: withUsers((users, result) => users.map((user) => matchesRecordId(user, id) || matchesRecordId(user, result?.id) || matchesRecordId(user, result?._id) ? { ...user, ...result } : user)),
      }),
    getActiveAuditLogIds: () =>
      apiRequest("/api/admin/audit-logs/active-ids"),
    getArchivedAuditLogIds: () =>
      apiRequest("/api/admin/audit-logs/archived-ids"),
    archiveAuditLogs: (ids) =>
      mutate("/api/admin/audit-logs/archive", {
        method: "POST",
        body: JSON.stringify({ auditUser, ids }),
      }),
    unarchiveAuditLogs: (ids) =>
      mutate("/api/admin/audit-logs/unarchive", {
        method: "POST",
        body: JSON.stringify({ auditUser, ids }),
      }),
    createReview: (payload) => mutate("/api/admin/reviews", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    updateReview: (id, payload) => mutate("/api/admin/reviews/" + id, { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) }),
    createPromo: (payload) => mutate("/api/admin/promos", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    updatePromo: (id, payload) => mutate("/api/admin/promos/" + id, { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) }),
    updateQuoteRequest: (id, payload) => mutate("/api/admin/quote-requests/" + id, { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) }),
    usePromo: (promoId) =>
      mutate("/api/admin/promos/" + promoId + "/use", {
        method: "POST",
        body: JSON.stringify({ auditUser }),
      }),
    createExpense: (payload) => mutate("/api/admin/expenses", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    updateExpense: (id, payload) => mutate("/api/admin/expenses/" + id, { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) }),
    archiveExpense: (id) => mutate("/api/admin/expenses/" + id + "/archive", { method: "PATCH", body: JSON.stringify({ auditUser }) }),
    restoreExpense: (id) => mutate("/api/admin/expenses/" + id + "/restore", { method: "PATCH", body: JSON.stringify({ auditUser }) }),
    deleteExpense: (id) => mutate("/api/admin/expenses/" + id, { method: "DELETE", body: JSON.stringify({ confirm: "delete", auditUser }) }),
    createCommission: (payload) => mutate("/api/admin/commissions", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    updateCommission: (id, payload) => mutate("/api/admin/commissions/" + id, { method: "PATCH", body: JSON.stringify({ ...payload, auditUser }) }),
    createReward: (payload) => mutate("/api/admin/rewards", { method: "POST", body: JSON.stringify({ ...payload, auditUser }) }),
    updateReward: (id, payload) => mutate("/api/admin/rewards/" + id, { method: "PUT", body: JSON.stringify({ ...payload, auditUser }) }),
    updateRewardStatus: (id, enabled) =>
      mutate(
        "/api/admin/rewards/" + id + "/status",
        { method: "PATCH", body: JSON.stringify({ enabled, auditUser }) },
        {
          refresh: false,
          applyResult: withRewards((rewards, result) => rewards.map((reward) => matchesRecordId(reward, id) || matchesRecordId(reward, result?.id) || matchesRecordId(reward, result?._id) ? result : reward)),
        }
      ),
    deleteReward: (id) => mutate("/api/admin/rewards/" + id, { method: "DELETE", body: JSON.stringify({ auditUser }) }),
    claimReward: (id) => mutate("/api/admin/rewards/" + id + "/claim", { method: "POST", body: JSON.stringify({ auditUser }) }),
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
