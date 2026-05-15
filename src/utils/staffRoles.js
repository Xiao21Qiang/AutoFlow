export const STAFF_ROLE_OPTIONS = [
  "Admin",
  "General Manager",
  "Sales Manager",
  "Sales Associate",
  "Inventory Clerk",
  "Junior Detailer",
  "Senior Detailer",
  "Marketing",
];

export const DETAILER_ROLE_OPTIONS = [
  "Junior Detailer",
  "Senior Detailer",
];

const STAFF_ROLE_LABELS = new Map(
  STAFF_ROLE_OPTIONS.map((role) => [normalizeStaffRole(role), role])
);

const DETAILER_ROLE_KEYS = new Set(DETAILER_ROLE_OPTIONS.map(normalizeStaffRole));

export function normalizeStaffRole(role) {
  return String(role || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function isValidStaffRole(role) {
  return STAFF_ROLE_LABELS.has(normalizeStaffRole(role));
}

export function isDetailerRole(role) {
  return DETAILER_ROLE_KEYS.has(normalizeStaffRole(role));
}

export function getStaffRoleLabel(role) {
  const normalized = normalizeStaffRole(role);
  if (STAFF_ROLE_LABELS.has(normalized)) return STAFF_ROLE_LABELS.get(normalized);
  if (!normalized) return "";
  if (normalized === "co-owner" || normalized === "co owner") return "Co-Owner";
  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getDetailerStaffOptions(users = []) {
  const seen = new Set();

  return (Array.isArray(users) ? users : [])
    .filter((user) => String(user?.userType || "").trim().toLowerCase() === "staff")
    .filter((user) => isDetailerRole(user?.role))
    .map((user) => String(user?.name || `${String(user?.first || "").trim()} ${String(user?.last || "").trim()}`.trim() || user?.email || "").trim())
    .filter((name) => {
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
