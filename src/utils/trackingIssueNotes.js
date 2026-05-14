export function normalizeComparable(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function isAdminUser(user = {}) {
  const userType = normalizeComparable(user.userType);
  const role = normalizeComparable(user.role);
  return userType === "admin" || ["admin", "owner", "co-owner"].includes(role);
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
  const issueNote = String(source.issueNote || "").trim();
  const issueTypes = Array.isArray(source.issueTypes) ? source.issueTypes : [];
  const issueMarkers = Array.isArray(source.issueMarkers) ? source.issueMarkers : [];

  return Boolean(
    issueNote ||
      issueTypes.some((issueType) => String(issueType || "").trim()) ||
      issueMarkers.some((marker) => String(marker?.issueType || marker?.details || marker?.note || "").trim())
  );
}

export function isAssignedStaffForBooking(booking = {}, user = {}) {
  const bookingAssignedValues = [
    booking.assigned,
    booking.assignedTo,
    booking.assignedStaff,
    booking.assignedStaffName,
    booking.assignedStaffEmail,
    booking.assignedStaffId,
  ]
    .map(normalizeComparable)
    .filter(Boolean);

  const userValues = [
    user.id,
    user._id,
    user.name,
    user.email,
    `${String(user.first || "").trim()} ${String(user.last || "").trim()}`.trim(),
  ]
    .map(normalizeComparable)
    .filter(Boolean);

  if (!bookingAssignedValues.length || !userValues.length) return false;
  return bookingAssignedValues.some((assignedValue) => userValues.includes(assignedValue));
}

export function canEditIssueNotes({ booking = {}, currentUser = {}, allowAdmin = false } = {}) {
  if (!isScheduledStatus(booking.status)) return false;
  if (allowAdmin && isAdminUser(currentUser)) return true;
  return isAssignedStaffForBooking(booking, currentUser);
}

export function getIssueNotesLockedMessage({ booking = {}, currentUser = {}, allowAdmin = false } = {}) {
  if (!isScheduledStatus(booking.status)) {
    return "Issue notes can only be edited while the booking is Scheduled.";
  }
  if (!allowAdmin && !isAssignedStaffForBooking(booking, currentUser)) {
    return "Only the assigned staff can edit issue notes for this booking.";
  }
  if (allowAdmin && !isAdminUser(currentUser) && !isAssignedStaffForBooking(booking, currentUser)) {
    return "Only the assigned staff can edit issue notes for this booking.";
  }
  return "";
}

export function buildIssueNotePayload(source = {}, status = "") {
  const issueMarkers = normalizeIssueMarkers(source.issueMarkers);
  return {
    status,
    issueNote: String(source.issueNote || "").trim(),
    issueMarkers,
    issueTypes: getIssueTypesFromMarkers(issueMarkers),
  };
}
