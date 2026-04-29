import { apiRequest } from "../services/api";

export function getSpecialPinStatus(config = {}) {
  return config.adminSpecialPinConfigured === false ? "Not configured" : "Configured";
}

export function getSpecialPasswordStatus(config = {}) {
  return config.adminSpecialPasswordConfigured === false ? "Not configured" : "Configured";
}

export async function validateSpecialCredential(mode, value, scope = "admin", actor = {}) {
  await apiRequest("/api/admin/security/validate", {
    method: "POST",
    body: JSON.stringify({ mode, value, scope, actorUserType: actor.userType, actorRole: actor.role, actorEmail: actor.email }),
  });
  return true;
}

export async function validateSpecialPin(pin) {
  return validateSpecialCredential("pin", pin);
}

export async function validateSpecialPassword(password) {
  return validateSpecialCredential("password", password);
}

export async function verifyCurrentPassword(email, currentPassword) {
  await apiRequest("/api/admin/security/verify-password", {
    method: "POST",
    body: JSON.stringify({ email, currentPassword }),
  });
  return true;
}

export async function updateSecurityControls({ email, currentPassword, adminSpecialPin, adminSpecialPassword, staffSpecialPin, staffSpecialPassword }) {
  return apiRequest("/api/admin/security-controls", {
    method: "PUT",
    body: JSON.stringify({
      email,
      currentPassword,
      ...(adminSpecialPin !== undefined ? { adminSpecialPin } : {}),
      ...(adminSpecialPassword !== undefined ? { adminSpecialPassword } : {}),
      ...(staffSpecialPin !== undefined ? { staffSpecialPin } : {}),
      ...(staffSpecialPassword !== undefined ? { staffSpecialPassword } : {}),
    }),
  });
}

export async function getSecurityControlStatus() {
  return apiRequest("/api/admin/security-controls");
}

export function getCurrentUserDisplayName(user) {
  return String(user?.name || `${user?.first || ""} ${user?.last || ""}`.trim() || user?.email || "").trim();
}

export function requireFreshAdminAuth() {
  throw new Error("Sensitive action requires SecurityConfirmModal.");
}

export function requireSpecialPassword() {
  throw new Error("Sensitive action requires SecurityConfirmModal.");
}

export function requireAccountNameConfirmation() {
  throw new Error("Sensitive action requires SecurityConfirmModal.");
}
