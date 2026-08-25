import { ACTION_KEYS, canPerformAction, getEffectiveRole } from "./rbac";

export function normalizeComparable(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function isAdminUser(user = {}) {
  const safeUser = user || {};
  const userType = normalizeComparable(safeUser.userType);
  const role = normalizeComparable(safeUser.role);
  if (userType === "admin") return true;
  if (userType === "staff" || userType === "customer") return false;
  return ["admin", "owner", "co-owner"].includes(role);
}

export function isScheduledStatus(status) {
  return normalizeComparable(status) === "scheduled";
}

export function getIssueTypesFromMarkers(markers = []) {
  return (Array.isArray(markers) ? markers : [])
    .map((marker) => String(marker?.issueType || "").trim())
    .filter(Boolean);
}

export function normalizeIssueMarkers(markers = []) {
  const source = Array.isArray(markers) && markers.length ? markers : [{ id: 1, x: 50, y: 50, issueType: "" }];
  return source.map((marker, index) => ({
    id: marker?.id || index + 1,
    x: Number(marker?.x || 50),
    y: Number(marker?.y || 50),
    issueType: String(marker?.issueType || "").trim(),
  }));
}

export function hasMeaningfulIssueNotes(source = {}) {
  const safeSource = source || {};
  const issueNote = String(safeSource.issueNote || "").trim();
  const issueTypes = Array.isArray(safeSource.issueTypes) ? safeSource.issueTypes : [];
  const issueMarkers = Array.isArray(safeSource.issueMarkers) ? safeSource.issueMarkers : [];

  return Boolean(
    issueNote ||
      issueTypes.some((issueType) => String(issueType || "").trim()) ||
      issueMarkers.some((marker) => String(marker?.issueType || marker?.details || marker?.note || "").trim())
  );
}

function isActiveDetailerUser(user = {}) {
  const status = normalizeComparable(user?.status || (user?.deleted ? "deleted" : "active"));
  const role = normalizeComparable(user?.role);
  return !["inactive", "disabled", "deactivated", "deleted"].includes(status) && ["junior detailer", "senior detailer"].includes(role);
}

function getStableUserId(user = {}) {
  return String(user?.id || user?._id || "").trim();
}

function getDetailerIdentityValues(user = {}) {
  return [user?.id, user?._id, user?.email, user?.name]
    .map(normalizeComparable)
    .filter(Boolean);
}

export function isAssignedStaffForBooking(booking = {}, user = {}, users = []) {
  const safeBooking = booking || {};
  const safeUser = user || {};
  const assignedId = String(
    safeBooking.assignedDetailerId || safeBooking.assignedUserId || safeBooking.assignedStaffId || ""
  ).trim();
  const userId = getStableUserId(safeUser);
  if (assignedId) return Boolean(userId && assignedId === userId);

  const bookingAssignedValues = [
    safeBooking.assigned,
    safeBooking.assignedTo,
    safeBooking.assignedStaff,
    safeBooking.assignedStaffName,
    safeBooking.assignedStaffEmail,
  ]
    .map(normalizeComparable)
    .filter(Boolean);

  if (Array.isArray(users) && users.length && bookingAssignedValues.length) {
    const matches = users.filter((candidate) => {
      if (!isActiveDetailerUser(candidate)) return false;
      const identityValues = getDetailerIdentityValues(candidate);
      return bookingAssignedValues.some((assignedValue) => identityValues.includes(assignedValue));
    });
    return matches.length === 1 && getStableUserId(matches[0]) === userId;
  }

  const userValues = [
    safeUser.id,
    safeUser._id,
    safeUser.name,
    safeUser.email,
    `${String(safeUser.first || "").trim()} ${String(safeUser.last || "").trim()}`.trim(),
  ]
    .map(normalizeComparable)
    .filter(Boolean);

  if (!bookingAssignedValues.length || !userValues.length) return false;
  return bookingAssignedValues.some((assignedValue) => userValues.includes(assignedValue));
}

export function canManageTrackingAction(user = {}, actionKey = "") {
  const effectiveRole = getEffectiveRole(user);
  return (
    isAdminUser(user) ||
    (effectiveRole === "general manager" && canPerformAction(user, actionKey))
  );
}

export function canEditIssueNotes({ booking = {}, currentUser = {}, allowAdmin = false, users = [] } = {}) {
  const safeBooking = booking || {};
  if (!isScheduledStatus(safeBooking.status)) return false;
  if (allowAdmin && canManageTrackingAction(currentUser, ACTION_KEYS.trackingUpdateIssueNotes)) return true;
  return isAssignedStaffForBooking(safeBooking, currentUser, users);
}

export function getIssueNotesLockedMessage({ booking = {}, currentUser = {}, allowAdmin = false, users = [] } = {}) {
  const safeBooking = booking || {};
  if (!isScheduledStatus(safeBooking.status)) {
    return "Issue notes can only be edited while the booking is Scheduled.";
  }
  if (!allowAdmin && !isAssignedStaffForBooking(safeBooking, currentUser, users)) {
    return "Only the assigned staff can edit issue notes for this booking.";
  }
  if (allowAdmin && !canManageTrackingAction(currentUser, ACTION_KEYS.trackingUpdateIssueNotes) && !isAssignedStaffForBooking(safeBooking, currentUser, users)) {
    return "Only the assigned staff can edit issue notes for this booking.";
  }
  return "";
}

export function buildIssueNotePayload(source = {}, status = "") {
  const safeSource = source || {};
  const issueMarkers = normalizeIssueMarkers(safeSource.issueMarkers);
  return {
    status,
    issueNote: String(safeSource.issueNote || "").trim(),
    issueMarkers,
    issueTypes: getIssueTypesFromMarkers(issueMarkers),
  };
}
