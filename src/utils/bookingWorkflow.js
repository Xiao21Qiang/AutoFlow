import { isDownPaymentSatisfied } from "./paymentStages";
import { isDetailerRole, normalizeStaffRole } from "./staffRoles";

export const PLACE_SLOT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];
export const SHOP_OPEN_TIME = "08:00";
export const SHOP_CLOSE_TIME = "17:00";

export function normalizeRole(value) {
  return normalizeStaffRole(value);
}

export function getPreferredDetailerOptions(users = []) {
  const seen = new Set();

  return (Array.isArray(users) ? users : [])
    .filter((user) => String(user?.userType || "").trim().toLowerCase() === "staff")
    .filter((user) => isDetailerRole(user?.role))
    .map((user) => {
      const name = String(
        user?.name || `${String(user?.first || "").trim()} ${String(user?.last || "").trim()}`.trim() || user?.email || ""
      ).trim();
      const id = String(user?.id || user?._id || user?.email || name).trim();
      return {
        id,
        name,
        label: name,
        role: String(user?.role || "").trim(),
      };
    })
    .filter((option) => {
      const key = `${option.id || ""}:${option.name || ""}`.toLowerCase();
      if (!option.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function validatePreferredDetailerName(value) {
  const trimmed = String(value || "").trim().replace(/\s+/g, " ");
  if (!trimmed) return { value: "", error: "" };
  if (trimmed.length > 60) {
    return { value: trimmed.slice(0, 60), error: "Preferred detailer name must be 60 characters or less." };
  }
  if (!/^[\p{L}\s.'-]+$/u.test(trimmed)) {
    return { value: trimmed, error: "Preferred detailer can only contain letters, spaces, hyphens, apostrophes, and periods." };
  }
  return { value: trimmed, error: "" };
}

export function buildPreferredDetailerPayload(selection = {}, options = []) {
  const selectedId = String(selection.preferredDetailerId || "").trim();
  const typedName = String(selection.preferredDetailerName || selection.preferredDetailer || "").trim();
  const matchedOption = options.find((option) => String(option.id || "") === selectedId);

  if (matchedOption) {
    return {
      preferredDetailer: matchedOption.name,
      preferredDetailerName: matchedOption.name,
      preferredDetailerId: matchedOption.id,
    };
  }

  const validated = validatePreferredDetailerName(typedName);
  if (validated.error || !validated.value) {
    return {
      preferredDetailer: "",
      preferredDetailerName: "",
      preferredDetailerId: "",
    };
  }

  return {
    preferredDetailer: validated.value,
    preferredDetailerName: validated.value,
    preferredDetailerId: "",
  };
}

export function getPreferredDetailerDisplay(booking = {}) {
  const value = String(
    booking.preferredDetailerName || booking.preferredDetailer || booking.preferredDetailerId || ""
  ).trim();
  return value || "None";
}

export function isDownPaymentExemptService(service) {
  return String(service || "").trim().toLowerCase().replace(/\s+/g, " ") === "car wash";
}

export function getLinkedPaymentForBooking(booking = {}, payments = []) {
  const candidates = new Set(
    [
      booking?.id,
      booking?._id,
      booking?.bookingId,
      booking?.paymentId,
      booking?.payment?.id,
      booking?.payment?.bookingId,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );

  if (!candidates.size) return null;

  return (
    (Array.isArray(payments) ? payments : []).find((payment) => {
      const paymentCandidates = [
        payment?.bookingId,
        payment?.reference,
        payment?.id,
        payment?._id,
      ].map((value) => String(value || "").trim());
      return paymentCandidates.some((value) => candidates.has(value));
    }) || null
  );
}

export function isBookingDownPaymentSatisfied(booking = {}, payment = null) {
  if (isDownPaymentExemptService(booking.service)) return true;
  return Boolean(payment && isDownPaymentSatisfied(payment));
}

export function isPendingSchedulingStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "pending" || normalized === "pending confirmation" || normalized === "pending assignment";
}

export function isScheduledStatus(status) {
  return String(status || "").trim().toLowerCase() === "scheduled";
}

export function isValidScheduleDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

export function isValidHHMM(value) {
  const time = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [hours, minutes] = time.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function timeToMinutes(value) {
  if (!isValidHHMM(value)) return null;
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

export function isValidShopTime(value) {
  const minutes = timeToMinutes(value);
  const open = timeToMinutes(SHOP_OPEN_TIME);
  const close = timeToMinutes(SHOP_CLOSE_TIME);
  return minutes !== null && minutes >= open && minutes <= close;
}

function formatTimeLabel(value) {
  const [hours, minutes] = String(value).split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${value} / ${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function buildShopTimeOptions(intervalMinutes = 30) {
  const options = [];
  const open = timeToMinutes(SHOP_OPEN_TIME);
  const close = timeToMinutes(SHOP_CLOSE_TIME);
  const interval = Math.max(1, Number(intervalMinutes) || 30);

  for (let minutes = open; minutes <= close; minutes += interval) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const value = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    options.push({ value, label: formatTimeLabel(value) });
  }

  return options;
}

export const SHOP_TIME_OPTIONS = buildShopTimeOptions(30);

export function canScheduleBooking(booking = {}, payment = null) {
  return (
    isBookingDownPaymentSatisfied(booking, payment) &&
    Boolean(String(booking.assigned || "").trim()) &&
    isValidScheduleDate(booking.date) &&
    isValidShopTime(booking.time) &&
    PLACE_SLOT_OPTIONS.includes(Number(booking.placeSlot || 0))
  );
}

export function getSchedulingValidationMessage(booking = {}, payment = null) {
  if (!isBookingDownPaymentSatisfied(booking, payment)) {
    return "Down payment must be verified as paid before this booking can be scheduled.";
  }
  if (!String(booking.assigned || "").trim()) {
    return "Assigned staff is required before scheduling this booking.";
  }
  if (!isValidScheduleDate(booking.date)) {
    return "A valid date is required before scheduling.";
  }
  if (!isValidShopTime(booking.time)) {
    return "A valid time is required before scheduling.";
  }
  if (!PLACE_SLOT_OPTIONS.includes(Number(booking.placeSlot || 0))) {
    return "A place slot is required before scheduling.";
  }
  return "";
}
