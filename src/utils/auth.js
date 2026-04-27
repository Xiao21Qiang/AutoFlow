const AUTH_LOGIN_AT_KEY = "authLoginAt";
const AUTH_LAST_ACTIVITY_KEY = "authLastActivity";
const AUTH_MESSAGE_KEY = "authMessage";

const ADMIN_STAFF_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const CLIENT_IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

const AUTH_STORAGE_KEYS = [
  "token",
  "user",
  "session",
  "currentUser",
  AUTH_LOGIN_AT_KEY,
  AUTH_LAST_ACTIVITY_KEY,
];

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function getUserType(user) {
  const normalizedUserType = String(user?.userType || "").trim().toLowerCase();
  if (["admin", "staff"].includes(normalizedUserType)) return normalizedUserType;
  if (["customer", "client"].includes(normalizedUserType)) return "customer";

  const normalizedRole = String(user?.role || "").trim().toLowerCase();
  if (["owner", "co-owner", "admin"].includes(normalizedRole)) return "admin";
  if (["mechanic", "inspector", "coordinator", "staff"].includes(normalizedRole)) return "staff";
  return "customer";
}

export function readStoredUser() {
  if (!canUseStorage()) return {};

  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch (_error) {
    localStorage.removeItem("user");
    return {};
  }
}

export function getDashboardRoute(user) {
  const userType = typeof user === "string" ? user.toLowerCase() : getUserType(user);
  if (userType === "admin") return "/admin";
  if (userType === "staff") return "/staff";
  return "/client";
}

export function writeAuthSession(token, user) {
  if (!canUseStorage()) return;

  const now = String(Date.now());
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem(AUTH_LOGIN_AT_KEY, now);
  localStorage.setItem(AUTH_LAST_ACTIVITY_KEY, now);
  localStorage.removeItem(AUTH_MESSAGE_KEY);
}

export function getStoredAuth() {
  if (!canUseStorage()) return null;

  const token = localStorage.getItem("token");
  const user = readStoredUser();
  if (!token || !user?.email) return null;

  const now = String(Date.now());
  if (!localStorage.getItem(AUTH_LOGIN_AT_KEY)) localStorage.setItem(AUTH_LOGIN_AT_KEY, now);
  if (!localStorage.getItem(AUTH_LAST_ACTIVITY_KEY)) localStorage.setItem(AUTH_LAST_ACTIVITY_KEY, now);

  return { token, user };
}

export function getSessionTimeoutMs(user) {
  const userType = getUserType(user);
  if (userType === "admin" || userType === "staff") return ADMIN_STAFF_IDLE_TIMEOUT_MS;
  return CLIENT_IDLE_TIMEOUT_MS;
}

export function touchAuthActivity() {
  if (!canUseStorage() || !localStorage.getItem("token")) return;
  localStorage.setItem(AUTH_LAST_ACTIVITY_KEY, String(Date.now()));
}

export function isAuthExpired(auth = getStoredAuth()) {
  if (!canUseStorage() || !auth) return false;

  const lastActivity = Number(localStorage.getItem(AUTH_LAST_ACTIVITY_KEY) || Date.now());
  return Date.now() - lastActivity > getSessionTimeoutMs(auth.user);
}

export function clearAuthStorage({ message = "" } = {}) {
  if (!canUseStorage()) return;

  AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  if (message) {
    localStorage.setItem(AUTH_MESSAGE_KEY, message);
  } else {
    localStorage.removeItem(AUTH_MESSAGE_KEY);
  }
}

export function consumeAuthMessage() {
  if (!canUseStorage()) return "";

  const message = localStorage.getItem(AUTH_MESSAGE_KEY) || "";
  localStorage.removeItem(AUTH_MESSAGE_KEY);
  return message;
}
